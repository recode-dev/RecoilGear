import { getBase, getFunctions, isValidPtr } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import {
    BEAM_TICKS,
    TICKS_PER_SEC,
    dataOf,
    rangeScaleCalibrated,
    enableProjectileTracking,
    onDataReload,
    scanData,
    travelDistance,
    travelFor,
    weaponRangeUnits
} from "../core/scan.js";
import { BLOCKS_PROJECTILES, losCheck } from "../utils/walls.js";

const MAXI = 0x7fffffff;
const GUARD = 0xb504;

const _sqrt = (v) => {
    if (v <= 0) return 0;
    if (v >= MAXI) return 46340;
    return Math.floor(Math.sqrt(v));
};

function length(x, y) {
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return 46340;
    const s = x * x + y * y;
    return s < 0 ? 46340 : _sqrt(s);
}

function lengthSquared(x, y) {
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return MAXI;
    const s = x * x + y * y;
    return s < 0 ? MAXI : s;
}

function distance(x1, y1, x2, y2) {
    return length(x2 - x1, y2 - y1);
}

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
const STEER_LEAD_FACTOR = 0.75;
const LINEUP_BONUS = 220;

var _target = null;
var _gameTarget = null;
var _track = new Map();
var _projectileSpeed = 0;
var _speedAt = 0;
var _speedFailAt = 0;
var _ownBeam = false;
var _ownPierces = false;
var _ownPiercesChars = false;
var _ownShotR = 0;
var _ownTicks = 0;
var _ownTravel = 0;
var _ownSteerLife = 0;
var _rangeCache = 0;
var _rangeAt = 0;
var _hooks = false;

function _isSkipped(name) {
    if (!name) return true;
    for (let i = 0; i < SKIP_NAME_PARTS.length; i++) {
        if (name.indexOf(SKIP_NAME_PARTS[i]) >= 0) return true;
    }
    return false;
}

function _newTrack(now) {
    const track = {
        hist: [],
        histHead: 0,
        histLen: 0,
        vhist: [],
        vHead: 0,
        vLen: 0,
        lastSeen: now
    };
    for (let i = 0; i < HIST_CAP; i++) track.hist.push({ x: 0, y: 0, t: 0 });
    for (let i = 0; i < VHIST_CAP; i++) track.vhist.push({ x: 0, y: 0, t: 0 });
    return track;
}

function _sample(gid, x, y, moveSpeed, moveAngle, now) {
    let track = _track.get(gid);
    if (!track) {
        track = _newTrack(now);
        _track.set(gid, track);
    }
    track.lastSeen = now;

    const h = track.hist;
    const slot = h[track.histHead];
    slot.x = x;
    slot.y = y;
    slot.t = now;
    track.histHead = (track.histHead + 1) % HIST_CAP;
    track.histLen = track.histLen < HIST_CAP ? track.histLen + 1 : HIST_CAP;

    const oldest = h[(track.histHead - track.histLen + HIST_CAP) % HIST_CAP];
    const span = (now - oldest.t) / 1000;
    if (now - oldest.t < MIN_TRACK_MS || span <= 0) return null;

    let vxWindow = (x - oldest.x) / span;
    let vyWindow = (y - oldest.y) / span;
    const magnitude = length(vxWindow, vyWindow);
    if (magnitude < 30) return { x: x, y: y, vx: 0, vy: 0, ax: 0, ay: 0 };

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
        const point = h[(track.histHead - 1 - k + 2 * HIST_CAP) % HIST_CAP];
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
    if (direction < 0.5 || speed > MAX_SPEED_EST) return null;

    const vx = (dx / direction) * speed;
    const vy = (dy / direction) * speed;

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

    return { x: x, y: y, vx: vx, vy: vy, ax: ax, ay: ay };
}

function _flightTime(rx, ry, vx, vy, speed) {
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

function _snapTicks(t) {
    if (!(_ownTicks > 0) || !isFinite(t) || t <= 0) return t;
    const maxT = _ownTicks >= BEAM_TICKS ? MAX_FLIGHT_S : _ownTicks * TICK_S;
    const snapped = Math.round(t / TICK_S) * TICK_S;
    return Math.min(snapped > 0 ? snapped : TICK_S, maxT);
}

function _solve(mx, my, pred, speed, range) {
    const pocket = (_ownShotR > 0 ? _ownShotR : 0) + (pred.rad > 0 ? pred.rad : 0);
    if (_ownBeam) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };

    if (range > 0) {
        const d0 = distance(pred.x, pred.y, mx, my) - pocket;
        if (d0 > range) return null;
    }
    if (!(speed > 0)) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };

    const lead = _ownSteerLife > 0 ? STEER_LEAD_FACTOR : 1;
    const pvx = pred.vx * lead;
    const pvy = pred.vy * lead;
    const pax = pred.ax * lead;
    const pay = pred.ay * lead;
    let px = pred.x;
    let py = pred.y;
    let t = _flightTime(pred.x - mx, pred.y - my, pvx, pvy, speed);

    if (t > 0) {
        for (let pass = 0; pass < LEAD_PASSES; pass++) {
            px = pred.x + pvx * t + 0.5 * pax * t * t;
            py = pred.y + pvy * t + 0.5 * pay * t * t;
            const flown = distance(px, py, mx, my) - pocket;
            if (!(flown > 0)) break;
            t = _snapTicks(flown / speed);
        }
    } else {
        for (let pass = 0; pass < LEAD_PASSES; pass++) {
            const flightTo = distance(px, py, mx, my) - pocket;
            if (range > 0 && flightTo > range) return null;
            const flight = flightTo > 0 ? _snapTicks(flightTo / speed) : 0;
            if (flight > MAX_FLIGHT_S) return null;
            px = pred.x + pvx * flight + 0.5 * pax * flight * flight;
            py = pred.y + pvy * flight + 0.5 * pay * flight * flight;
        }
        return { x: Math.round(px), y: Math.round(py), t: 0 };
    }

    if (range > 0 && distance(px, py, mx, my) - pocket > range) return null;
    if (t > MAX_FLIGHT_S) return null;
    return { x: Math.round(px), y: Math.round(py), t: t };
}

function _readInt(data, off, getter, min, max) {
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

function _ownProjectileSpeed() {
    const now = Date.now();
    if (_projectileSpeed >= 300 && now - _speedAt < SPEED_REFRESH_MS) return _projectileSpeed;
    if (_projectileSpeed < 300 && _speedFailAt > 0 && now - _speedFailAt < SPEED_FAIL_RETRY_MS)
        return _projectileSpeed;

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
                skill && !skill.isNull() ? fns.LogicSkillData_getProjectileData(skill, 0) : null;
            if ((!data || data.isNull()) && skill && !skill.isNull()) {
                try {
                    const direct = skill.add(offsets.LogicSkillData_projectileData).readPointer();
                    if (direct && !direct.isNull()) data = direct;
                } catch (_) {}
            }
            if (data && !data.isNull()) {
                engineSpeed = _readInt(
                    data,
                    offsets.LogicProjectileData_speed,
                    fns.LogicProjectileData_getSpeed,
                    300,
                    8500
                );
                _ownBeam = data.add(offsets.LogicProjectileData_isBeamField).readU8() > 0;
                const passes = data.add(offsets.LogicProjectileData_passesEnvironment).readU8() & 1;
                const pierces =
                    data.add(offsets.LogicProjectileData_piercesEnvironmentField).readU8() & 1;
                _ownPierces = (passes | pierces) === 1;
                try {
                    _ownPiercesChars =
                        (data.add(offsets.LogicProjectileData_piercesCharacters).readU8() & 1) ===
                        1;
                } catch (_) {
                    _ownPiercesChars = false;
                }
                let rad = _readInt(
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
                _ownShotR = rad;
                try {
                    const steer = data.add(offsets.LogicProjectileData_steerStrength).readFloat();
                    const life = _readInt(
                        data,
                        offsets.LogicProjectileData_steerLifeTime,
                        null,
                        1,
                        20000
                    );
                    _ownSteerLife = steer > 0 && life > 0 ? life : 0;
                } catch (_) {
                    _ownSteerLife = 0;
                }
                const learned = travelFor(data);
                const tiles = weaponRangeUnits(own);
                const speedForTicks = engineSpeed > 0 ? engineSpeed : scanData.measuredSpeed | 0;
                const calibrated = rangeScaleCalibrated();
                _ownTicks = learned && learned.ticks > 0 ? learned.ticks : 0;
                if (!(_ownTicks > 0) && calibrated && tiles > 0 && speedForTicks > 0) {
                    _ownTicks = Math.max(1, Math.round((tiles * TICKS_PER_SEC) / speedForTicks));
                }
                _ownTravel =
                    learned && learned.range > 0
                        ? learned.range
                        : calibrated
                          ? travelDistance(_ownTicks, speedForTicks)
                          : 0;
                if (_ownTicks >= BEAM_TICKS) _ownBeam = true;
            }
        }
    } catch (_) {}

    const observed = scanData.measuredSpeed | 0;
    if (engineSpeed > 0) speed = engineSpeed;
    else if (observed >= 300 && observed <= 8500) speed = observed;

    if (speed >= 300 && speed <= 8500) {
        _projectileSpeed = speed;
        _speedAt = now;
    } else {
        _speedFailAt = now;
    }
    return _projectileSpeed;
}

function _ownRange() {
    const now = Date.now();
    if (now - _rangeAt < SPEED_REFRESH_MS) return _rangeCache;
    _rangeAt = now;
    _rangeCache = 0;

    const own = scanData.ownCharacter;
    if (!own || own.isNull()) return 0;

    const tiles = weaponRangeUnits(own);
    const flight = _ownTravel > 0 ? _ownTravel : 0;
    if (flight > 0 && (tiles <= 0 || (flight >= tiles * 0.8 && flight <= tiles * 1.6))) {
        _rangeCache = flight;
    } else {
        _rangeCache = tiles;
    }
    return _rangeCache;
}

function _aimAt(enemy, now) {
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
    const speed = _ownProjectileSpeed();
    const pred = _sample(enemy.gid, ex, ey, enemy.moveSpeed, enemy.moveAngle, now) || {
        x: ex,
        y: ey,
        vx: 0,
        vy: 0,
        ax: 0,
        ay: 0
    };
    pred.rad = enemy.radius | 0;
    const aim = _solve(mx, my, pred, speed, _ownRange());
    if (!aim) return null;
    const ax = aim.x | 0;
    const ay = aim.y | 0;
    if (!isFinite(ax) || !isFinite(ay)) return null;
    if (ax === 0 && ay === 0) return null;
    if (ax < -100000 || ax > 100000 || ay < -100000 || ay > 100000) return null;
    if (ax === (mx | 0) && ay === (my | 0)) return null;
    return { x: ax, y: ay, t: aim.t };
}

function _lineupHits(list, mx, my, target, pocket) {
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
        if (_isSkipped(other.brawlerName)) continue;
        const rx = other.x - mx;
        const ry = other.y - my;
        const along = rx * ux + ry * uy;
        if (along <= 0 || along > len * 1.6) continue;
        const off = Math.abs(rx * -uy + ry * ux);
        if (off <= pocket + (other.radius > 0 ? other.radius : 60)) hits++;
    }
    return hits;
}

function _ptrAlive(candidate) {
    if (!candidate || candidate.isNull()) return null;
    const list = scanData.enemies || [];
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e && e.ptr && !e.ptr.isNull() && e.ptr.equals(candidate)) return e.ptr;
    }
    return null;
}

function _enemyByPtr(candidate) {
    if (!candidate || candidate.isNull()) return null;
    const list = scanData.enemies || [];
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e && e.ptr && !e.ptr.isNull() && e.ptr.equals(candidate)) return e;
    }
    return null;
}

function _aimPointNow() {
    const now = Date.now();
    const live = _target ? _ptrAlive(_target.ptr) : null;
    let enemy = live ? _target : _pickTarget(now);
    if (!enemy) enemy = _enemyByPtr(_gameTarget);
    if (!enemy) return null;
    return _aimAt(enemy, now);
}

function _pickTarget(now) {
    const list = scanData.enemies || [];
    const myTeam = scanData.myTeamId | 0;
    const mx = scanData.myX;
    const my = scanData.myY;
    const speed = _ownProjectileSpeed();
    const range = _ownRange();
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
        if (_isSkipped(e.brawlerName)) continue;
        if ((e.teamId | 0) === myTeam) continue;
        if (!_ownPierces && losCheck(mx, my, e.x, e.y, BLOCKS_PROJECTILES) === false) continue;
        const pred = _sample(e.gid, e.x, e.y, e.moveSpeed, e.moveAngle, now) || {
            x: e.x,
            y: e.y,
            vx: 0,
            vy: 0,
            ax: 0,
            ay: 0
        };
        pred.rad = e.radius | 0;
        const d = distance(e.x, e.y, mx, my);
        const pocket = (_ownShotR > 0 ? _ownShotR : 0) + pred.rad;
        if (range > 0 && d - pocket > range) continue;
        const score = _ownPiercesChars
            ? d - _lineupHits(list, mx, my, e, pocket) * LINEUP_BONUS
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
        if (_target && e.gid === _target.gid) {
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
    if (cur && best && curD <= bestD * STICKY_MARGIN) {
        pick = cur;
        pred =
            cur.gid === best.gid
                ? bestPred
                : _sample(cur.gid, cur.x, cur.y, cur.moveSpeed, cur.moveAngle, now);
        if (pred) pred.rad = cur.radius | 0;
    } else {
        pick = best;
        pred = bestPred;
    }
    if (!pick || !pred) return null;

    if (_track.size > 24) {
        for (const [key, tr] of _track) {
            if (now - tr.lastSeen > TRACK_PRUNE_MS) _track.delete(key);
        }
    }

    if (!_solve(mx, my, pred, speed, range)) return null;
    return pick;
}

function _resetWeaponCache() {
    _projectileSpeed = 0;
    _speedAt = 0;
    _speedFailAt = 0;
    _rangeCache = 0;
    _rangeAt = 0;
    _ownShotR = 0;
    _ownTicks = 0;
    _ownTravel = 0;
    _ownSteerLife = 0;
    _ownBeam = false;
    _ownPierces = false;
    _ownPiercesChars = false;
}

export function setupAutoaim() {
    if (_hooks) return;
    _hooks = true;
    const base = getBase();
    try {
        enableProjectileTracking();
        onDataReload(_resetWeaponCache);
    } catch (_) {}
    try {
        Interceptor.attach(base.add(offsets.BattleScreen_getClosestTargetForAutoshoot), {
            onLeave(retval) {
                try {
                    if (retval.isNull()) return;
                    _gameTarget = retval;
                } catch (_) {}
            }
        });
    } catch (_) {}
    try {
        Interceptor.attach(base.add(offsets.BattleScreen_activateSkill), {
            onEnter(args) {
                const aim = _aimPointNow();
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

export function updateAutoaim() {
    if (scanData.lastUpdate === 0) {
        _target = null;
        return;
    }
    _target = _pickTarget(Date.now());
}

export function resetAutoaim() {
    _target = null;
    _track.clear();
    _resetWeaponCache();
}
