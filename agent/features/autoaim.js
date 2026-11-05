import { getBase, getFunctions, isValidPtr } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import {
    beamTicks,
    dataOf,
    enableProjectileTracking,
    onDataReload,
    rangeScaleCalibrated,
    scanData,
    ticksPerSec,
    travelDistance,
    travelFor,
    weaponRangeUnits
} from "../core/scan.js";
import { losCheckWide, projectileBit } from "../utils/walls.js";

const maxi = 0x7fffffff;
const guard = 0xb504;
const speedRefreshMs = 500;
const speedFailRetryMs = 250;
const histCap = 16;
const vhistCap = 12;
const trackPruneMs = 2000;
const skipNameParts = ["BALL"];
const serverTickMs = 50;
const minTrackMs = serverTickMs * 2;
const maxSpeedEst = 1600;
const maxAccel = 6000;
const leadPasses = 3;
const maxFlightS = 3;
const stickyMargin = 1.12;
const tickS = 1 / ticksPerSec;
const steerLeadFactor = 0.75;
const lineupBonus = 220;

const sqrtI = (v) => {
    if (v <= 0) return 0;
    if (v >= maxi) return 46340;
    return Math.floor(Math.sqrt(v));
};

const length = (x, y) => {
    if (x > guard || x < -guard || y > guard || y < -guard) return 46340;
    const s = x * x + y * y;
    return s < 0 ? 46340 : sqrtI(s);
};

const lengthSquared = (x, y) => {
    if (x > guard || x < -guard || y > guard || y < -guard) return maxi;
    const s = x * x + y * y;
    return s < 0 ? maxi : s;
};

const distance = (x1, y1, x2, y2) => length(x2 - x1, y2 - y1);

class Autoaim {
    #target = null;
    #gameTarget = null;
    #track = new Map();
    #projectileSpeed = 0;
    #speedAt = 0;
    #speedFailAt = 0;
    #ownBeam = false;
    #ownPierces = false;
    #ownPiercesChars = false;
    #ownShotR = 0;
    #ownTicks = 0;
    #ownTravel = 0;
    #ownSteerLife = 0;
    #rangeCache = 0;
    #rangeAt = 0;
    #hooks = false;

    #isSkipped(name) {
        if (!name) return true;
        for (let i = 0; i < skipNameParts.length; i++) {
            if (name.indexOf(skipNameParts[i]) >= 0) return true;
        }
        return false;
    }

    #newTrack(now) {
        const track = {
            hist: [],
            histHead: 0,
            histLen: 0,
            vhist: [],
            vHead: 0,
            vLen: 0,
            lastSeen: now
        };
        for (let i = 0; i < histCap; i++) track.hist.push({ x: 0, y: 0, t: 0 });
        for (let i = 0; i < vhistCap; i++) track.vhist.push({ x: 0, y: 0, t: 0 });
        return track;
    }

    #sample(gid, x, y, moveSpeed, moveAngle, now) {
        let track = this.#track.get(gid);
        if (!track) {
            track = this.#newTrack(now);
            this.#track.set(gid, track);
        }
        track.lastSeen = now;
        const h = track.hist;
        const slot = h[track.histHead];
        slot.x = x;
        slot.y = y;
        slot.t = now;
        track.histHead = (track.histHead + 1) % histCap;
        track.histLen = track.histLen < histCap ? track.histLen + 1 : histCap;
        const oldest = h[(track.histHead - track.histLen + histCap) % histCap];
        const span = (now - oldest.t) / 1000;
        if (now - oldest.t < minTrackMs || span <= 0) return null;
        let vxWindow = (x - oldest.x) / span;
        let vyWindow = (y - oldest.y) / span;
        const magnitude = length(vxWindow, vyWindow);
        if (magnitude < 30) return { x, y, vx: 0, vy: 0, ax: 0, ay: 0 };
        if (magnitude <= 150 && typeof moveAngle === "number") {
            const delta = ((moveAngle - Math.atan2(vyWindow, vxWindow)) * 180) / Math.PI;
            const drift = Math.abs(((((delta + 180) % 360) + 360) % 360) - 180);
            if (drift < 45) {
                vxWindow = Math.cos(moveAngle) * magnitude;
                vyWindow = Math.sin(moveAngle) * magnitude;
            }
        }
        let dx = 0;
        let dy = 0;
        for (let k = track.histLen - 2; k >= 0; k--) {
            const point = h[(track.histHead - 1 - k + 2 * histCap) % histCap];
            if (point.x === x && point.y === y) continue;
            dx = x - point.x;
            dy = y - point.y;
            break;
        }
        const direction = length(dx, dy);
        const speed = Math.min(
            magnitude,
            moveSpeed >= 200 && moveSpeed <= 1500 ? moveSpeed : magnitude
        );
        if (direction < 0.5 || speed > maxSpeedEst) return null;
        const vx = (dx / direction) * speed;
        const vy = (dy / direction) * speed;
        const vh = track.vhist;
        const vslot = vh[track.vHead];
        vslot.x = vx;
        vslot.y = vy;
        vslot.t = now;
        track.vHead = (track.vHead + 1) % vhistCap;
        track.vLen = track.vLen < vhistCap ? track.vLen + 1 : vhistCap;
        let ax = 0;
        let ay = 0;
        for (let k = 0; k < track.vLen; k++) {
            const past = vh[(track.vHead - track.vLen + k + 2 * vhistCap) % vhistCap];
            const dt = (now - past.t) / 1000;
            if (dt < 0.12) continue;
            ax = (vx - past.x) / dt;
            ay = (vy - past.y) / dt;
            break;
        }
        if (lengthSquared(ax, ay) > maxAccel * maxAccel) {
            ax = 0;
            ay = 0;
        }
        return { x, y, vx, vy, ax, ay };
    }

    #flightTime(rx, ry, vx, vy, speed) {
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

    #snapTicks(t) {
        if (!(this.#ownTicks > 0) || !isFinite(t) || t <= 0) return t;
        const maxT = this.#ownTicks >= beamTicks ? maxFlightS : this.#ownTicks * tickS;
        const snapped = Math.round(t / tickS) * tickS;
        return Math.min(snapped > 0 ? snapped : tickS, maxT);
    }

    #solve(mx, my, pred, speed, range) {
        const pocket = (this.#ownShotR > 0 ? this.#ownShotR : 0) + (pred.rad > 0 ? pred.rad : 0);
        if (this.#ownBeam) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };
        if (range > 0) {
            const d0 = distance(pred.x, pred.y, mx, my) - pocket;
            if (d0 > range) return null;
        }
        if (!(speed > 0)) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };
        const lead = this.#ownSteerLife > 0 ? steerLeadFactor : 1;
        const pvx = pred.vx * lead;
        const pvy = pred.vy * lead;
        const pax = pred.ax * lead;
        const pay = pred.ay * lead;
        let px = pred.x;
        let py = pred.y;
        let t = this.#flightTime(pred.x - mx, pred.y - my, pvx, pvy, speed);
        if (t > 0) {
            for (let pass = 0; pass < leadPasses; pass++) {
                px = pred.x + pvx * t + 0.5 * pax * t * t;
                py = pred.y + pvy * t + 0.5 * pay * t * t;
                const flown = distance(px, py, mx, my) - pocket;
                if (!(flown > 0)) break;
                t = this.#snapTicks(flown / speed);
            }
        } else {
            for (let pass = 0; pass < leadPasses; pass++) {
                const flightTo = distance(px, py, mx, my) - pocket;
                if (range > 0 && flightTo > range) return null;
                const flight = flightTo > 0 ? this.#snapTicks(flightTo / speed) : 0;
                if (flight > maxFlightS) return null;
                px = pred.x + pvx * flight + 0.5 * pax * flight * flight;
                py = pred.y + pvy * flight + 0.5 * pay * flight * flight;
            }
            return { x: Math.round(px), y: Math.round(py), t: 0 };
        }
        if (range > 0 && distance(px, py, mx, my) - pocket > range) return null;
        if (t > maxFlightS) return null;
        return { x: Math.round(px), y: Math.round(py), t };
    }

    #readInt(data, off, getter, min, max) {
        if (getter) {
            try {
                const v = getter(data) | 0;
                if (v >= min && v <= max) return v;
            } catch (_) {}
        }
        try {
            const v = data.add(off).readS32() | 0;
            if (v >= min && v <= max) return v;
        } catch (_) {}
        return 0;
    }

    #ownProjectileSpeed() {
        const now = Date.now();
        if (this.#projectileSpeed >= 300 && now - this.#speedAt < speedRefreshMs)
            return this.#projectileSpeed;
        if (
            this.#projectileSpeed < 300 &&
            this.#speedFailAt > 0 &&
            now - this.#speedFailAt < speedFailRetryMs
        )
            return this.#projectileSpeed;
        let speed = 0;
        let engineSpeed = 0;
        try {
            const fns = getFunctions();
            const own = scanData.ownCharacter;
            if (
                own &&
                !own.isNull() &&
                fns.LogicCharacterClient_getWeaponSkill &&
                fns.LogicSkillData_getProjectileData
            ) {
                const skill = fns.LogicCharacterClient_getWeaponSkill(own);
                let data =
                    skill && !skill.isNull()
                        ? fns.LogicSkillData_getProjectileData(skill, 0)
                        : null;
                if ((!data || data.isNull()) && skill && !skill.isNull()) {
                    try {
                        const direct = skill
                            .add(offsets.LogicSkillData_projectileData)
                            .readPointer();
                        if (direct && !direct.isNull()) data = direct;
                    } catch (_) {}
                }
                if (data && !data.isNull()) {
                    engineSpeed = this.#readInt(
                        data,
                        offsets.LogicProjectileData_speed,
                        fns.LogicProjectileData_getSpeed,
                        300,
                        8500
                    );
                    this.#ownBeam = data.add(offsets.LogicProjectileData_isBeamField).readU8() > 0;
                    const passes =
                        data.add(offsets.LogicProjectileData_passesEnvironment).readU8() & 1;
                    const pierces =
                        data.add(offsets.LogicProjectileData_piercesEnvironmentField).readU8() & 1;
                    this.#ownPierces = (passes | pierces) === 1;
                    try {
                        this.#ownPiercesChars =
                            (data.add(offsets.LogicProjectileData_piercesCharacters).readU8() &
                                1) ===
                            1;
                    } catch (_) {
                        this.#ownPiercesChars = false;
                    }
                    let rad = this.#readInt(
                        data,
                        offsets.LogicProjectileData_radius,
                        fns.LogicProjectileData_getRadius,
                        1,
                        2000
                    );
                    if (!(rad > 0) && fns.LogicCharacterData_getProjectileStartRadius) {
                        try {
                            const ownData = dataOf(own);
                            if (ownData && !ownData.isNull()) {
                                const start =
                                    fns.LogicCharacterData_getProjectileStartRadius(ownData) | 0;
                                if (start >= 1 && start <= 2000) rad = start;
                            }
                        } catch (_) {}
                    }
                    this.#ownShotR = rad;
                    try {
                        const steer = data
                            .add(offsets.LogicProjectileData_steerStrength)
                            .readFloat();
                        const life = this.#readInt(
                            data,
                            offsets.LogicProjectileData_steerLifeTime,
                            null,
                            1,
                            20000
                        );
                        this.#ownSteerLife = steer > 0 && life > 0 ? life : 0;
                    } catch (_) {
                        this.#ownSteerLife = 0;
                    }
                    const learned = travelFor(data);
                    const tiles = weaponRangeUnits(own);
                    const speedForTicks =
                        engineSpeed > 0 ? engineSpeed : scanData.measuredSpeed | 0;
                    const calibrated = rangeScaleCalibrated();
                    this.#ownTicks = learned && learned.ticks > 0 ? learned.ticks : 0;
                    if (!(this.#ownTicks > 0) && calibrated && tiles > 0 && speedForTicks > 0) {
                        this.#ownTicks = Math.max(
                            1,
                            Math.round((tiles * ticksPerSec) / speedForTicks)
                        );
                    }
                    this.#ownTravel =
                        learned && learned.range > 0
                            ? learned.range
                            : calibrated
                              ? travelDistance(this.#ownTicks, speedForTicks)
                              : 0;
                    if (this.#ownTicks >= beamTicks) this.#ownBeam = true;
                }
            }
        } catch (_) {}
        const observed = scanData.measuredSpeed | 0;
        if (engineSpeed > 0) speed = engineSpeed;
        else if (observed >= 300 && observed <= 8500) speed = observed;
        if (speed >= 300 && speed <= 8500) {
            this.#projectileSpeed = speed;
            this.#speedAt = now;
        } else {
            this.#speedFailAt = now;
        }
        return this.#projectileSpeed;
    }

    #ownRange() {
        const now = Date.now();
        if (now - this.#rangeAt < speedRefreshMs) return this.#rangeCache;
        this.#rangeAt = now;
        this.#rangeCache = 0;
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return 0;
        const tiles = weaponRangeUnits(own);
        const flight = this.#ownTravel > 0 ? this.#ownTravel : 0;
        if (flight > 0 && (tiles <= 0 || (flight >= tiles * 0.8 && flight <= tiles * 1.6))) {
            this.#rangeCache = flight;
        } else {
            this.#rangeCache = tiles;
        }
        return this.#rangeCache;
    }

    #aimAt(enemy, now) {
        if (!enemy || !enemy.ptr || enemy.ptr.isNull()) return null;
        const fns = getFunctions();
        const target = isValidPtr(enemy.body) ? enemy.body : enemy.ptr;
        let ex = enemy.x;
        let ey = enemy.y;
        try {
            const gx = fns.LogicGameObjectClient_getX(target) | 0;
            const gy = fns.LogicGameObjectClient_getY(target) | 0;
            if (isFinite(gx) && isFinite(gy) && (gx !== 0 || gy !== 0)) {
                ex = gx;
                ey = gy;
            }
        } catch (_) {}
        if (!isFinite(ex) || !isFinite(ey) || (ex === 0 && ey === 0)) return null;
        const mx = scanData.myX;
        const my = scanData.myY;
        const speed = this.#ownProjectileSpeed();
        const pred = this.#sample(enemy.gid, ex, ey, enemy.moveSpeed, enemy.moveAngle, now) || {
            x: ex,
            y: ey,
            vx: 0,
            vy: 0,
            ax: 0,
            ay: 0
        };
        pred.rad = enemy.radius | 0;
        const aim = this.#solve(mx, my, pred, speed, this.#ownRange());
        if (!aim) return null;
        if (!this.#ownPierces) {
            const pocketR = this.#ownShotR > 0 ? this.#ownShotR : 40;
            if (!isFinite(aim.x) || !isFinite(aim.y)) return null;
            if (!losCheckWide(mx, my, aim.x, aim.y, projectileBit, pocketR)) {
                let cleared = null;
                for (let k = 0; k < 3; k++) {
                    const frac = k === 0 ? 0.55 : k === 1 ? 0.25 : 0;
                    const cx = pred.x + (aim.x - pred.x) * frac;
                    const cy = pred.y + (aim.y - pred.y) * frac;
                    if (
                        isFinite(cx) &&
                        isFinite(cy) &&
                        losCheckWide(mx, my, cx, cy, projectileBit, pocketR)
                    ) {
                        cleared = { x: Math.round(cx), y: Math.round(cy), t: aim.t * frac };
                        break;
                    }
                }
                if (!cleared) return null;
                const ax = cleared.x | 0;
                const ay = cleared.y | 0;
                if (!isFinite(ax) || !isFinite(ay)) return null;
                if (ax === 0 && ay === 0) return null;
                if (ax < -100000 || ax > 100000 || ay < -100000 || ay > 100000) return null;
                if (ax === (mx | 0) && ay === (my | 0)) return null;
                return cleared;
            }
        }
        const ax = aim.x | 0;
        const ay = aim.y | 0;
        if (!isFinite(ax) || !isFinite(ay)) return null;
        if (ax === 0 && ay === 0) return null;
        if (ax < -100000 || ax > 100000 || ay < -100000 || ay > 100000) return null;
        if (ax === (mx | 0) && ay === (my | 0)) return null;
        return { x: ax, y: ay, t: aim.t };
    }

    #lineupHits(list, mx, my, target, pocket) {
        const ax = target.x - mx;
        const ay = target.y - my;
        const len = length(ax, ay);
        if (len < 1) return 0;
        const ux = ax / len;
        const uy = ay / len;
        let hits = 0;
        for (let i = 0; i < list.length; i++) {
            const other = list[i];
            if (!other || other === target) continue;
            if (other.kind !== "player") continue;
            if (this.#isSkipped(other.brawlerName)) continue;
            const rx = other.x - mx;
            const ry = other.y - my;
            const along = rx * ux + ry * uy;
            if (along <= 0 || along > len * 1.6) continue;
            const off = Math.abs(rx * -uy + ry * ux);
            if (off <= pocket + (other.radius > 0 ? other.radius : 60)) hits++;
        }
        return hits;
    }

    #ptrAlive(candidate) {
        if (!candidate || candidate.isNull()) return null;
        const list = scanData.enemies || [];
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (e && e.ptr && !e.ptr.isNull() && e.ptr.equals(candidate)) return e.ptr;
        }
        return null;
    }

    #enemyByPtr(candidate) {
        if (!candidate || candidate.isNull()) return null;
        const list = scanData.enemies || [];
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (e && e.ptr && !e.ptr.isNull() && e.ptr.equals(candidate)) return e;
        }
        return null;
    }

    #aimPointNow() {
        const now = Date.now();
        const live = this.#target ? this.#ptrAlive(this.#target.ptr) : null;
        let enemy = live ? this.#target : this.#pickTarget(now);
        if (!enemy) {
            const viaGame = this.#enemyByPtr(this.#gameTarget);
            if (viaGame) enemy = viaGame;
        }
        if (!enemy) return null;
        return this.#aimAt(enemy, now);
    }

    #pickTarget(now) {
        const list = scanData.enemies || [];
        const mx = scanData.myX;
        const my = scanData.myY;
        const speed = this.#ownProjectileSpeed();
        const range = this.#ownRange();
        let best = null;
        let bestD = Infinity;
        let bestPred = null;
        let calm = null;
        let calmD = Infinity;
        let calmPred = null;
        let cur = null;
        let curD = Infinity;
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (!e || !e.ptr || e.ptr.isNull()) continue;
            if (e.kind !== "player") continue;
            if (this.#isSkipped(e.brawlerName)) continue;
            if (
                !this.#ownPierces &&
                losCheckWide(
                    mx,
                    my,
                    e.x,
                    e.y,
                    projectileBit,
                    this.#ownShotR > 0 ? this.#ownShotR : 40
                ) === false
            )
                continue;
            const pred = this.#sample(e.gid, e.x, e.y, e.moveSpeed, e.moveAngle, now) || {
                x: e.x,
                y: e.y,
                vx: 0,
                vy: 0,
                ax: 0,
                ay: 0
            };
            pred.rad = e.radius | 0;
            const d = distance(e.x, e.y, mx, my);
            const pocket = (this.#ownShotR > 0 ? this.#ownShotR : 0) + pred.rad;
            if (range > 0 && d - pocket > range) continue;
            const score = this.#ownPiercesChars
                ? d - this.#lineupHits(list, mx, my, e, pocket) * lineupBonus
                : d;
            if (score < calmD) {
                calmD = score;
                calm = e;
                calmPred = pred;
            }
            if (score < bestD) {
                bestD = score;
                best = e;
                bestPred = pred;
            }
            if (this.#target && e.gid === this.#target.gid) {
                cur = e;
                curD = score;
            }
        }
        if (calm && calmD <= bestD * 1.4) {
            best = calm;
            bestD = calmD;
            bestPred = calmPred;
        }
        let pick;
        let pred;
        if (cur && best && curD <= bestD * stickyMargin) {
            pick = cur;
            pred =
                cur.gid === best.gid
                    ? bestPred
                    : this.#sample(cur.gid, cur.x, cur.y, cur.moveSpeed, cur.moveAngle, now);
            if (pred) pred.rad = cur.radius | 0;
        } else {
            pick = best;
            pred = bestPred;
        }
        if (!pick || !pred) return null;
        if (this.#track.size > 24) {
            for (const [key, tr] of this.#track) {
                if (now - tr.lastSeen > trackPruneMs) this.#track.delete(key);
            }
        }
        if (!this.#solve(mx, my, pred, speed, range)) return null;
        return pick;
    }

    #resetWeaponCache() {
        this.#projectileSpeed = 0;
        this.#speedAt = 0;
        this.#speedFailAt = 0;
        this.#rangeCache = 0;
        this.#rangeAt = 0;
        this.#ownShotR = 0;
        this.#ownTicks = 0;
        this.#ownTravel = 0;
        this.#ownSteerLife = 0;
        this.#ownBeam = false;
        this.#ownPierces = false;
        this.#ownPiercesChars = false;
    }

    setup() {
        if (this.#hooks) return;
        this.#hooks = true;
        const base = getBase();
        const self = this;
        try {
            enableProjectileTracking();
            onDataReload(() => self.#resetWeaponCache());
        } catch (_) {}
        try {
            Interceptor.attach(base.add(offsets.BattleScreen_getClosestTargetForAutoshoot), {
                onLeave(retval) {
                    try {
                        if (retval.isNull()) return;
                        self.#gameTarget = retval;
                    } catch (_) {}
                }
            });
        } catch (_) {}
        try {
            Interceptor.attach(base.add(offsets.BattleScreen_activateSkill), {
                onEnter(args) {
                    const aim = self.#aimPointNow();
                    if (!aim) return;
                    try {
                        const ax = aim.x | 0;
                        const ay = aim.y | 0;
                        const mx = scanData.myX | 0;
                        const my = scanData.myY | 0;
                        if (!isFinite(ax) || !isFinite(ay)) return;
                        if (ax === 0 && ay === 0) return;
                        if (ax === mx && ay === my) return;
                        args[1] = ptr(ax);
                        args[2] = ptr(ay);
                    } catch (_) {}
                }
            });
        } catch (_) {}
    }

    update() {
        if (scanData.lastUpdate === 0) {
            this.#target = null;
            return;
        }
        this.#target = this.#pickTarget(Date.now());
    }

    reset() {
        this.#target = null;
        this.#track.clear();
        this.#resetWeaponCache();
    }
}

const autoaim = new Autoaim();

export const setupAutoaim = () => autoaim.setup();
export const updateAutoaim = () => autoaim.update();
export const resetAutoaim = () => autoaim.reset();
