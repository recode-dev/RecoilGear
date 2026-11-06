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
import { firstWallHit, isBlockedWide, movementBit } from "../utils/walls.js";

const moveInputType = 2;
const deg2rad = Math.PI / 180;

const tune = {
    dirCount: 64,
    horizonS: 1.2,
    aware: 3600,
    skin: 60,
    wallPenalty: 1500,
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
    #myX = 0;
    #myY = 0;
    #speed = 0;
    #now = 0;
    #cmd = null;
    #curDeg = NaN;
    #zoneMem = new Map();
    #lastZones = new Map();

    #dist(ax, ay, bx, by) {
        return Math.hypot(bx - ax, by - ay);
    }

    #classify(p) {
        const travelType = Math.trunc(p.travelType);
        const indirect = !!p.isIndirect || travelType > 0 || Math.trunc(p.gravity) > 0;
        const delayed = Math.trunc(p.triggerMs) > 0 || !!p.attachArea;
        if (delayed) return "sticky";
        if (indirect || !!p.trail) return "zone";
        const vb = Math.trunc(p.volleyBullets);
        const vs = Math.trunc(p.volleySpread);
        const control = Math.trunc(p.stunMs) > 0 || Math.trunc(p.silenceMs) > 0;
        if (vb >= 2 && vs >= 60) return "cone";
        if (vb >= 3 && vs >= 10 && control) return "cone";
        return "linear";
    }

    #blastRadius(p) {
        const r = Math.trunc(p.radius) > 0 ? Math.trunc(p.radius) : 110;
        return r >= 110 ? r * 1.02 : 110 * 1.15;
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
            if (d > 1 && Math.trunc(p.speed) > 0)
                return { vx: (dx / d) * p.speed, vy: (dy / d) * p.speed };
        }
        const dx = p.x - p.spawnX;
        const dy = p.y - p.spawnY;
        const d = Math.hypot(dx, dy);
        if (d > 8 && Math.trunc(p.speed) > 0)
            return { vx: (dx / d) * p.speed, vy: (dy / d) * p.speed };
        return null;
    }

    #stickyHazard(p) {
        const r = this.#blastRadius(p);
        const flightS = Math.trunc(p.seg0) > 0 && Math.trunc(p.speed) > 0 ? p.seg0 / p.speed : 0;
        const fuseS = Math.max(
            0.4,
            Math.trunc(p.triggerMs) / 1000 - Math.max(0, Math.trunc(p.ageMs) / 1000 - flightS)
        );
        this.#lastZones.set(p.gid, {
            x: p.x,
            y: p.y,
            r,
            sticky: true,
            fuseMs: fuseS * 1000
        });
        return { kind: "sticky", x: p.x, y: p.y, r, fuse: fuseS, gid: p.gid };
    }

    #zoneLanding(p) {
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        const dd = Math.hypot(dx, dy);
        const k = dd > 1 ? Math.min(1, p.seg / dd) : 1;
        return { x: p.x + dx * k, y: p.y + dy * k };
    }

    #zoneDrift(p) {
        const v = this.#linearVelocity(p);
        const spd = v ? Math.hypot(v.vx, v.vy) : 0;
        if (!(spd > 1)) return null;
        const k = Math.min(1, p.seg / spd);
        return { x: p.x + v.vx * k, y: p.y + v.vy * k };
    }

    #zoneHazard(p) {
        const r = this.#blastRadius(p);
        const fuseS = Math.trunc(p.preMs) / 1000;
        let lx = p.x;
        let ly = p.y;
        let approach = 0;
        if (Math.trunc(p.seg) > 0 && Math.trunc(p.speed) > 0) {
            const landing = p.hasTarget ? this.#zoneLanding(p) : this.#zoneDrift(p);
            if (landing) {
                lx = landing.x;
                ly = landing.y;
            }
            approach = p.seg / p.speed;
        }
        this.#lastZones.set(p.gid, { x: lx, y: ly, r, sticky: false, fuseMs: 0 });
        return { kind: "zone", x: lx, y: ly, r, fuse: fuseS, approach, gid: p.gid };
    }

    #coneKey(p) {
        return `${p.ownerIndex}:${Math.trunc(p.spawnX)}:${Math.trunc(p.spawnY)}`;
    }

    #coneReach(p) {
        const flownFromApex = this.#dist(p.spawnX, p.spawnY, p.x, p.y);
        if (Math.trunc(p.seg) > 0) return flownFromApex + p.seg;
        if (Math.trunc(p.seg0) > 0) return p.seg0 + 60;
        return Math.min(tune.aware, this.#dist(p.spawnX, p.spawnY, this.#myX, this.#myY) + 400);
    }

    #coneHazard(p, list) {
        const key = this.#coneKey(p);
        for (const element of list) {
            if (element.kind !== "cone" || element.key !== key) continue;
            const reach = this.#coneReach(p);
            element.range = Math.max(element.range, reach);
            if (Math.trunc(p.seg) > 0)
                element.seg = element.seg < 0 ? p.seg : Math.min(element.seg, p.seg);
            return;
        }
        const half = Math.trunc(p.volleySpread) / 2 + 8;
        list.push({
            kind: "cone",
            key,
            ax: p.spawnX,
            ay: p.spawnY,
            bis: bearingDeg(this.#myX - p.spawnX, this.#myY - p.spawnY),
            half: half * deg2rad,
            range: this.#coneReach(p),
            speed: Math.max(
                1,
                Math.trunc(p.speed) > 0 ? Math.trunc(p.speed) : Math.hypot(p.vx, p.vy)
            ),
            seg: Math.trunc(p.seg) > 0 ? p.seg : -1,
            gid: p.gid
        });
    }

    #pathHazard(p) {
        const v = this.#linearVelocity(p);
        const stun = Math.trunc(p.stunMs) > 0 || Math.trunc(p.silenceMs) > 0;
        const hitR = Math.trunc(p.radius) + this.#myR + (stun ? 70 : 0);
        if (!v) {
            return {
                kind: "zone",
                x: p.x,
                y: p.y,
                r: Math.max(hitR + tune.skin, 110),
                fuse: 0,
                approach: 0,
                gid: p.gid
            };
        }
        return {
            kind: "linear",
            x: p.x,
            y: p.y,
            vx: v.vx,
            vy: v.vy,
            hitR,
            left: Math.trunc(p.seg) > 0 ? p.seg : -1,
            gid: p.gid
        };
    }

    #collectShots(seen) {
        const list = [];
        const shots = this.#world.projectiles || [];
        for (const p of shots) {
            if (!p || !p.gid) continue;
            if (this.#dist(p.x, p.y, this.#myX, this.#myY) > tune.aware) continue;
            seen.add(p.gid);
            const kind = this.#classify(p);
            if (kind === "sticky") list.push(this.#stickyHazard(p));
            else if (kind === "zone") list.push(this.#zoneHazard(p));
            else if (kind === "cone" && Math.trunc(p.volleySpread) > 0) this.#coneHazard(p, list);
            else list.push(this.#pathHazard(p));
        }
        return list;
    }

    #forgetZones(seen) {
        for (const [gid, z] of this.#lastZones) {
            if (seen.has(gid)) continue;
            this.#lastZones.delete(gid);
            let mx = z.x;
            let my = z.y;
            if (z.sticky && this.#dist(z.x, z.y, this.#myX, this.#myY) <= z.r + this.#myR + 150) {
                mx = this.#myX;
                my = this.#myY;
            }
            this.#zoneMem.set(gid, {
                x: mx,
                y: my,
                r: z.r,
                until: this.#now + (z.sticky ? Math.max(500, z.fuseMs || 0) : 3500),
                fuseMs: z.sticky ? Math.max(0, z.fuseMs || 0) : 0
            });
        }
    }

    #memoHazards() {
        const list = [];
        for (const [gid, z] of this.#zoneMem) {
            if (z.until <= this.#now) {
                this.#zoneMem.delete(gid);
                continue;
            }
            if (z.fuseMs > 0) {
                list.push({
                    kind: "sticky",
                    x: z.x,
                    y: z.y,
                    r: z.r,
                    fuse: (z.until - this.#now) / 1000,
                    gid
                });
            } else {
                list.push({ kind: "zone", x: z.x, y: z.y, r: z.r, fuse: 0, approach: 0, gid });
            }
        }
        return list;
    }

    #collectHazards() {
        const seen = new Set();
        const list = this.#collectShots(seen);
        this.#forgetZones(seen);
        for (const h of this.#memoHazards()) list.push(h);
        return list;
    }

    #linearTimeToHurt(h) {
        const spd = Math.hypot(h.vx, h.vy);
        if (!(spd > 1)) return this.#dist(h.x, h.y, this.#myX, this.#myY) <= h.hitR ? 0 : Infinity;
        const closing = (this.#myX - h.x) * h.vx + (this.#myY - h.y) * h.vy;
        if (closing <= 0) return Infinity;
        const gap = this.#dist(h.x, h.y, this.#myX, this.#myY) - h.hitR;
        const t = gap > 0 ? gap / spd : 0;
        if (h.left > 0 && t * spd > h.left + 1) return Infinity;
        return t;
    }

    #coneTimeToHurt(h) {
        const d = this.#dist(h.ax, h.ay, this.#myX, this.#myY);
        if (d > h.range) return Infinity;
        if (angDiff(bearingDeg(this.#myX - h.ax, this.#myY - h.ay), h.bis) > h.half + 1e-6)
            return Infinity;
        if (h.seg > 0) return h.seg / Math.max(1, h.speed);
        return d / Math.max(1, h.speed);
    }

    #stickyTimeToHurt(h) {
        const d = this.#dist(h.x, h.y, this.#myX, this.#myY);
        if (d <= h.r + 20) return 0;
        return h.fuse;
    }

    #timeToHurt(h) {
        if (h.kind === "linear") return this.#linearTimeToHurt(h);
        if (h.kind === "cone") return this.#coneTimeToHurt(h);
        if (h.kind === "sticky") return this.#stickyTimeToHurt(h);
        return Math.max(h.approach, 0) + h.fuse;
    }

    #clearanceNeed(h) {
        if (h.kind === "linear") return h.hitR + tune.skin;
        if (h.kind === "cone") {
            const d = this.#dist(h.ax, h.ay, this.#myX, this.#myY);
            const lateral = d * Math.sin(h.half);
            const radial = Math.max(0, h.range - d);
            return Math.min(lateral, radial) + tune.skin;
        }
        const d = this.#dist(h.x, h.y, this.#myX, this.#myY);
        return Math.max(60, h.r + tune.skin - d);
    }

    #assess(hazards) {
        if (!hazards.length) return { danger: false, prepMs: 0 };
        let tMin = Infinity;
        let need = 0;
        for (const h of hazards) {
            const t = this.#timeToHurt(h);
            if (t < tMin) tMin = t;
            const n = this.#clearanceNeed(h);
            if (n > need) need = n;
        }
        const prepMs = Math.round((need / this.#speed) * 1000 * 1.35) + 90;
        return { danger: tMin <= prepMs / 1000, prepMs, tMin };
    }

    #wallRoom(deg) {
        const rad = deg * deg2rad;
        const ex = this.#myX + Math.cos(rad) * 1000;
        const ey = this.#myY + Math.sin(rad) * 1000;
        const hit = this.#walls.firstWallHit(this.#myX, this.#myY, ex, ey, this.#myR > 200 ? 2 : 1);
        if (hit >= 0) return hit >= 1000 ? 1000 : Math.max(0, hit - this.#myR - 40);
        if (!this.#walls.isBlockedWide(ex, ey, this.#myR, this.#walls.movementBit)) return 1000;
        let lo = 0;
        let hi = 1000;
        for (let i = 0; i < 6; i++) {
            const mid = (lo + hi) / 2;
            if (
                this.#walls.isBlockedWide(
                    this.#myX + Math.cos(rad) * mid,
                    this.#myY + Math.sin(rad) * mid,
                    this.#myR,
                    this.#walls.movementBit
                )
            )
                hi = mid;
            else lo = mid;
        }
        return Math.max(0, lo - this.#myR - 40);
    }

    #anchor(deg) {
        const room = this.#wallRoom(deg);
        if (room <= 240) return null;
        const run = Math.min(room, 1000);
        const rad = deg * deg2rad;
        return { x: this.#myX + Math.cos(rad) * run, y: this.#myY + Math.sin(rad) * run };
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
            if (h.left > 0 && t > h.left / spd) return 420;
            return Math.hypot(px - (h.x + h.vx * t), py - (h.y + h.vy * t)) - h.hitR;
        }
        if (h.kind === "cone") return this.#wedgeSep(h, px, py);
        return this.#dist(h.x, h.y, px, py) - h.r;
    }

    #separationScore(hazards, deg) {
        const rad = deg * deg2rad;
        const vx = Math.cos(rad) * this.#speed;
        const vy = Math.sin(rad) * this.#speed;
        let total = 0;
        for (const hazard of hazards) {
            let sep = 420;
            for (let s = 1; s <= 8; s++) {
                const t = tune.horizonS * (s / 8) * (s / 8);
                const d = this.#sepAt(hazard, this.#myX + vx * t, this.#myY + vy * t, t);
                if (d < sep) sep = d;
                if (sep <= -200) break;
            }
            if (sep < -200) sep = -200;
            else if (sep > 420) sep = 420;
            total += sep;
            if (total <= -600) return total;
        }
        return total;
    }

    #headingScore(cand, room, refDeg) {
        let score = cand.sep - (tune.wallPenalty * Math.max(0, 1000 - room)) / 1000;
        if (refDeg != null) score -= (tune.momentum * angDiff(cand.deg, refDeg)) / 180;
        return score;
    }

    #bestHeading(hazards, refDeg) {
        const cands = [];
        for (const deg of ring) {
            cands.push({ deg, sep: this.#separationScore(hazards, deg) });
        }
        cands.sort((a, b) => b.sep - a.sep);
        let outDeg = -1;
        let outScore = -Infinity;
        const top = Math.min(cands.length, 6);
        for (let i = 0; i < top; i++) {
            const room = this.#wallRoom(cands[i].deg);
            if (room <= 240) continue;
            const score = this.#headingScore(cands[i], room, refDeg);
            if (score > outScore) {
                outScore = score;
                outDeg = cands[i].deg;
            }
        }
        return outDeg < 0 ? null : { deg: outDeg, score: outScore };
    }

    #retreatHeading(hazards) {
        let near = null;
        let nd = Infinity;
        for (const h of hazards) {
            const hx = h.kind === "cone" ? h.ax : h.x;
            const hy = h.kind === "cone" ? h.ay : h.y;
            const d = this.#dist(hx, hy, this.#myX, this.#myY);
            if (d < nd) {
                nd = d;
                near = { hx, hy };
            }
        }
        if (!near) return 0;
        return wrap360(bearingDeg(this.#myX - near.hx, this.#myY - near.hy));
    }

    #scoreOf(hazards, deg, refDeg) {
        const room = this.#wallRoom(deg);
        if (room <= 240) return -Infinity;
        let score = this.#separationScore(hazards, deg);
        score -= (tune.wallPenalty * Math.max(0, 1000 - room)) / 1000;
        if (refDeg != null) score -= (tune.momentum * angDiff(deg, refDeg)) / 180;
        return score;
    }

    #snapHeading(away) {
        let best = ring[0];
        for (const deg of ring) {
            if (angDiff(deg, away) < angDiff(best, away)) best = deg;
        }
        return best;
    }

    #engage(hazards) {
        const now = this.#now;
        let deg = null;
        let anchor = null;
        const picked = this.#bestHeading(hazards, null);
        if (picked) anchor = this.#anchor(picked.deg);
        if (picked && anchor) deg = picked.deg;
        if (deg === null) {
            const snapped = this.#snapHeading(this.#retreatHeading(hazards));
            anchor = this.#anchor(snapped);
            if (anchor) deg = snapped;
        }
        if (deg === null) {
            for (const element of ring) {
                anchor = this.#anchor(element);
                if (anchor) {
                    deg = element;
                    break;
                }
            }
        }
        if (deg === null || !anchor) return { active: false };
        this.#curDeg = deg;
        const step = this.#stepTarget(deg);
        this.#cmd = {
            headingDeg: deg,
            tx: step.x,
            ty: step.y,
            startedAt: now,
            lastDangerAt: now,
            lastCheckAt: now
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

    #revalidate(cmd, hazards) {
        if (this.#now - cmd.lastCheckAt < 200) return;
        cmd.lastCheckAt = this.#now;
        const cur = this.#scoreOf(hazards, cmd.headingDeg, cmd.headingDeg);
        const alt = this.#bestHeading(hazards, cmd.headingDeg);
        if (!alt || alt.deg === cmd.headingDeg) return;
        if (!(cur < -30) || alt.score <= cur + 420) return;
        cmd.headingDeg = alt.deg;
    }

    #releaseCheck(cmd, danger) {
        if (danger) return false;
        if (this.#now - cmd.lastDangerAt <= 170) return false;
        if (this.#now - cmd.startedAt <= 260) return false;
        this.#cmd = null;
        return true;
    }

    #stepTarget(deg) {
        const step = Math.max(150, Math.min(320, Math.round(this.#speed * 0.34)));
        this.#curDeg = this.#slewDeg(deg);
        const rad = this.#curDeg * deg2rad;
        return {
            x: this.#myX + Math.cos(rad) * step,
            y: this.#myY + Math.sin(rad) * step
        };
    }

    #slewDeg(deg) {
        if (!isFinite(this.#curDeg)) return deg;
        const diff = angDiff(deg, this.#curDeg);
        const maxStep = 16;
        if (diff > maxStep) return this.#curDeg + maxStep;
        if (diff < -maxStep) return this.#curDeg - maxStep;
        return deg;
    }

    #hold(hazards, danger) {
        const cmd = this.#cmd;
        if (danger) cmd.lastDangerAt = this.#now;
        this.#revalidate(cmd, hazards);
        if (this.#releaseCheck(cmd, danger)) return { active: false, stopped: true };
        const step = this.#stepTarget(cmd.headingDeg);
        cmd.tx = step.x;
        cmd.ty = step.y;
        return {
            active: true,
            targetX: cmd.tx,
            targetY: cmd.ty,
            headingDeg: cmd.headingDeg,
            send: true
        };
    }

    tick(world) {
        this.#walls = world.walls;
        this.#world = world;
        this.#now = world.now;
        this.#myX = world.x;
        this.#myY = world.y;
        if (!isFinite(this.#myX) || !isFinite(this.#myY))
            return this.#cmd ? { active: false, stopped: true } : { active: false };
        this.#speed = Math.trunc(world.speed);
        if (!(this.#speed > 0))
            return this.#cmd ? { active: false, stopped: true } : { active: false };
        this.#myR = world.radius > 0 ? world.radius : this.#myR;
        const hazards = this.#collectHazards();
        const { danger } = this.#assess(hazards);
        if (this.#cmd) return this.#hold(hazards, danger);
        if (!danger) return { active: false };
        return this.#engage(hazards);
    }

    reset() {
        this.#cmd = null;
        this.#curDeg = NaN;
        this.#zoneMem.clear();
        this.#lastZones.clear();
        this.#world = { projectiles: [] };
    }
}

class AutoDodge {
    #hitbox = 0;
    #radiusMemoData = null;
    #radiusMemoValue = 0;
    #stopSent = false;
    #wallsApi = { firstWallHit, isBlockedWide, movementBit };
    #core = new DodgeCore();

    #characterCollisionRadius(data) {
        if (!data || data.isNull()) return 0;
        if (
            this.#radiusMemoData !== null &&
            data.equals(this.#radiusMemoData) &&
            this.#radiusMemoValue > 0
        ) {
            return this.#radiusMemoValue;
        }
        const value = Math.trunc(collisionRadius(data));
        if (value > 0) {
            this.#radiusMemoData = data;
            this.#radiusMemoValue = value;
        }
        return value;
    }

    #ownData(fns, own) {
        if (fns.LogicGameObjectClient_getData) {
            try {
                const viaFn = fns.LogicGameObjectClient_getData(own);
                if (viaFn && !viaFn.isNull()) return viaFn;
            } catch {}
        }
        return dataOf(own);
    }

    #learnOwnHitbox() {
        try {
            const own = scanData.ownCharacter;
            if (!own || own.isNull()) return false;
            const data = this.#ownData(getFunctions(), own);
            const radius = Math.trunc(this.#characterCollisionRadius(data));
            if (!(radius > 0)) return false;
            this.#hitbox = radius;
            return true;
        } catch {
            return false;
        }
    }

    #issueMove(x, y) {
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
        } catch {
            return false;
        }
    }

    #issueStop() {
        try {
            const logic = scanData.battleModeClient;
            if (!logic || logic.isNull()) return false;
            return sendCommand(moveInputType, (ci) => {
                ci.add(offsets.ClientInput_x).writeS32(scanData.myX);
                ci.add(offsets.ClientInput_y).writeS32(scanData.myY);
            });
        } catch {
            return false;
        }
    }

    update() {
        if (scanData.lastUpdate === 0) return;
        const now = Date.now();
        if (!this.#learnOwnHitbox()) {
            const fb = Math.trunc(scanData.myRadius);
            if (fb > 0) this.#hitbox = fb;
        }
        const d = this.#core.tick({
            now,
            x: scanData.myX,
            y: scanData.myY,
            speed: Math.trunc(scanData.mySpeed),
            radius: Math.trunc(this.#hitbox),
            projectiles: scanData.projectiles,
            walls: this.#wallsApi
        });
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
        this.#stopSent = false;
    }

    setup() {
        try {
            enableProjectileTracking();
            onDataReload(() => this.#invalidateOwnMetrics());
        } catch {}
    }
}

const autoDodge = new AutoDodge();

export const updateAutoDodge = () => autoDodge.update();
export const resetAutoDodge = () => autoDodge.reset();
export const setupAutoDodge = () => autoDodge.setup();
