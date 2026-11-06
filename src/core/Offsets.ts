export interface OffsetTable {
    BattleMode_objectManager: number;
    BattleMode_clientInputManager: number;

    LogicGameObjectManagerClient_objects: number;
    LogicGameObjectManagerClient_count: number;
    LogicGameObjectManagerClient_ptrStride: number;
    LogicGameObjectManagerClient_findGameObject: number;

    LogicTileMap_pathFinder: number;
    LogicTileMap_width: number;
    LogicTileMap_height: number;
    LogicTileMap_tiles: number;
    LogicTileData_blocksMovement: number;

    LogicGameObjectClient_ownerIndex: number;
    LogicGameObjectClient_getTeam: number;
    LogicGamePlayUtil_isEnemy: number;
    LogicCharacterClient_hitpoints: number;
    LogicCharacterClient_moveAngle: number;

    LogicProjectileClient_targetObject: number;
    LogicProjectileClient_lifeTicks: number;
    LogicProjectileClient_travelType: number;
    LogicProjectileClient_stunMs: number;
    LogicProjectileClient_effectMs: number;

    LogicProjectileData_speed: number;
    LogicProjectileData_radius: number;

    LogicCharacterData_speed: number;

    ClientInput_type: number;
    ClientInput_x: number;
    ClientInput_y: number;
    ClientInput_token: number;

    BattleMode_hashEnabled: number;
    BattleMode_hashKey: number;
    ClientInput_typeConstantTable: number;
    ClientInput_hashInnerMask: number;
    ClientInput_hashOuterMask: number;

    LogicProjectileData_vtable: number;
    LogicProjectileClient_vtable: number;

    LogicBattleModeClient_update: number;
    BattleScreen_activateSkill: number;
    BattleScreen_getClosestTargetForAutoshoot: number;
    LogicTile_setData: number;
    LogicTileMap_tileToLogic: number;
    LogicGamePlayUtil_getClosestPathfinderCollision: number;
    LogicProjectileClient_ctor: number;
    LogicProjectileClient_destruct: number;

    BattleMode_getInstance: number;
    LogicBattleModeClient_getOwnCharacter: number;
    LogicBattleModeClient_getTileMap: number;
    LogicBattleModeClient_setClientPredictionMoveTo: number;

    ClientInputManager_addInput: number;
    ClientInput_constructor_int: number;
    operator_new: number;

    LogicGameObjectClient_getX: number;
    LogicGameObjectClient_getY: number;
    LogicGameObjectClient_getData: number;
    LogicCharacterData_getCollisionRadius: number;
    LogicCharacterData_getProjectileStartRadius: number;
    LogicCharacterClient_getWeaponSkill: number;

    LogicSkillData_getCastingRangeTiles: number;
    LogicSkillData_getProjectileData: number;

    LogicProjectileClient_getTargetX: number;
    LogicProjectileClient_getTargetY: number;
    LogicProjectileClient_getTravelTicks: number;
    LogicProjectileClient_decode: number;
    LogicProjectileData_createReferences: number;

    LogicSkillData_getSpread: number;
    LogicSkillData_getNumBulletsInOneAttack: number;
    LogicSkillData_getMsBetweenAttacks: number;
    LogicSkillData_createReferences: number;

    LogicCharacterData_createReferences: number;
    LogicCharacterClient_decode: number;

    LogicData_getName: number;

    LogicHttpRequest_encode: number;
}

export const OFFSETS: Readonly<OffsetTable> = Object.freeze({
    BattleMode_objectManager: 0x28,
    BattleMode_clientInputManager: 0x58,

    LogicGameObjectManagerClient_objects: 0x0,
    LogicGameObjectManagerClient_count: 0xc,
    LogicGameObjectManagerClient_ptrStride: 0x8,
    LogicGameObjectManagerClient_findGameObject: 0xa267dc,

    LogicTileMap_pathFinder: 0x60,
    LogicTileMap_width: 0xc4,
    LogicTileMap_height: 0xc8,
    LogicTileMap_tiles: 0x20,
    LogicTileData_blocksMovement: 0x56,

    LogicGameObjectClient_ownerIndex: 0x3c,
    LogicGameObjectClient_getTeam: 0xa23b0c,
    LogicGamePlayUtil_isEnemy: 0x4cf7a4,
    LogicCharacterClient_hitpoints: 0xc4,
    LogicCharacterClient_moveAngle: 0xb0,

    LogicProjectileClient_targetObject: 0xa0,
    LogicProjectileClient_lifeTicks: 0x1e8,
    LogicProjectileClient_travelType: 0x204,
    LogicProjectileClient_stunMs: 0x220,
    LogicProjectileClient_effectMs: 0x228,

    LogicProjectileData_speed: 0x124,
    LogicProjectileData_radius: 0x130,

    LogicCharacterData_speed: 0x26c,

    ClientInput_type: 0x8,
    ClientInput_x: 0xc,
    ClientInput_y: 0x10,
    ClientInput_token: 0x34,

    BattleMode_hashEnabled: 0x70,
    BattleMode_hashKey: 0x60,
    ClientInput_typeConstantTable: 0xe1bd30,
    ClientInput_hashInnerMask: 0xe1bbd0,
    ClientInput_hashOuterMask: 0xe1bbf0,

    LogicProjectileData_vtable: 0xff3b18,
    LogicProjectileClient_vtable: 0xff57b0,

    LogicBattleModeClient_update: 0xac1ee8,
    BattleScreen_activateSkill: 0x7a0084,
    BattleScreen_getClosestTargetForAutoshoot: 0x7b67ec,
    LogicTile_setData: 0x9401fc,
    LogicTileMap_tileToLogic: 0x943040,
    LogicGamePlayUtil_getClosestPathfinderCollision: 0xaf5d10,
    LogicProjectileClient_ctor: 0xa313f8,
    LogicProjectileClient_destruct: 0xa31470,

    BattleMode_getInstance: 0x8c5130,
    LogicBattleModeClient_getOwnCharacter: 0xac3934,
    LogicBattleModeClient_getTileMap: 0x991440,
    LogicBattleModeClient_setClientPredictionMoveTo: 0xac3a58,

    ClientInputManager_addInput: 0x74675c,
    ClientInput_constructor_int: 0xa95798,
    operator_new: 0xd8da2c,

    LogicGameObjectClient_getX: 0xa23afc,
    LogicGameObjectClient_getY: 0xa23b04,
    LogicGameObjectClient_getData: 0x117050,
    LogicCharacterData_getCollisionRadius: 0x9913e8,
    LogicCharacterData_getProjectileStartRadius: 0x9917d0,
    LogicCharacterClient_getWeaponSkill: 0x9fc440,

    LogicSkillData_getCastingRangeTiles: 0x9de9cc,
    LogicSkillData_getProjectileData: 0x9e84a8,

    LogicProjectileClient_getTargetX: 0x9cdaac,
    LogicProjectileClient_getTargetY: 0x9cdab4,
    LogicProjectileClient_getTravelTicks: 0xa3192c,
    LogicProjectileClient_decode: 0xa314e0,
    LogicProjectileData_createReferences: 0x9cb388,

    LogicSkillData_getSpread: 0x9dec84,
    LogicSkillData_getNumBulletsInOneAttack: 0x9ded40,
    LogicSkillData_getMsBetweenAttacks: 0x9dec74,
    LogicSkillData_createReferences: 0x9dd114,

    LogicCharacterData_createReferences: 0x993660,
    LogicCharacterClient_decode: 0x9f9b44,

    LogicData_getName: 0x9a4f1c,

    LogicHttpRequest_encode: 0xbd5f3c,
});
