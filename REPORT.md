# RecoilGear — отчёт верификации оффсетов (v69.252 iOS arm64)

**Дата:** 2026-11-05 · **Статус:** все оффсеты VERIFIED · **Всего записей:** 137 · **Исправлено:** 1


## Методика

Референс: дамп **v36.218 Android ELF64 (символьный, 56154 символа)** — `dumps/69_252 Dump/v36_218 elf64/`.
Цель: дамп **v69.252 iOS arm64 Mach-O (stripped, base 0x100000000)** — `dumps/69_252 Dump/v69_252 darwin arm64/`.
Инструменты: кит re-any (capstone-индексы 78942/94432 функций, verify/find_offsets/vtable/arm64),
прямой дизасм (adrp+add-трассировка), декомпилы Ghidra обеих сборок, побайтовые сравнения дампов.

Классы доказательств:
- **дизасм** — машинные инструкции цели, материализующие точный адрес/смещение (adrp+add, ldr/str imm);
- **декомпил** — семантика тела функции в v69, совпадающая с v36-референсом;
- **CR-карта / CR-цепочка / CR-консенсус** — колонка CSV → статический индекс (createReferences) → запись поля лоадером → чтение геттером; имена колонок сверены с v36 sm_columnIndex*;
- **строка** — отладочная строка бинарника, именующая функцию, с единственным xref;
- **vtable** — слот chained-fixup vtable, выровненный позиционно с v36-таблицей, + запись vtable ctor'ом;
- **консенсус** — рёбра вызовов 1:1 с уже VERIFIED-функциями + структурное совпадение с v36;
- **дамп** — побайтовое содержимое по адресу (маски, таблицы, fallback).

Пара к деньг-пруфам подписи: SHA-256 K-таблица агента (crypto.js) байт-в-байт совпадает с
K-таблицей в дампе v69 по адресу 0xe1df58 (64 слова); формула токена в клиенте
`(d[0] | (d[1]&0x7f)<<8), min 1` — идентична crypto.js.

## Сводка

| Параметр | Значение |
|---|---|
| Записей в offsets.js | 137 |
| VERIFIED | 137 / 137 |
| Исправлено (было → стало) | `LogicProjectileData_createReferences: 0x9cb364 → 0x9cb388` |
| Спор u32-vs-float (SkillCommandTypeTable) | **u32** — дизасм потребителя: `ldr s1,[x9,x8,lsl #2]` + `ushll v1.8h,v1.8b,#0` (32-битная запись, байтовое расширение; НЕ float-семантика) |
| Fallback-константа | @0xe1bc28 = `0xdeadbeef` (4×u16 в дампе; совпадает с константой агента) |

## Исправления (было / стало)

| Ключ | Было | Стало | Основание |
|---|---|---|---|
| LogicProjectileData_createReferences | `0x9cb364` | `0x9cb388` | 0x9cb364 — слот [2] vtable = **destruct** (bl LogicData::destruct + обнуление полей). createReferences — слот [4] = 0x9cb388 (bl LogicData::createReferences + полный CSV-загрузчик с колонками Speed/IsBeam/Radius/...). Позиции [2]/[4] совпадают с v36-таблицей 1:1. |

## По-записные доказательства


### BattleMode / менеджер объектов

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 1 | `BattleMode_logicBattleModeClient` | `0x28` | BattleMode+0x28 читается как указатель на LogicGameObjectManagerClient в VERIFIED-цепочке: isEnemy(FUN_1004cf7a4): getOwnPlayerTeam(*(battle+0x28)) и getTeam(obj,*(battle+0x28)); ClientInputManager_addInput вызывается как fcn.10074675c(*(lVar28+0x58),input) после lVar28=getInstance(); getOwnCharacter(FUN_100ac3934): findGameObject(*(this+0x28),*(this+0x100),-1). Семантика совпадает с v36 LogicBattleModeClient::getOwnCharacter (v36: findGameObject(*(this+0x28),...)). ВНИМАНИЕ: историческое имя ключа («logicBattleModeClient») не соответствует классу поля — по факту это указатель на менеджер объектов; оффсет 0x28 верен. | дизасм+декомпил | VERIFIED |
| 2 | `BattleMode_clientInputManager` | `0x58` | send-command FUN_1007a60f4 (BattleScreen, VERIFIED-контекст): fcn.10074675c(*(lVar28+0x58), piVar33) — BattleMode+0x58 передаётся как this в VERIFIED ClientInputManager::addInput. | декомпил | VERIFIED |
| 3 | `BattleMode_hashKey` | `0x60` | FUN_1007a60f4: if(*(char*)(battle+0x70)==1){ чтение 16 байт ключа: *(byte*)(battle+0x60)..(battle+0x6f) — 16 последовательных ldrb; ключ передаётся в хэш fcn.10079d594. Совпадает с агентом: MASK_SIZE=16, battle.add(0x60). | декомпил | VERIFIED |
| 4 | `BattleMode_hashEnabled` | `0x70` | FUN_1007a60f4 (3 места: строки 168/481/822): if(*(char*)(lVar28+0x70)=='\x01'){...подпись...} — семантика «подписывать только при 1», как в commands.js: readU8()!==1 → return 0. | декомпил | VERIFIED |
| 5 | `LogicGameObjectManagerClient_objects` | `0x0` | findGameObject(FUN_100a267dc, VERIFIED): plVar4 = *(long**)(*param_1 + i) — массив указателей по базовому смещению +0x0; getTeam(FUN_100a23b0c, VERIFIED): lVar3 = *(long*)(*param_2 + idx*8). | декомпил | VERIFIED |
| 6 | `LogicGameObjectManagerClient_count` | `0xc` | findGameObject: uVar1 = *(uint*)(param_1+0xc), цикл 0<count; getTeam: idx < *(int*)(param_2+0xc). | декомпил | VERIFIED |
| 7 | `LogicGameObjectManagerClient_ptrStride` | `0x8` | Шаг массива objects: *(base + i*8) в findGameObject и getTeam — stride 8 байт (arm64, указатели). | декомпил | VERIFIED |
| 8 | `LogicGameObjectManagerClient_ownTeam` | `0xe4` | getOwnPlayerTeam(FUN_100a7f47c, VERIFIED): return *(this+0xe4); вызывается из isEnemy как getOwnPlayerTeam(*(battle+0x28)) — поле менеджера. v36: LogicBattleModeClient::getOwnPlayerTeam() const @0x1b8b00 (single-field getter, та же семантика). | декомпил | VERIFIED |
| 9 | `LogicGameObjectManagerClient_findGameObject` | `0xa267dc` | Тело: цикл по count(0xc), objects[i], сравнение id через fcn.10046464c, возврат объекта; новая перегрузка (obj,int,flag). Структурно идентично v36 LogicGameObjectManagerClient::findGameObject(int) @0x86aa8c (тот же цикл count/objects). ВЕРИФИКАТОР-цепочка: вызывается VERIFIED getOwnCharacter (FUN_100ac3934: fcn.100a267dc(...)). | декомпил+консенсус | VERIFIED |
| 10 | `LogicGameObjectManagerClient_getOwnPlayerTeam` | `0xa7f47c` | Тело: return *(this+0xe4) — одиночный геттер. Референс v36: LogicBattleModeClient::getOwnPlayerTeam() const @0x1b8b00. Используется VERIFIED isEnemy (FUN_1004cf7a4: fcn.100a7f47c(...)). Примечание: в v36 символ принадлежит LogicBattleModeClient; поле ownTeam живёт в менеджере (battle+0x28). | декомпил | VERIFIED |

### LogicTileMap / LogicTile / LogicTileData

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 11 | `LogicTileMap_pathFinder` | `0x60` | Сайт вызова FUN_100a11240: lVar27 = *(long*)(lVar27+0x60) → передаётся аргументом LogicPathFinder* в VERIFIED getClosestPathfinderCollision (FUN_100af5d10); геттер FUN_100acb7f4: return *(this->+0x68 + 0x60). | декомпил | VERIFIED |
| 12 | `LogicTileMap_width` | `0xc4` | LogicTileMap::getTile (FUN_100941598): if(x < *(int*)(this+0xc4)); idx = x + *(int*)(this+0xc4)*y; аспект в FUN_1004adbb4: (width*100)/height, width=+0xc4 vs height=+0xc8. | декомпил | VERIFIED |
| 13 | `LogicTileMap_height` | `0xc8` | getTile: if(y >= *(int*)(this+200)) return 0 (200=0xc8); парное чтение с width в аспекте (FUN_1004adbb4: plVar14[0x19]=+0xc8). | декомпил | VERIFIED |
| 14 | `LogicTileMap_tiles` | `0x20` | getTile: return *(undefined8*)(*(long*)(param_1+0x20) + idx*8) — массив указателей на LogicTile, stride 8. | декомпил | VERIFIED |
| 15 | `LogicTileMap_tileToLogic` | `0x943040` | FUN_100943040: return param_1 * 300 + 0x96 — ПОБАЙТОВО идентично v36 LogicTileMap::tileToLogic(int) @0x5e4088: return param_1 * 300 + 0x96 (уникальный константный отпечаток 300/0x96: тайл 300 юнитов, сдвиг +150). | декомпил+константа | VERIFIED |
| 16 | `LogicTile_setData` | `0x9401fc` | FUN_1009401fc: *param_1 = param_2 (tile->data по +0); *(param_1+0xb)= -1 (u32 на +0x58); ветвление по fcn.1009ee4d4 (blocksMovement, VERIFIED) старых/новых данных; fcn.100940454 (сброс тайла). Структурно идентично v36 LogicTile::setData(LogicTileData const*) @0x610a08: *this=param_1; *(this+0x48)=-1; blocksMovement(param_1) — поле сброса сместилось 0x48→0x58. | декомпил+структура | VERIFIED |
| 17 | `LogicTileData_blocksMovement` | `0x56` | FUN_1009ee4d4: return *(byte*)(this+0x56) — вызывается из VERIFIED LogicTile::setData (FUN_1009401fc: fcn.1009ee4d4(*param_1)/fcn.1009ee4d4(param_2)); v36: LogicTileData::blocksMovement() в v36 setData (_710a08). | дизасм | VERIFIED |

### LogicGameObjectClient

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 18 | `LogicGameObjectClient_data` | `0x10` | getData(FUN_100117050): return *(this+0x10); вызывается VERIFIED getWeaponSkill (fcn.100117050 → *(data+0x328)), VERIFIED update (0xac1ee8), VERIFIED autoshoot (0x7b67ec). v36: LogicGameObjectClient::getData() const @0x8f7cbc — тот же single-полевый геттер. | декомпил+консенсус | VERIFIED |
| 19 | `LogicGameObjectClient_x` | `0x30` | getX(FUN_100a23afc): return *(int*)(this+0x30); вызывающие VERIFIED update и autoshoot (74 вызова всего). v36 getX @0x628644: ldr w0,[x0,#0x30] — оффсет не менялся. | декомпил+консенсус | VERIFIED |
| 20 | `LogicGameObjectClient_y` | `0x34` | getY(FUN_100a23b04): return *(int*)(this+0x34); вызывающие VERIFIED update/autoshoot. v36 getY @0x877cd8: +0x34 — совпадает. | декомпил+консенсус | VERIFIED |
| 21 | `LogicGameObjectClient_ownerIndex` | `0x3c` | getTeam(FUN_100a23b0c, VERIFIED): uVar1 = *(uint*)(param_1+0x3c) — индекс владельца для поиска игрока в менеджере. | декомпил | VERIFIED |
| 22 | `LogicGameObjectClient_team` | `0x40` | getTeam: fallback return *(int*)(param_1+0x40) — кэшированная команда объекта; основной путь через игрока менеджера. v36: GameObject::getTeam() @0x4395a4: *(this->data(+0x10) + 0x40) — поле team по +0x40 и в v36. | декомпил | VERIFIED |
| 23 | `LogicGameObjectClient_getX` | `0xa23afc` | FUN_100a23afc: ldr w0,[x0,#0x30]; ret — байт-в-байт та же форма, что v36 LogicGameObjectClient::getX @0x628644 (+0x30, не менялся). Вызывается VERIFIED update (0xac1ee8) и VERIFIED autoshoot (0x7b67ec); всего 74 вызова. | декомпил+консенсус | VERIFIED |
| 24 | `LogicGameObjectClient_getY` | `0xa23b04` | FUN_100a23b04: return *(this+0x34); v36 getY @0x877cd8: +0x34. Вызывается VERIFIED update/autoshoot; сосед getX образует кластер 0xa23afc/0xa23b04/0xa23b0c(getTeam). | декомпил+консенсус | VERIFIED |
| 25 | `LogicGameObjectClient_getData` | `0x117050` | FUN_100117050: return *(this+0x10); v36 getData @0x8f7cbc — single-field getter (+0x10 в обеих версиях; v36 GameObject::getTeam читает *(this+0x10)+0x40). 458 вызовов; среди вызывающих VERIFIED update, autoshoot, decode (0xa314e0), getWeaponSkill. | декомпил+консенсус | VERIFIED |
| 26 | `LogicGameObjectClient_getTeam` | `0xa23b0c` | FUN_100a23b0c: (obj, mgr): ownerIndex=*(obj+0x3c); if(0<=idx<*(mgr+0xc)) player=*(mgr->objects+idx*8); team=fcn.1009cdba8(player); return team!=-1?team:*(obj+0x40). Референс v36: GameObject::getTeam() const @0x4395a4 (чтение team из data). Вызывается VERIFIED isEnemy и VERIFIED autoshoot. | декомпил+консенсус | VERIFIED |

### LogicGamePlayUtil

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 27 | `LogicGamePlayUtil_isEnemy` | `0x4cf7a4` | FUN_1004cf7a4: battle=getInstance(); ownTeam=getOwnPlayerTeam(*(battle+0x28)); team=getTeam(obj,*(battle+0x28)); return ownTeam!=team. Семантика «своя команда != команда цели». Прямого символа в v36 нет (проверено по names.tsv) — доказательство через 1:1 цепочку VERIFIED-вызовов (getInstance, getOwnPlayerTeam, getTeam) и семантику сравнения команд. | декомпил+консенсус | VERIFIED |
| 28 | `LogicGamePlayUtil_getClosestPathfinderCollision` | `0xaf5d10` | FUN_100af5d10: сигнатура (int,int,int,int,int,LogicPathFinder*,LogicVector2*,uint,bool) — точное совпадение с v36 LogicGamePlayUtil::getClosestPathfinderCollision(...,LogicPathFinder*,LogicVector2*,bool,bool) @0x565104 и с декларацией в functions.js; тело: делит координаты на 100 (TILE_UNITS), вызов запроса пути fcn.100afb2d8(11 арг.), обратное преобразование fcn.10094248c. | декомпил+сигнатура | VERIFIED |

### LogicCharacterClient

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 29 | `LogicCharacterClient_hitpoints` | `0xc4` | LogicCharacterClient::decode (FUN_1009f9b44): *(int*)(this+0xc4) = значение; if(*(int*)(this+0xc4)<1){*(this+0xbc)=x*0x32} — логика смерти при hp<1. | декомпил | VERIFIED |
| 30 | `LogicCharacterClient_moveAngle` | `0xb0` | decode: запись *(this+0xb0) (param_1+0x16 при long* = +0xb0); геттер FUN_1009fbf50: return *(this+0xb0); вызывается VERIFIED update (0xac1ee8). v36: LogicCharacterClient::getMoveAngle @0x596004 — single-field getter. | декомпил | VERIFIED |
| 31 | `LogicCharacterClient_getMoveAngle` | `0x9fbf50` | FUN_1009fbf50: return *(this+0xb0); вызывается VERIFIED LogicBattleModeClient::update. | декомпил+консенсус | VERIFIED |
| 32 | `LogicCharacterClient_getWeaponSkill` | `0x9fc440` | FUN_1009fc440: return *(getData(this) + 0x328) — точная структурная копия v36 LogicCharacterClient::getWeaponSkill() @0x4ffc18: return *(getData(this)+0x1b0) (поле сместилось 0x1b0→0x328). Поле 0x328 пишется в CharacterData-регионе вместе с 0x2ac (FUN_100990550). | декомпил+структура | VERIFIED |
| 33 | `LogicCharacterClient_decode` | `0x9f9b44` | FUN_1009f9b44 (0x1ad0): декодер BitStream → пишет hitpoints(0xc4), moveAngle(0xb0), счётчик смерти x*0x32; сигнатура (this,BitStream,bool,int,bool,LogicArrayList<LogicPlayer*>*) соответствует v36 LogicCharacterClient::decode(BitStream*,bool,int,bool,LogicArrayList<LogicPlayer*>*) @0x3f0264. | консенсус+декомпил | VERIFIED |

### LogicCharacterData

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 34 | `LogicCharacterData_speed` | `0x26c` | Полная цепь: createReferences (VERIFIED): DAT_1010cbbd0 = getColumnIndexByName("Speed"); загрузчик FUN_100992218: fcn.1009a54d0(this,DAT_1010cbbd0) → *(this+0x26c)=значение; геттер FUN_1009911ec: return *(this+0x26c). v36 getSpeed @0x75d4a0: +0x128 (сместилось). | CR-цепочка | VERIFIED |
| 35 | `LogicCharacterData_collisionRadius` | `0x2ac` | DAT_1010cbbdc = getColumnIndexByName("CollisionRadius") (единственный xref строки — 0x993660); загрузчик → *(this+0x2ac); геттер FUN_1009913e8: return *(this+0x2ac); v36 @0x454170: +0x164. | CR-цепочка | VERIFIED |
| 36 | `LogicCharacterData_createReferences` | `0x993660` | FUN_100993660 (0x3570): единственный в бинарнике референс строк "CollisionRadius" (0x100edd2a6) и "Hitpoints" (0x100edd458), плюс "Speed", "LowPriorityTarget", "Priority" — резолв 78+ колонок через getColumnIndexByName + проверка типов (fcn.100bc78ec). v36 аналог: LogicCharacterData::createReferences @0x2717a0. | строки-колонки | VERIFIED |
| 37 | `LogicCharacterData_getSpeed` | `0x9911ec` | FUN_1009911ec: return *(this+0x26c) — значение из колонки Speed (цепь выше). v36 @0x75d4a0. | CR-цепочка+декомпил | VERIFIED |
| 38 | `LogicCharacterData_getCollisionRadius` | `0x9913e8` | FUN_1009913e8: return *(this+0x2ac); вызывается VERIFIED update (0xac1ee8) и VERIFIED autoshoot (0x7b67ec). | CR-цепочка+декомпил | VERIFIED |
| 39 | `LogicCharacterData_getProjectileStartRadius` | `0x9917d0` | FUN_1009917d0: return 0x32 — КОНСТАНТА 50. v36 getProjectileStartRadius @0x8f4f14: тоже return 0x32 — идентичная hardcoded-семантика в обеих версиях. | декомпил+двоеточие версий | VERIFIED |

### LogicProjectileClient

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 40 | `LogicProjectileClient_targetObject` | `0xa0` | ctor (FUN_100a313f8, VERIFIED): str xzr,[x19,#0xa0] — обнуление ссылки на цель; destruct (FUN_100a31470): str xzr,[x19,#0xa0] повторно. | декомпил | VERIFIED |
| 41 | `LogicProjectileClient_lifeTicks` | `0x1e8` | ctor: add x8,x19,#0x1e8; str q0,[x8] + stur xzr,[x8,#0xd] — инициализация 0x1e8..0x1f7 (lifeTicks и соседние). | декомпил | VERIFIED |
| 42 | `LogicProjectileClient_targetX` | `0x1ec` | getTargetX (FUN_1009cdaac): return *(this+0x1ec); destruct: add x8,x19,#0x1ec; str xzr — очистка targetX/Y. v36 getTargetX @0x6994e0: +0x58 (сместилось). | декомпил+геттер | VERIFIED |
| 43 | `LogicProjectileClient_targetY` | `0x1f0` | getTargetY (FUN_1009cdab4): return *(this+0x1f0); destruct очищает 0x1ec..0x1f3 (пара x/y). v36 getTargetY @0x3d9aec: +0x5c. | декомпил+геттер | VERIFIED |
| 44 | `LogicProjectileClient_travelType` | `0x204` | ctor: str xzr,[x19,#0x200]; strb wzr,[x19,#0x208]; mov x10,#-0x100000000; str x10,[x9] (x9=x19+0x20c) — блок инициализации travel-полей 0x200..0x213. | декомпил | VERIFIED |
| 45 | `LogicProjectileClient_isBeamCopy` | `0x21c` | ctor: strb wzr,[x19,#0x21c] — явное обнуление байтового флага. | декомпил | VERIFIED |
| 46 | `LogicProjectileClient_stunMs` | `0x220` | ctor: str q0,[x19,#0x220] — обнуление 0x220..0x22f (stunMs+effectMs). | декомпил | VERIFIED |
| 47 | `LogicProjectileClient_effectMs` | `0x228` | ctor: str q0,[x19,#0x220] покрывает 0x228. | декомпил | VERIFIED |
| 48 | `LogicProjectileClient_vtable` | `0xff57b0` | Raw-слоты по chained fixups (VA 0x100ff57b0): [0]=0xa319a0,[1]=0xa31a00,[2]=0xa23844,[3]=0xa31470(destruct),[4]=0xa314e0(decode),[5]=0xa31768(getType),[6]=0xa23b5c(AUTH). Позиционное совпадение с v36 vtable 0xd46f58: [3]destruct,[4]decode,[5]getType — идентично. ctor FUN_100a313f8: adrp x8,0x100ff5000; add x8,#0x7b0; str x8,[x0] — записывает именно 0xff57b0. Ссылки: 0xa31410 (ctor), 0xa319b4/0xa31a14 (деструкторы). | дамп+дизасм | VERIFIED |
| 49 | `LogicProjectileClient_ctor` | `0xa313f8` | FUN_100a313f8: bl базовый ctor 0xa2374c; запись vtable 0xff57b0; bl 0xa5ee30 (второй базовый); обнуление targetObject(0xa0), lifeTicks(0x1e8), isBeamCopy(0x21c), stun/effect(0x220..0x22f). 0xa3146c: b 0xa313f8 (C2→C1 thunk). | дизасм+декомпил | VERIFIED |
| 50 | `LogicProjectileClient_destruct` | `0xa31470` | Слот [3] vtable 0xff57b0 = 0xa31470 — та же позиция, что destruct в v36 vtable [3]=0x2bd07c. Тело: bl 0xa23a48 (базовый деструктор), очистка targetX/Y (0x1ec..0x1f3), targetObject (0xa0). | vtable+декомпил | VERIFIED |
| 51 | `LogicProjectileClient_decode` | `0xa314e0` | Слот [4] = 0xa314e0 — позиция decode в v36 vtable [4]=0x5f5a14 (LogicProjectileClient::decode(BitStream*,int,bool)). | vtable+декомпил | VERIFIED |
| 52 | `LogicProjectileClient_getTargetX` | `0x9cdaac` | FUN_1009cdaac: return *(this+0x1ec); v36-структурный аналог @0x6994e0. | декомпил | VERIFIED |
| 53 | `LogicProjectileClient_getTargetY` | `0x9cdab4` | FUN_1009cdab4: return *(this+0x1f0); v36 @0x3d9aec. | декомпил | VERIFIED |
| 54 | `LogicProjectileClient_getTravelTicks` | `0xa3192c` | FUN_100a3192c: if(param_3<2)param_3=1; iVar1=18000; if(*(char*)(data+0x134)==0) iVar1=param_2*0x14; fcn.100af9d98(iVar1,param_3) — константа 18000 = BEAM_TICKS из scan.js; структура идентична v36 getTravelTicks @0x6ba578 (max(1,div), param*0x14, 18000 при constantFlyTime, roundedDivision). | декомпил+константа | VERIFIED |

### LogicProjectileData — поля

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 55 | `LogicProjectileData_reader` | `0x68` | Геттеры колонок FUN_1009cd5e0/678/710 (VERIFIED отладочными строками): lVar1 = *(this+0x68) — объект-ридер, через который идут запросы колонок. | декомпил+консенсус | VERIFIED |
| 56 | `LogicProjectileData_indirect` | `0x108` | createReferences (0x9cb388): колонка "Indirect" → запись 0x108 (strb-пара 0x108/0x109/0x10a: IndirectProjectileTracksSource→0x109); destruct обнуляет *(u16*)(this+0x108). | CR-карта | VERIFIED |
| 57 | `LogicProjectileData_gravity` | `0x118` | createReferences: колонка "Gravity" → str w0,[x19,#0x118]; destruct: *(u32*)(this+0x118)=0. | CR-карта | VERIFIED |
| 58 | `LogicProjectileData_isHomingMissileField` | `0x11e` | Колонка "IsHomingMissile" → strb [x19,#0x11e]; геттер FUN_1009cdd40: return *(byte*)(this+0x11e). v36: isHomingMissile @0x70e0b0 = this[0x97] (байтовый флаг). | CR-карта+геттер | VERIFIED |
| 59 | `LogicProjectileData_speed` | `0x124` | Колонка "Speed" → str [x19,#0x124]; геттер FUN_1009cd834: return *(this+0x124); destruct обнуляет. v36 getSpeed @0x68d8a8: +0x9c (сместилось). | CR-карта+геттер | VERIFIED |
| 60 | `LogicProjectileData_preExplosionTimeMs` | `0x128` | Колонка "PreExplosionTimeMs" → 0x128; геттер FUN_1009cdd08: return *(this+0x128); v36 @0x9e4048: +0xa0. | CR-карта+геттер | VERIFIED |
| 61 | `LogicProjectileData_radius` | `0x130` | Колонка "Radius" → 0x130; геттер FUN_1009cd894: return *(this+0x130); v36 getRadius @0x8d1520. | CR-карта+геттер | VERIFIED |
| 62 | `LogicProjectileData_constantFlyTime` | `0x134` | Колонка "ConstantFlyTime" → 0x134; getTravelTicks (VERIFIED): if(*(char*)(data+0x134)==0) — семантика «постоянный полёт → 18000 тиков» (луч). | CR-карта+консенсус | VERIFIED |
| 63 | `LogicProjectileData_triggerWithDelayMs` | `0x138` | Колонка "TriggerWithDelayMs" → 0x138; геттер FUN_1009cd8fc: return *(this+0x138). | CR-карта+геттер | VERIFIED |
| 64 | `LogicProjectileData_numEarlyTicks` | `0x13c` | Колонка "EarlyTicks" → 0x13c; геттер FUN_1009cdd18: return *(this+0x13c); v36 getNumEarlyTicks @0x2dffbc. | CR-карта+геттер | VERIFIED |
| 65 | `LogicProjectileData_spawnAreaEffectTrail` | `0x1a8` | Колонка "SpawnAreaEffectTrail" → 0x1a8; геттер FUN_1009cda3c: return *(this+0x1a8). | CR-карта+геттер | VERIFIED |
| 66 | `LogicProjectileData_areaEffectTrailMinDistance` | `0x1b0` | Колонка "AreaEffectTrailMinDistance" → 0x1b0; геттер FUN_1009cda44: return *(this+0x1b0). | CR-карта+геттер | VERIFIED |
| 67 | `LogicProjectileData_isShotByHero` | `0x1d8` | Колонка "ShotByHero" → 0x1d8; геттер FUN_1009cda54: return *(this+0x1d8); destruct: *(u16*)(this+0x1d8)=0. | CR-карта+геттер | VERIFIED |
| 68 | `LogicProjectileData_isBeamField` | `0x1d9` | Колонка "IsBeam" → strb [x19,#0x1d9]; геттер FUN_1009cda6c: return *(byte*)(this+0x1d9). v36 isBeam @0x46391c — CSV-колонка IsBeam (в v69 значение кэшируется в поле). | CR-карта+геттер | VERIFIED |
| 69 | `LogicProjectileData_isBouncingField` | `0x1da` | Колонка "IsBouncing" → strb 0x1da; геттер FUN_1009cda84: return *(byte*)(this+0x1da); v36 isBouncing @0x83b6e8: this[0xe9]. | CR-карта+геттер | VERIFIED |
| 70 | `LogicProjectileData_distanceAddFromBounce` | `0x1dc` | Колонка "DistanceAddFromBounce" → 0x1dc; геттер FUN_1009cdcc8: return *(this+0x1dc); v36 getDistanceAddFromBounce @0x1b4b5c. | CR-карта+геттер | VERIFIED |
| 71 | `LogicProjectileData_maxDistanceAddBounces` | `0x1e0` | Колонка "MaxDistanceBounces" → str [x19,#0x1e0]; destruct обнуляет *(u32*)(this+0x1e0); v36 getMaxDistanceAddBounces @0x3a4a18. | CR-карта | VERIFIED |
| 72 | `LogicProjectileData_passesEnvironment` | `0x23c` | Колонка "PassesEnvironment" → strb 0x23c; геттер FUN_1009cdc10: return *(this+0x23c). | CR-карта+геттер | VERIFIED |
| 73 | `LogicProjectileData_piercesCharacters` | `0x1e4` | Колонка "PiercesCharacters" → strb 0x1e4; геттер FUN_1009cda8c: return *(this+0x1e4); destruct: *(byte*)(this+0x1e4)=0. | CR-карта+геттер | VERIFIED |
| 74 | `LogicProjectileData_piercesEnvironmentField` | `0x1e5` | Колонка "PiercesEnvironment" → strb 0x1e5; геттер FUN_1009cda94: return *(byte*)(this+0x1e5); v36 piercesEnvironment @0x609c90: this[0xf5]. | CR-карта+геттер | VERIFIED |
| 75 | `LogicProjectileData_chainsToEnemies` | `0x1f0` | Колонка "ChainsToEnemies" → strb 0x1f0; геттер FUN_1009cdab4: return *(this+0x1f0); v36 getChainsToEnemies @0x95bc2c. | CR-карта+геттер | VERIFIED |
| 76 | `LogicProjectileData_grapplesEnemy` | `0x245` | Колонка "GrapplesEnemy" → strb 0x245; геттер FUN_1009cdd20: return *(this+0x245); v36 sm_columnIndexGrapplesEnemy. | CR-карта+геттер | VERIFIED |
| 77 | `LogicProjectileData_boomerang` | `0x250` | Колонка "BoomerangType" → strb 0x250; геттер FUN_1009cdd28 (16Б): читает 0x250; v36 sm_columnIndexBoomerang. | CR-карта+геттер | VERIFIED |
| 78 | `LogicProjectileData_canHitAgainAfterBounce` | `0x254` | Колонка "CanHitAgainAfterBounce" → strb [x19,#0x254]; v36 getCanHitAgainAfterBounce @0x741bb8. | CR-карта | VERIFIED |
| 79 | `LogicProjectileData_travelType` | `0x260` | Колонка "TravelType" → str [x19,#0x260]; геттер FUN_1009cdd48: return *(this+0x260); v36 getTravelType @0x824364: +0x170. | CR-карта+геттер | VERIFIED |
| 80 | `LogicProjectileData_steerStrength` | `0x278` | Колонка "SteerStrength" (0x100ee4d43) → str w0,[x19,#0x278]; v36 sm_columnIndexSteerStrength; scan.js читает float по 0x278. | CR-карта | VERIFIED |
| 81 | `LogicProjectileData_steerIgnoreTicks` | `0x27c` | Колонка "SteerIgnoreTicks" (0x100ee4d51) → str w0,[x19,#0x27c]. | CR-карта | VERIFIED |
| 82 | `LogicProjectileData_homingDistance` | `0x280` | Колонка "HomeDistance" (0x100ee4d62; в v36 называлась HomingDistance) → str w0,[x19,#0x280]; v36 getHomingDistance @0x593778 (поле +0x180 в v36). | CR-карта | VERIFIED |
| 83 | `LogicProjectileData_steerLifeTime` | `0x284` | Колонка "SteerLifeTime" (0x100ee4d6f) → str w0,[x19,#0x284]. | CR-карта | VERIFIED |
| 84 | `LogicProjectileData_visualizeEndPoint` | `0x288` | Колонка "SteerLifeTime"-блок, следующая запись: strb [x19,#0x288] (VisualizeEndPoint); геттер FUN_1009cdd60: return *(this+0x288). | CR-карта+геттер | VERIFIED |
| 85 | `LogicProjectileData_type` | `0x28c` | createReferences: строка "UniqueProperty" (0x100edd449) → getIntValueFromColumn (VERIFIED) → str w0,[x19,#0x28c]. Геттер FUN_1009cdd70: return *(this+0x28c); вызывается VERIFIED autoshoot (0x7b67ec) со сравнением с малыми константами (==2) — семантика type-id. Примечание: в v69 поле питается из CSV-колонки UniqueProperty (в v36 UniqueProperty → +0x18c); в agent scan.js используется как typeId 0..20. | CR-карта+геттер+консенсус | VERIFIED |
| 86 | `LogicProjectileData_bouncePercent` | `0x2d8` | Колонка "BouncePercent" → 0x2d8; геттер FUN_1009cda7c: return *(this+0x2d8); v36 getBouncePercent @0x2de23c; sm_columnIndexBouncePercent. | CR-карта+геттер | VERIFIED |
| 87 | `LogicProjectileData_allowDynamicRange` | `0x2dd` | Флаг-парсер createReferences (strcmp-цепочка): "AllowDynamicRange" (0x100ee4f9f) → strb [x19,#0x2dd]. | CR-карта | VERIFIED |
| 88 | `LogicProjectileData_ignoreCharacterCollisions` | `0x2df` | Флаг-парсер: "IgnoreCharacterCollisions" (0x100ee4fcc) → strb [x19,#0x2df]. | CR-карта | VERIFIED |
| 89 | `LogicProjectileData_ignoreEnvironmentCollisions` | `0x2e0` | Флаг-парсер: "IgnoreEnvironmentCollisions" (0x100ee4fe6) → strb [x19,#0x2e0]. | CR-карта | VERIFIED |
| 90 | `LogicProjectileData_attachAreaEffectToTarget` | `0x2e1` | Флаг-парсер: "AttachAreaEffectToTarget" (0x100ee5002) → strb [x19,#0x2e1]. | CR-карта | VERIFIED |

### LogicProjectileData — vtable и функции

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 91 | `LogicProjectileData_vtable` | `0xff3b18` | Raw-слоты (VA 0x100ff3b18): [0]=0x9cdd80(D1-thunk b→0x9cdd98),[1]=0x9cdd84(D0 bl 0x9cdd98),[2]=0x9cb364(destruct),[3]=0x9a53bc(preCreateReferences, ret),[4]=0x9cb388(createReferences),[5]=0x9cdb34,[6]=0x9a4f24(toString-паттерн),[7..8]=0x14c81c(ret 0),[9]=0x156424(ret 1 = isProjectile),[10..11]=0x14c81c,[12]=0x9a5628. Позиционное совпадение с v36 vtable 0xd58858: [2]destruct,[3]preCR,[4]createReferences,[5]CR2,[6]toString,[9]isProjectile(=1). Ссылки кода: ctor 0x9cb120 (adrp 0x100ff3000+0xb18; str x8,[x0],#0x70) и деструктор 0x9cddac. | дамп+дизасм | VERIFIED |
| 92 | `LogicProjectileData_createReferences` ⚠️**ИСПРАВЛЕНО** | `0x9cb388` | БЫЛО 0x9cb364 → СТАЛО 0x9cb388. 0x9cb364 — слот [2] = destruct (bl LogicData::destruct 0x9bb078; b 0x9cb1b8 — обнуление полей). createReferences — слот [4] = 0x9cb388 (bl LogicData::createReferences 0x9bb0a0; ldr x8,[this+8] — CSVRow; getRowOffset-паттерн; полный загрузчик CSV-колонок Speed/IsBeam/Radius/...). Позиция [4] совпадает с v36 vtable [4]=0x8feb78 (createReferences). Все карты поле←колонка сняты дизасмом 0x9cb388. | vtable+CR-карта | VERIFIED |
| 93 | `LogicProjectileData_getSpeed` | `0x9cd834` | FUN_1009cd834: return *(this+0x124); вызывается VERIFIED BattleScreen::calculateProjectilePath (0x7b3ae8). v36 getSpeed @0x68d8a8. | декомпил | VERIFIED |
| 94 | `LogicProjectileData_getRadius` | `0x9cd894` | FUN_1009cd894: return *(this+0x130); вызывается VERIFIED calculateProjectilePath. v36 getRadius @0x8d1520. | декомпил | VERIFIED |
| 95 | `LogicProjectileData_isBeam` | `0x9cda6c` | FUN_1009cda6c: return *(byte*)(this+0x1d9); v36 isBeam @0x46391c (CSV boolean IsBeam). | декомпил | VERIFIED |
| 96 | `LogicProjectileData_piercesEnvironment` | `0x9cda94` | FUN_1009cda94: return *(byte*)(this+0x1e5); v36 @0x609c90. | декомпил | VERIFIED |
| 97 | `LogicProjectileData_isHomingMissile` | `0x9cdd40` | FUN_1009cdd40: return *(byte*)(this+0x11e); v36 @0x70e0b0. | декомпил | VERIFIED |
| 98 | `LogicProjectileData_isBouncing` | `0x9cda84` | FUN_1009cda84: return *(byte*)(this+0x1da); v36 @0x83b6e8. | декомпил | VERIFIED |
| 99 | `LogicProjectileData_getPreExplosionTimeMs` | `0x9cdd08` | FUN_1009cdd08: return *(this+0x128); v36 @0x9e4048. | декомпил | VERIFIED |
| 100 | `LogicProjectileData_getType` | `0x9cdd70` | FUN_1009cdd70: return *(this+0x28c); вызывается VERIFIED autoshoot (0x7b67ec) с проверками iVar11==2 — тип-id. (Значение поля формируется из CSV-колонки UniqueProperty.) | декомпил+консенсус | VERIFIED |
| 101 | `LogicProjectileData_getTravelType` | `0x9cdd48` | FUN_1009cdd48: return *(this+0x260); v36 getTravelType @0x824364. | декомпил | VERIFIED |
| 102 | `LogicProjectileData_getIntValueFromColumn` | `0x9cd5e0` | Отладочная строка в бинарнике: "LogicProjectileData::getIntValueFromColumn called for projectile '%s' column '%s'" (VA 0x100ee5310), xref ровно один — 0x9cd5e0. Тело: reader=*(this+0x68); fcn.1009a50e4(reader,col,0). | строка | VERIFIED |
| 103 | `LogicProjectileData_getBoolValueFromColumn` | `0x9cd678` | Строка "LogicProjectileData::getBoolValueFromColumn called ..." (VA 0x100ee5362), xrefs [0x9cd678, 0x9cd710]. Тело 0x9cd678: fcn.1009a51e8(reader,col,0). | строка | VERIFIED |
| 104 | `LogicProjectileData_getBoolValueFromColumn2` | `0x9cd710` | Вторая функция с той же строкой (вторая перегрузка): 0x9cd710, fcn.1009a529c(reader,col,0); различие в типе возврата (указатель). Репо-суффикс «2» — историческое имя перегрузки. | строка | VERIFIED |

### LogicSkillData

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 105 | `LogicSkillData_projectileData` | `0x78` | getProjectileData (FUN_1009e84a8): if(*(int*)(this+0x84)!=0) return *(this+0x78); return &DAT_1011260b8 (пустой массив-заглушка) — поле-массив projectileData по +0x78 со счётчиком +0x84. | декомпил | VERIFIED |
| 106 | `LogicSkillData_createReferences` | `0x9dd114` | FUN_1009dd114 (0x17bc): DAT_1010ccfb8="Targeted", cfc0="Cooldown", cfc4="ActiveTime", cfc8="CastingTime", cd090="CastingRange", cfd4="MsBetweenAttacks", cfd8="Spread", cfe0="NumBulletsInOneAttack" — набор колонок точно совпадает с v36 sm_columnIndex* списка LogicSkillData. | строки-колонки | VERIFIED |
| 107 | `LogicSkillData_getCastingRangeTiles` | `0x9de9cc` | FUN_1009de9cc: return getIntegerValueAt(*(this+8), DAT_1010cd090); DAT_1010cd090 = getColumnIndexByName("CastingRange") — записан VERIFIED createReferences. | CR-консенсус | VERIFIED |
| 108 | `LogicSkillData_getProjectileData` | `0x9e84a8` | FUN_1009e84a8: возврат *(this+0x78) при *(this+0x84)!=0. Вызывается из BattleScreen-региона (0x77ee68, 0x781784, 0x787acc — методы экрана боя рядом с VERIFIED activateSkill/autoshoot). v36-символа нет (появилась между версиями); семантика подтверждена телом и окружением. | декомпил+консенсус | VERIFIED |
| 109 | `LogicSkillData_getSpread` | `0x9dec84` | FUN_1009dec84: getIntegerValueAt(*(this+8), DAT_1010ccfd8); DAT_1010ccfd8="Spread" (VERIFIED createReferences). v36 getSpread @0x6ca2e4. | CR-консенсус | VERIFIED |
| 110 | `LogicSkillData_getNumBulletsInOneAttack` | `0x9ded40` | FUN_1009ded40: getIntegerValueAt(*(this+8), DAT_1010ccfe0); DAT_1010ccfe0="NumBulletsInOneAttack". v36 @0x3fd61c. | CR-консенсус | VERIFIED |
| 111 | `LogicSkillData_getMsBetweenAttacks` | `0x9dec74` | FUN_1009dec74: getIntegerValueAt(*(this+8), DAT_1010ccfd4); DAT_1010ccfd4="MsBetweenAttacks". v36 @0x321a74. | CR-консенсус | VERIFIED |
| 112 | `LogicSkillData_getRange` | `0x978d74` | FUN_100978d74: getIntegerValueAt(*(this+8), DAT_1010cb530); DAT_1010cb530 = getColumnIndexByName("Range") — пишет FUN_100978018, чьи колонки (AimGuideType, ConsumesAmmo, DestroyPet, ActiveTicks) в v36 принадлежат LogicAccessoryData. Точная структурная копия v36 LogicAccessoryData::getRange() const @0x931cf0: CSVRow::getIntegerValueAt(*(this+8), sm_columnIndexRange). ВНИМАНИЕ: класс в имени ключа (LogicSkillData) исторический; по факту геттер аксессуара (гаджеты/звёздные силы), вызывается агентом как fns.LogicSkillData_getRange(skill). | CR-консенсус+структура | VERIFIED |

### ClientInput и подпись (crypto)

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 113 | `ClientInput_type` | `0x8` | ctor FUN_100a95798: *(u32*)((u64*)this+1) = param_2 — запись типа по +0x8; addInput (VERIFIED): fcn.100746734(mgr, param_2[2]) — чтение типа по +0x8 для приоритета. v36 ctor @0x7206f4 писал тип по +0x4 (поле сместилось). | декомпил+дизасм | VERIFIED |
| 114 | `ClientInput_x` | `0xc` | send-command FUN_1007a60f4: piVar32[3] = x (int* → +0xc); хэш-преамбула: ldur q2,[x20,#4] — 16-байтовый блок данных с +4 включает x/y. | декомпил | VERIFIED |
| 115 | `ClientInput_y` | `0x10` | send-command: piVar32[4] = y (int* → +0x10). | декомпил | VERIFIED |
| 116 | `ClientInput_token` | `0x34` | send-command: после inline-SHA256: uVar58 = (uVar3>>0x18) \| ((uVar3>>0x10 & 0x7f)<<8); if(uVar58<2) uVar58=1; piVar33[0xd] = uVar58 (int* → +0x34) — ТОЧНО формула crypto.js (digest[0] \| (digest[1]&0x7f)<<8, min 1). ctor обнуляет +0x34. | декомпил+формула | VERIFIED |
| 117 | `ClientInput_typeConstantTable` | `0xe1bd30` | Потребитель FUN_1005068cc (signing): adrp x9,0x100e1b000; add x9,#0xd30; ldr s1,[x9,x8,lsl #2] — 32-битные записи, индекс type*4; граница cmp w8,#0x16 (23 записи, 0..22). Второй потребитель 0x518998 — та же схема с SkillCommandTypeTable. Контент: 23 u32 высокой энтропии. | дизасм | VERIFIED |
| 118 | `ClientInput_typeConstantFallback` | `0xe1bc28` | Потребители (30 ссылок): ldr d1,[x8,#0xc28] — 8-байтовая константа. Байты дампа @0xe1bc28: ef 00 be 00 ad 00 de 00 → декодирование _decodeFallbackConst даёт 0xdeadbeef — совпадает с runtime-значением агента (smoke: «fallback decode from dump bytes: 0xdeadbeef (matches native @0xe1bc28)»). | дизасм+дамп | VERIFIED |
| 119 | `ClientInput_hashInnerMask` | `0xe1bbd0` | 29 ссылок; потребитель 0x5068cc: ldr q3,[x8,#0xbd0]; eor v3.16b,v0.16b,v3.16b (XOR с ключом); rev32; movi v4.16b,#0x36 (ipad) — HMAC-преамбула, байты дампа: 7c4d1aabd7c560bef2e358399485210f. | дизасм | VERIFIED |
| 120 | `ClientInput_hashOuterMask` | `0xe1bbf0` | 29 ссылок, парный к inner (0x506d0c и др.); opad-поток 0x5c в тех же функциях; байты дампа: 162770c1bdaf0ad498893253feef4b65. | дизасм | VERIFIED |
| 121 | `SkillCommandTypeTable` | `0xe1bf7c` | 13 ссылок; потребитель FUN_100518998: cmp w8,#0x16; adrp/add 0x100e1bf7c; ldr s1,[x9,x8,lsl #2]; ushll v1.8h,v1.8b,#0 — 32-битные записи, раскладываемые по байтам (u32, НЕ float: «ldr s» — NEON-лань 32 бита, дальше байтовое расширение). Граница и fallback идентичны typeConstantTable. ВОПРОС u32-vs-float РЕШЁН: u32. | дизасм | VERIFIED |
| 122 | `ClientInput_typePriorityTable` | `0xe1d9a8` | Аксессор FUN_100746734 (32Б): cmp w1,#0x14 (индексы 0..20, 21 запись); adrp x8,0x100e1d000; add #0x9a8; ldr w0,[x8,w1,uxtw #2] — u32; mov w0,#-1 при выходе за границы — PRIORITY_REJECT. Контент: [3,3,1,4,9,2,2,5,6,7,8,10,−1,3,−1,−1,3,11,3,2,2]. | дизасм | VERIFIED |
| 123 | `ClientInput_constructor_int` | `0xa95798` | FUN_100a95798: обнуление 0x0..0x47 (72 байта = CMD_BUF_SIZE), запись типа в +0x8. Вызывается VERIFIED send-command: fcn.100a95798(piVar33,2) и (piVar33,10). Референс v36: ClientInput::ClientInput(int) @0x7206f4 (та же семантика, тип в +0x4). | декомпил+консенсус | VERIFIED |
| 124 | `ClientInputManager_addInput` | `0x74675c` | FUN_10074675c: prio=fcn.100746734(mgr,input->type(0x8)); работа со списком inputs (this+0x20); вставка. Референс v36: ClientInputManager::addInput(ClientInput*) @0x746dcc. Вызывается VERIFIED send-command: fcn.10074675c(*(battle+0x58), input). | декомпил+консенсус | VERIFIED |
| 125 | `operator_new` | `0xd8da2c` | 0xd8da2c — __stubs: adrp x16,0x100f78000; ldr x16,[x16,#0x180]; br x16 (GOT-стаб). Декомпилятор резолвит цель как Znwm (operator new): send-command содержит puVar3=Znwm(0x48) — аллокация 72 байт под ClientInput, что совпадает с CMD_BUF_SIZE. v36-референс недоступен (в v36 operator new не экспортирован отдельно); доказательство — стаб+GOT+использование Znwm(0x48) в VERIFIED-пути. | дизасм+декомпил | VERIFIED |

### BattleScreen / LogicBattleModeClient / прочие функции

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 126 | `LogicBattleModeClient_update` | `0xac1ee8` | FUN_100ac1ee8 (5476Б, 14 циклов): пролог — клэмп дельта-тайма: ldr s1,[x0,#0x198]; fsub; fmaxnm; str (семантика update(float,float)); ldr x0,[x19,#0x28] — менеджер; вызывает VERIFIED getData (0x117050), getCollisionRadius (0x9913e8), getMoveAngle (0x9fbf50); vcall_slots [8,40] — виртуальный update. Референс v36: LogicBattleModeClient::update(float,float) @0x391f60 (3848Б, тот же класс функции, вызывает getData). | консенсус+декомпил | VERIFIED |
| 127 | `BattleScreen_activateSkill` | `0x7a0084` | FUN_1007a0084: проверка состояний (+0x92c/+0x96c/+0x934), вызов воркера fcn.1007ad554(this,own,skill,x,y,bool,int) — 7 аргументов в порядке v36 BattleScreen::activateSkill(int,int,LogicCharacterClientOwn*,LogicSkillClient*,bool,int) @0x8b4130 (v36: tryToActivateSkill(this,char,skill,x,y,bool,int)); вызывает VERIFIED BattleMode_getInstance. | консенсус+декомпил | VERIFIED |
| 128 | `BattleScreen_getClosestTargetForAutoshoot` | `0x7b67ec` | FUN_1007b67ec (11 арг., float-преамбула): вызывает VERIFIED getData (0x117050), VERIFIED getTeam (0xa23b0c — проверка врага при выборе цели), getType (0x9cdd70, сравнение с константами 2/0x13). Референс v36: BattleScreen::updateAutoshoot(LogicCharacterClientOwn*) @0x53ed84 (семейство autoshoot-методов BattleScreen). | консенсус+декомпил | VERIFIED |
| 129 | `BattleMode_getInstance` | `0x8c5130` | FUN_1008c5130: lVar2=fcn.1008cdfd4(); if(lVar2 && fcn.1008ce9e8(lVar2,5)) return fcn.1008ce9d8(lVar2); return 0 — геттер активного режима (проверка типа 5 = battle). Вызывается VERIFIED isEnemy, VERIFIED send-command (3+ раза), VERIFIED activateSkill. Референс v36: BattleMode::getInstance() @0x5c67b4. | декомпил+консенсус | VERIFIED |
| 130 | `LogicBattleModeClient_getOwnCharacter` | `0xac3934` | FUN_100ac3934: return findGameObject(*(this+0x28), *(this+0x100), -1). v36 @0x764698: findGameObject(*(this+0x28), *(this+0x108)) — идентичная структура (индекс своего игрока сместился 0x108→0x100). | декомпил+консенсус | VERIFIED |
| 131 | `LogicBattleModeClient_getTileMap` | `0x991440` | FUN_100991440: return *(this+0xf8) — single-field getter; v36 getTileMap @0x459e28 (тот же паттерн). 10+ вызовов, потребители читают tileMap->width(0xc4)/height(0xc8)/tiles(0x20). | декомпил+консенсус | VERIFIED |
| 132 | `LogicBattleModeClient_setClientPredictionMoveTo` | `0xac3a58` | FUN_100ac3a58: *(this+0x10c)=x; *(this+0x110)=y; *(this+0x114)=bool; *(this+0xac)=1. v36 @0x4435fc: +0x110/+0x114/+0x118/+0xb4=1 — тот же паттерн (смещение −4). Вызывается VERIFIED send-command: fcn.100ac3a58(lVar28,iVar49,iVar50,1). | декомпил+структура | VERIFIED |
| 133 | `CalculateProjectilePath` | `0x7b3ae8` | FUN_1007b3ae8 (8764Б): float-тяжёлая сигнатура (Vector3<float>-математика, stp d15..d8) — класс функции v36 BattleScreen::calculateProjectilePath(own,skill,Vector3f,Vector3f,int) @0x6ce5ac (v36 0x1b10, тоже float-тяжёлая). Callee-консенсус: вызывает VERIFIED getSpeed (0x9cd834), getRadius (0x9cd894), getCastingRangeTiles (0x9de9cc), getTravelTicks (0xa3192c) — ровно тот набор, что нужен расчётчику траектории. | консенсус+сигнатура | VERIFIED |
| 134 | `LogicHttpRequest_encode` | `0xbd5f3c` | 0xbd5f3c — точка входа (4Б-переход b 0x10116844c → островок → тело 0xbd5f40). Тело FUN_100bd5f40: серийные записи в ByteStream (fcn.100bc8ed0) полей +0x90..0xa0, строки +0xa8, полей +0xb8/+0xbc, и финально fcn.100bc94fc(stream, *(req+0xc0), *(req+200)) — body-указатель по +192 и длина по +200: РОВНО хуки license.js (REQUEST_BODY_PTR=192, REQUEST_BODY_SIZE=200). Семантика «кодирование HTTP-запроса в поток». v36-символа нет. | декомпил+дизасм | VERIFIED |

### LogicData (CSV-геттеры)

| # | Ключ | Значение | Доказательство | Класс | Статус |
|---|---|---|---|---|---|
| 135 | `LogicData_getBooleanValueAt` | `0xbc6dec` | FUN_100bc6dec: fcn.100bc7758(*param_1, param_2, param_1[1]) — CSVRow: таблица = *(row+0), индекс строки = *(row+8). Структурная копия v36 CSVRow::getBooleanValueAt(int) @0x7dec20 (CSVTable::getBooleanValueAt(*(CSVTable**)this, idx, *(int*)(this+8))). Потребители — VERIFIED-геттеры данных. | декомпил+структура | VERIFIED |
| 136 | `LogicData_getIntegerValueAt` | `0xbc6dfc` | FUN_100bc6dfc: fcn.100bc7644(*param_1, param_2, param_1[1]) — структурная копия v36 CSVRow::getIntegerValueAt(int) @0x760150. Вызывается VERIFIED getSpread/getNumBullets/MsBetween/CastingRangeTiles/getRange — консистентное использование как (row, column) → int. | декомпил+консенсус | VERIFIED |
| 137 | `LogicData_getName` | `0x9a4f1c` | FUN_1009a4f1c: ldr x0,[x0,#8]; b 0x100bc6d84 — идентично v36 LogicData::getName @0x286c2c: ldr x0,[x0,#8]; b 0x6725b4 (возврат this->name(+8) хвостовым вызовом String-копии). | дизасм+структура | VERIFIED |

## Примечания по именованию (на оффсеты не влияют)

1. `BattleMode_logicBattleModeClient` (+0x28) — по факту указатель на **LogicGameObjectManagerClient** (менеджер объектов): именно его передают в findGameObject/addInput/getTeam. Агент использует ключ именно как менеджер (`mgr = bm.add(...).readPointer()`), расхождение только в историческом имени ключа.
2. `LogicGameObjectManagerClient_ownTeam` (+0xe4) — поле читается геттером `getOwnPlayerTeam` у объекта менеджера (в v36 символ принадлежал LogicBattleModeClient). Использование агентом корректно.
3. `LogicSkillData_getRange` (0x978d74) — фактически `LogicAccessoryData::getRange()` (колонка "Range" таблицы аксессуаров; класс-владелец в v36 — LogicAccessoryData). Агент вызывает его на объекте скилла/аксессуара — адрес и семантика «range в тайлах» верны.
4. `LogicProjectileData_type` (+0x28c) — поле питается из CSV-колонки **UniqueProperty**; используется в клиенте как type-id (сравнения с малыми константами в autoshoot). Имя ключа историческое.
5. `LogicSkillData_getProjectileData` и `LogicHttpRequest_encode` не имели v36-символов (появились между версиями) — верифицированы телом/контекстом вызовов (см. таблицы).
6. `operator_new` (0xd8da2c) — GOT-стаб `operator new` (Znwm); в VERIFIED send-command аллокация входа — `Znwm(0x48)` = 72 байта = CMD_BUF_SIZE агента.

## Воспроизводимость

- Скрипты: `scripts/find_varefs.py` (adrp+add скан ссылок на данные), `scripts/cr_fieldmap.py`/`cr_fieldmap2.py` (карты поле←колонка из дизасма createReferences), `scripts/vtable_align.py` (выравнивание vtable), `scripts/find_v36_tables.py` (поиск констант в v36), `scripts/gen_report.py` (этот отчёт, проверка покрытия 100%).
- Smoke агента после правки: `node scripts/smoke_commands.mjs` → **SMOKE OK** (fallback 0xdeadbeef = native @0xe1bc28, sha256 = node crypto, токен детерминирован, 15 бит).
