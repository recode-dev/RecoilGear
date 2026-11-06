import { sendCommand } from "../core/Commands";
import { attachOffset, getBase, getFunctions } from "../core/Functions";
import { OFFSETS } from "../core/Offsets";
import {
    collisionRadius,
    enableProjectileTracking,
    onDataReload,
    type ProjectileOutput,
    scanData,
} from "../core/Scan";
import { MOVEMENT_BIT, PROJECTILE_BIT, rayHitDistance } from "../utils/Walls";

const MOVE_INPUT_TYPE = 2;

const CFG = {
    SAFETY_MARGIN: 60,
    MOVING_EXTRA_MARGIN: 20,
    T_URGENT_MIN: 0.42,
    T_URGENT_MAX: 0.78,
    T_FIELD: 1.05,
    T_RELEASE: 0.2,
    MIN_CLEARANCE: 70,
    DODGE_COMMIT_MS: 110,
    DODGE_DWELL_MS: 240,
    SWITCH_MARGIN: 1.25,
    URGENT_MARGIN: 0.6,
    BREAK_WINDOW_S: 0.1,
    N_DIRECTIONS: 8,
    STEP_SIZE: 150,
    MAX_SEARCH_DIST: 1500,
    ARRIVAL_THRESHOLD: 42,
    REANCHOR_DIST: 150,
    STALE_MS: 300,
    PERP_WEIGHT: 1.8,
    AWAY_WEIGHT: 2.2,
    INTENT_WEIGHT: 1,
    CHAR_SPEED: 720,
    LAG_COMPENSATION_S: 0.03,
    DODGE_RANGE: 900,
    URGENT_CACHE_MS: 16,
    URGENT_FAST_SPEED: 1800,
    URGENT_FAST_BONUS: 0.25,
    HOLD_AFTER_CLEAR_MS: 150,
    VOLLEY_WINDOW_MS: 200,
    SPAWN_BUCKET: 128,
    COMBAT_RANGE: 2700,
    SEND_MIN_SHIFT: 80,
    HOT_SHIFT: 20,
    WALK_OUT: 750,
    MIN_REACH: 300,
    INTENT_STALE_MS: 500,
    INTENT_MIN_DIST: 80,
    INTENT_REVERSE_DOT: -0.3,
    INTENT_SAFE_T: 0.5,
    INTENT_AHEAD: 180,
    INTENT_MIN_LAT: 0.5,
    STRAFE_MIN_OPEN: 0.35,
    COMMIT_MIN_OPEN: 0.5,
    STOPPED_V: 80,
    HOT_OPEN: 0.71,
    ESC_BREAK_WINDOW: 0.45,
    ENEMY_TRACK_STALE_MS: 1000,
} as const;

interface Vec {
    x: number;
    y: number;
}

interface ThreatMemory {
    gid: string;
    ownerIndex: number;
    spawnSlot: number;
    spawnX: number;
    spawnY: number;
    x: number;
    y: number;
    dirX: number;
    dirY: number;
    speed: number;
    radius: number;
    impactRadius: number;
    range: number;
    lastSeen: number;
    ignored: boolean;
}

interface Threat extends ThreatMemory {
    svx: number;
    svy: number;
    dx: number;
    dy: number;
    rNoMove: number;
    clipDist: number;
    clipBlocked: boolean;
}

interface SafePoint {
    x: number;
    y: number;
    dist: number;
    clearance: number;
}

interface DodgeWorld {
    now: number;
    x: number;
    y: number;
    speed: number;
    radius: number;
    projectiles: ProjectileOutput[];
    enemies: { x: number; y: number }[];
    intent: Vec;
}

interface DodgeIdleResult {
    active: false;
}

interface DodgeRunResult {
    active: true;
    targetX: number;
    targetY: number;
    send: boolean;
    hot: boolean;
}

type DodgeResult = DodgeIdleResult | DodgeRunResult;

const ZERO: Vec = { x: 0, y: 0 };

const RING: Vec[] = [];
for (let i = 0; i < CFG.N_DIRECTIONS; i++) {
    const a = (Math.PI * 2 * i) / CFG.N_DIRECTIONS;
    RING.push({ x: Math.cos(a), y: Math.sin(a) });
}

const snapDir = (v: Vec): Vec => {
    const step = Math.PI / 4;
    const a = Math.round(Math.atan2(v.y, v.x) / step) * step;
    return { x: Math.cos(a), y: Math.sin(a) };
};

const normalize2d = (x: number, y: number): Vec => {
    const n = Math.sqrt(x * x + y * y);
    return n < 1e-6 ? { x: 1, y: 0 } : { x: x / n, y: y / n };
};

const distSqPointToSegment = (
    px: number,
    py: number,
    ax: number,
    ay: number,
    bx: number,
    by: number,
): number => {
    const abx = bx - ax;
    const aby = by - ay;
    const len = abx * abx + aby * aby;
    if (len < 1e-10) {
        const dx = px - ax;
        const dy = py - ay;
        return dx * dx + dy * dy;
    }
    let t = ((px - ax) * abx + (py - ay) * aby) / len;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy;
};

class DodgeCore {
    #mem = new Map<string, ThreatMemory>();
    #threats: Threat[] = [];
    #enemyTrack = new Map<string, { x: number; y: number; t: number; v: number }>();
    #maxSpeed = 0;
    #charSpeed: number = CFG.CHAR_SPEED;

    #commit: Vec | null = null;
    #commitUntil = 0;
    #commitAt = 0;
    #clearSince = 0;
    #safeX = 0;
    #safeY = 0;
    #lastDir: Vec | null = null;

    #urgentValue = 0;
    #urgentAt = 0;

    #impactRadius(radius: number, speed: number): number {
        if (speed > 0 && speed < 1200 && radius > 0 && radius < 120)
            return Math.min(220, radius * 2.25);
        return radius || 8;
    }

    #ignored(p: ProjectileOutput): boolean {
        return !!p.isIndirect;
    }

    #track(list: ProjectileOutput[], now: number): void {
        for (const p of list) {
            if (!p.gid) continue;
            let dir: Vec | null = null;
            const v = Math.hypot(p.vx, p.vy);
            if (v > 1) {
                dir = { x: p.vx / v, y: p.vy / v };
            } else if (p.hasTarget) {
                const dx = p.targetX - p.x;
                const dy = p.targetY - p.y;
                const d = Math.hypot(dx, dy);
                if (d > 1) dir = { x: dx / d, y: dy / d };
            }
            if (!dir) {
                const dx = p.x - p.spawnX;
                const dy = p.y - p.spawnY;
                const d = Math.hypot(dx, dy);
                if (d > 5) dir = { x: dx / d, y: dy / d };
            }
            const speed = Math.max(100, Math.trunc(p.speed) || 1200);
            const radius = Math.max(1, Math.trunc(p.radius) || 8);
            const range = Math.trunc(p.seg) > 0 ? Math.trunc(p.seg) : 9000;
            const mem = this.#mem.get(p.gid);
            if (mem) {
                if (dir) {
                    mem.dirX = dir.x;
                    mem.dirY = dir.y;
                }
                mem.speed = speed;
                mem.radius = radius;
                mem.impactRadius = Math.max(radius, this.#impactRadius(radius, speed));
                mem.range = range;
                mem.x = p.x;
                mem.y = p.y;
                mem.lastSeen = now;
                continue;
            }
            if (!dir) continue;
            this.#mem.set(p.gid, {
                gid: p.gid,
                ownerIndex: Math.trunc(p.ownerIndex),
                spawnSlot: Math.floor(
                    (now - Math.max(0, Math.trunc(p.ageMs))) / CFG.VOLLEY_WINDOW_MS,
                ),
                spawnX: p.spawnX,
                spawnY: p.spawnY,
                x: p.x,
                y: p.y,
                dirX: dir.x,
                dirY: dir.y,
                speed,
                radius,
                impactRadius: Math.max(radius, this.#impactRadius(radius, speed)),
                range,
                lastSeen: now,
                ignored: this.#ignored(p),
            });
        }
        for (const [gid, mem] of this.#mem) {
            if (now - mem.lastSeen > CFG.STALE_MS) this.#mem.delete(gid);
        }
    }

    #clipPath(mem: ThreatMemory): { dist: number; blocked: boolean } {
        const len = Math.min(Math.max(600, mem.speed * 1.5), 6000);
        const hit = rayHitDistance(mem.x, mem.y, mem.x + mem.dirX * len, mem.y + mem.dirY * len, {
            bit: PROJECTILE_BIT,
            radius: 0,
        });
        if (!(hit >= 0)) return { dist: Infinity, blocked: false };
        return { dist: hit, blocked: true };
    }

    #choose(x: number, y: number, myR: number): void {
        this.#threats.length = 0;
        this.#maxSpeed = 0;
        const base = myR + CFG.SAFETY_MARGIN;
        for (const mem of this.#mem.values()) {
            if (mem.ignored) continue;
            if (mem.speed > this.#maxSpeed) this.#maxSpeed = mem.speed;
            const clip = this.#clipPath(mem);
            this.#threats.push({
                ...mem,
                svx: mem.dirX * mem.speed,
                svy: mem.dirY * mem.speed,
                dx: mem.x - x,
                dy: mem.y - y,
                rNoMove: base + (mem.impactRadius || mem.radius),
                clipDist: clip.dist,
                clipBlocked: clip.blocked,
            });
        }
    }

    #perform(threat: Threat, px: number, py: number, myR: number, dir: Vec, tMax: number): number {
        if (threat.ignored) return -1;
        const vx = dir.x * this.#charSpeed;
        const vy = dir.y * this.#charSpeed;
        const moving = dir.x !== 0 || dir.y !== 0;
        const reach =
            myR +
            (threat.impactRadius || threat.radius) +
            CFG.SAFETY_MARGIN +
            (moving ? CFG.MOVING_EXTRA_MARGIN : 0);
        const tx = threat.x + threat.svx * CFG.LAG_COMPENSATION_S;
        const ty = threat.y + threat.svy * CFG.LAG_COMPENSATION_S;
        const gx = tx - px;
        const gy = ty - py;
        if (gx * gx + gy * gy <= reach * reach) return 0;
        const rx = threat.svx - vx;
        const ry = threat.svy - vy;
        const a = rx * rx + ry * ry;
        if (a < 1e-6) return -1;
        const b = 2 * (gx * rx + gy * ry);
        const c = gx * gx + gy * gy - reach * reach;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return -1;
        const root = Math.sqrt(disc);
        const t0 = (-b - root) / (2 * a);
        if ((-b + root) / (2 * a) < 0) return -1;
        if (t0 < 0 && b > 0) return -1;
        const t = t0 >= 0 ? t0 : 0;
        if (t > tMax) return -1;
        if (
            threat.clipBlocked &&
            isFinite(threat.clipDist) &&
            threat.speed * (t + CFG.LAG_COMPENSATION_S) >
                threat.clipDist + (threat.impactRadius || threat.radius)
        )
            return -1;
        return t;
    }

    #expire(px: number, py: number, myR: number, dir: Vec, tMax: number): number {
        let best = -1;
        for (const threat of this.#threats) {
            const t = this.#perform(threat, px, py, myR, dir, tMax);
            if (t < 0) continue;
            if (best < 0 || t < best) best = t;
        }
        return best;
    }

    #urgent(): number {
        const now = Date.now();
        if (now - this.#urgentAt < CFG.URGENT_CACHE_MS) return this.#urgentValue;
        const n = (Math.max(420, Math.min(900, this.#charSpeed || 720)) - 420) / 480;
        let t = CFG.T_URGENT_MIN + (1 - n) * (CFG.T_URGENT_MAX - CFG.T_URGENT_MIN);
        if (this.#maxSpeed > CFG.URGENT_FAST_SPEED)
            t += Math.min(
                CFG.URGENT_FAST_BONUS,
                ((this.#maxSpeed - CFG.URGENT_FAST_SPEED) / 1080) * CFG.URGENT_FAST_BONUS,
            );
        this.#urgentValue = t;
        this.#urgentAt = now;
        return t;
    }

    #pointThreatened(px: number, py: number, myR: number): boolean {
        for (const threat of this.#threats) {
            if (threat.ignored) continue;
            const field = Math.min(
                CFG.T_FIELD,
                Math.max(0.25, (threat.range || 9000) / Math.max(1, threat.speed)),
            );
            const ex = threat.x + threat.svx * field;
            const ey = threat.y + threat.svy * field;
            const reach = myR + (threat.impactRadius || threat.radius) + CFG.SAFETY_MARGIN;
            if (distSqPointToSegment(px, py, threat.x, threat.y, ex, ey) <= reach * reach)
                return true;
        }
        return false;
    }

    #clearanceAt(px: number, py: number, myR: number): number {
        let best = Infinity;
        for (const threat of this.#threats) {
            if (threat.ignored) continue;
            const field = Math.min(
                CFG.T_FIELD,
                Math.max(0.25, (threat.range || 9000) / Math.max(1, threat.speed)),
            );
            const ex = threat.x + threat.svx * field;
            const ey = threat.y + threat.svy * field;
            const reach = myR + (threat.impactRadius || threat.radius) + CFG.SAFETY_MARGIN;
            const d = Math.sqrt(distSqPointToSegment(px, py, threat.x, threat.y, ex, ey)) - reach;
            if (d < best) best = d;
        }
        return best;
    }

    #collect(dir: Vec, px: number, py: number, myR: number, intent: Vec): number {
        let cost = 0;
        const vx = dir.x * this.#charSpeed;
        const vy = dir.y * this.#charSpeed;
        for (const threat of this.#threats) {
            if (threat.ignored) continue;
            const t = this.#perform(threat, px, py, myR, dir, CFG.T_FIELD);
            if (t >= 0) {
                cost += 4e7 + (CFG.T_FIELD - t) * 4e7;
                if (t <= 0.15) {
                    const away = normalize2d(px - threat.x, py - threat.y);
                    cost += (1 - (dir.x * away.x + dir.y * away.y)) * 5e6;
                }
            }
            const reach = threat.rNoMove;
            const rx = threat.svx - vx;
            const ry = threat.svy - vy;
            const a = rx * rx + ry * ry;
            const b = 2 * (threat.dx * rx + threat.dy * ry);
            const c = threat.dx * threat.dx + threat.dy * threat.dy;
            let near = c;
            if (a > 1e-6) {
                const tc = Math.max(0, Math.min(CFG.T_FIELD, -b / (2 * a)));
                near = c + b * tc + a * tc * tc;
            }
            const sq = reach * reach;
            if (near < sq) {
                cost += 2e7 + (sq - near) * 2e3;
            } else {
                const gap = Math.sqrt(near) - reach;
                if (gap < CFG.MIN_CLEARANCE) {
                    const miss = CFG.MIN_CLEARANCE - gap;
                    cost += (miss * miss * 1e3) / (CFG.MIN_CLEARANCE * CFG.MIN_CLEARANCE);
                }
            }
        }
        if (intent.x !== 0 || intent.y !== 0)
            cost -= (dir.x * intent.x + dir.y * intent.y) * CFG.INTENT_WEIGHT * 500;
        return cost;
    }

    #wallReach(px: number, py: number, myR: number, dir: Vec): number {
        const hit = rayHitDistance(
            px,
            py,
            px + dir.x * CFG.MAX_SEARCH_DIST,
            py + dir.y * CFG.MAX_SEARCH_DIST,
            { bit: MOVEMENT_BIT, radius: myR },
        );
        return hit < 0 ? CFG.MAX_SEARCH_DIST : hit;
    }

    #findSafe(px: number, py: number, myR: number, intent: Vec): SafePoint | null {
        const dirs: Vec[] = [];
        if (intent.x !== 0 || intent.y !== 0) dirs.push(normalize2d(intent.x, intent.y));
        for (const d of RING) dirs.push(d);

        const ranked: { dir: Vec; score: number; reach: number }[] = [];
        for (const dir of dirs) {
            const reach = this.#wallReach(px, py, myR, dir);
            if (reach < CFG.STEP_SIZE) continue;
            const room = Math.min(reach, CFG.WALK_OUT);
            const score = this.#collect(dir, px, py, myR, intent) + (CFG.WALK_OUT - room) * 5;
            ranked.push({ dir, score, reach });
        }
        if (ranked.length === 0) return null;
        ranked.sort((a, b) => a.score - b.score);
        for (const cand of ranked) {
            if (cand.reach < CFG.MIN_REACH && ranked[0].reach >= CFG.MIN_REACH) continue;
            const point = this.#walkOut(px, py, myR, cand.dir, cand.reach);
            if (point) return point;
        }
        return null;
    }

    #walkOut(px: number, py: number, myR: number, dir: Vec, reach: number): SafePoint | null {
        const limit = Math.min(reach, CFG.WALK_OUT);
        let best: SafePoint | null = null;
        for (let step = CFG.STEP_SIZE; step <= limit; step += CFG.STEP_SIZE) {
            const sx = px + dir.x * step;
            const sy = py + dir.y * step;
            if (this.#pointThreatened(sx, sy, myR)) break;
            const clearance = this.#clearanceAt(sx, sy, myR);
            if (clearance < CFG.MIN_CLEARANCE) break;
            best = { x: sx, y: sy, dist: step, clearance };
        }
        return best;
    }

    #groupKey(threat: Threat): string {
        if (threat.ownerIndex >= 0) return `o${threat.ownerIndex}_${threat.spawnSlot}`;
        const bx = Math.round(threat.spawnX / CFG.SPAWN_BUCKET);
        const by = Math.round(threat.spawnY / CFG.SPAWN_BUCKET);
        return `s${bx}_${by}_${threat.spawnSlot}`;
    }

    #parse(px: number, py: number, myR: number, intent: Vec): Vec | null {
        const groups = new Map<string, Threat[]>();
        for (const threat of this.#threats) {
            if (this.#perform(threat, px, py, myR, ZERO, this.#urgent()) < 0) continue;
            const key = this.#groupKey(threat);
            const bucket = groups.get(key);
            if (bucket) bucket.push(threat);
            else groups.set(key, [threat]);
        }
        if (groups.size === 0) return null;
        const dirs: Vec[] = [];
        for (const group of groups.values()) {
            let dx = 0;
            let dy = 0;
            let gx = 0;
            let gy = 0;
            for (const threat of group) {
                dx += threat.dirX;
                dy += threat.dirY;
                gx += threat.x;
                gy += threat.y;
            }
            const n = group.length || 1;
            dx /= n;
            dy /= n;
            gx /= n;
            gy /= n;
            const away = normalize2d(px - gx, py - gy);
            const perpA = normalize2d(-dy, dx);
            const perpB = normalize2d(dy, -dx);
            dirs.push(
                normalize2d(
                    perpA.x * CFG.PERP_WEIGHT + away.x * CFG.AWAY_WEIGHT,
                    perpA.y * CFG.PERP_WEIGHT + away.y * CFG.AWAY_WEIGHT,
                ),
            );
            dirs.push(
                normalize2d(
                    perpB.x * CFG.PERP_WEIGHT + away.x * CFG.AWAY_WEIGHT,
                    perpB.y * CFG.PERP_WEIGHT + away.y * CFG.AWAY_WEIGHT,
                ),
            );
        }
        dirs.push(...RING);
        let best: Vec | null = null;
        let bestCost = Infinity;
        for (const dir of dirs) {
            const cost = this.#collect(dir, px, py, myR, intent);
            if (cost < bestCost) {
                bestCost = cost;
                best = dir;
            }
        }
        return best;
    }

    #escapeDir(
        px: number,
        py: number,
        myR: number,
        intent: Vec,
        enemies: { x: number; y: number }[],
    ): Vec | null {
        let best: Threat | null = null;
        let bestT = Infinity;
        for (const t of this.#threats) {
            const d = Math.hypot(t.x - px, t.y - py) - t.rNoMove;
            const tt = Math.max(0, d) / Math.max(1, t.speed);
            if (tt < bestT) {
                bestT = tt;
                best = t;
            }
        }
        if (!best || bestT > CFG.T_FIELD) return null;
        const nl = Math.hypot(best.svx, best.svy) || 1;
        const ux = best.svx / nl;
        const uy = best.svy / nl;
        const lineSide = (px - best.x) * -uy + (py - best.y) * ux;
        const cands: Vec[] = [snapDir({ x: -uy, y: ux }), snapDir({ x: uy, y: -ux })];
        if (intent.x !== 0 || intent.y !== 0) cands.push(snapDir(intent));
        let pick: Vec | null = null;
        let bestScore = -Infinity;
        const onLine = this.#pointThreatened(px, py, myR);
        for (const dir of cands) {
            if (this.#wallReach(px, py, myR, dir) < CFG.STEP_SIZE) continue;
            let safe = true;
            for (const t of this.#threats) {
                if (this.#perform(t, px, py, myR, dir, CFG.T_FIELD) >= 0) {
                    safe = false;
                    break;
                }
            }
            const latS = dir.x * -uy + dir.y * ux;
            if (!safe && latS * lineSide < 0) continue;
            const lat = Math.abs(latS);
            const flow = -(dir.x * ux + dir.y * uy);
            const align = dir.x * intent.x + dir.y * intent.y;
            const stable = this.#commit ? dir.x * this.#commit.x + dir.y * this.#commit.y : 0;
            const open = this.#openness(px, py, enemies, dir);
            const score = onLine
                ? (safe ? 1e6 : 0) + lat * 5000 + open * 800 + flow * 500
                : (safe ? 1e6 : 0) +
                  lat * 1000 +
                  open * 800 +
                  flow * 500 +
                  align * 400 +
                  stable * 300;
            if (score > bestScore) {
                bestScore = score;
                pick = dir;
            }
        }
        return pick;
    }

    #openness(px: number, py: number, enemies: { x: number; y: number }[], dir: Vec): number {
        let minLat = 1;
        for (const e of enemies) {
            const dx = e.x - px;
            const dy = e.y - py;
            const d = Math.hypot(dx, dy);
            if (d < 1 || d > CFG.COMBAT_RANGE) continue;
            const lat = Math.abs(dir.x * -dy + dir.y * dx) / d;
            if (lat < minLat) minLat = lat;
        }
        return minLat;
    }

    #nearCount(px: number, py: number, enemies: { x: number; y: number }[]): number {
        const r2 = CFG.COMBAT_RANGE * CFG.COMBAT_RANGE;
        let n = 0;
        for (const e of enemies) if ((e.x - px) ** 2 + (e.y - py) ** 2 < r2) n += 1;
        return n;
    }

    #trackEnemies(enemies: { x: number; y: number; gid?: string | null }[], now: number): void {
        const seen = new Set<string>();
        enemies.forEach((e, i) => {
            const key = e.gid && e.gid.length > 0 ? e.gid : `i${i}`;
            seen.add(key);
            const prev = this.#enemyTrack.get(key);
            if (prev) {
                const dt = (now - prev.t) / 1000;
                if (dt > 0.005 && dt < 0.3) prev.v = Math.hypot(e.x - prev.x, e.y - prev.y) / dt;
            } else {
                this.#enemyTrack.set(key, { x: e.x, y: e.y, t: now, v: 0 });
                return;
            }
            prev.x = e.x;
            prev.y = e.y;
            prev.t = now;
        });
        for (const [key, rec] of this.#enemyTrack)
            if (!seen.has(key) || now - rec.t > CFG.ENEMY_TRACK_STALE_MS)
                this.#enemyTrack.delete(key);
    }

    #stoppedNear(px: number, py: number): boolean {
        const r2 = CFG.COMBAT_RANGE * CFG.COMBAT_RANGE;
        for (const rec of this.#enemyTrack.values()) {
            const d = (rec.x - px) ** 2 + (rec.y - py) ** 2;
            if (d < r2 && rec.v < CFG.STOPPED_V) return true;
        }
        return false;
    }

    #followNeed(px: number, py: number, enemies: { x: number; y: number }[]): number {
        let need = CFG.INTENT_MIN_LAT + Math.max(0, this.#nearCount(px, py, enemies) - 1) * 0.15;
        if (this.#stoppedNear(px, py)) need = Math.max(need, CFG.HOT_OPEN);
        return need;
    }

    #intentSafe(
        px: number,
        py: number,
        myR: number,
        dir: Vec,
        enemies: { x: number; y: number }[],
    ): boolean {
        if (this.#wallReach(px, py, myR, dir) < CFG.MIN_REACH) return false;
        if (this.#expire(px, py, myR, dir, CFG.INTENT_SAFE_T) >= 0) return false;
        if (this.#openness(px, py, enemies, dir) < this.#followNeed(px, py, enemies)) return false;
        return (
            this.#clearanceAt(px + dir.x * CFG.INTENT_AHEAD, py + dir.y * CFG.INTENT_AHEAD, myR) >
            10
        );
    }

    #strafeDir(
        px: number,
        py: number,
        myR: number,
        enemies: { x: number; y: number }[],
        intent: Vec,
    ): Vec | null {
        let pick: Vec | null = null;
        let bestScore = -Infinity;
        let away: Vec = ZERO;
        let bd = Infinity;
        for (const e of enemies) {
            const d = (e.x - px) ** 2 + (e.y - py) ** 2;
            if (d < bd) {
                bd = d;
                away = normalize2d(px - e.x, py - e.y);
            }
        }
        for (const dir of RING) {
            if (this.#wallReach(px, py, myR, dir) < CFG.STEP_SIZE) continue;
            const open = this.#openness(px, py, enemies, dir);
            if (open < CFG.STRAFE_MIN_OPEN) continue;
            const align = dir.x * intent.x + dir.y * intent.y;
            const stable = this.#commit ? dir.x * this.#commit.x + dir.y * this.#commit.y : 0;
            const kite = away.x !== 0 || away.y !== 0 ? dir.x * away.x + dir.y * away.y : 0;
            const score = open * 1000 + align * 400 + stable * 300 + kite * 250;
            if (score > bestScore) {
                bestScore = score;
                pick = dir;
            }
        }
        return pick;
    }

    #urgentThreat(dir: Vec, px: number, py: number, myR: number): boolean {
        return this.#expire(px, py, myR, dir, CFG.BREAK_WINDOW_S) >= 0;
    }

    #keepCommitted(
        prev: Vec,
        next: Vec,
        px: number,
        py: number,
        myR: number,
        intent: Vec,
    ): boolean {
        const tMax = this.#urgent();
        const a = this.#expire(px, py, myR, prev, tMax);
        const b = this.#expire(px, py, myR, next, tMax);
        if (a < 0 && b < 0)
            return (
                this.#collect(next, px, py, myR, intent) <=
                this.#collect(prev, px, py, myR, intent) * 1.25
            );
        if (a >= 0 && b >= 0) return a >= b - 0.05;
        return false;
    }

    #similarDirection(a: Vec, b: Vec): boolean {
        return a.x * b.x + a.y * b.y > 0.98;
    }

    #sameDirection(a: Vec, b: Vec): boolean {
        return a.x * b.x + a.y * b.y > 0.98;
    }

    #holdCommit(
        px: number,
        py: number,
        myR: number,
        threatened: boolean,
        enemyNear: boolean,
        intent: Vec,
        enemies: { x: number; y: number }[],
    ): Vec | null {
        const commit = this.#commit;
        if (!commit || this.#urgentThreat(commit, px, py, myR)) return null;
        const hasIntent = intent.x !== 0 || intent.y !== 0;
        const reverse =
            !threatened &&
            hasIntent &&
            intent.x * commit.x + intent.y * commit.y < CFG.INTENT_REVERSE_DOT;
        let degenerate = false;
        if (!reverse && !threatened && enemyNear) {
            const openNow = this.#openness(px, py, enemies, commit);
            const need = Math.max(CFG.COMMIT_MIN_OPEN, this.#followNeed(px, py, enemies));
            if (openNow < need) {
                let altOpen = 0;
                for (const dir of RING) {
                    const o = this.#openness(px, py, enemies, dir);
                    if (o > altOpen) altOpen = o;
                }
                degenerate = altOpen > openNow + 0.15;
            }
        }
        let escapeBreak = false;
        if (threatened && this.#pointThreatened(px, py, myR)) {
            if (this.#expire(px, py, myR, commit, CFG.ESC_BREAK_WINDOW) >= 0) {
                escapeBreak = true;
            } else {
                let bt: Threat | null = null;
                let btt = Infinity;
                for (const t of this.#threats) {
                    const d = Math.hypot(t.x - px, t.y - py) - t.rNoMove;
                    const tt = Math.max(0, d) / Math.max(1, t.speed);
                    if (tt < btt) {
                        btt = tt;
                        bt = t;
                    }
                }
                if (bt) {
                    const nl = Math.hypot(bt.svx, bt.svy) || 1;
                    const latC = Math.abs(commit.x * (-bt.svy / nl) + commit.y * (bt.svx / nl));
                    escapeBreak = latC < 0.7;
                }
            }
        }
        const wallBlocked = this.#wallReach(px, py, myR, commit) < CFG.STEP_SIZE;
        if (reverse || degenerate || escapeBreak || wallBlocked) {
            this.#resetCommit();
            return null;
        }
        return commit;
    }

    #targetFor(px: number, py: number, myR: number, dir: Vec, run: number, hot: boolean): Vec {
        const ax = this.#safeX;
        const ay = this.#safeY;
        const dta = ax ? Math.hypot(ax - px, ay - py) : Infinity;
        if (hot && (ax === 0 || dta < CFG.REANCHOR_DIST)) {
            const along = this.#walkOut(px, py, myR, dir, run);
            if (along) {
                this.#safeX = Math.round(along.x);
                this.#safeY = Math.round(along.y);
                return { x: this.#safeX, y: this.#safeY };
            }
            this.#safeX = 0;
            this.#safeY = 0;
        }
        return {
            x: this.#safeX || Math.round(px + dir.x * run),
            y: this.#safeY || Math.round(py + dir.y * run),
        };
    }

    #decide(
        px: number,
        py: number,
        myR: number,
        threatened: boolean,
        intent: Vec,
        now: number,
        enemies: { x: number; y: number }[],
        enemyNear: boolean,
    ): Vec | null {
        const hasIntent = intent.x !== 0 || intent.y !== 0;
        const held = this.#holdCommit(px, py, myR, threatened, enemyNear, intent, enemies);
        if (held) return held;
        let dir: Vec | null = null;
        if (threatened) dir = this.#escapeDir(px, py, myR, intent, enemies);
        if (enemyNear && !dir)
            dir =
                hasIntent && this.#intentSafe(px, py, myR, intent, enemies)
                    ? snapDir(intent)
                    : this.#strafeDir(px, py, myR, enemies, intent);
        if (threatened && !dir) {
            const parsedRaw = this.#parse(px, py, myR, intent);
            const parsed = parsedRaw ? snapDir(parsedRaw) : null;
            const safe = this.#findSafe(px, py, myR, parsed ?? intent);
            if (safe) {
                const nx = Math.round(safe.x);
                const ny = Math.round(safe.y);
                const newDir = normalize2d(nx - px, ny - py);
                if (this.#commit && this.#similarDirection(this.#commit, newDir) && this.#safeX)
                    return this.#commit;
                this.#safeX = nx;
                this.#safeY = ny;
                dir =
                    this.#lastDir && this.#keepCommitted(this.#lastDir, newDir, px, py, myR, intent)
                        ? this.#lastDir
                        : newDir;
            } else if (parsed) {
                dir = parsed;
            }
        }
        if (!dir || !this.#commit || this.#similarDirection(this.#commit, dir)) return dir;
        const settled = now - this.#commitAt >= CFG.DODGE_DWELL_MS;
        const keep = this.#collect(this.#commit, px, py, myR, intent);
        const next = this.#collect(dir, px, py, myR, intent);
        const urgent = this.#urgentThreat(this.#commit, px, py, myR);
        if (urgent) return next < keep * CFG.URGENT_MARGIN ? dir : this.#commit;
        return settled && next > keep * CFG.SWITCH_MARGIN ? dir : this.#commit;
    }

    #resetCommit(): void {
        this.#commit = null;
        this.#commitUntil = 0;
        this.#commitAt = 0;
        this.#clearSince = 0;
        this.#safeX = 0;
        this.#safeY = 0;
    }

    tick(world: DodgeWorld): DodgeResult {
        const now = world.now;
        const px = world.x;
        const py = world.y;
        if (!isFinite(px) || !isFinite(py)) {
            this.#resetCommit();
            return { active: false };
        }
        this.#charSpeed = world.speed > 0 ? world.speed : CFG.CHAR_SPEED;
        const myR = world.radius > 0 ? world.radius : 60;
        const projectiles = world.projectiles;
        const enemies = world.enemies;
        const enemyNear = enemies.some(
            (e) =>
                (e.x - px) * (e.x - px) + (e.y - py) * (e.y - py) <
                CFG.COMBAT_RANGE * CFG.COMBAT_RANGE,
        );
        this.#track(projectiles, now);
        this.#choose(px, py, myR);
        this.#trackEnemies(enemies, now);
        if (projectiles.length === 0 && this.#threats.length === 0 && !this.#commit && !enemyNear) {
            this.#safeX = 0;
            this.#safeY = 0;
            return { active: false };
        }
        const intent = world.intent;
        const tMin = this.#expire(px, py, myR, intent, this.#urgent());
        const threatened = tMin >= 0 || this.#pointThreatened(px, py, myR);
        if (this.#commit) {
            const clear = this.#expire(px, py, myR, ZERO, CFG.T_RELEASE + 0.1) < 0 && !enemyNear;
            if (threatened || !clear) this.#clearSince = 0;
            else if (this.#clearSince === 0) this.#clearSince = now;
            if (
                now >= this.#commitUntil &&
                clear &&
                now - this.#clearSince >= CFG.HOLD_AFTER_CLEAR_MS
            ) {
                this.#resetCommit();
                return { active: false };
            }
        }
        let dir = this.#decide(px, py, myR, threatened, intent, now, enemies, enemyNear);
        if (!dir && this.#commit) dir = this.#commit;
        if (!dir) {
            this.#resetCommit();
            return { active: false };
        }
        this.#lastDir = dir;
        const preX = this.#safeX;
        const preY = this.#safeY;
        const fresh = !this.#commit || !this.#sameDirection(this.#commit, dir);
        if (fresh) {
            this.#commit = dir;
            this.#commitAt = now;
            this.#commitUntil = now + CFG.DODGE_COMMIT_MS;
            if (this.#safeX === preX && this.#safeY === preY) this.#safeX = this.#safeY = 0;
        }
        const run = Math.min(
            CFG.DODGE_RANGE,
            Math.max(CFG.STEP_SIZE, this.#wallReach(px, py, myR, dir)),
        );
        const hot = threatened || enemyNear;
        const tgt = this.#targetFor(px, py, myR, dir, run, hot);
        if (!hot && Math.hypot(tgt.x - px, tgt.y - py) <= CFG.ARRIVAL_THRESHOLD) {
            this.#resetCommit();
            return { active: false };
        }
        return { active: true, targetX: tgt.x, targetY: tgt.y, send: true, hot };
    }

    reset(): void {
        this.#mem.clear();
        this.#enemyTrack.clear();
        this.#threats.length = 0;
        this.#maxSpeed = 0;
        this.#charSpeed = CFG.CHAR_SPEED;
        this.#lastDir = null;
        this.#urgentAt = 0;
        this.#urgentValue = 0;
        this.#resetCommit();
    }
}

class AutoDodge {
    #hitbox = 0;
    #lastSentX = 0;
    #lastSentY = 0;
    #hasSent = false;
    #radiusMemoData: NativePointer | null = null;
    #radiusMemoValue = 0;
    #selfSend = false;
    #hookX = 0;
    #hookY = 0;
    #hookAt = 0;
    #playerDir: Vec = ZERO;
    #playerDirAt = 0;

    #core = new DodgeCore();

    #readIntent(px: number, py: number, now: number): Vec {
        let ix = this.#hookX;
        let iy = this.#hookY;
        let at = this.#hookAt;
        const sx = Math.trunc(scanData.inputX);
        const sy = Math.trunc(scanData.inputY);
        if (sx !== 0 || sy !== 0) {
            ix = sx;
            iy = sy;
            at = now;
        }
        const ownWrite =
            this.#hasSent && Math.hypot(ix - this.#lastSentX, iy - this.#lastSentY) < 120;
        if (!ownWrite && (ix !== 0 || iy !== 0) && now - at < CFG.INTENT_STALE_MS) {
            const dx = ix - px;
            const dy = iy - py;
            const d = Math.hypot(dx, dy);
            if (d > CFG.INTENT_MIN_DIST) {
                this.#playerDir = { x: dx / d, y: dy / d };
                this.#playerDirAt = now;
            }
        }
        return now - this.#playerDirAt < CFG.INTENT_STALE_MS ? this.#playerDir : ZERO;
    }

    #characterCollisionRadius(data: NativePointer): number {
        if (data.isNull()) return 0;
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
        this.#selfSend = true;
        try {
            return sendCommand(MOVE_INPUT_TYPE, (ci) => {
                ci.add(OFFSETS.ClientInput_x).writeS32(x);
                ci.add(OFFSETS.ClientInput_y).writeS32(y);
            });
        } finally {
            this.#selfSend = false;
        }
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
        if (!this.#learnOwnHitbox()) {
            const fallback = Math.trunc(scanData.myRadius);
            if (fallback > 0) this.#hitbox = fallback;
        }
        const now = Date.now();
        const d = this.#core.tick({
            now,
            x: scanData.myX,
            y: scanData.myY,
            speed: Math.trunc(scanData.mySpeed),
            radius: Math.trunc(this.#hitbox),
            projectiles: scanData.projectiles,
            enemies: scanData.enemies,
            intent: this.#readIntent(scanData.myX, scanData.myY, now),
        });
        if (!d.active || !d.send) return;
        if (!isFinite(d.targetX) || !isFinite(d.targetY)) return;
        const minShift = d.hot ? 0 : CFG.SEND_MIN_SHIFT;
        if (
            this.#hasSent &&
            Math.hypot(d.targetX - this.#lastSentX, d.targetY - this.#lastSentY) < minShift
        )
            return;
        this.#lastSentX = d.targetX;
        this.#lastSentY = d.targetY;
        this.#hasSent = true;
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
        this.#hasSent = false;
        this.#playerDir = ZERO;
        this.#playerDirAt = 0;
        this.#hookX = 0;
        this.#hookY = 0;
        this.#hookAt = 0;
    }

    setup(): void {
        try {
            enableProjectileTracking();
            onDataReload(() => this.#invalidateOwnMetrics());
            attachOffset(getBase(), OFFSETS.ClientInputManager_addInput, {
                onEnter: (args) => {
                    try {
                        if (this.#selfSend) return;
                        const ci = args[1];
                        if (ci.add(OFFSETS.ClientInput_type).readU32() !== MOVE_INPUT_TYPE) return;
                        this.#hookX = ci.add(OFFSETS.ClientInput_x).readS32();
                        this.#hookY = ci.add(OFFSETS.ClientInput_y).readS32();
                        this.#hookAt = Date.now();
                    } catch {}
                },
            });
        } catch {}
    }
}

const autoDodge = new AutoDodge();

export const updateAutoDodge = (): void => autoDodge.update();
export const resetAutoDodge = (): void => autoDodge.reset();
export const setupAutoDodge = (): void => autoDodge.setup();
