import { sendCommand } from "../core/Commands";
import { getFunctions } from "../core/Functions";
import { OFFSETS } from "../core/Offsets";
import {
    collisionRadius,
    enableProjectileTracking,
    onDataReload,
    type ProjectileOutput,
    scanData,
} from "../core/Scan";
import { firstWallHit, MOVEMENT_BIT, rayHitDistance, type WallsApi } from "../utils/Walls";

const MOVE_INPUT_TYPE = 2;
const DEG2RAD = Math.PI / 180;

const ANCHOR_RUN = 520;
const ANCHOR_ARRIVE = 150;
const SEND_MIN_MS = 130;
const SEND_MIN_SHIFT = 90;

interface TuneOptions {
    dirCount: number;
    horizonS: number;
    aware: number;
    skin: number;
    wallPenalty: number;
    momentum: number;
}

const TUNE: TuneOptions = {
    dirCount: 64,
    horizonS: 1.2,
    aware: 3600,
    skin: 60,
    wallPenalty: 1500,
    momentum: 110,
};

const RING: number[] = [];
for (let i = 0; i < TUNE.dirCount; i++) RING.push(Math.round((360 * i) / TUNE.dirCount));

const wrap360 = (a: number): number => {
    const r = a % 360;
    return r < 0 ? r + 360 : r;
};

const angDiff = (a: number, b: number): number => {
    const d = Math.abs(wrap360(a) - wrap360(b));
    return d > 180 ? 360 - d : d;
};

const bearingDeg = (dx: number, dy: number): number =>
    wrap360((Math.atan2(dy, dx) * 180) / Math.PI);

interface StepPoint {
    x: number;
    y: number;
}

interface VelocityPoint {
    vx: number;
    vy: number;
}

interface StickyHazard {
    kind: "sticky";
    x: number;
    y: number;
    r: number;
    fuse: number;
    gid: string;
}

interface ZoneHazard {
    kind: "zone";
    x: number;
    y: number;
    r: number;
    fuse: number;
    approach: number;
    gid: string;
}

interface ConeHazard {
    kind: "cone";
    key: string;
    ax: number;
    ay: number;
    bis: number;
    half: number;
    range: number;
    speed: number;
    seg: number;
    gid: string;
}

interface LinearHazard {
    kind: "linear";
    x: number;
    y: number;
    vx: number;
    vy: number;
    hitR: number;
    left: number;
    gid: string;
}

type Hazard = StickyHazard | ZoneHazard | ConeHazard | LinearHazard;

type PointHazard = StickyHazard | ZoneHazard | LinearHazard;

interface ZoneSnapshot {
    x: number;
    y: number;
    r: number;
    sticky: boolean;
    fuseMs: number;
}

interface ZoneMemo {
    x: number;
    y: number;
    r: number;
    until: number;
    fuseMs: number;
}

interface Assessment {
    danger: boolean;
    prepMs: number;
    tMin?: number;
}

interface HeadingCandidate {
    deg: number;
    sep: number;
}

interface HeadingPick {
    deg: number;
    score: number;
}

interface RetreatPoint {
    hx: number;
    hy: number;
}

interface DodgeCommand {
    headingDeg: number;
    anchorX: number;
    anchorY: number;
    tx: number;
    ty: number;
    sentX: number;
    sentY: number;
    startedAt: number;
    lastDangerAt: number;
    lastCheckAt: number;
    lastSendAt: number;
}

interface DodgeWorld {
    now: number;
    x: number;
    y: number;
    speed: number;
    radius: number;
    projectiles: ProjectileOutput[];
    walls: WallsApi;
}

interface DodgeIdleResult {
    active: false;
}

interface DodgeRunResult {
    active: true;
    started?: boolean;
    targetX: number;
    targetY: number;
    headingDeg: number;
    send: boolean;
}

type DodgeResult = DodgeIdleResult | DodgeRunResult;

class DodgeCore {
    #walls: WallsApi | null = null;
    #world: Pick<DodgeWorld, "projectiles"> = { projectiles: [] };
    #myR = 60;
    #myX = 0;
    #myY = 0;
    #speed = 0;
    #now = 0;
    #cmd: DodgeCommand | null = null;
    #curDeg = NaN;
    #zoneMem = new Map<string, ZoneMemo>();
    #lastZones = new Map<string, ZoneSnapshot>();

    #dist(ax: number, ay: number, bx: number, by: number): number {
        return Math.hypot(bx - ax, by - ay);
    }

    #classify(p: ProjectileOutput): "sticky" | "zone" | "cone" | "linear" {
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

    #blastRadius(p: ProjectileOutput): number {
        const r = Math.trunc(p.radius) > 0 ? Math.trunc(p.radius) : 110;
        return r >= 110 ? r * 1.02 : 110 * 1.15;
    }

    #linearVelocity(p: ProjectileOutput): VelocityPoint | null {
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

    #stickyHazard(p: ProjectileOutput): StickyHazard {
        const r = this.#blastRadius(p);
        const flightS = Math.trunc(p.seg0) > 0 && Math.trunc(p.speed) > 0 ? p.seg0 / p.speed : 0;
        const fuseS = Math.max(
            0.4,
            Math.trunc(p.triggerMs) / 1000 - Math.max(0, Math.trunc(p.ageMs) / 1000 - flightS),
        );
        this.#lastZones.set(p.gid, {
            x: p.x,
            y: p.y,
            r,
            sticky: true,
            fuseMs: fuseS * 1000,
        });
        return { kind: "sticky", x: p.x, y: p.y, r, fuse: fuseS, gid: p.gid };
    }

    #zoneLanding(p: ProjectileOutput): StepPoint {
        const dx = p.targetX - p.x;
        const dy = p.targetY - p.y;
        const dd = Math.hypot(dx, dy);
        const k = dd > 1 ? Math.min(1, p.seg / dd) : 1;
        return { x: p.x + dx * k, y: p.y + dy * k };
    }

    #zoneDrift(p: ProjectileOutput): StepPoint | null {
        const v = this.#linearVelocity(p);
        const spd = v ? Math.hypot(v.vx, v.vy) : 0;
        if (!(spd > 1)) return null;
        const k = Math.min(1, p.seg / spd);
        return { x: p.x + v!.vx * k, y: p.y + v!.vy * k };
    }

    #zoneHazard(p: ProjectileOutput): ZoneHazard {
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

    #coneKey(p: ProjectileOutput): string {
        return `${p.ownerIndex}:${Math.trunc(p.spawnX)}:${Math.trunc(p.spawnY)}`;
    }

    #coneReach(p: ProjectileOutput): number {
        const flownFromApex = this.#dist(p.spawnX, p.spawnY, p.x, p.y);
        if (Math.trunc(p.seg) > 0) return flownFromApex + p.seg;
        if (Math.trunc(p.seg0) > 0) return p.seg0 + 60;
        return Math.min(TUNE.aware, this.#dist(p.spawnX, p.spawnY, this.#myX, this.#myY) + 400);
    }

    #coneHazard(p: ProjectileOutput, list: Hazard[]): void {
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
        const observedSpeed = Math.hypot(p.vx, p.vy);
        list.push({
            kind: "cone",
            key,
            ax: p.spawnX,
            ay: p.spawnY,
            bis: bearingDeg(this.#myX - p.spawnX, this.#myY - p.spawnY),
            half: half * DEG2RAD,
            range: this.#coneReach(p),
            speed: Math.max(1, observedSpeed > 1 ? observedSpeed : Math.trunc(p.speed)),
            seg: Math.trunc(p.seg) > 0 ? p.seg : -1,
            gid: p.gid,
        });
    }

    #pathHazard(p: ProjectileOutput): ZoneHazard | LinearHazard {
        const v = this.#linearVelocity(p);
        const stun = Math.trunc(p.stunMs) > 0 || Math.trunc(p.silenceMs) > 0;
        const hitR = Math.trunc(p.radius) + this.#myR + (stun ? 70 : 0);
        if (!v) {
            return {
                kind: "zone",
                x: p.x,
                y: p.y,
                r: Math.max(hitR + TUNE.skin, 110),
                fuse: 0,
                approach: 0,
                gid: p.gid,
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
            gid: p.gid,
        };
    }

    #collectShots(seen: Set<string>): Hazard[] {
        const list: Hazard[] = [];
        const shots = this.#world.projectiles || [];
        for (const p of shots) {
            if (!p || !p.gid) continue;
            if (this.#dist(p.x, p.y, this.#myX, this.#myY) > TUNE.aware) continue;
            seen.add(p.gid);
            const kind = this.#classify(p);
            if (kind === "sticky") list.push(this.#stickyHazard(p));
            else if (kind === "zone") list.push(this.#zoneHazard(p));
            else if (kind === "cone" && Math.trunc(p.volleySpread) > 0) this.#coneHazard(p, list);
            else list.push(this.#pathHazard(p));
        }
        return list;
    }

    #forgetZones(seen: Set<string>): void {
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
                fuseMs: z.sticky ? Math.max(0, z.fuseMs || 0) : 0,
            });
        }
    }

    #memoHazards(): Hazard[] {
        const list: Hazard[] = [];
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
                    gid,
                });
            } else {
                if (this.#dist(z.x, z.y, this.#myX, this.#myY) > z.r + this.#myR + TUNE.skin)
                    continue;
                list.push({ kind: "zone", x: z.x, y: z.y, r: z.r, fuse: 0, approach: 0, gid });
            }
        }
        return list;
    }

    #collectHazards(): Hazard[] {
        const seen = new Set<string>();
        const list = this.#collectShots(seen);
        this.#forgetZones(seen);
        for (const h of this.#memoHazards()) list.push(h);
        return list;
    }

    #linearTimeToHurt(h: LinearHazard): number {
        const spd = Math.hypot(h.vx, h.vy);
        if (!(spd > 1)) return this.#dist(h.x, h.y, this.#myX, this.#myY) <= h.hitR ? 0 : Infinity;
        const closing = (this.#myX - h.x) * h.vx + (this.#myY - h.y) * h.vy;
        if (closing <= 0) return Infinity;
        const gap = this.#dist(h.x, h.y, this.#myX, this.#myY) - h.hitR;
        const t = gap > 0 ? gap / spd : 0;
        if (h.left > 0 && t * spd > h.left + 1) return Infinity;
        return t;
    }

    #coneTimeToHurt(h: ConeHazard): number {
        const d = this.#dist(h.ax, h.ay, this.#myX, this.#myY);
        if (d > h.range) return Infinity;
        if (angDiff(bearingDeg(this.#myX - h.ax, this.#myY - h.ay), h.bis) > h.half + 1e-6)
            return Infinity;
        if (h.seg > 0) return h.seg / Math.max(1, h.speed);
        return d / Math.max(1, h.speed);
    }

    #stickyTimeToHurt(h: StickyHazard): number {
        const d = this.#dist(h.x, h.y, this.#myX, this.#myY);
        if (d <= h.r + 20) return 0;
        return h.fuse;
    }

    #timeToHurt(h: Hazard): number {
        if (h.kind === "linear") return this.#linearTimeToHurt(h);
        if (h.kind === "cone") return this.#coneTimeToHurt(h);
        if (h.kind === "sticky") return this.#stickyTimeToHurt(h);
        return Math.max(h.approach, 0) + h.fuse;
    }

    #clearanceNeed(h: Hazard): number {
        if (h.kind === "linear") return h.hitR + TUNE.skin;
        if (h.kind === "cone") {
            const d = this.#dist(h.ax, h.ay, this.#myX, this.#myY);
            const lateral = d * Math.sin(h.half);
            const radial = Math.max(0, h.range - d);
            return Math.min(lateral, radial) + TUNE.skin;
        }
        const d = this.#dist(h.x, h.y, this.#myX, this.#myY);
        return Math.max(60, h.r + TUNE.skin - d);
    }

    #assess(hazards: Hazard[]): Assessment {
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

    #wallRoom(deg: number): number {
        const rad = deg * DEG2RAD;
        const ex = this.#myX + Math.cos(rad) * 1000;
        const ey = this.#myY + Math.sin(rad) * 1000;
        let hit = this.#walls!.firstWallHit(this.#myX, this.#myY, ex, ey, this.#myR > 200 ? 2 : 1);
        if (hit < 0) {
            hit = this.#walls!.rayHitDistance(this.#myX, this.#myY, ex, ey, {
                radius: this.#myR,
                bit: this.#walls!.movementBit,
            });
        }
        if (hit < 0) return 1000;
        if (hit >= 1000) return 1000;
        return Math.max(0, hit - this.#myR - 40);
    }

    #anchor(deg: number): StepPoint | null {
        const room = this.#wallRoom(deg);
        if (room <= 240) return null;
        const run = Math.min(room - 40, ANCHOR_RUN);
        const rad = deg * DEG2RAD;
        return { x: this.#myX + Math.cos(rad) * run, y: this.#myY + Math.sin(rad) * run };
    }

    #placeAnchor(cmd: DodgeCommand): void {
        this.#curDeg = this.#slewDeg(cmd.headingDeg);
        const room = this.#wallRoom(this.#curDeg);
        const run = Math.max(180, Math.min(room - 40, ANCHOR_RUN));
        const rad = this.#curDeg * DEG2RAD;
        cmd.anchorX = this.#myX + Math.cos(rad) * run;
        cmd.anchorY = this.#myY + Math.sin(rad) * run;
        cmd.tx = cmd.anchorX;
        cmd.ty = cmd.anchorY;
    }

    #shouldSend(cmd: DodgeCommand): boolean {
        const shift = this.#dist(cmd.tx, cmd.ty, cmd.sentX, cmd.sentY);
        if (shift < SEND_MIN_SHIFT && this.#now - cmd.lastSendAt < SEND_MIN_MS) return false;
        cmd.lastSendAt = this.#now;
        cmd.sentX = cmd.tx;
        cmd.sentY = cmd.ty;
        return true;
    }

    #wedgeSep(h: ConeHazard, px: number, py: number): number {
        const dx = px - h.ax;
        const dy = py - h.ay;
        const d = Math.hypot(dx, dy);
        if (d < 1) return -h.range * 0.3;
        const a = angDiff(bearingDeg(dx, dy), h.bis);
        if (a <= h.half + 1e-6) {
            if (d > h.range) return d - h.range;
            return -(h.range - d) * 0.3;
        }
        return d * Math.sin((a - h.half) * DEG2RAD);
    }

    #sepPointMin(hazard: PointHazard, wx: number, wy: number, tMax: number): number {
        const hr = hazard.kind === "linear" ? hazard.hitR : hazard.r;
        const rx = this.#myX - hazard.x;
        const ry = this.#myY - hazard.y;
        const w2 = wx * wx + wy * wy;
        let t = 0;
        if (w2 > 1e-6) {
            const tStar = -(rx * wx + ry * wy) / w2;
            t = Math.min(Math.max(tStar, 0), tMax);
        }
        return Math.hypot(rx + wx * t, ry + wy * t) - hr;
    }

    #linearSep(hazard: LinearHazard, vx: number, vy: number): number {
        const spd = Math.hypot(hazard.vx, hazard.vy);
        let tMax = TUNE.horizonS;
        if (hazard.left > 0 && spd > 1) tMax = Math.min(tMax, hazard.left / spd);
        return this.#sepPointMin(hazard, vx - hazard.vx, vy - hazard.vy, tMax);
    }

    #coneSep(hazard: ConeHazard, vx: number, vy: number): number {
        let sep = 420;
        for (let s = 1; s <= 8; s++) {
            const t = TUNE.horizonS * (s / 8) * (s / 8);
            const d = this.#wedgeSep(hazard, this.#myX + vx * t, this.#myY + vy * t);
            if (d < sep) sep = d;
            if (sep <= -200) break;
        }
        return sep;
    }

    #separationScore(hazards: Hazard[], deg: number): number {
        const rad = deg * DEG2RAD;
        const vx = Math.cos(rad) * this.#speed;
        const vy = Math.sin(rad) * this.#speed;
        let total = 0;
        for (const hazard of hazards) {
            let sep: number;
            if (hazard.kind === "linear") sep = this.#linearSep(hazard, vx, vy);
            else if (hazard.kind === "cone") sep = this.#coneSep(hazard, vx, vy);
            else sep = this.#sepPointMin(hazard, vx, vy, TUNE.horizonS);
            if (sep < -200) sep = -200;
            else if (sep > 420) sep = 420;
            total += sep;
            if (total <= -600) return total;
        }
        return total;
    }

    #headingScore(cand: HeadingCandidate, room: number, refDeg: number | null): number {
        let score = cand.sep - (TUNE.wallPenalty * Math.max(0, 1000 - room)) / 1000;
        if (refDeg != null) score -= (TUNE.momentum * angDiff(cand.deg, refDeg)) / 180;
        return score;
    }

    #bestHeading(hazards: Hazard[], refDeg: number | null): HeadingPick | null {
        const cands: HeadingCandidate[] = [];
        for (const deg of RING) {
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

    #retreatHeading(hazards: Hazard[]): number {
        let near: RetreatPoint | null = null;
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

    #scoreOf(hazards: Hazard[], deg: number, refDeg: number | null): number {
        const room = this.#wallRoom(deg);
        if (room <= 240) return -Infinity;
        let score = this.#separationScore(hazards, deg);
        score -= (TUNE.wallPenalty * Math.max(0, 1000 - room)) / 1000;
        if (refDeg != null) score -= (TUNE.momentum * angDiff(deg, refDeg)) / 180;
        return score;
    }

    #snapHeading(away: number): number {
        let best = RING[0];
        for (const deg of RING) {
            if (angDiff(deg, away) < angDiff(best, away)) best = deg;
        }
        return best;
    }

    #stepBlocked(step: StepPoint): boolean {
        return (
            this.#walls!.rayHitDistance(this.#myX, this.#myY, step.x, step.y, {
                radius: this.#myR,
                bit: this.#walls!.movementBit,
            }) >= 0
        );
    }

    #lastResortHeading(hazards: Hazard[]): number {
        let bestDeg = -1;
        let bestScore = -Infinity;
        for (const element of RING) {
            const room = this.#wallRoom(element);
            if (room <= 240) continue;
            const score =
                this.#separationScore(hazards, element) -
                (TUNE.wallPenalty * Math.max(0, 1000 - room)) / 1000;
            if (score > bestScore) {
                bestScore = score;
                bestDeg = element;
            }
        }
        return bestDeg;
    }

    #engage(hazards: Hazard[]): DodgeResult {
        const now = this.#now;
        this.#curDeg = NaN;
        let deg: number | null = null;
        let anchor: StepPoint | null = null;
        const picked = this.#bestHeading(hazards, null);
        if (picked) anchor = this.#anchor(picked.deg);
        if (picked && anchor) deg = picked.deg;
        if (deg === null) {
            const snapped = this.#snapHeading(this.#retreatHeading(hazards));
            anchor = this.#anchor(snapped);
            if (anchor) deg = snapped;
        }
        if (deg === null) {
            deg = this.#lastResortHeading(hazards);
            if (deg >= 0) anchor = this.#anchor(deg);
            else deg = null;
        }
        if (deg === null || !anchor) return { active: false };
        this.#curDeg = NaN;
        const cmd: DodgeCommand = {
            headingDeg: deg,
            anchorX: anchor.x,
            anchorY: anchor.y,
            tx: anchor.x,
            ty: anchor.y,
            sentX: anchor.x,
            sentY: anchor.y,
            startedAt: now,
            lastDangerAt: now,
            lastCheckAt: now,
            lastSendAt: now,
        };
        this.#cmd = cmd;
        return {
            active: true,
            started: true,
            targetX: cmd.tx,
            targetY: cmd.ty,
            headingDeg: deg,
            send: true,
        };
    }

    #revalidate(cmd: DodgeCommand, hazards: Hazard[]): void {
        if (this.#now - cmd.lastCheckAt < 200) return;
        cmd.lastCheckAt = this.#now;
        const cur = this.#scoreOf(hazards, cmd.headingDeg, cmd.headingDeg);
        const alt = this.#bestHeading(hazards, cmd.headingDeg);
        if (!alt || alt.deg === cmd.headingDeg) return;
        if (!(cur < -30) || alt.score <= cur + 420) return;
        cmd.headingDeg = alt.deg;
    }

    #releaseCheck(cmd: DodgeCommand, danger: boolean): boolean {
        if (danger) return false;
        if (this.#now - cmd.lastDangerAt <= 170) return false;
        if (this.#now - cmd.startedAt <= 260) return false;
        this.#release();
        return true;
    }

    #release(): void {
        this.#cmd = null;
        this.#curDeg = NaN;
    }

    #clear(): DodgeResult {
        this.#release();
        return { active: false };
    }

    #slewDeg(deg: number): number {
        if (!isFinite(this.#curDeg)) return deg;
        const diff = wrap360(deg - this.#curDeg);
        const delta = diff > 180 ? diff - 360 : diff;
        if (delta > 16) return wrap360(this.#curDeg + 16);
        if (delta < -16) return wrap360(this.#curDeg - 16);
        return wrap360(deg);
    }

    #hold(hazards: Hazard[], danger: boolean): DodgeResult {
        const cmd = this.#cmd!;
        if (danger) cmd.lastDangerAt = this.#now;
        this.#revalidate(cmd, hazards);
        if (this.#releaseCheck(cmd, danger)) return { active: false };
        const before = isFinite(this.#curDeg) ? wrap360(this.#curDeg) : NaN;
        const want = wrap360(this.#slewDeg(cmd.headingDeg));
        const arrived = this.#dist(this.#myX, this.#myY, cmd.anchorX, cmd.anchorY) < ANCHOR_ARRIVE;
        if (want !== before || arrived) this.#placeAnchor(cmd);
        if (this.#stepBlocked({ x: cmd.anchorX, y: cmd.anchorY })) {
            const repick = this.#engage(hazards);
            if (!repick.active) {
                this.#release();
                return { active: false };
            }
            return repick;
        }
        return {
            active: true,
            targetX: cmd.tx,
            targetY: cmd.ty,
            headingDeg: cmd.headingDeg,
            send: this.#shouldSend(cmd),
        };
    }

    tick(world: DodgeWorld): DodgeResult {
        this.#walls = world.walls;
        this.#world = world;
        this.#now = world.now;
        this.#myX = world.x;
        this.#myY = world.y;
        if (!isFinite(this.#myX) || !isFinite(this.#myY)) return this.#clear();
        this.#speed = Math.trunc(world.speed);
        if (!(this.#speed > 0)) return this.#clear();
        this.#myR = world.radius > 0 ? world.radius : this.#myR;
        const hazards = this.#collectHazards();
        const { danger } = this.#assess(hazards);
        if (this.#cmd) return this.#hold(hazards, danger);
        if (!danger) return { active: false };
        return this.#engage(hazards);
    }

    reset(): void {
        this.#cmd = null;
        this.#curDeg = NaN;
        this.#zoneMem.clear();
        this.#lastZones.clear();
        this.#world = { projectiles: [] };
    }
}

class AutoDodge {
    #hitbox = 0;
    #radiusMemoData: NativePointer | null = null;
    #radiusMemoValue = 0;
    #wallsApi: WallsApi = { firstWallHit, rayHitDistance, movementBit: MOVEMENT_BIT };

    #core = new DodgeCore();

    #characterCollisionRadius(data: NativePointer): number {
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

    #learnOwnHitbox(): boolean {
        try {
            const own = scanData.ownCharacter;
            if (!own || own.isNull()) return false;
            const data = getFunctions().LogicGameObjectClient_getData(own);
            const radius = Math.trunc(this.#characterCollisionRadius(data));
            if (!(radius > 0)) return false;
            this.#hitbox = radius;
            return true;
        } catch {
            return false;
        }
    }

    #moveCommand(x: number, y: number): boolean {
        return sendCommand(MOVE_INPUT_TYPE, (ci) => {
            ci.add(OFFSETS.ClientInput_x).writeS32(x);
            ci.add(OFFSETS.ClientInput_y).writeS32(y);
        });
    }

    #issueMove(x: number, y: number): boolean {
        try {
            const logic = scanData.battleModeClient;
            if (!logic || logic.isNull()) return false;
            getFunctions().LogicBattleModeClient_setClientPredictionMoveTo(logic, x, y, 1);
            return this.#moveCommand(x, y);
        } catch {
            return false;
        }
    }

    update(): void {
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
            walls: this.#wallsApi,
        });
        if (!d.active) return;
        if (d.send && isFinite(d.targetX) && isFinite(d.targetY))
            this.#issueMove(d.targetX, d.targetY);
    }

    #invalidateOwnMetrics(): void {
        this.#hitbox = 0;
        this.#radiusMemoData = null;
        this.#radiusMemoValue = 0;
    }

    reset(): void {
        this.#core.reset();
        this.#invalidateOwnMetrics();
    }

    setup(): void {
        try {
            enableProjectileTracking();
            onDataReload(() => this.#invalidateOwnMetrics());
        } catch {}
    }
}

const autoDodge = new AutoDodge();

export const updateAutoDodge = (): void => autoDodge.update();
export const resetAutoDodge = (): void => autoDodge.reset();
export const setupAutoDodge = (): void => autoDodge.setup();
