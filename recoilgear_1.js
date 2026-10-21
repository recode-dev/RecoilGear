// RecoilGear v1 — single-file build
var __mods = {};
__mods["core/offsets.js"] = (function(){
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
    CharData_brawlerId: 0x35c,
    HeroData_namePtr: 0x18,

    LogicProjectileClient_ownerTeam: 0x40,
    LogicProjectileClient_dataName: 0x18,
    Projectile_isIndirect: 0x118,
    ProjectileData_speed: 0x124,
    ProjectileData_radius: 0x74,

    ClientInput_x: 0xc,
    ClientInput_y: 0x10,
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
    LogicBattleModeClient__getOwnPlayerIndex: 0x9cda04,
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
    LogicCharacterClient__getWeaponSkill: 0x9fc440,
    LogicCharacterClient__getSkillAt: 0xa007fc,

    LogicSkillClient__getData: 0x1e5650,
    LogicSkillData__getCastingRange: 0x9de9cc,
    LogicSkillData__getProjectileData: 0x9e84a8,

    LogicProjectileClient_getData: 0x117050,
    LogicProjectileData_getSpeed: 0x8cee94,
    LogicProjectileData_getRadius: 0x860d88,
    LogicProjectileData_getRendering: 0x97d5c0,
    LogicProjectileData__getSpawnAreaEffect: 0x9cda1c,

    AreaEffectData__getRadius: 0x8cee8c,
    AreaEffectData__getActiveTimeMs: 0x9bf8f4,

    LogicData_getName: 0x9a4f1c
});
return { offsets };
})();
__mods["core/functions.js"] = (function(){
const { offsets } = __mods["core/offsets.js"];

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
        LogicCharacterData_getSpeed: _nf("LogicCharacterData_getSpeed", "int32", ["pointer"]),
        LogicCharacterData_getCollisionRadius: _nf("LogicCharacterData_getCollisionRadius", "uint32", ["pointer"]),
        LogicBattleModeClient_getTileMap: _nf("LogicBattleModeClient__getTileMap", "pointer", ["pointer"]),
        LogicProjectileClient_getData: _nf("LogicProjectileClient_getData", "pointer", ["pointer"]),
        LogicCharacterClient_getWeaponSkill: _nf("LogicCharacterClient__getWeaponSkill", "pointer", ["pointer"]),
        LogicSkillData_getCastingRange: _nf("LogicSkillData__getCastingRange", "int32", ["pointer"]),
        LogicSkillData_getProjectileData: _nf("LogicSkillData__getProjectileData", "pointer", ["pointer", "int"]),
        LogicSkillClient_getData: _nf("LogicSkillClient__getData", "pointer", ["pointer", "int"]),
        LogicData_getName: _nf("LogicData_getName", "pointer", ["pointer"]),
        LogicCharacterClient_getSkillAt: _nf("LogicCharacterClient__getSkillAt", "pointer", ["pointer", "int"]),
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
return { initFunctions, getFunctions, getBase };
})();
__mods["core/scstring.js"] = (function(){
const { offsets } = __mods["core/offsets.js"];

const INLINE_MAX_LENGTH = 7;
const DEFAULT_MAX_LENGTH = 256;

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
return { readScString };
})();
__mods["utils/brawlerName.js"] = (function(){
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
return { canonBrawlerName };
})();
__mods["utils/flags.js"] = (function(){
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

var state = {};
FEATURE_NAMES.forEach((name) =>
{
    state[name] = false;
});

function setState(feature, value)
{
    if (!(feature in state)) return;
    state[feature] = !!value;
}

setState("autododge", true);
setState("aimbot", true);
return { setState, state };
})();
__mods["core/scanner.js"] = (function(){
const { getFunctions } = __mods["core/functions.js"];
const { offsets } = __mods["core/offsets.js"];
const { readScString } = __mods["core/scstring.js"];
const { canonBrawlerName } = __mods["utils/brawlerName.js"];
const { state } = __mods["utils/flags.js"];

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
    myBrawlerName: null,
    enemies: [],
    projectiles: [],
    destroyed: [],
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

function _readDataName(data)
{
    try
    {
        const namePtr = data.add(offsets.HeroData_namePtr).readPointer();
        if (!_validPtr(namePtr)) return null;
        const name = readScString(namePtr, 128);
        if (!name) return null;
        return (name.indexOf("hero_icon_") === 0 ? name.substring(10) : name).toUpperCase();
    }
    catch (_)
    {}
    return null;
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
        const isThrower = projectile.add(offsets.Projectile_isIndirect).readU32() | 0;
        const isBeam = false;
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
            targetX: 0,
            targetY: 0,
            speed,
            radius,
            rendering,
            angle: null,
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
            vx: 0,
            vy: 0
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
        scanData.mySpeed = 720;
        const ownData = functions.LogicGameObjectClient_getData(own);
        if (_validPtr(ownData))
        {
            scanData.myRadius = functions.LogicCharacterData_getCollisionRadius(ownData) || 60;
            try
            {
                const speed = functions.LogicCharacterData_getSpeed ? functions.LogicCharacterData_getSpeed(ownData) | 0 : 0;
                if (speed >= 300 && speed <= 3000) scanData.mySpeed = speed;
            }
            catch (_)
            {}
            const nameRead = _readDataName(ownData);
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
                            brawlerName = _readDataName(data);
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
}

function initScanner(base)
{
    moduleBase = base;
}

function enableProjectileTracking()
{
    if (moduleBase) _installProjectileHooks(moduleBase);
}
return { updateScanner, resetScannerCache, initScanner, enableProjectileTracking, scanData };
})();
__mods["utils/wallCache.js"] = (function(){
const { getFunctions } = __mods["core/functions.js"];
const { offsets } = __mods["core/offsets.js"];

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
return { notifyBattleModeChanged, maybeRefreshWallCache, watchTileChanges, getWallCacheW, getWallCacheH, losCheck, traceWallHit, isBlockedAt, isBlockedWide, TILE_SIZE, BLOCKS_MOVEMENT, BLOCKS_PROJECTILES };
})();
__mods["utils/crypto.js"] = (function(){
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
return { sha256 };
})();
__mods["core/commands.js"] = (function(){
const { offsets } = __mods["core/offsets.js"];
const { getBase, getFunctions } = __mods["core/functions.js"];
const { sha256 } = __mods["utils/crypto.js"];

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
return { sendCommand };
})();
__mods["utils/logger.js"] = (function(){
const LEVEL_DEBUG = "debug";
const LEVEL_WARN = "warn";
const FILE_NAME = "recoilgear.log";

var _enabled = false;
var _file = null;
var _failed = false;

function _objcString(ptrValue)
{
    try
    {
        if (!ptrValue || ptrValue.isNull()) return null;
        if (typeof ObjC !== "undefined") return new ObjC.Object(ptrValue).toString();
    }
    catch (_)
    {}
    try
    {
        const msgSendPtr = Module.findGlobalExportByName("objc_msgSend");
        const selPtr = Module.findGlobalExportByName("sel_registerName");
        if (!msgSendPtr || !selPtr) return null;
        const msgSend = new NativeFunction(msgSendPtr, "pointer", ["pointer", "pointer"]);
        const selReg = new NativeFunction(selPtr, "pointer", ["pointer"]);
        const str = msgSend(ptrValue, selReg(Memory.allocUtf8String("UTF8String")));
        if (!str || str.isNull()) return null;
        return str.readUtf8String();
    }
    catch (_)
    {
        return null;
    }
}

function _logPath()
{
    try
    {
        const fn = Module.findGlobalExportByName("NSHomeDirectory");
        if (fn)
        {
            const home = new NativeFunction(fn, "pointer", [])();
            const path = _objcString(home);
            if (path) return path.replace(/\/+$/, "") + "/Documents/" + FILE_NAME;
        }
    }
    catch (_)
    {}
    return "/tmp/" + FILE_NAME;
}

function _open()
{
    if (_file || _failed) return _file;
    const paths = [];
    const primary = _logPath();
    if (primary) paths.push(primary);
    const fallback = "/tmp/" + FILE_NAME;
    if (paths.indexOf(fallback) < 0) paths.push(fallback);
    for (let i = 0; i < paths.length; i++)
    {
        try
        {
            _file = new File(paths[i], "a");
            return _file;
        }
        catch (_)
        {}
    }
    _failed = true;
    return null;
}

function _stamp()
{
    const d = new Date();
    const p = (n, w) => String(n).padStart(w || 2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
        p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + "." + p(d.getMilliseconds(), 3);
}

function _emit(level, message, data)
{
    if (!_enabled) return;
    const f = _open();
    if (!f) return;
    let line = _stamp() + " [" + level + "] " + String(message || "");
    if (data !== void 0)
    {
        try
        {
            line += " " + JSON.stringify(data);
        }
        catch (_)
        {}
    }
    try
    {
        f.write(line + "\n");
        f.flush();
    }
    catch (_)
    {}
}

function setLoggingEnabled(value)
{
    const next = !!value;
    if (next === _enabled) return;
    _enabled = next;
    if (_enabled) _emit(LEVEL_DEBUG, "logging enabled");
}

function logWarn(message, data)
{
    _emit(LEVEL_WARN, message, data);
}
return { setLoggingEnabled, logWarn };
})();
__mods["helpers/dodge_kinds.js"] = (function(){
const FITS = [
    { grow: 0.65, pad: 120.0 },
    { grow: 0.55, pad: 90.0 },
    { grow: 0.6, pad: 100.0 },
    { grow: 0.45, pad: 70.0 },
    { grow: 0.4, pad: 50.0 },
    { grow: 0.45, pad: 60.0 },
    { grow: 0.5, pad: 80.0 },
    { grow: 0.35, pad: 40.0 },
    { grow: 0.45, pad: 60.0 },
];

const K_BLOB = 0x01;
const K_LOCKPATH = 0x02;
const K_DROP = 0x04;
const K_FADE = 0x08;
const FIT_FALLBACK = 8;

const KINDS = {
    ShotgunGirlProjectile: { fit: 8, maxRange: 2300 },
    ShotgunGirlUltiProjectile: { fit: 7, maxRange: 2300 },
    ShotgunGirlOverchargedUltiProjectile: { fit: 7, chargedRange: 2300, speedMul: 1.2 },
    GunslingerProjectile: { fit: 7, maxRange: 2700 },
    GunslingerUltiProjectile: { fit: 4, maxRange: 3300 },
    GunslingerOverchargedUltiProjectile: { fit: 4, chargedRange: 3300, speedMul: 1.2 },
    BullDudeProjectile: { fit: 8, maxRange: 1600 },
    RocketGirlProjectile: { fit: 2, flags: 2, maxRange: 2700, growR: 280 },
    RocketGirlUltiProjectile: { fit: 2, maxRange: 2500, growR: 280 },
    TrickshotDudeProjectile: { fit: 7, maxRange: 2900 },
    TrickshotDudeUltiProjectile: { fit: 7, maxRange: 4000 },
    TrickshotDudeUltiOverchargedProjectile: { fit: 7, chargedRange: 4000 },
    CactusProjectile: { fit: 3, maxRange: 2300 },
    CactusUltiProjectile: { fit: 8, flags: 5, maxRange: 2300 },
    CactusOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2300, speedMul: 1.2 },
    CactusSpike: { fit: 7 },
    MechanicProjectile1: { fit: 3, maxRange: 2700 },
    MechanicProjectile2: { fit: 8, maxRange: 2000 },
    MechanicProjectile3: { fit: 8, maxRange: 2000 },
    MechanicUltiProjectile: { fit: 8, maxRange: 1500 },
    MechanicOverchargedUltiProjectile: { fit: 8, chargedRange: 1500, speedMul: 1.2 },
    ShamanProjectile: { fit: 1, maxRange: 1800 },
    ShamanUltiProjectile: { fit: 8, maxRange: 1500 },
    ShamanOverchargedProjectile: { fit: 0, flags: 8, maxRange: 2000, chargedRange: 2000, growR: 60, fadeBase: 300.0, fadeK: 0.000338936 },
    ShamanOverChargedUltiProjectile: { fit: 8, chargedRange: 1500, speedMul: 1.2 },
    BarkeepProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    BarkeepUltiProjectile: { fit: 8, flags: 5, maxRange: 2800 },
    TntDudeProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    TntDudeOverchargedClusterProjectile: { fit: 8, flags: 5 },
    TntDudeUltiProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    TntDudeOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2200, speedMul: 1.2 },
    TntDudeNanoChainProjectile: { fit: 8, flags: 5 },
    BoneThrowerProjectile: { fit: 8, maxRange: 2700 },
    BoneThrowerUltiProjectile: { fit: 8, maxRange: 2700 },
    DummyProjectileForLaserBall: { fit: 8, flags: 2, maxRange: 4800 },
    DummyProjectileForLaserBallBurning: { fit: 8, maxRange: 3600 },
    MechanicTurretProjectile: { fit: 8 },
    MechanicOverchargedTurretProjectile: { fit: 8 },
    UndertakerAfterChargeOverchargedProjectile: { fit: 0 },
    UndertakerUltiProjectile: { fit: 0, maxRange: 3000 },
    UndertakerOverchargedUltiProjectile: { fit: 0, flags: 2, chargedRange: 3000, speedMul: 1.2 },
    UndertakerOverchargedUltiProjectileReturn: { fit: 0 },
    CrowProjectile: { fit: 7, maxRange: 2600 },
    CrowOverchargedProjectile: { fit: 7, flags: 2, maxRange: 2600, chargedRange: 2600 },
    CrowOverchargedProjectile2: { fit: 7, flags: 2 },
    CrowUltiProjectile: { fit: 7 },
    CrowThrowPoisonDaggerSkillProjectile: { fit: 4, maxRange: 2500 },
    CrowThrowPoisonDaggerSkillProjectileBuddy: { fit: 4, maxRange: 2500 },
    CrowThrowPoisonDaggerSkillProjectileBuddyChain: { fit: 4 },
    DeadMariachiProjectile: { fit: 3, maxRange: 2100 },
    DeadMariachiOverchargedProjectile: { fit: 3, maxRange: 2100 },
    DeadMariachiUltiProjectile: { fit: 0, maxRange: 2800 },
    DeadMariachiOverchargedUltiProjectile: { fit: 0, chargedRange: 2800, speedMul: 1.2 },
    DeadMariachi_CleanseProjectile: { fit: 8, flags: 5, maxRange: 1500 },
    DeadMariachi_CleanseProjectileBuddy: { fit: 8, flags: 5, maxRange: 1500 },
    BowDudeSpawnMineProjectile: { fit: -1, flags: 4, maxRange: 2600 },
    BowDudeProjectile: { fit: 5, maxRange: 2600 },
    SniperProjectile: { fit: 1, maxRange: 3000 },
    MinigunDudeProjectile: { fit: 7, maxRange: 2700 },
    MinigunDudeUltiProjectile: { fit: 8, maxRange: 1500 },
    MinigunDudeProjectileNano: { fit: 7, flags: 16, maxRange: 2700 },
    PrimoDefProjectile: { fit: 3, flags: 8, maxRange: 900, growR: 120, fadeBase: 30.0, fadeK: 0.00583153 },
    BlackHoleProjectile: { fit: 4, maxRange: 2400 },
    BlackHoleUltiProjectile: { fit: 8, flags: 5, maxRange: 2000 },
    BarrelBotProjectile: { fit: 8, maxRange: 1800 },
    BarrelBotOverchargedProjectile: { fit: 8, chargedRange: 1800, speedMul: 1.2 },
    ArtilleryDudeProjectile: { fit: 3, maxRange: 2600 },
    ArtilleryDudeProjectile2: { fit: 7 },
    ArtilleryDudeUltiProjectile: { fit: 3, flags: 1, maxRange: 1500 },
    ArtilleryDudeTurretProjectile: { fit: -1, flags: 4 },
    ArtilleryDudeOverchargedUltiProjectile: { fit: 3, flags: 1, chargedRange: 1500 },
    ArtilleryDudeOverchargedTurretProjectile: { fit: -1, flags: 4 },
    ShotgunGirlPetProjectile: { fit: 8 },
    BlackHolePetProjectile: { fit: 7 },
    HammerDudeProjectile: { fit: 3, maxRange: 1800 },
    HammerDudeUltiProjectile: { fit: 0, maxRange: 2100 },
    HookProjectile: { fit: 1, maxRange: 1700 },
    HookProjectile2: { fit: -1, flags: 4 },
    HookUltiProjectile: { fit: 2, maxRange: 2300 },
    HookUltiProjectile2: { fit: 2 },
    ClusterBombProjectile: { fit: 8, flags: 5, maxRange: 2600 },
    ClusterBombProjectile2: { fit: 8, flags: 5 },
    ClusterBombSummonProjectile: { fit: 8, maxRange: 1000 },
    ArcadeProjectile: { fit: 7, maxRange: 3000 },
    ArcadeUltiProjectile: { fit: 8, maxRange: 1500 },
    ArcadeUltiOverchargedProjectile: { fit: 8, chargedRange: 1500, speedMul: 1.2 },
    ArcadeOverchargedBuddyProjectile: { fit: 7, maxRange: 3000 },
    ArcadeItemDispenserProjectile: { fit: 8 },
    ArcadeDoubleBonusSkillProjectile: { fit: 7 },
    ArcadeDoubleBonusSkillBuddyProjectile: { fit: 7 },
    ArcadeDoubleBonusSkillBuddyProjectile2: { fit: 7 },
    ArcadeDoubleBonusSkillBuddyProjectile3: { fit: 7 },
    LeonDefProjectile: { fit: 4, maxRange: 2900 },
    LeonDefProjectileMutation: { fit: 4 },
    RosaProjectile: { fit: 3, maxRange: 1100 },
    CoopRangedEnemyProjectile: { fit: -1, maxRange: 2500 },
    BossProjectile: { fit: 3, maxRange: 4000 },
    RaidBossRangedEnemyProjectile: { fit: 4 },
    RaidBossProjectileRed: { fit: 3, maxRange: 6000 },
    RaidBossProjectileRedDestroyEnv: { fit: 3, maxRange: 6000 },
    RaidBossProjectileGold: { fit: 3, maxRange: 6000 },
    RaidBossRocketProjectile: { fit: 8, flags: 5 },
    ShamanStarPowerProjectile: { fit: 8, flags: 16 },
    UndertakerStarPowerProjectile: { fit: 8, flags: 16 },
    HammerDudeStarPowerProjectile: { fit: 8, flags: 16 },
    RoboWarsBaseProjectile: { fit: 8, flags: 21 },
    WhirlwindProjectile: { fit: 1, flags: 2, reachAdj: -250, maxRange: 2500, growR: 250 },
    WhirlwindProjectile2: { fit: -1, flags: 16, growR: 250 },
    BaseballUltiProjectile: { fit: 0, flags: 2, maxRange: 12000 },
    BaseballOverchargedUltiProjectile: { fit: 0, flags: 2, chargedRange: 12000, speedMul: 1.2 },
    BaseballOverchargedUltiProjectileChain: { fit: 0, flags: 2 },
    TurretElecProj: { fit: 8 },
    TurretElecProj2: { fit: 8 },
    TurretElecProj3: { fit: 8 },
    BlackHolePet2Projectile: { fit: 8, flags: 16 },
    BeeSniperProjectile: { fit: 7, maxRange: 3000 },
    BeeSniperChargedProjectile: { fit: 1, maxRange: 3000 },
    BeeSniperUltiProjectile: { fit: 0, flags: 1, maxRange: 2700 },
    BeeProjectile: { fit: 8 },
    SandstormProjectile: { fit: 2, maxRange: 1800 },
    SandstormUltiProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    MummyProjectile: { fit: 1, flags: 8, reachAdj: -750, maxRange: 2000, growR: 150, fadeBase: 4461.04, fadeK: -0.000971 },
    BossRaceBossProjectile: { fit: 3, maxRange: 6000 },
    BossRaceBossLightningProjectile1: { fit: 0, maxRange: 6000 },
    BossRaceBossLightningProjectile2: { fit: 0 },
    BossRaceBossLightningProjectile3: { fit: 0 },
    BossRaceBossRocketProjectile: { fit: 8, flags: 5, maxRange: 6000 },
    SpawnerDudeProjectile: { fit: 1, maxRange: 2100, growR: 250 },
    SpawnerDudeIndirectProjectile: { fit: 3, flags: 1 },
    SpawnerDudeUltiProjectile: { fit: 3, flags: 1, maxRange: 1500 },
    SpeedyProjectile: { fit: 7, maxRange: 2500 },
    SpeedyOverchargedBuddyProjectile: { fit: 7, maxRange: 2500 },
    SpeedyRewindProjectile: { fit: 8, flags: 5, maxRange: 800 },
    DummyProjectileForCTF: { fit: 8, maxRange: 2000 },
    DummyProjectileForBasketBrawl: { fit: 8, maxRange: 2000 },
    SpawnerPetProjectile: { fit: 4 },
    SpawnerOverchargedPetProjectile: { fit: 4 },
    BlowerProjectile: { fit: 7, maxRange: 2500 },
    BlowerUltiProjectile: { fit: 3, maxRange: 3000 },
    WallyProjectile: { fit: 7, maxRange: 1500 },
    WallySecondaryProjectile: { fit: 6, flags: 2, reachAdj: 1000 },
    WallyUltiProjectile: { fit: 8, flags: 5, maxRange: 2300 },
    WallyOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2300, speedMul: 1.2 },
    BarrelBotSpinProjectile: { fit: 4 },
    PiperHandgunProjectile: { fit: 4, maxRange: 2200 },
    ControllerUltiProjectile: { fit: -1, flags: 4, maxRange: 1000 },
    ControllerUltiOverchargedProjectile: { fit: -1, flags: 4, chargedRange: 1000 },
    ControllerProjectile: { fit: 3, reachAdj: 600, maxRange: 2600, growR: 150 },
    CactusSpikeGadget: { fit: 7, maxRange: 2300 },
    TrickshotDudeGadgetProjectile: { fit: 4, flags: 2, reachAdj: 1500 },
    TrickshotDudeNanoProjectile: { fit: 4, flags: 2, reachAdj: 1500 },
    PowerLevelerProjectile: { fit: 3, maxRange: 2000 },
    PowerLevelerProjectile2: { fit: 3 },
    PowerLevelerOverchargedProjectile: { fit: 3, chargedRange: 2000, speedMul: 1.2 },
    PowerLevelerOverchargedProjectile2: { fit: 3 },
    PowerLevelerOverchargedProjectileBuddy: { fit: 3, chargedRange: 2000 },
    PowerLevelerOverchargedProjectile2Buddy: { fit: 3 },
    PowerLevelerOverchargedUltiProjectile: { fit: 3 },
    RaidBossTCBasicAttackProjectile: { fit: 2 },
    BarkeepHealingProjectile: { fit: 8, flags: 5 },
    SniperHomingProjectile: { fit: 1, maxRange: 3500, growR: 100 },
    PercenterProjectile: { fit: 1, flags: 2, maxRange: 2600 },
    PercenterOverchargedProjectile: { fit: 1, flags: 2, maxRange: 2600 },
    PercenterOverchargedProjectileSecondary: { fit: 3 },
    PercenterCharmSkillProjectile: { fit: 3, maxRange: 2500 },
    PercenterCharmSkillBuddyProjectile: { fit: 3, maxRange: 2500 },
    FireDudeProjectile: { fit: 2, flags: 8, maxRange: 2500, growR: 180, fadeBase: 20.0, fadeK: 0.00322362 },
    FireDudeOverchargedProjectile: { fit: 2, flags: 8, maxRange: 2500, growR: 180, fadeBase: 20.0, fadeK: 0.00322362 },
    FireDudeUltiProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    FireDudeOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2200, speedMul: 1.2 },
    ArcadeStarPowerProjectileSelf: { fit: 8, flags: 16 },
    ArcadeStarPowerProjectileAllies: { fit: 8, flags: 16 },
    BeeSniperCirclingProjectile: { fit: 0, flags: 1 },
    RocketGirlGadgetProjectile: { fit: 3, maxRange: 3000 },
    GunslingerBigProjectile: { fit: 4 },
    IceDudeUltiProjectile: { fit: 8, flags: 5, maxRange: 2300 },
    IceDudeOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2300, speedMul: 1.2 },
    IceDudeProjectile: { fit: 7, maxRange: 2800 },
    SnakeOilProjectile: { fit: 1, maxRange: 3000 },
    SnakeOilUltiProjectile: { fit: 3, flags: 1, maxRange: 2200 },
    SnakeOilHyperUltiProjectile: { fit: 3, flags: 1, chargedRange: 2200 },
    SnakeOilHyperExplodedProjectile: { fit: 3 },
    EnragerProjectile: { fit: 0, maxRange: 600 },
    EnragerOverchargedLongRangeProjectile: { fit: 0, maxRange: 600 },
    RuffsProjectile: { fit: 7, flags: 2, reachAdj: 500, maxRange: 2700 },
    RuffsUltiProjectile: { fit: 8, flags: 5, maxRange: 2300 },
    RuffsOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2300, speedMul: 1.2 },
    GeneHomingProjectile: { fit: 7, flags: 16 },
    GeneHomingNanoProjectile: { fit: 7, flags: 16 },
    NaniBounceProjectile: { fit: 8, flags: 21 },
    NaniBounceProjectileSmall: { fit: 8, flags: 21 },
    RollerProjectile: { fit: 3, maxRange: 2300 },
    RollerOverchargedProjectile: { fit: 3, chargedRange: 2300, speedMul: 1.2 },
    ElectroSniperProjectile: { fit: 1, maxRange: 3000 },
    ElectroSniperSecondaryProjectile_001: { fit: 4 },
    ElectroSniperUltiProjectile: { fit: 3, maxRange: 3200 },
    ElectroSniperOverchargedUltiProjectile: { fit: 3, chargedRange: 3200 },
    StickyBombProjectile: { fit: 7, maxRange: 2300 },
    StickyBombUltiProjectile: { fit: 8, flags: 5, maxRange: 2500 },
    StickyBombUltiProjectile2: { fit: 4 },
    CrossBomberProjectile: { fit: 8, flags: 5, maxRange: 2300 },
    CrossBomberProjectile2: { fit: 5 },
    CrossBomberUltiProjectile: { fit: 8, flags: 5, maxRange: 2500 },
    CrossBomberUltiProjectile2: { fit: 0 },
    OverchargedCrossBomberUltiProjectile: { fit: 8, flags: 5, chargedRange: 2500, speedMul: 1.2 },
    OverchargedCrossBomberUltiProjectile2: { fit: 0 },
    RopeDudeUltiProjectile: { fit: 3, maxRange: 3000 },
    RopeDudeOverchargedUltiProjectile: { fit: 3, chargedRange: 3000, speedMul: 1.2 },
    RopeDudeProjectile: { fit: 0, maxRange: 800 },
    AssaultShotgunProjectile: { fit: 7, maxRange: 2500 },
    AssaultShotgunProjectileSp1Buddy: { fit: 7, maxRange: 2500 },
    AssaultShotgunOverchargedProjectile: { fit: 7, maxRange: 2500 },
    AssaultShotgunOverchargedProjectileSp1Buddy: { fit: 7, maxRange: 2500 },
    AssaultShotgunUltiProjectile: { fit: 3, flags: 10, maxRange: 2700, growR: 75, fadeBase: 120.0, fadeK: 0.000575417 },
    AssaultShotgunUltiProjectile2: { fit: 3, flags: 2 },
    AssaultShotgunGadgetProjectile: { fit: 8, maxRange: 2200 },
    AssaultShotgunGadgetProjectile2: { fit: 8, flags: 1 },
    AssaultShotgunGadgetProjectileBuddy: { fit: 8, maxRange: 2200 },
    AssaultShotgunOverchargedUltiProjectile: { fit: 3, flags: 10, chargedRange: 2700, growR: 75, speedMul: 1.2, fadeBase: 120.0, fadeK: 0.000485508 },
    AssaultShotgunOverchargedUltiProjectile2: { fit: 3, flags: 2 },
    AssaultShotgunOverchargedUltiProjectile3: { fit: 3, flags: 2 },
    HoldBallResetTrail: { fit: 7 },
    RollerGadgetProjectile: { fit: 5 },
    KnightProjectile1: { fit: 2, maxRange: 1400 },
    KnightProjectile2: { fit: 2 },
    KnightProjectile3: { fit: 2 },
    KnightUltiProjectile: { fit: 2, maxRange: 1500 },
    KnightOverchargedUltiProjectile: { fit: 8, chargedRange: 1500, speedMul: 1.2 },
    MechaDudeProjectile: { fit: 3, maxRange: 2700 },
    MechaDudeBigProjectile: { fit: 4, maxRange: 2200 },
    DuplicatorProjectile: { fit: 1, maxRange: 2700 },
    DuplicatorUltiProjectile: { fit: 3, flags: 1, maxRange: 1500 },
    OverchargedDuplicatorUltiProjectile: { fit: 3, flags: 1, chargedRange: 1500 },
    OverchargedDuplicatorProjectile: { fit: 1, maxRange: 2700 },
    KickerDudeProjectile: { fit: 0, flags: 8, maxRange: 800, growR: 150, fadeBase: 150.0, fadeK: 0.00277259 },
    KickerDudeProjectile2: { fit: 8, maxRange: 2200 },
    KickerDudeMinesProjectile: { fit: 8, flags: 5 },
    FleaUltiProjectile: { fit: 8, maxRange: 1500 },
    FleaSpawnProjectile: { fit: 8 },
    FleaOverchargedSpawnProjectile: { fit: 8, chargedRange: 1500, speedMul: 1.2 },
    FleaProjectile1: { fit: 4, maxRange: 2800 },
    FleaProjectile2: { fit: 3, maxRange: 2800 },
    FleaProjectile3: { fit: 2, maxRange: 2800 },
    FleaProjectileNano4: { fit: 0 },
    PercenterLifestealProjectile: { fit: 3, maxRange: 2500 },
    BaseballStickyProjectile: { fit: 0, flags: 2 },
    MummyAcidProjectile: { fit: 2, flags: 8, growR: 180, fadeBase: 70.0, fadeK: 0.00127297 },
    ElectroSniperBounceProjectile: { fit: 4 },
    JetpackGirlUltiProjectile: { fit: 8, flags: 5, maxRange: 700 },
    JetpackGirlOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 700, speedMul: 1.2 },
    JetpackGirlProjectile: { fit: 4, flags: 8, maxRange: 1200, growR: 50, fadeBase: 50.0, fadeK: 0.00210832 },
    CannonGirlProjectile: { fit: 1, maxRange: 2700 },
    CannonGirlSmallProjectile: { fit: 3, maxRange: 1500 },
    CannonGirlChainProjectile: { fit: 4 },
    CannonGirlExplosionProjectileOvercharged: { fit: 1, flags: 1 },
    FireDudeCirclingProjectile: { fit: 2 },
    SilencerProjectile: { fit: 4, maxRange: 2700 },
    SilencerBigProjectile: { fit: 2 },
    SilencerUltiProjectile: { fit: 2, maxRange: 2700 },
    SilencerOverchargedUltiProjectile: { fit: 2, chargedRange: 2700, speedMul: 1.2 },
    WeaponThrowerProjectile: { fit: 3, maxRange: 900 },
    WeaponThrowerProjectile2: { fit: 3, flags: 8, maxRange: 900, growR: 120, fadeBase: 30.0, fadeK: 0.00583153 },
    WeaponThrowerUltiProjectile: { fit: 0, maxRange: 2600 },
    WeaponThrowerUltiProjectile2: { fit: 4, flags: 16, maxRange: 2600 },
    WeaponThrowerOverchargedUltiProjectile: { fit: 0, chargedRange: 2600, speedMul: 1.2 },
    WeaponThrowerOverchargedUltiProjectile2: { fit: 4, flags: 16, chargedRange: 2600 },
    SoulCollectorProjectile: { fit: 5, maxRange: 2800 },
    SoulCollectorUltiProjectile: { fit: 3, flags: 1, maxRange: 2800 },
    ShieldTankProjectile: { fit: 0, maxRange: 1600 },
    ShieldTankUltiProjectile: { fit: 7, maxRange: 20000 },
    ShieldTankOverchargedUltiProjectile: { fit: 7, chargedRange: 20000, speedMul: 1.2 },
    JesterProjectile: { fit: 4, maxRange: 2500 },
    JesterUltiProjectileExploding: { fit: 8, flags: 5, maxRange: 1900 },
    JesterUltiProjectileStunning: { fit: 3, maxRange: 2600 },
    JesterUltiProjectilePoisoning: { fit: 2, flags: 8, maxRange: 1700, growR: 180, fadeBase: 70.0, fadeK: 0.00149761 },
    ChesterOverchargedUltiProjectilePoisoning: { fit: 2, flags: 8, growR: 180, fadeBase: 70.0, fadeK: 0.00127297 },
    JesterProjectileSP: { fit: 4, maxRange: 2500 },
    DoorManProjectile: { fit: 7, maxRange: 3300 },
    DoorManCaneGadgetProjectile: { fit: 8, maxRange: 3000 },
    DoorManCaneGadgetProjectile2: { fit: 2 },
    BeamerProjectile: { fit: 6, maxRange: 2700, chargedRange: 3900, speedMul: 1.15 },
    BeamerUltiProjectile: { fit: 0, maxRange: 12000 },
    SplitterProjectile: { fit: 1, maxRange: 3000 },
    SplitterCirclingProjectile: { fit: 4 },
    PuppeteerProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    PuppeteerUltiProjectile: { fit: 3, maxRange: 2500 },
    OverchargedPuppeteerUltiProjectile: { fit: 3, chargedRange: 2500, speedMul: 1.2 },
    MaisieProjectile: { fit: 1, flags: 10, reachAdj: 900, maxRange: 2600, fadeBase: 786.63, fadeK: 0.001231 },
    MaisieOverchargedProjectile: { fit: 4 },
    FishTankUltiProjectile: { fit: 3 },
    FishTankUltiProjectileSmall: { fit: 3 },
    DuelistProjectile: { fit: 4, maxRange: 1600 },
    DuelistUltiProjectile: { fit: 2, maxRange: 2700 },
    DuelistOverchargedUltiProjectile: { fit: 2, chargedRange: 2700, speedMul: 1.2 },
    DuelistSilenceProjectile: { fit: 2 },
    ReviverUltiProjectile: { fit: 2, flags: 16, maxRange: 2800 },
    ReviverOverchargedUltiProjectile: { fit: 2, flags: 16, chargedRange: 2800, speedMul: 1.2 },
    CookerProjectile: { fit: 1, reachAdj: -450, maxRange: 2700 },
    ConductorProjectile: { fit: 2, flags: 8, maxRange: 1800, growR: 160, fadeBase: 40.0, fadeK: 0.00241416 },
    ConductorOverchargedProjectile: { fit: 2, flags: 8, maxRange: 1800, growR: 160, fadeBase: 40.0, fadeK: 0.00241416 },
    ConductorUltiProjectile: { fit: 8, maxRange: 3000 },
    CocoonerProjectile: { fit: 1, reachAdj: -150, maxRange: 2700, growR: 150 },
    CocoonerProjectile2: { fit: 1, flags: 16, growR: 150 },
    CocoonerUltiProjectile: { fit: 3, flags: 1, maxRange: 2700 },
    CocoonerOverchargedUltiProjectile: { fit: 3, flags: 1, chargedRange: 2700 },
    MechanicOverchargedTurretElecProj: { fit: 8 },
    MechanicOverchargedTurretElecProj2: { fit: 8 },
    MechanicOverchargedTurretElecProj3: { fit: 8 },
    CrowOverchargedUltiProjectile: { fit: 7, flags: 2 },
    CrowOverchargedUltiProjectile2: { fit: 7, flags: 2 },
    LeaperShotgunProjectile: { fit: 8 },
    TwinsThrowerProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    TwinsShotgunProjectile: { fit: 8, maxRange: 2000 },
    TwinsUltiProjectile: { fit: 8, maxRange: 1500 },
    TwinsHCUltiProjectile: { fit: 8, maxRange: 1500, chargedRange: 1500 },
    AttacherProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    AttacherProjectileOvercharged: { fit: 8, flags: 5, maxRange: 3000 },
    AxeJugglerProjectile: { fit: 3, reachAdj: 200, maxRange: 2400 },
    AxeJugglerProjectile2: { fit: 1 },
    AxeJugglerOverchargedProjectile2: { fit: 1 },
    MosquitoProjectile: { fit: 7, maxRange: 3000 },
    MosquitoProjectilePoison: { fit: 1, maxRange: 3000 },
    SandstormOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2200, speedMul: 1.2 },
    ClusterBombOverchargedSummonProjectile: { fit: 8, chargedRange: 1000, speedMul: 1.2 },
    RocketGirlUltiOverchargedProjectile: { fit: 2, chargedRange: 2500, growR: 280 },
    SpeedyOverchargedProjectile: { fit: 7 },
    HookUltiOverchargedProjectile: { fit: 2, chargedRange: 2300, speedMul: 1.2 },
    HookUltiOverchargedProjectile2: { fit: 2 },
    ElectroSniperMutantProjectile: { fit: 1 },
    DragonRiderProjectile: { fit: 2, maxRange: 1200 },
    DragonRiderDragonProjectile: { fit: 0, flags: 8, maxRange: 1700, growR: 225, fadeBase: 25.0, fadeK: 0.00474062 },
    DragonRiderDragonOverchargedProjectile: { fit: 0, flags: 8, chargedRange: 1700, growR: 225, fadeBase: 25.0, fadeK: 0.00230259 },
    AmbusherProjectile: { fit: 2, maxRange: 600 },
    AmbusherUltiProjectile: { fit: 1, maxRange: 2700 },
    AmbusherUltiProjectile2: { fit: 1, maxRange: 2700, chargedRange: 2700 },
    AmbusherOverchargedUltiProjectile: { fit: 1, chargedRange: 2700 },
    GodzillaUltiProjectile: { fit: 7 },
    GodzillaClawsProjectile: { fit: 0 },
    BlowerUltiOverchargedProjectile: { fit: 3, chargedRange: 3000, speedMul: 1.2 },
    BarkeepOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2800, speedMul: 1.2 },
    HammerDudeOverchargedUltiProjectile: { fit: 0, chargedRange: 4000, speedMul: 1.2 },
    PainterProjectile: { fit: 8, flags: 5, maxRange: 1900 },
    PainterUltiProjectile: { fit: 0, flags: 8, growR: 450, fadeBase: 50.0, fadeK: 0.00230259 },
    CrabProjectile: { fit: 1, maxRange: 2300 },
    CrabUltiProjectile: { fit: 3, maxRange: 2500 },
    CrabOverchargedUltiProjectile: { fit: 3, chargedRange: 2500 },
    CrabOverchargedUltiReturnProjectile: { fit: 3 },
    MummyOverchargedProjectile: { fit: 2, flags: 8, growR: 180, fadeBase: 70.0, fadeK: 0.00127297 },
    SupportArchetypeProjectile: { fit: 8, flags: 5 },
    ArtilleryArchetypeCollabClusterProjectile: { fit: 4 },
    ControllerArchetypeCollabProjectileLvl1: { fit: 5 },
    ControllerArchetypeCollabProjectileLvl2: { fit: 5 },
    ControllerArchetypeCollabProjectileLvl3: { fit: 5 },
    DamageDealerArchetypeCollabProjectileLvl1: { fit: 7 },
    DamageDealerArchetypeCollabProjectileLvl3: { fit: 7, flags: 2 },
    DamageDealerArchetypeCollabProjectileLvl3Return: { fit: 7, flags: 2 },
    DiggerProjectile: { fit: 3, maxRange: 1500 },
    DiggerProjectileBounce: { fit: 3 },
    DiggerProjectileBounceSP: { fit: 3 },
    DiggerProjectileShrapnel: { fit: 4 },
    SamuraiUltiProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    SamuraiOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2200, speedMul: 1.2 },
    StickyBombOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2500, speedMul: 1.2 },
    StickyBombOverchargedUltiProjectileBounce: { fit: 8 },
    StickyBombOverchargedUltiProjectile2: { fit: 4 },
    BlackHoleOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 2000, speedMul: 1.2 },
    DiggerDrillProjectile: { fit: 2, maxRange: 500 },
    DiggerDrillOverchargedProjectile: { fit: 2, chargedRange: 500, speedMul: 1.2 },
    DemonicSoulCollectorProjectile: { fit: 4, flags: 16 },
    WrathOfAnAngelProjectile: { fit: 3 },
    ArcadeOverchargedTurretProjectile: { fit: 7 },
    VoodooUltiProjectile: { fit: 8, maxRange: 1500 },
    VoodooOverchargedUltiProjectile: { fit: 8, chargedRange: 1500, speedMul: 1.2 },
    VoodooPetProjectile: { fit: 4 },
    VoodooPetOverchargedProjectile: { fit: 4 },
    DemonicPowerProjectile: { fit: 8, flags: 5 },
    VoodooProjectileEarth: { fit: 8, flags: 5, maxRange: 1900 },
    VoodooProjectileForest: { fit: 8, flags: 5, maxRange: 2700 },
    VoodooProjectileWater: { fit: 8, flags: 5, maxRange: 1900 },
    VoodooPetSlowProjectile: { fit: 4 },
    VoodooOverchargedPetSlowProjectile: { fit: 0 },
    VoodooProjectileAll: { fit: 8, flags: 5, maxRange: 2700 },
    LightyearLaserProjectile: { fit: 4, maxRange: 2700 },
    LightyearLaserUltiProjectile: { fit: 4, maxRange: 2500 },
    LightyearFlightProjectile: { fit: 4, maxRange: 2000 },
    LightyearFlightUltiProjectile: { fit: 8, flags: 5, maxRange: 2700 },
    MeepleProjectile: { fit: 5, reachAdj: 200, maxRange: 2300, growR: 150 },
    MeepleUltiProjectile: { fit: 3, flags: 1, maxRange: 1500 },
    MeepleOverchargedUltiProjectile: { fit: 3, flags: 1, chargedRange: 1500 },
    MeepleWallProjectile: { fit: -1, flags: 4, maxRange: 2300 },
    SkaterProjectile: { fit: 4, maxRange: 1900 },
    SkaterProjectileTaunt: { fit: 4 },
    hankOverchargedUltiProjectile: { fit: 4, flags: 16 },
    BeameOverchargedUltiProjectile: { fit: 0, maxRange: 12000 },
    BeaOverchargedUltiProjectile: { fit: 3, chargedRange: 2700, speedMul: 1.2 },
    BeaOverchargedUltiProjectile2: { fit: 4 },
    BowDudeSpawnOverchargedMineProjectile: { fit: -1, flags: 4, chargedRange: 2600 },
    MinigunDudeOverchargedUltiProjectile: { fit: 8, flags: 5, chargedRange: 1500, speedMul: 1.2 },
    SpawnerDudeOverchargedUltiProjectile: { fit: 3, flags: 1, chargedRange: 1500 },
    ChesterOverchargedUltiProjectile: { fit: 8, flags: 5, maxRange: 1900 },
    MorningstarProjectile: { fit: -1, maxRange: 2400, growR: 150 },
    MorningstarProjectileRecall: { fit: -1, flags: 16, growR: 150 },
    MorningstarProjectileRecallFrozenSP: { fit: 1, flags: 16 },
    MorningstarUltiProjectile1: { fit: 8, flags: 1, maxRange: 2200 },
    MorningstarUltiProjectile2: { fit: 8, flags: 1, maxRange: 2200 },
    MorningstarUltiProjectile3: { fit: 8, flags: 1, maxRange: 2200 },
    MorningstarUltiProjectileOvercharged1: { fit: 8, flags: 1 },
    MorningstarUltiProjectileOvercharged2: { fit: 8, flags: 1 },
    MorningstarUltiProjectileOvercharged3: { fit: 8, flags: 1 },
    ChronomancerProjectile: { fit: 4, maxRange: 4500 },
    ChronomancerProjectileSecondary: { fit: 7, maxRange: 4500 },
    ChronomancerUltiProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    ChronomancerUltiHyperProjectile: { fit: 8, flags: 5, chargedRange: 2200, speedMul: 1.2 },
    ChronomancerProjectileStasis: { fit: 4 },
    ChronomancerProjectileStasisSecondary: { fit: 7 },
    GusOverchargedUltiProjectile: { fit: 2, chargedRange: 2800, speedMul: 1.2 },
    GusOverchargedAreaEffectProjectile: { fit: 3 },
    MtowerProjectile: { fit: 4, flags: 16 },
    ArenaXPProjectile: { fit: 7, flags: 16 },
    MobaKaijuProjectile: { fit: 4, flags: 16 },
    MobaBigKaijuProjectile: { fit: 4, flags: 16 },
    AlternatorHealProjectile: { fit: 8, maxRange: 2500 },
    AlternatorSpeedProjectile: { fit: 0, maxRange: 2500 },
    AlternatorDamageProjectile: { fit: 8, maxRange: 2500 },
    AlternatorSlowProjectile: { fit: 0, maxRange: 2500 },
    GeishaUltiProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    GeishaUltiProjectileOvercharged: { fit: 8, flags: 5, chargedRange: 2200, speedMul: 1.2 },
    GeishaTransformedProjectile: { fit: 4, maxRange: 2000 },
    SpawnerDudeMutantProjectile: { fit: 1 },
    ArenaBaseProjectile: { fit: 2, flags: 8, growR: 100, fadeBase: 100.0, fadeK: 0.000693147 },
    MegaKenjiProjectileSlowBounce: { fit: 8, flags: 2, maxRange: 10000 },
    MegaKenjiProjectileSpawnRobot: { fit: 8, maxRange: 3000 },
    MegaKenjiProjectileFast360: { fit: 8 },
    MegaKenjiProjectileDeath: { fit: 8, maxRange: 3000 },
    SamuraiRangedEnemyProjectile: { fit: 4 },
    BaseballOverchargedUltiProjectileSticky: { fit: 0, flags: 2 },
    BaseballOverchargedUltiProjectileStickyChain: { fit: 0, flags: 2 },
    AngelicProjectile: { fit: 4 },
    DemonicProjectile: { fit: 4 },
    DemonicProjectileBoomerang: { fit: 4, flags: 2 },
    BrawlersMagnetProjectile1_lvl1: { fit: 2, maxRange: 1800 },
    BrawlersMagnetProjectile2_lvl1: { fit: 2 },
    BrawlersMagnetProjectile1_lvl3: { fit: 2, maxRange: 1800 },
    BrawlersMagnetProjectile2_lvl3: { fit: 2 },
    SignalStrikeProjectile: { fit: 0, maxRange: 3000 },
    SignalStrikeProjectile_lvl3: { fit: 0, maxRange: 3000 },
    EndOfLineProjectile: { fit: 8, flags: 5, maxRange: 2300 },
    BoomBoxProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    BoomBoxProjectile_lvl2: { fit: 8, flags: 5, maxRange: 2200 },
    BoomBoxProjectile_lvl3: { fit: 8, flags: 5, maxRange: 2200 },
    HookTimeProjectile_lvl1: { fit: 3, maxRange: 3000 },
    HookTimeProjectile_lvl3: { fit: 3, maxRange: 3000 },
    JetpackProjectileDamage: { fit: 2, flags: 5, maxRange: 700 },
    JetpackProjectileDamageAndSlow: { fit: 2, flags: 5, maxRange: 700 },
    EndOfLineProjectile_lvl3: { fit: 8, flags: 5, maxRange: 2300 },
    DancerProjectileSingle: { fit: 8, maxRange: 2400 },
    DancerProjectileDouble: { fit: 8, maxRange: 1800 },
    DancerProjectileTriple: { fit: 8, maxRange: 1400 },
    DancerProjectileUlti: { fit: 0, maxRange: 2100 },
    DancerOverchargedProjectileUlti: { fit: 0, flags: 2, reachAdj: 1500, maxRange: 2100 },
    FuryProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    FuryProjectileCrit: { fit: 8, flags: 5, maxRange: 2200 },
    FuryUltiProjectile: { fit: 0, maxRange: 4000 },
    FuryOverchargedUltiProjectile: { fit: 0, flags: 2, chargedRange: 4000, speedMul: 1.2 },
    FuryOverchargedUltiProjectileReturn: { fit: 0, flags: 2 },
    MegaBossCrowProjectile: { fit: 7, maxRange: 4000 },
    MegaBossCactusProjectile: { fit: 2, maxRange: 3000 },
    MegaBossCactusFrag: { fit: 7 },
    MegaBossCactusUltiProjectile: { fit: 8, flags: 5, maxRange: 2500 },
    MegaBossCactusPushAwayFrag: { fit: 7 },
    MegaBossCactusProjectileSecond: { fit: 2, maxRange: 3000 },
    MegaTickProjectile: { fit: 8, flags: 5, maxRange: 1500 },
    MegaTickSummonProjectile: { fit: 8, maxRange: 1500 },
    MegaTickSummonProjectileMid: { fit: 8, maxRange: 1500 },
    MegaTickSummonProjectileLarge: { fit: 8, maxRange: 2500 },
    MegaTickSecondProjectile: { fit: 8, flags: 5, maxRange: 3000 },
    MegaBossTrickshotDudeProjectile: { fit: 7, flags: 2, reachAdj: 1500, maxRange: 2500 },
    MegaBossTrickshotDudeUltiProjectile: { fit: 7, flags: 2, reachAdj: 1500, maxRange: 2500 },
    MegaBossTrickshotDudeProjectileLarge: { fit: 3, flags: 2, reachAdj: 1500, maxRange: 2500 },
    MegaBossTrickshotDudeProjectileLargeExtra: { fit: 0, flags: 2, reachAdj: 1500, maxRange: 4000 },
    MegaBossCrowJumpProjectile: { fit: 7 },
    MegaBossCrowSwampProjectile: { fit: 8, flags: 5 },
    MegaBossCrowSwampProjectileLarge: { fit: 8, flags: 5, maxRange: 5000 },
    MegaBossCrowJumpProjectileChain: { fit: 4, flags: 2 },
    MegaBossSplitterProjectileSlow: { fit: 7 },
    MegaBossSplitterProjectile: { fit: 7, maxRange: 3000 },
    MegaBossSplitterProjectilePierce: { fit: 3, flags: 2, reachAdj: 1500, maxRange: 20000 },
    MegaBossSplitterSpawnRobotsThrow: { fit: 8, maxRange: 6000 },
    MegaBossSplitterSpawnRobotsShoot: { fit: 8, maxRange: 6000 },
    MegaBossTwinsThrowerProjectile: { fit: 8, flags: 5 },
    MegaBossTwinsShotgunProjectile: { fit: 8 },
    MegaKenjiProjectileSpawnKenji: { fit: 8, flags: 5, maxRange: 3000 },
    MegaBossSpikeSummonPet: { fit: 8, maxRange: 6000 },
    MegaBossCactusPetShoot: { fit: 7 },
    MegaSamuraiRangedEnemyProjectile: { fit: 4 },
    ActorPlaceholderProjectile: { fit: 7, maxRange: 2400 },
    BulletstormProjectile: { fit: 4, maxRange: 3000 },
    BulletstormLastShotProjectile: { fit: 1, maxRange: 3000 },
    BulletstormUltiProjectile: { fit: 8, flags: 5, maxRange: 2500 },
    BulletstormUltiOverchargedProjectile: { fit: 8, flags: 5, chargedRange: 2500, speedMul: 1.2 },
    BulletstormShellProjectile: { fit: 8 },
    BulletstormOnShellPickedUpProjectile: { fit: 5, maxRange: 3300 },
    BulletstormUltiMarkedProjectile: { fit: 7, flags: 16 },
    BulletstormUltiOverchargedMarkedProjectile: { fit: 7, flags: 16 },
    MegaBossDgProjectile: { fit: 8, maxRange: 1000 },
    MegaBossDgSpawn: { fit: 8, flags: 5, maxRange: 3000 },
    MegaBossDgSpawnProjectile: { fit: 8 },
    MegaBossVecProjectileDropClock: { fit: 8, flags: 5 },
    MegaBossVecProjectileLong: { fit: 8 },
    MegaBossVecProjectileFreeze: { fit: 8, flags: 5, maxRange: 3000 },
    RogueliteCirclingProjectileClose: { fit: 2 },
    RogueliteCirclingProjectileFar: { fit: 2 },
    RogueliteCirclingProjectile3: { fit: 2 },
    EnragerPullProjectile: { fit: 3, maxRange: 2000 },
    EnragerPullProjectileBuddy: { fit: 3, maxRange: 2000 },
    MegaBossFrankProjectile: { fit: 3, maxRange: 3500 },
    MegaBossFrankUltiProjectile: { fit: 2, maxRange: 4000 },
    MegaBossFrankSpawnAdd: { fit: 8, flags: 5, maxRange: 3000 },
    MegaBossFrankGroundSpikeProjectile: { fit: 8, flags: 5, maxRange: 3000 },
    RogueliteLCardSqueakProjectile2: { fit: 4 },
    MegaBossVecProjectileRockExplosion: { fit: 8, flags: 5, maxRange: 1500 },
    MegaBossVecProjectileRockExplosionProjectiles: { fit: 7 },
    MegaBossVecProjectileBlackholeDistance: { fit: 8, flags: 5, maxRange: 1500 },
    MegaBossVecAttackSlowProjectile: { fit: 0, maxRange: 5500 },
    MegaBossVecTeleport: { fit: 2, maxRange: 5000 },
    MegaBossFrankCreateDemon: { fit: 8 },
    ShellyOverchargedProjectile: { fit: 8, maxRange: 2300, chargedRange: 2300 },
    SpikeOverchargedProjectile: { fit: 3, maxRange: 2300, chargedRange: 2300 },
    SpikeOverchargedFrag: { fit: 7 },
    GunslingerOverchargedProjectile: { fit: 7, maxRange: 2700, chargedRange: 2700 },
    MenderProjectile: { fit: 3, maxRange: 2200 },
    MenderUltiProjectile: { fit: 0, maxRange: 1700 },
    MenderUltiOverchargedProjectile: { fit: 0, chargedRange: 1700, speedMul: 1.2 },
    ShadowdemonProjectileDirect: { fit: 7, maxRange: 2200 },
    ShadowdemonProjectileIndirect: { fit: 8, flags: 5, maxRange: 2200 },
    ShadowdemonUltiProjectile: { fit: 8, flags: 5, maxRange: 3000 },
    ShadowdemonCloneBulletProjectile: { fit: 7, maxRange: 2700 },
    HammerDudeWeaponOverchargedProjectile: { fit: 3, maxRange: 1800, chargedRange: 1800 },
    MummyWeaponOverchargedProjectile: { fit: 0, flags: 8, maxRange: 2000, chargedRange: 2000, growR: 225, fadeBase: 87.5, fadeK: 0.000954724 },
    CactusBonusSkillCoverProjectile: { fit: 8, maxRange: 2200 },
    CactusBonusSkillCoverProjectileBuddy: { fit: 8, maxRange: 2200 },
    CactusSpikeGadgetBuddy: { fit: 7, maxRange: 2300 },
    ShotgunGirlProjectileGadgetSkill: { fit: 8, maxRange: 3000 },
    GunslingerDoubleShotProjectile: { fit: 4, maxRange: 3300 },
    GunslingerDoubleShotProjectileBuddy: { fit: 4, maxRange: 3300 },
    GunslingerSilverBulletProjectileBuddy: { fit: 5, maxRange: 3300 },
    GunslingerSilverBulletProjectile: { fit: 4, maxRange: 3300 },
    DummyProjectileForLoveBomb: { fit: 8, flags: 5, maxRange: 2400 },
    MummyGadgetSkillAcidSprayProjectile: { fit: 2, flags: 8, maxRange: 2000, growR: 180, fadeBase: 70.0, fadeK: 0.000954724 },
    MummyGadgetSkillAcidSprayProjectileBuddy: { fit: 2, flags: 8, maxRange: 2000, growR: 180, fadeBase: 70.0, fadeK: 0.000954724 },
    MummyGadgetSkillFriendzonerProjectile: { fit: 7, maxRange: 1200 },
    MummyGadgetSkillFriendzonerProjectileBuddy: { fit: 7, maxRange: 1200 },
    HammerDudeGadgetSkillNoiseCancelBuddyProjectile: { fit: 3, maxRange: 1800 },
    HammerDudeGadgetSkillAttractionBuddyProjectile: { fit: 3, maxRange: 2200 },
    HammerDudeGadgetSkillNoiseCancelProjectile: { fit: 3, maxRange: 1800 },
    HammerDudeGadgetSkillAttractionProjectile: { fit: 3, maxRange: 2200 },
    UndertakerGadgetSkillComboSpinnerProjectile: { fit: 8, maxRange: 800 },
    UndertakerGadgetSkillComboSpinnerProjectileBuddy: { fit: 8, maxRange: 800 },
    MegaBossStickyBombProjectile: { fit: 3, maxRange: 3500 },
    MegaBossStickyBombUltiProjectile: { fit: 8, flags: 5, maxRange: 3000 },
    MegaBossStickyBombOverchargedUltiProjectile: { fit: 8, flags: 5, maxRange: 3000 },
    MegaBossStickyBombOverchargedUltiProjectileBounce1: { fit: 8 },
    MegaBossStickyBombOverchargedUltiProjectileBounce2: { fit: 8 },
    MegaBossStickyBombOverchargedUltiProjectileBounce3: { fit: 8 },
    MegaBossStickyBombOverchargedUltiProjectileBounce4: { fit: 8 },
    MegaBossStickyBombProjectileLarge: { fit: 2, maxRange: 5500 },
    MegaBossStickyBombUltiBulletExplodeProjectileLarge: { fit: 4 },
    MegaBossStickyBombUltiBulletExplodeProjectile: { fit: 4 },
    MegaBossMosquitoProjectile: { fit: 4, maxRange: 10000 },
    MegaBossMosquitoProjectileLarge: { fit: 1, flags: 2, reachAdj: 1500, maxRange: 10000 },
    UndertakerGadgetSkillBatsProjectile: { fit: 4, maxRange: 1500 },
    UndertakerGadgetSkillBatsProjectileBuddy: { fit: 4, maxRange: 1500 },
    MegaBossGhostProjectile: { fit: 4, flags: 2, reachAdj: 1500 },
    ShotgunGirlProjectileGadgetSkillBuddy: { fit: 8, maxRange: 3000 },
    MegaBossTrickshotDude2Projectile: { fit: 7, flags: 2, reachAdj: 1500, maxRange: 2500 },
    MegaBossTrickshotDude2UltiProjectile: { fit: 7, flags: 2, reachAdj: 1500, maxRange: 2500 },
    MegaBossTrickshotDude2ProjectileLarge: { fit: 3, flags: 2, reachAdj: 1500, maxRange: 2500 },
    MegaBossTrickshotDude2ProjectileLargeExtra: { fit: 0, flags: 2, reachAdj: 1500, maxRange: 4000 },
    RedirecterProjectile: { fit: 4, maxRange: 1800 },
    RedirecterProjectileSecondary: { fit: 7, maxRange: 2000 },
    RedirecterUltiProjectile: { fit: 8, flags: 5, maxRange: 1600 },
    RedirecterUltiProjectileOvercharged: { fit: 8, flags: 5, maxRange: 1600 },
    MegaBossMaisieProjectile: { fit: 4, maxRange: 4500 },
    MegaBossMaisieBigProjectile: { fit: 2, maxRange: 5500 },
    MegaBossMaisieCreateExplosion: { fit: 8, flags: 5, maxRange: 3500 },
    MegaBossMaisieExplosionProjectile: { fit: 4 },
    MegaBossShamanProjectile: { fit: 0, maxRange: 8000 },
    MegaBossShamanUltiProjectile: { fit: 8, maxRange: 4200 },
    MegaBossCrossBomberProjectile: { fit: 8, flags: 5, maxRange: 3200 },
    MegaBossCrossBomberSecondProjectile: { fit: 8, flags: 5, maxRange: 3200 },
    MegaBossCrossBomberProjectile2: { fit: 4 },
    MegaBossCrossBomberUltiProjectile: { fit: 8, flags: 5, maxRange: 3200 },
    MegaBossCrossBomberUltiProjectile2: { fit: 3 },
    MegaBossCrossBomberSummonPet: { fit: 8, maxRange: 3200 },
    MegaBossOverchargedCrossBomberUltiProjectile: { fit: 8, flags: 5, maxRange: 3200 },
    MegaBossOverchargedCrossBomberUltiProjectile2: { fit: 0 },
    MegaBossAssaultShotgunProjectileCoin: { fit: 7 },
    MegaBossAssaultShotgunProjectile: { fit: 7, maxRange: 5000 },
    MegaBossAssaultShotgunProjectileBig: { fit: 7, maxRange: 5000 },
    MegaBossAssaultShotgunProjectileExtraBig: { fit: 4 },
    MegaBossAssaultShotgunUltiProjectile: { fit: 2, flags: 10, maxRange: 3500, growR: 100, fadeBase: 160.0, fadeK: 0.000346791 },
    MegaBossAssaultShotgunUltiProjectile2: { fit: 2, flags: 2 },
    MegaBossAssaultShotgunOverchargedUltiProjectile: { fit: 1, flags: 10, maxRange: 5000, growR: 90, fadeBase: 144.0, fadeK: 0.000271884 },
    MegaBossAssaultShotgunOverchargedUltiProjectile2: { fit: 1, flags: 2 },
    MegaBossAssaultShotgunOverchargedUltiProjectile3: { fit: 1, flags: 2 },
    MegaBossAssaultShotgunGadgetProjectile: { fit: 0, flags: 5, maxRange: 800 },
    MegaBossAssaultShotgunBombExplosion: { fit: 1, flags: 5, maxRange: 2200 },
    BowDudeGadgetSkillProjectile: { fit: -1, maxRange: 2200 },
    BowDudeGadgetSkillProjectileBuddy: { fit: -1, maxRange: 2200 },
    BowDudeProjectileTripWire: { fit: 1, flags: 1 },
    BaseballGadgetSkillStickyProjectile: { fit: 8, flags: 5, maxRange: 1700 },
    BaseballGadgetSkillStickyProjectileBuddy: { fit: 8, flags: 5, maxRange: 1700 },
    BullDudeOverchargedProjectile: { fit: 0, maxRange: 1400 },
    BullDudeGadgetSkillMarkEnemyProjectile: { fit: 0, maxRange: 1800 },
    NinjaBonusSkillInvisibleAreaProjectile: { fit: 8, maxRange: 2200 },
    NinjaBonusSkillInvisibleAreaProjectileBuddy: { fit: 8, maxRange: 2200 },
    MegaBossDragonCrowProjectile: { fit: 7 },
    MegaBossDragonCrowUltiProjectile: { fit: 7 },
    MegaBossDragonCrowBoomrangProjectile: { fit: 7, flags: 2, maxRange: 3000 },
    MegaBossDragonCrowBoomrangProjectile2: { fit: 7, flags: 2 },
    MegaBossDragonFireProjectile: { fit: 3, flags: 8, maxRange: 4200, growR: 105, fadeBase: 45.0, fadeK: 0.000487322 },
    MegaBossDragonFireAreaExplosionProjectile: { fit: 8, flags: 5, maxRange: 3500 },
    MegaBossDragonCrowSummon: { fit: 8, maxRange: 2500 },
    MegaBossDragonCirclingProjectile: { fit: 7 },
    BullDudeGadgetSkillMarkEnemyProjectileBuddy: { fit: 0, maxRange: 1800 },
    LeonDefOverchargedProjectile: { fit: 4, maxRange: 2900 },
    BowDudeOverchargedProjectile: { fit: 5, maxRange: 2600 },
    MegaBossMaisieSummonTurret: { fit: 8, maxRange: 3500 },
    MegaBossMaisieTurretProjectile: { fit: 7 },
    BowDudeProjectileTripWireBuddy: { fit: 1, flags: 1 },
    SandstormModifierProjectile: { fit: 0 },
    MegaBossShamanBearUltiProjectile: { fit: 8, maxRange: 2500 },
    MegaBossDragonFireProjectileBig: { fit: 0, flags: 8, maxRange: 2400, growR: 157, fadeBase: 67.5, fadeK: 0.000702317 },
    GladiatorProjectile: { fit: 0, flags: 8, maxRange: 800, growR: 240, fadeBase: 60.0, fadeK: 0.010059 },
    GladiatorProjectileFire: { fit: 0, flags: 8, maxRange: 800, growR: 240, fadeBase: 60.0, fadeK: 0.010059 },
    GladiatorUltiProjectile: { fit: 8, flags: 5 },
    GladiatorOverchargedUltiProjectile: { fit: 8, flags: 5 },
    AssaultShotgunGadgetProjectileCoinShower: { fit: 8, flags: 5, maxRange: 2200 },
    AssaultShotgunGadgetProjectileCoinShowerBuddy: { fit: 8, flags: 5, maxRange: 2200 },
    SuperNovaCactusProjectile: { fit: 3, maxRange: 1100 },
    SuperNovaCactusUltiProjectile: { fit: 8, flags: 5, maxRange: 1700 },
    SuperNovaCactusSpikeChain: { fit: 7 },
    SuperNovaCactusSpike: { fit: 7 },
    SuperNovaCactusSpikeCurve: { fit: 7 },
    SuperNovaBeeSniperProjectile: { fit: 4, maxRange: 2800 },
    SuperNovaBeeSniperChargedProjectile: { fit: 2, maxRange: 4000 },
    SuperNovaBeeSniperUltiProjectile: { fit: 3, maxRange: 2000 },
    SuperNovaVoodooProjectileEarth: { fit: 7, flags: 5, maxRange: 1000 },
    SuperNovaVoodooProjectileEarthChain1: { fit: 7, flags: 5 },
    SuperNovaVoodooProjectileEarthChain2: { fit: 7, flags: 5 },
    SuperNovaVoodooProjectileForest: { fit: 7, flags: 5, maxRange: 1000 },
    SuperNovaVoodooProjectileForestChain1: { fit: 7, flags: 5 },
    SuperNovaVoodooProjectileForestChain2: { fit: 7, flags: 5 },
    SuperNovaVoodooProjectileWater: { fit: 7, flags: 5, maxRange: 1000 },
    SuperNovaVoodooProjectileWaterChain1: { fit: 7, flags: 5 },
    SuperNovaVoodooProjectileWaterChain2: { fit: 7, flags: 5 },
    SuperNovaVoodooUltiProjectile: { fit: 8, maxRange: 1500 },
    SuperNovaVoodooPetProjectile: { fit: 3, maxRange: 1600 },
    SuperNovaFireDudeProjectile: { fit: 2, flags: 8, maxRange: 1700, growR: 180, fadeBase: 20.0, fadeK: 0.00379249 },
    SuperNovaFireDudeUltiProjectile: { fit: 8, flags: 5, maxRange: 2600 },
    MagicalGirlProjectile: { fit: 0, maxRange: 1700 },
    MagicalGirlProjectile2: { fit: 0, maxRange: 1700 },
    MagicalGirlProjectileHealingSP: { fit: 0 },
    MagicalGirlProjectile2HealingSP: { fit: 0 },
    MagicalGirlBonusSkillFlyAreaProjectile: { fit: 8, maxRange: 2200 },
    MagicalGirlBonusSkillProjectileHealing: { fit: 0, maxRange: 2200 },
    MegaBossFinxTimebendProjectile: { fit: 8, flags: 5, maxRange: 3500 },
    MegaBossFinxTimeStopProjectile: { fit: 2 },
    MegaBossFinxProjectile: { fit: 4 },
    MegaBossFinxProjectileSecondary: { fit: 7 },
    MegaBossFinxTimeRiftProjectile: { fit: 0 },
    MegaBossFinxSpawnKittensProjectile: { fit: 8, flags: 5, maxRange: 3500 },
    MegaBossFinxReturnChronomancerProjectile: { fit: 4, maxRange: 5000 },
    MegaBossFinxReturnChronomancerProjectileSecondary: { fit: 7, maxRange: 5000 },
    GladiatorGadgetSkillProjectileAmp: { fit: 8, maxRange: 2200 },
    GladiatorGadgetSkillProjectileWall: { fit: 8, flags: 5, maxRange: 2200 },
    NanoPercenterProjectile: { fit: 3 },
    MegaBossFinxCreateKit: { fit: 8 },
    MegaBossPercenterProjectile: { fit: 3, maxRange: 3500 },
    MegaBossPercenterProjectileSmall: { fit: 4 },
    MegaBossPercenterThrowProjectile: { fit: 8, flags: 5, maxRange: 3000 },
    MegaBossPercenterProjectileLarge: { fit: 0, maxRange: 10000 },
    MegaBossPercenterSpawnTurrentProjectile: { fit: 8, maxRange: 4800 },
    MegaBossPercenterTurrentPetProjectile: { fit: 8, maxRange: 100 },
    KatanaKidProjectile: { fit: 3, maxRange: 800 },
    KatanaKidFullChargeProjectile: { fit: 3, maxRange: 800 },
    KatanaKidGadgetSkillFishNetProjectile: { fit: 5, maxRange: 2200 },
    FutureGirlProjectile: { fit: 0, maxRange: 2400 },
    FutureGirlUltiProjectile: { fit: 8, maxRange: 1500 },
    FutureGirlOverchargedUltiProjectile: { fit: 8, chargedRange: 1500, speedMul: 1.2 },
    FutureGirlTurretTetherProjectile: { fit: 8, flags: 16 },
    FutureGirlTurretTetherOverchargedProjectile: { fit: 8, flags: 16 },
    FutureGirlGadgetProjectile: { fit: 8, flags: 5, maxRange: 3000 },
    MegaBossBlackHoleProjectile: { fit: 4, flags: 2, maxRange: 5000 },
    MegaBossBlackHoleShieldPetProjectile: { fit: 4, flags: 16, maxRange: 2000 },
    MegaBossBlackHoleUltiShieldPetProjectile: { fit: 8, flags: 5, maxRange: 4500 },
    MegaBossBlackHoleUltiExplodingPetProjectile: { fit: 8, flags: 5, maxRange: 4500 },
    MegaBossBlackHoleExplosionPetProjectile: { fit: 4 },
    MechaDudeSendItProjectile: { fit: 2, maxRange: 2000 },
    MechaDudeSendItProjectileBuddy: { fit: 2, maxRange: 2200 },
    MegaBossBlackholeSpreadProjectile: { fit: 3, flags: 10, maxRange: 2700, growR: 75, fadeBase: 120.0, fadeK: 0.000314681 },
    MegaBossBlackholeSpreadProjectileReturn: { fit: 3, flags: 2 },
    MegaBossRocketGirlProjectileBasic: { fit: 4, maxRange: 4500 },
    MegaBossRocketGirlUltiProjectile: { fit: 8, flags: 5, maxRange: 4500 },
    MegaBossRocketGirlStreamProjectile: { fit: 7, maxRange: 4500 },
    MegaBossBlackHoleGravityWellProjectile: { fit: 8, flags: 5, maxRange: 4000 },
    MegaBossBlackHoleBoomerangWellProjectile: { fit: 8, flags: 2, maxRange: 4000 },
    MegaBossBlackHoleBoomerangWellChainProjectile: { fit: 7 },
    MegaBossRocketGirlMatryoshkaProjectile: { fit: 8, flags: 5, maxRange: 4000 },
    MegaBossRocketGirlRainProjectile: { fit: 8, flags: 5, maxRange: 4000 },
    MegaBossRocketGirlClusterProjectile: { fit: 7 },
    MechaDudeProjectileHyperCharged: { fit: 3, flags: 16, chargedRange: 2700 },
    MechaDudeBigProjectileHyperChargedBuddy: { fit: 4, chargedRange: 2200 },
    TrickShotGadgetSkillContainerProjectile: { fit: 8 },
    TrickshotDudeGadgetSkillSplitterShotProjectile: { fit: 3, maxRange: 2900 },
    TrickshotDudeGadgetSkillSplitterShotProjectile2: { fit: 4 },
    TrickShotGadgetSkillContainerProjectileBuddy: { fit: 8 },
    TrickshotDudeGadgetSkillSplitterShotProjectileBuddy: { fit: 3, maxRange: 2900 },
    TrickshotDudeProjectileBigBulletSplit: { fit: 4, flags: 2, reachAdj: 1500 },
    TrickshotDudeProjectileBigBulletSplitBuddy: { fit: 4, flags: 2, reachAdj: 1500 },
    TrickshotDudeGadgetSkillProjectile: { fit: 8, maxRange: 2200 },
    RocketGirlGadgetSkillMegaRocketProjectile: { fit: 3, maxRange: 2700 },
    RocketGirlGadgetSkillMegaRocketProjectileBuddy: { fit: 3, maxRange: 2700 },
    RocketGirlGadgetSplittingProjectile: { fit: 4 },
    RocketGirlProjectileSecondary: { fit: 7, maxRange: 2700 },
    RocketGirlProjectileSecondaryOvercharged: { fit: 7, chargedRange: 2700 },
    MegaKatanaKidHookProjectile: { fit: 0, maxRange: 5000 },
    MegaKatanaKidHookProjectile2: { fit: 0 },
    MegaKatanaKidProjectile: { fit: 0, maxRange: 4000 },
    MegaKatanaKidFishProjectile: { fit: 4, flags: 2, reachAdj: 600 },
    TrickshotDudeGadgetSkillProjectileBuddy: { fit: 8, maxRange: 2200 },
    TrickshotDudeProjectileOverchargeBuddy: { fit: 4, flags: 2, reachAdj: 1500, maxRange: 2900 },
    MechaVanMeleeNinjaStabProjectile: { fit: 0, maxRange: 600 },
    MechaVanSniperPiercingProjectile: { fit: 4, maxRange: 3000 },
    MechaVanSniperLongRangeProjectile: { fit: 0, maxRange: 12000 },
    MegaBossKatanaKidLobbedFishProjectile: { fit: 7, flags: 5 },
    RocketGirlProjectileOvercharged: { fit: 4, chargedRange: 2700, speedMul: 1.2 },
    StackerProjectile: { fit: 3, maxRange: 2500 },
    StackerUltiProjectile: { fit: 3, maxRange: 2700 },
    StackerCollectProjectile: { fit: 8, flags: 16 },
    StackerGadgetProjectile: { fit: 8, flags: 5, maxRange: 2800 },
    AttractorOrbiterProjectile: { fit: 3, flags: 8, growR: 112, fadeBase: 60.0, fadeK: 0.00105605 },
    AttractorOrbiterProjectile2: { fit: 3, flags: 8, growR: 112, fadeBase: 60.0, fadeK: 0.00105605 },
    AttractorOrbiterProjectile3: { fit: 3, flags: 8, growR: 112, fadeBase: 60.0, fadeK: 0.00105605 },
    AttractorCarrierProjectile: { fit: 4, maxRange: 2700 },
    AttractorSuperProjectileMagnet: { fit: 1, maxRange: 2800 },
    AttractorGadgetPushbackProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    AttractorGadgetGroundedProjectile: { fit: 8, flags: 5, maxRange: 2200 },
    PrimoDefOverchargedProjectile: { fit: 0, flags: 8, maxRange: 1000, chargedRange: 1000, growR: 240, fadeBase: 60.0, fadeK: 0.00524838 },
    SoulCollectorKnockbackSoulProjectile: { fit: 2, maxRange: 2000 },
    SoulCollectorOverchargedProjectile: { fit: 0, maxRange: 2800 },
    FireDudeBonusSkillSpillProjectile: { fit: 8, maxRange: 1500 },
    SoulCollectorKnockbackSoulProjectileBuddy: { fit: 2, maxRange: 2000 },
    MegaBossDuoAlphabetProjectile: { fit: 7, maxRange: 10000 },
    MegaBossDuoAlphabetProjectileBig: { fit: 5, maxRange: 10000 },
};

function kindOf(name)
{
    if (!name) return null;
    return KINDS[name] || null;
}

function fitOf(name)
{
    const kind = kindOf(name);
    if (kind && kind.fit >= 0 && kind.fit < FITS.length) return FITS[kind.fit];
    return FITS[FIT_FALLBACK];
}
return { kindOf, fitOf, K_BLOB, K_LOCKPATH, K_DROP, K_FADE, FIT_FALLBACK, KINDS };
})();
__mods["helpers/dodge_profiles.js"] = (function(){
const { BLOCKS_PROJECTILES, traceWallHit } = __mods["utils/wallCache.js"];

const DP_PI = 3.14159265358979;
const DP_TICK_MS = 50;
const DP_SPOKES = 6;
const DP_CHILD_RADIUS = 50;
const DP_SPAWN_OFFSET = 200;
const DP_CHILD_TRAVEL = 1100;
const DP_FLIGHT_DIST = 2035;
const DP_FLIGHT_TIME_MS = 963;
const DP_BURST_LIFE_MS = 360;
const DP_BLAST_MS = 700;
const DP_CURVE_DEV_DEG = 22;
const DP_ARM_LENGTH = DP_SPAWN_OFFSET + DP_CHILD_TRAVEL;

const SPIKE_ARC = [
    [0, 200, 0],
    [110, 515, 32],
    [207, 797, 216],
    [312, 999, 519],
    [411, 1066, 930],
    [513, 995, 1377],
    [557, 883, 1611]
];

const CROSS_BOMBER = { childRadius: 125, childSpeed: 3000, spawnOffset: 200, childTravel: 800, flightTimeMs: 1015 };
const CROSS_ULTI = { childRadius: 375, childSpeed: 3000, spawnOffset: 100, childTravel: 1600, flightTimeMs: 1115 };

var _spikeVariant = 0;

function _seg(name, ax, ay, bx, by, radius, t0, t1)
{
    return { hasSegment: true, ax, ay, bx, by, radius, t0, t1, name };
}

function _blob(name, x, y, radius, t0, t1)
{
    return { hasSegment: false, x, y, radius, t0, t1, name };
}

function _time(projectile, now)
{
    return projectile.spawnedAt ? projectile.spawnedAt : now;
}

function _angleOf(projectile)
{
    const a = projectile.angle;
    return Number.isFinite(a) ? a : 0;
}

function _crossArms(name, cx, cy, arm, radius, t0, t1, diagonal)
{
    const diag = 0.70710678;
    const out = [];
    for (let k = 0; k < 2; k++)
    {
        let dx;
        let dy;
        if (diagonal)
        {
            dx = diag;
            dy = k === 0 ? diag : -diag;
        }
        else
        {
            dx = k === 0 ? 1 : 0;
            dy = k === 0 ? 0 : 1;
        }
        out.push(_seg(name, cx - dx * arm, cy - dy * arm, cx + dx * arm, cy + dy * arm, radius, t0, t1));
    }
    return out;
}

function _crossProfile(projectile, now, spec, diagonal)
{
    const armLength = spec.spawnOffset + spec.childTravel;
    const burstLife = spec.childTravel / spec.childSpeed * 1000;
    let cx = projectile.targetX;
    let cy = projectile.targetY;
    if (cx === 0 && cy === 0)
    {
        const flight = spec.flightTimeMs / 1000;
        cx = projectile.spawnX + projectile.vx * flight;
        cy = projectile.spawnY + projectile.vy * flight;
    }
    if (cx === 0 || cy === 0) return [];
    if (Math.abs(cx) > 1.0e6 || Math.abs(cy) > 1.0e6) return [];
    const landAt = _time(projectile, now) + spec.flightTimeMs;
    const t0 = landAt - DP_TICK_MS;
    const t1 = landAt + burstLife + DP_TICK_MS;
    return _crossArms(projectile.name, cx, cy, armLength, spec.childRadius, t0, t1, diagonal);
}

function _spikeEndpoint(projectile)
{
    const rad = _angleOf(projectile) * DP_PI / 180;
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);
    const dist = traceWallHit(projectile.spawnX, projectile.spawnY, dirX, dirY, DP_FLIGHT_DIST, BLOCKS_PROJECTILES);
    return {
        x: projectile.spawnX + dirX * dist,
        y: projectile.spawnY + dirY * dist,
        dist
    };
}

function _cactusProfile(projectile, now)
{
    const end = _spikeEndpoint(projectile);
    const burstAt = _time(projectile, now) + DP_FLIGHT_TIME_MS * (end.dist / DP_FLIGHT_DIST);
    const out = [];
    if (projectile.spawnAreaRadius > 0)
    {
        const life = projectile.spawnAreaActiveTime ? projectile.spawnAreaActiveTime : DP_BLAST_MS;
        out.push(_blob(projectile.name, end.x, end.y, projectile.spawnAreaRadius, burstAt, burstAt + life));
    }
    if (_spikeVariant === 1)
    {
        const t0 = burstAt - DP_TICK_MS;
        const t1 = burstAt + DP_BURST_LIFE_MS + DP_TICK_MS;
        for (let i = 0; i < 3; i++)
        {
            const a = i * DP_PI / 3;
            const dx = Math.cos(a) * DP_ARM_LENGTH;
            const dy = Math.sin(a) * DP_ARM_LENGTH;
            out.push(_seg(projectile.name, end.x - dx, end.y - dy, end.x + dx, end.y + dy, DP_CHILD_RADIUS, t0, t1));
        }
        return out;
    }
    for (let s = 0; s < DP_SPOKES; s++)
    {
        const rot = s * (2 * DP_PI / DP_SPOKES);
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        for (let k = 0; k + 1 < SPIKE_ARC.length; k++)
        {
            const a = SPIKE_ARC[k];
            const b = SPIKE_ARC[k + 1];
            out.push(_seg(projectile.name,
                end.x + a[1] * cr - a[2] * sr,
                end.y + a[1] * sr + a[2] * cr,
                end.x + b[1] * cr - b[2] * sr,
                end.y + b[1] * sr + b[2] * cr,
                DP_CHILD_RADIUS, burstAt + a[0], burstAt + b[0]));
        }
    }
    return out;
}

function shapeHazards(projectile, now)
{
    if (!projectile || !projectile.name) return [];
    const name = projectile.name;
    if (name.indexOf("Overcharged") >= 0 || name.indexOf("MegaBoss") >= 0)
    {
        return _crossProfile(projectile, now, CROSS_ULTI, false)
            .concat(_crossProfile(projectile, now, CROSS_ULTI, true));
    }
    if (name.indexOf("CrossBomber") >= 0 && name.charAt(name.length - 1) !== "2")
    {
        const spec = name.indexOf("Ulti") >= 0 ? CROSS_ULTI : CROSS_BOMBER;
        return _crossProfile(projectile, now, spec, false);
    }
    if (name === "CactusProjectile")
    {
        if (!_spikeVariant) return [];
        return _cactusProfile(projectile, now);
    }
    return [];
}

function blocksLinear(name)
{
    if (!name) return false;
    if (name.indexOf("CrossBomber") >= 0 && name.charAt(name.length - 1) !== "2") return true;
    if (name === "CactusSpike") return true;
    return false;
}

function noteBurstDeath(record)
{
    if (_spikeVariant) return;
    if (!record || record.name !== "CactusProjectile") return;
    const dx = record.x - record.spawnX;
    const dy = record.y - record.spawnY;
    if (dx * dx + dy * dy < 1) return;
    const angle = Number.isFinite(record.angle) ? record.angle : 0;
    const chord = Math.atan2(dy, dx) * 180 / DP_PI;
    let deviation = (chord - angle) % 360;
    deviation = ((deviation + 540) % 360) - 180;
    if (deviation < 0) deviation = -deviation;
    _spikeVariant = deviation > DP_CURVE_DEV_DEG ? 2 : 1;
}

function resetProfiles()
{
    _spikeVariant = 0;
}
return { shapeHazards, blocksLinear, noteBurstDeath, resetProfiles };
})();
__mods["features/autododge.js"] = (function(){
const { sendCommand } = __mods["core/commands.js"];
const { getFunctions } = __mods["core/functions.js"];
const { offsets } = __mods["core/offsets.js"];
const { enableProjectileTracking, scanData } = __mods["core/scanner.js"];
const { state } = __mods["utils/flags.js"];
const { logWarn } = __mods["utils/logger.js"];
const { K_BLOB, K_DROP, K_FADE, K_LOCKPATH, fitOf, kindOf } = __mods["helpers/dodge_kinds.js"];
const { blocksLinear, noteBurstDeath, resetProfiles, shapeHazards } = __mods["helpers/dodge_profiles.js"];
const { BLOCKS_MOVEMENT, BLOCKS_PROJECTILES, TILE_SIZE, getWallCacheH, getWallCacheW, isBlockedAt, isBlockedWide, losCheck, traceWallHit } = __mods["utils/wallCache.js"];

const MOVE_INPUT_TYPE = 2;

const DODGE_CHAR_SPEED = 720;
const DODGE_SPEED_MIN = 300;
const DODGE_SPEED_MAX = 8500;

const AD_AWARE = 3200;
const AD_FALLBACK_RANGE = 2800;
const AD_DIR_COUNT = 64;
const AD_SKIN = 50;
const AD_SPAWN_MARGIN = 60;
const AD_REACH = 600;
const AD_TICK_MS = 16;
const AD_TICK_MAX_MS = 250;
const AD_WALL_BODY = 240;
const AD_HAZARD_MAX = 96;
const AD_CAP_MAX = 16;

const BD_SAFETY_MARGIN = 28;
const BD_T_FIELD = 1.8;
const BD_THREAT_MAX = 160;

const BDC_EXTRA = 12;
const BDC_DANGER = 1000000;
const BDC_T_FIELD = 2.4;
const BDC_T_URGENT = 0.9;
const BDC_KEEP = 0.15;
const BDC_KEEP_IMPACT = 0.9;
const BDC_TIE = 1.05;
const BDC_WALL_HIT = 200000;
const BDC_WALL_BAND = 170;
const BDC_WALL_PROBE = 3;
const BDC_EXTRA_BLEND = 120;
const BDC_HIT_GATE = 1.15;
const BDC_FAR = 1.0e18;
const BDC_EPS = 1;
const BDC_DIR_MAX = AD_DIR_COUNT + BDC_EXTRA;

const PROJ_RADIUS_DEFAULT = 150;
const OWN_RADIUS_MIN = 40;
const OWN_RADIUS_MAX = 200;

var _ring = [];
var _dirBuilt = false;

var _hazards = [];
var _hazardN = 0;

var _threats = [];
var _threatN = 0;

var _bdcDirs = [];
var _bdcScores = [];
var _bdcImpacts = [];
var _bdcSel = [];
var _bdcSelN = 0;
var _bdcLastX = 0;
var _bdcLastY = 0;
var _bdcHaveLast = false;

var _lastTick = 0;

function _ok(v, lo, hi)
{
    return v >= lo && v <= hi;
}

function _nowMs()
{
    return Date.now();
}

function _buildRing()
{
    if (_dirBuilt) return;
    for (let i = 0; i < AD_DIR_COUNT; i++)
    {
        const a = Math.PI * 2 * i / AD_DIR_COUNT;
        _ring.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    for (let i = 0; i < BDC_DIR_MAX; i++)
    {
        _bdcDirs.push({ x: 0, y: 0 });
        _bdcScores.push(0);
        _bdcImpacts.push(0);
    }
    for (let i = 0; i < BD_THREAT_MAX; i++)
    {
        _bdcSel.push(0);
        _threats.push({ x: 0, y: 0, vx: 0, vy: 0, rad: 0 });
    }
    for (let i = 0; i < AD_HAZARD_MAX; i++)
    {
        _hazards.push({
            x: 0, y: 0, vx: 0, vy: 0, rad: 0, age: 0,
            fadeBase: 0, fadeK: 0, ax: 0, ay: 0, bx: 0, by: 0,
            hasSegment: false, name: null
        });
    }
    _dirBuilt = true;
}

function _speed()
{
    const s = scanData.mySpeed | 0;
    if (s < DODGE_SPEED_MIN || s > DODGE_SPEED_MAX) return DODGE_CHAR_SPEED;
    return s;
}

function _ownRadius()
{
    const r = scanData.myRadius;
    if (r > 1)
    {
        if (r > OWN_RADIUS_MAX) return OWN_RADIUS_MAX;
        if (r < OWN_RADIUS_MIN) return OWN_RADIUS_MIN;
        return r;
    }
    return 120;
}

function _projectileVel(p)
{
    if (!p || !p.hasVelocitySample) return null;
    let dt = p.lastTs && p.spawnedAt ? _nowMs() - p.lastTs : 0;
    if (!(dt >= AD_TICK_MS && dt <= AD_TICK_MAX_MS)) dt = AD_TICK_MS;
    return {
        vx: (p.x - p.lastX) * 1000 / dt,
        vy: (p.y - p.lastY) * 1000 / dt
    };
}

function _ballRadius(p)
{
    return p.radius > 0 ? p.radius : PROJ_RADIUS_DEFAULT;
}

function _traveled(p)
{
    if (!p.spawnX && !p.spawnY) return 0;
    const dx = p.x - p.spawnX;
    const dy = p.y - p.spawnY;
    return Math.sqrt(dx * dx + dy * dy);
}

function _isMine(p)
{
    const team = p.ownerTeam | 0;
    if (team < 0) return false;
    return team === (scanData.myTeamId | 0);
}

function _myShot(p, mx, my, bodyR)
{
    if (!p.spawnX && !p.spawnY) return false;
    const sx = p.spawnX - mx;
    const sy = p.spawnY - my;
    const nx = p.x - mx;
    const ny = p.y - my;
    const dSpawn = sx * sx + sy * sy;
    const dNow = nx * nx + ny * ny;
    const r = bodyR + AD_SPAWN_MARGIN;
    if (dSpawn > r * r) return false;
    return dNow > dSpawn;
}

function _shielded(p, mx, my)
{
    const dx = p.x - mx;
    const dy = p.y - my;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 1) return false;
    if (isBlockedAt(mx, my, BLOCKS_PROJECTILES)) return false;
    return traceWallHit(mx, my, dx / d, dy / d, d, BLOCKS_PROJECTILES) < d;
}

function _segDist(px, py, ax, ay, bx, by)
{
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq < 0.000001 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = px - (ax + dx * t);
    const cy = py - (ay + dy * t);
    return Math.sqrt(cx * cx + cy * cy);
}

function _fadeVel(h, dt, out)
{
    let vx = h.vx;
    let vy = h.vy;
    if (h.fadeBase && h.fadeK)
    {
        const nowAge = h.age > 0 ? h.age : 0;
        const laterAge = nowAge + dt * 1000;
        const cur = h.fadeBase * Math.exp(h.fadeK * nowAge);
        const nxt = h.fadeBase * Math.exp(h.fadeK * laterAge);
        if (cur > 0.000001)
        {
            const r = nxt / cur;
            vx *= r;
            vy *= r;
        }
    }
    out.vx = vx;
    out.vy = vy;
    return out;
}

function _inAware(h, mx, my, zoneSq)
{
    if (h.hasSegment)
    {
        const d = _segDist(mx, my, h.ax, h.ay, h.bx, h.by);
        return d * d <= zoneSq;
    }
    const dx = h.x - mx;
    const dy = h.y - my;
    return dx * dx + dy * dy <= zoneSq;
}

function _kindReach(p, spec, spd)
{
    let r = 0;
    if (spec && spec.maxRange > 0) r = spec.maxRange;
    if (spec && spec.chargedRange > 0 && spd > 3500) r = spec.chargedRange;
    if (r <= 0 && p.castRange > 0) r = p.castRange;
    if (r <= 0 && p.isThrower && (p.targetX || p.targetY) && p.spawnX && p.spawnY)
    {
        const dx = p.targetX - p.spawnX;
        const dy = p.targetY - p.spawnY;
        const td = Math.sqrt(dx * dx + dy * dy);
        if (td > 0) r = td;
    }
    if (r <= 0) r = AD_FALLBACK_RANGE;
    if (spec && spec.reachAdj) r += spec.reachAdj;
    if (r > 0 && r < 70000) return r;
    return AD_FALLBACK_RANGE;
}

function _lifeLeft(p, spec, spd, nowMs)
{
    const maxR = _kindReach(p, spec, spd);
    if (spec && (spec.flags & K_FADE))
    {
        const spawned = p.spawnedAt ? p.spawnedAt : nowMs;
        let age = nowMs - spawned;
        if (age < 0) age = 0;
        const left = maxR * (1 - age / 1000);
        return left > 0 ? left : 0;
    }
    const left = maxR - _traveled(p);
    return left > 0 ? left : 0;
}

function _pushHazard()
{
    const h = _hazards[_hazardN];
    h.x = 0; h.y = 0; h.vx = 0; h.vy = 0; h.rad = 0; h.age = 0;
    h.fadeBase = 0; h.fadeK = 0; h.ax = 0; h.ay = 0; h.bx = 0; h.by = 0;
    h.hasSegment = false; h.name = null;
    _hazardN++;
    return h;
}

function _collect(mx, my, myRadius, nowMs)
{
    const zoneSq = AD_AWARE * AD_AWARE;
    const bodyR = myRadius + AD_SKIN;
    const list = scanData.projectiles || [];

    _hazardN = 0;

    for (let i = 0; i < list.length && i < 16; i++)
    {
        const p = list[i];
        if (!p) continue;
        if (_isMine(p)) continue;
        if (_myShot(p, mx, my, bodyR)) continue;
        if (_shielded(p, mx, my)) continue;

        const caps = shapeHazards(p, nowMs);
        for (let c = 0; c < caps.length && c < AD_CAP_MAX; c++)
        {
            const cap = caps[c];
            const until = (cap.t1 - nowMs) / 1000;
            if (until <= 0) continue;
            if (_hazardN >= AD_HAZARD_MAX) break;
            const h = _pushHazard();
            h.rad = cap.radius;
            h.hasSegment = !!cap.hasSegment;
            h.name = p.name || cap.name;
            if (cap.hasSegment)
            {
                h.ax = cap.ax; h.ay = cap.ay; h.bx = cap.bx; h.by = cap.by;
            }
            else
            {
                h.x = cap.x; h.y = cap.y;
            }
            if (!_inAware(h, mx, my, zoneSq)) _hazardN--;
        }

        if (caps.length > 0 && blocksLinear(p.name)) continue;

        const name = p.name || "";
        const spec = kindOf(name);
        if (spec && (spec.flags & K_DROP)) continue;

        const dx = p.x - mx;
        const dy = p.y - my;
        if (dx * dx + dy * dy > zoneSq) continue;

        let vx = p.vx || 0;
        let vy = p.vy || 0;
        if (vx === 0 && vy === 0)
        {
            const est = _projectileVel(p);
            if (est)
            {
                vx = est.vx;
                vy = est.vy;
            }
            else
            {
                vx = 0;
                vy = 0;
            }
        }
        if (!_ok(vx, -1e8, 1e8) || !_ok(vy, -1e8, 1e8))
        {
            vx = 0;
            vy = 0;
        }

        const flown = _traveled(p);
        if (spec && (spec.flags & K_LOCKPATH) && flown > 120 && p.spawnX && p.spawnY)
        {
            let base = Math.sqrt(vx * vx + vy * vy);
            if (base < 1) base = 1;
            vx = (p.x - p.spawnX) / flown * base;
            vy = (p.y - p.spawnY) / flown * base;
        }

        let spd = Math.sqrt(vx * vx + vy * vy);
        if (spec && spec.speedMul > 0 && spd > 3500)
        {
            vx *= spec.speedMul;
            vy *= spec.speedMul;
            spd *= spec.speedMul;
        }

        const lockPath = !!(spec && (spec.flags & K_LOCKPATH)) || !!p.isBeam;
        const blob = !!(spec && (spec.flags & K_BLOB)) || (!lockPath && !!p.isThrower);
        const fit = fitOf(name);
        const shotR = _ballRadius(p) + (spec ? (spec.growR | 0) : 0);
        const rad = shotR + fit.pad + shotR * fit.grow;

        let ux = 0;
        let uy = 0;
        if (spd >= 1)
        {
            ux = vx / spd;
            uy = vy / spd;
        }

        let playerAlong = 0;
        if (!blob && spd >= 1)
        {
            playerAlong = (mx - p.x) * ux + (my - p.y) * uy;
            if (playerAlong < -50) continue;
            if (!p.isThrower)
            {
                const tHit = playerAlong > 0 ? playerAlong : 0;
                const hitX = p.x + ux * tHit;
                const hitY = p.y + uy * tHit;
                if (!losCheck(p.x, p.y, hitX, hitY, BLOCKS_PROJECTILES)) continue;
            }
        }

        const left = _lifeLeft(p, spec, spd, nowMs);
        if (left <= 10) continue;

        const gap = Math.sqrt(dx * dx + dy * dy) - bodyR - shotR;
        if (left < 0.85 * (gap > 0 ? gap : 0)) continue;
        if (!blob && spd >= 1 && playerAlong > left + shotR) continue;
        if (_hazardN >= AD_HAZARD_MAX) break;

        const h = _pushHazard();
        h.x = p.x;
        h.y = p.y;
        h.vx = vx;
        h.vy = vy;
        h.rad = rad;
        h.name = p.name;
        h.age = (spec && (spec.flags & K_FADE))
            ? nowMs - (p.spawnedAt ? p.spawnedAt : nowMs)
            : 0;
        if (h.age < 0) h.age = 0;
        h.fadeBase = spec ? spec.fadeBase : 0;
        h.fadeK = spec ? spec.fadeK : 0;
    }
}

function _bdPush(x, y, vx, vy, rad)
{
    if (_threatN >= BD_THREAT_MAX) return;
    const t = _threats[_threatN];
    t.x = x;
    t.y = y;
    t.vx = vx;
    t.vy = vy;
    t.rad = rad;
    _threatN++;
}

function _bdBuildThreats()
{
    const vel = { vx: 0, vy: 0 };
    _threatN = 0;
    for (let i = 0; i < _hazardN; i++)
    {
        const h = _hazards[i];
        if (h.hasSegment)
        {
            _bdPush(h.ax, h.ay, 0, 0, h.rad);
            _bdPush(h.bx, h.by, 0, 0, h.rad);
            continue;
        }
        _fadeVel(h, 0, vel);
        _bdPush(h.x, h.y, vel.vx, vel.vy, h.rad);
    }
}

function _bdDanger(mx, my, myR)
{
    for (let i = 0; i < _threatN; i++)
    {
        const p = _threats[i];
        const r = myR + p.rad + BD_SAFETY_MARGIN * 2.5;
        const dx = mx - p.x;
        const dy = my - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= r * r) return true;
        const c1 = dx * p.vx + dy * p.vy;
        if (c1 <= 0) continue;
        const c2 = p.vx * p.vx + p.vy * p.vy;
        if (c2 <= 0) continue;
        const tHit = c1 / c2;
        if (tHit > BD_T_FIELD) continue;
        const cx = p.x + p.vx * tHit;
        const cy = p.y + p.vy * tHit;
        if ((mx - cx) * (mx - cx) + (my - cy) * (my - cy) <= r * r) return true;
    }
    return false;
}

function _clampToMap(v, maxTiles)
{
    const maxV = maxTiles * TILE_SIZE - 1;
    if (maxV <= 0) return v;
    if (v < 0) return 0;
    if (v > maxV) return maxV;
    return v;
}

function _sendMove(tx, ty)
{
    const w = getWallCacheW();
    const h = getWallCacheH();
    if (w > 0 && h > 0)
    {
        tx = _clampToMap(tx, w);
        ty = _clampToMap(ty, h);
    }
    const battle = scanData.battleModeClient;
    if (!battle || battle.isNull()) return false;
    try
    {
        const fns = getFunctions();
        const ix = Math.round(tx);
        const iy = Math.round(ty);
        fns.LogicBattleModeClient_setClientPredictionMoveTo(battle, ix, iy, 1);
        return sendCommand(MOVE_INPUT_TYPE, (ci) =>
        {
            ci.add(offsets.ClientInput_x).writeS32(ix);
            ci.add(offsets.ClientInput_y).writeS32(iy);
        });
    }
    catch (e)
    {
        logWarn("autododge send failed", { err: String(e && e.message || e) });
        return false;
    }
}

function _bdcForget()
{
    _bdcHaveLast = false;
    _bdcLastX = 0;
    _bdcLastY = 0;
}

function _bdcAimedOne(p, mx, my, myR)
{
    const r = myR + p.rad + BD_SAFETY_MARGIN;
    const vx = p.vx;
    const vy = p.vy;
    const px = p.x - mx;
    const py = p.y - my;
    const a = vx * vx + vy * vy;
    const b = 2 * (px * vx + py * vy);
    const c = px * px + py * py;
    let minD2 = c;
    if (a > 0.000001)
    {
        let tm = -b / (2 * a);
        if (tm < 0) tm = 0;
        if (tm > BDC_T_FIELD) tm = BDC_T_FIELD;
        minD2 = c + b * tm + a * tm * tm;
    }
    const gate = r * BDC_HIT_GATE;
    return minD2 <= gate * gate;
}

function _bdcWallCost(mx, my, dx, dy)
{
    let raw = 0;
    for (let s = 1; s <= BDC_WALL_PROBE; s++)
    {
        const d = BDC_WALL_BAND * s / BDC_WALL_PROBE;
        if (isBlockedWide(mx + dx * d, my + dy * d, AD_WALL_BODY, BLOCKS_MOVEMENT))
        {
            raw += BDC_WALL_HIT * (BDC_WALL_PROBE - s + 1);
        }
    }
    return raw;
}

function _bdcScoreDir(dx, dy, mx, my, myR, speed)
{
    let score = 0;
    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        const r = myR + p.rad + BD_SAFETY_MARGIN;
        const vx = p.vx - dx * speed;
        const vy = p.vy - dy * speed;
        const px = p.x - mx;
        const py = p.y - my;
        const a = vx * vx + vy * vy;
        const b = 2 * (px * vx + py * vy);
        const c = px * px + py * py;
        let minD2 = c;
        if (a > 0.000001)
        {
            let tm = -b / (2 * a);
            if (tm < 0) tm = 0;
            if (tm > BDC_T_FIELD) tm = BDC_T_FIELD;
            minD2 = c + b * tm + a * tm * tm;
        }
        if (minD2 < BDC_EPS) minD2 = BDC_EPS;
        score += BDC_DANGER * (r * r) / minD2;
    }
    return score;
}

function _bdcImpactDir(dx, dy, mx, my, myR, speed)
{
    let best = BDC_FAR;
    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        const r = myR + p.rad + BD_SAFETY_MARGIN;
        const vx = p.vx - dx * speed;
        const vy = p.vy - dy * speed;
        const px = p.x - mx;
        const py = p.y - my;
        const a = vx * vx + vy * vy;
        const b = 2 * (px * vx + py * vy);
        const c = px * px + py * py - r * r;
        if (c < 0) return 0;
        if (a > 0.000001)
        {
            const disc = b * b - 4 * a * c;
            if (disc >= 0)
            {
                const t1 = (-b - Math.sqrt(disc)) / (2 * a);
                if (t1 > 0 && t1 < best) best = t1;
            }
        }
    }
    return best;
}

function _bdcThreatD2(k, mx, my)
{
    const p = _threats[_bdcSel[k]];
    const dx = p.x - mx;
    const dy = p.y - my;
    return dx * dx + dy * dy;
}

function _bdcExtraDirs(mx, my)
{
    let first = -1;
    let second = -1;
    let at = AD_DIR_COUNT;

    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (first < 0)
        {
            first = i;
            continue;
        }
        const f2 = _bdcThreatD2(first, mx, my);
        if (d2 < f2)
        {
            second = first;
            first = i;
            continue;
        }
        if (second < 0)
        {
            second = i;
            continue;
        }
        const s2 = _bdcThreatD2(second, mx, my);
        if (d2 < s2) second = i;
    }

    for (let j = 0; j < 2; j++)
    {
        const k = j === 0 ? first : second;
        if (k < 0 || at + 3 > BDC_DIR_MAX) continue;
        const p = _threats[_bdcSel[k]];
        let pxv = -p.vy;
        let pyv = p.vx;
        let len = Math.sqrt(pxv * pxv + pyv * pyv);
        if (len < 0.000001) continue;
        const px = pxv / len;
        const py = pyv / len;
        _bdcDirs[at].x = px;
        _bdcDirs[at].y = py;
        _bdcDirs[at + 1].x = -px;
        _bdcDirs[at + 1].y = -py;
        pxv = (mx - p.x) + px * BDC_EXTRA_BLEND;
        pyv = (my - p.y) + py * BDC_EXTRA_BLEND;
        len = Math.sqrt(pxv * pxv + pyv * pyv);
        if (len < 0.000001)
        {
            pxv = -px;
            pyv = -py;
            len = 1;
        }
        _bdcDirs[at + 2].x = pxv / len;
        _bdcDirs[at + 2].y = pyv / len;
        at += 3;
    }

    return at - AD_DIR_COUNT;
}

function _bdcPick(mx, my, myR, ix, iy, speed)
{
    let rx = ix;
    let ry = iy;
    let hasRef = ix !== 0 || iy !== 0;
    let best = 0;
    let cand;
    let leastBad = false;
    let bestScore = BDC_FAR;
    let impactBest;
    let fence;
    let tBest;

    for (let i = 0; i < AD_DIR_COUNT; i++)
    {
        _bdcDirs[i].x = _ring[i].x;
        _bdcDirs[i].y = _ring[i].y;
    }

    _bdcSelN = 0;
    for (let i = 0; i < _threatN; i++)
    {
        if (_bdcAimedOne(_threats[i], mx, my, myR))
        {
            _bdcSel[_bdcSelN] = i;
            _bdcSelN++;
        }
    }

    if (_bdcSelN === 0)
    {
        let ox;
        let oy;
        if (!hasRef && _threatN > 0)
        {
            let nearest = 0;
            let nd = BDC_FAR;
            for (let i = 0; i < _threatN; i++)
            {
                const dx = _threats[i].x - mx;
                const dy = _threats[i].y - my;
                const d2 = dx * dx + dy * dy;
                if (d2 < nd)
                {
                    nd = d2;
                    nearest = i;
                }
            }
            rx = mx - _threats[nearest].x;
            ry = my - _threats[nearest].y;
            hasRef = true;
        }
        if (hasRef && (rx !== 0 || ry !== 0))
        {
            const len = Math.sqrt(rx * rx + ry * ry);
            ox = rx / len;
            oy = ry / len;
        }
        else if (_bdcHaveLast)
        {
            ox = _bdcLastX;
            oy = _bdcLastY;
        }
        else
        {
            ox = 0;
            oy = 0;
        }
        _bdcLastX = ox;
        _bdcLastY = oy;
        _bdcHaveLast = true;
        if (_threatN > 0 && (ox !== 0 || oy !== 0))
        {
            let nearest = 0;
            let nd = BDC_FAR;
            for (let i = 0; i < _threatN; i++)
            {
                const dx = _threats[i].x - mx;
                const dy = _threats[i].y - my;
                const d2 = dx * dx + dy * dy;
                if (d2 < nd)
                {
                    nd = d2;
                    nearest = i;
                }
            }
            const tdx = _threats[nearest].x - mx;
            const tdy = _threats[nearest].y - my;
            const tl = Math.sqrt(tdx * tdx + tdy * tdy);
            if (tl > 0.001 && (ox * tdx + oy * tdy) / tl > 0.9)
            {
                const px = -tdy / tl;
                const py = tdx / tl;
                if (ox * px + oy * py >= 0)
                {
                    ox = px;
                    oy = py;
                }
                else
                {
                    ox = -px;
                    oy = -py;
                }
            }
        }
        return { x: ox, y: oy };
    }

    const count = AD_DIR_COUNT + _bdcExtraDirs(mx, my);

    for (let i = 0; i < count; i++)
    {
        const d = _bdcDirs[i];
        _bdcScores[i] = _bdcScoreDir(d.x, d.y, mx, my, myR, speed) + _bdcWallCost(mx, my, d.x, d.y);
        _bdcImpacts[i] = _bdcImpactDir(d.x, d.y, mx, my, myR, speed);
        if (_bdcScores[i] < bestScore)
        {
            bestScore = _bdcScores[i];
            best = i;
        }
    }

    cand = best;
    impactBest = _bdcImpacts[best];

    if (_bdcHaveLast && best < AD_DIR_COUNT)
    {
        let pi = 0;
        let a = Math.atan2(_bdcLastY, _bdcLastX);
        const len = Math.sqrt(_bdcLastX * _bdcLastX + _bdcLastY * _bdcLastY);
        if (len > 0.000001)
        {
            if (a < 0) a += Math.PI * 2;
            pi = Math.round(a / (Math.PI * 2) * AD_DIR_COUNT);
            if (pi >= AD_DIR_COUNT) pi = 0;
        }
        if (_bdcScores[pi] <= bestScore * (1 + BDC_KEEP) &&
            _bdcImpacts[pi] >= impactBest * BDC_KEEP_IMPACT)
        {
            cand = pi;
        }
    }

    if (_bdcImpacts[cand] <= BDC_T_URGENT)
    {
        let s = -1;
        let sScore = BDC_FAR;
        for (let i = 0; i < count; i++)
        {
            if (_bdcImpacts[i] > BDC_T_URGENT && _bdcScores[i] < sScore)
            {
                sScore = _bdcScores[i];
                s = i;
            }
        }
        if (s >= 0)
        {
            cand = s;
        }
        else
        {
            let tMax = _bdcImpacts[cand];
            let lb = cand;
            leastBad = true;
            fence = _bdcScores[cand] * BDC_TIE + BDC_EPS;
            for (let i = 0; i < count; i++)
            {
                if (_bdcScores[i] <= fence && _bdcImpacts[i] > tMax * 1.1)
                {
                    tMax = _bdcImpacts[i];
                    lb = i;
                }
            }
            cand = lb;
        }
    }

    if (!leastBad)
    {
        fence = _bdcScores[cand] * BDC_TIE + BDC_EPS;
        tBest = _bdcImpacts[cand];
        for (let i = 0; i < count; i++)
        {
            const sameClass = (_bdcImpacts[i] > BDC_T_URGENT) === (_bdcImpacts[cand] > BDC_T_URGENT);
            if (!sameClass || _bdcScores[i] > fence) continue;
            if (_bdcImpacts[i] > tBest * 1.1)
            {
                tBest = _bdcImpacts[i];
                cand = i;
            }
        }
    }

    const out = { x: _bdcDirs[cand].x, y: _bdcDirs[cand].y };
    _bdcLastX = out.x;
    _bdcLastY = out.y;
    _bdcHaveLast = true;
    return out;
}

function _adUpdate(mx, my)
{
    const now = _nowMs();

    if (!_ok(mx, -1e8, 1e8)) return false;
    if (!_ok(my, -1e8, 1e8)) return false;

    _buildRing();

    const speed = _speed();
    const myR = _ownRadius();

    _collect(mx, my, myR, now);
    _bdBuildThreats();

    if (_threatN === 0)
    {
        _bdcForget();
        return false;
    }

    if (!_bdDanger(mx, my, myR)) return false;

    const dir = _bdcPick(mx, my, myR, 0, 0, speed);

    const tx = Math.round(mx + dir.x * AD_REACH);
    const ty = Math.round(my + dir.y * AD_REACH);

    _sendMove(tx, ty);
    return true;
}

function setupAutododge()
{
    enableProjectileTracking();
}

function resetAutododge()
{
    _bdcForget();
    resetProfiles();
}

function updateAutododge()
{
    if (!state.autododge) return;
    if (scanData.lastUpdate === 0) return;
    const now = _nowMs();
    if (now - _lastTick < AD_TICK_MS) return;
    _lastTick = now;

    const destroyed = scanData.destroyed;
    if (destroyed)
    {
        for (let i = 0; i < destroyed.length && i < 16; i++) noteBurstDeath(destroyed[i]);
    }

    _adUpdate(scanData.myX, scanData.myY);
}
return { setupAutododge, resetAutododge, updateAutododge };
})();
__mods["features/aimbot.js"] = (function(){
const { getBase, getFunctions } = __mods["core/functions.js"];
const { offsets } = __mods["core/offsets.js"];
const { scanData } = __mods["core/scanner.js"];
const { state } = __mods["utils/flags.js"];

const RANGE = 20000;
const SPEED_FALLBACK = 3000;
const SPEED_REFRESH_MS = 500;
const SKIP_NAME_PARTS = ["BALL"];

var _target = null;
var _aimX = 0;
var _aimY = 0;
var _track = new Map();
var _projectileSpeed = SPEED_FALLBACK;
var _speedAt = 0;
var _hooks = false;

function _velOf(enemy, now)
{
    const prev = _track.get(enemy.gid);
    _track.set(enemy.gid, { x: enemy.x, y: enemy.y, t: now });
    if (!prev) return { vx: 0, vy: 0 };
    const dt = now - prev.t;
    if (dt < 8 || dt > 400) return { vx: 0, vy: 0 };
    return {
        vx: (enemy.x - prev.x) * 1000 / dt,
        vy: (enemy.y - prev.y) * 1000 / dt
    };
}

function _ownProjectileSpeed()
{
    const now = Date.now();
    if (now - _speedAt < SPEED_REFRESH_MS) return _projectileSpeed;
    _speedAt = now;
    try
    {
        const fns = getFunctions();
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return _projectileSpeed;
        if (!fns.LogicCharacterClient_getWeaponSkill || !fns.LogicSkillData_getProjectileData) return _projectileSpeed;
        const skill = fns.LogicCharacterClient_getWeaponSkill(own);
        if (!skill || skill.isNull()) return _projectileSpeed;
        const data = fns.LogicSkillData_getProjectileData(skill, 0);
        if (!data || data.isNull()) return _projectileSpeed;
        const raw = data.add(offsets.ProjectileData_speed).readU32() | 0;
        if (raw >= 300 && raw <= 8500) _projectileSpeed = raw;
    }
    catch (_)
    {}
    return _projectileSpeed;
}

function _isSkipped(name)
{
    if (!name) return true;
    for (let i = 0; i < SKIP_NAME_PARTS.length; i++)
    {
        if (name.indexOf(SKIP_NAME_PARTS[i]) >= 0) return true;
    }
    return false;
}

function _pickTarget(now)
{
    const list = scanData.enemies || [];
    const myTeam = scanData.myTeamId | 0;
    const mx = scanData.myX;
    const my = scanData.myY;
    let best = null;
    let bestT = Infinity;

    for (let i = 0; i < list.length; i++)
    {
        const e = list[i];
        if (!e || !e.ptr || e.ptr.isNull()) continue;
        if (e.kind !== "player") continue;
        if (_isSkipped(e.brawlerName)) continue;
        if ((e.teamId | 0) === myTeam) continue;
        const dx = e.x - mx;
        const dy = e.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > RANGE) continue;
        const t = dist / (_projectileSpeed > 0 ? _projectileSpeed : SPEED_FALLBACK);
        if (t < bestT)
        {
            bestT = t;
            best = { enemy: e, dist, dx, dy };
        }
    }
    if (!best) return null;

    const vel = _velOf(best.enemy, now);
    const lead = bestT;
    _aimX = Math.round(best.enemy.x + vel.vx * lead);
    _aimY = Math.round(best.enemy.y + vel.vy * lead);
    return best.enemy;
}

function setupAimbot()
{
    if (_hooks) return;
    _hooks = true;
    const base = getBase();
    try
    {
        Interceptor.attach(base.add(offsets.BattleScreen_getClosestTargetForAutoshoot),
        {
            onLeave(retval)
            {
                if (!state.aimbot) return;
                if (!_target || !_target.ptr || _target.ptr.isNull()) return;
                try
                {
                    retval.replace(_target.ptr);
                }
                catch (_)
                {}
            }
        });
    }
    catch (_)
    {}
    try
    {
        Interceptor.attach(base.add(offsets.BattleScreen_activateSkill),
        {
            onEnter(args)
            {
                if (!state.aimbot) return;
                if (!_target || !_target.ptr || _target.ptr.isNull()) return;
                try
                {
                    this.context.x1 = _aimX | 0;
                    this.context.x2 = _aimY | 0;
                    this.context.x6 = Number(_target.gid) >>> 0;
                }
                catch (_)
                {}
            }
        });
    }
    catch (_)
    {}
}

function updateAimbot()
{
    if (!state.aimbot)
    {
        _target = null;
        return;
    }
    if (scanData.lastUpdate === 0)
    {
        _target = null;
        return;
    }
    _ownProjectileSpeed();
    _target = _pickTarget(Date.now());
}

function resetAimbot()
{
    _target = null;
    _track.clear();
}
return { setupAimbot, updateAimbot, resetAimbot };
})();
__mods["index.js"] = (function(){
const { initFunctions } = __mods["core/functions.js"];

const { offsets } = __mods["core/offsets.js"];

const { initScanner, resetScannerCache, updateScanner } = __mods["core/scanner.js"];

const { notifyBattleModeChanged, watchTileChanges, maybeRefreshWallCache } = __mods["utils/wallCache.js"];

const { resetAutododge, setupAutododge, updateAutododge } = __mods["features/autododge.js"];

const { resetAimbot, setupAimbot, updateAimbot } = __mods["features/aimbot.js"];

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
    setupAimbot();

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
                resetAimbot();
                notifyBattleModeChanged(bm);
            }

            const now = Date.now();
            try
            {
                updateScanner(bm, now);
                updateAimbot();
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
return { install };
})();
