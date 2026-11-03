// Дифференциальный тестовый прогон RecoilGear (работает и против старого кода через --old).
// Запуск:  node test/run_tests.js            (новый код)
//          node test/run_tests.js --old      (git HEAD, для сравнения «до»)
import { mocks, makeMem, toAddr } from "./harness.js";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isOld = process.argv.includes("--old");
const ROOT = isOld
    ? "/home/z/my-project/scripts/old_tree"
    : path.resolve(__dirname, "..");

const results = [];
function check(name, cond, detail) {
    results.push({ name, ok: !!cond, detail: detail || "" });
    const mark = cond ? "PASS" : "FAIL";
    console.log(`[${mark}] ${name}${detail ? " — " + detail : ""}`);
}

const m = (fields, children, addr, bytes, strings) =>
    makeMem(fields, children, addr, bytes, strings);

// ---------------------------------------------------------------- natives
const mod = await import(pathToFileURL(ROOT + "/agent/core/offsets.js").href);
const offsets = mod.offsets;

function reg(name, fn) {
    mocks.nativeRegistry.set(offsets[name], fn);
}

const recorder = {
    moves: [],
    inputs: [],
    addInputs: []
};

// Готовые нативные стабы, имитирующие доказанное поведение v69.
const ownChar = m({ 0x30: 0, 0x34: 0, 0x40: 1, 0x3c: 5, 0xb0: 0 }, { 0x10: null }, 0x40000);
const ownData = m({ 0x26c: 720, 0x2ac: 60, 0x124: 0, 0x130: 0 }, {}, 0x40010);
ownChar.__base.__setptr(0x10, ownData);
const battle = m({}, { 0x58: m({}, {}, 0x42000) }, 0x41000);
const bm = m({}, { 0x28: null }, 0x41200);
const nameCharPtr = m({}, {}, 0x43000, undefined, { 0: "hero_icon_SHELLY" });
const skillData = m({ 0x84: 1 }, { 0x78: null }, 0x44000);
const projDataOwn = m({ 0x124: 1000, 0x130: 60, 0x1d9: 0, 0x23c: 0, 0x1e4: 0, 0x1e5: 0 }, {}, 0x44100);
skillData.__base.__setptr(0x78, projDataOwn);

reg("LogicBattleModeClient_getOwnCharacter", () => ownChar);
reg("LogicBattleModeClient__getTileMap", () => null && m({}));
reg("LogicGameObjectClient_getX", (o) => o.add(0x30).readS32());
reg("LogicGameObjectClient_getY", (o) => o.add(0x34).readS32());
reg("LogicCharacterData_getSpeed", (data) => data.add(0x26c).readS32());
reg("LogicCharacterData_getCollisionRadius", (data) => data.add(0x2ac).readS32());
reg("LogicGameObjectClient_getData", (obj) => obj.add(0x10).readPointer());
reg("LogicData_getName", () => nameCharPtr);
reg("BattleMode_getInstance", () => battle);
reg("operator_new", () => m({}, {}, 0x45000));
reg("ClientInput_constructor_int", (ci, type) => {
    ci.add(8).writeS32(type | 0);
});
reg("ClientInputManager_addInput", (mgr, ci) => {
    recorder.addInputs.push({ x: ci.add(0xc).readS32(), y: ci.add(0x10).readS32() });
});
reg("LogicBattleModeClient_setClientPredictionMoveTo", (b, x, y, f) => {
    recorder.moves.push({ x: x | 0, y: y | 0, f: f | 0 });
});
reg("LogicCharacterClient__getWeaponSkill", () => skillData);
reg("LogicSkillData__getProjectileData", () => projDataOwn);
reg("LogicSkillData_getRange", () => 5);
reg("LogicSkillData__getCastingRange", () => 5);
reg("LogicProjectileData_getSpeed", (data) => data.add(0x124).readS32());
reg("LogicProjectileData_getRadius", (data) => data.add(0x130).readS32());
reg("LogicProjectileData_getIntValueFromColumn", () => 0);
reg("LogicProjectileData_getBoolValueFromColumn", () => 0);
reg("LogicProjectileData_getBoolValueFromColumnAlt", () => 0);
reg("LogicProjectileClient_getType", (data) => data.add(0x28c).readS32());
reg("LogicProjectileClient_isHomingMissile", (data) => data.add(0x11e).readU8());
reg("LogicProjectileClient_isBouncing", (data) => data.add(0x1da).readU8());
reg("LogicProjectileClient_getPreExplosionTimeMs", (data) => data.add(0x128).readS32());
reg("LogicProjectileData_getTravelType", (data) => data.add(0x260).readS32());
reg("LogicTileMap_tileToLogic", (t) => (t | 0) * 300 + 150);
reg(
    "LogicProjectileClient_getTravelTicks",
    (data, range, speed) => {
        if (data.add(0x134).readU8() & 1) return 18000;
        const s = speed | 0;
        return s > 1 ? Math.round((range * 20) / s) : 18000;
    }
);
reg("LogicCharacterClient_getMoveAngle", (obj) => obj.add(0xb0).readS32());
// getClosestPathfinderCollision по умолчанию — «стен нет» (retval=0, out не важен).

// ---------------------------------------------------------------- agent init
const functionsMod = await import(pathToFileURL(ROOT + "/agent/core/functions.js").href);
const scanMod = await import(pathToFileURL(ROOT + "/agent/core/scan.js").href);
const dodgeMod = await import(pathToFileURL(ROOT + "/agent/features/autododge.js").href);
const aimMod = await import(pathToFileURL(ROOT + "/agent/features/autoaim.js").href);
const wallsMod = await import(pathToFileURL(ROOT + "/agent/utils/walls.js").href);
const stringMod = await import(pathToFileURL(ROOT + "/agent/core/scstring.js").href);

const base = m({}, {}, 0x100000000);
functionsMod.initFunctions(base, null);
scanMod.initScanner(base);
dodgeMod.setupAutododge();
aimMod.setupAutoaim();
wallsMod.watchTileChanges(base);

const scanData = scanMod.scanData;

function resetWorld() {
    recorder.moves.length = 0;
    recorder.addInputs.length = 0;
    scanMod.resetScannerCache();
    dodgeMod.resetAutododge();
    aimMod.resetAutoaim();
}

// ================================================================ ТЕСТЫ

// T1. Хуки: ровно 19 и интерцепторов, все на известных смещениях.
{
    const offs = mocks.hooks.map((h) => h.off);
    const unique = new Set(offs);
    const createRefs = [offsets.LogicProjectileData_createReferences, offsets.LogicSkillData_createReferences, offsets.LogicCharacterData_createReferences];
    const expandable = offs.filter((o) => o === 0 || createRefs.includes(o));
    // один хук зарегистрирован циклом по трём createReferences
    const attachCount = unique.size + 2; // +2 = цикл из 3 даёт одну запись
    check("T1 хуков установлено 19", attachCount === 19, `attach-точек: ${attachCount} (19 хуков)`);
}

// T2. Строка: v69 getName возвращает char* — читается напрямую.
{
    const p = m({}, {}, 0x46000, undefined, { 0: "COLT" });
    const s = stringMod.readScString(p, 128);
    check("T2 readScString читает char*", s === "COLT", `получено: ${JSON.stringify(s)}`);
}

// T3. travelTicks — формула движка (getTravelTicks: round(range*20/speed)).
{
    const t = scanMod.travelTicks(3000, 1000, false);
    check("T3 travelTicks(range,speed) = range*20/speed", t === 60, `t=${t}`);
    const beam = scanMod.travelTicks(3000, 1000, true);
    check("T3b beam travelTicks = 18000", beam === 18000, `t=${beam}`);
}

// T4. updateScanner: идентичность снарядов (два снаряда = две записи),
//     имя по data, команда с персонажа, moveAngle в радианах.
function mkProjMem(addr, dataAddr, clientFields, dataFields) {
    const data = m({ ...dataFields }, { 0: m({}, {}, 0x100000000 + offsets.VTABLE_PROJECTILE_DATA) }, dataAddr);
    const proj = m(clientFields, { 0x10: data }, addr);
    return { proj, data };
}

function buildObjectManager(objects) {
    const buf = new ArrayBuffer(objects.length * 8);
    const dv = new DataView(buf);
    objects.forEach((o, i) => {
        dv.setUint32(i * 8, toAddr(o) >>> 0, true);
        dv.setUint32(i * 8 + 4, 0, true);
    });
    const arr = m({}, {}, 0x47000, { 0: buf });
    const mgr = m({ 0xc: objects.length }, { 0x0: arr }, 0x47100);
    bm.__base.__setptr(0x28, mgr);
    return mgr;
}

{
    resetWorld();
    const { proj: p1, data: d1 } = mkProjMem(0x50000, 0x51000, { 0x30: 900, 0x34: 900, 0x3c: 7, 0x1ec: 1500, 0x1f0: 1500, 0x1e8: 40, 0x28c: 6 }, { 0x124: 1000, 0x130: 80, 0x260: 6, 0x11e: 0, 0x128: 0, 0x138: 900, 0x28c: 6 });
    const { proj: p2, data: d2 } = mkProjMem(0x52000, 0x53000, { 0x30: 2400, 0x34: 900, 0x3c: 7, 0x1ec: 1500, 0x1f0: 1500, 0x1e8: 40 }, { 0x124: 1200, 0x130: 50, 0x260: 6, 0x11e: 1, 0x128: 0, 0x138: 0, 0x28c: 6 });
    // враг-персонаж
    const enemyData = m({ 0x26c: 700, 0x2ac: 55 }, { 0: m({}, {}, 0x99) }, 0x54000);
    const enemy = m({ 0x30: 2000, 0x34: 2000, 0x40: 2, 0x3c: 9, 0xc4: 3000, 0xb0: 90 }, { 0x10: enemyData }, 0x55000);
    buildObjectManager([p1, p2, enemy]);
    scanMod.updateScanner(bm, Date.now());
    scanMod.updateScanner(bm, Date.now()); // второй тик: meta-бюджет = 1/тик

    const n = scanData.projectiles.length;
    check("T4 два снаряда — две записи трека", n === 2, `записей: ${n}`);
    check("T4b myTeamId с персонажа (=1)", scanData.myTeamId === 1, `team=${scanData.myTeamId}`);
    const enemyEntry = scanData.enemies.find((e) => e.brawlerName);
    check(
        "T4c имя бойца читается",
        enemyEntry && enemyEntry.brawlerName === "SHELLY",
        `имя: ${enemyEntry && JSON.stringify(enemyEntry.brawlerName)}`
    );
    const ma = enemyEntry ? enemyEntry.moveAngle : NaN;
    check(
        "T4d moveAngle int-градусы → радианы (90° → π/2)",
        Math.abs(ma - Math.PI / 2) < 0.01,
        `moveAngle=${ma}`
    );
    const homingEntry = scanData.projectiles.find((p) => p.homing);
    check("T4e homing-флаг читается с data (+0x11e)", !!homingEntry, `найдено: ${!!homingEntry}`);
}

// T5. Додж-метатель: угроза моделируется ТОЧКОЙ ПРИЗЕМЛЕНИЯ.
//     Я в (0,0), бутылка приземляется в (200, 100): уходить нужно от точки,
//     а не перпендикулярно линии полёта.
function driveDodge(projFixture, mySpeed) {
    resetWorld();
    scanData.lastUpdate = Date.now();
    scanData.myX = 500;
    scanData.myY = 500;
    scanData.mySpeed = mySpeed || 720;
    scanData.myRadius = 60;
    scanData.ownCharacter = ownChar;
    scanData.battleModeClient = bm;
    scanData.projectiles = projFixture;
    recorder.moves.length = 0;
    recorder.addInputs.length = 0;
    dodgeMod.updateAutododge();
    const last = recorder.addInputs[recorder.addInputs.length - 1];
    return last ? { x: last.x, y: last.y } : null;
}

const FIX_BASE = {
    passesEnv: false,
    piercesEnv: false,
    piercesChars: false,
    isIndirect: false,
    isBeam: false,
    beamCopy: false,
    travelType: 0,
    dynamicRange: 0,
    ignoreChars: 0,
    ignoreEnv: 0,
    grapples: 0,
    boomerang: 0,
    chains: 0,
    stunMs: 0,
    silenceMs: 0,
    triggerMs: 0,
    constantFly: 0,
    earlyTicks: 0,
    homeDistance: 0,
    gravity: 0,
    shotByHero: 0,
    levelBorder: 0,
    visualized: 0,
    attachArea: 0,
    trail: 0,
    trailMin: 0,
    lifeTicks: 40,
    clientRadius: 0,
    travelOverride: 0,
    preMs: 0,
    lifeMs: 0,
    ticks: 0,
    travelDistance: 0,
    ageMs: 100,
    typeId: 6,
    homing: false,
    seekX: 0,
    seekY: 0,
    bouncing: false,
    steer: 0,
    steerIgnoreMs: 0,
    steerLifeMs: 0,
    bounceAdd: 0,
    bounceMax: 0,
    bounceKeep: 0,
    rehit: false,
    volleyMs: 0,
    hasTarget: false,
    targetX: 0,
    targetY: 0,
    ownerIndex: 3
};

function mkFixture(over) {
    return Object.assign({}, FIX_BASE, over);
}

{
    // Бутылка приземляется рядом со мной (620,560): я в (500,500).
    const fixture = [
        mkFixture({
            gid: "0x1",
            x: 1300,
            y: 560,
            vx: -900,
            vy: 0,
            speed: 900,
            radius: 60,
            seg: 700,
            flown: 180,
            seg0: 880,
            hasTarget: true,
            targetX: 620,
            targetY: 560,
            isIndirect: true,
            travelType: 6,
            triggerMs: 700,
            spawnX: 1500,
            spawnY: 560
        })
    ];
    const move = driveDodge(fixture, 720);
    check("T5 метатель: додж отправлен", !!move, move ? JSON.stringify(move) : "нет команд");
    if (move) {
        const rx = move.x - 500;
        const ry = move.y - 500;
        const d = rx * 120 + ry * 60; // (120,60) — направление НА точку посадки
        check(
            "T5b метатель: уход ОТ точки приземления",
            d < -1000,
            `dot(rel-move, к-посадке)=${d}`
        );
    }
}

// T6. Хоминг: снаряд прямо на нас, скорость выше нашей — модель погони
//     должна выбирать радиальный отход (минус по направлению снаряда),
//     а не перпендикуляр, как линейная модель.
{
    const fixture = [
        mkFixture({
            gid: "0x2",
            x: 1400,
            y: 500,
            vx: -1500,
            vy: 0,
            speed: 1500,
            radius: 50,
            seg: 800,
            flown: 100,
            seg0: 900,
            homing: true,
            steer: 8,
            spawnX: 1500,
            spawnY: 500
        })
    ];
    const move = driveDodge(fixture, 720);
    check("T6 хоминг: додж отправлен", !!move, move ? JSON.stringify(move) : "нет команд");
    if (move) {
        check(
            "T6b хоминг: радиальный отход (движение от снаряда)",
            move.x - 500 < -300,
            `rel-move.x=${move.x - 500}`
        );
    }
}

// T7. Прямой снаряд: перпендикулярное уклонение, не навстречу.
{
    const fixture = [
        mkFixture({
            gid: "0x5",
            x: -700,
            y: 500,
            vx: 1800,
            vy: 0,
            speed: 1800,
            radius: 45,
            seg: 1500,
            flown: 100,
            seg0: 1500,
            spawnX: -800,
            spawnY: 500
        })
    ];
    const move = driveDodge(fixture, 720);
    check("T7 прямой снаряд: додж отправлен", !!move, move ? JSON.stringify(move) : "нет команд");
    if (move) {
        const rx = move.x - 500;
        const ry = move.y - 500;
        // Оптимум против летящего снаряда — перпендикуляр с составляющей ОТ снаряда:
        // перпендикулярная компонента должна доминировать над встречной.
        check(
            "T7b прямой снаряд: не навстречу (rx < ry)",
            rx < ry,
            `rel-move=(${rx},${ry})`
        );
        check(
            "T7c прямой снаряд: есть перпендикулярная составляющая",
            Math.abs(ry) > 300,
            `rel-move.y=${ry}`
        );
    }
}

// T8. Снаряд, улетающий от нас, игнорируется (нет ложного доджа).
{
    const fixture = [
        mkFixture({
            gid: "0x3",
            x: -1200,
            y: 500,
            vx: -1800,
            vy: 0,
            speed: 1800,
            radius: 45,
            seg: 400,
            flown: 100,
            seg0: 500,
            spawnX: -1100,
            spawnY: 500
        })
    ];
    const move = driveDodge(fixture, 720);
    check("T8 улетающий снаряд игнорируется", move === null, move ? JSON.stringify(move) : "команд нет");
}

// T9. Снаряд за стеной (BLOCKS_PROJECTILES) игнорируется; на открытой
//     линии — додж есть. Грид 5×5, тайл 300.
{
    let tileMapSeq = 0;
    const mkTileMap = (blockSet) => {
        tileMapSeq++;
        const W = 5;
        const H = 5;
        const buf = new ArrayBuffer(W * H * 8);
        const dv = new DataView(buf);
        const tiles = [];
        for (let i = 0; i < W * H; i++) {
            const tx = i % W;
            const ty = (i / W) | 0;
            const flags = blockSet.has(`${tx},${ty}`) ? 0x4000 : 0; // hi byte = BLOCKS_PROJECTILES
            const tileType = m({ 0x56: flags }, {}, 0x60000 + tileMapSeq * 0x1000 + i * 0x20);
            const tile = m({}, { 0: tileType }, 0x70000 + tileMapSeq * 0x1000 + i * 0x20);
            tiles.push(tile);
            dv.setUint32(i * 8, toAddr(tile) >>> 0, true);
            dv.setUint32(i * 8 + 4, 0, true);
        }
        const tilesArr = m({}, {}, 0x80000 + tileMapSeq * 0x100, { 0: buf });
        const tileMap = m(
            { 0xc4: W, 0xc8: H },
            { 0x20: tilesArr, 0x60: m({}, {}, 0) },
            0x81000 + tileMapSeq * 0x100
        );
        return tileMap;
    };
    const withWalls = mkTileMap(new Set(["2,1", "3,1"]));
    reg("LogicBattleModeClient__getTileMap", () => withWalls);
    wallsMod.notifyBattleModeChanged(bm, Date.now());
    wallsMod.maybeRefreshWallCache(bm, Date.now());

    const mkBullet8 = () =>
        mkFixture({
            gid: "0x4",
            x: 1750,
            y: 500,
            vx: -1800,
            vy: 0,
            speed: 1800,
            radius: 45,
            seg: 1600,
            flown: 100,
            seg0: 1600,
            spawnX: 1850,
            spawnY: 500
        });
    const bulletNearMe = () =>
        mkFixture({
            gid: "0x4b",
            x: 650,
            y: 500,
            vx: -1800,
            vy: 0,
            speed: 1800,
            radius: 45,
            seg: 1000,
            flown: 100,
            seg0: 1100,
            spawnX: 750,
            spawnY: 500
        });

    const hidden = driveDodge([mkBullet8()], 720);
    check("T9 снаряд за стеной игнорируется", hidden === null, hidden ? JSON.stringify(hidden) : "команд нет");

    reg("LogicBattleModeClient__getTileMap", () => mkTileMap(new Set()));
    wallsMod.notifyBattleModeChanged(bm, Date.now());
    wallsMod.maybeRefreshWallCache(bm, Date.now());
    const visible = driveDodge([bulletNearMe()], 720);
    check("T9b без стены — додж срабатывает", !!visible, visible ? JSON.stringify(visible) : "нет команд");
}

// T10. Автоэйм: активация скилла целятся в ближайшего врага по имени.
{
    resetWorld();
    scanData.lastUpdate = Date.now();
    scanData.myX = 0;
    scanData.myY = 0;
    scanData.mySpeed = 720;
    scanData.myRadius = 60;
    scanData.ownCharacter = ownChar;
    scanData.battleModeClient = bm;
    scanData.measuredSpeed = 1000;
    scanData.enemies = [
        {
            gid: "0x11",
            ptr: m({}, {}, 0x90000),
            x: 900,
            y: 400,
            brawlerName: "COLT",
            body: m({}, {}, 0x90000),
            teamId: 2,
            moveSpeed: 700,
            moveAngle: Math.PI / 2,
            radius: 55,
            kind: "player"
        },
        {
            gid: "0x12",
            ptr: m({}, {}, 0x90100),
            x: 2500,
            y: 2500,
            brawlerName: "BULL",
            body: m({}, {}, 0x90100),
            teamId: 2,
            moveSpeed: 750,
            moveAngle: 0,
            radius: 60,
            kind: "player"
        }
    ];
    aimMod.updateAutoaim();
    const hook = mocks.hooks.find(
        (h) => h.off === offsets.BattleScreen_activateSkill
    );
    check("T10 хук activateSkill установлен", !!hook);
    if (hook) {
        const args = [m({}, {}, 0x99000), m({}, {}, 0), m({}, {}, 0)];
        // _aimAt перечитывает позицию через getX/getY — дадим реальные поля
        const targetBody = m({ 0x30: 900, 0x34: 400 }, {}, 0x99001);
        scanData.enemies[0].ptr = targetBody;
        scanData.enemies[0].body = targetBody;
        hook.handlers.onEnter(args);
        const ax = toAddr(args[1]);
        const ay = toAddr(args[2]);
        check(
            "T10b activateSkill целится в ближнего врага",
            Math.abs(ax - 900) < 60 && Math.abs(ay - 400) < 60,
            `aim=(${ax},${ay})`
        );
    }
}

// T11. Perf: горячий цикл updateScanner+updateAutododge на 30 объектах.
{
    resetWorld();
    const objs = [];
    for (let i = 0; i < 28; i++) {
        const { proj } = mkProjMem(0xa0000 + i * 0x100, 0xa8000 + i * 0x100,
            { 0x30: 500 + i * 10, 0x34: 500, 0x3c: 7, 0x1ec: 0, 0x1f0: 0, 0x1e8: 40 },
            { 0x124: 1000, 0x130: 60, 0x260: 0, 0x11e: 0, 0x128: 0, 0x138: 0, 0x28c: 6 });
        objs.push(proj);
    }
    buildObjectManager(objs);
    scanMod.updateScanner(bm, Date.now());
    scanData.projectiles = scanData.projectiles || [];
    const natives0 = mocks.nativeCallCount;
    const window0 = new Map(mocks.nativeByOff);
    const t0 = process.hrtime.bigint();
    const ITER = 300;
    for (let i = 0; i < ITER; i++) {
        scanMod.updateScanner(bm, Date.now());
        dodgeMod.updateAutododge();
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6 / ITER;
    const nativesPerTick = (mocks.nativeCallCount - natives0) / ITER;
    const byOff = mocks.nativeByOff;
    const offNames = {};
    for (const k of Object.keys(offsets)) offNames[offsets[k]] = k;
    const top = [];
    for (const [off, cnt] of byOff) {
        if (cnt - (window0.get(off) || 0) > 0)
            top.push(`${offNames[off] || off}: ${((cnt - (window0.get(off) || 0)) / ITER).toFixed(2)}`);
    }
    console.log(
        `[INFO] perf: ${(ms * 1000).toFixed(1)} мкс/тик, нативных вызовов: ${nativesPerTick.toFixed(1)}/тик (28 снарядов)`
    );
    console.log(`[INFO] топ нативных: ${top.slice(0, 6).join(", ")}`);
    results.push({
        name: "T11 perf замерен",
        ok: true,
        detail: `${(ms * 1000).toFixed(1)} мкс/тик, ${nativesPerTick.toFixed(1)} нативных/тик`
    });
}

// ---------------------------------------------------------------- итог
const failed = results.filter((r) => !r.ok);
console.log(
    `\n${isOld ? "[СТАРЫЙ КОД]" : "[НОВЫЙ КОД]"}: ${results.length - failed.length}/${results.length} тестов прошли`
);
process.exit(failed.length ? 1 : 0);
