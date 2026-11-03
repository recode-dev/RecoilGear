import { getFunctions, isValidPtr, ptrFromU32 } from "./functions.js";
import { offsets } from "./offsets.js";
import { readScString } from "./scstring.js";
import { tileSizeUnits } from "../utils/walls.js";
const GUARD = 0xb504;

export const TILE_UNITS = 100;
export const TICKS_PER_SEC = 20;
const TICK_MS = 1000 / TICKS_PER_SEC;
export const BEAM_TICKS = 18000;
const DATA_ROW_OFF = 0x8;
const COLUMN_SPAN = 48;

function length(x, y) {
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return 46340;
    const s = x * x + y * y;
    if (s < 0) return 46340;
    return Math.floor(Math.sqrt(s));
}

var moduleBase = null;
var _brawlerNameCache = new Map();
var _scanCount = 0;
var _activeGidSet = new Set();
var _liveProjectiles = new Map();
var _friendlyIdx = new Set();
var _projectileHooksInstalled = false;
var _charRange = new Map();
var _weaponMeta = new Map();
var _speedByData = new Map();
var _charsByIndex = new Map();
var _learnedTravel = new Map();
var _rangeBonus = new Map();
var _rangeScale = 0;
var _columnCache = new Map();
var _colCands = new Map();
var _reloadCallbacks = [];
var _dataHooksInstalled = false;
var _insideTravelCall = false;

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
        const data = value.add(offsets.ProjectileClient_data).readPointer();
        if (isValidPtr(data)) return readScString(fns.LogicData_getName(data), 128);
    } catch (_) {}
    return null;
}

function _readMoveAngle(obj) {
    const fns = getFunctions();
    if (fns.LogicCharacterClient_getMoveAngle) {
        try {
            const a = fns.LogicCharacterClient_getMoveAngle(obj);
            if (isFinite(a) && Math.abs(a) <= Math.PI * 2) return a;
        } catch (_) {}
    }
    try {
        const a = obj.add(offsets.CharacterClient_moveAngle).readFloat();
        if (isFinite(a) && Math.abs(a) <= Math.PI * 2) return a;
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

function _learnRangeBonus(ownerIndex, projectile, data, owner) {
    if (ownerIndex < 0 || !isValidPtr(owner)) return;
    const learned = _learnedFor(projectile, data);
    if (!learned || !(learned.range > 0)) return;
    const tiles = _castingRangeTiles(owner);
    if (tiles <= 0) return;
    _calibrateRangeScale(tiles, learned.range);
    const bonus = learned.range - tiles * _rangeScaleUnits();
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
        const row = data.add(DATA_ROW_OFF).readPointer();
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
    if (fns.LogicDataReader_byIndex) {
        try {
            return fns.LogicDataReader_byIndex(row, col) | 0;
        } catch (_) {}
    }
    if (fns.LogicDataReader_byIndex2) {
        try {
            return fns.LogicDataReader_byIndex2(row, col) | 0;
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
    if (fns.LogicProjectileData_getBoolValueFromColumnAlt) {
        try {
            return fns.LogicProjectileData_getBoolValueFromColumnAlt(data, col) ? 1 : 0;
        } catch (_) {}
    }
    const row = _dataRow(data);
    if (row && fns.LogicDataReader_byIndex3) {
        try {
            return fns.LogicDataReader_byIndex3(row, col) ? 1 : 0;
        } catch (_) {}
    }
    return 0;
}

function _probeColumn(kind, read, data, value) {
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
        offsets.ProjectileData_radiusField,
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
        offsets.ProjectileData_speedField,
        "speed",
        1,
        20000,
        fns.LogicProjectileData_getSpeed
    );
}

function _characterSpeed(data) {
    if (!isValidPtr(data)) return 0;
    const fns = getFunctions();
    try {
        if (fns.LogicCharacterData_getSpeed) {
            const v = fns.LogicCharacterData_getSpeed(data) | 0;
            if (v > 0) return v;
        }
    } catch (_) {}
    return _readProjectileField(data, offsets.CharacterData_speedField, 1, 6000);
}

export function collisionRadius(data) {
    if (!isValidPtr(data)) return 0;
    try {
        const direct = data.add(offsets.CharacterData_collisionRadiusField).readS32() | 0;
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
    try {
        passes = data.add(offsets.ProjectileData_passesEnvironment).readU8() & 1;
    } catch (_) {}
    try {
        pierces = data.add(offsets.ProjectileData_piercesEnvironment).readU8() & 1;
    } catch (_) {}
    const piercesChars = _readProjectileBool(
        data,
        offsets.ProjectileData_piercesCharacters,
        "piercesChars"
    );
    if (!pierces)
        pierces = _flagFrom(getFunctions().LogicProjectileClient_piercesEnvironment, data, data);
    return { passes: !!passes, pierces: !!pierces, piercesChars: !!piercesChars };
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
        offsets.ProjectileData_bouncePercent,
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
    let preMs = _readProjectileField(data, offsets.ProjectileData_preExplosionMs, 1, 60000);
    let typeId = -1;
    let steer = 0;
    let isBeam = !!beam;
    let homing = _readProjectileBool(data, offsets.ProjectileData_isHomingMissile, "homing");
    let bouncing = _readProjectileBool(data, offsets.ProjectileData_isBouncing, "bouncing");
    const steerIgnoreTicks = _readProjectileInt(
        data,
        offsets.ProjectileData_steerIgnoreTicks,
        "steerIgnore",
        1,
        400,
        null
    );
    const steerLifeRaw = _readProjectileInt(
        data,
        offsets.ProjectileData_steerLifeTime,
        "steerLife",
        1,
        20000,
        null
    );
    const bounceAdd = _readProjectileInt(
        data,
        offsets.ProjectileData_distanceAddFromBounce,
        "bounceAdd",
        1,
        3000,
        null
    );
    const bounceMax = _readProjectileInt(
        data,
        offsets.ProjectileData_maxDistanceBounces,
        "bounceMax",
        1,
        20000,
        null
    );
    const bounceKeep = _readBounceKeep(data);
    const rehit = _readProjectileBool(data, offsets.ProjectileData_canHitAgainAfterBounce, "rehit");
    if (fns.LogicProjectileClient_getPreExplosionTimeMs && !(preMs > 0)) {
        try {
            const v = fns.LogicProjectileClient_getPreExplosionTimeMs(data) | 0;
            if (v > 0 && v <= 60000) preMs = v;
        } catch (_) {}
    }
    if (!homing) homing = _flagFrom(fns.LogicProjectileClient_isHomingMissile, data, projectile);
    if (!bouncing) bouncing = _flagFrom(fns.LogicProjectileClient_isBouncing, data, projectile);
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
    if (fns.LogicProjectileClient_getType) {
        const holders = [data, projectile];
        for (let i = 0; i < holders.length; i++) {
            try {
                const t = fns.LogicProjectileClient_getType(holders[i]) | 0;
                if (t >= 0 && t <= 20) {
                    typeId = t;
                    break;
                }
            } catch (_) {}
        }
    }
    if (typeId < 0) {
        const t = _readClientU32(projectile, offsets.ProjectileClient_typeField, 20);
        if (t >= 0) typeId = t;
    }
    try {
        const v = data.add(offsets.ProjectileData_steerStrength).readFloat();
        if (v > 0 && v <= 1000) steer = v;
    } catch (_) {}
    const travelType = _readClientU32(projectile, offsets.ProjectileClient_travelType, 16);
    let beamCopy = 0;
    try {
        beamCopy = projectile.add(offsets.ProjectileClient_isBeamCopy).readU8() & 1;
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
            projectile.add(offsets.ProjectileClient_targetX).readS32() | 0,
            projectile.add(offsets.ProjectileClient_targetY).readS32() | 0,
            x,
            y
        );
        if (hit) return hit;
    } catch (_) {}
    if (fns.LogicProjectileClient_getTargetX && fns.LogicProjectileClient_getTargetY) {
        const holders = [projectile, data];
        for (let i = 0; i < holders.length; i++) {
            if (!isValidPtr(holders[i])) continue;
            try {
                const hit = _validTarget(
                    fns.LogicProjectileClient_getTargetX(holders[i]) | 0,
                    fns.LogicProjectileClient_getTargetY(holders[i]) | 0,
                    x,
                    y
                );
                if (hit) return hit;
            } catch (_) {}
        }
    }
    return null;
}

function _captureProjectile(projectile, data) {
    if (!isValidPtr(projectile)) return;
    const fns = getFunctions();
    try {
        if (!isValidPtr(data)) data = fns.LogicGameObjectClient_getData(projectile);
        if (!isValidPtr(data)) return;
        const gid = String(fns.LogicGameObjectClient_getGlobalID(projectile));
        const existing = _liveProjectiles.get(gid);
        if (existing) {
            existing.ptr = projectile;
            existing.data = data;
            return;
        }
        const x = fns.LogicGameObjectClient_getX(projectile) | 0;
        const y = fns.LogicGameObjectClient_getY(projectile) | 0;
        const dataSpeed = _readProjectileSpeed(data);
        const radius = _readProjectileRadius(data);
        const flags = _readProjectileFlags(data);
        const target = _readProjectileTarget(projectile, data, x, y);
        let isIndirect = 0;
        try {
            if (offsets.Projectile_isIndirect && isValidPtr(data)) {
                isIndirect = data.add(offsets.Projectile_isIndirect).readU8() | 0;
            }
        } catch (_) {}
        let isBeam = false;
        try {
            isBeam = data.add(offsets.ProjectileData_isBeamField).readU8() > 0;
        } catch (_) {}
        if (!isBeam && fns.LogicProjectileClient_isBeam) {
            try {
                isBeam = !!fns.LogicProjectileClient_isBeam(data);
            } catch (_) {}
        }
        const ownerIndex = _readOwnerIndex(projectile);
        const name = _readProjectileName(data);
        const castRange = _rangeForOwner(ownerIndex);
        _learnRangeBonus(ownerIndex, projectile, data, _charsByIndex.get(ownerIndex));
        const meta = _readProjectileMeta(projectile, data, dataSpeed, castRange, isBeam);
        let seekX = 0;
        let seekY = 0;
        if (meta.homing && (scanData.myX || scanData.myY)) {
            const dx = scanData.myX - x;
            const dy = scanData.myY - y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 1) {
                seekX = dx / len;
                seekY = dy / len;
            }
        }
        const now = Date.now();
        _liveProjectiles.set(gid, {
            gid,
            ptr: projectile,
            data,
            ownerIndex,
            name,
            seekX,
            seekY,
            x,
            y,
            spawnX: x,
            spawnY: y,
            speed: dataSpeed,
            radius,
            targetX: target ? target.x : 0,
            targetY: target ? target.y : 0,
            hasTarget: !!target,
            passesEnv: flags.passes,
            piercesEnv: flags.pierces,
            piercesChars: flags.piercesChars,
            isIndirect: isIndirect || meta.travelType > 0,
            isBeam: meta.isBeam,
            beamCopy: meta.beamCopy,
            travelType: meta.travelType,
            castRange,
            preMs: meta.preMs,
            lifeMs: meta.lifeMs,
            ticks: meta.ticks,
            travelDistance: meta.travel,
            typeId: meta.typeId,
            homing: meta.homing,
            bouncing: meta.bouncing,
            steer: meta.steer,
            steerIgnoreMs: meta.steerIgnoreMs,
            steerLifeMs: meta.steerLifeMs,
            bounceAdd: meta.bounceAdd,
            bounceMax: meta.bounceMax,
            bounceKeep: meta.bounceKeep,
            rehit: meta.rehit,
            spawnTs: now,
            weapon: _weaponForOwner(ownerIndex),
            lastX: x,
            lastY: y,
            lastTs: now,
            hasVelocitySample: false,
            vx: 0,
            vy: 0
        });
    } catch (_) {}
}

function _removeProjectile(projectile) {
    try {
        const gid = String(getFunctions().LogicGameObjectClient_getGlobalID(projectile));
        _liveProjectiles.delete(gid);
    } catch (_) {}
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
    _rangeBonus.clear();
    _columnCache.clear();
    _colCands.clear();
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
                this.data = args[1];
            },
            onLeave() {
                _captureProjectile(this.projectile, this.data);
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
                _captureProjectile(this.projectile, null);
            }
        });
    } catch (_) {}
    _installTravelTicksHook(base);
    _installProjectilePathHook(base);
    _installDataReloadHooks(base);
}

function _updateLiveProjectiles(now) {
    const fns = getFunctions();
    const output = [];
    for (const [gid, projectile] of _liveProjectiles) {
        try {
            if (projectile.ptr.isNull()) {
                _liveProjectiles.delete(gid);
                continue;
            }
            const x = fns.LogicGameObjectClient_getX(projectile.ptr) | 0;
            const y = fns.LogicGameObjectClient_getY(projectile.ptr) | 0;
            const dt = (now - projectile.lastTs) / 1000;
            const dx = x - projectile.lastX;
            const dy = y - projectile.lastY;
            if (dt > 0.008 && dt < 0.3 && dx * dx + dy * dy >= 16) {
                const observedVx = dx / dt;
                const observedVy = dy / dt;
                if (length(observedVx, observedVy) > 8500) {
                    projectile.lastX = x;
                    projectile.lastY = y;
                    projectile.lastTs = now;
                    continue;
                }
                const alpha = projectile.hasVelocitySample ? 0.4 : 1;
                projectile.vx = projectile.vx * (1 - alpha) + observedVx * alpha;
                projectile.vy = projectile.vy * (1 - alpha) + observedVy * alpha;
                projectile.hasVelocitySample = true;

                const measured = length(projectile.vx, projectile.vy);
                if (measured >= 300 && measured <= 8500) {
                    projectile.speed = measured;
                    if (projectile.ownerIndex === scanData.myPlayerIndex) {
                        const dataPtr = projectile.data;
                        if (isValidPtr(dataPtr)) {
                            const key = dataPtr.toString();
                            const entry = _speedByData.get(key) || { sum: 0, count: 0 };
                            entry.sum += measured;
                            entry.count++;
                            _speedByData.set(key, entry);
                            scanData.measuredSpeed = Math.round(entry.sum / entry.count);
                        }
                    }
                }
            }
            const liveTarget = _readProjectileTarget(projectile.ptr, projectile.data, x, y);
            if (liveTarget) {
                projectile.targetX = liveTarget.x;
                projectile.targetY = liveTarget.y;
                projectile.hasTarget = true;
            } else {
                projectile.hasTarget = false;
            }
            projectile.lastX = x;
            projectile.lastY = y;
            projectile.lastTs = now;
            if (projectile.castRange <= 0) {
                projectile.castRange = _rangeForOwner(projectile.ownerIndex);
            }
            if (!(projectile.travelDistance > 0)) {
                const learned = _learnedFor(projectile.ptr, projectile.data);
                if (learned && learned.ticks > 0) {
                    _learnRangeBonus(
                        projectile.ownerIndex,
                        projectile.ptr,
                        projectile.data,
                        _charsByIndex.get(projectile.ownerIndex)
                    );
                    projectile.ticks = learned.ticks;
                    projectile.travelDistance =
                        learned.range > 0
                            ? learned.range
                            : travelDistance(learned.ticks, learned.speed || projectile.speed);
                    if (learned.beam) projectile.isBeam = true;
                }
            }
            if (projectile.ownerIndex >= 0 && _friendlyIdx.has(projectile.ownerIndex)) continue;
            if (projectile.ownerIndex >= 0 && projectile.ownerIndex === scanData.myPlayerIndex)
                continue;
            output.push({
                gid,
                name: projectile.name,
                x,
                y,
                spawnX: projectile.spawnX,
                spawnY: projectile.spawnY,
                speed: projectile.speed,
                radius: projectile.radius,
                targetX: projectile.targetX,
                targetY: projectile.targetY,
                hasTarget: !!projectile.hasTarget,
                passesEnv: !!projectile.passesEnv,
                piercesEnv: !!projectile.piercesEnv,
                isIndirect: !!projectile.isIndirect,
                isBeam: !!projectile.isBeam,
                beamCopy: !!projectile.beamCopy,
                travelType: projectile.travelType || 0,
                piercesChars: !!projectile.piercesChars,
                castRange: projectile.castRange || 0,
                preMs: projectile.preMs || 0,
                lifeMs: projectile.lifeMs || 0,
                ticks: projectile.ticks || 0,
                travelDistance: projectile.travelDistance || 0,
                ageMs: Math.max(0, now - (projectile.spawnTs || now)),
                typeId: projectile.typeId,
                homing: projectile.homing,
                seekX: projectile.seekX,
                seekY: projectile.seekY,
                bouncing: projectile.bouncing,
                steer: projectile.steer || 0,
                steerIgnoreMs: projectile.steerIgnoreMs || 0,
                steerLifeMs: projectile.steerLifeMs || 0,
                bounceAdd: projectile.bounceAdd || 0,
                bounceMax: projectile.bounceMax || 0,
                bounceKeep: projectile.bounceKeep || 0,
                rehit: !!projectile.rehit,
                volleyMs: _volleyMs(projectile.weapon),
                ownerIndex: projectile.ownerIndex,
                vx: projectile.vx,
                vy: projectile.vy
            });
        } catch (_) {
            _liveProjectiles.delete(gid);
        }
    }
    return output;
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
        scanData.myTeamId = bm.add(offsets.BattleModeClient_ownTeam).readS32();
        scanData.myPlayerIndex = _readOwnerIndex(own);
        _friendlyIdx.clear();
        _friendlyIdx.add(scanData.myPlayerIndex);
        _charsByIndex.clear();
        _rememberCharacter(scanData.myPlayerIndex, own);
        scanData.myX = functions.LogicGameObjectClient_getX(own) | 0;
        scanData.myY = functions.LogicGameObjectClient_getY(own) | 0;
        scanData.mySpeed = 0;
        const ownData = functions.LogicGameObjectClient_getData(own);
        if (isValidPtr(ownData)) {
            scanData.myRadius = collisionRadius(ownData) | 0;
            const ownSpeed = _characterSpeed(ownData);
            if (ownSpeed >= 300 && ownSpeed <= 3000) scanData.mySpeed = ownSpeed;
        }
        const enemies = [];
        const vtableProj = moduleBase.add(offsets.VTABLE_PROJECTILE_DATA);
        const objMgr = bm.add(offsets.BattleModeClient_objectManager).readPointer();
        if (isValidPtr(objMgr)) {
            const objects = objMgr.add(offsets.ObjectManager_objectsArray).readPointer();
            const count = objMgr.add(offsets.ObjectManager_count).readU32();
            if (isValidPtr(objects) && count > 0 && count <= 1200) {
                const stride = offsets.ObjectManager_ptrStride;
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
                        const data = functions.LogicGameObjectClient_getData(obj);
                        if (!isValidPtr(data)) continue;
                        const team = obj.add(offsets.GameObj_team).readU32();
                        if (data.readPointer().equals(vtableProj)) {
                            _captureProjectile(obj, data);
                            continue;
                        }
                        if (team === scanData.myTeamId) {
                            const idx = _readOwnerIndex(obj);
                            if (idx >= 0) _friendlyIdx.add(idx);
                            continue;
                        }
                        if (obj.add(offsets.GameObj_hp).readU32() === 0) continue;
                        const gid = String(functions.LogicGameObjectClient_getGlobalID(obj));
                        let brawlerName = _brawlerNameCache.get(gid);
                        if (brawlerName === void 0) {
                            brawlerName = _readDataName(data);
                            _brawlerNameCache.set(gid, brawlerName);
                        }
                        const radius = collisionRadius(data) | 0;
                        if (!brawlerName && radius <= 0) continue;
                        const kind = brawlerName ? "player" : "spawnable";
                        const moveSpeed = _characterSpeed(data);
                        const playerIndex = _readOwnerIndex(obj);
                        if (brawlerName) _rememberCharacter(playerIndex, obj);
                        enemies.push({
                            gid,
                            ptr: obj,
                            x: functions.LogicGameObjectClient_getX(obj) | 0,
                            y: functions.LogicGameObjectClient_getY(obj) | 0,
                            brawlerName,
                            body: obj,
                            teamId: team,
                            moveSpeed,
                            moveAngle: _readMoveAngle(obj),
                            radius,
                            kind: kind
                        });
                    } catch (_) {}
                }
            }
        }
        _scanCount++;
        if ((_scanCount & 63) === 0) {
            _activeGidSet.clear();
            for (const enemy of enemies) _activeGidSet.add(enemy.gid);
            for (const gid of _brawlerNameCache.keys()) {
                if (!_activeGidSet.has(gid)) _brawlerNameCache.delete(gid);
            }
        }
        scanData.enemies = enemies;
        scanData.projectiles = _updateLiveProjectiles(now);
        scanData.lastUpdate = now;
    } catch (_) {}
}

export function resetScannerCache() {
    _brawlerNameCache.clear();
    _charRange.clear();
    _weaponMeta.clear();
    _liveProjectiles.clear();
    _friendlyIdx.clear();
    _charsByIndex.clear();
    _speedByData.clear();
    _learnedTravel.clear();
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
}

export function enableProjectileTracking() {
    if (moduleBase) _installProjectileHooks(moduleBase);
}
