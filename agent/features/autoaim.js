import { getBase, getFunctions, isValidPtr } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import {
    beamTicks,
    dataOf,
    enableProjectileTracking,
    onDataReload,
    scanData,
    ticksPerSec,
    travelDistance,
    travelTicksFor,
    weaponRangeUnits
} from "../core/scan.js";
import { losCheckWide, projectileBit } from "../utils/walls.js";

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
const walkbackFracs = [0.55, 0.25, 0];

const length = (x, y) => Math.floor(Math.hypot(x, y));

const lengthSquared = (x, y) => x * x + y * y;

const distance = (x1, y1, x2, y2) => length(x2 - x1, y2 - y1);

class AutoAim {
    #target = null;
    #gameTarget = null;
    #aimPt = null;
    #aimStamp = 0;
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
        for (const skipNamePart of skipNameParts) {
            if (name.includes(skipNamePart)) return true;
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

    #trackFor(gid, now) {
        let track = this.#track.get(gid);
        if (track) return track;
        track = this.#newTrack(now);
        this.#track.set(gid, track);
        return track;
    }

    #windowVelocity(track, x, y, moveAngle, now) {
        const h = track.hist;
        const oldest = h[(track.histHead - track.histLen + histCap) % histCap];
        const span = (now - oldest.t) / 1000;
        if (now - oldest.t < minTrackMs || span <= 0) return null;
        let vxWindow = (x - oldest.x) / span;
        let vyWindow = (y - oldest.y) / span;
        const magnitude = length(vxWindow, vyWindow);
        if (magnitude <= 150 && typeof moveAngle === "number") {
            const delta = ((moveAngle - Math.atan2(vyWindow, vxWindow)) * 180) / Math.PI;
            const drift = Math.abs(((((delta + 180) % 360) + 360) % 360) - 180);
            if (drift < 45) {
                vxWindow = Math.cos(moveAngle) * magnitude;
                vyWindow = Math.sin(moveAngle) * magnitude;
            }
        }
        return { vx: vxWindow, vy: vyWindow, magnitude };
    }

    #directionSpeed(track, x, y, moveSpeed, window) {
        const h = track.hist;
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
            window.magnitude,
            moveSpeed >= 200 && moveSpeed <= 1500 ? moveSpeed : window.magnitude
        );
        if (direction < 0.5 || speed > maxSpeedEst) return null;
        return { vx: (dx / direction) * speed, vy: (dy / direction) * speed };
    }

    #accelAt(track, vx, vy, now) {
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
        return { ax, ay };
    }

    #sample(e, x, y, now) {
        const track = this.#trackFor(e.gid, now);
        track.lastSeen = now;
        const slot = track.hist[track.histHead];
        slot.x = x;
        slot.y = y;
        slot.t = now;
        track.histHead = (track.histHead + 1) % histCap;
        track.histLen = track.histLen < histCap ? track.histLen + 1 : histCap;
        const window = this.#windowVelocity(track, x, y, e.moveAngle, now);
        if (!window) return null;
        if (window.magnitude < 30) return { x, y, vx: 0, vy: 0, ax: 0, ay: 0 };
        const dir = this.#directionSpeed(track, x, y, e.moveSpeed, window);
        if (!dir) return null;
        const accel = this.#accelAt(track, dir.vx, dir.vy, now);
        return { x, y, vx: dir.vx, vy: dir.vy, ax: accel.ax, ay: accel.ay };
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

    #applyLead(pred, lead) {
        pred.leadVx = pred.vx * lead;
        pred.leadVy = pred.vy * lead;
        pred.leadAx = pred.ax * lead;
        pred.leadAy = pred.ay * lead;
    }

    #solveFlying(pred, speed, range, pocket, t) {
        let px = pred.x;
        let py = pred.y;
        for (let pass = 0; pass < leadPasses; pass++) {
            px = pred.x + pred.leadVx * t + 0.5 * pred.leadAx * t * t;
            py = pred.y + pred.leadVy * t + 0.5 * pred.leadAy * t * t;
            const flown = distance(px, py, scanData.myX, scanData.myY) - pocket;
            if (!(flown > 0)) break;
            t = this.#snapTicks(flown / speed);
        }
        if (range > 0 && distance(px, py, scanData.myX, scanData.myY) - pocket > range) return null;
        if (t > maxFlightS) return null;
        return { x: Math.round(px), y: Math.round(py), t };
    }

    #solveIncremental(pred, speed, range, pocket) {
        let px = pred.x;
        let py = pred.y;
        for (let pass = 0; pass < leadPasses; pass++) {
            const flightTo = distance(px, py, scanData.myX, scanData.myY) - pocket;
            if (range > 0 && flightTo > range) return null;
            const flight = flightTo > 0 ? this.#snapTicks(flightTo / speed) : 0;
            if (flight > maxFlightS) return null;
            px = pred.x + pred.leadVx * flight + 0.5 * pred.leadAx * flight * flight;
            py = pred.y + pred.leadVy * flight + 0.5 * pred.leadAy * flight * flight;
        }
        return { x: Math.round(px), y: Math.round(py), t: 0 };
    }

    #solve(pred, speed, range) {
        const pocket = Math.max(this.#ownShotR, 0) + Math.max(pred.rad, 0);
        if (this.#ownBeam) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };
        if (range > 0) {
            const d0 = distance(pred.x, pred.y, scanData.myX, scanData.myY) - pocket;
            if (d0 > range) return null;
        }
        if (!(speed > 0)) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };
        this.#applyLead(pred, this.#ownSteerLife > 0 ? steerLeadFactor : 1);
        const t = this.#flightTime(
            pred.x - scanData.myX,
            pred.y - scanData.myY,
            pred.leadVx,
            pred.leadVy,
            speed
        );
        if (t > 0) return this.#solveFlying(pred, speed, range, pocket, t);
        return this.#solveIncremental(pred, speed, range, pocket);
    }

    #readInt(data, off, min, max) {
        try {
            const v = Math.trunc(data.add(off).readS32());
            if (v >= min && v <= max) return v;
        } catch {}
        return 0;
    }

    #ownProjectileData(own) {
        const fns = getFunctions();
        const skill = fns.LogicCharacterClient_getWeaponSkill(own);
        let data = skill && !skill.isNull() ? fns.LogicSkillData_getProjectileData(skill, 0) : null;
        if ((!data || data.isNull()) && skill && !skill.isNull()) {
            try {
                const direct = skill.add(offsets.LogicSkillData_projectileData).readPointer();
                if (direct && !direct.isNull()) data = direct;
            } catch {}
        }
        return data && !data.isNull() ? data : null;
    }

    #shotRadius(data, own, fns) {
        let rad = this.#readInt(data, offsets.LogicProjectileData_radius, 1, 2000);
        if (!(rad > 0) && fns.LogicCharacterData_getProjectileStartRadius) {
            try {
                const ownData = dataOf(own);
                if (ownData && !ownData.isNull()) {
                    const start = Math.trunc(
                        fns.LogicCharacterData_getProjectileStartRadius(ownData)
                    );
                    if (start >= 1 && start <= 2000) rad = start;
                }
            } catch {}
        }
        return rad;
    }

    #learnSteer(data) {
        try {
            const steer = data.add(offsets.LogicProjectileData_steerStrength).readFloat();
            const life = this.#readInt(
                data,
                offsets.LogicProjectileData_steerLifeTime,
                null,
                1,
                20000
            );
            this.#ownSteerLife = steer > 0 && life > 0 ? life : 0;
        } catch {
            this.#ownSteerLife = 0;
        }
    }

    #learnTravelTicks(data, engineSpeed, own) {
        const tiles = weaponRangeUnits(own);
        const speedForTicks = engineSpeed > 0 ? engineSpeed : this.#projectileSpeed;
        this.#ownTicks =
            speedForTicks > 0 && tiles > 0 ? travelTicksFor(data, tiles, speedForTicks) : 0;
        this.#ownTravel = this.#ownTicks > 0 ? travelDistance(this.#ownTicks, speedForTicks) : 0;
        if (this.#ownTicks >= beamTicks) this.#ownBeam = true;
    }

    #learnWeaponState(data, own) {
        const fns = getFunctions();
        const engineSpeed = this.#readInt(data, offsets.LogicProjectileData_speed, 300, 8500);
        this.#ownBeam = data.add(offsets.LogicProjectileData_isBeamField).readU8() > 0;
        const passes = data.add(offsets.LogicProjectileData_passesEnvironment).readU8() & 1;
        const pierces = data.add(offsets.LogicProjectileData_piercesEnvironmentField).readU8() & 1;
        this.#ownPierces = (passes | pierces) === 1;
        try {
            this.#ownPiercesChars =
                (data.add(offsets.LogicProjectileData_piercesCharacters).readU8() & 1) === 1;
        } catch {
            this.#ownPiercesChars = false;
        }
        this.#ownShotR = this.#shotRadius(data, own, fns);
        this.#learnSteer(data);
        this.#learnTravelTicks(data, engineSpeed, own);
        return engineSpeed;
    }

    #refreshWeapon(now) {
        let engineSpeed = 0;
        try {
            const own = scanData.ownCharacter;
            const fns = getFunctions();
            if (
                own &&
                !own.isNull() &&
                fns.LogicCharacterClient_getWeaponSkill &&
                fns.LogicSkillData_getProjectileData
            ) {
                const data = this.#ownProjectileData(own);
                if (data) engineSpeed = this.#learnWeaponState(data, own);
            }
        } catch {}
        const speed = engineSpeed;
        if (speed >= 300 && speed <= 8500) {
            this.#projectileSpeed = speed;
            this.#speedAt = now;
        } else {
            this.#speedFailAt = now;
        }
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
        this.#refreshWeapon(now);
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
        const flight = Math.max(this.#ownTravel, 0);
        if (flight > 0 && (tiles <= 0 || (flight >= tiles * 0.8 && flight <= tiles * 1.6))) {
            this.#rangeCache = flight;
        } else {
            this.#rangeCache = tiles;
        }
        return this.#rangeCache;
    }

    #targetPos(enemy) {
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

    #inBounds(x, y, mx, my) {
        if (!isFinite(x) || !isFinite(y)) return false;
        if (x === 0 && y === 0) return false;
        if (x < -100000 || x > 100000 || y < -100000 || y > 100000) return false;
        if (x === Math.trunc(mx) && y === Math.trunc(my)) return false;
        return true;
    }

    #finishAim(aim, mx, my) {
        const ax = Math.trunc(aim.x);
        const ay = Math.trunc(aim.y);
        if (!this.#inBounds(ax, ay, mx, my)) return null;
        return { x: ax, y: ay, t: aim.t };
    }

    #blockedWalkback(pred, aim, mx, my, pocketR) {
        for (const frac of walkbackFracs) {
            const cx = pred.x + (aim.x - pred.x) * frac;
            const cy = pred.y + (aim.y - pred.y) * frac;
            if (!isFinite(cx) || !isFinite(cy)) continue;
            if (losCheckWide(mx, my, cx, cy, { bit: projectileBit, radius: pocketR })) {
                const x = Math.round(cx);
                const y = Math.round(cy);
                if (!this.#inBounds(x, y, mx, my)) return null;
                return { x, y, t: aim.t * frac };
            }
        }
        return null;
    }

    #aimAt(enemy, now) {
        if (!enemy || !enemy.ptr || enemy.ptr.isNull()) return null;
        const pos = this.#targetPos(enemy);
        if (!pos) return null;
        const mx = scanData.myX;
        const my = scanData.myY;
        const speed = this.#ownProjectileSpeed();
        const pred = this.#sample(enemy, pos.x, pos.y, now) || {
            x: pos.x,
            y: pos.y,
            vx: 0,
            vy: 0,
            ax: 0,
            ay: 0
        };
        pred.rad = Math.trunc(enemy.radius);
        const aim = this.#solve(pred, speed, this.#ownRange());
        if (!aim) return null;
        if (this.#ownPierces) return this.#finishAim(aim, mx, my);
        const pocketR = this.#ownShotR > 0 ? this.#ownShotR : 40;
        if (!isFinite(aim.x) || !isFinite(aim.y)) return null;
        if (losCheckWide(mx, my, aim.x, aim.y, { bit: projectileBit, radius: pocketR }))
            return this.#finishAim(aim, mx, my);
        return this.#blockedWalkback(pred, aim, mx, my, pocketR);
    }

    #lineupHits(list, mx, my, target, pocket) {
        const ax = target.x - mx;
        const ay = target.y - my;
        const len = length(ax, ay);
        if (len < 1) return 0;
        const ux = ax / len;
        const uy = ay / len;
        let hits = 0;
        for (const other of list) {
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
        for (const e of list) {
            if (e && e.ptr && !e.ptr.isNull() && e.ptr.equals(candidate)) return e.ptr;
        }
        return null;
    }

    #enemyByPtr(candidate) {
        if (!candidate || candidate.isNull()) return null;
        const list = scanData.enemies || [];
        for (const e of list) {
            if (e && e.ptr && !e.ptr.isNull() && e.ptr.equals(candidate)) return e;
        }
        return null;
    }

    #aimPoint() {
        const now = Date.now();
        if (now - this.#aimStamp < 25) return this.#aimPt;
        this.#aimStamp = now;
        this.#aimPt = this.#aimPointNow();
        return this.#aimPt;
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

    #enemyEligible(e, mx, my) {
        if (!e || !e.ptr || e.ptr.isNull()) return false;
        if (e.kind !== "player") return false;
        if (this.#isSkipped(e.brawlerName)) return false;
        if (this.#ownPierces) return true;
        const pocketR = this.#ownShotR > 0 ? this.#ownShotR : 40;
        return losCheckWide(mx, my, e.x, e.y, { bit: projectileBit, radius: pocketR }) !== false;
    }

    #consider(state, e, pred, score) {
        if (score < state.calm.d) state.calm = { e, pred, d: score };
        if (score < state.best.d) state.best = { e, pred, d: score };
        if (this.#target && e.gid === this.#target.gid) state.cur = { e, pred, d: score };
    }

    #pruneTracks(now) {
        if (this.#track.size <= 24) return;
        for (const [key, tr] of this.#track) {
            if (now - tr.lastSeen > trackPruneMs) this.#track.delete(key);
        }
    }

    #selectPick(state, now) {
        let best = state.best;
        if (state.calm.e && state.calm.d <= state.best.d * 1.4) best = state.calm;
        if (!state.cur || !best.e || state.cur.d > best.d * stickyMargin)
            return { pick: best.e, pred: best.pred };
        const pred =
            state.cur.e.gid === best.e.gid
                ? best.pred
                : this.#sample(state.cur.e, state.cur.e.x, state.cur.e.y, now);
        if (pred) pred.rad = Math.trunc(state.cur.e.radius);
        return { pick: state.cur.e, pred };
    }

    #pickTarget(now) {
        const list = scanData.enemies || [];
        const mx = scanData.myX;
        const my = scanData.myY;
        const speed = this.#ownProjectileSpeed();
        const range = this.#ownRange();
        const state = {
            best: { e: null, pred: null, d: Infinity },
            calm: { e: null, pred: null, d: Infinity },
            cur: null
        };
        for (const e of list) {
            if (!this.#enemyEligible(e, mx, my)) continue;
            const pred = this.#sample(e, e.x, e.y, now) || {
                x: e.x,
                y: e.y,
                vx: 0,
                vy: 0,
                ax: 0,
                ay: 0
            };
            pred.rad = Math.trunc(e.radius);
            const d = distance(e.x, e.y, mx, my);
            const pocket = Math.max(this.#ownShotR, 0) + pred.rad;
            if (range > 0 && d - pocket > range) continue;
            const score = this.#ownPiercesChars
                ? d - this.#lineupHits(list, mx, my, e, pocket) * lineupBonus
                : d;
            this.#consider(state, e, pred, score);
        }
        const { pick, pred } = this.#selectPick(state, now);
        if (!pick || !pred) return null;
        this.#pruneTracks(now);
        if (!this.#solve(pred, speed, range)) return null;
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
        try {
            enableProjectileTracking();
            onDataReload(() => this.#resetWeaponCache());
        } catch {}
        try {
            Interceptor.attach(base.add(offsets.BattleScreen_getClosestTargetForAutoshoot), {
                onLeave: (retval) => {
                    try {
                        if (retval.isNull()) return;
                        this.#gameTarget = retval;
                    } catch {}
                }
            });
        } catch {}
        try {
            Interceptor.attach(base.add(offsets.BattleScreen_activateSkill), {
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
                }
            });
        } catch {}
    }

    update() {
        if (scanData.lastUpdate === 0) {
            this.#target = null;
            return;
        }
        this.#target = this.#pickTarget(Date.now());
        this.#aimPoint();
    }

    reset() {
        this.#target = null;
        this.#aimPt = null;
        this.#aimStamp = 0;
        this.#track.clear();
        this.#resetWeaponCache();
    }
}

const autoAim = new AutoAim();

export const setupAutoAim = () => autoAim.setup();
export const updateAutoAim = () => autoAim.update();
export const resetAutoAim = () => autoAim.reset();
