import { getBase, getFunctions, isValidPtr } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import { scanData } from "../core/scan.js";
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
const SKIP_NAME_PARTS = ["BALL"];

const SERVER_TICK_MS = 50;
const MIN_TRACK_MS = SERVER_TICK_MS * 2;
const MAX_SPEED_EST = 1600;
const MAX_ACCEL = 6000;
const LEAD_PASSES = 3;
const MAX_FLIGHT_S = 3;
const STICKY_MARGIN = 1.12;

var _target = null;
var _aimX = 0;
var _aimY = 0;
var _track = new Map();
var _projectileSpeed = 0;
var _speedAt = 0;
var _ownBeam = false;
var _ownPierces = false;
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

function _sample(gid, x, y, moveSpeed, moveAngle, now) {
    let track = _track.get(gid);
    if (!track) {
        track = { hist: [] };
        _track.set(gid, track);
    }

    track.hist.push({ x: x, y: y, t: now });
    while (track.hist.length > 16) track.hist.shift();

    const first = track.hist[0];
    const span = (now - first.t) / 1000;
    if (now - first.t < MIN_TRACK_MS || span <= 0) return null;

    let vxWindow = (x - first.x) / span;
    let vyWindow = (y - first.y) / span;
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
    for (let index = track.hist.length - 2; index >= 0; index--) {
        const point = track.hist[index];
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

    if (!track.vhist) track.vhist = [];
    track.vhist.push({ x: vx, y: vy, t: now });
    while (track.vhist.length > 12) track.vhist.shift();

    let ax = 0;
    let ay = 0;
    for (let index = 0; index < track.vhist.length; index++) {
        const past = track.vhist[index];
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

function _solve(mx, my, pred, speed, range) {
    if (_ownBeam) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };

    if (range > 0) {
        const d0 = distance(pred.x, pred.y, mx, my);
        if (d0 > range) return null;
    }
    if (!(speed > 0)) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };

    let px = pred.x;
    let py = pred.y;
    let t = _flightTime(pred.x - mx, pred.y - my, pred.vx, pred.vy, speed);

    if (t > 0) {
        for (let pass = 0; pass < LEAD_PASSES; pass++) {
            px = pred.x + pred.vx * t + 0.5 * pred.ax * t * t;
            py = pred.y + pred.vy * t + 0.5 * pred.ay * t * t;
            const flown = distance(px, py, mx, my);
            if (!(flown > 0)) break;
            t = flown / speed;
        }
    } else {
        for (let pass = 0; pass < LEAD_PASSES; pass++) {
            const flightTo = distance(px, py, mx, my);
            if (range > 0 && flightTo > range) return null;
            const flight = flightTo / speed;
            if (flight > MAX_FLIGHT_S) return null;
            px = pred.x + pred.vx * flight + 0.5 * pred.ax * flight * flight;
            py = pred.y + pred.vy * flight + 0.5 * pred.ay * flight * flight;
        }
        return { x: Math.round(px), y: Math.round(py), t: 0 };
    }

    if (range > 0 && distance(px, py, mx, my) > range) return null;
    if (t > MAX_FLIGHT_S) return null;
    return { x: Math.round(px), y: Math.round(py), t: t };
}

function _ownProjectileSpeed() {
    const now = Date.now();
    if (_projectileSpeed >= 300 && now - _speedAt < SPEED_REFRESH_MS) return _projectileSpeed;

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
            const data =
                skill && !skill.isNull() ? fns.LogicSkillData_getProjectileData(skill, 0) : null;
            if (data && !data.isNull()) {
                _ownBeam = data.add(offsets.ProjectileData_isBeamField).readU8() > 0;
                const field = data.add(offsets.ProjectileData_speedField).readS32() | 0;
                if (field >= 300 && field <= 8500) engineSpeed = field;
                const passes = data.add(offsets.ProjectileData_passesEnvironment).readU8() & 1;
                const pierces = data.add(offsets.ProjectileData_piercesEnvironment).readU8() & 1;
                _ownPierces = (passes | pierces) === 1;
            }
        }
    } catch (_) {}

    const observed = scanData.measuredSpeed | 0;
    if (engineSpeed > 0) speed = engineSpeed;
    else if (observed >= 300 && observed <= 8500) speed = observed;

    if (speed >= 300 && speed <= 8500) {
        _projectileSpeed = speed;
        _speedAt = now;
    }
    return _projectileSpeed;
}

function _ownRange() {
    const now = Date.now();
    if (now - _rangeAt < SPEED_REFRESH_MS) return _rangeCache;
    _rangeAt = now;
    _rangeCache = 0;

    const fns = getFunctions();
    const own = scanData.ownCharacter;
    if (
        !own ||
        own.isNull() ||
        !fns.LogicCharacterClient_getWeaponSkill ||
        !fns.LogicSkillData_getCastingRange
    )
        return 0;

    const weapon = fns.LogicCharacterClient_getWeaponSkill(own);
    if (!weapon || weapon.isNull()) return 0;

    const units = fns.LogicSkillData_getCastingRange(weapon) | 0;
    if (units < 100 || units > 20000) return 0;

    _rangeCache = units;
    return _rangeCache;
}

function _aimAt(enemy, now) {
    if (!enemy || !enemy.ptr || enemy.ptr.isNull()) return null;
    const fns = getFunctions();
    const target = isValidPtr(enemy.body) ? enemy.body : enemy.ptr;
    let ex = enemy.x;
    let ey = enemy.y;
    try {
        ex = fns.LogicGameObjectClient_getX(target) | 0;
        ey = fns.LogicGameObjectClient_getY(target) | 0;
    } catch (_) {}
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
    const aim = _solve(mx, my, pred, speed, _ownRange());
    if (!aim) return null;
    return aim;
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
        const d = distance(e.x, e.y, mx, my);
        if (range > 0 && d > range) continue;
        if (d < calmD) {
            calmD = d;
            calm = e;
            calmPred = pred;
        }
        if (d < bestD) {
            bestD = d;
            best = e;
            bestPred = pred;
        }
        if (_target && e.gid === _target.gid) {
            cur = e;
            curD = d;
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
    } else {
        pick = best;
        pred = bestPred;
    }
    if (!pick || !pred) return null;

    const aim = _solve(mx, my, pred, speed, range);
    if (!aim) return null;
    _aimX = aim.x;
    _aimY = aim.y;
    return pick;
}

export function setupAutoaim() {
    if (_hooks) return;
    _hooks = true;
    const base = getBase();
    try {
        Interceptor.attach(base.add(offsets.BattleScreen_getClosestTargetForAutoshoot), {
            onLeave(retval) {
                if (!_target || !_target.ptr || _target.ptr.isNull()) return;
                try {
                    retval.replace(_target.ptr);
                } catch (_) {}
            }
        });
    } catch (_) {}
    try {
        Interceptor.attach(base.add(offsets.BattleScreen_activateSkill), {
            onEnter(args) {
                if (!_target || !_target.ptr || _target.ptr.isNull()) return;
                const aim = _aimAt(_target, Date.now());
                if (!aim) return;
                try {
                    this.context.x1 = aim.x | 0;
                    this.context.x2 = aim.y | 0;
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
    _projectileSpeed = 0;
    _speedAt = 0;
    _ownBeam = false;
    _ownPierces = false;
    _rangeCache = 0;
    _rangeAt = 0;
}
