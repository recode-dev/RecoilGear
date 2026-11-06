import { attachOffset, getBase, getFunctions, isValidPtr, readClampedS32 } from "../core/Functions";
import { OFFSETS } from "../core/Offsets";
import {
    BEAM_TICKS,
    enableProjectileTracking,
    onDataReload,
    scanData,
    TICKS_PER_SEC,
    travelDistance,
    travelTicksFor,
    weaponRangeUnits,
    type EnemyInfo,
} from "../core/Scan";
import { losCheckWide, PROJECTILE_BIT } from "../utils/Walls";

const SPEED_REFRESH_MS = 500;
const SPEED_FAIL_RETRY_MS = 250;
const HIST_CAP = 16;
const VHIST_CAP = 12;
const TRACK_PRUNE_MS = 2000;
const SKIP_NAME_PARTS = ["BALL"];
const SERVER_TICK_MS = 50;
const MIN_TRACK_MS = SERVER_TICK_MS * 2;
const MAX_SPEED_EST = 1600;
const MAX_ACCEL = 6000;
const LEAD_PASSES = 3;
const MAX_FLIGHT_S = 3;
const STICKY_MARGIN = 1.12;
const TICK_S = 1 / TICKS_PER_SEC;
const WALKBACK_FRACS = [0.55, 0.25, 0];

const length = (x: number, y: number): number => Math.floor(Math.hypot(x, y));

const lengthSquared = (x: number, y: number): number => x * x + y * y;

const distance = (x1: number, y1: number, x2: number, y2: number): number =>
    length(x2 - x1, y2 - y1);

interface TrackPoint {
    x: number;
    y: number;
    t: number;
}

interface TargetTrack {
    hist: TrackPoint[];
    histHead: number;
    histLen: number;
    vhist: TrackPoint[];
    vHead: number;
    vLen: number;
    lastSeen: number;
}

interface VelocityWindow {
    vx: number;
    vy: number;
    magnitude: number;
}

interface DirectionVelocity {
    vx: number;
    vy: number;
}

interface Acceleration {
    ax: number;
    ay: number;
}

interface Prediction {
    x: number;
    y: number;
    vx: number;
    vy: number;
    ax: number;
    ay: number;
    radius: number;
    leadVx: number;
    leadVy: number;
    leadAx: number;
    leadAy: number;
}

interface AimPoint {
    x: number;
    y: number;
    t: number;
}

interface TargetPos {
    x: number;
    y: number;
}

interface PickCandidate {
    enemy: EnemyInfo | null;
    pred: Prediction | null;
    dist: number;
}

interface HeldCandidate {
    enemy: EnemyInfo;
    pred: Prediction | null;
    dist: number;
}

interface PickState {
    best: PickCandidate;
    calm: PickCandidate;
    cur: HeldCandidate | null;
}

interface PickResult {
    pick: EnemyInfo | null;
    pred: Prediction | null;
}

class AutoAim {
    #target: EnemyInfo | null = null;
    #gameTarget: NativePointer | null = null;
    #cachedAim: AimPoint | null = null;
    #aimStamp = 0;
    #track = new Map<string | null, TargetTrack>();
    #projectileSpeed = 0;
    #speedAt = 0;
    #speedFailAt = 0;
    #ownBeam = false;
    #ownShotR = 0;
    #ownTicks = 0;
    #ownTravel = 0;
    #rangeCache = 0;
    #rangeAt = 0;
    #hooks = false;

    #isSkipped(name: string | null): boolean {
        if (!name) return true;
        return SKIP_NAME_PARTS.some((part) => name.includes(part));
    }

    #newTrack(now: number): TargetTrack {
        const track: TargetTrack = {
            hist: [],
            histHead: 0,
            histLen: 0,
            vhist: [],
            vHead: 0,
            vLen: 0,
            lastSeen: now,
        };
        for (let i = 0; i < HIST_CAP; i++) track.hist.push({ x: 0, y: 0, t: 0 });
        for (let i = 0; i < VHIST_CAP; i++) track.vhist.push({ x: 0, y: 0, t: 0 });
        return track;
    }

    #trackFor(gid: string | null, now: number): TargetTrack {
        let track = this.#track.get(gid);
        if (track) return track;
        track = this.#newTrack(now);
        this.#track.set(gid, track);
        return track;
    }

    #windowVelocity(
        track: TargetTrack,
        x: number,
        y: number,
        moveAngle: number,
        now: number,
    ): VelocityWindow | null {
        const h = track.hist;
        const oldest = h[(track.histHead - track.histLen + HIST_CAP) % HIST_CAP];
        const span = (now - oldest.t) / 1000;
        if (now - oldest.t < MIN_TRACK_MS || span <= 0) return null;
        let vxWindow = (x - oldest.x) / span;
        let vyWindow = (y - oldest.y) / span;
        const magnitude = length(vxWindow, vyWindow);
        if (magnitude <= 150) {
            const delta = ((moveAngle - Math.atan2(vyWindow, vxWindow)) * 180) / Math.PI;
            const drift = Math.abs(((((delta + 180) % 360) + 360) % 360) - 180);
            if (drift < 45) {
                vxWindow = Math.cos(moveAngle) * magnitude;
                vyWindow = Math.sin(moveAngle) * magnitude;
            }
        }
        return { vx: vxWindow, vy: vyWindow, magnitude };
    }

    #directionSpeed(
        track: TargetTrack,
        x: number,
        y: number,
        moveSpeed: number,
        window: VelocityWindow,
    ): DirectionVelocity | null {
        const h = track.hist;
        let dx = 0;
        let dy = 0;
        for (let k = track.histLen - 2; k >= 0; k--) {
            const point = h[(track.histHead - 1 - k + 2 * HIST_CAP) % HIST_CAP];
            if (point.x === x && point.y === y) continue;
            dx = x - point.x;
            dy = y - point.y;
            break;
        }
        const direction = length(dx, dy);
        const speed = Math.min(
            window.magnitude,
            moveSpeed >= 200 && moveSpeed <= 1500 ? moveSpeed : window.magnitude,
        );
        if (direction < 0.5 || speed > MAX_SPEED_EST) return null;
        return { vx: (dx / direction) * speed, vy: (dy / direction) * speed };
    }

    #accelAt(track: TargetTrack, vx: number, vy: number, now: number): Acceleration {
        const vh = track.vhist;
        const vslot = vh[track.vHead];
        vslot.x = vx;
        vslot.y = vy;
        vslot.t = now;
        track.vHead = (track.vHead + 1) % VHIST_CAP;
        track.vLen = track.vLen < VHIST_CAP ? track.vLen + 1 : VHIST_CAP;
        let ax = 0;
        let ay = 0;
        for (let k = 0; k < track.vLen; k++) {
            const past = vh[(track.vHead - track.vLen + k + 2 * VHIST_CAP) % VHIST_CAP];
            const dt = (now - past.t) / 1000;
            if (dt < 0.12) continue;
            ax = (vx - past.x) / dt;
            ay = (vy - past.y) / dt;
            break;
        }
        if (lengthSquared(ax, ay) > MAX_ACCEL * MAX_ACCEL) {
            ax = 0;
            ay = 0;
        }
        return { ax, ay };
    }

    #sample(enemy: EnemyInfo, x: number, y: number, now: number): Prediction | null {
        const track = this.#trackFor(enemy.gid, now);
        track.lastSeen = now;
        const slot = track.hist[track.histHead];
        slot.x = x;
        slot.y = y;
        slot.t = now;
        track.histHead = (track.histHead + 1) % HIST_CAP;
        track.histLen = track.histLen < HIST_CAP ? track.histLen + 1 : HIST_CAP;
        const window = this.#windowVelocity(track, x, y, enemy.moveAngle, now);
        if (!window) return null;
        if (window.magnitude < 30) return { x, y, vx: 0, vy: 0, ax: 0, ay: 0 } as Prediction;
        const dir = this.#directionSpeed(track, x, y, enemy.moveSpeed, window);
        if (!dir) return null;
        const accel = this.#accelAt(track, dir.vx, dir.vy, now);
        return { x, y, vx: dir.vx, vy: dir.vy, ax: accel.ax, ay: accel.ay } as Prediction;
    }

    #flightTime(rx: number, ry: number, vx: number, vy: number, speed: number): number {
        const a = vx * vx + vy * vy - speed * speed;
        const b = rx * vx + ry * vy;
        const c = rx * rx + ry * ry;
        if (a > -1e-9 && a < 1e-9) return b < 0 ? -c / (2 * b) : -1;
        const disc = b * b - a * c;
        if (disc < 0) return -1;
        const root = Math.sqrt(disc);
        let best = -1;
        const t1 = (-b - root) / a;
        const t2 = (-b + root) / a;
        if (t1 > 0) best = t1;
        if (t2 > 0 && (best < 0 || t2 < best)) best = t2;
        return best;
    }

    #snapTicks(t: number): number {
        if (!(this.#ownTicks > 0) || !isFinite(t) || t <= 0) return t;
        const maxT =
            this.#ownTicks >= BEAM_TICKS ? MAX_FLIGHT_S : this.#ownTicks / (TICKS_PER_SEC * 1000);
        const snapped = Math.round(t / TICK_S) * TICK_S;
        return Math.min(snapped > 0 ? snapped : TICK_S, maxT);
    }

    #applyLead(pred: Prediction): void {
        pred.leadVx = pred.vx;
        pred.leadVy = pred.vy;
        pred.leadAx = pred.ax;
        pred.leadAy = pred.ay;
    }

    #solveFlying(
        pred: Prediction,
        speed: number,
        range: number,
        pocket: number,
        t: number,
    ): AimPoint | null {
        let px = pred.x;
        let py = pred.y;
        for (let pass = 0; pass < LEAD_PASSES; pass++) {
            px = pred.x + pred.leadVx * t + 0.5 * pred.leadAx * t * t;
            py = pred.y + pred.leadVy * t + 0.5 * pred.leadAy * t * t;
            const flown = distance(px, py, scanData.myX, scanData.myY) - pocket;
            if (!(flown > 0)) break;
            t = this.#snapTicks(flown / speed);
        }
        if (range > 0 && distance(px, py, scanData.myX, scanData.myY) - pocket > range) return null;
        if (t > MAX_FLIGHT_S) return null;
        return { x: Math.round(px), y: Math.round(py), t };
    }

    #solveIncremental(
        pred: Prediction,
        speed: number,
        range: number,
        pocket: number,
    ): AimPoint | null {
        let px = pred.x;
        let py = pred.y;
        for (let pass = 0; pass < LEAD_PASSES; pass++) {
            const flightTo = distance(px, py, scanData.myX, scanData.myY) - pocket;
            if (range > 0 && flightTo > range) return null;
            const flight = flightTo > 0 ? this.#snapTicks(flightTo / speed) : 0;
            if (flight > MAX_FLIGHT_S) return null;
            px = pred.x + pred.leadVx * flight + 0.5 * pred.leadAx * flight * flight;
            py = pred.y + pred.leadVy * flight + 0.5 * pred.leadAy * flight * flight;
        }
        return { x: Math.round(px), y: Math.round(py), t: 0 };
    }

    #solve(pred: Prediction, speed: number, range: number): AimPoint | null {
        const pocket = Math.max(this.#ownShotR, 0) + Math.max(pred.radius, 0);
        if (this.#ownBeam) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };
        if (range > 0) {
            const d0 = distance(pred.x, pred.y, scanData.myX, scanData.myY) - pocket;
            if (d0 > range) return null;
        }
        if (!(speed > 0)) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };
        this.#applyLead(pred);
        const t = this.#flightTime(
            pred.x - scanData.myX,
            pred.y - scanData.myY,
            pred.leadVx,
            pred.leadVy,
            speed,
        );
        if (t > 0) return this.#solveFlying(pred, speed, range, pocket, t);
        return this.#solveIncremental(pred, speed, range, pocket);
    }

    #ownProjectileData(own: NativePointer): NativePointer | null {
        const fns = getFunctions();
        const skill = fns.LogicCharacterClient_getWeaponSkill(own);
        const data = skill && !skill.isNull() ? fns.LogicSkillData_getProjectileData(skill) : null;
        return data && !data.isNull() ? data : null;
    }

    #shotRadius(data: NativePointer): number {
        let radius = readClampedS32(data, OFFSETS.LogicProjectileData_radius, 1, 2000);
        if (!(radius > 0)) {
            try {
                const start = Math.trunc(
                    getFunctions().LogicCharacterData_getProjectileStartRadius(),
                );
                if (start >= 1 && start <= 2000) radius = start;
            } catch {}
        }
        return radius;
    }

    #learnTravelTicks(data: NativePointer, engineSpeed: number, own: NativePointer): void {
        const tiles = weaponRangeUnits(own);
        const speedForTicks = engineSpeed > 0 ? engineSpeed : this.#projectileSpeed;
        this.#ownTicks =
            speedForTicks > 0 && tiles > 0 ? travelTicksFor(data, tiles, speedForTicks) : 0;
        this.#ownTravel = this.#ownTicks > 0 ? travelDistance(this.#ownTicks, speedForTicks) : 0;
        this.#ownBeam = this.#ownTicks === BEAM_TICKS;
    }

    #learnWeaponState(data: NativePointer, own: NativePointer): number {
        const engineSpeed = readClampedS32(data, OFFSETS.LogicProjectileData_speed, 300, 8500);
        this.#ownShotR = this.#shotRadius(data);
        this.#learnTravelTicks(data, engineSpeed, own);
        return engineSpeed;
    }

    #refreshWeapon(now: number): void {
        let engineSpeed = 0;
        try {
            const own = scanData.ownCharacter;
            if (own && !own.isNull()) {
                const data = this.#ownProjectileData(own);
                if (data) engineSpeed = this.#learnWeaponState(data, own);
            }
        } catch {}
        if (engineSpeed >= 300 && engineSpeed <= 8500) {
            this.#projectileSpeed = engineSpeed;
            this.#speedAt = now;
        } else {
            this.#speedFailAt = now;
        }
    }

    #ownProjectileSpeed(): number {
        const now = Date.now();
        if (this.#projectileSpeed >= 300 && now - this.#speedAt < SPEED_REFRESH_MS)
            return this.#projectileSpeed;
        if (
            this.#projectileSpeed < 300 &&
            this.#speedFailAt > 0 &&
            now - this.#speedFailAt < SPEED_FAIL_RETRY_MS
        )
            return this.#projectileSpeed;
        this.#refreshWeapon(now);
        return this.#projectileSpeed;
    }

    #ownRange(): number {
        const now = Date.now();
        if (now - this.#rangeAt < SPEED_REFRESH_MS) return this.#rangeCache;
        this.#rangeAt = now;
        this.#rangeCache = 0;
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return 0;
        const tiles = weaponRangeUnits(own);
        const flight = Math.max(this.#ownTravel, 0);
        if (flight > 0 && (tiles <= 0 || (flight >= tiles * 0.8 && flight <= tiles * 1.6))) {
            this.#rangeCache = flight;
        } else {
            this.#rangeCache = tiles;
        }
        return this.#rangeCache;
    }

    #targetPos(enemy: EnemyInfo): TargetPos | null {
        const fns = getFunctions();
        const target = isValidPtr(enemy.body) ? enemy.body : enemy.ptr;
        let ex = enemy.x;
        let ey = enemy.y;
        try {
            const gx = Math.trunc(fns.LogicGameObjectClient_getX(target));
            const gy = Math.trunc(fns.LogicGameObjectClient_getY(target));
            if (isFinite(gx) && isFinite(gy) && (gx !== 0 || gy !== 0)) {
                ex = gx;
                ey = gy;
            }
        } catch {}
        if (!isFinite(ex) || !isFinite(ey) || (ex === 0 && ey === 0)) return null;
        return { x: ex, y: ey };
    }

    #inBounds(x: number, y: number, mx: number, my: number): boolean {
        if (!isFinite(x) || !isFinite(y)) return false;
        if (x === 0 && y === 0) return false;
        if (x < -100000 || x > 100000 || y < -100000 || y > 100000) return false;
        if (x === Math.trunc(mx) && y === Math.trunc(my)) return false;
        return true;
    }

    #finishAim(aim: AimPoint, mx: number, my: number): AimPoint | null {
        const ax = Math.trunc(aim.x);
        const ay = Math.trunc(aim.y);
        if (!this.#inBounds(ax, ay, mx, my)) return null;
        return { x: ax, y: ay, t: aim.t };
    }

    #blockedWalkback(
        pred: Prediction,
        aim: AimPoint,
        mx: number,
        my: number,
        pocketR: number,
    ): AimPoint | null {
        for (const frac of WALKBACK_FRACS) {
            const cx = pred.x + (aim.x - pred.x) * frac;
            const cy = pred.y + (aim.y - pred.y) * frac;
            if (!isFinite(cx) || !isFinite(cy)) continue;
            if (losCheckWide(mx, my, cx, cy, { bit: PROJECTILE_BIT, radius: pocketR })) {
                const x = Math.round(cx);
                const y = Math.round(cy);
                if (!this.#inBounds(x, y, mx, my)) return null;
                return { x, y, t: aim.t * frac };
            }
        }
        return null;
    }

    #aimAt(enemy: EnemyInfo, now: number): AimPoint | null {
        if (!enemy || !enemy.ptr || enemy.ptr.isNull()) return null;
        const pos = this.#targetPos(enemy);
        if (!pos) return null;
        const mx = scanData.myX;
        const my = scanData.myY;
        const speed = this.#ownProjectileSpeed();
        const pred =
            this.#sample(enemy, pos.x, pos.y, now) ||
            ({ x: pos.x, y: pos.y, vx: 0, vy: 0, ax: 0, ay: 0 } as Prediction);
        pred.radius = Math.trunc(enemy.radius);
        const aim = this.#solve(pred, speed, this.#ownRange());
        if (!aim) return null;
        const pocketR = this.#ownShotR > 0 ? this.#ownShotR : 40;
        if (!isFinite(aim.x) || !isFinite(aim.y)) return null;
        if (losCheckWide(mx, my, aim.x, aim.y, { bit: PROJECTILE_BIT, radius: pocketR }))
            return this.#finishAim(aim, mx, my);
        return this.#blockedWalkback(pred, aim, mx, my, pocketR);
    }

    #enemyByPtr(candidate: NativePointer | null): EnemyInfo | null {
        if (!candidate || candidate.isNull()) return null;
        const list = scanData.enemies || [];
        for (const enemy of list) {
            if (enemy && enemy.ptr && !enemy.ptr.isNull() && enemy.ptr.equals(candidate))
                return enemy;
        }
        return null;
    }

    #aimPoint(): AimPoint | null {
        const now = Date.now();
        if (now - this.#aimStamp < 25) return this.#cachedAim;
        this.#aimStamp = now;
        this.#cachedAim = this.#aimPointNow();
        return this.#cachedAim;
    }

    #aimPointNow(): AimPoint | null {
        const now = Date.now();
        const live = this.#target ? this.#enemyByPtr(this.#target.ptr) : null;
        let enemy = live ? this.#target : this.#pickTarget(now);
        if (!enemy) {
            const viaGame = this.#enemyByPtr(this.#gameTarget);
            if (viaGame) enemy = viaGame;
        }
        if (!enemy) return null;
        return this.#aimAt(enemy, now);
    }

    #enemyEligible(enemy: EnemyInfo, mx: number, my: number): boolean {
        if (!enemy || !enemy.ptr || enemy.ptr.isNull()) return false;
        if (enemy.kind !== "player") return false;
        if (this.#isSkipped(enemy.brawlerName)) return false;
        const pocketR = this.#ownShotR > 0 ? this.#ownShotR : 40;
        return losCheckWide(mx, my, enemy.x, enemy.y, { bit: PROJECTILE_BIT, radius: pocketR });
    }

    #consider(state: PickState, enemy: EnemyInfo, pred: Prediction, score: number): void {
        if (score < state.calm.dist) state.calm = { enemy, pred, dist: score };
        if (score < state.best.dist) state.best = { enemy, pred, dist: score };
        if (this.#target && enemy.gid === this.#target.gid)
            state.cur = { enemy, pred, dist: score };
    }

    #pruneTracks(now: number): void {
        if (this.#track.size <= 24) return;
        for (const [key, tr] of this.#track) {
            if (now - tr.lastSeen > TRACK_PRUNE_MS) this.#track.delete(key);
        }
    }

    #selectPick(state: PickState, now: number): PickResult {
        let best = state.best;
        if (state.calm.enemy && state.calm.dist <= state.best.dist * 1.4) best = state.calm;
        if (!state.cur || !best.enemy || state.cur.dist > best.dist * STICKY_MARGIN)
            return { pick: best.enemy, pred: best.pred };
        const pred =
            state.cur.enemy.gid === best.enemy.gid
                ? best.pred
                : this.#sample(state.cur.enemy, state.cur.enemy.x, state.cur.enemy.y, now);
        if (pred) pred.radius = Math.trunc(state.cur.enemy.radius);
        return { pick: state.cur.enemy, pred };
    }

    #pickTarget(now: number): EnemyInfo | null {
        const list = scanData.enemies || [];
        const mx = scanData.myX;
        const my = scanData.myY;
        const speed = this.#ownProjectileSpeed();
        const range = this.#ownRange();
        const state: PickState = {
            best: { enemy: null, pred: null, dist: Infinity },
            calm: { enemy: null, pred: null, dist: Infinity },
            cur: null,
        };
        for (const enemy of list) {
            if (!this.#enemyEligible(enemy, mx, my)) continue;
            const pred =
                this.#sample(enemy, enemy.x, enemy.y, now) ||
                ({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, ax: 0, ay: 0 } as Prediction);
            pred.radius = Math.trunc(enemy.radius);
            const dist = distance(enemy.x, enemy.y, mx, my);
            const pocket = Math.max(this.#ownShotR, 0) + pred.radius;
            if (range > 0 && dist - pocket > range) continue;
            this.#consider(state, enemy, pred, dist);
        }
        const { pick, pred } = this.#selectPick(state, now);
        if (!pick || !pred) return null;
        this.#pruneTracks(now);
        if (!this.#solve(pred, speed, range)) return null;
        return pick;
    }

    #resetWeaponCache(): void {
        this.#projectileSpeed = 0;
        this.#speedAt = 0;
        this.#speedFailAt = 0;
        this.#rangeCache = 0;
        this.#rangeAt = 0;
        this.#ownShotR = 0;
        this.#ownTicks = 0;
        this.#ownTravel = 0;
        this.#ownBeam = false;
    }

    setup(): void {
        if (this.#hooks) return;
        this.#hooks = true;
        const base = getBase();
        try {
            enableProjectileTracking();
            onDataReload(() => this.#resetWeaponCache());
        } catch {}
        attachOffset(base, OFFSETS.BattleScreen_getClosestTargetForAutoshoot, {
            onLeave: (retval) => {
                try {
                    if (retval.isNull()) return;
                    this.#gameTarget = retval;
                } catch {}
            },
        });
        attachOffset(base, OFFSETS.BattleScreen_activateSkill, {
            onEnter: (args) => {
                const aim = this.#aimPoint();
                if (!aim) return;
                try {
                    const ax = Math.trunc(aim.x);
                    const ay = Math.trunc(aim.y);
                    const mx = Math.trunc(scanData.myX);
                    const my = Math.trunc(scanData.myY);
                    if (!isFinite(ax) || !isFinite(ay)) return;
                    if (ax === 0 && ay === 0) return;
                    if (ax === mx && ay === my) return;
                    args[1] = ptr(ax);
                    args[2] = ptr(ay);
                } catch {}
            },
        });
    }

    update(): void {
        if (scanData.lastUpdate === 0) {
            this.#target = null;
            return;
        }
        this.#target = this.#pickTarget(Date.now());
        this.#aimPoint();
    }

    reset(): void {
        this.#target = null;
        this.#cachedAim = null;
        this.#aimStamp = 0;
        this.#track.clear();
        this.#resetWeaponCache();
    }
}

const autoAim = new AutoAim();

export const setupAutoAim = (): void => autoAim.setup();
export const updateAutoAim = (): void => autoAim.update();
export const resetAutoAim = (): void => autoAim.reset();
