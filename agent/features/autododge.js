import { sendCommand } from "../core/commands.js";
import { getFunctions } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import {
    collisionRadius,
    dataOf,
    enableProjectileTracking,
    onDataReload,
    scanData
} from "../core/scan.js";
import {
    BLOCKS_MOVEMENT,
    BLOCKS_PROJECTILES,
    firstWallHit,
    isBlockedWide,
    pathBlocked,
    tileSizeUnits,
    wallsVersion
} from "../utils/walls.js";

// ===== agent-side state & command path =====

const MOVE_INPUT_TYPE = 2;

let _hitbox = 0;
let _radiusMemoData = null;
let _radiusMemoValue = 0;
let _last = { active: false };
let _stopSent = false;

// Test/diagnostic seams: swap the native command path and the wall api.
// Production code never sets them.
let _transport = null;
let _wallsApi = {
    firstWallHit,
    isBlockedWide,
    pathBlocked,
    tileSizeUnits,
    wallsVersion,
    BLOCKS_MOVEMENT,
    BLOCKS_PROJECTILES
};
export function __setDodgeTransport(t) {
    _transport = t;
}
export function __setDodgeWalls(api) {
    if (api) _wallsApi = api;
}
export function __dodgeProbe() {
    return {
        active: !!_last.active,
        targetX: _last.targetX,
        targetY: _last.targetY,
        headingDeg: _last.headingDeg,
        started: !!_last.started,
        stopped: !!_last.stopped
    };
}

function characterCollisionRadius(data) {
    if (!data || data.isNull()) return 0;
    if (_radiusMemoData !== null && data.equals(_radiusMemoData) && _radiusMemoValue > 0) {
        return _radiusMemoValue;
    }
    const value = collisionRadius(data) | 0;
    if (value > 0) {
        _radiusMemoData = data;
        _radiusMemoValue = value;
    }
    return value;
}

function learnOwnHitbox() {
    try {
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return false;
        const fns = getFunctions();
        if (!fns.LogicGameObjectClient_getData) return false;
        const radius = characterCollisionRadius(dataOf(own)) | 0;
        if (!(radius > 0)) return false;
        _hitbox = radius;
        return true;
    } catch (_) {
        return false;
    }
}

// Every dodge movement goes through this single path: prediction move plus
// one signed input command. No second sender exists, so the server sees one
// consistent stream (this is what used to cause rubber-banding).
function issueMove(x, y) {
    if (_transport) {
        _transport.predict(x, y);
        _transport.input(x, y);
        return true;
    }
    try {
        const logic = scanData.battleModeClient;
        if (!logic || logic.isNull()) return false;
        const fns = getFunctions();
        if (!fns.LogicBattleModeClient_setClientPredictionMoveTo) return false;
        fns.LogicBattleModeClient_setClientPredictionMoveTo(logic, x, y, 1);
        return sendCommand(MOVE_INPUT_TYPE, (ci) => {
            ci.add(offsets.ClientInput_x).writeS32(x);
            ci.add(offsets.ClientInput_y).writeS32(y);
        });
    } catch (_) {
        return false;
    }
}

// The explicit half of "one start, one stop": a single move-to-self input so
// the last dodge vector dies with the dodge instead of lingering server-side.
function issueStop() {
    if (_transport) {
        _transport.stop(scanData.myX, scanData.myY);
        return true;
    }
    try {
        const logic = scanData.battleModeClient;
        if (!logic || logic.isNull()) return false;
        return sendCommand(MOVE_INPUT_TYPE, (ci) => {
            ci.add(offsets.ClientInput_x).writeS32(scanData.myX);
            ci.add(offsets.ClientInput_y).writeS32(scanData.myY);
        });
    } catch (_) {
        return false;
    }
}

export function updateAutododge() {
    if (scanData.lastUpdate === 0) return;
    const now = Date.now();
    if (!learnOwnHitbox()) {
        const fb = scanData.myRadius | 0;
        if (fb > 0) _hitbox = fb;
    }
    const d = coreTick({
        now,
        x: scanData.myX,
        y: scanData.myY,
        speed: scanData.mySpeed | 0,
        radius: _hitbox | 0,
        projectiles: scanData.projectiles,
        walls: _wallsApi,
        stamp: scanData.lastUpdate
    });
    _last = d;
    if (d.active) {
        _stopSent = false;
        if (d.send && isFinite(d.targetX) && isFinite(d.targetY)) issueMove(d.targetX, d.targetY);
        return;
    }
    if (d.stopped && !_stopSent) {
        _stopSent = true;
        issueStop();
    }
}

function _invalidateOwnMetrics() {
    _hitbox = 0;
    _radiusMemoData = null;
    _radiusMemoValue = 0;
}

export function resetAutododge() {
    coreReset();
    _invalidateOwnMetrics();
    _last = { active: false };
    _stopSent = false;
}

export function setupAutododge() {
    try {
        enableProjectileTracking();
        onDataReload(_invalidateOwnMetrics);
    } catch (_) {}
}

// ===== dodge decision core (pure, no Frida APIs) =====
// Every native dependency is injected through the `world` object so the same
// code path runs deterministically regardless of input source.
//
// What it does, in order:
//   1. classify every projectile the scanner reports into one of four threat
//      classes, using only public projectile fields (no brawler names);
//   2. compute how much preparation time an escape needs and start the dodge
//      strictly BEFORE the first projectile can cross our hitbox;
//   3. keep exactly one dodge command alive at a time: a single locked
//      heading, a single target, refreshes on a fixed cadence, and one
//      explicit stop — no per-tick re-targeting, no jitter.
//
// Threat classes:
//   linear — a flying bullet on a course (Colt/Nani/Pam style):
//            sidestep off the fire line.
//   cone   — one wide volley covering an arc (Poco/Emz style):
//            leaving the wedge beats threading between bullets.
//   zone   — lobbed/sprayed area damage that is dangerous at its landing
//            spot (Barley puddle, cloud spray): be out of the circle before
//            it lands and stay out while it lingers.
//   sticky — delayed/attached bomb (Squeak style): leave the blast radius
//            before the fuse ends.
// Unknown mechanics degrade to zone/linear handling — never to a random
// direction.

const TUNE = {
    DIR_COUNT: 36, // candidate escape headings (10 degree steps)
    HORIZON_S: 1.2, // joint flight simulation depth
    SIM_STEPS: 8, // simulation samples along the escape path
    SEP_CAP: 420, // separation beyond this adds no more score
    SKIN: 60, // extra clearance kept around our hitbox
    REACH: 1000, // dodge run length per command
    MIN_ROOM: 240, // minimum free room along a heading
    LATENCY_MS: 90, // input + reaction reserve
    PREP_SAFETY: 1.35, // escape-time safety factor
    MIN_DODGE_MS: 260, // a dodge never stops earlier than this
    RELEASE_GRACE_MS: 170, // calm time before the explicit stop
    REVALIDATE_MS: 120, // holding-heading sanity check rate
    REPICK_MARGIN: 260, // score gain needed to abandon the locked heading
    RESEND_MS: 170, // refresh cadence while holding the same target
    TARGET_EPS: 36, // resend when the target moved this much
    REFREEZE_DIST: 300, // extend the run when this close to the anchor
    AWARE: 3600, // ignore projectiles farther than this
    CONE_MIN_SPREAD: 60, // volley spread (deg) treated as a wide fan
    CONE_CONTROL_SPREAD: 10, // volleys with control effects count as fans from
    ZONE_MIN_R: 110, // assumed blast radius when data is missing
    ZONE_SCALE: 1.15, // blast radius safety factor
    ZONE_LINGER_MS: 3500, // a landed area stays in memory this long
    STICKY_MEM_MS: 500, // sticky blast remembered after the object vanishes
    STICKY_FUSE_MIN_S: 0.4, // assumed fuse when trigger time is unknown
    STUN_MARGIN: 70, // extra clearance for control-effect bullets
    WALL_PENALTY: 1500, // score penalty for hugging walls
    ROOM_CANDIDATES: 6, // headings that get the (native) wall check
    MOMENTUM: 110 // hold-stability term for re-picks only
};

const DEG2RAD = Math.PI / 180;
const RING = [];

const wrap360 = (a) => {
    const r = a % 360;
    return r < 0 ? r + 360 : r;
};
const angDiff = (a, b) => {
    const d = Math.abs(wrap360(a) - wrap360(b));
    return d > 180 ? 360 - d : d;
};
const bearingDeg = (dx, dy) => wrap360((Math.atan2(dy, dx) * 180) / Math.PI);

for (let i = 0; i < TUNE.DIR_COUNT; i++) RING.push(Math.round((360 * i) / TUNE.DIR_COUNT));

let _walls = null;
let _world = { projectiles: [] };
let _myR = 60;
let _cmd = null; // the single active dodge command
const _zoneMem = new Map(); // gid -> landed area { x, y, r, until }
const _lastZones = new Map(); // gid -> last observed zone/sticky snapshot

function _ring() {
    return RING;
}

function _dist(ax, ay, bx, by) {
    return Math.hypot(bx - ax, by - ay);
}

// ---------------- classification & hazard building ----------------

function _classify(p) {
    const travelType = p.travelType | 0;
    const indirect = !!p.isIndirect || travelType > 0 || (p.gravity | 0) > 0;
    const delayed = (p.triggerMs | 0) > 0 || !!p.attachArea;
    if (delayed) return "sticky";
    if (indirect || !!p.trail) return "zone";
    const vb = p.volleyBullets | 0;
    const vs = p.volleySpread | 0;
    const control = (p.stunMs | 0) > 0 || (p.silenceMs | 0) > 0;
    if (vb >= 2 && vs >= TUNE.CONE_MIN_SPREAD) return "cone";
    if (vb >= 3 && vs >= TUNE.CONE_CONTROL_SPREAD && control) return "cone";
    return "linear";
}

function _blastRadius(p) {
    const r = (p.radius | 0) > 0 ? p.radius | 0 : TUNE.ZONE_MIN_R;
    // a real area radius is trusted as-is; a tiny/missing one gets the safe
    // fallback with margin
    return r >= TUNE.ZONE_MIN_R ? r * 1.02 : TUNE.ZONE_MIN_R * TUNE.ZONE_SCALE;
}

function _linearVelocity(p) {
    let vx = p.vx;
    let vy = p.vy;
    if (!isFinite(vx) || !isFinite(vy)) {
        vx = 0;
        vy = 0;
    }
    if (Math.hypot(vx, vy) > 1) return { vx, vy };
    if (p.hasTarget) {
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        const d = Math.hypot(dx, dy);
        if (d > 1 && (p.speed | 0) > 0) return { vx: (dx / d) * p.speed, vy: (dy / d) * p.speed };
    }
    const dx = p.x - p.spawnX;
    const dy = p.y - p.spawnY;
    const d = Math.hypot(dx, dy);
    if (d > 8 && (p.speed | 0) > 0) return { vx: (dx / d) * p.speed, vy: (dy / d) * p.speed };
    return null;
}

function _collectHazards(myX, myY, now) {
    const list = [];
    const seen = new Set();
    const shots = _world.projectiles || [];
    for (let i = 0; i < shots.length; i++) {
        const p = shots[i];
        if (!p || !p.gid) continue;
        const d0 = _dist(p.x, p.y, myX, myY);
        if (d0 > TUNE.AWARE) continue;
        const kind = _classify(p);
        seen.add(p.gid);
        if (kind === "sticky") {
            const r = _blastRadius(p);
            const flightS = (p.seg0 | 0) > 0 && (p.speed | 0) > 0 ? p.seg0 / p.speed : 0;
            const fuseS = Math.max(
                TUNE.STICKY_FUSE_MIN_S,
                (p.triggerMs | 0) / 1000 - Math.max(0, (p.ageMs | 0) / 1000 - flightS)
            );
            _lastZones.set(p.gid, { x: p.x, y: p.y, r, sticky: true, fuseMs: fuseS * 1000 });
            list.push({ kind, x: p.x, y: p.y, r, fuse: fuseS, gid: p.gid });
            continue;
        }
        if (kind === "zone") {
            const r = _blastRadius(p);
            const fuseS = (p.preMs | 0) / 1000;
            let lx = p.x;
            let ly = p.y;
            let approach = 0;
            if ((p.seg | 0) > 0 && (p.speed | 0) > 0) {
                // still flying: project the landing point
                if (p.hasTarget) {
                    const dx = p.targetX - p.x;
                    const dy = p.targetY - p.y;
                    const dd = Math.hypot(dx, dy);
                    const k = dd > 1 ? Math.min(1, p.seg / dd) : 1;
                    lx = p.x + dx * k;
                    ly = p.y + dy * k;
                } else {
                    const v = _linearVelocity(p);
                    const spd = v ? Math.hypot(v.vx, v.vy) : 0;
                    if (spd > 1) {
                        const k = Math.min(1, p.seg / spd);
                        lx = p.x + v.vx * k;
                        ly = p.y + v.vy * k;
                    }
                }
                approach = p.seg / p.speed;
            }
            _lastZones.set(p.gid, { x: lx, y: ly, r, sticky: false, fuseMs: 0 });
            list.push({ kind, x: lx, y: ly, r, fuse: fuseS, approach, gid: p.gid });
            continue;
        }
        if (kind === "cone" && (p.volleySpread | 0) > 0) {
            const key = p.ownerIndex + ":" + (p.spawnX | 0) + ":" + (p.spawnY | 0);
            let h = null;
            for (let k = 0; k < list.length; k++) {
                if (list[k].kind === "cone" && list[k].key === key) {
                    h = list[k];
                    break;
                }
            }
            const bis = bearingDeg(myX - p.spawnX, myY - p.spawnY);
            const half = (p.volleySpread | 0) / 2 + 8;
            // the wedge reaches as far as its bullets really fly (aim point
            // is not the flight end): apex->bullet distance + remaining flight
            const flownFromApex = _dist(p.spawnX, p.spawnY, p.x, p.y);
            const reach =
                (p.seg | 0) > 0
                    ? flownFromApex + p.seg
                    : (p.seg0 | 0) > 0
                      ? p.seg0 + 60
                      : Math.min(TUNE.AWARE, _dist(p.spawnX, p.spawnY, myX, myY) + 400);
            if (h) {
                h.range = Math.max(h.range, reach);
                // the wedge advances with its leading bullet
                if ((p.seg | 0) > 0) h.seg = h.seg < 0 ? p.seg : Math.min(h.seg, p.seg);
                continue;
            }
            list.push({
                kind,
                key,
                ax: p.spawnX,
                ay: p.spawnY,
                bis,
                half: half * DEG2RAD,
                range: reach,
                speed: Math.max(1, (p.speed | 0) > 0 ? p.speed | 0 : Math.hypot(p.vx, p.vy)),
                seg: (p.seg | 0) > 0 ? p.seg : -1, // leading-bullet flight remainder
                gid: p.gid
            });
            continue;
        }
        // linear bullet (or unknown mover): keep it while it can matter
        const v = _linearVelocity(p);
        const stun = (p.stunMs | 0) > 0 || (p.silenceMs | 0) > 0;
        const hitR = (p.radius | 0) + _myR + (stun ? TUNE.STUN_MARGIN : 0);
        if (!v) {
            // no velocity and no target: treat as a static unknown -> zone circle
            list.push({
                kind: "zone",
                x: p.x,
                y: p.y,
                r: Math.max(hitR + TUNE.SKIN, TUNE.ZONE_MIN_R),
                fuse: 0,
                approach: 0,
                gid: p.gid
            });
            continue;
        }
        list.push({
            kind: "linear",
            x: p.x,
            y: p.y,
            vx: v.vx,
            vy: v.vy,
            hitR,
            left: (p.seg | 0) > 0 ? p.seg : -1, // unknown budget never hides a live bullet
            gid: p.gid
        });
    }
    // projectiles that vanished this tick: keep their last known area
    // dangerous for as long as it can still hurt (sticky fuse / lingering area)
    for (const [gid, z] of _lastZones) {
        if (seen.has(gid)) continue;
        _lastZones.delete(gid);
        let mx = z.x;
        let my = z.y;
        if (z.sticky && _dist(z.x, z.y, myX, myY) <= z.r + _myR + 150) {
            // it vanished right next to us: it attached to US, so the blast
            // will be centered on our position
            mx = myX;
            my = myY;
        }
        _zoneMem.set(gid, {
            x: mx,
            y: my,
            r: z.r,
            until:
                now +
                (z.sticky ? Math.max(TUNE.STICKY_MEM_MS, z.fuseMs || 0) : TUNE.ZONE_LINGER_MS),
            fuseMs: z.sticky ? Math.max(0, z.fuseMs || 0) : 0
        });
    }
    for (const [gid, z] of _zoneMem) {
        if (z.until <= now) {
            _zoneMem.delete(gid);
            continue;
        }
        if (z.fuseMs > 0) {
            // sticky memory: the fuse keeps counting down after the object
            // vanished from the scanner
            list.push({
                kind: "sticky",
                x: z.x,
                y: z.y,
                r: z.r,
                fuse: (z.until - now) / 1000,
                gid
            });
        } else {
            list.push({ kind: "zone", x: z.x, y: z.y, r: z.r, fuse: 0, approach: 0, gid });
        }
    }
    return list;
}

// ---------------- danger assessment ----------------

function _timeToHurt(h, myX, myY, speed) {
    if (h.kind === "linear") {
        const spd = Math.hypot(h.vx, h.vy);
        if (!(spd > 1)) return _dist(h.x, h.y, myX, myY) <= h.hitR ? 0 : Infinity;
        const closing = (myX - h.x) * h.vx + (myY - h.y) * h.vy;
        if (closing <= 0) return Infinity;
        const gap = _dist(h.x, h.y, myX, myY) - h.hitR;
        const t = gap > 0 ? gap / spd : 0;
        if (h.left > 0 && t * spd > h.left + 1) return Infinity; // spent before contact
        return t;
    }
    if (h.kind === "cone") {
        const d = _dist(h.ax, h.ay, myX, myY);
        if (d > h.range) return Infinity; // out of the wedge reach
        if (angDiff(bearingDeg(myX - h.ax, myY - h.ay), h.bis) > h.half + 1e-6) return Infinity;
        // arrival time of the leading bullet, not the static apex distance
        if (h.seg > 0) return h.seg / Math.max(1, h.speed);
        return d / Math.max(1, h.speed);
    }
    if (h.kind === "sticky") {
        const d = _dist(h.x, h.y, myX, myY);
        if (d <= h.r + 20) return 0; // standing in the blast: move now
        return h.fuse; // explosion moment regardless of where we stand
    }
    // zone
    return (h.approach > 0 ? h.approach : 0) + h.fuse;
}

function _clearanceNeed(h, myX, myY) {
    if (h.kind === "linear") return h.hitR + TUNE.SKIN;
    if (h.kind === "cone") {
        // a wide wedge cannot be crossed sideways: the realistic exits are
        // stepping out laterally or breaking away past the volley range
        const d = _dist(h.ax, h.ay, myX, myY);
        const lateral = d * Math.sin(h.half);
        const radial = Math.max(0, h.range - d);
        return Math.min(lateral, radial) + TUNE.SKIN;
    }
    const d = _dist(h.x, h.y, myX, myY);
    return Math.max(60, h.r + TUNE.SKIN - d);
}

function _assess(hazards, myX, myY, speed) {
    if (!hazards.length) return { danger: false, prepMs: 0 };
    let tMin = Infinity;
    let need = 0;
    for (let i = 0; i < hazards.length; i++) {
        const h = hazards[i];
        const t = _timeToHurt(h, myX, myY, speed);
        if (t < tMin) tMin = t;
        const n = _clearanceNeed(h, myX, myY);
        if (n > need) need = n;
    }
    const prepMs = Math.round((need / speed) * 1000 * TUNE.PREP_SAFETY) + TUNE.LATENCY_MS;
    return { danger: tMin <= prepMs / 1000, prepMs, tMin };
}

// ---------------- escape scoring ----------------

function _wallRoom(myX, myY, deg) {
    const rad = deg * DEG2RAD;
    const ex = myX + Math.cos(rad) * TUNE.REACH;
    const ey = myY + Math.sin(rad) * TUNE.REACH;
    const hit = _walls.firstWallHit(myX, myY, ex, ey, _myR > 200 ? 2 : 1);
    if (hit >= 0) return hit >= TUNE.REACH ? TUNE.REACH : Math.max(0, hit - _myR - 40);
    if (!_walls.isBlockedWide(ex, ey, _myR, _walls.BLOCKS_MOVEMENT)) return TUNE.REACH;
    let lo = 0;
    let hi = TUNE.REACH;
    for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        if (
            _walls.isBlockedWide(
                myX + Math.cos(rad) * mid,
                myY + Math.sin(rad) * mid,
                _myR,
                _walls.BLOCKS_MOVEMENT
            )
        )
            hi = mid;
        else lo = mid;
    }
    return Math.max(0, lo - _myR - 40);
}

function _anchor(myX, myY, deg) {
    const room = _wallRoom(myX, myY, deg);
    if (room <= TUNE.MIN_ROOM) return null;
    const run = Math.min(room, TUNE.REACH);
    const rad = deg * DEG2RAD;
    return { x: myX + Math.cos(rad) * run, y: myY + Math.sin(rad) * run };
}

function _wedgeSep(h, px, py) {
    const dx = px - h.ax;
    const dy = py - h.ay;
    const d = Math.hypot(dx, dy);
    if (d < 1) return -h.range * 0.3;
    const a = angDiff(bearingDeg(dx, dy), h.bis);
    if (a <= h.half + 1e-6) {
        if (d > h.range) return d - h.range; // out of reach
        return -(h.range - d) * 0.3; // inside the fan: deeper is worse
    }
    return d * Math.sin((a - h.half) * DEG2RAD); // lateral clearance out of the wedge
}

function _sepAt(h, px, py, t) {
    if (h.kind === "linear") {
        const spd = Math.hypot(h.vx, h.vy);
        if (!(spd > 1)) return _dist(h.x, h.y, px, py) - h.hitR;
        if (h.left > 0 && t > h.left / spd) return TUNE.SEP_CAP; // spent: gone
        return Math.hypot(px - (h.x + h.vx * t), py - (h.y + h.vy * t)) - h.hitR;
    }
    if (h.kind === "cone") return _wedgeSep(h, px, py);
    return _dist(h.x, h.y, px, py) - h.r; // zone / sticky
}

function _separationScore(hazards, myX, myY, speed, deg) {
    const rad = deg * DEG2RAD;
    const vx = Math.cos(rad) * speed;
    const vy = Math.sin(rad) * speed;
    // per-hazard worst separation over the escape path, then summed: a
    // direction must be decent against EVERYTHING (spray and bullets alike),
    // and a zone we are already inside cannot mask the bullet line behind it
    let total = 0;
    for (let i = 0; i < hazards.length; i++) {
        let sep = TUNE.SEP_CAP;
        for (let s = 1; s <= TUNE.SIM_STEPS; s++) {
            // quadratic spacing: dense early, where bullets close in
            const t = TUNE.HORIZON_S * (s / TUNE.SIM_STEPS) * (s / TUNE.SIM_STEPS);
            const d = _sepAt(hazards[i], myX + vx * t, myY + vy * t, t);
            if (d < sep) sep = d;
            if (sep <= -200) break;
        }
        if (sep < -200) sep = -200;
        else if (sep > TUNE.SEP_CAP) sep = TUNE.SEP_CAP;
        total += sep;
        if (total <= -600) return total; // hopelessly surrounded
    }
    return total;
}

function _bestHeading(hazards, myX, myY, speed, refDeg) {
    const ring = _ring();
    const cands = [];
    for (let i = 0; i < ring.length; i++) {
        cands.push({
            deg: ring[i],
            sep: _separationScore(hazards, myX, myY, speed, ring[i])
        });
    }
    cands.sort((a, b) => b.sep - a.sep);
    // wall-check only the strongest headings (the wall probe is a native call)
    let outDeg = -1;
    let outScore = -Infinity;
    for (let i = 0; i < cands.length && i < TUNE.ROOM_CANDIDATES; i++) {
        const room = _wallRoom(myX, myY, cands[i].deg);
        if (room <= TUNE.MIN_ROOM) continue;
        let score =
            cands[i].sep - (TUNE.WALL_PENALTY * Math.max(0, TUNE.REACH - room)) / TUNE.REACH;
        if (refDeg != null) score -= (TUNE.MOMENTUM * angDiff(cands[i].deg, refDeg)) / 180;
        if (score > outScore) {
            outScore = score;
            outDeg = cands[i].deg;
        }
    }
    return outDeg < 0 ? null : { deg: outDeg, score: outScore };
}

function _retreatHeading(hazards, myX, myY) {
    let near = null;
    let nd = Infinity;
    for (let i = 0; i < hazards.length; i++) {
        const h = hazards[i];
        const hx = h.kind === "cone" ? h.ax : h.x;
        const hy = h.kind === "cone" ? h.ay : h.y;
        const d = _dist(hx, hy, myX, myY);
        if (d < nd) {
            nd = d;
            near = { hx, hy };
        }
    }
    if (!near) return 0;
    return wrap360(bearingDeg(myX - near.hx, myY - near.hy)); // directly away
}

function _scoreOf(hazards, myX, myY, speed, deg, refDeg) {
    const room = _wallRoom(myX, myY, deg);
    if (room <= TUNE.MIN_ROOM) return -Infinity;
    let score = _separationScore(hazards, myX, myY, speed, deg);
    score -= (TUNE.WALL_PENALTY * Math.max(0, TUNE.REACH - room)) / TUNE.REACH;
    if (refDeg != null) score -= (TUNE.MOMENTUM * angDiff(deg, refDeg)) / 180;
    return score;
}

// ---------------- command state machine ----------------

function _engage(hazards, myX, myY, speed, now) {
    let deg = null;
    let anchor = null;
    const picked = _bestHeading(hazards, myX, myY, speed, null);
    if (picked) anchor = _anchor(myX, myY, picked.deg);
    if (picked && anchor) deg = picked.deg;
    if (deg === null) {
        // nothing scored: break the distance instead (never a random direction)
        const away = _retreatHeading(hazards, myX, myY);
        const snapped = _ring().reduce((a, b) => (angDiff(b, away) < angDiff(a, away) ? b : a));
        anchor = _anchor(myX, myY, snapped);
        if (anchor) deg = snapped;
    }
    if (deg === null) {
        const ring = _ring();
        for (let i = 0; i < ring.length; i++) {
            anchor = _anchor(myX, myY, ring[i]);
            if (anchor) {
                deg = ring[i];
                break;
            }
        }
    }
    if (deg === null || !anchor) return { active: false };
    _cmd = {
        headingDeg: deg,
        tx: anchor.x,
        ty: anchor.y,
        startedAt: now,
        lastDangerAt: now,
        lastCheckAt: now,
        lastSendAt: -1e9,
        sentX: NaN,
        sentY: NaN,
        forceSend: true
    };
    return {
        active: true,
        started: true,
        targetX: _cmd.tx,
        targetY: _cmd.ty,
        headingDeg: deg,
        send: true
    };
}

function _hold(hazards, myX, myY, speed, now, danger) {
    if (danger) _cmd.lastDangerAt = now;
    if (now - _cmd.lastCheckAt >= TUNE.REVALIDATE_MS) {
        _cmd.lastCheckAt = now;
        const cur = _scoreOf(hazards, myX, myY, speed, _cmd.headingDeg, _cmd.headingDeg);
        const alt = _bestHeading(hazards, myX, myY, speed, _cmd.headingDeg);
        if (
            alt &&
            alt.deg !== _cmd.headingDeg &&
            cur < -30 &&
            alt.score > cur + TUNE.REPICK_MARGIN
        ) {
            const a = _anchor(myX, myY, alt.deg);
            if (a) {
                _cmd.headingDeg = alt.deg;
                _cmd.tx = a.x;
                _cmd.ty = a.y;
                _cmd.forceSend = true;
            }
        }
    }
    if (
        !danger &&
        now - _cmd.lastDangerAt > TUNE.RELEASE_GRACE_MS &&
        now - _cmd.startedAt > TUNE.MIN_DODGE_MS
    ) {
        _cmd = null;
        return { active: false, stopped: true };
    }
    if (_dist(myX, myY, _cmd.tx, _cmd.ty) < TUNE.REFREEZE_DIST) {
        const a = _anchor(myX, myY, _cmd.headingDeg);
        if (a) {
            _cmd.tx = a.x;
            _cmd.ty = a.y;
        }
    }
    const moved =
        !isFinite(_cmd.sentX) || _dist(_cmd.tx, _cmd.ty, _cmd.sentX, _cmd.sentY) > TUNE.TARGET_EPS;
    const send = _cmd.forceSend || moved || now - _cmd.lastSendAt >= TUNE.RESEND_MS;
    if (send) {
        _cmd.forceSend = false;
        _cmd.lastSendAt = now;
        _cmd.sentX = _cmd.tx;
        _cmd.sentY = _cmd.ty;
    }
    return { active: true, targetX: _cmd.tx, targetY: _cmd.ty, headingDeg: _cmd.headingDeg, send };
}

function coreTick(world) {
    _walls = world.walls;
    _world = world;
    const now = world.now;
    const myX = world.x;
    const myY = world.y;
    if (!isFinite(myX) || !isFinite(myY))
        return _cmd ? { active: false, stopped: true } : { active: false };
    const speed = world.speed | 0;
    if (!(speed > 0)) return _cmd ? { active: false, stopped: true } : { active: false };
    _myR = world.radius > 0 ? world.radius : _myR;
    const hazards = _collectHazards(myX, myY, now);
    const a = _assess(hazards, myX, myY, speed);
    const { danger } = a;
    if (_cmd) return _hold(hazards, myX, myY, speed, now, danger);
    if (!danger) return { active: false };
    return _engage(hazards, myX, myY, speed, now);
}

function coreReset() {
    _cmd = null;
    _zoneMem.clear();
    _lastZones.clear();
    _world = { projectiles: [] };
}
