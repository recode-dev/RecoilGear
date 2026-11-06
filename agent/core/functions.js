import { offsets } from "./offsets.js";

export const isValidPtr = (value) => !!value && !value.isNull();

export const ptrFromU32 = (lo, hi) => {
    if (!lo && !hi) return ptr(0);
    return ptr(
        `0x${(hi >>> 0).toString(16).padStart(8, "0")}${(lo >>> 0).toString(16).padStart(8, "0")}`
    );
};

class FunctionTable {
    #base = null;
    #image = null;
    #table = null;

    #nf(name, ret, args) {
        const off = offsets[name];
        if (typeof off !== "number" || off <= 0)
            throw new Error(`functions: missing offset ${name}`);
        return new NativeFunction(this.#base.add(off), ret, args);
    }

    init(baseIn, imageIn) {
        if (this.#table) return this.#table;
        this.#base = baseIn;
        this.#image = imageIn || null;
        this.#table = Object.freeze({
            BattleMode_getInstance: this.#nf("BattleMode_getInstance", "pointer", []),
            LogicGameObjectClient_getX: this.#nf("LogicGameObjectClient_getX", "int32", [
                "pointer"
            ]),
            LogicGameObjectClient_getY: this.#nf("LogicGameObjectClient_getY", "int32", [
                "pointer"
            ]),
            LogicBattleModeClient_getOwnCharacter: this.#nf(
                "LogicBattleModeClient_getOwnCharacter",
                "pointer",
                ["pointer"]
            ),
            LogicBattleModeClient_setClientPredictionMoveTo: this.#nf(
                "LogicBattleModeClient_setClientPredictionMoveTo",
                "void",
                ["pointer", "int", "int", "bool"]
            ),
            LogicGameObjectManagerClient_getOwnPlayerTeam: this.#nf(
                "LogicGameObjectManagerClient_getOwnPlayerTeam",
                "int32",
                ["pointer"]
            ),
            LogicGameObjectManagerClient_findGameObject: this.#nf(
                "LogicGameObjectManagerClient_findGameObject",
                "pointer",
                ["pointer", "int", "int"]
            ),
            ClientInput_constructor_int: this.#nf("ClientInput_constructor_int", "void", [
                "pointer",
                "int"
            ]),
            ClientInputManager_addInput: this.#nf("ClientInputManager_addInput", "void", [
                "pointer",
                "pointer"
            ]),
            LogicGameObjectClient_getData: this.#nf("LogicGameObjectClient_getData", "pointer", [
                "pointer"
            ]),
            LogicGameObjectClient_getTeam: this.#nf("LogicGameObjectClient_getTeam", "int32", [
                "pointer",
                "pointer"
            ]),
            LogicGamePlayUtil_isEnemy: this.#nf("LogicGamePlayUtil_isEnemy", "int32", ["pointer"]),
            LogicTileMap_tileToLogic: this.#nf("LogicTileMap_tileToLogic", "int32", ["int32"]),
            LogicGamePlayUtil_getClosestPathfinderCollision: this.#nf(
                "LogicGamePlayUtil_getClosestPathfinderCollision",
                "uint32",
                [
                    "int32",
                    "int32",
                    "int32",
                    "int32",
                    "int32",
                    "pointer",
                    "pointer",
                    "uint32",
                    "uint8"
                ]
            ),
            LogicCharacterData_getCollisionRadius: this.#nf(
                "LogicCharacterData_getCollisionRadius",
                "int32",
                ["pointer"]
            ),
            LogicBattleModeClient_getTileMap: this.#nf(
                "LogicBattleModeClient_getTileMap",
                "pointer",
                ["pointer"]
            ),
            LogicCharacterClient_getWeaponSkill: this.#nf(
                "LogicCharacterClient_getWeaponSkill",
                "pointer",
                ["pointer"]
            ),
            LogicSkillData_getCastingRange: this.#nf(
                "LogicSkillData_getCastingRangeTiles",
                "int32",
                ["pointer"]
            ),
            LogicSkillData_getProjectileData: this.#nf(
                "LogicSkillData_getProjectileData",
                "pointer",
                ["pointer"]
            ),
            LogicData_getName: this.#nf("LogicData_getName", "pointer", ["pointer"]),
            LogicProjectileClient_getTravelTicks: this.#nf(
                "LogicProjectileClient_getTravelTicks",
                "int32",
                ["pointer", "int32", "int32"]
            ),
            LogicSkillData_getSpread: this.#nf("LogicSkillData_getSpread", "int32", ["pointer"]),
            LogicSkillData_getNumBulletsInOneAttack: this.#nf(
                "LogicSkillData_getNumBulletsInOneAttack",
                "int32",
                ["pointer"]
            ),
            LogicSkillData_getMsBetweenAttacks: this.#nf(
                "LogicSkillData_getMsBetweenAttacks",
                "int32",
                ["pointer"]
            ),
            LogicProjectileClient_getTargetX: this.#nf(
                "LogicProjectileClient_getTargetX",
                "int32",
                ["pointer"]
            ),
            LogicProjectileClient_getTargetY: this.#nf(
                "LogicProjectileClient_getTargetY",
                "int32",
                ["pointer"]
            ),
            LogicProjectileData_getTravelType: this.#nf(
                "LogicProjectileData_getTravelType",
                "int32",
                ["pointer"]
            ),
            LogicCharacterData_getProjectileStartRadius: this.#nf(
                "LogicCharacterData_getProjectileStartRadius",
                "int32",
                []
            ),
            operator_new: this.#nf("operator_new", "pointer", ["size_t"])
        });
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
