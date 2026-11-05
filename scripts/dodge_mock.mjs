// Dodge mock simulator: drives the REAL dodge feature of this repo
// (agent/features/autododge.js + agent/features/dodge_core.js, command layer
// included) against generic attack mechanics, and the same REAL code frozen at
// a pre-fix commit (scripts/.gen/before) for an honest before/after comparison.
//
// Mechanics are generic projectile sets built from public field names of
// agent/core/scan.js. No brawler names ever reach the dodge logic.
//
//   node scripts/dodge_mock.mjs
//
// scenarios:
//   (a)  six single shots, 1-3 cut short by cover (flight-range poisoning),
//        4-6 full range: degradation + late trigger check
//   (b)  six clean full-range shots: 5th/6th must be handled like the 1st
//   (c)  cloud spray (Emz) + wide fan (Poco): exit the zone, don't thread it
//   (d)  sticky bomb (Squeak) + AoE puddle (Barley): leave before detonation
//   (e)  command discipline metrics reported for every scenario
//   (f)  cloud + wide fan + burst (Colt) fired simultaneously
//
import { spawnSync } from "node:child_process";

const TILE = 300;
const DT = 16;
const PLAYER_SPEED = 720;
const PLAYER_R = 60;

let NOW = 0;
const realDateNow = Date.now;
Date.now = () => NOW;

// minimal Frida `ptr` shim so agent/core/scan.js can be imported under Node
globalThis.ptr = (v) => ({
    v,
    isNull: () => v === 0,
    equals: (o) => !!o && o.v === v,
    toString: () => "0x" + (v >>> 0).toString(16),
    toInt32: () => v | 0,
    add: () => {
        throw new Error("ptr.add is not available outside Frida");
    }
});

const openWalls = {
    firstWallHit: () => -1,
    isBlockedWide: () => false,
    pathBlocked: () => false,
    tileSizeUnits: () => TILE,
    wallsVersion: () => 1,
    BLOCKS_MOVEMENT: 128,
    BLOCKS_PROJECTILES: 64
};

globalThis.__DODGE_STUB = {
    scanData: {
        ownCharacter: null,
        battleModeClient: { isNull: () => false },
        myTeamId: 0,
        myPlayerIndex: -1,
        myX: 0,
        myY: 0,
        mySpeed: 0,
        myRadius: 0,
        enemies: [],
        projectiles: [],
        measuredSpeed: 0,
        lastUpdate: 0,
        pathRanAt: 0
    },
    fns: {
        LogicBattleModeClient_setClientPredictionMoveTo: (_logic, x, y) => {
            globalThis.__DODGE_STUB.moves.push({ t: Date.now(), x, y, kind: "predict" });
        }
    },
    moves: [],
    pendingX: 0,
    walls: openWalls
};

// build the frozen pre-fix bundle, then load both cores
spawnSync(process.execPath, [new URL("./dodge_legacy_build.mjs", import.meta.url).pathname], {
    stdio: "inherit"
});
const before = await import("./.gen/before/autododge.js");
const after = await import("../agent/features/autododge.js");
const afterScan = await import("../agent/core/scan.js");

// ---------------- command recorder (after) ----------------
const afterCommands = [];
after.__setDodgeWalls(openWalls);
after.__setDodgeTransport({
    predict: (x, y) => afterCommands.push({ t: Date.now(), x, y, kind: "predict" }),
    input: (x, y) => afterCommands.push({ t: Date.now(), x, y, kind: "input" }),
    stop: (x, y) => afterCommands.push({ t: Date.now(), x, y, kind: "stop" }),
    moveAppliedSince: () => false,
    inputSentSince: () => false
});

// ---------------- projectile pipeline (mirrors agent/core/scan.js) ----------------
class Pipeline {
    constructor(fixed, legacySeg) {
        this.fixed = fixed;
        this.legacySeg = !!legacySeg; // bb71a2a scan.js: seg0 caps the flight
        this.reset();
    }
    reset() {
        this.entries = new Map();
        this.learnedRange = new Map();
    }
    learnDeath(b) {
        const flown = Math.hypot(b.x - b.spawnX0, b.y - b.spawnY0);
        if (!(flown > 0)) return;
        const prev = this.learnedRange.get(b.weaponKey) || 0;
        if (flown > prev) this.learnedRange.set(b.weaponKey, flown);
    }
    observe(bullets, now) {
        const out = [];
        for (const b of bullets) {
            let e = this.entries.get(b.id);
            if (!e) {
                e = {
                    x: b.x,
                    y: b.y,
                    lastX: b.x,
                    lastY: b.y,
                    lastMoveTs: now,
                    spawnX: b.spawnX0,
                    spawnY: b.spawnY0,
                    spawnPending: b.x === 0 && b.y === 0,
                    vx: 0,
                    vy: 0,
                    hasVelocitySample: false,
                    seg0: 0
                };
                this.entries.set(b.id, e);
            }
            const dx = b.x - e.lastX;
            const dy = b.y - e.lastY;
            if (dx !== 0 || dy !== 0) {
                const dt = (now - e.lastMoveTs) / 1000;
                if (!e.spawnPending && dt > 0.008 && dt < 0.3 && dx * dx + dy * dy >= 16) {
                    const ovx = dx / dt;
                    const ovy = dy / dt;
                    if (Math.hypot(ovx, ovy) <= 8500) {
                        const alpha = e.hasVelocitySample ? 0.4 : 1;
                        e.vx = e.vx * (1 - alpha) + ovx * alpha;
                        e.vy = e.vy * (1 - alpha) + ovy * alpha;
                        e.hasVelocitySample = true;
                    }
                }
                e.lastMoveTs = now;
            }
            e.lastX = b.x;
            e.lastY = b.y;
            e.x = b.x;
            e.y = b.y;
            if (e.spawnPending && (b.x !== 0 || b.y !== 0)) {
                e.spawnX = b.x;
                e.spawnY = b.y;
                e.spawnPending = false;
            }
            e.ageMs = Math.max(0, now - b.spawnT);
            if (b.hasTarget && !(e.seg0 > 0) && !e.spawnPending)
                e.seg0 = Math.hypot(b.targetX - e.spawnX, b.targetY - e.spawnY);
            const flown = Math.hypot(e.x - e.spawnX, e.y - e.spawnY);
            const moving = e.hasVelocitySample && now - e.lastMoveTs < 200;
            const learned0 = this.learnedRange.get(b.weaponKey) || 0;
            if (this.fixed && moving && learned0 > 0 && flown > learned0 + b.r + 50)
                this.learnedRange.set(b.weaponKey, flown + b.speed * 0.7);
            const learned = this.learnedRange.get(b.weaponKey) || 0;
            const lifeCap = b.lifeTicks > 0 && b.speed > 0 ? (b.lifeTicks * b.speed) / 20 : 0;
            let segFinal;
            if (this.legacySeg) {
                // bb71a2a scan.js: learned cap REPLACES lifeCap, seg0 caps down
                let cap0 = learned > 0 ? learned + b.r : 0;
                if (!(cap0 > 0) && lifeCap > flown) cap0 = lifeCap;
                let seg = e.seg0;
                if (cap0 > 0 && (!(seg > 0) || seg > cap0)) seg = cap0;
                segFinal = seg;
            } else {
                // fixed scan.js: the real flight remainder (largest known cap)
                let cap = learned > 0 ? learned + b.r : 0;
                if (lifeCap > cap) cap = lifeCap;
                segFinal = cap > 0 ? cap : e.seg0 > 0 ? e.seg0 : 0;
            }
            const remain = segFinal > 0 ? segFinal - flown : 0;
            const segVal = remain > 0 ? remain : 0;
            const segUncertain = this.fixed
                ? !!(moving && !(segVal > 0) && Math.hypot(e.vx, e.vy) > 100)
                : false;
            if (!(segVal > 0) && !b.hasTarget && !e.hasVelocitySample) continue;
            out.push({
                gid: "p" + b.id,
                x: e.x,
                y: e.y,
                vx: e.vx,
                vy: e.vy,
                speed: b.speed,
                radius: b.r,
                spawnX: e.spawnX,
                spawnY: e.spawnY,
                seg: segVal,
                seg0: e.seg0,
                segUncertain,
                flown,
                hasTarget: !!b.hasTarget,
                targetX: b.targetX || 0,
                targetY: b.targetY || 0,
                ageMs: e.ageMs,
                travelType: b.travelType || 0,
                isIndirect: !!b.indirect,
                gravity: b.gravity || 0,
                volleyBullets: b.volleyBullets || 0,
                volleySpread: b.volleySpread || 0,
                volleyMs: b.volleyMs || 0,
                ownerIndex: b.owner,
                isBeam: false,
                boomerang: 0,
                grapples: 0,
                attachArea: b.attachArea || 0,
                stunMs: b.stunMs || 0,
                silenceMs: 0,
                triggerMs: b.triggerMs || 0,
                constantFly: 0,
                earlyTicks: 0,
                homing: false,
                steer: 0,
                steerIgnoreMs: 0,
                steerLifeMs: 0,
                bouncing: false,
                bounceAdd: 0,
                bounceMax: 0,
                bounceKeep: 0,
                rehit: false,
                trail: b.trail || 0,
                trailMin: b.trailMin || 0,
                preMs: b.preMs || 0,
                lifeMs: 0,
                ticks: b.lifeTicks || 0,
                travelDistance: 0,
                typeId: 0,
                passesEnv: false,
                piercesEnv: false,
                piercesChars: !!b.piercesChars,
                ignoreChars: 0,
                ignoreEnv: 0,
                dynamicRange: 0,
                lifeTicks2: 0
            });
        }
        return out;
    }
}

// ---------------- attack models (generic mechanics, table-driven) ----------------
// shapes: "single" | "fan" | "burst" | "cloud" | "lob" | "sticky"
function spawnVolley(sim, shooter, aimX, aimY, model, volleyId, t) {
    const base = Math.atan2(aimY - shooter.y, aimX - shooter.x);
    const dist = Math.hypot(aimX - shooter.x, aimY - shooter.y);
    const mk = (angle, speed, r, range, opts) => {
        sim.bullets.push({
            id: sim.nextId++,
            x: shooter.x,
            y: shooter.y,
            spawnX0: shooter.x,
            spawnY0: shooter.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            r,
            speed,
            range,
            deathRange: opts.deathRange != null ? opts.deathRange : range,
            spawnT: t,
            weaponKey: model.weaponKey,
            owner: shooter.owner,
            volleyId,
            hasTarget: true,
            targetX: aimX,
            targetY: aimY,
            travelType: opts.travelType || 0,
            indirect: !!opts.indirect,
            gravity: opts.gravity || 0,
            trail: opts.trail || 0,
            attachArea: opts.attachArea || 0,
            triggerMs: opts.triggerMs || 0,
            stunMs: opts.stunMs || 0,
            piercesChars: !!opts.piercesChars,
            zoneR: opts.zoneR || 0,
            zoneLingerMs: opts.zoneLingerMs || 0,
            zoneTickMs: opts.zoneTickMs || 0,
            stickyBlastR: opts.stickyBlastR || 0,
            lifeTicks: Math.round((range * 20) / speed),
            volleyBullets: model.vb || 0,
            volleySpread: model.vs || 0,
            volleyMs: model.volleyMs || 0
        });
    };
    if (model.shape === "single") {
        mk(base, model.speed, model.r, model.range, { deathRange: model.deathRange });
    } else if (model.shape === "fan") {
        const n = model.count;
        for (let i = 0; i < n; i++) {
            const a = base + (model.spread / 180) * Math.PI * (i / (n - 1) - 0.5);
            mk(a, model.speed, model.r, model.range, { deathRange: model.deathRange });
        }
    } else if (model.shape === "burst") {
        const n = model.count;
        for (let i = 0; i < n; i++) {
            sim.delayed.push({
                at: t + i * model.staggerMs,
                fn: () =>
                    mk(base, model.speed, model.r, model.range, { deathRange: model.deathRange })
            });
        }
    } else if (model.shape === "cloud") {
        const n = model.count;
        for (let i = 0; i < n; i++) {
            sim.delayed.push({
                at: t + i * model.staggerMs,
                fn: () =>
                    mk(base, model.speed, model.r, model.range, {
                        deathRange: Math.min(model.range, dist),
                        trail: 1,
                        zoneR: model.zoneR,
                        zoneLingerMs: model.zoneLingerMs,
                        zoneTickMs: model.zoneTickMs
                    })
            });
        }
    } else if (model.shape === "lob") {
        mk(base, model.speed, model.r, model.range, {
            deathRange: Math.min(model.range, dist),
            indirect: true,
            travelType: 6,
            gravity: 1,
            zoneR: model.zoneR,
            zoneLingerMs: model.zoneLingerMs,
            zoneTickMs: model.zoneTickMs
        });
    } else if (model.shape === "sticky") {
        mk(base, model.speed, model.r, model.range, {
            deathRange: Math.min(model.range, dist + model.blastR * 2),
            attachArea: 1,
            triggerMs: model.triggerMs,
            stickyBlastR: model.blastR
        });
    }
}

// ---------------- simulation core ----------------
function simulate(scenario, mode) {
    NOW = 0;
    const isAfter = mode === "after";
    // BEFORE: the frozen agent (bb71a2a core + its scan.js seg semantics).
    // AFTER: the fixed scanner (real flight remainder) + the new core.
    const pipeline = new Pipeline(true, !isAfter);
    const commands = [];
    let decision = { active: false };
    const probe = () => (isAfter ? after.__dodgeProbe() : before.__legacyProbe());

    if (isAfter) {
        afterCommands.length = 0;
        after.resetAutododge();
        after.setupAutododge();
    } else {
        globalThis.__DODGE_STUB.moves.length = 0;
        before.resetAutododge();
        before.setupAutododge();
    }
    const sim = {
        bullets: [],
        delayed: [],
        zones: [],
        spans: [],
        zoneDwellMs: 0,
        nextId: 1,
        volleys: [],
        hits: [],
        damage: []
    };
    const player = { x: scenario.player.x, y: scenario.player.y };
    let span = null; // current dodge span (start/stop/repicks)
    let wasActive = false;
    let lastHeading = null;

    const sched = scenario.events.slice().sort((a, b) => a.t - b.t);
    let evIdx = 0;
    const until = scenario.until;

    const ghostPass = (volley) => {
        if (volley.crossT !== null || volley.ghostDone) return;
        const ghost = [];
        for (const b of sim.bullets)
            if (b.volleyId === volley.id)
                ghost.push({
                    x: b.x,
                    y: b.y,
                    vx: b.vx,
                    vy: b.vy,
                    r: b.r,
                    end: Math.min(b.range, b.deathRange),
                    sx: b.spawnX0,
                    sy: b.spawnY0
                });
        if (ghost.length === 0) return;
        volley.ghostDone = true;
        let gt = NOW;
        while (gt <= NOW + 5000) {
            let touched = false;
            for (const g of ghost) {
                if (g.dead) continue;
                g.x += (g.vx * 4) / 1000;
                g.y += (g.vy * 4) / 1000;
                if (Math.hypot(g.x - g.sx, g.y - g.sy) >= g.end) g.dead = true;
                if (!touched && Math.hypot(g.x - volley.aimX, g.y - volley.aimY) <= g.r + PLAYER_R)
                    touched = true;
            }
            if (touched) {
                volley.crossT = gt + 4;
                break;
            }
            gt += 4;
        }
    };

    for (NOW = 0; NOW <= until; NOW += DT) {
        // fire scheduled volleys
        while (evIdx < sched.length && sched[evIdx].t <= NOW) {
            const ev = sched[evIdx++];
            const volley = {
                id: sim.volleys.length,
                label: ev.label,
                shape: ev.model.shape,
                model: { ...ev.model, shooter: ev.shooter },
                fireT: NOW,
                aimX: player.x,
                aimY: player.y,
                crossT: null,
                ghostDone: false,
                dodgeStartT: null,
                attachT: null,
                explodeT: null,
                hitT: null,
                hit: false,
                minDist: Infinity,
                exitOk: null,
                playerAtCross: null,
                bullets: []
            };
            spawnVolley(sim, ev.shooter, player.x, player.y, ev.model, volley.id, NOW);
            sim.volleys.push(volley);
            ghostPass(volley);
        }
        for (const d of sim.delayed) {
            if (!d.done && d.at <= NOW) {
                d.done = true;
                d.fn();
            }
        }
        // delayed sub-bullets materialize over time: run their ghost pass once
        for (const v of sim.volleys) if (!v.ghostDone) ghostPass(v);

        // scanner -> dodge decision
        const plist = pipeline.observe(sim.bullets, NOW);
        if (isAfter) {
            const sd = afterScan.scanData;
            sd.myX = player.x;
            sd.myY = player.y;
            sd.mySpeed = PLAYER_SPEED;
            sd.myRadius = PLAYER_R;
            sd.battleModeClient = { isNull: () => false };
            sd.projectiles = plist;
            sd.lastUpdate = NOW;
            after.updateAutododge();
        } else {
            const sd = globalThis.__DODGE_STUB.scanData;
            sd.projectiles = plist;
            sd.myX = player.x;
            sd.myY = player.y;
            sd.mySpeed = PLAYER_SPEED;
            sd.myRadius = PLAYER_R;
            sd.lastUpdate = NOW;
            before.pushDodgeTarget();
            before.updateAutododge();
        }
        decision = probe();
        const cmds = isAfter ? afterCommands : globalThis.__DODGE_STUB.moves;
        for (let i = commands.length; i < cmds.length; i++) commands.push(cmds[i]);

        // dodge span bookkeeping (starts / stops / re-picks)
        if (decision.active && !wasActive) {
            span = { startT: NOW, stopT: null, repicks: 0, firstHeading: decision.headingDeg };
            sim.spans.push(span);
            for (const v of sim.volleys)
                if (v.dodgeStartT === null && NOW >= v.fireT) v.dodgeStartT = NOW;
        }
        if (decision.active && span && decision.headingDeg != null && lastHeading != null) {
            const d = Math.abs(((decision.headingDeg - lastHeading + 540) % 360) - 180);
            if (d > 20) span.repicks++;
        }
        lastHeading = decision.active ? decision.headingDeg : null;
        if (!decision.active && wasActive && span) {
            span.stopT = NOW;
            span = null;
        }
        wasActive = !!decision.active;

        // move player
        let mvx = 0;
        let mvy = 0;
        if (decision.active && isFinite(decision.targetX) && isFinite(decision.targetY)) {
            const dx = decision.targetX - player.x;
            const dy = decision.targetY - player.y;
            const d = Math.hypot(dx, dy);
            if (d > 1) {
                mvx = (dx / d) * PLAYER_SPEED;
                mvy = (dy / d) * PLAYER_SPEED;
            }
        } else if (scenario.walkIntent) {
            const w = scenario.walkIntent(player, NOW);
            mvx = w.x;
            mvy = w.y;
        }
        player.x += (mvx * DT) / 1000;
        player.y += (mvy * DT) / 1000;

        // bullets advance + truth model
        for (const b of sim.bullets) {
            if (b.dead) continue;
            b.x += (b.vx * DT) / 1000;
            b.y += (b.vy * DT) / 1000;
            const flown = Math.hypot(b.x - b.spawnX0, b.y - b.spawnY0);
            const v = sim.volleys[b.volleyId];
            const d = Math.hypot(b.x - player.x, b.y - player.y);
            if (d < v.minDist) v.minDist = d;
            const contact = d <= b.r + PLAYER_R;
            if (contact && b.attachArea) {
                if (v.attachT === null) {
                    v.attachT = NOW;
                    sim.zones.push({
                        x: player.x,
                        y: player.y,
                        r: b.stickyBlastR,
                        until: NOW + b.triggerMs,
                        explodeAt: NOW + b.triggerMs,
                        exploded: false,
                        volleyId: v.id,
                        tickMs: 0,
                        lastTick: 0
                    });
                }
                // the projectile object dies at attach; the area effect lives on
                b.dead = true;
                continue;
            }
            if (contact && !v.hit) {
                v.hit = true;
                v.hitT = NOW;
                sim.hits.push({ t: NOW, volleyId: v.id });
            }
            if (contact) b.dead = true;
            if (!b.dead && flown >= Math.min(b.range, b.deathRange)) {
                b.dead = true;
                pipeline.learnDeath(b);
                if (b.zoneR > 0) {
                    sim.zones.push({
                        x: b.x,
                        y: b.y,
                        r: b.zoneR,
                        until: NOW + b.zoneLingerMs,
                        explodeAt: null,
                        exploded: false,
                        volleyId: v.id,
                        tickMs: b.zoneTickMs,
                        lastTick: NOW
                    });
                }
            }
        }

        // zones: damage ticks and sticky detonation; cone-exit truth
        for (const v of sim.volleys) {
            if (v.exitOk !== null || v.crossT == null || NOW < v.crossT) continue;
            v.playerAtCross = { x: player.x, y: player.y };
            if (v.shape === "fan" && v.model) {
                const ax = v.model.shooter.x;
                const ay = v.model.shooter.y;
                const bis = (Math.atan2(v.aimY - ay, v.aimX - ax) * 180) / Math.PI;
                const d = Math.hypot(player.x - ax, player.y - ay);
                const ang = Math.abs(
                    (((Math.atan2(player.y - ay, player.x - ax) * 180) / Math.PI - bis + 540) %
                        360) -
                        180
                );
                const half = (v.model.vs || 0) / 2 + 8;
                v.exitOk = d > v.model.range + 60 || ang > half;
            }
        }
        for (const z of sim.zones) {
            if (z.exploded) continue;
            const active = NOW <= z.until;
            const inside = Math.hypot(player.x - z.x, player.y - z.y) <= z.r;
            if (inside && active) sim.zoneDwellMs += DT;
            const v = sim.volleys[z.volleyId];
            if (z.explodeAt !== null && NOW >= z.explodeAt) {
                z.exploded = true;
                v.explodeT = NOW;
                if (inside && !v.hit) {
                    v.hit = true;
                    v.hitT = NOW;
                    sim.hits.push({ t: NOW, volleyId: v.id });
                }
                continue;
            }
            if (!active) continue;
            if (inside && z.tickMs > 0 && NOW - z.lastTick >= z.tickMs) {
                z.lastTick = NOW;
                sim.damage.push({ t: NOW, volleyId: v.id });
            }
        }
        sim.zones = sim.zones.filter((z) => !z.exploded && (z.until > NOW || z.explodeAt !== null));
        sim.bullets = sim.bullets.filter((b) => !b.dead);
    }
    return { sim, player, commands };
}

// ---------------- scenarios ----------------
function shooterAt(x, y, owner) {
    return { x, y, owner };
}

const COLT_A = {
    shape: "single",
    speed: 4000,
    r: 25,
    range: Math.round(9 * TILE),
    weaponKey: "colt-a"
};
const COLT_B = {
    shape: "single",
    speed: 4000,
    r: 25,
    range: Math.round(9 * TILE),
    weaponKey: "colt-b"
};
const EMZ = {
    shape: "cloud",
    count: 3,
    staggerMs: 250,
    speed: 3400,
    r: 150,
    range: Math.round(8 * TILE),
    zoneR: 150,
    zoneLingerMs: 2600,
    zoneTickMs: 400,
    vb: 3,
    volleyMs: 250,
    weaponKey: "emz"
};
const POCO = {
    shape: "fan",
    count: 9,
    spread: 118,
    speed: 3400,
    r: 30,
    range: Math.round(9 * TILE),
    vb: 9,
    vs: 118,
    piercesChars: true,
    weaponKey: "poco"
};
const LOU = {
    shape: "fan",
    count: 3,
    spread: 24,
    speed: 3200,
    r: 35,
    range: Math.round(7.67 * TILE),
    vb: 3,
    vs: 24,
    stunMs: 900,
    weaponKey: "lou"
};
const SQUEAK = {
    shape: "sticky",
    speed: 2800,
    r: Math.round(2.67 * TILE), // the client reports the area radius
    range: Math.round(7.67 * TILE),
    triggerMs: 1400,
    blastR: Math.round(2.67 * TILE),
    weaponKey: "squeak"
};
const BARLEY = {
    shape: "lob",
    speed: 2400,
    r: 150,
    range: Math.round(8.67 * TILE),
    zoneR: 150,
    zoneLingerMs: 3500,
    zoneTickMs: 350,
    weaponKey: "barley"
};
const COLT_BURST = {
    shape: "burst",
    count: 6,
    staggerMs: 60,
    speed: 4000,
    r: 25,
    range: Math.round(9 * TILE),
    vb: 6,
    volleyMs: 60,
    weaponKey: "colt-burst"
};

// (a) 4th+ shot degradation: shots 1-3 die on close cover (poisons the
// learned flight range), shots 4-6 fly full range; player holds position
function scenarioA(mode) {
    const shooter = shooterAt(0, 0, 100);
    const cov = +(process.env.DODGE_A_COVER || 1100);
    const px = +(process.env.DODGE_A_PX || 2100);
    const cad = +(process.env.DODGE_A_CAD || 2000);
    const sc = {
        player: { x: px, y: 0 },
        walkIntent: () => ({ x: 0, y: 0 }),
        until: 500 + cad * 6 + 2000,
        events: [1, 2, 3, 4, 5, 6].map((i) => ({
            t: 500 + (i - 1) * cad,
            shooter,
            model: { ...COLT_A, deathRange: i <= 3 ? cov : Math.round(9 * TILE) },
            label: i <= 3 ? `shot${i}(cover)` : `SHOT${i}(full)`
        }))
    };
    return run(sc, mode);
}

// (b) six clean full-range shots; the shooter alternates sides so repeated
// dodges cannot just walk the player out of range
function scenarioB(mode) {
    const west = shooterAt(0, 0, 100);
    const east = shooterAt(4800, 0, 103);
    const sc = {
        player: { x: 2200, y: 0 },
        // drift home between shots so every shot stays in range
        walkIntent: (p) => {
            const dx = 2200 - p.x;
            const dy = 0 - p.y;
            const d = Math.hypot(dx, dy);
            return d > 150 ? { x: (dx / d) * 500, y: (dy / d) * 500 } : { x: 0, y: 0 };
        },
        until: 12500,
        events: [1, 2, 3, 4, 5, 6].map((i) => ({
            t: 400 + (i - 1) * 2000,
            shooter: i % 2 === 1 ? west : east,
            model: COLT_B,
            label: "shot" + i
        }))
    };
    return run(sc, mode);
}

// (c) Poco wide fan (two volleys) + Emz cloud spray: the dodge must LEAVE
// the wedge / the cloud instead of threading through
function scenarioC(mode) {
    const emz = shooterAt(0, 0, 100);
    const poco = shooterAt(2400, 2300, 101);
    const sc = {
        player: { x: 2400, y: 0 },
        walkIntent: () => ({ x: 0, y: 0 }),
        until: 8000,
        events: [
            { t: 500, shooter: poco, model: POCO, label: "Poco" },
            { t: 1600, shooter: poco, model: POCO, label: "Poco2" },
            { t: 2700, shooter: emz, model: EMZ, label: "Emz" }
        ]
    };
    return run(sc, mode);
}

// (d) Squeak sticky bomb + Barley puddle
function scenarioD(mode) {
    const sq = shooterAt(0, 0, 100);
    const bar = shooterAt(0, 1600, 101);
    const sc = {
        player: { x: 1800, y: 0 },
        walkIntent: () => ({ x: 0, y: 0 }),
        until: 9000,
        events: [
            { t: 500, shooter: sq, model: SQUEAK, label: "Squeak" },
            { t: 2600, shooter: bar, model: BARLEY, label: "Barley" }
        ]
    };
    return run(sc, mode);
}

// (e) Lou freeze volley (covered by metrics of other scenarios; kept as its
// own run for the report: 3 freezing bullets)
function scenarioE(mode) {
    const lou = shooterAt(0, 0, 100);
    const sc = {
        player: { x: 2300, y: 0 },
        walkIntent: () => ({ x: 0, y: 0 }),
        until: 3000,
        events: [{ t: 500, shooter: lou, model: LOU, label: "Lou" }]
    };
    return run(sc, mode);
}

// (f) Emz + Poco + Colt burst at the same time from three sides
function scenarioF(mode) {
    const emz = shooterAt(2200 - 2400, 1600, 100);
    const poco = shooterAt(2200, 1600 + 2600, 101);
    const colt = shooterAt(2200 + 2600, 1600, 102);
    const sc = {
        player: { x: 2200, y: 1600 },
        walkIntent: () => ({ x: 0, y: 0 }),
        until: 4500,
        events: [
            { t: 400, shooter: emz, model: EMZ, label: "Emz" },
            { t: 400, shooter: poco, model: POCO, label: "Poco" },
            { t: 400, shooter: colt, model: COLT_BURST, label: "Colt" }
        ]
    };
    return run(sc, mode);
}

function run(sc, mode) {
    const { sim, player, commands } = simulate(sc, mode);
    // command-stream discipline (self/stop commands excluded):
    //   jerk          = movement direction changed > 25 deg between sends
    //   teleport-risk = direction reversal > 60 deg within 150ms
    let teleportRisk = 0;
    let jerk = 0;
    let sends = 0;
    let prev = null;
    const dirOf = (c) => {
        const dx = c.x - sc.player.x;
        const dy = c.y - sc.player.y;
        return Math.hypot(dx, dy) < 30 ? null : (Math.atan2(dy, dx) * 180) / Math.PI;
    };
    for (const c of commands) {
        sends++;
        const a2 = dirOf(c);
        if (prev && a2 !== null && prev.a !== null && c.t - prev.t < 400) {
            const d = Math.abs(((a2 - prev.a + 540) % 360) - 180);
            if (d > 25) jerk++;
            if (d > 60 && c.t - prev.t < 150) teleportRisk++;
        }
        prev = { t: c.t, a: a2 };
    }
    return { sim, player, commands, sends, teleportRisk, jerk };
}

// ---------------- reporting helpers ----------------
const fmtMs = (v) => (v == null ? "—" : Math.round(v) + "ms");
function lead(v) {
    if (v.dodgeStartT == null || v.crossT == null) return null;
    return Math.round(v.crossT - v.dodgeStartT);
}

function volleyLine(v) {
    const start = v.dodgeStartT == null ? "НЕТ ДОДЖА" : fmtMs(v.dodgeStartT);
    const l = lead(v);
    const off = l == null ? "?" : l >= 0 ? `за ${l}ms ДО` : `на ${-l}ms ПОСЛЕ`;
    return `    ${v.label}: выстрел ${fmtMs(v.fireT)}, пересечение(бы) ${fmtMs(v.crossT)}, додж ${start} (${off}), hit=${v.hit ? "ДА" : "нет"}`;
}

function exitInfo(run, label) {
    // did the player end the threat outside the cone / farther from the apex?
    const v = run.sim.volleys.find((x) => x.label === label);
    return v ? `hit=${v.hit}` : "?";
}

const ONLY = process.env.DODGE_ONLY || null;
if (process.env.DODGE_TRACE)
    globalThis.__DODGE_TRACE = (tag, msg) => console.log(`  [${NOW}][${tag}] ${msg}`);
const results = {};

function execute(key, title, fn) {
    if (ONLY && !key.includes(ONLY)) return;
    console.log("\n=== " + title + " ===");
    const runs = {};
    for (const mode of ["before", "after"]) runs[mode] = fn(mode);
    results[key] = runs;
    for (const mode of ["before", "after"]) {
        const r = runs[mode];
        console.log(
            `-- ${mode.toUpperCase()} -- dodges:${r.sim.spans.length} hits:${r.sim.hits.length} zoneDamage:${r.sim.damage.length} zoneDwell:${Math.round(r.sim.zoneDwellMs)}ms repicks:${r.sim.spans.reduce((a, s) => a + s.repicks, 0)} jerk:${r.jerk} teleportRisk:${r.teleportRisk} commands:${r.sends}`
        );
        for (const v of r.sim.volleys) console.log(volleyLine(v));
    }
}

console.log("########## DODGE MOCK before(" + "bb71a2a" + ") vs after(working tree) ##########");

execute("(a)", "(a) вырождение после 3-го выстрела (1-3 в укрытие, 4-6 полные)", scenarioA);
execute("(b)", "(b) шесть чистых выстрелов подряд", scenarioB);
execute("(c)", "(c) Emz облако + Poco широкий веер", scenarioC);
execute("(d)", "(d) Squeak прилипалка + Barley лужа", scenarioD);
execute("(e)", "(e) Lou заморозка (3 снаряда)", scenarioE);
execute("(f)", "(f) одновременно Emz + Poco + Colt", scenarioF);

// ---------------- verdicts ----------------
const verdicts = [];
const ok = (cond, text) => verdicts.push({ ok: !!cond, text });
const have = (k) => !!results[k];

if (have("(a)")) {
    const b = results["(a)"].before.sim;
    const a = results["(a)"].after.sim;
    const b4 = b.volleys.find((v) => v.label === "SHOT4(full)");
    const a4 = a.volleys.find((v) => v.label === "SHOT4(full)");
    const bLead = b4 ? lead(b4) : null;
    const late =
        b4 &&
        (b4.hit || b4.dodgeStartT == null || b4.crossT == null || (bLead !== null && bLead < 200));
    ok(
        late,
        `(a) ДО: 4-й выстрел — додж с опозданием или поражение (додж ${fmtMs(b4 && b4.dodgeStartT)}, пересечение ${fmtMs(b4 && b4.crossT)}, запас ${bLead == null ? "—" : bLead + "ms"}, hit=${b4 && b4.hit})`
    );
    ok(
        a4 &&
            !a4.hit &&
            a4.dodgeStartT != null &&
            a4.crossT != null &&
            a4.dodgeStartT <= a4.crossT - 200,
        `(a) ПОСЛЕ: 4-й выстрел — додж раньше пересечения (запас ${a4 ? lead(a4) + "ms" : "?"}), hit=${a4 ? a4.hit : "?"}`
    );
    const lateShots = ["SHOT4(full)", "SHOT5(full)", "SHOT6(full)"];
    const allAfter = lateShots.every((lab) => {
        const v = a.volleys.find((x) => x.label === lab);
        return (
            v &&
            !v.hit &&
            v.dodgeStartT != null &&
            v.crossT != null &&
            v.dodgeStartT <= v.crossT - 200
        );
    });
    ok(allAfter, "(b) ПОСЛЕ: 4-й, 5-й, 6-й обрабатываются как первые (без hit, с запасом)");
    const firstLead = lead(a.volleys.find((v) => v.label === "shot1(cover)"));
    ok(
        a.volleys
            .filter((v) => lateShots.includes(v.label))
            .every((v) => lead(v) >= firstLead * 0.7),
        "(b) ПОСЛЕ: запас времени на 4-6 не хуже 70% от первого"
    );
}

if (have("(b)")) {
    const a = results["(b)"].after;
    const b = results["(b)"].before;
    ok(a.sim.hits.length === 0, "(b) ПОСЛЕ: ни одного попадания за 6 выстрелов");
    const allDodged = a.sim.volleys.every(
        (v) =>
            v.crossT == null ||
            (v.dodgeStartT != null && v.crossT != null && v.dodgeStartT <= v.crossT - 150)
    );
    ok(
        allDodged,
        `(b) ПОСЛЕ: каждый реальный выстрел (1-6) обрабатывается одинаково — додж до пересечения (${a.sim.volleys.filter((v) => v.crossT != null).length}/6 в зоне досягаемости)`
    );
    const ang = (r) => {
        const s = r.sim.spans[0];
        return s ? Math.round(s.firstHeading) + "\u00b0" : "\u2014";
    };
    console.log(
        `    (b) угол первого доджа: до=${ang(b)}, после=${ang(a)} (выстрелы с запада/востока, идеал ~90\u00b0/270\u00b0)`
    );
}

if (have("(c)")) {
    const a = results["(c)"].after;
    ok(
        a.sim.hits.length === 0 && a.sim.damage.length === 0,
        "(c) ПОСЛЕ: Emz/Poco — ни попаданий, ни урона в облаке"
    );
    ok(
        a.teleportRisk === 0 && a.sim.spans.every((s) => s.repicks <= 1),
        "(c) ПОСЛЕ: без паники (репики <=1 на додж, телепорт-риск 0)"
    );
    const pocoV = a.sim.volleys.filter((v) => v.label.startsWith("Poco"));
    ok(
        pocoV.length > 0 && pocoV.every((v) => v.exitOk !== false),
        `(c) ПОСЛЕ: Poco (${pocoV.length} залпа) — игрок ВНЕ конуса в момент прохода (выход из зоны, не проход сквозь)`
    );
    const b = results["(c)"].before;
    const bpocoV = b.sim.volleys.filter((v) => v.label.startsWith("Poco"));
    console.log(
        `    (c) ДО: hits=${b.sim.hits.length} zoneDamage=${b.sim.damage.length} repicks=${b.sim.spans.reduce((x, s) => x + s.repicks, 0)} jerk=${b.jerk} teleportRisk=${b.teleportRisk} pocoExit=${bpocoV.map((v) => v.exitOk).join("/")}`
    );
    ok(
        b.sim.hits.length > 0 ||
            b.sim.damage.length > 0 ||
            b.teleportRisk > 0 ||
            b.sim.spans.reduce((x, s) => x + s.repicks, 0) > 2 ||
            bpocoV.some((v) => v.exitOk === false),
        "(c) ДО: воспроизведена паника/проход сквозь спрей"
    );
}

if (have("(d)")) {
    const a = results["(d)"].after.sim;
    const sq = a.volleys.find((v) => v.label === "Squeak");
    const bar = a.volleys.find((v) => v.label === "Barley");
    const sqSafe =
        sq &&
        !sq.hit &&
        sq.dodgeStartT != null &&
        (sq.attachT == null || (sq.explodeT != null && sq.dodgeStartT < sq.explodeT - 200));
    ok(
        sqSafe,
        `(d) ПОСЛЕ: Squeak — вне радиуса взрыва (взрыв ${fmtMs(sq && sq.explodeT)}, додж ${fmtMs(sq && sq.dodgeStartT)}), hit=${sq && sq.hit}`
    );
    ok(
        bar && !bar.hit && a.damage.length === 0,
        "(d) ПОСЛЕ: Barley — не стоит в луже (урон 0), hit=" + (bar && bar.hit)
    );
    const b = results["(d)"].before.sim;
    const bsq = b.volleys.find((v) => v.label === "Squeak");
    const bbar = b.volleys.find((v) => v.label === "Barley");
    console.log(
        `    (d) ДО: Squeak hit=${bsq && bsq.hit} (взрыв ${fmtMs(bsq && bsq.explodeT)}, додж ${fmtMs(bsq && bsq.dodgeStartT)}), Barley hit=${bbar && bbar.hit}, zoneDwell=${Math.round(b.zoneDwellMs)}ms, zoneDamage=${b.damage.length}`
    );
    ok(
        (bsq && bsq.hit) || (bbar && bbar.hit) || b.damage.length > 0 || b.zoneDwellMs > 300,
        "(d) ДО: воспроизведено стояние в зоне/поражение"
    );
}

if (have("(e)")) {
    const a = results["(e)"].after;
    const b = results["(e)"].before;
    const repicks = (r) => r.sim.spans.reduce((x, s) => x + s.repicks, 0);
    const perDodge = (r) => (r.sim.spans.length ? r.sends / r.sim.spans.length : r.sends);
    ok(
        a.teleportRisk === 0 && a.jerk === 0 && repicks(a) <= 1 && perDodge(a) <= 10,
        `(e) ПОСЛЕ: один старт/один стоп — репики ${repicks(a)}, рывки ${a.jerk}, телепорт-риск ${a.teleportRisk}, команд на додж ~${Math.round(perDodge(a))}`
    );
    ok(
        b.teleportRisk > 0 || b.jerk > 0 || repicks(b) > 1 || perDodge(b) > 15,
        `(e) ДО: микрорывки/дребезг воспроизведены — репики ${repicks(b)}, рывки ${b.jerk}, телепорт-риск ${b.teleportRisk}, команд на додж ~${Math.round(perDodge(b))}`
    );
}

if (have("(f)")) {
    const a = results["(f)"].after;
    const b = results["(f)"].before;
    ok(
        a.sim.hits.length === 0 && a.sim.damage.length === 0,
        "(f) ПОСЛЕ: Emz+Poco+Colt одновременно — 0 попаданий, 0 урона в облаке"
    );
    ok(
        a.sim.spans.every((s) => s.repicks <= 2) && a.teleportRisk === 0,
        `(f) ПОСЛЕ: стратегия выбрана без паники (репики ${a.sim.spans.reduce((x, s) => x + s.repicks, 0)}, телепорт-риск ${a.teleportRisk})`
    );
    console.log(
        `    (f) ДО: hits=${b.sim.hits.length} zoneDamage=${b.sim.damage.length} repicks=${b.sim.spans.reduce((x, s) => x + s.repicks, 0)} jerk=${b.jerk} teleportRisk=${b.teleportRisk}`
    );
}

console.log("\n================ ВЕРДИКТЫ ================");
let allOk = true;
for (const v of verdicts) {
    console.log(`${v.ok ? "PASS" : "FAIL"}  ${v.text}`);
    if (!v.ok) allOk = false;
}
console.log(allOk ? "\nВСЕ КРИТЕРИИ ВЫПОЛНЕНЫ" : "\nЕСТЬ НЕВЫПОЛНЕННЫЕ КРИТЕРИИ");
process.exitCode = allOk ? 0 : 1;
Date.now = realDateNow;
