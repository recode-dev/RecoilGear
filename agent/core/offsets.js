export const offsets = Object.freeze({
    BattleMode_battleScreenPtr: 0x8,
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
    ProjectileData_speed: 0x6c,
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
    LogicProjectileClient_ctor: 0xa313f8,
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

    LogicProjectileData_getSpeed: 0x8cee94,
    LogicProjectileData_getRadius: 0x860d88,
    LogicProjectileData_getRendering: 0x97d5c0,
    LogicProjectileData__getSpawnAreaEffect: 0x9cda1c,
    LogicProjectileData_getNumEarlyTicks: 0x979d50,
    LogicProjectileData_isBeam: 0x9b6448,
    BattleScreen__calculateProjectilePath: 0x7b3ae8,

    AreaEffectData__getRadius: 0x8cee8c,
    AreaEffectData__getActiveTimeMs: 0x9bf8f4,

    LogicData_getName: 0x9a4f1c
});
