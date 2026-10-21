// bundled from rbs/ (REvengeBS autododge port, Nulls Brawl v69.252)
(function(){
"use strict";

// ---- core/offsets.js ----
const offsets = Object.freeze({
    BattleMode_objectManagerPtr: 0x28,
    BattleMode_clientInputManager: 0x58,
    BattleMode_hashKey: 0x60,
    BattleMode_hashEnabled: 0x70,

    ObjectManager_objectsArray: 0x0,
    ObjectManager_count: 0xc,
    ObjectManager_ptrStride: 0x8,

    TileMap_Width: 0xc4,
    TileMap_Height: 0xc8,
    TileMap_TilesArray: 0x20,
    TileTypeData_BlocksMovement: 0x56,

    GameObj_team: 0x40,
    GameObj_hp: 0xc4,
    LogicGameObjectClient_ownerIndex: 0x3c,

    LogicCharacterClient_body: 0xa0,
    LogicCharacterClient_hyperActive: 0xa8,
    LogicCharacterClientOwn_speedBuff: 0,
    CharData_brawlerId: 0x35c,
    HeroData_namePtr: 0x18,
    LogicSkillData_kind: 0x8,

    LogicProjectileClient_ownerTeam: 0x40,
    LogicProjectileClient_dataName: 0x18,
    LogicProjectileClient_data: 0x10,
    Projectile_isIndirect: 0x118,
    ProjectileData_speed: 0x124,
    ProjectileData_radius: 0x74,
    Projectile_angle: 0,

    ClientInput_x: 0xc,
    ClientInput_y: 0x10,
    ClientInput_skillData: 0x40,
    ClientInput_typeConstantTable: 0xe1bd30,
    ClientInput_typeFallback: 0xe1bc28,
    ClientInput_hashInnerMask: 0xe1bbd0,
    ClientInput_hashOuterMask: 0xe1bbf0,

    ScString_length: 0x4,
    ScString_data: 0x8,

    VTABLE_PROJECTILE_DATA: 0xff3b18,

    LogicBattleModeClient_update: 0xac1ee8,
    BattleScreen_activateSkill: 0x7a0084,
    BattleScreen_getClosestTargetForAutoshoot: 0x7b67ec,
    LogicTile__setData: 0x9401fc,
    LogicProjectileClient_ctor: 0xa3146c,
    LogicProjectileClient_destruct: 0xa31a00,

    BattleMode_getInstance: 0x8c5130,
    LogicBattleModeClient_getOwnCharacter: 0xac3934,
    LogicBattleModeClient_getOwnPlayerTeam: 0xa7f47c,
    LogicBattleModeClient_getOwnPlayerIndex: 0x9cda04,
    LogicBattleModeClient__getOwnPlayerIndex: 0x9cda04,
    LogicBattleModeClient_getTileMap: 0x991440,
    LogicBattleModeClient__getTileMap: 0x991440,
    LogicBattleModeClient_setClientPredictionMoveTo: 0xac3a58,

    ClientInputManager_addInput: 0x74675c,
    ClientInput_constructor_int: 0xa95798,
    operator_new: 0xd8da2c,

    LogicGameObjectClient_getX: 0xa23afc,
    LogicGameObjectClient_getY: 0xa23b04,
    LogicGameObjectClient_getData: 0x117050,
    LogicGameObjectClient_getGlobalID: 0x46464c,

    LogicCharacterData_getSpeed: 0x9911ec,
    LogicCharacterData_getCollisionRadius: 0x9913e8,
    LogicCharacterClient_getWeaponSkill: 0x9fc440,
    LogicCharacterClient__getWeaponSkill: 0x9fc440,
    LogicCharacterClient_getSkillAt: 0xa007fc,
    LogicCharacterClient__getSkillAt: 0xa007fc,
    LogicCharacterClient_getLinkedCarryable: 0x9fc704,
    LogicCharacterClient__getLinkedCarryable: 0x9fc704,

    LogicSkillClient_getData: 0x1e5650,
    LogicSkillClient__getData: 0x1e5650,
    LogicSkillData_getCastingRange: 0x9de9cc,
    LogicSkillData__getCastingRange: 0x9de9cc,
    LogicSkillData_getProjectileData: 0x9e84a8,
    LogicSkillData__getProjectileData: 0x9e84a8,

    LogicProjectileClient_getData: 0x117050,
    LogicProjectileClient_getTargetX: 0,
    LogicProjectileClient_getTargetY: 0,
    LogicProjectileData_getSpeed: 0x8cee94,
    LogicProjectileData_getRadius: 0x860d88,
    LogicProjectileData_getRendering: 0x97d5c0,
    LogicProjectileData_isBeam: 0,
    LogicProjectileData__isBeam: 0,
    LogicProjectileData_getSpawnAreaEffect: 0x9cda1c,
    LogicProjectileData__getSpawnAreaEffect: 0x9cda1c,

    AreaEffectData_getRadius: 0x8cee8c,
    AreaEffectData__getRadius: 0x8cee8c,
    AreaEffectData_getActiveTimeMs: 0x9bf8f4,
    AreaEffectData__getActiveTimeMs: 0x9bf8f4,

    LogicData_getName: 0x9a4f1c,
    StringCtor: 0xd3f6bc,
    ScString_destruct: 0xd3f5a0
});

// ---- core/functions.js ----
var base = null;
var _n = null;

function _nf(name, ret, args)
{
    const off = offsets[name];
    if (typeof off !== "number" || off <= 0) return null;
    try
    {
        return new NativeFunction(base.add(off), ret, args);
    }
    catch (_)
    {
        return null;
    }
}

function initFunctions(baseIn)
{
    if (_n) return _n;
    base = baseIn;

    _n = {
        BattleMode_getInstance: _nf("BattleMode_getInstance", "pointer", []),
        LogicGameObjectClient_getX: _nf("LogicGameObjectClient_getX", "int32", ["pointer"]),
        LogicGameObjectClient_getY: _nf("LogicGameObjectClient_getY", "int32", ["pointer"]),
        LogicGameObjectClient_getZ: _nf("LogicGameObjectClient_getZ", "int32", ["pointer"]),
        LogicBattleModeClient_getOwnCharacter: _nf("LogicBattleModeClient_getOwnCharacter", "pointer", ["pointer"]),
        LogicBattleModeClient_setClientPredictionMoveTo: _nf("LogicBattleModeClient_setClientPredictionMoveTo", "void", ["pointer", "int", "int", "int"]),
        ClientInput_constructor_int: _nf("ClientInput_constructor_int", "pointer", ["pointer", "int"]),
        ClientInputManager_addInput: _nf("ClientInputManager_addInput", "void", ["pointer", "pointer"]),
        LogicGameObjectClient_getGlobalID: _nf("LogicGameObjectClient_getGlobalID", "uint32", ["pointer"]),
        LogicBattleModeClient_getOwnPlayerTeam: _nf("LogicBattleModeClient_getOwnPlayerTeam", "uint32", ["pointer"]),
        LogicBattleModeClient_getOwnPlayerIndex: _nf("LogicBattleModeClient__getOwnPlayerIndex", "int32", ["pointer"]),
        LogicGameObjectClient_getData: _nf("LogicGameObjectClient_getData", "pointer", ["pointer"]),
        LogicProjectileData_getSpeed: _nf("LogicProjectileData_getSpeed", "uint32", ["pointer"]),
        LogicProjectileData_getRadius: _nf("LogicProjectileData_getRadius", "uint32", ["pointer"]),
        LogicProjectileData_getSpawnAreaEffect: _nf("LogicProjectileData__getSpawnAreaEffect", "pointer", ["pointer"]),
        AreaEffectData_getRadius: _nf("AreaEffectData__getRadius", "int32", ["pointer"]),
        AreaEffectData_getActiveTimeMs: _nf("AreaEffectData__getActiveTimeMs", "int32", ["pointer"]),
        LogicProjectileData_getRendering: _nf("LogicProjectileData_getRendering", "int32", ["pointer"]),
        LogicProjectileData_isBeam: _nf("LogicProjectileData__isBeam", "bool", ["pointer"]),
        LogicCharacterData_getSpeed: _nf("LogicCharacterData_getSpeed", "int32", ["pointer"]),
        LogicCharacterData_getCollisionRadius: _nf("LogicCharacterData_getCollisionRadius", "uint32", ["pointer"]),
        BattleScreen_getLogicBattleModeClient: _nf("GameScreen__getLogicBattle", "pointer", ["pointer"]),
        LogicBattleModeClient_getTileMap: _nf("LogicBattleModeClient__getTileMap", "pointer", ["pointer"]),
        LogicProjectileClient_getData: _nf("LogicProjectileClient_getData", "pointer", ["pointer"]),
        LogicProjectileClient_getTargetX: _nf("LogicProjectileClient_getTargetX", "int32", ["pointer"]),
        LogicProjectileClient_getTargetY: _nf("LogicProjectileClient_getTargetY", "int32", ["pointer"]),
        LogicCharacterClient_getWeaponSkill: _nf("LogicCharacterClient__getWeaponSkill", "pointer", ["pointer"]),
        LogicSkillData_getCastingRange: _nf("LogicSkillData__getCastingRange", "int32", ["pointer"]),
        LogicCharacterClient_getLinkedCarryable: _nf("LogicCharacterClient__getLinkedCarryable", "pointer", ["pointer", "pointer"]),
        LogicSkillData_getProjectileData: _nf("LogicSkillData__getProjectileData", "pointer", ["pointer", "int"]),
        LogicSkillClient_getData: _nf("LogicSkillClient__getData", "pointer", ["pointer", "int"]),
        LogicData_getName: _nf("LogicData_getName", "pointer", ["pointer"]),
        StringCtor: _nf("StringCtor", "pointer", ["pointer", "pointer"]),
        ScString_destruct: _nf("ScString_destruct", "pointer", ["pointer"]),
        TextField_setText: _nf("TextField_setText", "pointer", ["pointer", "pointer"]),
        LogicCharacterClient_isImmuneOrUntargetable: _nf("LogicCharacterClient__isImmuneOrUntargetable", "bool", ["pointer"]),
        LogicSkillData_getMsBetweenAttacks: _nf("LogicSkillData__getMsBetweenAttacks", "int", ["pointer"]),
        LogicSkillData_getBehaviour: _nf("LogicSkillData__getBehaviour", "int", ["pointer"]),
        LogicSkillData_getLinkedSkill: _nf("LogicSkillData__getLinkedSkill", "pointer", ["pointer"]),
        LogicCharacterClient_getSkillAt: _nf("LogicCharacterClient__getSkillAt", "pointer", ["pointer", "int"]),
        LogicSkillClient_canActivate: _nf("LogicSkillClient__canActivate", "bool", ["pointer", "pointer", "pointer"]),
        BattleScreen_fireWrapper: _nf("BattleScreen_fireWrapperFn", "int", ["pointer", "pointer"]),
        CombatHUD_sendPinCommand: _nf("CombatHUD__sendPinCommand", "void", ["int"]),
        CombatHUD_sendSprayCommand: _nf("CombatHUD__sendSprayCommand", "void", ["int"]),
        MovieClip_gotoAndStopFrameIndex: _nf("MovieClip__gotoAndStopFrameIndex", "pointer", ["pointer", "int"]),
        ResourceManager_isResourceLoaded: _nf("ResourceManager__isResourceLoaded", "pointer", ["pointer", "int"]),
        DropGUIContainer_ctorFromExport: _nf("DropGUIContainer__ctorFromExport", "pointer", ["pointer", "pointer", "pointer"]),
        MovieClip_getTextFieldByName: _nf("MovieClip__getTextFieldByName", "pointer", ["pointer", "pointer"]),
        Stage_addChild: _nf("Stage_addChild", "pointer", ["pointer", "pointer"]),
        TeamChatMessage_ctor: _nf("TeamChatMessage__ctor", "void", ["pointer"]),
        MessageManager_sendMessage: _nf("MessageManager__sendMessage", "void", ["pointer", "pointer"]),
        Name_setupDecorated: _nf("Name_setupDecorated", "pointer", ["pointer", "pointer", "pointer"]),
        operator_new: _nf("operator_new", "pointer", ["ulong"]),
    };
    Object.freeze(_n);
    return _n;
}

function getFunctions()
{
    if (!_n) throw new Error("Functions not initialized! Call initFunctions(base) first.");
    return _n;
}

function getBase()
{
    if (!base) throw new Error("Functions not initialized! Call initFunctions(base) first.");
    return base;
}

// ---- core/scstring.js ----
const INLINE_MAX_LENGTH = 7;
const DEFAULT_MAX_LENGTH = 256;
const SCSTRING_SIZE = 32;

function readScString(value, maxLength = DEFAULT_MAX_LENGTH)
{
    try
    {
        if (!value || value.isNull()) return null;
        const length = value.add(offsets.ScString_length).readS32();
        if (length <= 0 || length > maxLength) return null;
        const data = length <= INLINE_MAX_LENGTH ?
            value.add(offsets.ScString_data) :
            value.add(offsets.ScString_data).readPointer();
        if (!data || data.isNull()) return null;
        return data.readUtf8String(length);
    }
    catch (_)
    {
        return null;
    }
}

function withScString(text, fn)
{
    const fns = getFunctions();
    if (!fns.StringCtor || !fns.ScString_destruct) return null;
    const sc = Memory.alloc(SCSTRING_SIZE);
    fns.StringCtor(sc, Memory.allocUtf8String(text));
    try
    {
        return fn(sc);
    }
    finally
    {
        fns.ScString_destruct(sc);
    }
}

// ---- utils/brawlerName.js ----
const ALIASES = {
    "8-BIT": "8BIT",
    EL_PRIMO: "PRIMO",
    ELPRIMO: "PRIMO",
    MR_P: "MRP",
    "MR.P": "MRP",
    LARRY_AND_LAWRIE: "TWINS",
    LOLA: "LOLLA",
    MELODIE: "MELODY",
    JESSIE: "JESS",
    DYNAMIKE: "MIKE",
    DARRYL: "BARRELBOT",
    HANK: "FISHTANK",
    MOE: "DIGGER",
    GLOWY: "GLOWBERT",
    BOLT: "BOLDER",
    KENJI: "SAMURAI",
    TARA: "TARO",
    RICO: "RICK",
    STARR_NOVA: "STELLA",
    PAM: "MJ",
    SAM: "BRONSON",
    "JAE-YONG": "JAE",
    JAE_YONG: "JAE"
};

function canonBrawlerName(name)
{
    if (!name) return null;
    const upper = String(name).trim().toUpperCase().replace(/\s+/g, "_");
    return ALIASES[upper] || upper;
}

// ---- utils/logger.js ----
const LEVEL_DEBUG = "debug";
const LEVEL_INFO = "info";
const LEVEL_WARN = "warn";
const LEVEL_ERROR = "error";
const BATCH_SIZE = 32;
const FLUSH_DELAY_MS = 100;
const MAX_PENDING = 512;
const EVERY_COOLDOWN_MS = 100;

var _enabled = false;
var _pending = [];
var _timer = null;
var _repeatCounts = Object.create(null);
var _repeatAt = Object.create(null);

function _flush()
{
    _timer = null;
    if (!_pending.length) return;
    const entries = _pending;
    _pending = [];
    try
    {
        send(
        {
            type: "LOG_BATCH",
            entries
        });
    }
    catch (_)
    {}
}

function _push(level, message, data)
{
    if (!_enabled) return;
    const entry = {
        lvl: level,
        msg: String(message || "")
    };
    if (data !== void 0) entry.data = data;
    _pending.push(entry);
    if (_pending.length >= MAX_PENDING) _pending.splice(0, _pending.length - MAX_PENDING);
    if (_pending.length >= BATCH_SIZE)
    {
        if (_timer !== null)
        {
            clearTimeout(_timer);
            _timer = null;
        }
        _flush();
    }
    else if (_timer === null)
    {
        _timer = setTimeout(_flush, FLUSH_DELAY_MS);
    }
}

function setLoggingEnabled(value)
{
    const next = !!value;
    if (next === _enabled) return;
    _enabled = next;
    if (_enabled)
    {
        _push(LEVEL_DEBUG, "agent logging enabled");
    }
    else
    {
        _flush();
        _repeatCounts = Object.create(null);
        _repeatAt = Object.create(null);
    }
}

function isLoggingEnabled()
{
    return _enabled;
}

function logInfo(message, data)
{
    _push(LEVEL_INFO, message, data);
}

function logWarn(message, data)
{
    _push(LEVEL_WARN, message, data);
}

function logError(message, data)
{
    _push(LEVEL_ERROR, message, data);
}

function logEvery(interval, message, data)
{
    if (!_enabled) return;
    const key = String(message || "");
    const count = (_repeatCounts[key] || 0) + 1;
    _repeatCounts[key] = count;
    if (count % (interval | 0 || 1) !== 0) return;
    const now = Date.now();
    if (now - (_repeatAt[key] || 0) < EVERY_COOLDOWN_MS) return;
    _repeatAt[key] = now;
    _push(LEVEL_DEBUG, message, data);
}

function resetLogCounters()
{
    _repeatCounts = Object.create(null);
    _repeatAt = Object.create(null);
}

// ---- utils/flags.js ----
var FEATURE_NAMES = [
    "aimbot",
    "autododge",
    "esp",
    "spinner",
    "killaura",
    "camera",
    "spray",
    "pin",
    "brawltv",
    "spec",
    "chatspam",
    "fps",
    "fpsunlock",
    "gradient",
    "holdshoot",
    "speedhack"
];

var FLAG_OF = {};
var state = {};
FEATURE_NAMES.forEach((name, index) =>
{
    FLAG_OF[name] = 1 << index;
    state[name] = false;
});

function registerFeature(name)
{
    if (name in state) return;
    FLAG_OF[name] = 1 << FEATURE_NAMES.length;
    FEATURE_NAMES.push(name);
    state[name] = false;
}

var FLAG_AIMBOT = FLAG_OF.aimbot;
var FLAG_AUTODODGE = FLAG_OF.autododge;
var FLAG_ESP = FLAG_OF.esp;
var FLAG_SPINNER = FLAG_OF.spinner;
var FLAG_KILLAURA = FLAG_OF.killaura;
var FLAG_SPRAY = FLAG_OF.spray;
var FLAG_PIN = FLAG_OF.pin;
var FLAG_HOLDSHOOT = FLAG_OF.holdshoot;
var FLAG_SPEEDHACK = FLAG_OF.speedhack;

var _flags = 0;
function setState(feature, value)
{
    if (!(feature in state)) return;
    const enabled = !!value;
    state[feature] = enabled;
    if (enabled) _flags |= FLAG_OF[feature];
    else _flags &= ~FLAG_OF[feature];
}
function getFlags()
{
    return _flags;
}
function setupSafe(label, fn)
{
    try
    {
        fn();
        logInfo(label + " ready");
        return true;
    }
    catch (e)
    {
        const reason = e && e.message ? e.message : String(e);
        logError(label + " setup failed",
        {
            module: label,
            reason
        });
        try
        {
            send(
            {
                type: "ERROR",
                code: 2,
                text: `setup ${label}: ${reason}`
            });
        }
        catch (_)
        {}
        return false;
    }
}

// ---- core/scanner.js ----
var moduleBase = null;
var _brawlerNameCache = new Map();
var _scanCount = 0;
var _activeGidSet = new Set();
var _liveProjectiles = new Map();
var _destroyed = [];
var _friendlyIdx = new Set();
var _projectileHooksInstalled = false;
var MASSIVE_RADIUS_THRESHOLD = 380;
var CASTING_RANGE_SCALE = 100;
var SKILL_SLOT_MAX = 8;
var PROJ_INDEX_MAX = 4;
var _rangeByName = new Map();
var _harvestedChars = new Set();
var _charsByIndex = new Map();

var scanData = {
    ownCharacter: ptr(0),
    battleModeClient: ptr(0),
    myTeamId: 0,
    myPlayerIndex: -1,
    myX: 0,
    myY: 0,
    myRadius: 60,
    mySpeed: 720,
    hackSpeed: 0,
    myBrawlerId: 0,
    myBrawlerName: null,
    hasCarryable: false,
    throwsOverWalls: false,
    enemies: [],
    projectiles: [],
    destroyed: [],
    liveProjectiles: 0,
    lastUpdate: 0
};

function _validPtr(value)
{
    return value && !value.isNull();
}

function ptrFromU32(lo, hi)
{
    if (!lo && !hi) return ptr(0);
    return ptr("0x" + (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0"));
}

function _readHeroIconName(data)
{
    try
    {
        const namePtr = data.add(offsets.HeroData_namePtr).readPointer();
        if (!_validPtr(namePtr)) return null;
        const str = namePtr.readCString();
        if (str && str.startsWith("hero_icon_")) return str.substring(10).toUpperCase();
    }
    catch (_)
    {}
    return null;
}

function _readThrowsOverWalls(fns, own)
{
    if (!fns.LogicCharacterClient_getWeaponSkill || !fns.LogicSkillData_getProjectileData) return false;
    try
    {
        const skill = fns.LogicCharacterClient_getWeaponSkill(own);
        if (!_validPtr(skill)) return false;
        const projectile = fns.LogicSkillData_getProjectileData(skill, 0);
        if (!_validPtr(projectile)) return false;
        return (projectile.add(offsets.Projectile_isIndirect).readU32() | 0) !== 0;
    }
    catch (_)
    {
        return false;
    }
}

function _readHasCarryable(fns, own, bm)
{
    if (!fns.LogicCharacterClient_getLinkedCarryable) return false;
    try
    {
        return _validPtr(fns.LogicCharacterClient_getLinkedCarryable(own, bm));
    }
    catch (_)
    {
        return false;
    }
}

function _readProjectileName(data)
{
    try
    {
        const fns = getFunctions();
        if (fns.LogicData_getName && data && !data.isNull())
        {
            const named = readScString(fns.LogicData_getName(data), 128);
            if (named) return named;
        }
    }
    catch (_)
    {}
    try
    {
        const name = data.add(offsets.LogicProjectileClient_dataName).readPointer();
        return readScString(name, 128);
    }
    catch (_)
    {
        return null;
    }
}

function _classify(speed, radius)
{
    const isSlow = speed <= 800;
    const isSpread = radius === 0 && speed >= 1400 && speed <= 1600;
    const isSniper = speed > 3500;
    let hitRadius;
    if (radius > 0) hitRadius = radius * 1.05;
    else if (isSlow) hitRadius = 520;
    else if (isSpread) hitRadius = 320;
    else if (isSniper) hitRadius = 350;
    else hitRadius = 240;
    return {
        isSlow,
        isSpread,
        isSniper,
        isMassive: hitRadius > MASSIVE_RADIUS_THRESHOLD || radius > MASSIVE_RADIUS_THRESHOLD,
        hitRadius,
        category: isSlow ? "slow" : isSpread ? "spread" : isSniper ? "sniper" : "normal"
    };
}

function _readOwnerIndex(obj)
{
    try
    {
        return obj.add(offsets.LogicGameObjectClient_ownerIndex).readS32();
    }
    catch (_)
    {
        return -1;
    }
}

function _bodyOf(obj)
{
    if (!_validPtr(obj)) return obj;
    if (!offsets.LogicCharacterClient_body) return obj;
    try
    {
        const body = obj.add(offsets.LogicCharacterClient_body).readPointer();
        if (!_validPtr(body) || body.equals(obj)) return obj;
        const objVt = obj.readPointer();
        const bodyVt = body.readPointer();
        if (!_validPtr(objVt) || !_validPtr(bodyVt) || !bodyVt.equals(objVt)) return obj;
        return body;
    }
    catch (_)
    {}
    return obj;
}

function _ownerNameByIndex(ownerIndex)
{
    if (ownerIndex < 0) return null;
    if (ownerIndex === scanData.myPlayerIndex && scanData.myBrawlerName)
    {
        return canonBrawlerName(scanData.myBrawlerName);
    }
    for (const enemy of scanData.enemies)
    {
        if (enemy.playerIndex === ownerIndex && enemy.brawlerName)
        {
            return canonBrawlerName(enemy.brawlerName);
        }
    }
    return null;
}

function _readAngle(projectile, rendering)
{
    if (rendering !== 3) return null;
    if (!offsets.Projectile_angle) return null;
    try
    {
        const raw = projectile.add(offsets.Projectile_angle).readU32();
        return raw <= 360 ? raw : raw % 360;
    }
    catch (_)
    {
        return null;
    }
}

function _readTarget(fns, projectile)
{
    let targetX = 0;
    let targetY = 0;
    try
    {
        if (fns.LogicProjectileClient_getTargetX) targetX = fns.LogicProjectileClient_getTargetX(projectile) | 0;
        if (fns.LogicProjectileClient_getTargetY) targetY = fns.LogicProjectileClient_getTargetY(projectile) | 0;
    }
    catch (_)
    {}
    return {
        targetX,
        targetY
    };
}

function _noteCastRange(name, units)
{
    if (!name || !(units > 0) || units >= 70000) return;
    const prev = _rangeByName.get(name) || 0;
    if (units > prev) _rangeByName.set(name, units);
}

function _harvestSkillData(fns, skillData)
{
    if (!_validPtr(skillData) || !fns.LogicSkillData_getCastingRange || !fns.LogicSkillData_getProjectileData) return;
    try
    {
        const tiles = fns.LogicSkillData_getCastingRange(skillData) | 0;
        if (tiles <= 0) return;
        const units = tiles * CASTING_RANGE_SCALE;
        for (let i = 0; i < PROJ_INDEX_MAX; i++)
        {
            const proj = fns.LogicSkillData_getProjectileData(skillData, i);
            if (!_validPtr(proj)) continue;
            _noteCastRange(_readProjectileName(proj), units);
        }
    }
    catch (_)
    {}
}

function _harvestCharacter(character)
{
    if (!_validPtr(character)) return false;
    const fns = getFunctions();
    let found = false;
    try
    {
        if (fns.LogicCharacterClient_getWeaponSkill)
        {
            const weapon = fns.LogicCharacterClient_getWeaponSkill(character);
            if (_validPtr(weapon))
            {
                _harvestSkillData(fns, weapon);
                found = true;
            }
        }
    }
    catch (_)
    {}
    if (!fns.LogicCharacterClient_getSkillAt || !fns.LogicSkillClient_getData) return found;
    for (let slot = 0; slot < SKILL_SLOT_MAX; slot++)
    {
        try
        {
            const skill = fns.LogicCharacterClient_getSkillAt(character, slot);
            if (!_validPtr(skill)) continue;
            for (let hyper = 0; hyper < 2; hyper++)
            {
                const data = fns.LogicSkillClient_getData(skill, hyper);
                if (!_validPtr(data)) continue;
                _harvestSkillData(fns, data);
                found = true;
            }
        }
        catch (_)
        {}
    }
    return found;
}

function _rememberCharacter(index, character)
{
    if (index < 0 || !_validPtr(character)) return;
    _charsByIndex.set(index, character);
    const key = character.toString();
    if (_harvestedChars.has(key)) return;
    if (_harvestCharacter(character)) _harvestedChars.add(key);
}

function _castRangeFor(name, ownerIndex)
{
    const cached = name ? _rangeByName.get(name) || 0 : 0;
    if (cached > 0) return cached;
    if (ownerIndex >= 0)
    {
        const owner = _charsByIndex.get(ownerIndex);
        if (_validPtr(owner) && _harvestCharacter(owner) && name)
        {
            return _rangeByName.get(name) || 0;
        }
    }
    return 0;
}

function _ownerPos(ownerIndex)
{
    if (ownerIndex < 0) return null;
    if (ownerIndex === scanData.myPlayerIndex)
    {
        return {
            x: scanData.myX,
            y: scanData.myY
        };
    }
    const character = _charsByIndex.get(ownerIndex);
    if (!_validPtr(character)) return null;
    try
    {
        const fns = getFunctions();
        return {
            x: fns.LogicGameObjectClient_getX(character) | 0,
            y: fns.LogicGameObjectClient_getY(character) | 0
        };
    }
    catch (_)
    {
        return null;
    }
}

function _captureProjectile(projectile, data, ownerTeamOverride)
{
    if (!_validPtr(projectile)) return;
    const fns = getFunctions();
    try
    {
        if (!_validPtr(data) && fns.LogicProjectileClient_getData) data = fns.LogicProjectileClient_getData(projectile);
        if (!_validPtr(data)) data = fns.LogicGameObjectClient_getData(projectile);
        if (!_validPtr(data)) return;
        const gid = String(fns.LogicGameObjectClient_getGlobalID(projectile));
        const existing = _liveProjectiles.get(gid);
        if (existing)
        {
            existing.ptr = projectile;
            existing.data = data;
            existing.lastSeenAt = Date.now();
            if (ownerTeamOverride !== void 0) existing.ownerTeam = ownerTeamOverride | 0;
            return;
        }
        const x = fns.LogicGameObjectClient_getX(projectile) | 0;
        const y = fns.LogicGameObjectClient_getY(projectile) | 0;
        const speed = Math.max(1, offsets.ProjectileData_speed
            ? data.add(offsets.ProjectileData_speed).readU32() | 0
            : (fns.LogicProjectileData_getSpeed ? fns.LogicProjectileData_getSpeed(data) | 0 : 0));
        const radius = Math.max(0, offsets.ProjectileData_radius
            ? data.add(offsets.ProjectileData_radius).readU32() | 0
            : (fns.LogicProjectileData_getRadius ? fns.LogicProjectileData_getRadius(data) | 0 : 0));
        const rendering = fns.LogicProjectileData_getRendering ? fns.LogicProjectileData_getRendering(data) | 0 : 0;
        const angle = _readAngle(projectile, rendering);
        const target = _readTarget(fns, projectile);
        const isThrower = projectile.add(offsets.Projectile_isIndirect).readU32() | 0;
        let isBeam = false;
        try
        {
            isBeam = !!(fns.LogicProjectileData_isBeam && fns.LogicProjectileData_isBeam(data));
        }
        catch (_)
        {
            isBeam = false;
        }
        let ownerTeam = ownerTeamOverride === void 0 ? 0 : ownerTeamOverride | 0;
        if (ownerTeamOverride === void 0)
        {
            try
            {
                ownerTeam = projectile.add(offsets.LogicProjectileClient_ownerTeam).readU32() | 0;
            }
            catch (_)
            {}
        }
        const ownerIndex = _readOwnerIndex(projectile);
        let spawnAreaRadius = 0;
        let spawnAreaActiveTime = 0;
        try
        {
            if (fns.LogicProjectileData_getSpawnAreaEffect)
            {
                const area = fns.LogicProjectileData_getSpawnAreaEffect(data);
                if (_validPtr(area))
                {
                    spawnAreaRadius = fns.AreaEffectData_getRadius ? fns.AreaEffectData_getRadius(area) | 0 : 0;
                    spawnAreaActiveTime = fns.AreaEffectData_getActiveTimeMs ? fns.AreaEffectData_getActiveTimeMs(area) | 0 : 0;
                }
            }
        }
        catch (_)
        {
            spawnAreaRadius = 0;
            spawnAreaActiveTime = 0;
        }
        const classification = _classify(speed, radius);
        const name = _readProjectileName(data);
        const castRange = _castRangeFor(name, ownerIndex);
        _liveProjectiles.set(gid,
        {
            gid,
            ptr: projectile,
            data,
            ownerTeam,
            ownerIndex,
            ownerName: _ownerNameByIndex(ownerIndex),
            name,
            x,
            y,
            spawnX: x,
            spawnY: y,
            targetX: target.targetX,
            targetY: target.targetY,
            speed,
            radius,
            rendering,
            angle,
            isThrower,
            isBeam,
            spawnAreaRadius,
            spawnAreaActiveTime,
            castRange,
            hitRadius: classification.hitRadius,
            isSlow: classification.isSlow,
            isSpread: classification.isSpread,
            isSniper: classification.isSniper,
            isMassive: classification.isMassive,
            category: classification.category,
            spawnedAt: Date.now(),
            lastX: x,
            lastY: y,
            lastTs: Date.now(),
            lastSeenAt: Date.now(),
            hasVelocitySample: false,
            vx: angle === null ? 0 : Math.cos(angle * Math.PI / 180) * speed,
            vy: angle === null ? 0 : Math.sin(angle * Math.PI / 180) * speed
        });
    }
    catch (_)
    {}
}

function _removeProjectile(projectile)
{
    try
    {
        const gid = String(getFunctions().LogicGameObjectClient_getGlobalID(projectile));
        const record = _liveProjectiles.get(gid);
        if (record && _destroyed.length < 16)
        {
            _destroyed.push(
            {
                name: record.name,
                angle: record.angle,
                spawnX: record.spawnX,
                spawnY: record.spawnY,
                x: record.lastX,
                y: record.lastY
            });
        }
        _liveProjectiles.delete(gid);
    }
    catch (_)
    {}
}

function _installProjectileHooks(base)
{
    if (_projectileHooksInstalled) return;
    _projectileHooksInstalled = true;
    try
    {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_ctor),
        {
            onEnter(args)
            {
                this.projectile = args[0];
                this.data = args[1];
            },
            onLeave()
            {
                _captureProjectile(this.projectile, this.data);
            }
        });
    }
    catch (_)
    {}
    try
    {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_destruct),
        {
            onEnter(args)
            {
                _removeProjectile(args[0]);
            }
        });
    }
    catch (_)
    {}
}

function _updateLiveProjectiles(now)
{
    const fns = getFunctions();
    const output = [];
    for (const [gid, projectile] of _liveProjectiles)
    {
        try
        {
            if (projectile.ptr.isNull())
            {
                _liveProjectiles.delete(gid);
                continue;
            }
            if (now - (projectile.lastSeenAt || 0) > 800)
            {
                _liveProjectiles.delete(gid);
                continue;
            }
            const x = fns.LogicGameObjectClient_getX(projectile.ptr) | 0;
            const y = fns.LogicGameObjectClient_getY(projectile.ptr) | 0;
            if (projectile.targetX === 0 && projectile.targetY === 0)
            {
                const target = _readTarget(fns, projectile.ptr);
                projectile.targetX = target.targetX;
                projectile.targetY = target.targetY;
            }
            const dt = (now - projectile.lastTs) / 1000;
            const dx = x - projectile.lastX;
            const dy = y - projectile.lastY;
            if (dt > 0.002 && dt < 0.3 && dx * dx + dy * dy >= 16)
            {
                const observedVx = dx / dt;
                const observedVy = dy / dt;
                const alpha = projectile.hasVelocitySample ? 0.4 : 1;
                projectile.vx = projectile.vx * (1 - alpha) + observedVx * alpha;
                projectile.vy = projectile.vy * (1 - alpha) + observedVy * alpha;
                projectile.hasVelocitySample = true;
            }
            if (!projectile.hasVelocitySample && projectile.targetX !== 0 && projectile.targetY !== 0 && projectile.vx === 0 && projectile.vy === 0)
            {
                const tx = projectile.targetX - x;
                const ty = projectile.targetY - y;
                const length = Math.hypot(tx, ty);
                if (length > 0)
                {
                    projectile.vx = tx / length * projectile.speed;
                    projectile.vy = ty / length * projectile.speed;
                }
            }
            projectile.x = x;
            projectile.y = y;
            projectile.lastX = x;
            projectile.lastY = y;
            projectile.lastTs = now;
            projectile.ownerName = _ownerNameByIndex(projectile.ownerIndex);
            const ownerPos = _ownerPos(projectile.ownerIndex);
            if (ownerPos)
            {
                projectile.ownerX = ownerPos.x;
                projectile.ownerY = ownerPos.y;
            }
            if (!(projectile.castRange > 0))
            {
                projectile.castRange = _castRangeFor(projectile.name, projectile.ownerIndex);
            }
            if (projectile.ownerIndex >= 0 && _friendlyIdx.has(projectile.ownerIndex)) continue;
            if (projectile.ownerTeam === scanData.myTeamId) continue;
            output.push(
            {
                gid,
                ptr: projectile.ptr,
                name: projectile.name,
                ownerTeam: projectile.ownerTeam,
                ownerIndex: projectile.ownerIndex,
                ownerName: projectile.ownerName,
                ownerX: projectile.ownerX,
                ownerY: projectile.ownerY,
                x,
                y,
                spawnX: projectile.spawnX,
                spawnY: projectile.spawnY,
                targetX: projectile.targetX,
                targetY: projectile.targetY,
                speed: projectile.speed,
                radius: projectile.radius,
                hitRadius: projectile.hitRadius,
                rendering: projectile.rendering,
                angle: projectile.angle,
                isThrower: projectile.isThrower,
                isBeam: !!projectile.isBeam,
                spawnAreaRadius: projectile.spawnAreaRadius,
                spawnAreaActiveTime: projectile.spawnAreaActiveTime,
                castRange: projectile.castRange || 0,
                isSlow: projectile.isSlow,
                isSpread: projectile.isSpread,
                isSniper: projectile.isSniper,
                isMassive: projectile.isMassive,
                category: projectile.category,
                spawnedAt: projectile.spawnedAt,
                vx: projectile.vx,
                vy: projectile.vy
            });
        }
        catch (_)
        {
            _liveProjectiles.delete(gid);
        }
    }
    return output;
}

function updateScanner(bm, now)
{
    if (!moduleBase) return;
    if (now === void 0) now = Date.now();
    const functions = getFunctions();
    try
    {
        const own = functions.LogicBattleModeClient_getOwnCharacter(bm);
        if (!_validPtr(own))
        {
            scanData.ownCharacter = null;
            scanData.battleModeClient = null;
            scanData.hasCarryable = false;
            scanData.throwsOverWalls = false;
            scanData.lastUpdate = 0;
            return;
        }
        scanData.ownCharacter = own;
        scanData.battleModeClient = bm;
        scanData.myTeamId = functions.LogicBattleModeClient_getOwnPlayerTeam(bm);
        scanData.myPlayerIndex = functions.LogicBattleModeClient_getOwnPlayerIndex ? functions.LogicBattleModeClient_getOwnPlayerIndex(bm) | 0 : _readOwnerIndex(own);
        _friendlyIdx.clear();
        _friendlyIdx.add(scanData.myPlayerIndex);
        _charsByIndex.clear();
        _rememberCharacter(scanData.myPlayerIndex, own);
        try
        {
            const self = _bodyOf(own);
            scanData.myX = functions.LogicGameObjectClient_getX(self) | 0;
            scanData.myY = functions.LogicGameObjectClient_getY(self) | 0;
        }
        catch (_)
        {
            scanData.myX = functions.LogicGameObjectClient_getX(own) | 0;
            scanData.myY = functions.LogicGameObjectClient_getY(own) | 0;
        }
        scanData.hasCarryable = _readHasCarryable(functions, own, bm);
        scanData.throwsOverWalls = _readThrowsOverWalls(functions, own);
        scanData.mySpeed = 720;
        const ownData = functions.LogicGameObjectClient_getData(own);
        if (_validPtr(ownData))
        {
            scanData.myRadius = functions.LogicCharacterData_getCollisionRadius(ownData) || 60;
            try
            {
                scanData.myBrawlerId = ownData.add(offsets.CharData_brawlerId).readU8() | 0;
            }
            catch (_)
            {}
            try
            {
                const baseSpeed = functions.LogicCharacterData_getSpeed ? functions.LogicCharacterData_getSpeed(ownData) | 0 : 0;
                const buff = offsets.LogicCharacterClientOwn_speedBuff ? own.add(offsets.LogicCharacterClientOwn_speedBuff).readS32() | 0 : 0;
                const speed = baseSpeed + buff;
                if (speed >= 300 && speed <= 3000) scanData.mySpeed = speed;
            }
            catch (_)
            {}
            const nameRead = _readHeroIconName(ownData);
            if (nameRead) scanData.myBrawlerName = nameRead;
        }
        const enemies = [];
        const vtableProj = moduleBase.add(offsets.VTABLE_PROJECTILE_DATA);
        const objMgr = bm.add(offsets.BattleMode_objectManagerPtr).readPointer();
        if (_validPtr(objMgr))
        {
            const objects = objMgr.add(offsets.ObjectManager_objectsArray).readPointer();
            const count = objMgr.add(offsets.ObjectManager_count).readU32();
            if (_validPtr(objects) && count > 0 && count <= 1200)
            {
                const stride = offsets.ObjectManager_ptrStride;
                let batchView = null;
                try
                {
                    const buf = objects.readByteArray(count * stride);
                    if (buf) batchView = new DataView(buf);
                }
                catch (_)
                {}
                for (let i = 0; i < count; i++)
                {
                    try
                    {
                        let obj;
                        if (batchView)
                        {
                            const off = i * stride;
                            const lo = batchView.getUint32(off, true);
                            const hi = batchView.getUint32(off + 4, true);
                            if (lo === 0 && hi === 0) continue;
                            obj = ptrFromU32(lo, hi);
                        }
                        else
                        {
                            obj = objects.add(i * stride).readPointer();
                        }
                        if (!_validPtr(obj)) continue;
                        const data = functions.LogicGameObjectClient_getData(obj);
                        if (!_validPtr(data)) continue;
                        const team = obj.add(offsets.GameObj_team).readU32();
                        if (data.readPointer().equals(vtableProj))
                        {
                            if (state.autododge && team !== scanData.myTeamId) _captureProjectile(obj, data, team);
                            continue;
                        }
                        if (team === scanData.myTeamId)
                        {
                            const idx = _readOwnerIndex(obj);
                            if (idx >= 0) _friendlyIdx.add(idx);
                            continue;
                        }
                        if (obj.add(offsets.GameObj_hp).readU32() === 0) continue;
                        const gid = String(functions.LogicGameObjectClient_getGlobalID(obj));
                        let brawlerName = _brawlerNameCache.get(gid);
                        if (brawlerName === void 0)
                        {
                            brawlerName = _readHeroIconName(data);
                            _brawlerNameCache.set(gid, brawlerName);
                        }
                        let radius = 0;
                        try
                        {
                            radius = functions.LogicCharacterData_getCollisionRadius ? functions.LogicCharacterData_getCollisionRadius(data) | 0 : 0;
                        }
                        catch (_)
                        {}
                        if (!brawlerName && radius <= 0) continue;
                        const kind = brawlerName ? "player" : "spawnable";
                        let moveSpeed = 0;
                        try
                        {
                            moveSpeed = functions.LogicCharacterData_getSpeed ? functions.LogicCharacterData_getSpeed(data) | 0 : 0;
                        }
                        catch (_)
                        {}
                        const playerIndex = _readOwnerIndex(obj);
                        if (brawlerName) _rememberCharacter(playerIndex, obj);
                        let brawlerId = 0;
                        if (brawlerName)
                        {
                            try
                            {
                                brawlerId = data.add(offsets.CharData_brawlerId).readU8() | 0;
                            }
                            catch (_)
                            {}
                        }
                        const body = _bodyOf(obj);
                        enemies.push(
                        {
                            gid,
                            ptr: obj,
                            x: functions.LogicGameObjectClient_getX(body) | 0,
                            y: functions.LogicGameObjectClient_getY(body) | 0,
                            brawlerId,
                            brawlerName,
                            teamId: team,
                            playerIndex,
                            moveSpeed,
                            radius: radius,
                            kind: kind
                        });
                    }
                    catch (_)
                    {}
                }
            }
        }
        _scanCount++;
        if ((_scanCount & 63) === 0)
        {
            _activeGidSet.clear();
            for (const enemy of enemies) _activeGidSet.add(enemy.gid);
            for (const gid of _brawlerNameCache.keys())
            {
                if (!_activeGidSet.has(gid)) _brawlerNameCache.delete(gid);
            }
        }
        scanData.enemies = enemies;
        scanData.destroyed = _destroyed.splice(0);
        if (state.autododge)
        {
            scanData.projectiles = _updateLiveProjectiles(now);
        }
        else
        {
            if (_liveProjectiles.size) _liveProjectiles.clear();
            scanData.projectiles = [];
        }
        scanData.liveProjectiles = _liveProjectiles.size;
        scanData.lastUpdate = now;
    }
    catch (_)
    {}
}

function resetScannerCache()
{
    _brawlerNameCache.clear();
    _liveProjectiles.clear();
    _friendlyIdx.clear();
    _charsByIndex.clear();
    _harvestedChars.clear();
    _destroyed.length = 0;
    scanData.projectiles = [];
    scanData.destroyed = [];
    scanData.liveProjectiles = 0;
    scanData.hackSpeed = 0;
}

function initScanner(base)
{
    moduleBase = base;
}

function enableProjectileTracking()
{
    if (moduleBase) _installProjectileHooks(moduleBase);
}

// ---- utils/wallCache.js ----
const MAX_MAP_TILES = 120;
const MAX_TOTAL_TILES = MAX_MAP_TILES * MAX_MAP_TILES;
const RETRY_MS = 2e3;
const TILE_SIZE = 300;
const BLOCKS_MOVEMENT = 128;
const BLOCKS_PROJECTILES = 64;
const TRACE_STEP = 40;
const TRACE_BACKOFF = 75;

var walls = null;
var wallsWidth = 0;
var wallsHeight = 0;
var needsRebuild = true;
var lastFailedTs = 0;
var tileWatchInstalled = false;

function _validPtr(value)
{
    return value && !value.isNull();
}

function ptrFromU32(lo, hi)
{
    if (!lo && !hi) return ptr(0);
    return ptr("0x" + (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0"));
}

function _rebuildFrom(tileMap)
{
    if (!_validPtr(tileMap)) return false;
    try
    {
        const width = tileMap.add(offsets.TileMap_Width).readS32();
        const height = tileMap.add(offsets.TileMap_Height).readS32();
        if (width <= 0 || width > MAX_MAP_TILES || height <= 0 || height > MAX_MAP_TILES) return false;
        const total = width * height;
        if (total > MAX_TOTAL_TILES) return false;
        const tiles = tileMap.add(offsets.TileMap_TilesArray).readPointer();
        if (!_validPtr(tiles)) return false;

        const pointerSize = Process.pointerSize;
        const raw = tiles.readByteArray(total * pointerSize);
        if (!raw) return false;
        const view = new DataView(raw);
        const grid = new Uint8Array(total);
        const flagsByType = new Map();

        for (let i = 0; i < total; i++)
        {
            const lo = view.getUint32(i * pointerSize, true);
            const hi = view.getUint32(i * pointerSize + 4, true);
            if (lo === 0 && hi === 0) continue;
            const tile = ptrFromU32(lo, hi);
            let tileType;
            try
            {
                tileType = tile.readPointer();
            }
            catch (_)
            {
                continue;
            }
            if (!_validPtr(tileType)) continue;
            const key = tileType.toString();
            let flags = flagsByType.get(key);
            if (flags === void 0)
            {
                flags = 0;
                try
                {
                    const packed = tileType.add(offsets.TileTypeData_BlocksMovement).readU16();
                    if (packed & 0xff) flags |= BLOCKS_MOVEMENT;
                    if (packed >> 8) flags |= BLOCKS_PROJECTILES;
                }
                catch (_)
                {}
                flagsByType.set(key, flags);
            }
            grid[i] = flags;
        }

        walls = grid;
        wallsWidth = width;
        wallsHeight = height;
        needsRebuild = false;
        return true;
    }
    catch (_)
    {
        return false;
    }
}

function notifyBattleModeChanged(battleMode)
{
    walls = null;
    wallsWidth = 0;
    wallsHeight = 0;
    needsRebuild = true;
    lastFailedTs = 0;
    maybeRefreshWallCache(battleMode, Date.now());
}

function maybeRefreshWallCache(battleMode, now)
{
    if (!needsRebuild || !_validPtr(battleMode)) return;
    if (now === void 0) now = Date.now();
    if (now - lastFailedTs < RETRY_MS) return;
    try
    {
        const tileMap = getFunctions().LogicBattleModeClient_getTileMap(battleMode);
        if (_rebuildFrom(tileMap)) return;
    }
    catch (_)
    {}
    lastFailedTs = now;
}

function watchTileChanges(base)
{
    if (tileWatchInstalled) return;
    try
    {
        Interceptor.attach(base.add(offsets.LogicTile__setData),
        {
            onEnter()
            {
                needsRebuild = true;
            }
        });
        tileWatchInstalled = true;
    }
    catch (_)
    {}
}

function getWallCacheW()
{
    return wallsWidth;
}

function getWallCacheH()
{
    return wallsHeight;
}

function losCheck(wx0, wy0, wx1, wy1, checkBit)
{
    const grid = walls;
    if (!grid) return true;
    const width = wallsWidth;
    const height = wallsHeight;
    let cx = wx0 / TILE_SIZE | 0;
    let cy = wy0 / TILE_SIZE | 0;
    const tx = wx1 / TILE_SIZE | 0;
    const ty = wy1 / TILE_SIZE | 0;
    if (cx === tx && cy === ty) return true;
    const dx = Math.abs(tx - cx);
    const dy = -Math.abs(ty - cy);
    const sx = cx < tx ? 1 : -1;
    const sy = cy < ty ? 1 : -1;
    let err = dx + dy;
    const maxSteps = dx - dy + 2;
    for (let n = 0; n < maxSteps; n++)
    {
        const e2 = 2 * err;
        if (e2 >= dy)
        {
            err += dy;
            cx += sx;
        }
        if (e2 <= dx)
        {
            err += dx;
            cy += sy;
        }
        if (cx === tx && cy === ty) return true;
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
        if (grid[cy * width + cx] & checkBit) return false;
    }
    return true;
}

function traceWallHit(wx, wy, dirX, dirY, maxDist, checkBit)
{
    const grid = walls;
    if (!grid || maxDist <= 0) return maxDist;
    const width = wallsWidth;
    const height = wallsHeight;
    if (width <= 0 || height <= 0) return maxDist;
    let dist = 0;
    while (dist < maxDist)
    {
        dist += TRACE_STEP;
        if (dist > maxDist) dist = maxDist;
        const tx = (wx + dirX * dist) / TILE_SIZE | 0;
        const ty = (wy + dirY * dist) / TILE_SIZE | 0;
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) return Math.max(0, dist - TRACE_BACKOFF);
        if (grid[ty * width + tx] & checkBit) return Math.max(0, dist - TRACE_BACKOFF);
    }
    return maxDist;
}

function isBlockedAt(wx, wy, checkBit)
{
    const grid = walls;
    if (!grid) return false;
    const width = wallsWidth;
    const height = wallsHeight;
    if (width <= 0 || height <= 0) return false;
    const tx = wx / TILE_SIZE | 0;
    const ty = wy / TILE_SIZE | 0;
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return false;
    return !!(grid[ty * width + tx] & checkBit);
}

function isBlockedWide(wx, wy, radius, checkBit)
{
    if (isBlockedAt(wx, wy, checkBit)) return true;
    const r = radius > 0 ? radius : 0;
    if (r <= 0) return false;
    return isBlockedAt(wx + r, wy, checkBit) || isBlockedAt(wx - r, wy, checkBit) || isBlockedAt(wx, wy + r, checkBit) || isBlockedAt(wx, wy - r, checkBit);
}

function traceWallHitWide(wx, wy, dirX, dirY, maxDist, radius, checkBit)
{
    const grid = walls;
    if (!grid || maxDist <= 0) return maxDist;
    if (wallsWidth <= 0 || wallsHeight <= 0) return maxDist;
    let dist = 0;
    while (dist < maxDist)
    {
        dist += TRACE_STEP;
        if (dist > maxDist) dist = maxDist;
        if (isBlockedWide(wx + dirX * dist, wy + dirY * dist, radius, checkBit)) return Math.max(0, dist - TRACE_BACKOFF);
    }
    return maxDist;
}

// ---- utils/crypto.js ----
const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
    0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
    0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
    0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
    0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x, n)
{
    return (x >>> n) | (x << (32 - n));
}

function sha256(bytes)
{
    const len = bytes.length;
    const bitLenHi = Math.floor((len * 8) / 0x100000000);
    const bitLenLo = (len * 8) >>> 0;
    const totalLen = (((len + 9 + 63) >> 6) << 6);
    const msg = new Uint8Array(totalLen);
    msg.set(bytes);
    msg[len] = 0x80;
    const view = new DataView(msg.buffer);
    view.setUint32(totalLen - 8, bitLenHi, false);
    view.setUint32(totalLen - 4, bitLenLo, false);

    let h0 = 0x6a09e667,
        h1 = 0xbb67ae85,
        h2 = 0x3c6ef372,
        h3 = 0xa54ff53a;
    let h4 = 0x510e527f,
        h5 = 0x9b05688c,
        h6 = 0x1f83d9ab,
        h7 = 0x5be0cd19;
    const w = new Uint32Array(64);

    for (let off = 0; off < totalLen; off += 64)
    {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4, false);
        for (let i = 16; i < 64; i++)
        {
            const s0 = (rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)) >>> 0;
            const s1 = (rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)) >>> 0;
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
        }
        let a = h0,
            b = h1,
            c = h2,
            d = h3,
            e = h4,
            f = h5,
            g = h6,
            h = h7;
        for (let i = 0; i < 64; i++)
        {
            const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
            const ch = ((e & f) ^ (~e & g)) >>> 0;
            const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
            const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
            const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
            const t2 = (S0 + maj) >>> 0;
            h = g;
            g = f;
            f = e;
            e = (d + t1) >>> 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) >>> 0;
        }
        h0 = (h0 + a) >>> 0;
        h1 = (h1 + b) >>> 0;
        h2 = (h2 + c) >>> 0;
        h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0;
        h5 = (h5 + f) >>> 0;
        h6 = (h6 + g) >>> 0;
        h7 = (h7 + h) >>> 0;
    }

    const out = new Uint8Array(32);
    const outView = new DataView(out.buffer);
    [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => outView.setUint32(i * 4, v, false));
    return out;
}

// ---- core/commands.js ----
const CMD_BUF_SIZE = 72;
const _zeroBuf = new Uint8Array(CMD_BUF_SIZE).buffer;

const MAX_TABLE_TYPE = 0x16;
const TABLE_ENTRIES = MAX_TABLE_TYPE + 1;
const MASK_SIZE = 16;

var _typeTable = null;
var _fallbackType = 0;
var _innerMask = null;
var _outerMask = null;

function _loadSigningConstants()
{
    if (_typeTable) return true;
    const base = getBase();
    const raw = base.add(offsets.ClientInput_typeConstantTable).readByteArray(TABLE_ENTRIES * 4);
    const bytes = new Uint8Array(raw);
    const table = new Uint32Array(TABLE_ENTRIES);
    for (let i = 0; i < TABLE_ENTRIES; i++)
    {
        table[i] = (bytes[i * 4] | (bytes[i * 4 + 1] << 8) | (bytes[i * 4 + 2] << 16) | (bytes[i * 4 + 3] << 24)) >>> 0;
    }
    _innerMask = new Uint8Array(base.add(offsets.ClientInput_hashInnerMask).readByteArray(MASK_SIZE));
    _outerMask = new Uint8Array(base.add(offsets.ClientInput_hashOuterMask).readByteArray(MASK_SIZE));
    _typeTable = table;
    _fallbackType = base.add(offsets.ClientInput_typeFallback).readU32() >>> 0;
    return true;
}

function _concat(a, b)
{
    const out = new Uint8Array(a.length + b.length);
    out.set(a);
    out.set(b, a.length);
    return out;
}

function _makeHashBlock(key16, mask, padByte)
{
    const block = new Uint8Array(64);
    for (let i = 0; i < 16; i++) block[i] = key16[i] ^ mask[i];
    block.fill(padByte, 16);
    return block;
}

function _computeToken(key16, cmdData16)
{
    const typeRaw = (cmdData16[4] | (cmdData16[5] << 8) | (cmdData16[6] << 16) | (cmdData16[7] << 24)) >>> 0;
    const typeC = typeRaw <= MAX_TABLE_TYPE ? _typeTable[typeRaw] : _fallbackType;

    const msg = new Uint8Array(20);
    for (let i = 0; i < 16; i++) msg[i] = cmdData16[i];
    msg[16] = typeC & 0xff;
    msg[17] = (typeC >>> 8) & 0xff;
    msg[18] = (typeC >>> 16) & 0xff;
    msg[19] = (typeC >>> 24) & 0xff;

    const inner = sha256(_concat(_makeHashBlock(key16, _innerMask, 0x36), msg));
    const digest = sha256(_concat(_makeHashBlock(key16, _outerMask, 0x5c), inner));
    let token = (digest[0] | ((digest[1] & 0x7f) << 8)) >>> 0;
    if (token <= 1) token = 1;
    return token;
}

const CLIENT_INPUT_TOKEN = 0x34;

function signClientInput(ci, battle)
{
    try
    {
        if (battle.add(offsets.BattleMode_hashEnabled).readU8() === 0) return 0;
        _loadSigningConstants();
    }
    catch (_)
    {
        return 0;
    }

    let key16;
    try
    {
        key16 = new Uint8Array(battle.add(offsets.BattleMode_hashKey).readByteArray(16));
    }
    catch (_)
    {
        return 0;
    }
    if (!key16 || key16.length < 16) return 0;

    let cmdData16;
    try
    {
        cmdData16 = new Uint8Array(ci.add(4).readByteArray(16));
    }
    catch (_)
    {
        return 0;
    }
    if (!cmdData16 || cmdData16.length < 16) return 0;

    const token = _computeToken(key16, cmdData16);
    try
    {
        ci.add(CLIENT_INPUT_TOKEN).writeU32(token);
    }
    catch (_)
    {
        return 0;
    }
    return token;
}

function sendCommand(cmdType, fillFn)
{
    try
    {
        const fns = getFunctions();
        const battle = fns.BattleMode_getInstance();
        if (!battle || battle.isNull()) return false;

        const mgr = battle.add(offsets.BattleMode_clientInputManager).readPointer();
        if (!mgr || mgr.isNull()) return false;

        const ci = fns.operator_new(CMD_BUF_SIZE);
        if (!ci || ci.isNull()) return false;

        ci.writeByteArray(_zeroBuf);
        fns.ClientInput_constructor_int(ci, cmdType | 0);
        if (fillFn) fillFn(ci, battle);
        signClientInput(ci, battle);
        fns.ClientInputManager_addInput(mgr, ci);
        return true;
    }
    catch (_)
    {
        return false;
    }
}

// ---- helpers/dodge_kinds.js ----
const FITS = {
    orbit:
    {
        grow: 0.65,
        pad: 120
    },
    long:
    {
        grow: 0.55,
        pad: 90
    },
    thick:
    {
        grow: 0.6,
        pad: 100
    },
    broad:
    {
        grow: 0.45,
        pad: 70
    },
    half:
    {
        grow: 0.4,
        pad: 50
    },
    plain:
    {
        grow: 0.45,
        pad: 60
    },
    ray:
    {
        grow: 0.5,
        pad: 80
    },
    thin:
    {
        grow: 0.35,
        pad: 40
    },
    fallback:
    {
        grow: 0.45,
        pad: 60
    }
};

const KINDS = {
    GunslingerProjectile:
    {
        fit: "thin"
    },
    GunslingerOverchargedProjectile:
    {
        fit: "thin",
        maxRange: 2600
    },
    BeeSniperProjectile:
    {
        fit: "thin",
        maxRange: 3000
    },
    BeeSniperCirclingProjectile:
    {
        fit: "orbit",
        blob: true
    },
    BeeSniperChargedProjectile:
    {
        fit: "long",
        strip: true,
        maxRange: 2200
    },
    BeeSniperUltiProjectile:
    {
        fit: "orbit",
        blob: true
    },
    PiperHandgunProjectile:
    {
        fit: "half",
        maxRange: 2200
    },
    SniperProjectile:
    {
        fit: "long",
        strip: true
    },
    BeamerProjectile:
    {
        fit: "ray",
        chargedRange: 3900,
        speedMul: 1.15,
        strip: true
    },
    BulletstormLastShotProjectile:
    {
        fit: "long",
        maxRange: 3300
    },
    BulletstormOnShellPickedUpProjectile:
    {
        fit: "plain",
        maxRange: 3300
    },
    ElectroSniperProjectile:
    {
        fit: "long",
        strip: true
    },
    ElectroSniperMutantProjectile:
    {
        fit: "long",
        strip: true
    },
    ElectroSniperUltiProjectile:
    {
        fit: "broad"
    },
    ElectroSniperOverchargedUltiProjectile:
    {
        fit: "broad"
    },
    ElectroSniperBounceProjectile:
    {
        fit: "half"
    },
    ElectroSniperSecondaryProjectile_001:
    {
        fit: "half"
    },
    HookProjectile:
    {
        fit: "long"
    },
    SnakeOilProjectile:
    {
        fit: "long",
        strip: true
    },
    SnakeOilUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    SnakeOilHyperUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    HookProjectile2:
    {
        drop: true
    },
    SoulCollectorProjectile:
    {
        fit: "plain"
    },
    SoulCollectorUlti:
    {
        fit: "broad",
        blob: true
    },
    MosquitoProjectile:
    {
        fit: "thin"
    },
    MosquitoProjectilePoison:
    {
        fit: "long",
        strip: true,
        maxRange: 3300
    },
    SpeedyProjectile:
    {
        fit: "thin"
    },
    SpeedyOverchargedProjectile:
    {
        fit: "thin"
    },
    RollerProjectile:
    {
        fit: "broad"
    },
    RollerGadgetProjectile:
    {
        fit: "plain"
    },
    BowDudeProjectile:
    {
        fit: "plain"
    },
    BowDudeOverchargedProjectile:
    {
        fit: "plain"
    },
    BowDudeProjectileTripWire:
    {
        fit: "long",
        blob: true
    },
    BowDudeProjectileTripWireBuddy:
    {
        fit: "long",
        blob: true
    },
    BowDudeGadgetSkillProjectile:
    {},
    BowDudeGadgetSkillProjectileBuddy:
    {},
    BowDudeSpawnMineProjectile:
    {
        drop: true
    },
    BowDudeSpawnOverchargedMineProjectile:
    {
        drop: true
    },
    RocketGirlProjectile:
    {
        fit: "thick",
        blast: true,
        lockPath: true,
        growR: 280
    },
    RocketGirlGadgetProjectile:
    {
        fit: "broad",
        maxRange: 3000
    },
    RocketGirlUltiProjectile:
    {
        fit: "thick",
        blast: true,
        growR: 280
    },
    RocketGirlUltiOverchargedProjectile:
    {
        fit: "thick",
        blast: true,
        growR: 280
    },
    CannonGirlProjectile:
    {
        fit: "long",
        strip: true
    },
    CannonGirlSmallProjectile:
    {
        fit: "broad"
    },
    CannonGirlChainProjectile:
    {
        fit: "half"
    },
    CannonGirlExplosionProjectileOvercharged:
    {
        fit: "long",
        blob: true
    },
    KnightProjectile1:
    {
        fit: "thick"
    },
    KnightProjectile2:
    {
        fit: "thick"
    },
    KnightProjectile3:
    {
        fit: "thick"
    },
    KnightUltiProjectile:
    {
        fit: "thick"
    },
    DuplicatorProjectile:
    {
        fit: "long"
    },
    OverchargedDuplicatorProjectile:
    {
        fit: "long"
    },
    DuplicatorUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    OverchargedDuplicatorUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    SpawnerDudeProjectile:
    {
        fit: "long",
        strip: true,
        growR: 250
    },
    SpawnerDudeMutantProjectile:
    {
        fit: "long"
    },
    SpawnerDudeIndirectProjectile:
    {
        fit: "broad",
        blob: true
    },
    SpawnerDudeUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    SpawnerDudeOverchargedUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    CocoonerProjectile:
    {
        fit: "long",
        strip: true,
        growR: 150,
        reachAdj: -150
    },
    CocoonerProjectile2:
    {
        fit: "long",
        growR: 150,
        home: true
    },
    CocoonerUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    CocoonerOverchargedUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    AmbusherProjectile:
    {
        fit: "thick"
    },
    AmbusherUltiProjectile:
    {
        fit: "long"
    },
    AmbusherUltiProjectile2:
    {
        fit: "long"
    },
    AmbusherOverchargedUltiProjectile:
    {
        fit: "long"
    },
    CrabProjectile:
    {
        fit: "long",
        strip: true
    },
    CrabUltiProjectile:
    {
        fit: "broad"
    },
    CrabOverchargedUltiProjectile:
    {
        fit: "broad"
    },
    CrabOverchargedUltiReturnProjectile:
    {
        fit: "broad"
    },
    FishTankUltiProjectile:
    {
        fit: "broad"
    },
    FishTankUltiProjectileSmall:
    {
        fit: "broad"
    },
    CookerProjectile:
    {
        fit: "long",
        strip: true,
        reachAdj: -450
    },
    MaisieProjectile:
    {
        fit: "long",
        strip: true,
        lockPath: true,
        reachAdj: 900,
        fade: true,
        fadeBase: 786.63,
        fadeK: 0.001231
    },
    TrickShotDudeProjectile:
    {
        fit: "thin"
    },
    TrickShotDudeUltiProjectile:
    {
        fit: "thin"
    },
    TrickShotDudeOverchargedProjectile:
    {
        fit: "thin"
    },
    ControllerProjectile:
    {
        fit: "broad",
        growR: 150,
        reachAdj: 600
    },
    ControllerArchetypeCollabProjectileLvl1:
    {
        fit: "plain"
    },
    ControllerArchetypeCollabProjectileLvl2:
    {
        fit: "plain"
    },
    ControllerArchetypeCollabProjectileLvl3:
    {
        fit: "plain"
    },
    ControllerUltiProjectile:
    {
        drop: true
    },
    ControllerUltiOverchargedProjectile:
    {
        drop: true
    },
    AxeJugglerProjectile:
    {
        fit: "broad",
        reachAdj: 200
    },
    AxeJugglerProjectile2:
    {
        fit: "long"
    },
    AxeJugglerOverchargedProjectile2:
    {
        fit: "long"
    },
    SplitterProjectile:
    {
        fit: "long"
    },
    ArtilleryDudeProjectile:
    {
        fit: "broad",
        strip: true
    },
    ArtilleryDudeProjectile2:
    {
        fit: "thin"
    },
    ArtilleryDudeUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    ArtilleryDudeOverchargedUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    ArtilleryDudeTurretProjectile:
    {
        drop: true
    },
    ArtilleryDudeOverchargedTurretProjectile:
    {
        drop: true
    },
    PercenterProjectile:
    {
        fit: "long",
        strip: true,
        lockPath: true,
        maxRange: 2800
    },
    PercenterOverchargedProjectile:
    {
        fit: "long",
        strip: true,
        lockPath: true,
        maxRange: 2800
    },
    MeepleProjectile:
    {
        fit: "plain",
        growR: 150,
        reachAdj: 200
    },
    MeepleUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    MeepleOverchargedUltiProjectile:
    {
        fit: "broad",
        blob: true
    },
    MeepleWallProjectile:
    {
        drop: true
    },
    ShamanProjectile:
    {
        fit: "long",
        strip: true
    },
    CoopRangedEnemyProjectile:
    {
        maxRange: 2500
    },
    SniperHomingProjectile:
    {
        fit: "long",
        maxRange: 3500,
        growR: 100,
        strip: true
    },
    MechanicProjectile2:
    {
        fit: "fallback",
        maxRange: 2000
    },
    MechanicProjectile3:
    {
        fit: "fallback",
        maxRange: 2000
    },
    DoorManCaneGadgetProjectile:
    {
        fit: "fallback",
        maxRange: 3000
    },
    MummyProjectile:
    {
        fit: "long",
        growR: 150,
        reachAdj: -750,
        fade: true,
        fadeBase: 4461.04,
        fadeK: -0.000971
    },
    WhirlwindProjectile:
    {
        fit: "long",
        growR: 250,
        reachAdj: -250,
        lockPath: true
    },
    WhirlwindProjectile2:
    {
        growR: 250,
        home: true
    },
    MorningstarProjectile:
    {
        growR: 150,
        maxRange: 2700
    },
    MorningstarProjectileRecall:
    {
        growR: 150,
        home: true
    },
    AlternatorHealProjectile:
    {
        fit: "fallback",
        maxRange: 2800
    },
    AlternatorDamageProjectile:
    {
        fit: "fallback",
        maxRange: 2800
    },
    KickerDudeProjectile2:
    {
        fit: "fallback",
        maxRange: 2200
    },
    DancerProjectileSingle:
    {
        fit: "fallback",
        maxRange: 2700
    },
    DancerProjectileDouble:
    {
        fit: "fallback",
        maxRange: 2500
    },
    DancerProjectileTriple:
    {
        fit: "fallback",
        maxRange: 1700
    }
};

function kindOf(name)
{
    return name && KINDS[name] || null;
}

function fitOf(name)
{
    const spec = kindOf(name);
    if (spec && spec.fit && FITS[spec.fit]) return FITS[spec.fit];
    return FITS.fallback;
}

// ---- helpers/dodge_profiles.js ----
const LOGIC_TICK_MS = 50;
const SPIKE = {
    spokes: 6,
    childRadius: 50,
    spawnOffset: 200,
    childTravel: 1100,
    flightDist: 2035,
    flightTimeMs: 963,
    burstLifeMs: 360,
    blastMs: 700,
    curveDeviationDeg: 22
};
SPIKE.armLength = SPIKE.spawnOffset + SPIKE.childTravel;
const SPIKE_CURVE_ARC = [
    [0, 200, 0],
    [110, 515, 32],
    [207, 797, 216],
    [312, 999, 519],
    [411, 1066, 930],
    [513, 995, 1377],
    [557, 883, 1611]
];
var _spikeVariant = null;

function _crossProfile(spec)
{
    const armLength = spec.spawnOffset + spec.childTravel;
    const burstLifeMs = spec.childTravel / spec.childSpeed * 1e3;
    return function(projectile, now)
    {
        const cx = projectile.targetX;
        const cy = projectile.targetY;
        if (!isFinite(cx) || !isFinite(cy)) return null;
        if (cx === 0 || cy === 0) return null;
        if (Math.abs(cx) > 1e6 || Math.abs(cy) > 1e6) return null;
        const landAt = (projectile.spawnedAt || now) + spec.flightTimeMs;
        const t0 = landAt - LOGIC_TICK_MS;
        const t1 = landAt + burstLifeMs + LOGIC_TICK_MS;
        return [
        {
            ax: cx - armLength,
            ay: cy,
            bx: cx + armLength,
            by: cy,
            radius: spec.childRadius,
            t0,
            t1
        },
        {
            ax: cx,
            ay: cy - armLength,
            bx: cx,
            by: cy + armLength,
            radius: spec.childRadius,
            t0,
            t1
        }];
    };
}

function _spikeEndpoint(projectile)
{
    const rad = (projectile.angle || 0) * Math.PI / 180;
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);
    const dist = traceWallHit(projectile.spawnX, projectile.spawnY, dirX, dirY, SPIKE.flightDist, BLOCKS_PROJECTILES);
    return {
        x: projectile.spawnX + dirX * dist,
        y: projectile.spawnY + dirY * dist,
        dist
    };
}

function _cactusProfile(projectile, now)
{
    if (!_spikeVariant) return null;
    const end = _spikeEndpoint(projectile);
    const burstAt = (projectile.spawnedAt || now) + SPIKE.flightTimeMs * (end.dist / SPIKE.flightDist);
    const hazards = [];
    if (projectile.spawnAreaRadius > 0)
    {
        hazards.push(
        {
            x: end.x,
            y: end.y,
            radius: projectile.spawnAreaRadius,
            t0: burstAt,
            t1: burstAt + (projectile.spawnAreaActiveTime || SPIKE.blastMs)
        });
    }
    if (_spikeVariant === "straight")
    {
        const t0 = burstAt - LOGIC_TICK_MS;
        const t1 = burstAt + SPIKE.burstLifeMs + LOGIC_TICK_MS;
        for (let i = 0; i < 3; i++)
        {
            const a = i * Math.PI / 3;
            const dx = Math.cos(a) * SPIKE.armLength;
            const dy = Math.sin(a) * SPIKE.armLength;
            hazards.push(
            {
                ax: end.x - dx,
                ay: end.y - dy,
                bx: end.x + dx,
                by: end.y + dy,
                radius: SPIKE.childRadius,
                t0,
                t1
            });
        }
        return hazards;
    }
    for (let s = 0; s < SPIKE.spokes; s++)
    {
        const rot = s * (2 * Math.PI / SPIKE.spokes);
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        for (let k = 0; k + 1 < SPIKE_CURVE_ARC.length; k++)
        {
            const ta = SPIKE_CURVE_ARC[k][0];
            const ax = SPIKE_CURVE_ARC[k][1];
            const ay = SPIKE_CURVE_ARC[k][2];
            const tb = SPIKE_CURVE_ARC[k + 1][0];
            const bx = SPIKE_CURVE_ARC[k + 1][1];
            const by = SPIKE_CURVE_ARC[k + 1][2];
            hazards.push(
            {
                ax: end.x + ax * cr - ay * sr,
                ay: end.y + ax * sr + ay * cr,
                bx: end.x + bx * cr - by * sr,
                by: end.y + bx * sr + by * cr,
                radius: SPIKE.childRadius,
                t0: burstAt + ta,
                t1: burstAt + tb
            });
        }
    }
    return hazards;
}

function noteBurstDeath(record)
{
    if (_spikeVariant || !record || record.name !== "CactusProjectile") return;
    const dx = record.x - record.spawnX;
    const dy = record.y - record.spawnY;
    if (dx * dx + dy * dy < 1) return;
    const chord = Math.atan2(dy, dx) * 180 / Math.PI;
    let deviation = Math.abs(((chord - (record.angle || 0)) % 360 + 540) % 360 - 180);
    _spikeVariant = deviation > SPIKE.curveDeviationDeg ? "curve" : "straight";
}

function resetProfiles()
{
    _spikeVariant = null;
}

const _profiles = new Map([
    ["CrossBomberProjectile", _crossProfile(
    {
        childRadius: 125,
        childSpeed: 3e3,
        spawnOffset: 200,
        childTravel: 800,
        flightTimeMs: 1015
    })],
    ["CrossBomberUltiProjectile", _crossProfile(
    {
        childRadius: 375,
        childSpeed: 3e3,
        spawnOffset: 100,
        childTravel: 1600,
        flightTimeMs: 1115
    })],
    ["CactusProjectile", _cactusProfile],
    ["CactusSpike", function()
    {
        return _spikeVariant ? [] : null;
    }]
]);

const _replaceGeneric = new Set(["CrossBomberProjectile", "CrossBomberUltiProjectile", "CactusSpike"]);

function blocksLinear(name)
{
    return !!name && _replaceGeneric.has(name);
}

function shapeHazards(projectile, now)
{
    if (!projectile || !projectile.name) return null;
    const profile = _profiles.get(projectile.name);
    if (!profile) return null;
    return profile(projectile, now);
}

// ---- features/autododge.js ----
const MOVE_INPUT_TYPE = 2;
var TUNE = {
    AWARE: 3200,
    RANGE_FALLBACK: 2800,
    TICK_MS: 16,
    DIR_COUNT: 48,
    SKIN: 50,
    LOCK_MS: 130,
    REACH: 600,
    HORIZON_S: 1,
    KEEP_BAND: 120,
    MOMENTUM: 100,
    ENGAGE: 40,
    RELEASE_GRACE_MS: 120,
    WALL_HIT: 9000,
    PROBE_N: 3,
    PROBE_T: 0.35,
    WALL_BODY: 240
};

var _heading = null;
var _headingIdx = -1;
var _holdUntil = 0;
var _lastDangerTs = 0;
var _lastTick = 0;
var _muted = new Set();
var _ring = [];
var _scoreBuf = [];
var _skip = new Set();
var _options = {
    reactionSpeed: 50,
    directionPrecision: 48,
    safetyMargin: 25
};

function _buildRing()
{
    _ring.length = 0;
    const n = TUNE.DIR_COUNT;
    for (let i = 0; i < n; i++)
    {
        const a = Math.PI * 2 * i / n;
        _ring.push(
        {
            x: Math.cos(a),
            y: Math.sin(a)
        });
    }
    _scoreBuf = new Array(n).fill(0);
    _headingIdx = -1;
}
_buildRing();

function _syncTuning()
{
    const t = Math.max(0, Math.min(100, _options.reactionSpeed)) / 100;
    TUNE.TICK_MS = Math.max(16, Math.round(32 - t * 16));
    TUNE.LOCK_MS = Math.max(80, Math.round(260 - t * 180));
    const n = Math.max(8, Math.min(128, _options.directionPrecision | 0));
    if (n !== TUNE.DIR_COUNT)
    {
        TUNE.DIR_COUNT = n;
        _buildRing();
    }
    TUNE.SKIN = Math.max(0, Math.min(120, _options.safetyMargin)) * 2;
}
_syncTuning();

function getDodgeDir()
{
    return _heading;
}

function setAutododgeOptions(opts)
{
    if (!opts || typeof opts !== "object") return;
    if (typeof opts.reactionSpeed === "number" && isFinite(opts.reactionSpeed))
    {
        _options.reactionSpeed = Math.max(0, Math.min(100, opts.reactionSpeed));
    }
    if (typeof opts.directionPrecision === "number" && isFinite(opts.directionPrecision))
    {
        _options.directionPrecision = Math.max(8, Math.min(128, opts.directionPrecision | 0));
    }
    if (typeof opts.safetyMargin === "number" && isFinite(opts.safetyMargin))
    {
        _options.safetyMargin = Math.max(0, Math.min(120, opts.safetyMargin));
    }
    if (Array.isArray(opts.ignoredBrawlers))
    {
        _skip = new Set();
        for (const name of opts.ignoredBrawlers)
        {
            const id = canonBrawlerName(name);
            if (id) _skip.add(id);
        }
        _muted.clear();
    }
    _syncTuning();
}

function _ballR(p)
{
    if (p.radius > 0) return p.radius;
    return 100;
}

function _traveled(p)
{
    const sx = p.spawnX,
        sy = p.spawnY;
    if (!isFinite(sx) || !isFinite(sy)) return 0;
    return Math.hypot(p.x - sx, p.y - sy);
}

function _kindReach(p, spec, spd)
{
    let r = spec && spec.maxRange > 0 ? spec.maxRange : 0;
    if (spec && spec.chargedRange > 0 && spd > 3500) r = spec.chargedRange;
    if (r <= 0 && p.castRange > 0) r = p.castRange;
    if (r <= 0 && p.isThrower && (p.targetX || p.targetY) && isFinite(p.spawnX) && isFinite(p.spawnY))
    {
        const td = Math.hypot(p.targetX - p.spawnX, p.targetY - p.spawnY);
        if (td > 0) r = td;
    }
    if (r <= 0) r = TUNE.RANGE_FALLBACK;
    if (spec && spec.reachAdj) r += spec.reachAdj;
    if (r > 0 && r < 70000) return r;
    return TUNE.RANGE_FALLBACK;
}

function _homePos(p)
{
    if (isFinite(p.ownerX) && isFinite(p.ownerY) && (p.ownerX || p.ownerY))
    {
        return {
            x: p.ownerX,
            y: p.ownerY
        };
    }
    if (p.targetX || p.targetY)
    {
        return {
            x: p.targetX,
            y: p.targetY
        };
    }
    return null;
}

function _lifeLeft(p, spec, spd, nowMs)
{
    const maxR = _kindReach(p, spec, spd);
    if (spec && spec.fade)
    {
        const age = Math.max(0, nowMs - (p.spawnedAt || nowMs));
        return Math.max(0, maxR * (1 - age / 1000));
    }
    if (spec && spec.home)
    {
        const home = _homePos(p);
        if (home) return Math.hypot(home.x - p.x, home.y - p.y);
    }
    const flown = _traveled(p);
    return Math.max(0, maxR - flown);
}

function _inAware(myX, myY, hazard, zoneSq)
{
    if (hazard.segment)
    {
        const d = _segDist(myX, myY, hazard.segment.ax, hazard.segment.ay, hazard.segment.bx, hazard.segment.by);
        return d * d <= zoneSq;
    }
    const dx = hazard.x - myX,
        dy = hazard.y - myY;
    return dx * dx + dy * dy <= zoneSq;
}

function _collectLive(myX, myY, myRadius, nowMs)
{
    const out = [];
    const live = new Set();
    const shots = scanData.projectiles;
    if (!shots || shots.length === 0)
    {
        if (_muted.size > 0) _muted.clear();
        return out;
    }
    const zoneSq = TUNE.AWARE * TUNE.AWARE;
    const bodyPad = myRadius + TUNE.SKIN;
    const deaths = scanData.destroyed;
    if (deaths && deaths.length)
    {
        for (let d = 0; d < deaths.length; d++) noteBurstDeath(deaths[d]);
    }
    for (let i = 0; i < shots.length; i++)
    {
        const p = shots[i];
        const gid = p.gid;
        if (!gid) continue;
        live.add(gid);
        const owner = p.ownerName;
        if (owner && _skip.has(canonBrawlerName(owner) || owner)) _muted.add(gid);
        if (_muted.has(gid)) continue;
        const shaped = shapeHazards(p, nowMs);
        if (shaped)
        {
            for (let c = 0; c < shaped.length; c++)
            {
                const cap = shaped[c];
                const until = (cap.t1 - nowMs) / 1e3;
                if (until <= 0) continue;
                const hazard = {
                    rad: cap.radius + bodyPad,
                    blob: cap.ax === void 0,
                    until,
                    name: p.name || cap.name || ""
                };
                if (cap.ax === void 0)
                {
                    hazard.x = cap.x;
                    hazard.y = cap.y;
                    hazard.vx = 0;
                    hazard.vy = 0;
                }
                else
                {
                    hazard.segment = cap;
                }
                if (_inAware(myX, myY, hazard, zoneSq)) out.push(hazard);
            }
        }
        if (shaped && blocksLinear(p.name)) continue;
        const name = p.name || "";
        const spec = kindOf(name);
        if (spec && spec.drop) continue;
        const dx = p.x - myX,
            dy = p.y - myY;
        if (dx * dx + dy * dy > zoneSq) continue;
        let vx = p.vx,
            vy = p.vy;
        if (!isFinite(vx) || !isFinite(vy))
        {
            vx = 0;
            vy = 0;
        }
        const flown = _traveled(p);
        if (spec && spec.lockPath && flown > 120 && isFinite(p.spawnX) && isFinite(p.spawnY))
        {
            vx = (p.x - p.spawnX) / flown * (p.speed || 1);
            vy = (p.y - p.spawnY) / flown * (p.speed || 1);
        }
        let spd = Math.hypot(vx, vy);
        if (spec && spec.speedMul > 0 && spd > 3500)
        {
            vx *= spec.speedMul;
            vy *= spec.speedMul;
            spd *= spec.speedMul;
        }
        const slow = (p.speed || 0) > 0 && p.speed < 1600;
        const lockPath = !!(spec && spec.lockPath) || !!p.isBeam;
        const blob = !!(spec && spec.blob) || !lockPath && (p.isThrower || slow);
        const bodyR = myRadius + TUNE.SKIN;
        const fit = fitOf(name);
        const growR = spec && spec.growR || 0;
        const shotR = _ballR(p) + growR;
        const rad = shotR + bodyR + fit.pad + shotR * fit.grow;
        let ux = 0,
            uy = 0;
        let playerAlong = 0;
        if (spd >= 1)
        {
            ux = vx / spd;
            uy = vy / spd;
        }
        if (!blob && spd >= 1)
        {
            playerAlong = (myX - p.x) * ux + (myY - p.y) * uy;
            if (playerAlong < -50) continue;
            if (!p.isThrower)
            {
                const hitX = p.x + ux * Math.max(playerAlong, 0);
                const hitY = p.y + uy * Math.max(playerAlong, 0);
                if (!losCheck(p.x, p.y, hitX, hitY, BLOCKS_PROJECTILES)) continue;
            }
        }
        const left = _lifeLeft(p, spec, spd, nowMs);
        if (left <= 10) continue;
        const gap = Math.hypot(p.x - myX, p.y - myY) - bodyR - shotR;
        if (left < 0.85 * Math.max(0, gap)) continue;
        if (!blob && spd >= 1 && playerAlong > left + shotR) continue;
        out.push(
        {
            x: p.x,
            y: p.y,
            vx: blob ? 0 : vx,
            vy: blob ? 0 : vy,
            rad,
            pathLen: left + shotR,
            left,
            name,
            blob,
            owner: owner ? canonBrawlerName(owner) || owner : "",
            castRange: p.castRange || 0,
            age: spec && spec.fade ? Math.max(0, nowMs - (p.spawnedAt || nowMs)) : 0,
            fadeBase: spec && spec.fadeBase || 0,
            fadeK: spec && spec.fadeK || 0
        });
    }
    for (const k of _muted)
    {
        if (!live.has(k)) _muted.delete(k);
    }
    return out;
}

function _segDist(px, py, ax, ay, bx, by)
{
    const dx = bx - ax,
        dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq < 1e-6 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function _fadeVel(t, dt)
{
    let vx = t.vx || 0;
    let vy = t.vy || 0;
    if (t.fadeBase && t.fadeK)
    {
        const now = Math.max(0, t.age || 0);
        const later = now + (dt || 0) * 1000;
        const cur = t.fadeBase * Math.exp(t.fadeK * now);
        const nxt = t.fadeBase * Math.exp(t.fadeK * later);
        if (cur > 1e-6)
        {
            const r = nxt / cur;
            vx *= r;
            vy *= r;
        }
    }
    return {
        x: vx,
        y: vy
    };
}

function _clearanceFor(threats, myX, myY, mvx, mvy)
{
    let minClear = Infinity;
    const horizon = TUNE.HORIZON_S;
    for (let i = 0; i < threats.length; i++)
    {
        const t = threats[i];
        if (t.segment)
        {
            const maxT = t.until > 0 ? Math.min(horizon, t.until) : horizon;
            for (let step = 0; step <= 4; step++)
            {
                const ts = maxT * (step / 4);
                const d = _segDist(myX + mvx * ts, myY + mvy * ts, t.segment.ax, t.segment.ay, t.segment.bx, t.segment.by) - t.rad;
                if (d < minClear) minClear = d;
            }
            continue;
        }
        const vel = _fadeVel(t, 0);
        const spd = Math.hypot(vel.x, vel.y);
        let maxT = horizon;
        if (spd > 1)
        {
            if (t.left > 0) maxT = Math.min(maxT, t.left / spd);
            if (t.pathLen > 0) maxT = Math.min(maxT, t.pathLen / spd);
        }
        if (t.until > 0) maxT = Math.min(maxT, t.until);
        const relx = t.x - myX,
            rely = t.y - myY;
        const vrx = vel.x - mvx,
            vry = vel.y - mvy;
        const vv = vrx * vrx + vry * vry;
        let cx, cy;
        if (vv < 1e-6)
        {
            cx = relx;
            cy = rely;
        }
        else
        {
            let ts = -(relx * vrx + rely * vry) / vv;
            if (ts < 0) ts = 0;
            else if (ts > maxT) ts = maxT;
            cx = relx + vrx * ts;
            cy = rely + vry * ts;
        }
        const clear = Math.sqrt(cx * cx + cy * cy) - t.rad;
        if (clear < minClear) minClear = clear;
    }
    return minClear;
}

function _wallAhead(myX, myY, dir, speed, bodyR)
{
    const step = speed * TUNE.PROBE_T;
    let raw = 0;
    for (let s = 1; s <= TUNE.PROBE_N; s++)
    {
        const px = myX + dir.x * step * s;
        const py = myY + dir.y * step * s;
        if (isBlockedWide(px, py, bodyR, BLOCKS_MOVEMENT))
        {
            raw += TUNE.WALL_HIT * (TUNE.PROBE_N - s + 1);
        }
    }
    return raw;
}

function _wallR()
{
    return TUNE.WALL_BODY;
}

function clampMoveTarget(tx, ty)
{
    return _clampTarget(tx, ty);
}

function sendBattleMove(logic, tx, ty)
{
    return _sendMove(logic, tx, ty);
}

function _clampToMap(v, maxTiles)
{
    const max = maxTiles * TILE_SIZE - 1;
    if (max <= 0) return v;
    if (v < 0) return 0;
    if (v > max) return max;
    return v;
}

function _clampTarget(tx, ty)
{
    const w = getWallCacheW(),
        h = getWallCacheH();
    if (w <= 0 || h <= 0) return {
        x: tx,
        y: ty
    };
    return {
        x: _clampToMap(tx, w),
        y: _clampToMap(ty, h)
    };
}

function _sendMove(logic, tx, ty)
{
    if (!logic || logic.isNull()) return false;
    try
    {
        const fns = getFunctions();
        fns.LogicBattleModeClient_setClientPredictionMoveTo(logic, tx, ty, 1);
        return sendCommand(MOVE_INPUT_TYPE, (ci) =>
        {
            ci.add(offsets.ClientInput_x).writeS32(tx);
            ci.add(offsets.ClientInput_y).writeS32(ty);
        });
    }
    catch (e)
    {
        logWarn("autododge send failed",
        {
            err: String(e && e.message || e)
        });
        return false;
    }
}

function _clearHeading()
{
    _heading = null;
    _headingIdx = -1;
    _holdUntil = 0;
}

function updateAutododge()
{
    if (!state.autododge) return;
    if (scanData.lastUpdate === 0) return;
    const now = Date.now();
    if (now - _lastTick < TUNE.TICK_MS) return;
    _lastTick = now;
    const myX = scanData.myX;
    const myY = scanData.myY;
    const speed = scanData.mySpeed || 720;
    const myRadius = scanData.myRadius || 60;
    const hazards = _collectLive(myX, myY, myRadius, now);
    if (hazards.length === 0)
    {
        if (_heading && now - _lastDangerTs > TUNE.RELEASE_GRACE_MS) _clearHeading();
        return;
    }
    const stayClear = _clearanceFor(hazards, myX, myY, 0, 0);
    const inDanger = stayClear < TUNE.ENGAGE;
    if (inDanger) _lastDangerTs = now;
    if (!inDanger && (!_heading || now - _lastDangerTs > TUNE.RELEASE_GRACE_MS))
    {
        if (_heading) _clearHeading();
        return;
    }
    const prevIdx = _headingIdx >= 0 && _headingIdx < _ring.length ? _headingIdx : -1;
    const prevDir = prevIdx >= 0 ? _ring[prevIdx] : null;
    const bodyR = _wallR();
    let bestIdx = 0,
        bestScore = -Infinity;
    for (let i = 0; i < _ring.length; i++)
    {
        const d = _ring[i];
        let s = _clearanceFor(hazards, myX, myY, speed * d.x, speed * d.y);
        s -= _wallAhead(myX, myY, d, speed, bodyR);
        if (prevDir) s += TUNE.MOMENTUM * (d.x * prevDir.x + d.y * prevDir.y);
        _scoreBuf[i] = s;
        if (s > bestScore)
        {
            bestScore = s;
            bestIdx = i;
        }
    }
    let chosenIdx = bestIdx;
    if (prevIdx >= 0 && now < _holdUntil && chosenIdx !== prevIdx)
    {
        if (_scoreBuf[prevIdx] + TUNE.KEEP_BAND >= _scoreBuf[chosenIdx])
        {
            chosenIdx = prevIdx;
        }
        else
        {
            _holdUntil = now + TUNE.LOCK_MS;
        }
    }
    else if (now >= _holdUntil)
    {
        _holdUntil = now + TUNE.LOCK_MS;
    }
    if (_scoreBuf[chosenIdx] <= stayClear)
    {
        if (_heading) _clearHeading();
        return;
    }
    const chosen = _ring[chosenIdx];
    _headingIdx = chosenIdx;
    _heading = chosen;
    const target = {
        x: Math.round(myX + chosen.x * TUNE.REACH),
        y: Math.round(myY + chosen.y * TUNE.REACH)
    };
    const ok = state.speedhack ? true : _sendMove(scanData.battleModeClient, target.x, target.y);
    if (chosenIdx !== prevIdx)
    {
        const names = [];
        for (let i = 0; i < hazards.length && names.length < 4; i++)
        {
            if (hazards[i].name) names.push(hazards[i].name);
        }
        logInfo("autododge dodge",
        {
            names,
            id: names[0] || "",
            x: target.x,
            y: target.y,
            myX: myX | 0,
            myY: myY | 0,
            dist: Math.hypot(target.x - myX, target.y - myY) | 0,
            threats: hazards.length,
            sent: ok
        });
    }
}

function resetAutododge()
{
    if (_muted.size > 0 || _heading)
    {
        logInfo("autododge reset",
        {
            tracks: _muted.size,
            heading: !!_heading,
            headingIdx: _headingIdx
        });
    }
    _muted.clear();
    resetProfiles();
    _clearHeading();
    _lastDangerTs = 0;
    _lastTick = 0;
}

function setupAutododge()
{
    enableProjectileTracking();
}

// ---- index.js ----
let _base = null;
let _lastBattle = null;
let _installed = false;

function findBase()
{
    try
    {
        return Process.getModuleByName("Nulls Brawl").base;
    }
    catch (_)
    {}
    const mods = Process.enumerateModules();
    for (let i = 0; i < mods.length; i++)
    {
        if (mods[i].name.toLowerCase().indexOf("nulls") >= 0) return mods[i].base;
    }
    return null;
}

function install()
{
    if (_installed) return true;
    _base = findBase();
    if (!_base) return false;

    initFunctions(_base);
    initScanner(_base);
    watchTileChanges(_base);
    setupAutododge();
    setLoggingEnabled(true);

    Interceptor.attach(_base.add(offsets.LogicBattleModeClient_update),
    {
        onEnter(args)
        {
            const bm = args[0];
            if (!bm || bm.isNull()) return;

            if (!_lastBattle || !_lastBattle.equals(bm))
            {
                _lastBattle = bm;
                resetScannerCache();
                resetAutododge();
                notifyBattleModeChanged(bm);
            }

            const now = Date.now();
            try
            {
                updateScanner(bm, now);
            }
            catch (e)
            {
                return;
            }
            try
            {
                maybeRefreshWallCache(bm, now);
            }
            catch (_)
            {}
            try
            {
                updateAutododge();
            }
            catch (_)
            {}
        }
    });

    _installed = true;
    return true;
}

install();

})();
