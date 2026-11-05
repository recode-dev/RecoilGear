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
    firstWallHit,
    isBlockedWide,
    movementBit,
    pathBlocked,
    projectileBit,
    tileSizeUnits,
    wallsVersion
} from "../utils/walls.js";

const moveInputType = 2;
const deg2rad = Math.PI / 180;

const tune = {
    dirCount: 36,
    horizonS: 1.2,
    simSteps: 8,
    sepCap: 420,
    skin: 60,
    reach: 1000,
    minRoom: 240,
    latencyMs: 90,
    prepSafety: 1.35,
    minDodgeMs: 260,
    releaseGraceMs: 170,
    revalidateMs: 120,
    repickMargin: 260,
    resendMs: 170,
    targetEps: 36,
    refreezeDist: 300,
    aware: 3600,
    coneMinSpread: 60,
    coneControlSpread: 10,
    zoneMinR: 110,
    zoneScale: 1.15,
    zoneLingerMs: 3500,
    stickyMemMs: 500,
    stickyFuseMinS: 0.4,
    stunMargin: 70,
    wallPenalty: 1500,
    roomCandidates: 6,
    momentum: 110
};

const ring = [];
for (let i = 0; i < tune.dirCount; i++) ring.push(Math.round((360 * i) / tune.dirCount));

const wrap360 = (a) => {
    const r = a % 360;
    return r < 0 ? r + 360 : r;
};

const angDiff = (a, b) => {
    const d = Math.abs(wrap360(a) - wrap360(b));
    return d > 180 ? 360 - d : d;
};

const bearingDeg = (dx, dy) => wrap360((Math.atan2(dy, dx) * 180) / Math.PI);

class DodgeCore {
    #walls = null;
    #world = { projectiles: [] };
    #myR = 60;
    #cmd = null;
    #zoneMem = new Map();
    #lastZones = new Map();

    #dist(ax, ay, bx, by) {
        return Math.hypot(bx - ax, by - ay);
    }

    #classify(p) {
        const travelType = p.travelType | 0;
        const indirect = !!p.isIndirect || travelType > 0 || (p.gravity | 0) > 0;
        const delayed = (p.triggerMs | 0) > 0 || !!p.attachArea;
        if (delayed) return "sticky";
        if (indirect || !!p.trail) return "zone";
        const vb = p.volleyBullets | 0;
        const vs = p.volleySpread | 0;
        const control = (p.stunMs | 0) > 0 || (p.silenceMs | 0) > 0;
        if (vb >= 2 && vs >= tune.coneMinSpread) return "cone";
        if (vb >= 3 && vs >= tune.coneControlSpread && control) return "cone";
        return "linear";
    }

    #blastRadius(p) {
        const r = (p.radius | 0) > 0 ? p.radius | 0 : tune.zoneMinR;
        return r >= tune.zoneMinR ? r * 1.02 : tune.zoneMinR * tune.zoneScale;
    }

    #linearVelocity(p) {
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
            if (d > 1 && (p.speed | 0) > 0)
                return { vx: (dx / d) * p.speed, vy: (dy / d) * p.speed };
        }
        const dx = p.x - p.spawnX;
        const dy = p.y - p.spawnY;
        const d = Math.hypot(dx, dy);
        if (d > 8 && (p.speed | 0) > 0) return { vx: (dx / d) * p.speed, vy: (dy / d) * p.speed };
        return null;
    }

    #collectHazards(myX, myY, now) {
        const list = [];
        const seen = new Set();
        const shots = this.#world.projectiles || [];
        for (let i = 0; i < shots.length; i++) {
            const p = shots[i];
            if (!p || !p.gid) continue;
            const d0 = this.#dist(p.x, p.y, myX, myY);
            if (d0 > tune.aware) continue;
            const kind = this.#classify(p);
            seen.add(p.gid);
            if (kind === "sticky") {
                const r = this.#blastRadius(p);
                const flightS = (p.seg0 | 0) > 0 && (p.speed | 0) > 0 ? p.seg0 / p.speed : 0;
                const fuseS = Math.max(
                    tune.stickyFuseMinS,
                    (p.triggerMs | 0) / 1000 - Math.max(0, (p.ageMs | 0) / 1000 - flightS)
                );
                this.#lastZones.set(p.gid, {
                    x: p.x,
                    y: p.y,
                    r,
                    sticky: true,
                    fuseMs: fuseS * 1000
                });
                list.push({ kind, x: p.x, y: p.y, r, fuse: fuseS, gid: p.gid });
                continue;
            }
            if (kind === "zone") {
                const r = this.#blastRadius(p);
                const fuseS = (p.preMs | 0) / 1000;
                let lx = p.x;
                let ly = p.y;
                let approach = 0;
                if ((p.seg | 0) > 0 && (p.speed | 0) > 0) {
                    if (p.hasTarget) {
                        const dx = p.targetX - p.x;
                        const dy = p.targetY - p.y;
                        const dd = Math.hypot(dx, dy);
                        const k = dd > 1 ? Math.min(1, p.seg / dd) : 1;
                        lx = p.x + dx * k;
                        ly = p.y + dy * k;
                    } else {
                        const v = this.#linearVelocity(p);
                        const spd = v ? Math.hypot(v.vx, v.vy) : 0;
                        if (spd > 1) {
                            const k = Math.min(1, p.seg / spd);
                            lx = p.x + v.vx * k;
                            ly = p.y + v.vy * k;
                        }
                    }
                    approach = p.seg / p.speed;
                }
                this.#lastZones.set(p.gid, { x: lx, y: ly, r, sticky: false, fuseMs: 0 });
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
                const flownFromApex = this.#dist(p.spawnX, p.spawnY, p.x, p.y);
                const reach =
                    (p.seg | 0) > 0
                        ? flownFromApex + p.seg
                        : (p.seg0 | 0) > 0
                          ? p.seg0 + 60
                          : Math.min(tune.aware, this.#dist(p.spawnX, p.spawnY, myX, myY) + 400);
                if (h) {
                    h.range = Math.max(h.range, reach);
                    if ((p.seg | 0) > 0) h.seg = h.seg < 0 ? p.seg : Math.min(h.seg, p.seg);
                    continue;
                }
                list.push({
                    kind,
                    key,
                    ax: p.spawnX,
                    ay: p.spawnY,
                    bis,
                    half: half * deg2rad,
                    range: reach,
                    speed: Math.max(1, (p.speed | 0) > 0 ? p.speed | 0 : Math.hypot(p.vx, p.vy)),
                    seg: (p.seg | 0) > 0 ? p.seg : -1,
                    gid: p.gid
                });
                continue;
            }
            const v = this.#linearVelocity(p);
            const stun = (p.stunMs | 0) > 0 || (p.silenceMs | 0) > 0;
            const hitR = (p.radius | 0) + this.#myR + (stun ? tune.stunMargin : 0);
            if (!v) {
                list.push({
                    kind: "zone",
                    x: p.x,
                    y: p.y,
                    r: Math.max(hitR + tune.skin, tune.zoneMinR),
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
                left: (p.seg | 0) > 0 ? p.seg : -1,
                gid: p.gid
            });
        }
        for (const [gid, z] of this.#lastZones) {
            if (seen.has(gid)) continue;
            this.#lastZones.delete(gid);
            let mx = z.x;
            let my = z.y;
            if (z.sticky && this.#dist(z.x, z.y, myX, myY) <= z.r + this.#myR + 150) {
                mx = myX;
                my = myY;
            }
            this.#zoneMem.set(gid, {
                x: mx,
                y: my,
                r: z.r,
                until:
                    now +
                    (z.sticky ? Math.max(tune.stickyMemMs, z.fuseMs || 0) : tune.zoneLingerMs),
                fuseMs: z.sticky ? Math.max(0, z.fuseMs || 0) : 0
            });
        }
        for (const [gid, z] of this.#zoneMem) {
            if (z.until <= now) {
                this.#zoneMem.delete(gid);
                continue;
            }
            if (z.fuseMs > 0) {
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

    #timeToHurt(h, myX, myY) {
        if (h.kind === "linear") {
            const spd = Math.hypot(h.vx, h.vy);
            if (!(spd > 1)) return this.#dist(h.x, h.y, myX, myY) <= h.hitR ? 0 : Infinity;
            const closing = (myX - h.x) * h.vx + (myY - h.y) * h.vy;
            if (closing <= 0) return Infinity;
            const gap = this.#dist(h.x, h.y, myX, myY) - h.hitR;
            const t = gap > 0 ? gap / spd : 0;
            if (h.left > 0 && t * spd > h.left + 1) return Infinity;
            return t;
        }
        if (h.kind === "cone") {
            const d = this.#dist(h.ax, h.ay, myX, myY);
            if (d > h.range) return Infinity;
            if (angDiff(bearingDeg(myX - h.ax, myY - h.ay), h.bis) > h.half + 1e-6) return Infinity;
            if (h.seg > 0) return h.seg / Math.max(1, h.speed);
            return d / Math.max(1, h.speed);
        }
        if (h.kind === "sticky") {
            const d = this.#dist(h.x, h.y, myX, myY);
            if (d <= h.r + 20) return 0;
            return h.fuse;
        }
        return (h.approach > 0 ? h.approach : 0) + h.fuse;
    }

    #clearanceNeed(h, myX, myY) {
        if (h.kind === "linear") return h.hitR + tune.skin;
        if (h.kind === "cone") {
            const d = this.#dist(h.ax, h.ay, myX, myY);
            const lateral = d * Math.sin(h.half);
            const radial = Math.max(0, h.range - d);
            return Math.min(lateral, radial) + tune.skin;
        }
        const d = this.#dist(h.x, h.y, myX, myY);
        return Math.max(60, h.r + tune.skin - d);
    }

    #assess(hazards, myX, myY, speed) {
        if (!hazards.length) return { danger: false, prepMs: 0 };
        let tMin = Infinity;
        let need = 0;
        for (let i = 0; i < hazards.length; i++) {
            const h = hazards[i];
            const t = this.#timeToHurt(h, myX, myY);
            if (t < tMin) tMin = t;
            const n = this.#clearanceNeed(h, myX, myY);
            if (n > need) need = n;
        }
        const prepMs = Math.round((need / speed) * 1000 * tune.prepSafety) + tune.latencyMs;
        return { danger: tMin <= prepMs / 1000, prepMs, tMin };
    }

    #wallRoom(myX, myY, deg) {
        const rad = deg * deg2rad;
        const ex = myX + Math.cos(rad) * tune.reach;
        const ey = myY + Math.sin(rad) * tune.reach;
        const hit = this.#walls.firstWallHit(myX, myY, ex, ey, this.#myR > 200 ? 2 : 1);
        if (hit >= 0) return hit >= tune.reach ? tune.reach : Math.max(0, hit - this.#myR - 40);
        if (!this.#walls.isBlockedWide(ex, ey, this.#myR, this.#walls.movementBit))
            return tune.reach;
        let lo = 0;
        let hi = tune.reach;
        for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) / 2;
            if (
                this.#walls.isBlockedWide(
                    myX + Math.cos(rad) * mid,
                    myY + Math.sin(rad) * mid,
                    this.#myR,
                    this.#walls.movementBit
                )
            )
                hi = mid;
            else lo = mid;
        }
        return Math.max(0, lo - this.#myR - 40);
    }

    #anchor(myX, myY, deg) {
        const room = this.#wallRoom(myX, myY, deg);
        if (room <= tune.minRoom) return null;
        const run = Math.min(room, tune.reach);
        const rad = deg * deg2rad;
        return { x: myX + Math.cos(rad) * run, y: myY + Math.sin(rad) * run };
    }

    #wedgeSep(h, px, py) {
        const dx = px - h.ax;
        const dy = py - h.ay;
        const d = Math.hypot(dx, dy);
        if (d < 1) return -h.range * 0.3;
        const a = angDiff(bearingDeg(dx, dy), h.bis);
        if (a <= h.half + 1e-6) {
            if (d > h.range) return d - h.range;
            return -(h.range - d) * 0.3;
        }
        return d * Math.sin((a - h.half) * deg2rad);
    }

    #sepAt(h, px, py, t) {
        if (h.kind === "linear") {
            const spd = Math.hypot(h.vx, h.vy);
            if (!(spd > 1)) return this.#dist(h.x, h.y, px, py) - h.hitR;
            if (h.left > 0 && t > h.left / spd) return tune.sepCap;
            return Math.hypot(px - (h.x + h.vx * t), py - (h.y + h.vy * t)) - h.hitR;
        }
        if (h.kind === "cone") return this.#wedgeSep(h, px, py);
        return this.#dist(h.x, h.y, px, py) - h.r;
    }

    #separationScore(hazards, myX, myY, speed, deg) {
        const rad = deg * deg2rad;
        const vx = Math.cos(rad) * speed;
        const vy = Math.sin(rad) * speed;
        let total = 0;
        for (let i = 0; i < hazards.length; i++) {
            let sep = tune.sepCap;
            for (let s = 1; s <= tune.simSteps; s++) {
                const t = tune.horizonS * (s / tune.simSteps) * (s / tune.simSteps);
                const d = this.#sepAt(hazards[i], myX + vx * t, myY + vy * t, t);
                if (d < sep) sep = d;
                if (sep <= -200) break;
            }
            if (sep < -200) sep = -200;
            else if (sep > tune.sepCap) sep = tune.sepCap;
            total += sep;
            if (total <= -600) return total;
        }
        return total;
    }

    #bestHeading(hazards, myX, myY, speed, refDeg) {
        const cands = [];
        for (let i = 0; i < ring.length; i++) {
            cands.push({
                deg: ring[i],
                sep: this.#separationScore(hazards, myX, myY, speed, ring[i])
            });
        }
        cands.sort((a, b) => b.sep - a.sep);
        let outDeg = -1;
        let outScore = -Infinity;
        for (let i = 0; i < cands.length && i < tune.roomCandidates; i++) {
            const room = this.#wallRoom(myX, myY, cands[i].deg);
            if (room <= tune.minRoom) continue;
            let score =
                cands[i].sep - (tune.wallPenalty * Math.max(0, tune.reach - room)) / tune.reach;
            if (refDeg != null) score -= (tune.momentum * angDiff(cands[i].deg, refDeg)) / 180;
            if (score > outScore) {
                outScore = score;
                outDeg = cands[i].deg;
            }
        }
        return outDeg < 0 ? null : { deg: outDeg, score: outScore };
    }

    #retreatHeading(hazards, myX, myY) {
        let near = null;
        let nd = Infinity;
        for (let i = 0; i < hazards.length; i++) {
            const h = hazards[i];
            const hx = h.kind === "cone" ? h.ax : h.x;
            const hy = h.kind === "cone" ? h.ay : h.y;
            const d = this.#dist(hx, hy, myX, myY);
            if (d < nd) {
                nd = d;
                near = { hx, hy };
            }
        }
        if (!near) return 0;
        return wrap360(bearingDeg(myX - near.hx, myY - near.hy));
    }

    #scoreOf(hazards, myX, myY, speed, deg, refDeg) {
        const room = this.#wallRoom(myX, myY, deg);
        if (room <= tune.minRoom) return -Infinity;
        let score = this.#separationScore(hazards, myX, myY, speed, deg);
        score -= (tune.wallPenalty * Math.max(0, tune.reach - room)) / tune.reach;
        if (refDeg != null) score -= (tune.momentum * angDiff(deg, refDeg)) / 180;
        return score;
    }

    #engage(hazards, myX, myY, speed, now) {
        let deg = null;
        let anchor = null;
        const picked = this.#bestHeading(hazards, myX, myY, speed, null);
        if (picked) anchor = this.#anchor(myX, myY, picked.deg);
        if (picked && anchor) deg = picked.deg;
        if (deg === null) {
            const away = this.#retreatHeading(hazards, myX, myY);
            const snapped = ring.reduce((a, b) => (angDiff(b, away) < angDiff(a, away) ? b : a));
            anchor = this.#anchor(myX, myY, snapped);
            if (anchor) deg = snapped;
        }
        if (deg === null) {
            for (let i = 0; i < ring.length; i++) {
                anchor = this.#anchor(myX, myY, ring[i]);
                if (anchor) {
                    deg = ring[i];
                    break;
                }
            }
        }
        if (deg === null || !anchor) return { active: false };
        this.#cmd = {
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
            targetX: this.#cmd.tx,
            targetY: this.#cmd.ty,
            headingDeg: deg,
            send: true
        };
    }

    #hold(hazards, myX, myY, speed, now, danger) {
        const cmd = this.#cmd;
        if (danger) cmd.lastDangerAt = now;
        if (now - cmd.lastCheckAt >= tune.revalidateMs) {
            cmd.lastCheckAt = now;
            const cur = this.#scoreOf(hazards, myX, myY, speed, cmd.headingDeg, cmd.headingDeg);
            const alt = this.#bestHeading(hazards, myX, myY, speed, cmd.headingDeg);
            if (
                alt &&
                alt.deg !== cmd.headingDeg &&
                cur < -30 &&
                alt.score > cur + tune.repickMargin
            ) {
                const a = this.#anchor(myX, myY, alt.deg);
                if (a) {
                    cmd.headingDeg = alt.deg;
                    cmd.tx = a.x;
                    cmd.ty = a.y;
                    cmd.forceSend = true;
                }
            }
        }
        if (
            !danger &&
            now - cmd.lastDangerAt > tune.releaseGraceMs &&
            now - cmd.startedAt > tune.minDodgeMs
        ) {
            this.#cmd = null;
            return { active: false, stopped: true };
        }
        if (this.#dist(myX, myY, cmd.tx, cmd.ty) < tune.refreezeDist) {
            const a = this.#anchor(myX, myY, cmd.headingDeg);
            if (a) {
                cmd.tx = a.x;
                cmd.ty = a.y;
            }
        }
        const moved =
            !isFinite(cmd.sentX) ||
            this.#dist(cmd.tx, cmd.ty, cmd.sentX, cmd.sentY) > tune.targetEps;
        const send = cmd.forceSend || moved || now - cmd.lastSendAt >= tune.resendMs;
        if (send) {
            cmd.forceSend = false;
            cmd.lastSendAt = now;
            cmd.sentX = cmd.tx;
            cmd.sentY = cmd.ty;
        }
        return { active: true, targetX: cmd.tx, targetY: cmd.ty, headingDeg: cmd.headingDeg, send };
    }

    tick(world) {
        this.#walls = world.walls;
        this.#world = world;
        const now = world.now;
        const myX = world.x;
        const myY = world.y;
        if (!isFinite(myX) || !isFinite(myY))
            return this.#cmd ? { active: false, stopped: true } : { active: false };
        const speed = world.speed | 0;
        if (!(speed > 0)) return this.#cmd ? { active: false, stopped: true } : { active: false };
        this.#myR = world.radius > 0 ? world.radius : this.#myR;
        const hazards = this.#collectHazards(myX, myY, now);
        const a = this.#assess(hazards, myX, myY, speed);
        const { danger } = a;
        if (this.#cmd) return this.#hold(hazards, myX, myY, speed, now, danger);
        if (!danger) return { active: false };
        return this.#engage(hazards, myX, myY, speed, now);
    }

    reset() {
        this.#cmd = null;
        this.#zoneMem.clear();
        this.#lastZones.clear();
        this.#world = { projectiles: [] };
    }
}

class AutoDodge {
    #hitbox = 0;
    #radiusMemoData = null;
    #radiusMemoValue = 0;
    #last = { active: false };
    #stopSent = false;
    #transport = null;
    #wallsApi = {
        firstWallHit,
        isBlockedWide,
        pathBlocked,
        tileSizeUnits,
        wallsVersion,
        movementBit,
        projectileBit
    };
    #core = new DodgeCore();

    setTransport(t) {
        this.#transport = t;
    }

    setWalls(api) {
        if (api) this.#wallsApi = api;
    }

    probe() {
        return {
            active: !!this.#last.active,
            targetX: this.#last.targetX,
            targetY: this.#last.targetY,
            headingDeg: this.#last.headingDeg,
            started: !!this.#last.started,
            stopped: !!this.#last.stopped
        };
    }

    #characterCollisionRadius(data) {
        if (!data || data.isNull()) return 0;
        if (
            this.#radiusMemoData !== null &&
            data.equals(this.#radiusMemoData) &&
            this.#radiusMemoValue > 0
        ) {
            return this.#radiusMemoValue;
        }
        const value = collisionRadius(data) | 0;
        if (value > 0) {
            this.#radiusMemoData = data;
            this.#radiusMemoValue = value;
        }
        return value;
    }

    #learnOwnHitbox() {
        try {
            const own = scanData.ownCharacter;
            if (!own || own.isNull()) return false;
            const fns = getFunctions();
            if (!fns.LogicGameObjectClient_getData) return false;
            const radius = this.#characterCollisionRadius(dataOf(own)) | 0;
            if (!(radius > 0)) return false;
            this.#hitbox = radius;
            return true;
        } catch (_) {
            return false;
        }
    }

    #issueMove(x, y) {
        if (this.#transport) {
            this.#transport.predict(x, y);
            this.#transport.input(x, y);
            return true;
        }
        try {
            const logic = scanData.battleModeClient;
            if (!logic || logic.isNull()) return false;
            const fns = getFunctions();
            if (!fns.LogicBattleModeClient_setClientPredictionMoveTo) return false;
            fns.LogicBattleModeClient_setClientPredictionMoveTo(logic, x, y, 1);
            return sendCommand(moveInputType, (ci) => {
                ci.add(offsets.ClientInput_x).writeS32(x);
                ci.add(offsets.ClientInput_y).writeS32(y);
            });
        } catch (_) {
            return false;
        }
    }

    #issueStop() {
        if (this.#transport) {
            this.#transport.stop(scanData.myX, scanData.myY);
            return true;
        }
        try {
            const logic = scanData.battleModeClient;
            if (!logic || logic.isNull()) return false;
            return sendCommand(moveInputType, (ci) => {
                ci.add(offsets.ClientInput_x).writeS32(scanData.myX);
                ci.add(offsets.ClientInput_y).writeS32(scanData.myY);
            });
        } catch (_) {
            return false;
        }
    }

    update() {
        if (scanData.lastUpdate === 0) return;
        const now = Date.now();
        if (!this.#learnOwnHitbox()) {
            const fb = scanData.myRadius | 0;
            if (fb > 0) this.#hitbox = fb;
        }
        const d = this.#core.tick({
            now,
            x: scanData.myX,
            y: scanData.myY,
            speed: scanData.mySpeed | 0,
            radius: this.#hitbox | 0,
            projectiles: scanData.projectiles,
            walls: this.#wallsApi,
            stamp: scanData.lastUpdate
        });
        this.#last = d;
        if (d.active) {
            this.#stopSent = false;
            if (d.send && isFinite(d.targetX) && isFinite(d.targetY))
                this.#issueMove(d.targetX, d.targetY);
            return;
        }
        if (d.stopped && !this.#stopSent) {
            this.#stopSent = true;
            this.#issueStop();
        }
    }

    #invalidateOwnMetrics() {
        this.#hitbox = 0;
        this.#radiusMemoData = null;
        this.#radiusMemoValue = 0;
    }

    reset() {
        this.#core.reset();
        this.#invalidateOwnMetrics();
        this.#last = { active: false };
        this.#stopSent = false;
    }

    setup() {
        try {
            enableProjectileTracking();
            onDataReload(() => this.#invalidateOwnMetrics());
        } catch (_) {}
    }
}

const autoDodge = new AutoDodge();

export const updateAutododge = () => autoDodge.update();
export const resetAutododge = () => autoDodge.reset();
export const setupAutododge = () => autoDodge.setup();
export const __setDodgeTransport = (t) => autoDodge.setTransport(t);
export const __setDodgeWalls = (api) => autoDodge.setWalls(api);
export const __dodgeProbe = () => autoDodge.probe();
