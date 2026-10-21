import
{
    offsets
}
from "./offsets.js";

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

export function initFunctions(baseIn)
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

export function getFunctions()
{
    if (!_n) throw new Error("Functions not initialized! Call initFunctions(base) first.");
    return _n;
}

export function getBase()
{
    if (!base) throw new Error("Functions not initialized! Call initFunctions(base) first.");
    return base;
}
