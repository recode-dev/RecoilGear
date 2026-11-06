import { OFFSETS, type OffsetTable } from "./Offsets";

export interface NativeFunctions {
    BattleMode_getInstance(): NativePointer;
    LogicGameObjectClient_getX(self: NativePointer): number;
    LogicGameObjectClient_getY(self: NativePointer): number;
    LogicGameObjectClient_getData(self: NativePointer): NativePointer;
    LogicGameObjectClient_getTeam(self: NativePointer, manager: NativePointer): number;
    LogicGamePlayUtil_isEnemy(self: NativePointer): number;
    LogicBattleModeClient_getOwnCharacter(self: NativePointer): NativePointer;
    LogicBattleModeClient_getTileMap(self: NativePointer): NativePointer;
    LogicBattleModeClient_setClientPredictionMoveTo(
        self: NativePointer,
        x: number,
        y: number,
        enabled: number
    ): void;
    LogicGameObjectManagerClient_findGameObject(
        self: NativePointer,
        index: number,
        fallback: number
    ): NativePointer;
    ClientInput_constructor_int(self: NativePointer, type: number): void;
    ClientInputManager_addInput(self: NativePointer, input: NativePointer): void;
    operator_new(size: number): NativePointer;
    LogicTileMap_tileToLogic(value: number): number;
    LogicGamePlayUtil_getClosestPathfinderCollision(
        size: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        pathFinder: NativePointer,
        out: NativePointer,
        flags: number,
        mode: number
    ): number;
    LogicCharacterData_getCollisionRadius(data: NativePointer): number;
    LogicCharacterData_getProjectileStartRadius(): number;
    LogicCharacterClient_getWeaponSkill(self: NativePointer): NativePointer;
    LogicSkillData_getCastingRange(data: NativePointer): number;
    LogicSkillData_getProjectileData(data: NativePointer): NativePointer;
    LogicSkillData_getSpread(data: NativePointer): number;
    LogicSkillData_getNumBulletsInOneAttack(data: NativePointer): number;
    LogicSkillData_getMsBetweenAttacks(data: NativePointer): number;
    LogicProjectileClient_getTargetX(self: NativePointer): number;
    LogicProjectileClient_getTargetY(self: NativePointer): number;
    LogicProjectileClient_getTravelTicks(
        data: NativePointer,
        rangeUnits: number,
        speed: number
    ): number;
    LogicData_getName(data: NativePointer): NativePointer;
}

type NativeSpecEntry = readonly [
    keyof OffsetTable,
    NativeFunctionReturnType,
    NativeFunctionArgumentType[]
];

export const isValidPtr = (value: NativePointer | null | undefined): value is NativePointer =>
    !!value && !value.isNull();

export const ptrFromU32 = (lo: number, hi: number): NativePointer => {
    if (!lo && !hi) return ptr(0);
    return ptr(
        `0x${(hi >>> 0).toString(16).padStart(8, "0")}${(lo >>> 0).toString(16).padStart(8, "0")}`
    );
};

export const readClampedS32 = (
    obj: NativePointer,
    off: number,
    min: number,
    max: number
): number => {
    try {
        const v = Math.trunc(obj.add(off).readS32());
        return v >= min && v <= max ? v : 0;
    } catch {
        return 0;
    }
};

export const attachOffset = (
    base: NativePointer,
    off: number,
    listeners: InvocationListenerCallbacks
): InvocationListener | null => {
    try {
        return Interceptor.attach(base.add(off), listeners);
    } catch {
        return null;
    }
};

const NATIVE_SPECS: Record<keyof NativeFunctions, NativeSpecEntry> = {
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
    #base: NativePointer | null = null;
    #image: Module | null = null;
    #table: Readonly<NativeFunctions> | null = null;

    init(baseIn: NativePointer, imageIn: Module | null): Readonly<NativeFunctions> {
        if (this.#table) return this.#table;
        this.#base = baseIn;
        this.#image = imageIn || null;
        const built: Record<string, unknown> = {};
        for (const [key, [name, ret, args]] of Object.entries(NATIVE_SPECS)) {
            const off = OFFSETS[name];
            if (typeof off !== "number" || off <= 0)
                throw new Error(`functions: missing offset ${name}`);
            built[key] = new NativeFunction(this.#base.add(off), ret, args);
        }
        this.#table = Object.freeze(built) as unknown as Readonly<NativeFunctions>;
        return this.#table;
    }

    get table(): Readonly<NativeFunctions> {
        if (!this.#table) throw new Error("FunctionTable not initialized: call init(base) first");
        return this.#table;
    }

    get base(): NativePointer {
        if (!this.#base) throw new Error("FunctionTable not initialized: call init(base) first");
        return this.#base;
    }

    get image(): Module | null {
        return this.#image;
    }
}

const functions = new FunctionTable();

export const initFunctions = (
    baseIn: NativePointer,
    imageIn: Module | null
): Readonly<NativeFunctions> => functions.init(baseIn, imageIn);
export const getFunctions = (): Readonly<NativeFunctions> => functions.table;
export const getBase = (): NativePointer => functions.base;
export const getImage = (): Module | null => functions.image;
