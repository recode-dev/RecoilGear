export const structs_offsets = Object.freeze({
    BattleMode_objectManagerPtr: 0x28,
    BattleMode_clientInputManager: 0x58,
    BattleMode_hashEnabled: 0x70,
    BattleMode_hashKey: 0x60,

    ObjectManager_objectsArray: 0x0,
    ObjectManager_count: 0xc,
    ObjectManager_ptrStride: 0x8,

    TileMap_Width: 0xc4,
    TileMap_Height: 0xc8,
    TileMap_TilesArray: 0x20,
    TileTypeData_BlocksMovement: 0x56,

    GameObj_team: 0x40,
    LogicGameObjectClient_ownerIndex: 0x3c,

    CharData_brawlerId: 0x35c,
    HeroData_namePtr: 0x18,
    LogicCharacterClient_body: 0xa0,
    LogicCharacterClient_hyperActive: 0xa8,
    LogicSkillData_kind: 0x8,

    LogicProjectileClient_ownerTeam: 0x40,
    LogicProjectileClient_dataName: 0x18,
    Projectile_isIndirect: 0x118,

    ClientInput_x: 0xc,
    ClientInput_y: 0x10,
    ClientInput_skillData: 0x40,

    ScString_length: 0x4,
    ScString_data: 0x8,

    BattleScreen_aimTargetId: 0xf04,
    BattleScreen_aimX: 0xfac,
    BattleScreen_aimY: 0xfb0
});
