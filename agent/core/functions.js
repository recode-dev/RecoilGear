import { offsets } from "./offsets.js";

export const isValidPtr = (value) => !!value && !value.isNull();

export const ptrFromU32 = (lo, hi) => {
    if (!lo && !hi) return ptr(0);
    return ptr(
        `0x${(hi >>> 0).toString(16).padStart(8, "0")}${(lo >>> 0).toString(16).padStart(8, "0")}`
    );
};

export const readClampedS32 = (obj, off, min, max) => {
    try {
        const v = Math.trunc(obj.add(off).readS32());
        return v >= min && v <= max ? v : 0;
    } catch {
        return 0;
    }
};

export const attachOffset = (base, off, listeners) => {
    try {
        return Interceptor.attach(base.add(off), listeners);
    } catch {
        return null;
    }
};

const nativeSpecs = {
    BattleMode_getInstance: ["BattleMode_getInstance", "pointer", []],
    LogicGameObjectClient_getX: ["LogicGameObjectClient_getX", "int32", ["pointer"]],
    LogicGameObjectClient_getY: ["LogicGameObjectClient_getY", "int32", ["pointer"]],
    LogicGameObjectClient_getData: ["LogicGameObjectClient_getData", "pointer", ["pointer"]],
    LogicGameObjectClient_getTeam: [
        "LogicGameObjectClient_getTeam",
        "int32",
        ["pointer", "pointer"]
    ],
    LogicGamePlayUtil_isEnemy: ["LogicGamePlayUtil_isEnemy", "int32", ["pointer"]],
    LogicBattleModeClient_getOwnCharacter: [
        "LogicBattleModeClient_getOwnCharacter",
        "pointer",
        ["pointer"]
    ],
    LogicBattleModeClient_getTileMap: ["LogicBattleModeClient_getTileMap", "pointer", ["pointer"]],
    LogicBattleModeClient_setClientPredictionMoveTo: [
        "LogicBattleModeClient_setClientPredictionMoveTo",
        "void",
        ["pointer", "int", "int", "bool"]
    ],
    LogicGameObjectManagerClient_findGameObject: [
        "LogicGameObjectManagerClient_findGameObject",
        "pointer",
        ["pointer", "int", "int"]
    ],
    ClientInput_constructor_int: ["ClientInput_constructor_int", "void", ["pointer", "int"]],
    ClientInputManager_addInput: ["ClientInputManager_addInput", "void", ["pointer", "pointer"]],
    operator_new: ["operator_new", "pointer", ["size_t"]],
    LogicTileMap_tileToLogic: ["LogicTileMap_tileToLogic", "int32", ["int32"]],
    LogicGamePlayUtil_getClosestPathfinderCollision: [
        "LogicGamePlayUtil_getClosestPathfinderCollision",
        "uint32",
        ["int32", "int32", "int32", "int32", "int32", "pointer", "pointer", "uint32", "uint8"]
    ],
    LogicCharacterData_getCollisionRadius: [
        "LogicCharacterData_getCollisionRadius",
        "int32",
        ["pointer"]
    ],
    LogicCharacterData_getProjectileStartRadius: [
        "LogicCharacterData_getProjectileStartRadius",
        "int32",
        []
    ],
    LogicCharacterClient_getWeaponSkill: [
        "LogicCharacterClient_getWeaponSkill",
        "pointer",
        ["pointer"]
    ],
    LogicSkillData_getCastingRange: ["LogicSkillData_getCastingRangeTiles", "int32", ["pointer"]],
    LogicSkillData_getProjectileData: ["LogicSkillData_getProjectileData", "pointer", ["pointer"]],
    LogicSkillData_getSpread: ["LogicSkillData_getSpread", "int32", ["pointer"]],
    LogicSkillData_getNumBulletsInOneAttack: [
        "LogicSkillData_getNumBulletsInOneAttack",
        "int32",
        ["pointer"]
    ],
    LogicSkillData_getMsBetweenAttacks: [
        "LogicSkillData_getMsBetweenAttacks",
        "int32",
        ["pointer"]
    ],
    LogicProjectileClient_getTargetX: ["LogicProjectileClient_getTargetX", "int32", ["pointer"]],
    LogicProjectileClient_getTargetY: ["LogicProjectileClient_getTargetY", "int32", ["pointer"]],
    LogicProjectileClient_getTravelTicks: [
        "LogicProjectileClient_getTravelTicks",
        "int32",
        ["pointer", "int32", "int32"]
    ],
    LogicData_getName: ["LogicData_getName", "pointer", ["pointer"]]
};

class FunctionTable {
    #base = null;
    #image = null;
    #table = null;

    init(baseIn, imageIn) {
        if (this.#table) return this.#table;
        this.#base = baseIn;
        this.#image = imageIn || null;
        const built = {};
        for (const [key, [name, ret, args]] of Object.entries(nativeSpecs)) {
            const off = offsets[name];
            if (typeof off !== "number" || off <= 0)
                throw new Error(`functions: missing offset ${name}`);
            built[key] = new NativeFunction(this.#base.add(off), ret, args);
        }
        this.#table = Object.freeze(built);
        return this.#table;
    }

    get table() {
        if (!this.#table) throw new Error("FunctionTable not initialized: call init(base) first");
        return this.#table;
    }

    get base() {
        if (!this.#base) throw new Error("FunctionTable not initialized: call init(base) first");
        return this.#base;
    }

    get image() {
        return this.#image;
    }
}

const functions = new FunctionTable();

export const initFunctions = (baseIn, imageIn) => functions.init(baseIn, imageIn);
export const getFunctions = () => functions.table;
export const getBase = () => functions.base;
export const getImage = () => functions.image;
