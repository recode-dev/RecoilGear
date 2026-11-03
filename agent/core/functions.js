import { offsets } from "./offsets.js";

var base = null;
var image = null;
var _n = null;

export function isValidPtr(value) {
    return value && !value.isNull();
}

export function ptrFromU32(lo, hi) {
    if (!lo && !hi) return ptr(0);
    return ptr(
        "0x" + (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0")
    );
}

function _nf(name, ret, args) {
    const off = offsets[name];
    if (typeof off !== "number" || off <= 0) throw new Error("functions: missing offset " + name);
    return new NativeFunction(base.add(off), ret, args);
}

export function initFunctions(baseIn, imageIn) {
    if (_n) return _n;
    base = baseIn;
    image = imageIn || null;

    _n = {
        BattleMode_getInstance: _nf("BattleMode_getInstance", "pointer", []),
        LogicGameObjectClient_getX: _nf("LogicGameObjectClient_getX", "int32", ["pointer"]),
        LogicGameObjectClient_getY: _nf("LogicGameObjectClient_getY", "int32", ["pointer"]),
        LogicBattleModeClient_getOwnCharacter: _nf(
            "LogicBattleModeClient_getOwnCharacter",
            "pointer",
            ["pointer"]
        ),
        LogicBattleModeClient_setClientPredictionMoveTo: _nf(
            "LogicBattleModeClient_setClientPredictionMoveTo",
            "void",
            ["pointer", "int", "int", "int"]
        ),
        ClientInput_constructor_int: _nf("ClientInput_constructor_int", "pointer", [
            "pointer",
            "int"
        ]),
        ClientInputManager_addInput: _nf("ClientInputManager_addInput", "void", [
            "pointer",
            "pointer"
        ]),
        LogicGameObjectClient_getGlobalID: _nf("LogicGameObjectClient_getGlobalID", "uint32", [
            "pointer"
        ]),
        LogicGameObjectClient_getData: _nf("LogicGameObjectClient_getData", "pointer", ["pointer"]),
        LogicTileMap_tileToLogic: _nf("LogicTileMap_tileToLogic", "int32", ["int32"]),
        LogicGamePlayUtil_getClosestPathfinderCollision: _nf(
            "LogicGamePlayUtil_getClosestPathfinderCollision",
            "uint32",
            ["int32", "int32", "int32", "int32", "int32", "pointer", "pointer", "uint32", "uint8"]
        ),
        LogicCharacterData_getSpeed: _nf("LogicCharacterData_getSpeed", "int32", ["pointer"]),
        LogicCharacterData_getCollisionRadius: _nf(
            "LogicCharacterData_getCollisionRadius",
            "uint32",
            ["pointer"]
        ),
        LogicBattleModeClient_getTileMap: _nf("LogicBattleModeClient__getTileMap", "pointer", [
            "pointer"
        ]),
        LogicCharacterClient_getWeaponSkill: _nf(
            "LogicCharacterClient__getWeaponSkill",
            "pointer",
            ["pointer"]
        ),
        LogicSkillData_getCastingRange: _nf("LogicSkillData__getCastingRange", "int32", [
            "pointer"
        ]),
        LogicSkillData_getProjectileData: _nf("LogicSkillData__getProjectileData", "pointer", [
            "pointer",
            "int"
        ]),
        LogicData_getName: _nf("LogicData_getName", "pointer", ["pointer"]),
        LogicCharacterClient_getMoveAngle: _nf("LogicCharacterClient_getMoveAngle", "float", [
            "pointer"
        ]),
        LogicProjectileClient_getPreExplosionTimeMs: _nf(
            "LogicProjectileClient_getPreExplosionTimeMs",
            "int32",
            ["pointer"]
        ),
        LogicProjectileClient_getTravelTicks: _nf("LogicProjectileClient_getTravelTicks", "int32", [
            "pointer",
            "int32",
            "int32"
        ]),
        LogicProjectileClient_getType: _nf("LogicProjectileClient_getType", "int32", ["pointer"]),
        LogicProjectileClient_isBeam: _nf("LogicProjectileClient_isBeam", "uint32", ["pointer"]),
        LogicSkillData_getSpread: _nf("LogicSkillData_getSpread", "int32", ["pointer"]),
        LogicSkillData_getNumBulletsInOneAttack: _nf(
            "LogicSkillData_getNumBulletsInOneAttack",
            "int32",
            ["pointer"]
        ),
        LogicSkillData_getMsBetweenAttacks: _nf("LogicSkillData_getMsBetweenAttacks", "int32", [
            "pointer"
        ]),
        LogicProjectileClient_getTargetX: _nf("LogicProjectileClient_getTargetX", "int32", [
            "pointer"
        ]),
        LogicProjectileClient_getTargetY: _nf("LogicProjectileClient_getTargetY", "int32", [
            "pointer"
        ]),
        LogicProjectileClient_piercesEnvironment: _nf(
            "LogicProjectileClient_piercesEnvironment",
            "uint32",
            ["pointer"]
        ),
        LogicProjectileClient_isHomingMissile: _nf(
            "LogicProjectileClient_isHomingMissile",
            "uint32",
            ["pointer"]
        ),
        LogicProjectileClient_isBouncing: _nf("LogicProjectileClient_isBouncing", "uint32", [
            "pointer"
        ]),
        LogicProjectileData_getSpeed: _nf("LogicProjectileData_getSpeed", "int32", ["pointer"]),
        LogicProjectileData_getRadius: _nf("LogicProjectileData_getRadius", "int32", ["pointer"]),
        LogicProjectileData_getIntValueFromColumn: _nf(
            "LogicProjectileData_getIntValueFromColumn",
            "int32",
            ["pointer", "int"]
        ),
        LogicProjectileData_getBoolValueFromColumn: _nf(
            "LogicProjectileData_getBoolValueFromColumn",
            "uint32",
            ["pointer", "int"]
        ),
        LogicProjectileData_getBoolValueFromColumnAlt: _nf(
            "LogicProjectileData_getBoolValueFromColumnAlt",
            "uint32",
            ["pointer", "int"]
        ),
        LogicCharacterData_getProjectileStartRadius: _nf(
            "LogicCharacterData_getProjectileStartRadius",
            "int32",
            ["pointer"]
        ),
        LogicDataReader_byIndex: _nf("LogicDataReader_byIndex", "int32", ["pointer", "int"]),
        LogicDataReader_byIndex2: _nf("LogicDataReader_byIndex2", "int32", ["pointer", "int"]),
        LogicDataReader_byIndex3: _nf("LogicDataReader_byIndex3", "uint32", ["pointer", "int"]),
        operator_new: _nf("operator_new", "pointer", ["ulong"])
    };
    Object.freeze(_n);
    return _n;
}

export function getFunctions() {
    if (!_n) throw new Error("Functions not initialized! Call initFunctions(base) first.");
    return _n;
}

export function getImage() {
    return image;
}

export function getBase() {
    if (!base) throw new Error("Functions not initialized! Call initFunctions(base) first.");
    return base;
}
