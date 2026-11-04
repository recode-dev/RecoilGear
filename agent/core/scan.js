import { getFunctions, isValidPtr, ptrFromU32 } from "./functions.js";
import { offsets } from "./offsets.js";
import { readScString } from "./scstring.js";
import { tileSizeUnits } from "../utils/walls.js";
const GUARD = 0xb504;

export const TILE_UNITS = 100;
export const TICKS_PER_SEC = 20;
const TICK_MS = 1000 / TICKS_PER_SEC;
export const BEAM_TICKS = 18000;
const COLUMN_SPAN = 48;
const STALE_MS = 10000;
const DEFAULT_PROJECTILE_RADIUS = 40;

function length(x, y) {
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return 46340;
    const s = x * x + y * y;
    if (s < 0) return 46340;
    return Math.floor(Math.sqrt(s));
}

var moduleBase = null;
var _brawlerNameCache = new Map();
var _scanCount = 0;
var _liveProjectiles = new Map();
var _friendlyIdx = new Set();
var _objectsArr = null;
var _objCount = 0;
var _projectileHooksInstalled = false;
var _charRange = new Map();
var _weaponMeta = new Map();
var _speedByData = new Map();
var _charSpeedByData = new Map();
var _charsByIndex = new Map();
var _learnedTravel = new Map();
var _rangeBonus = new Map();
var _rangeScale = 0;
var _columnCache = new Map();
var _colCands = new Map();
var _reloadCallbacks = [];
var _dataHooksInstalled = false;
var _insideTravelCall = false;
var _flightRange = new Map();
var _probeBudget = 0;
var _dataCache = new Map();
var _angleCache = new Map();
var _coreHooksInstalled = false;
var _moveAppliedAt = 0;
var _moveAppliedX = 0;
var _moveAppliedY = 0;
var _inputAt = 0;
var _inputX = 0;
var _inputY = 0;
const CACHE_MAX = 2048;
const DATA_TTL_MS = 3000;
const ANGLE_TTL_MS = 120;

export var scanData = {
    ownCharacter: ptr(0),
    battleModeClient: ptr(0),
    myTeamId: 0,
    myPlayerIndex: -1,
    myX: 0,
    myY: 0,
    mySpeed: 0,
    myRadius: 0,
    enemies: [],
    projectiles: [],
    measuredSpeed: 0,
    lastUpdate: 0,
    pathRanAt: 0
};

function _ptrKey(value) {
    try {
        return value.toString();
    } catch (_) {
        return null;
    }
}

export function dataFieldOf(obj) {
    if (!isValidPtr(obj)) return ptr(0);
    try {
        return obj.add(offsets.LogicGameObjectClient_data).readPointer();
    } catch (_) {
        return ptr(0);
    }
}

function _fieldS32(obj, off) {
    try {
        return obj.add(off).readS32() | 0;
    } catch (_) {
        return 0;
    }
}

export function dataOf(obj) {
    if (!isValidPtr(obj)) return ptr(0);
    const key = _ptrKey(obj);
    const now = Date.now();
    if (key) {
        const hit = _dataCache.get(key);
        if (hit && now - hit.ts <= DATA_TTL_MS) return hit.data;
    }
    const fns = getFunctions();
    if (!fns.LogicGameObjectClient_getData) return ptr(0);
    const data = fns.LogicGameObjectClient_getData(obj);
    if (key && isValidPtr(data)) _cacheData(key, data, now);
    return data;
}

function _cacheData(key, data, now) {
    if (_dataCache.size > CACHE_MAX) _dataCache.clear();
    _dataCache.set(key, { data: data, ts: now });
}

function _moveAngleOf(obj) {
    if (!isValidPtr(obj)) return 0;
    const key = _ptrKey(obj);
    if (key) {
        const hit = _angleCache.get(key);
        if (hit && Date.now() - hit.ts <= ANGLE_TTL_MS) return hit.angle;
    }
    return _readMoveAngle(obj);
}

export function moveAppliedSince(x, y, ms) {
    if (!(_moveAppliedAt > 0)) return false;
    if (Date.now() - _moveAppliedAt > ms) return false;
    const dx = x - _moveAppliedX;
    const dy = y - _moveAppliedY;
    return dx * dx + dy * dy <= 4;
}

export function inputSentSince(x, y, ms) {
    if (!(_inputAt > 0) || Date.now() - _inputAt > ms) return false;
    const dx = x - _inputX;
    const dy = y - _inputY;
    return dx * dx + dy * dy <= 4;
}

function _installCoreHooks(base) {
    if (_coreHooksInstalled || !base) return;
    _coreHooksInstalled = true;
    try {
        Interceptor.attach(base.add(offsets.LogicGameObjectClient_getData), {
            onEnter(args) {
                this.obj = args[0];
            },
            onLeave(retval) {
                try {
                    if (retval.isNull()) return;
                    const key = _ptrKey(this.obj);
                    if (!key) return;
                    _cacheData(key, retval, Date.now());
                } catch (_) {}
            }
        });
    } catch (_) {}
    try {
        Interceptor.attach(base.add(offsets.LogicCharacterClient_getMoveAngle), {
            onEnter(args) {
                this.obj = args[0];
            },
            onLeave() {
                try {
                    if (!isValidPtr(this.obj)) return;
                    const key = _ptrKey(this.obj);
                    if (!key) return;
                    const deg = this.obj.add(offsets.LogicCharacterClient_moveAngle).readS32() | 0;
                    if (deg < -720 || deg > 720) return;
                    if (_angleCache.size > CACHE_MAX) _angleCache.clear();
                    _angleCache.set(key, { angle: (deg * Math.PI) / 180, ts: Date.now() });
                } catch (_) {}
            }
        });
    } catch (_) {}
    try {
        Interceptor.attach(base.add(offsets.LogicBattleModeClient_setClientPredictionMoveTo), {
            onEnter(args) {
                _moveAppliedAt = Date.now();
                _moveAppliedX = args[1].toInt32();
                _moveAppliedY = args[2].toInt32();
            }
        });
    } catch (_) {}
    try {
        Interceptor.attach(base.add(offsets.ClientInputManager_addInput), {
            onEnter(args) {
                try {
                    const ci = args[1];
                    if (!isValidPtr(ci)) return;
                    _inputX = ci.add(offsets.ClientInput_x).readS32() | 0;
                    _inputY = ci.add(offsets.ClientInput_y).readS32() | 0;
                    _inputAt = Date.now();
                } catch (_) {}
            }
        });
    } catch (_) {}
}

function _readDataName(data) {
    if (!isValidPtr(data)) return null;
    const fns = getFunctions();
    if (!fns.LogicData_getName) return null;
    try {
        const name = readScString(fns.LogicData_getName(data), 128);
        if (!name) return null;
        return (name.indexOf("hero_icon_") === 0 ? name.substring(10) : name).toUpperCase();
    } catch (_) {}
    return null;
}

function _readProjectileName(value) {
    const fns = getFunctions();
    if (!fns.LogicData_getName || !isValidPtr(value)) return null;
    try {
        const direct = readScString(fns.LogicData_getName(value), 128);
        if (direct) return direct;
    } catch (_) {}
    try {
        const data = value.add(offsets.LogicGameObjectClient_data).readPointer();
        if (isValidPtr(data)) return readScString(fns.LogicData_getName(data), 128);
    } catch (_) {}
    return null;
}

function _validAngleDeg(deg) {
    return isFinite(deg) && deg >= -720 && deg <= 720;
}

function _readMoveAngle(obj) {
    const fns = getFunctions();
    if (fns.LogicCharacterClient_getMoveAngle) {
        try {
            const deg = fns.LogicCharacterClient_getMoveAngle(obj) | 0;
            if (_validAngleDeg(deg)) return (deg * Math.PI) / 180;
        } catch (_) {}
    }
    try {
        const deg = obj.add(offsets.LogicCharacterClient_moveAngle).readS32() | 0;
        if (_validAngleDeg(deg)) return (deg * Math.PI) / 180;
    } catch (_) {}
    return 0;
}

function _readOwnerIndex(obj) {
    try {
        return obj.add(offsets.LogicGameObjectClient_ownerIndex).readS32();
    } catch (_) {
        return -1;
    }
}

function _rememberCharacter(index, character) {
    if (index < 0 || !isValidPtr(character)) return;
    _charsByIndex.set(index, character);
}

function _teamOf(obj, bm) {
    const fns = getFunctions();
    if (fns.LogicGameObjectClient_getTeam && isValidPtr(bm)) {
        try {
            const mgr = bm.add(offsets.BattleMode_logicBattleModeClient).readPointer();
            if (isValidPtr(mgr)) {
                const t = fns.LogicGameObjectClient_getTeam(obj, mgr) | 0;
                if (t !== -1) return t;
            }
        } catch (_) {}
    }
    try {
        const t = obj.add(offsets.LogicGameObjectClient_team).readU32() | 0;
        return t === -1 ? -1 : t;
    } catch (_) {
        return -1;
    }
}

// v69 FUN_1004cf7a4 - the game's own "is this object hostile to the local
// player" predicate: getTeam(obj, objMgr) != *(int*)(objMgr + 0xe4). -1 is a
// REAL team value here (the local side), so raw equality must be used - the
// "team !== -1" leniency in _teamOf would classify teammates as enemies.
function _isEnemyOf(obj, bm, unknownAsEnemy) {
    if (!isValidPtr(obj)) return unknownAsEnemy === true;
    const fns = getFunctions();
    if (fns.LogicGamePlayUtil_isEnemy) {
        try {
            return fns.LogicGamePlayUtil_isEnemy(obj) !== 0;
        } catch (_) {}
    }
    try {
        const mode = isValidPtr(bm) ? bm : scanData.battleModeClient;
        if (isValidPtr(mode)) {
            const mgr = mode.add(offsets.BattleMode_logicBattleModeClient).readPointer();
            if (isValidPtr(mgr)) {
                const myTeam = mgr.add(offsets.LogicGameObjectManagerClient_ownTeam).readS32() | 0;
                if (fns.LogicGameObjectClient_getTeam) {
                    try {
                        return (fns.LogicGameObjectClient_getTeam(obj, mgr) | 0) !== myTeam;
                    } catch (_) {}
                }
            }
        }
    } catch (_) {}
    return unknownAsEnemy === true;
}

export function isEnemyObject(obj) {
    return _isEnemyOf(obj, scanData.battleModeClient, false);
}

function _objectAt(idx) {
    if (idx < 0 || idx >= _objCount || !isValidPtr(_objectsArr)) return null;
    try {
        const o = _objectsArr
            .add(idx * offsets.LogicGameObjectManagerClient_ptrStride)
            .readPointer();
        return isValidPtr(o) ? o : null;
    } catch (_) {
        return null;
    }
}

function _roundDiv(a, b) {
    if (b === 0) return 0;
    return Math.round(a / b);
}

export function travelTicks(rangeUnits, speed, beam) {
    if (beam) return BEAM_TICKS;
    if (!(rangeUnits > 0) || !(speed > 0)) return 0;
    return Math.max(1, _roundDiv(rangeUnits * TICKS_PER_SEC, speed));
}

export function travelDistance(ticks, speed) {
    if (!(ticks > 0) || ticks >= BEAM_TICKS || !(speed > 0)) return 0;
    return Math.round((ticks * speed) / TICKS_PER_SEC);
}

function _learnTravel(key, a1, a2, ticks) {
    if (!key || !(ticks >= 0)) return;
    if (ticks >= BEAM_TICKS) {
        if (!_learnedTravel.has(key))
            _learnedTravel.set(key, { ticks: BEAM_TICKS, range: 0, speed: 0, beam: true });
        return;
    }
    if (ticks <= 0) return;
    const pairs = a1 <= a2 ? [a1, a2, a2, a1] : [a2, a1, a1, a2];
    for (let i = 0; i < 4; i += 2) {
        const range = pairs[i];
        const speed = pairs[i + 1];
        if (range < 50 || range > 30000 || speed < 50 || speed > 20000) continue;
        if (Math.abs(travelTicks(range, speed, false) - ticks) > 1) continue;
        const prev = _learnedTravel.get(key);
        if (prev && prev.range === range && prev.ticks === ticks) return;
        _learnedTravel.set(key, {
            ticks: ticks,
            range: range,
            speed: speed,
            beam: false
        });
        return;
    }
}

function _learnedFor(projectile, data) {
    if (isValidPtr(projectile)) {
        const hit = _learnedTravel.get(projectile.toString());
        if (hit) return hit;
    }
    if (isValidPtr(data)) {
        const hit = _learnedTravel.get(data.toString());
        if (hit) return hit;
    }
    return null;
}

export function travelFor(data) {
    if (!isValidPtr(data)) return null;
    return _learnedTravel.get(data.toString()) || null;
}

function _callTravelTicks(data, rangeUnits, speed) {
    if (!isValidPtr(data) || !(rangeUnits > 0) || !(speed > 0)) return 0;
    const fn = getFunctions().LogicProjectileClient_getTravelTicks;
    if (!fn) return 0;
    _insideTravelCall = true;
    try {
        const ticks = fn(data, rangeUnits, speed) | 0;
        if (ticks <= 0 || ticks > BEAM_TICKS) return 0;
        if (ticks >= BEAM_TICKS) return ticks;
        if (Math.abs(travelTicks(rangeUnits, speed, false) - ticks) > 1) return 0;
        return ticks;
    } catch (_) {
    } finally {
        _insideTravelCall = false;
    }
    return 0;
}

function _weaponSkillFor(character) {
    if (!isValidPtr(character)) return null;
    const fns = getFunctions();
    if (!fns.LogicCharacterClient_getWeaponSkill) return null;
    try {
        const skill = fns.LogicCharacterClient_getWeaponSkill(character);
        if (isValidPtr(skill)) return skill;
    } catch (_) {}
    return null;
}

function _calibrateRangeScale(tiles, rangeUnits) {
    if (!(tiles >= 1 && tiles <= 64) || !(rangeUnits >= 100 && rangeUnits <= 30000)) return false;
    const per = rangeUnits / tiles;
    const tile = tileSizeUnits();
    const candidates = [tile, Math.floor(tile / 3), TILE_UNITS];
    let best = 0;
    for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        if (!(c > 0)) continue;
        const ratio = per / c;
        if (ratio < 0.95 || ratio > 2) continue;
        if (c > best) best = c;
    }
    if (!(best > 0) || best === _rangeScale) return false;
    _rangeScale = best;
    _charRange.clear();
    _rangeBonus.clear();
    return true;
}

function _rangeScaleUnits() {
    return _rangeScale > 0 ? _rangeScale : TILE_UNITS;
}

export function rangeScaleCalibrated() {
    return _rangeScale > 0;
}

function _castingRangeTiles(character) {
    const skill = _weaponSkillFor(character);
    if (!skill) return 0;
    const fns = getFunctions();
    if (fns.LogicSkillData_getRange) {
        try {
            const tiles = fns.LogicSkillData_getRange(skill) | 0;
            if (tiles >= 1 && tiles <= 64) return tiles;
        } catch (_) {}
    }
    if (!fns.LogicSkillData_getCastingRange) return 0;
    try {
        const tiles = fns.LogicSkillData_getCastingRange(skill) | 0;
        if (tiles >= 1 && tiles <= 64) return tiles;
    } catch (_) {}
    return 0;
}

function _rangeForOwner(ownerIndex) {
    if (ownerIndex < 0) return 0;

    const cached = _charRange.get(ownerIndex) || 0;
    if (cached > 0) return cached;

    const owner = _charsByIndex.get(ownerIndex);
    if (!isValidPtr(owner)) return 0;

    const tiles = _castingRangeTiles(owner);
    if (tiles <= 0) return 0;
    if (!rangeScaleCalibrated()) return 0;

    const units = tiles * _rangeScaleUnits() + (_rangeBonus.get(ownerIndex) || 0);
    _charRange.set(ownerIndex, units);
    return units;
}

export function weaponRangeUnits(character) {
    if (!isValidPtr(character)) return 0;
    const tiles = _castingRangeTiles(character);
    if (tiles <= 0 || !rangeScaleCalibrated()) return 0;
    const index = _readOwnerIndex(character);
    return tiles * _rangeScaleUnits() + (index >= 0 ? _rangeBonus.get(index) || 0 : 0);
}

function _learnRangeBonus(ownerIndex, rangeUnits) {
    if (ownerIndex < 0 || !(rangeUnits > 0)) return;
    const owner = _charsByIndex.get(ownerIndex);
    if (!isValidPtr(owner)) return;
    const tiles = _castingRangeTiles(owner);
    if (tiles <= 0) return;
    _calibrateRangeScale(tiles, rangeUnits);
    const bonus = rangeUnits - tiles * _rangeScaleUnits();
    if (bonus < 0 || bonus > 4 * _rangeScaleUnits()) return;
    if ((_rangeBonus.get(ownerIndex) || 0) === bonus) return;
    _rangeBonus.set(ownerIndex, bonus);
    _charRange.delete(ownerIndex);
}

function _readProjectileField(data, off, min, max) {
    try {
        const v = data.add(off).readS32() | 0;
        if (v < min || v > max) return 0;
        return v;
    } catch (_) {
        return 0;
    }
}

function _dataRow(data) {
    try {
        const row = data.add(offsets.LogicProjectileData_reader).readPointer();
        return isValidPtr(row) ? row : null;
    } catch (_) {
        return null;
    }
}

function _columnInt(data, col) {
    const fns = getFunctions();
    if (fns.LogicProjectileData_getIntValueFromColumn) {
        try {
            return fns.LogicProjectileData_getIntValueFromColumn(data, col) | 0;
        } catch (_) {}
    }
    const row = _dataRow(data);
    if (!row) return 0;
    if (fns.LogicData_getIntegerValueAt) {
        try {
            return fns.LogicData_getIntegerValueAt(row, col) | 0;
        } catch (_) {}
    }
    return 0;
}

function _columnBool(data, col) {
    const fns = getFunctions();
    if (fns.LogicProjectileData_getBoolValueFromColumn) {
        try {
            return fns.LogicProjectileData_getBoolValueFromColumn(data, col) ? 1 : 0;
        } catch (_) {}
    }
    if (fns.LogicProjectileData_getBoolValueFromColumn2) {
        try {
            return fns.LogicProjectileData_getBoolValueFromColumn2(data, col) ? 1 : 0;
        } catch (_) {}
    }
    const row = _dataRow(data);
    if (row && fns.LogicData_getBooleanValueAt) {
        try {
            return fns.LogicData_getBooleanValueAt(row, col) ? 1 : 0;
        } catch (_) {}
    }
    return 0;
}

function _probeColumn(kind, read, data, value) {
    if (_probeBudget <= 0) return;
    _probeBudget--;
    let st = _colCands.get(kind);
    if (!st) {
        st = { cols: new Set(), rounds: 1 };
        for (let col = 0; col < COLUMN_SPAN; col++) {
            if (read(data, col) === value) st.cols.add(col);
        }
        _colCands.set(kind, st);
    } else if (st.cols && st.rounds < 10) {
        st.rounds++;
        for (const col of Array.from(st.cols)) {
            if (read(data, col) !== value) st.cols.delete(col);
        }
    } else {
        return;
    }
    if (st.cols.size === 1) _columnCache.set(kind, st.cols.values().next().value);
    else if (st.cols.size === 0) {
        st.cols = null;
        _columnCache.set(kind, -1);
    }
}

function _readProjectileInt(data, off, kind, min, max, getter) {
    let value = 0;
    if (getter) {
        try {
            const v = getter(data) | 0;
            if (v >= min && v <= max) value = v;
        } catch (_) {}
    }
    if (!(value > 0)) value = _readProjectileField(data, off, min, max);
    if (value > 0) {
        if (_columnCache.get(kind) === void 0) _probeColumn(kind, _columnInt, data, value);
        return value;
    }
    const known = _columnCache.get(kind);
    if (known > 0) {
        const v = _columnInt(data, known) | 0;
        if (v >= min && v <= max) return v;
        return 0;
    }
    if (known === void 0) {
        for (let col = 0; col < COLUMN_SPAN; col++) {
            const v = _columnInt(data, col) | 0;
            if (v >= min && v <= max) {
                _columnCache.set(kind, col);
                return v;
            }
        }
        _columnCache.set(kind, -1);
    }
    return 0;
}

function _readProjectileBool(data, off, kind) {
    let field = -1;
    try {
        field = data.add(off).readU8() & 1;
    } catch (_) {}
    if (field >= 0) {
        if (_columnCache.get(kind) === void 0) _probeColumn(kind, _columnBool, data, field);
        return field;
    }
    const known = _columnCache.get(kind);
    if (known > 0) return _columnBool(data, known);
    return 0;
}

function _readProjectileRadius(data) {
    const fns = getFunctions();
    return _readProjectileInt(
        data,
        offsets.LogicProjectileData_radius,
        "radius",
        1,
        2000,
        fns.LogicProjectileData_getRadius
    );
}

function _readProjectileSpeed(data) {
    const fns = getFunctions();
    return _readProjectileInt(
        data,
        offsets.LogicProjectileData_speed,
        "speed",
        1,
        20000,
        fns.LogicProjectileData_getSpeed
    );
}

function _characterSpeed(data) {
    if (!isValidPtr(data)) return 0;
    const key = _ptrKey(data);
    if (key) {
        const hit = _charSpeedByData.get(key);
        if (hit !== void 0 && hit > 0) return hit;
    }
    let speed = 0;
    const fns = getFunctions();
    try {
        if (fns.LogicCharacterData_getSpeed) {
            const v = fns.LogicCharacterData_getSpeed(data) | 0;
            if (v > 0) speed = v;
        }
    } catch (_) {}
    if (!(speed > 0)) speed = _readProjectileField(data, offsets.LogicCharacterData_speed, 1, 6000);
    if (key && speed > 0) _charSpeedByData.set(key, speed);
    return speed;
}

export function collisionRadius(data) {
    if (!isValidPtr(data)) return 0;
    try {
        const direct = data.add(offsets.LogicCharacterData_collisionRadius).readS32() | 0;
        if (direct > 0) return direct;
    } catch (_) {}
    try {
        const getRadius = getFunctions().LogicCharacterData_getCollisionRadius;
        if (getRadius) return getRadius(data) | 0;
    } catch (_) {}
    return 0;
}

function _readProjectileFlags(data) {
    let passes = 0;
    let pierces = 0;
    let piercesChars = 0;
    try {
        passes = data.add(offsets.LogicProjectileData_passesEnvironment).readU8() & 1;
    } catch (_) {}
    try {
        pierces = data.add(offsets.LogicProjectileData_piercesEnvironmentField).readU8() & 1;
    } catch (_) {}
    try {
        piercesChars = data.add(offsets.LogicProjectileData_piercesCharacters).readU8() & 1;
    } catch (_) {}
    return {
        passes: passes,
        pierces: pierces,
        piercesChars: piercesChars
    };
}

function _readProjectileU8(data, off, kind, min, max) {
    try {
        const v = data.add(off).readU8();
        if (v >= min && v <= max) {
            if (_columnCache.get(kind) === void 0) _probeColumn(kind, _columnInt, data, v);
            return v;
        }
    } catch (_) {}
    const known = _columnCache.get(kind);
    if (known > 0) {
        const v = _columnInt(data, known) | 0;
        if (v >= min && v <= max) return v;
    }
    return 0;
}

function _readBounceKeep(data) {
    const percent = _readProjectileU8(
        data,
        offsets.LogicProjectileData_bouncePercent,
        "bouncePercent",
        1,
        100
    );
    return percent > 0 ? percent / 100 : 0;
}

function _flagFrom(fn, data, projectile) {
    if (!fn) return 0;
    try {
        if (fn(data)) return 1;
    } catch (_) {}
    try {
        if (fn(projectile)) return 1;
    } catch (_) {}
    return 0;
}

function _readClientU32(obj, off, max) {
    try {
        const v = obj.add(off).readU32();
        if (v <= max) return v;
    } catch (_) {}
    return -1;
}

function _volleyMs(weapon) {
    if (!weapon) return 0;
    if (weapon.bullets < 2 || weapon.msBetween <= 0) return 0;
    const total = weapon.bullets * weapon.msBetween;
    if (total > 0 && total <= 4000) return total;
    return 0;
}

function _readProjectileMeta(projectile, data, speed, rangeUnits, beam) {
    const fns = getFunctions();
    let preMs = _readProjectileField(
        data,
        offsets.LogicProjectileData_preExplosionTimeMs,
        1,
        60000
    );
    let typeId = -1;
    let steer = 0;
    let isBeam = !!beam;
    let homing = _readProjectileBool(
        data,
        offsets.LogicProjectileData_isHomingMissileField,
        "homing"
    );
    let bouncing = _readProjectileBool(
        data,
        offsets.LogicProjectileData_isBouncingField,
        "bouncing"
    );
    const steerIgnoreTicks = _readProjectileInt(
        data,
        offsets.LogicProjectileData_steerIgnoreTicks,
        "steerIgnore",
        1,
        400,
        null
    );
    const steerLifeRaw = _readProjectileInt(
        data,
        offsets.LogicProjectileData_steerLifeTime,
        "steerLife",
        1,
        20000,
        null
    );
    const bounceAdd = _readProjectileInt(
        data,
        offsets.LogicProjectileData_distanceAddFromBounce,
        "bounceAdd",
        1,
        3000,
        null
    );
    const bounceMax = _readProjectileInt(
        data,
        offsets.LogicProjectileData_maxDistanceAddBounces,
        "bounceMax",
        1,
        20000,
        null
    );
    const bounceKeep = _readBounceKeep(data);
    const rehit = _readProjectileBool(
        data,
        offsets.LogicProjectileData_canHitAgainAfterBounce,
        "rehit"
    );
    if (fns.LogicProjectileData_getPreExplosionTimeMs && !(preMs > 0)) {
        try {
            const v = fns.LogicProjectileData_getPreExplosionTimeMs(data) | 0;
            if (v > 0 && v <= 60000) preMs = v;
        } catch (_) {}
    }
    if (!homing) homing = _flagFrom(fns.LogicProjectileData_isHomingMissile, data, projectile);
    if (!bouncing) bouncing = _flagFrom(fns.LogicProjectileData_isBouncing, data, projectile);
    const learned = _learnedFor(projectile, data);
    let ticks = 0;
    if (learned && learned.ticks > 0) {
        ticks = learned.ticks;
        if (learned.beam) isBeam = true;
    }
    if (!(ticks > 0)) ticks = _callTravelTicks(data, rangeUnits, speed);
    if (!(ticks > 0)) ticks = travelTicks(rangeUnits, speed, isBeam);
    if (ticks >= BEAM_TICKS) isBeam = true;
    let lifeMs = 0;
    let travel = 0;
    if (isBeam || ticks >= BEAM_TICKS) {
        lifeMs = Infinity;
        travel = rangeUnits > 0 ? rangeUnits : 0;
    } else if (ticks > 0) {
        lifeMs = ticks * TICK_MS;
        travel = travelDistance(ticks, speed);
    }
    if (fns.LogicProjectileData_getType) {
        try {
            const t = fns.LogicProjectileData_getType(data) | 0;
            if (t >= 0 && t <= 20) typeId = t;
        } catch (_) {}
    }
    if (typeId < 0) {
        const t = _readClientU32(data, offsets.LogicProjectileData_type, 20);
        if (t >= 0) typeId = t;
    }
    try {
        const v = data.add(offsets.LogicProjectileData_steerStrength).readFloat();
        if (v > 0 && v <= 1000) steer = v;
    } catch (_) {}
    const travelType = _readClientU32(projectile, offsets.LogicProjectileClient_travelType, 16);
    let beamCopy = 0;
    try {
        beamCopy = projectile.add(offsets.LogicProjectileClient_isBeamCopy).readU8() & 1;
    } catch (_) {}
    if (beamCopy) isBeam = true;
    const steerIgnoreMs = steerIgnoreTicks > 0 ? steerIgnoreTicks * TICK_MS : 0;
    const steerLifeMs =
        steerLifeRaw > 0 ? (steerLifeRaw > 400 ? steerLifeRaw : steerLifeRaw * TICK_MS) : 0;
    return {
        preMs,
        lifeMs,
        ticks,
        travel,
        typeId,
        travelType,
        isBeam,
        beamCopy: !!beamCopy,
        homing: !!homing,
        bouncing: !!bouncing,
        steer,
        steerIgnoreMs,
        steerLifeMs,
        bounceAdd,
        bounceMax,
        bounceKeep,
        rehit: !!rehit
    };
}

function _weaponForOwner(ownerIndex) {
    if (ownerIndex < 0) return null;
    if (_weaponMeta.has(ownerIndex)) return _weaponMeta.get(ownerIndex);
    const owner = _charsByIndex.get(ownerIndex);
    if (!isValidPtr(owner)) return null;
    const fns = getFunctions();
    const out = { spread: 0, bullets: 0, msBetween: 0 };
    if (fns.LogicCharacterClient_getWeaponSkill && fns.LogicSkillData_getSpread) {
        try {
            const skill = fns.LogicCharacterClient_getWeaponSkill(owner);
            if (isValidPtr(skill)) {
                const bullets = fns.LogicSkillData_getNumBulletsInOneAttack
                    ? fns.LogicSkillData_getNumBulletsInOneAttack(skill) | 0
                    : 0;
                const between = fns.LogicSkillData_getMsBetweenAttacks
                    ? fns.LogicSkillData_getMsBetweenAttacks(skill) | 0
                    : 0;
                const spread = fns.LogicSkillData_getSpread(skill) | 0;
                if (bullets >= 1 && bullets <= 40) out.bullets = bullets;
                if (between >= 0 && between <= 3000) out.msBetween = between;
                if (spread > 0 && spread <= 120) out.spread = spread;
            }
        } catch (_) {}
    }
    _weaponMeta.set(ownerIndex, out);
    return out;
}

function _validTarget(tx, ty, x, y) {
    if (tx === 0 && ty === 0) return null;
    if (tx > 100000 || tx < -100000 || ty > 100000 || ty < -100000) return null;
    if (tx === x && ty === y) return null;
    return { x: tx, y: ty };
}

function _readProjectileTarget(projectile, data, x, y) {
    const fns = getFunctions();
    try {
        const hit = _validTarget(
            projectile.add(offsets.LogicProjectileClient_targetX).readS32() | 0,
            projectile.add(offsets.LogicProjectileClient_targetY).readS32() | 0,
            x,
            y
        );
        if (hit) return hit;
    } catch (_) {}
    if (fns.LogicProjectileClient_getTargetX && fns.LogicProjectileClient_getTargetY) {
        try {
            const hit = _validTarget(
                fns.LogicProjectileClient_getTargetX(projectile) | 0,
                fns.LogicProjectileClient_getTargetY(projectile) | 0,
                x,
                y
            );
            if (hit) return hit;
        } catch (_) {}
    }
    return null;
}

function _readPtrField(obj, off) {
    try {
        const v = obj.add(off).readPointer();
        return isValidPtr(v) ? v : null;
    } catch (_) {
        return null;
    }
}

function _dataU8(data, off) {
    try {
        return data.add(off).readU8() & 1;
    } catch (_) {
        return 0;
    }
}

function _dataS32(data, off, min, max) {
    try {
        const v = data.add(off).readS32() | 0;
        return v >= min && v <= max ? v : 0;
    } catch (_) {
        return 0;
    }
}

function _clientS32(obj, off, min, max) {
    try {
        const v = obj.add(off).readS32() | 0;
        return v >= min && v <= max ? v : 0;
    } catch (_) {
        return 0;
    }
}

function _captureProjectile(projectile, data, now) {
    if (!isValidPtr(projectile)) return;
    const key = _ptrKey(projectile);
    if (!key) return;
    try {
        if (!isValidPtr(data)) data = dataFieldOf(projectile);
        if (!isValidPtr(data)) return;
        const existing = _liveProjectiles.get(key);
        if (existing) {
            existing.ptr = projectile;
            existing.data = data;
            existing.ownerIndex = _readOwnerIndex(projectile);
            return;
        }
        let radius = _readProjectileRadius(data);
        if (!(radius > 0)) radius = DEFAULT_PROJECTILE_RADIUS;
        const x = _fieldS32(projectile, offsets.LogicGameObjectClient_x);
        const y = _fieldS32(projectile, offsets.LogicGameObjectClient_y);
        const spawnReady = x !== 0 || y !== 0;
        const target = _readProjectileTarget(projectile, data, x, y);
        const flags = _readProjectileFlags(data);
        let isIndirect = _dataU8(data, offsets.LogicProjectileData_indirect);
        let travelType = _dataS32(data, offsets.LogicProjectileData_travelType, 0, 20);
        if (!travelType) {
            const raw = _readClientU32(projectile, offsets.LogicProjectileClient_travelType, 20);
            travelType = raw > 0 ? raw : 0;
        }
        if (!travelType) {
            const fn = getFunctions().LogicProjectileData_getTravelType;
            if (fn) {
                try {
                    const v = fn(data) | 0;
                    if (v > 0 && v <= 20) travelType = v;
                } catch (_) {}
            }
        }
        const dynamicRange = _dataU8(data, offsets.LogicProjectileData_allowDynamicRange);
        if (travelType === 6 || dynamicRange) isIndirect = 1;
        let beam = 0;
        try {
            beam = data.add(offsets.LogicProjectileData_isBeamField).readU8() & 1;
        } catch (_) {}
        const ownerIndex = _readOwnerIndex(projectile);
        const targetObj = _readPtrField(projectile, offsets.LogicProjectileClient_targetObject);
        const entry = {
            gid: key,
            ptr: projectile,
            data,
            ownerIndex,
            radius,
            speed: _readProjectileSpeed(data),
            x,
            y,
            spawnX: spawnReady ? x : 0,
            spawnY: spawnReady ? y : 0,
            spawnPending: !spawnReady,
            targetX: target ? target.x : 0,
            targetY: target ? target.y : 0,
            hasTarget: !!target || !!targetObj,
            seg0: target && spawnReady ? length(target.x - x, target.y - y) : 0,
            passesEnv: flags.passes,
            piercesEnv: flags.pierces,
            piercesChars: flags.piercesChars,
            isIndirect: !!isIndirect,
            isBeam: !!beam,
            beamCopy: false,
            ageMs: 0,
            spawnTs: now,
            lastX: x,
            lastY: y,
            lastTs: now,
            vx: 0,
            vy: 0,
            hasVelocitySample: false,
            meta: null,
            travelType,
            dynamicRange,
            ignoreChars: _dataU8(data, offsets.LogicProjectileData_ignoreCharacterCollisions),
            ignoreEnv: _dataU8(data, offsets.LogicProjectileData_ignoreEnvironmentCollisions),
            grapples: _dataU8(data, offsets.LogicProjectileData_grapplesEnemy),
            boomerang: _dataS32(data, offsets.LogicProjectileData_boomerang, 1, 8),
            chains: _dataU8(data, offsets.LogicProjectileData_chainsToEnemies),
            stunMs: _clientS32(projectile, offsets.LogicProjectileClient_stunMs, 1, 60000),
            silenceMs: _clientS32(projectile, offsets.LogicProjectileClient_effectMs, 1, 60000),
            triggerMs: _dataS32(data, offsets.LogicProjectileData_triggerWithDelayMs, 1, 60000),
            constantFly: _dataU8(data, offsets.LogicProjectileData_constantFlyTime),
            earlyTicks: _dataS32(data, offsets.LogicProjectileData_numEarlyTicks, 1, 400),
            homeDistance: _dataS32(data, offsets.LogicProjectileData_homingDistance, 1, 30000),
            gravity: _dataS32(data, offsets.LogicProjectileData_gravity, 1, 20000),
            shotByHero: _dataU8(data, offsets.LogicProjectileData_isShotByHero),
            visualized: _dataU8(data, offsets.LogicProjectileData_visualizeEndPoint),
            attachArea: _dataU8(data, offsets.LogicProjectileData_attachAreaEffectToTarget),
            trail: _dataU8(data, offsets.LogicProjectileData_spawnAreaEffectTrail),
            trailMin: _dataS32(
                data,
                offsets.LogicProjectileData_areaEffectTrailMinDistance,
                1,
                20000
            ),
            lifeTicks: _clientS32(projectile, offsets.LogicProjectileClient_lifeTicks, 1, 100000),
            clientRadius: 0,
            seekX: 0,
            seekY: 0
        };
        _liveProjectiles.set(key, entry);
    } catch (_) {}
}

function _removeProjectile(projectile) {
    if (!isValidPtr(projectile)) return;
    const key = _ptrKey(projectile);
    if (!key) return;
    const entry = _liveProjectiles.get(key);
    if (!entry || !entry.ptr.equals(projectile)) return;
    const flown = _traveled(entry, entry.lastX, entry.lastY);
    if (flown > 0) {
        _learnFlightRange(entry.data, flown);
        _learnRangeBonus(entry.ownerIndex, flown + entry.radius);
    }
    _liveProjectiles.delete(key);
}

function _installTravelTicksHook(base) {
    try {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_getTravelTicks), {
            onEnter(args) {
                this.key = args[0].toString();
                this.a1 = args[1].toUInt32();
                this.a2 = args[2].toUInt32();
            },
            onLeave(retval) {
                if (_insideTravelCall) return;
                _learnTravel(this.key, this.a1, this.a2, retval.toInt32());
            }
        });
    } catch (_) {}
}

function _installProjectilePathHook(base) {
    try {
        Interceptor.attach(base.add(offsets.CalculateProjectilePath), {
            onEnter() {
                scanData.pathRanAt = Date.now();
            }
        });
    } catch (_) {}
}

export function pathEngineActive(now) {
    return scanData.pathRanAt > 0 && (now || Date.now()) - scanData.pathRanAt < 1500;
}

export function onDataReload(callback) {
    if (typeof callback === "function") _reloadCallbacks.push(callback);
}

function _notifyDataReload() {
    _charRange.clear();
    _weaponMeta.clear();
    _learnedTravel.clear();
    _flightRange.clear();
    _rangeBonus.clear();
    _columnCache.clear();
    _colCands.clear();
    _charSpeedByData.clear();
    for (const [, projectile] of _liveProjectiles) {
        projectile.castRange = 0;
        projectile.travelDistance = 0;
        projectile.ticks = 0;
    }
    for (const callback of _reloadCallbacks) {
        try {
            callback();
        } catch (_) {}
    }
}

function _installDataReloadHooks(base) {
    if (_dataHooksInstalled) return;
    _dataHooksInstalled = true;
    const names = [
        "LogicProjectileData_createReferences",
        "LogicSkillData_createReferences",
        "LogicCharacterData_createReferences"
    ];
    for (const name of names) {
        const off = offsets[name];
        if (typeof off !== "number" || off <= 0) continue;
        try {
            Interceptor.attach(base.add(off), { onLeave: _notifyDataReload });
        } catch (_) {}
    }
    try {
        Interceptor.attach(base.add(offsets.LogicCharacterClient_decode), {
            onEnter(args) {
                this.character = args[0];
            },
            onLeave() {
                const index = _readOwnerIndex(this.character);
                if (index < 0) return;
                _charRange.delete(index);
                _rangeBonus.delete(index);
                _rememberCharacter(index, this.character);
            }
        });
    } catch (_) {}
}

function _installProjectileHooks(base) {
    if (_projectileHooksInstalled) return;
    _projectileHooksInstalled = true;
    try {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_ctor), {
            onEnter(args) {
                this.projectile = args[0];
                // v69 ctor is (this, dataType): args[1] is a small type id, NOT a
                // data pointer. Capturing it as data used to create ghost entries
                // and poison the data cache, so pass null and let
                // _captureProjectile resolve obj+0x10 itself.
            },
            onLeave() {
                try {
                    _captureProjectile(this.projectile, null, Date.now());
                } catch (_) {}
            }
        });
    } catch (_) {}
    try {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_destruct), {
            onEnter(args) {
                _removeProjectile(args[0]);
            }
        });
    } catch (_) {}
    try {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_decode), {
            onEnter(args) {
                this.projectile = args[0];
            },
            onLeave() {
                _captureProjectile(this.projectile, null, Date.now());
            }
        });
    } catch (_) {}
    _installTravelTicksHook(base);
    _installProjectilePathHook(base);
    _installDataReloadHooks(base);
}

export function learnedFlightRange(data) {
    if (!isValidPtr(data)) return 0;
    const v = _flightRange.get(data.toString()) || 0;
    return v > 0 ? v : 0;
}

function _learnFlightRange(data, flown) {
    if (!isValidPtr(data) || !(flown > 0)) return;
    const key = data.toString();
    const prev = _flightRange.get(key) || 0;
    if (flown > prev) _flightRange.set(key, flown);
}

function _flightSeg(entry, flown) {
    const learned = learnedFlightRange(entry.data);
    let cap = learned > 0 ? learned + entry.radius : 0;
    let seg = entry.seg0;
    if (!(cap > 0) && entry.lifeTicks > 0 && entry.speed > 0) {
        const lifeCap = (entry.lifeTicks * entry.speed) / TICKS_PER_SEC;
        if (lifeCap > flown) cap = lifeCap;
    }
    if (cap > 0 && (!(seg > 0) || seg > cap)) seg = cap;
    if (!(seg > 0)) return 0;
    const remain = seg - flown;
    return remain > 0 ? remain : 0;
}

function _applyMeta(entry, meta) {
    entry.meta = meta;
    if (!meta) return;
    entry.isBeam = !!meta.isBeam;
    entry.beamCopy = !!meta.beamCopy;
    entry.isIndirect = entry.isIndirect || meta.travelType > 0;
    entry.preMs = meta.preMs;
    entry.lifeMs = meta.lifeMs;
    entry.ticks = meta.ticks;
    if (meta.travel > 0) entry.travelDistance = meta.travel;
    entry.homing = meta.homing;
    entry.bouncing = meta.bouncing;
    entry.steer = meta.steer;
    entry.steerIgnoreMs = meta.steerIgnoreMs;
    entry.steerLifeMs = meta.steerLifeMs;
    entry.bounceAdd = meta.bounceAdd;
    entry.bounceMax = meta.bounceMax;
    entry.bounceKeep = meta.bounceKeep;
    entry.rehit = meta.rehit;
    entry.typeId = meta.typeId;
}

function _updateLiveProjectiles(now) {
    const output = [];
    let metaBudget = _probeBudget > 0 ? 1 : 0;
    for (const [gid, entry] of _liveProjectiles) {
        try {
            if (now - (entry.spawnTs || now) > STALE_MS) {
                _liveProjectiles.delete(gid);
                continue;
            }
            const x = _fieldS32(entry.ptr, offsets.LogicGameObjectClient_x);
            const y = _fieldS32(entry.ptr, offsets.LogicGameObjectClient_y);
            const dt = (now - entry.lastTs) / 1000;
            const dx = x - entry.lastX;
            const dy = y - entry.lastY;
            if (dt > 0.008 && dt < 0.3 && dx * dx + dy * dy >= 16) {
                const observedVx = dx / dt;
                const observedVy = dy / dt;
                if (length(observedVx, observedVy) <= 8500) {
                    const alpha = entry.hasVelocitySample ? 0.4 : 1;
                    entry.vx = entry.vx * (1 - alpha) + observedVx * alpha;
                    entry.vy = entry.vy * (1 - alpha) + observedVy * alpha;
                    entry.hasVelocitySample = true;
                    const measured = length(entry.vx, entry.vy);
                    if (measured >= 300 && measured <= 8500) {
                        entry.speed = measured;
                        if (entry.ownerIndex === scanData.myPlayerIndex) {
                            const dataPtr = entry.data;
                            if (isValidPtr(dataPtr)) {
                                const key = dataPtr.toString();
                                const acc = _speedByData.get(key) || { sum: 0, count: 0 };
                                acc.sum += measured;
                                acc.count++;
                                _speedByData.set(key, acc);
                                scanData.measuredSpeed = Math.round(acc.sum / acc.count);
                            }
                        }
                    }
                }
            }
            entry.lastX = x;
            entry.lastY = y;
            entry.lastTs = now;
            entry.x = x;
            entry.y = y;
            entry.ownerIndex = _readOwnerIndex(entry.ptr);
            if (entry.spawnPending && (x !== 0 || y !== 0)) {
                entry.spawnX = x;
                entry.spawnY = y;
                entry.spawnPending = false;
            }
            entry.ageMs = Math.max(0, now - (entry.spawnTs || now));
            const target = _readProjectileTarget(entry.ptr, entry.data, x, y);
            if (target) {
                entry.targetX = target.x;
                entry.targetY = target.y;
                entry.hasTarget = true;
                if (!(entry.seg0 > 0) && !entry.spawnPending)
                    entry.seg0 = length(target.x - entry.spawnX, target.y - entry.spawnY);
            }
            if (!entry.meta && metaBudget > 0) {
                metaBudget--;
                _applyMeta(
                    entry,
                    _readProjectileMeta(entry.ptr, entry.data, entry.speed, 0, entry.isBeam)
                );
            }
            const flown = _traveled(entry, x, y);
            entry.flown = flown;
            entry.seg = _flightSeg(entry, flown);
            // owner-based self/team filter: resolve the shooter through the
            // player-index -> character map built by the scan. NEVER index the
            // object array with ownerIndex - that array is compacted and its
            // slots are not player indexes (v69: own char was seen at slot 1
            // with ownerIndex 0, which made enemy shots resolve to selfObj).
            const ownerObj =
                entry.ownerIndex >= 0 ? _charsByIndex.get(entry.ownerIndex) || null : null;
            if (ownerObj && scanData.ownCharacter && ownerObj.equals(scanData.ownCharacter))
                continue;
            if (ownerObj && !_isEnemyOf(ownerObj, scanData.battleModeClient, true)) continue;
            if (entry.ownerIndex >= 0 && _friendlyIdx.has(entry.ownerIndex)) continue;
            if (entry.ownerIndex === scanData.myPlayerIndex) continue;
            if (!(entry.seg > 0) && !entry.hasTarget) continue;
            output.push({
                gid,
                x,
                y,
                spawnX: entry.spawnX,
                spawnY: entry.spawnY,
                vx: entry.vx,
                vy: entry.vy,
                speed: entry.speed,
                radius: entry.radius,
                seg: entry.seg,
                flown,
                seg0: entry.seg0,
                hasTarget: !!entry.hasTarget,
                targetX: entry.targetX,
                targetY: entry.targetY,
                passesEnv: !!entry.passesEnv,
                piercesEnv: !!entry.piercesEnv,
                piercesChars: !!entry.piercesChars,
                isIndirect: !!entry.isIndirect,
                isBeam: !!entry.isBeam,
                beamCopy: !!entry.beamCopy,
                travelType: entry.travelType || 0,
                dynamicRange: entry.dynamicRange || 0,
                ignoreChars: entry.ignoreChars || 0,
                ignoreEnv: entry.ignoreEnv || 0,
                grapples: entry.grapples || 0,
                boomerang: entry.boomerang || 0,
                chains: entry.chains || 0,
                stunMs: entry.stunMs || 0,
                silenceMs: entry.silenceMs || 0,
                triggerMs: entry.triggerMs || 0,
                constantFly: entry.constantFly || 0,
                earlyTicks: entry.earlyTicks || 0,
                homeDistance: entry.homeDistance || 0,
                gravity: entry.gravity || 0,
                shotByHero: entry.shotByHero || 0,
                levelBorder: entry.levelBorder || 0,
                visualized: entry.visualized || 0,
                attachArea: entry.attachArea || 0,
                trail: entry.trail || 0,
                trailMin: entry.trailMin || 0,
                lifeTicks: entry.lifeTicks || 0,
                clientRadius: entry.clientRadius || 0,
                travelOverride: entry.travelOverride || 0,
                preMs: entry.preMs || 0,
                lifeMs: entry.lifeMs || 0,
                ticks: entry.ticks || 0,
                travelDistance: entry.travelDistance || 0,
                ageMs: entry.ageMs,
                typeId: entry.typeId,
                homing: !!entry.homing,
                seekX: entry.seekX || 0,
                seekY: entry.seekY || 0,
                bouncing: !!entry.bouncing,
                steer: entry.steer || 0,
                steerIgnoreMs: entry.steerIgnoreMs || 0,
                steerLifeMs: entry.steerLifeMs || 0,
                bounceAdd: entry.bounceAdd || 0,
                bounceMax: entry.bounceMax || 0,
                bounceKeep: entry.bounceKeep || 0,
                rehit: !!entry.rehit,
                volleyMs: _volleyMs(_weaponForOwner(entry.ownerIndex)),
                ownerIndex: entry.ownerIndex
            });
        } catch (_) {
            _liveProjectiles.delete(gid);
        }
    }
    return output;
}

function _traveled(entry, x, y) {
    return length(x - entry.spawnX, y - entry.spawnY);
}

export function updateScanner(bm, now) {
    if (!moduleBase) return;
    if (now === void 0) now = Date.now();
    const functions = getFunctions();
    try {
        const own = functions.LogicBattleModeClient_getOwnCharacter(bm);
        if (!isValidPtr(own)) {
            scanData.ownCharacter = null;
            scanData.battleModeClient = null;
            scanData.lastUpdate = 0;
            return;
        }
        scanData.ownCharacter = own;
        scanData.battleModeClient = bm;
        // v69: per-object team reads (getTeam chain / +0x40 field) are unreliable
        // - the game resolves teams via objects[ownerIndex] on a compacted array.
        // The manager's own team field (+0xe4) is what the game's own isEnemy
        // predicate compares against, so it is the authoritative "my team".
        let myTeamFromMgr = -1;
        try {
            const mgrForTeam = bm.add(offsets.BattleMode_logicBattleModeClient).readPointer();
            if (isValidPtr(mgrForTeam))
                myTeamFromMgr = mgrForTeam
                    .add(offsets.LogicGameObjectManagerClient_ownTeam)
                    .readS32() | 0;
        } catch (_) {}
        scanData.myTeamId = myTeamFromMgr >= 0 ? myTeamFromMgr : _teamOf(own, bm);
        scanData.myPlayerIndex = _readOwnerIndex(own);
        _friendlyIdx.clear();
        _friendlyIdx.add(scanData.myPlayerIndex);
        _charsByIndex.clear();
        _rememberCharacter(scanData.myPlayerIndex, own);
        scanData.myX = _fieldS32(own, offsets.LogicGameObjectClient_x);
        scanData.myY = _fieldS32(own, offsets.LogicGameObjectClient_y);
        scanData.mySpeed = 0;
        let ownData = dataFieldOf(own);
        if (!isValidPtr(ownData)) ownData = dataOf(own);
        if (isValidPtr(ownData)) {
            scanData.myRadius = collisionRadius(ownData) | 0;
            const ownSpeed = _characterSpeed(ownData);
            if (ownSpeed >= 300 && ownSpeed <= 3000) scanData.mySpeed = ownSpeed;
        }
        _probeBudget = 8;
        const enemies = [];
        const vtableProj = moduleBase.add(offsets.LogicProjectileData_vtable);
        const objMgr = bm.add(offsets.BattleMode_logicBattleModeClient).readPointer();
        if (isValidPtr(objMgr)) {
            const objects = objMgr.add(offsets.LogicGameObjectManagerClient_objects).readPointer();
            const count = objMgr.add(offsets.LogicGameObjectManagerClient_count).readU32();
            _objectsArr = isValidPtr(objects) ? objects : null;
            _objCount = isValidPtr(objects) && count > 0 && count <= 1200 ? count : 0;
            if (isValidPtr(objects) && count > 0 && count <= 1200) {
                const stride = offsets.LogicGameObjectManagerClient_ptrStride;
                let batchView = null;
                try {
                    const buf = objects.readByteArray(count * stride);
                    if (buf) batchView = new DataView(buf);
                } catch (_) {}
                for (let i = 0; i < count; i++) {
                    try {
                        let obj;
                        if (batchView) {
                            const off = i * stride;
                            const lo = batchView.getUint32(off, true);
                            const hi = batchView.getUint32(off + 4, true);
                            if (lo === 0 && hi === 0) continue;
                            obj = ptrFromU32(lo, hi);
                        } else {
                            obj = objects.add(i * stride).readPointer();
                        }
                        if (!isValidPtr(obj)) continue;
                        const data = dataFieldOf(obj);
                        if (!isValidPtr(data)) continue;
                        const team = _teamOf(obj, bm);
                        if (data.readPointer().equals(vtableProj)) {
                            _captureProjectile(obj, data, now);
                            continue;
                        }
                        if (obj.equals(own)) continue;
                        if (!_isEnemyOf(obj, bm, false)) {
                            const idx = _readOwnerIndex(obj);
                            if (idx >= 0) {
                                _friendlyIdx.add(idx);
                                if (idx !== scanData.myPlayerIndex) _rememberCharacter(idx, obj);
                            }
                            continue;
                        }
                        if (obj.add(offsets.LogicCharacterClient_hitpoints).readU32() === 0) continue;
                        const dataKey = _ptrKey(data);
                        let brawlerName;
                        if (dataKey) {
                            const cached = _brawlerNameCache.get(dataKey);
                            if (cached !== void 0) brawlerName = cached;
                            else {
                                brawlerName = _readDataName(data);
                                _brawlerNameCache.set(dataKey, brawlerName);
                            }
                        } else brawlerName = _readDataName(data);
                        const radius = collisionRadius(data) | 0;
                        if (!brawlerName && radius <= 0) continue;
                        const kind = brawlerName ? "player" : "spawnable";
                        const moveSpeed = _characterSpeed(data);
                        const playerIndex = _readOwnerIndex(obj);
                        if (brawlerName) _rememberCharacter(playerIndex, obj);
                        enemies.push({
                            gid: _ptrKey(obj),
                            ptr: obj,
                            x: _fieldS32(obj, offsets.LogicGameObjectClient_x),
                            y: _fieldS32(obj, offsets.LogicGameObjectClient_y),
                            brawlerName,
                            body: obj,
                            teamId: team,
                            moveSpeed,
                            moveAngle: _moveAngleOf(obj),
                            radius,
                            kind: kind
                        });
                    } catch (_) {}
                }
            }
        }
        _scanCount++;
        if ((_scanCount & 63) === 0) {
            _brawlerNameCache.clear();
            if (_charSpeedByData.size > 256) _charSpeedByData.clear();
        }
        scanData.enemies = enemies;
        scanData.projectiles = _updateLiveProjectiles(now);
        scanData.lastUpdate = now;
    } catch (_) {}
}

export function resetScannerCache() {
    _dataCache.clear();
    _angleCache.clear();
    _brawlerNameCache.clear();
    _charRange.clear();
    _weaponMeta.clear();
    _liveProjectiles.clear();
    _friendlyIdx.clear();
    _objectsArr = null;
    _objCount = 0;
    _charsByIndex.clear();
    _speedByData.clear();
    _charSpeedByData.clear();
    _learnedTravel.clear();
    _flightRange.clear();
    _rangeBonus.clear();
    _columnCache.clear();
    _colCands.clear();
    _rangeScale = 0;
    scanData.pathRanAt = 0;
    scanData.projectiles = [];
    scanData.measuredSpeed = 0;
    scanData.myRadius = 0;
}

export function initScanner(base) {
    moduleBase = base;
    _installCoreHooks(base);
}

export function enableProjectileTracking() {
    if (moduleBase) _installProjectileHooks(moduleBase);
}
