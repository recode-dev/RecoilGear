import { getFunctions, isValidPtr, ptrFromU32 } from "./functions.js";
import { offsets } from "./offsets.js";
import { readScString } from "./scstring.js";

const tileUnits = 100;
export const ticksPerSec = 20;
export const beamTicks = 18000;
const staleMs = 10000;
const defaultProjectileRadius = 40;

const length = (x, y) => Math.floor(Math.hypot(x, y));

class Scanner {
    #brawlerNameCache = new Map();
    #scanCount = 0;
    #liveProjectiles = new Map();
    #friendlyIdx = new Set();
    #objectsArr = null;
    #objCount = 0;
    #objMgrPtr = null;
    #projectileHooksInstalled = false;
    #weaponMeta = new Map();
    #charSpeedByData = new Map();
    #charsByIndex = new Map();
    #reloadCallbacks = [];
    #dataHooksInstalled = false;
    #coreHooksInstalled = false;
    #outArr = [];
    #moduleBase = null;
    #vtableProj = null;
    #vtableProjClient = null;
    state = {
        ownCharacter: ptr(0),
        battleModeClient: ptr(0),
        myPlayerIndex: -1,
        myX: 0,
        myY: 0,
        mySpeed: 0,
        myRadius: 0,
        enemies: [],
        projectiles: [],
        lastUpdate: 0
    };

    #ptrKey(value) {
        try {
            return value.toString();
        } catch {
            return null;
        }
    }

    dataFieldOf(obj) {
        if (!isValidPtr(obj)) return ptr(0);
        try {
            return obj.add(offsets.LogicGameObjectClient_data).readPointer();
        } catch {
            return ptr(0);
        }
    }

    #fieldS32(obj, off) {
        try {
            return Math.trunc(obj.add(off).readS32());
        } catch {
            return 0;
        }
    }

    dataOf(obj) {
        return this.dataFieldOf(obj);
    }

    #installCoreHooks(base) {
        if (this.#coreHooksInstalled || !base) return;
        this.#coreHooksInstalled = true;
        try {
            Interceptor.attach(base.add(offsets.LogicBattleModeClient_setClientPredictionMoveTo), {
                onEnter: () => {}
            });
        } catch {}
        try {
            Interceptor.attach(base.add(offsets.ClientInputManager_addInput), {
                onEnter: () => {}
            });
        } catch {}
    }

    #readDataName(data) {
        if (!isValidPtr(data)) return null;
        const fns = getFunctions();
        if (!fns.LogicData_getName) return null;
        try {
            const name = readScString(fns.LogicData_getName(data), 128);
            if (!name) return null;
            return (name.indexOf("hero_icon_") === 0 ? name.slice(10) : name).toUpperCase();
        } catch {}
        return null;
    }

    #validAngleDeg(deg) {
        return isFinite(deg) && deg >= -720 && deg <= 720;
    }

    #readMoveAngle(obj) {
        try {
            const deg = Math.trunc(obj.add(offsets.LogicCharacterClient_moveAngle).readS32());
            if (this.#validAngleDeg(deg)) return (deg * Math.PI) / 180;
        } catch {}
        return 0;
    }

    #readOwnerIndex(obj) {
        try {
            return obj.add(offsets.LogicGameObjectClient_ownerIndex).readS32();
        } catch {
            return -1;
        }
    }

    #rememberCharacter(index, character) {
        if (index < 0 || !isValidPtr(character)) return;
        this.#charsByIndex.set(index, character);
    }

    #teamOf(obj, bm) {
        const fns = getFunctions();
        if (fns.LogicGameObjectClient_getTeam && isValidPtr(bm)) {
            try {
                const mgr = bm.add(offsets.BattleMode_objectManager).readPointer();
                if (isValidPtr(mgr)) {
                    const t = Math.trunc(fns.LogicGameObjectClient_getTeam(obj, mgr));
                    if (t !== -1) return t;
                }
            } catch {}
        }
        try {
            const t = Math.trunc(obj.add(offsets.LogicGameObjectClient_team).readU32());
            return t === -1 ? -1 : t;
        } catch {
            return -1;
        }
    }

    #ownTeamOf(mgr) {
        if (!isValidPtr(mgr)) return -1;
        const fns = getFunctions();
        if (fns.LogicGameObjectManagerClient_getOwnPlayerTeam) {
            try {
                const t = Math.trunc(fns.LogicGameObjectManagerClient_getOwnPlayerTeam(mgr));
                if (t >= 0) return t;
            } catch {}
        }
        try {
            const t = Math.trunc(mgr.add(offsets.LogicGameObjectManagerClient_ownTeam).readS32());
            return t >= 0 ? t : -1;
        } catch {
            return -1;
        }
    }

    #enemyByTeams(obj, bm) {
        try {
            const mode = isValidPtr(bm) ? bm : this.state.battleModeClient;
            if (!isValidPtr(mode)) return null;
            const mgr = mode.add(offsets.BattleMode_objectManager).readPointer();
            if (!isValidPtr(mgr)) return null;
            const myTeam = this.#ownTeamOf(mgr);
            const fns = getFunctions();
            if (myTeam < 0 || !fns.LogicGameObjectClient_getTeam) return null;
            try {
                return Math.trunc(fns.LogicGameObjectClient_getTeam(obj, mgr)) !== myTeam;
            } catch {
                return null;
            }
        } catch {
            return null;
        }
    }

    #isEnemyOf(obj, bm, unknownAsEnemy) {
        if (!isValidPtr(obj)) return unknownAsEnemy === true;
        const fns = getFunctions();
        if (fns.LogicGamePlayUtil_isEnemy) {
            try {
                return fns.LogicGamePlayUtil_isEnemy(obj) !== 0;
            } catch {}
        }
        const byTeams = this.#enemyByTeams(obj, bm);
        if (byTeams !== null) return byTeams;
        return unknownAsEnemy === true;
    }

    travelDistance(ticks, speed) {
        if (!(ticks > 0) || ticks >= beamTicks || !(speed > 0)) return 0;
        return Math.round((ticks * speed) / ticksPerSec);
    }

    #weaponSkillFor(character) {
        if (!isValidPtr(character)) return null;
        const fns = getFunctions();
        if (!fns.LogicCharacterClient_getWeaponSkill) return null;
        try {
            const skill = fns.LogicCharacterClient_getWeaponSkill(character);
            if (isValidPtr(skill)) return skill;
        } catch {}
        return null;
    }

    #castingRangeTiles(character) {
        const skill = this.#weaponSkillFor(character);
        if (!skill) return 0;
        const fns = getFunctions();
        if (!fns.LogicSkillData_getCastingRange) return 0;
        try {
            const tiles = Math.trunc(fns.LogicSkillData_getCastingRange(skill));
            if (tiles >= 1 && tiles <= 64) return tiles;
        } catch {}
        return 0;
    }

    weaponRangeUnits(character) {
        if (!isValidPtr(character)) return 0;
        const tiles = this.#castingRangeTiles(character);
        return tiles > 0 ? tiles * tileUnits : 0;
    }

    #readProjectileField(data, off, min, max) {
        try {
            const v = Math.trunc(data.add(off).readS32());
            if (v < min || v > max) return 0;
            return v;
        } catch {
            return 0;
        }
    }

    #readProjectileRadius(data) {
        return this.#readProjectileField(data, offsets.LogicProjectileData_radius, 1, 2000);
    }

    #readProjectileSpeed(data) {
        return this.#readProjectileField(data, offsets.LogicProjectileData_speed, 1, 20000);
    }

    #characterSpeed(data) {
        if (!isValidPtr(data)) return 0;
        const key = this.#ptrKey(data);
        if (key) {
            const hit = this.#charSpeedByData.get(key);
            if (hit !== undefined && hit > 0) return hit;
        }
        const speed = this.#readProjectileField(data, offsets.LogicCharacterData_speed, 1, 6000);
        if (key && speed > 0) this.#charSpeedByData.set(key, speed);
        return speed;
    }

    collisionRadius(data) {
        if (!isValidPtr(data)) return 0;
        try {
            const direct = Math.trunc(
                data.add(offsets.LogicCharacterData_collisionRadius).readS32()
            );
            if (direct > 0) return direct;
        } catch {}
        try {
            const getRadius = getFunctions().LogicCharacterData_getCollisionRadius;
            if (getRadius) return Math.trunc(getRadius(data));
        } catch {}
        return 0;
    }

    #readClientU32(obj, off, max) {
        try {
            const v = obj.add(off).readU32();
            if (v <= max) return v;
        } catch {}
        return -1;
    }

    travelTicksFor(data, rangeUnits, speed) {
        const fn = getFunctions().LogicProjectileClient_getTravelTicks;
        if (fn && isValidPtr(data) && rangeUnits > 0 && speed > 0) {
            try {
                const ticks = Math.trunc(fn(data, rangeUnits, speed));
                if (ticks > 0 && ticks <= beamTicks) return ticks;
            } catch {}
        }
        if (!(rangeUnits > 0) || !(speed > 0)) return 0;
        return Math.max(1, Math.round((rangeUnits * ticksPerSec) / speed));
    }

    #skillStats(owner, fns) {
        const out = { spread: 0, bullets: 0, msBetween: 0 };
        try {
            const skill = fns.LogicCharacterClient_getWeaponSkill(owner);
            if (!isValidPtr(skill)) return out;
            out.bullets = fns.LogicSkillData_getNumBulletsInOneAttack
                ? Math.trunc(fns.LogicSkillData_getNumBulletsInOneAttack(skill))
                : 0;
            out.msBetween = fns.LogicSkillData_getMsBetweenAttacks
                ? Math.trunc(fns.LogicSkillData_getMsBetweenAttacks(skill))
                : 0;
            out.spread = Math.trunc(fns.LogicSkillData_getSpread(skill));
        } catch {}
        return out;
    }

    #weaponForOwner(ownerIndex) {
        if (ownerIndex < 0) return null;
        if (this.#weaponMeta.has(ownerIndex)) return this.#weaponMeta.get(ownerIndex);
        const owner = this.#charsByIndex.get(ownerIndex);
        if (!isValidPtr(owner)) return null;
        const fns = getFunctions();
        const out = { spread: 0, bullets: 0, msBetween: 0 };
        if (fns.LogicCharacterClient_getWeaponSkill && fns.LogicSkillData_getSpread) {
            const stats = this.#skillStats(owner, fns);
            if (stats.bullets >= 1 && stats.bullets <= 40) out.bullets = stats.bullets;
            if (stats.msBetween >= 0 && stats.msBetween <= 3000) out.msBetween = stats.msBetween;
            if (stats.spread > 0 && stats.spread <= 120) out.spread = stats.spread;
        }
        this.#weaponMeta.set(ownerIndex, out);
        return out;
    }

    #validTarget(tx, ty, x, y) {
        if (tx === 0 && ty === 0) return null;
        if (tx > 100000 || tx < -100000 || ty > 100000 || ty < -100000) return null;
        if (tx === x && ty === y) return null;
        return { x: tx, y: ty };
    }

    #readProjectileTarget(projectile, data, x, y) {
        const fns = getFunctions();
        try {
            const hit = this.#validTarget(
                Math.trunc(projectile.add(offsets.LogicProjectileClient_targetX).readS32()),
                Math.trunc(projectile.add(offsets.LogicProjectileClient_targetY).readS32()),
                x,
                y
            );
            if (hit) return hit;
        } catch {}
        if (fns.LogicProjectileClient_getTargetX && fns.LogicProjectileClient_getTargetY) {
            try {
                const hit = this.#validTarget(
                    Math.trunc(fns.LogicProjectileClient_getTargetX(projectile)),
                    Math.trunc(fns.LogicProjectileClient_getTargetY(projectile)),
                    x,
                    y
                );
                if (hit) return hit;
            } catch {}
        }
        return null;
    }

    #readPtrField(obj, off) {
        try {
            const v = obj.add(off).readPointer();
            return isValidPtr(v) ? v : null;
        } catch {
            return null;
        }
    }

    #dataU8(data, off) {
        try {
            return data.add(off).readU8() & 1;
        } catch {
            return 0;
        }
    }

    #dataS32(data, off, min, max) {
        try {
            const v = Math.trunc(data.add(off).readS32());
            return v >= min && v <= max ? v : 0;
        } catch {
            return 0;
        }
    }

    #clientS32(obj, off, min, max) {
        try {
            const v = Math.trunc(obj.add(off).readS32());
            return v >= min && v <= max ? v : 0;
        } catch {
            return 0;
        }
    }

    #travelTypeFromFn(data) {
        const fn = getFunctions().LogicProjectileData_getTravelType;
        if (!fn) return 0;
        try {
            const v = Math.trunc(fn(data));
            if (v > 0 && v <= 20) return v;
        } catch {}
        return 0;
    }

    #travelTypeOf(data, projectile) {
        let travelType = this.#dataS32(data, offsets.LogicProjectileData_travelType, 0, 20);
        if (!travelType) {
            const raw = this.#readClientU32(
                projectile,
                offsets.LogicProjectileClient_travelType,
                20
            );
            travelType = Math.max(raw, 0);
        }
        if (!travelType) travelType = this.#travelTypeFromFn(data);
        return travelType;
    }

    #captureProjectile(projectile, data, now) {
        if (!isValidPtr(projectile)) return;
        const key = this.#ptrKey(projectile);
        if (!key) return;
        try {
            if (!isValidPtr(data)) data = this.dataFieldOf(projectile);
            if (!isValidPtr(data)) return;
            const existing = this.#liveProjectiles.get(key);
            if (existing) {
                existing.ptr = projectile;
                existing.data = data;
                existing.ownerIndex = this.#readOwnerIndex(projectile);
                return;
            }
            this.#liveProjectiles.set(key, this.#newProjectileEntry(projectile, data, now));
        } catch {}
    }

    #newProjectileEntry(projectile, data, now) {
        let radius = this.#readProjectileRadius(data);
        if (!(radius > 0)) radius = defaultProjectileRadius;
        const x = this.#fieldS32(projectile, offsets.LogicGameObjectClient_x);
        const y = this.#fieldS32(projectile, offsets.LogicGameObjectClient_y);
        const spawnReady = x !== 0 || y !== 0;
        const target = this.#readProjectileTarget(projectile, data, x, y);
        let isIndirect = this.#dataU8(data, offsets.LogicProjectileData_indirect);
        const travelType = this.#travelTypeOf(data, projectile);
        const dynamicRange = this.#dataU8(data, offsets.LogicProjectileData_allowDynamicRange);
        if (travelType === 6 || dynamicRange) isIndirect = 1;
        const targetObj = this.#readPtrField(
            projectile,
            offsets.LogicProjectileClient_targetObject
        );
        return {
            gid: this.#ptrKey(projectile),
            ptr: projectile,
            data,
            ownerIndex: this.#readOwnerIndex(projectile),
            radius,
            speed: this.#readProjectileSpeed(data),
            x,
            y,
            spawnX: spawnReady ? x : 0,
            spawnY: spawnReady ? y : 0,
            spawnPending: !spawnReady,
            targetX: target ? target.x : 0,
            targetY: target ? target.y : 0,
            hasTarget: !!target || !!targetObj,
            seg0: target && spawnReady ? length(target.x - x, target.y - y) : 0,
            isIndirect: !!isIndirect,
            ageMs: 0,
            spawnTs: now,
            lastX: x,
            lastY: y,
            lastMoveTs: now,
            vx: 0,
            vy: 0,
            hasVelocitySample: false,
            travelType,
            preMs: this.#dataS32(data, offsets.LogicProjectileData_preExplosionTimeMs, 1, 60000),
            stunMs: this.#clientS32(projectile, offsets.LogicProjectileClient_stunMs, 1, 60000),
            silenceMs: this.#clientS32(
                projectile,
                offsets.LogicProjectileClient_effectMs,
                1,
                60000
            ),
            triggerMs: this.#dataS32(
                data,
                offsets.LogicProjectileData_triggerWithDelayMs,
                1,
                60000
            ),
            gravity: this.#dataS32(data, offsets.LogicProjectileData_gravity, 1, 20000),
            attachArea: this.#dataU8(data, offsets.LogicProjectileData_attachAreaEffectToTarget),
            trail: this.#dataU8(data, offsets.LogicProjectileData_spawnAreaEffectTrail),
            lifeTicks: this.#clientS32(
                projectile,
                offsets.LogicProjectileClient_lifeTicks,
                1,
                100000
            )
        };
    }

    #removeProjectile(projectile) {
        if (!isValidPtr(projectile)) return;
        const key = this.#ptrKey(projectile);
        if (!key) return;
        const entry = this.#liveProjectiles.get(key);
        if (!entry || !entry.ptr.equals(projectile)) return;
        this.#liveProjectiles.delete(key);
    }

    onDataReload(callback) {
        if (typeof callback === "function") this.#reloadCallbacks.push(callback);
    }

    #notifyDataReload() {
        this.#weaponMeta.clear();
        this.#charSpeedByData.clear();
        for (const callback of this.#reloadCallbacks) {
            try {
                callback();
            } catch {}
        }
    }

    #installDataReloadHooks(base) {
        if (this.#dataHooksInstalled) return;
        this.#dataHooksInstalled = true;
        const notify = () => this.#notifyDataReload();
        const remember = (character) => {
            const index = this.#readOwnerIndex(character);
            if (index < 0) return;
            this.#rememberCharacter(index, character);
        };
        const names = [
            "LogicProjectileData_createReferences",
            "LogicSkillData_createReferences",
            "LogicCharacterData_createReferences"
        ];
        for (const name of names) {
            const off = offsets[name];
            if (typeof off !== "number" || off <= 0) continue;
            try {
                Interceptor.attach(base.add(off), {
                    onLeave: () => notify()
                });
            } catch {}
        }
        try {
            Interceptor.attach(base.add(offsets.LogicCharacterClient_decode), {
                onEnter(args) {
                    this.character = args[0];
                },
                onLeave() {
                    remember(this.character);
                }
            });
        } catch {}
    }

    #installProjectileHooks(base) {
        if (this.#projectileHooksInstalled) return;
        this.#projectileHooksInstalled = true;
        const capture = (projectile) => this.#captureProjectile(projectile, null, Date.now());
        const remove = (projectile) => this.#removeProjectile(projectile);
        try {
            Interceptor.attach(base.add(offsets.LogicProjectileClient_ctor), {
                onEnter(args) {
                    this.projectile = args[0];
                },
                onLeave() {
                    try {
                        capture(this.projectile);
                    } catch {}
                }
            });
        } catch {}
        try {
            Interceptor.attach(base.add(offsets.LogicProjectileClient_destruct), {
                onEnter: (args) => {
                    remove(args[0]);
                }
            });
        } catch {}
        try {
            Interceptor.attach(base.add(offsets.LogicProjectileClient_decode), {
                onEnter(args) {
                    this.projectile = args[0];
                },
                onLeave() {
                    capture(this.projectile);
                }
            });
        } catch {}
        this.#installDataReloadHooks(base);
    }

    #segmentLeft(entry, flown) {
        let cap = 0;
        if (entry.lifeTicks > 0 && entry.speed > 0)
            cap = (entry.lifeTicks * entry.speed) / ticksPerSec;
        if (!(cap > 0)) cap = entry.seg0;
        if (!(cap > 0)) return 0;
        return Math.max(cap - flown, 0);
    }

    #blendVelocity(entry, dx, dy, dt) {
        const observedVx = dx / dt;
        const observedVy = dy / dt;
        if (length(observedVx, observedVy) > 8500) return;
        const alpha = entry.hasVelocitySample ? 0.4 : 1;
        entry.vx = entry.vx * (1 - alpha) + observedVx * alpha;
        entry.vy = entry.vy * (1 - alpha) + observedVy * alpha;
        entry.hasVelocitySample = true;
    }

    #sampleEntryMotion(entry, x, y, now) {
        const dx = x - entry.lastX;
        const dy = y - entry.lastY;
        if (dx === 0 && dy === 0) return;
        const dt = (now - entry.lastMoveTs) / 1000;
        if (!entry.spawnPending && dt > 0.008 && dt < 0.3 && dx * dx + dy * dy >= 16)
            this.#blendVelocity(entry, dx, dy, dt);
        entry.lastMoveTs = now;
    }

    #updateEntryTarget(entry, x, y) {
        const target = this.#readProjectileTarget(entry.ptr, entry.data, x, y);
        if (!target) return;
        entry.targetX = target.x;
        entry.targetY = target.y;
        entry.hasTarget = true;
        if (!(entry.seg0 > 0) && !entry.spawnPending)
            entry.seg0 = length(target.x - entry.spawnX, target.y - entry.spawnY);
    }

    #badOwner(resolved, entry) {
        if (!isValidPtr(resolved) || resolved.equals(entry.ptr)) return true;
        try {
            return resolved
                .readPointer()
                .equals(this.#moduleBase.add(offsets.LogicProjectileClient_vtable));
        } catch {
            return false;
        }
    }

    #findOwnerObject(entry) {
        if (!isValidPtr(this.#objMgrPtr)) return null;
        const fns = getFunctions();
        if (!fns.LogicGameObjectManagerClient_findGameObject) return null;
        try {
            const resolved = fns.LogicGameObjectManagerClient_findGameObject(
                this.#objMgrPtr,
                entry.ownerIndex,
                -1
            );
            if (this.#badOwner(resolved, entry)) return null;
            this.#rememberCharacter(entry.ownerIndex, resolved);
            return resolved;
        } catch {
            return null;
        }
    }

    #resolveOwner(entry) {
        if (entry.ownerIndex < 0) return null;
        const known = this.#charsByIndex.get(entry.ownerIndex);
        if (isValidPtr(known)) return known;
        return this.#findOwnerObject(entry);
    }

    #entryVisible(entry, ownerObj) {
        if (ownerObj && this.state.ownCharacter && ownerObj.equals(this.state.ownCharacter))
            return false;
        if (ownerObj && !this.#isEnemyOf(ownerObj, this.state.battleModeClient, true)) return false;
        if (entry.ownerIndex >= 0 && this.#friendlyIdx.has(entry.ownerIndex)) return false;
        if (entry.ownerIndex === this.state.myPlayerIndex) return false;
        return entry.seg > 0 || entry.hasTarget || entry.hasVelocitySample;
    }

    #staticOutputFields(entry, o) {
        o.travelType = entry.travelType || 0;
        o.stunMs = entry.stunMs || 0;
        o.silenceMs = entry.silenceMs || 0;
        o.triggerMs = entry.triggerMs || 0;
    }

    #effectOutputFields(entry, o) {
        o.gravity = entry.gravity || 0;
        o.attachArea = entry.attachArea || 0;
        o.trail = entry.trail || 0;
    }

    #newOutput(entry, gid) {
        const o = {};
        entry.out = o;
        o.gid = gid;
        o.radius = entry.radius;
        o.isIndirect = !!entry.isIndirect;
        this.#staticOutputFields(entry, o);
        this.#effectOutputFields(entry, o);
        const w = this.#weaponForOwner(entry.ownerIndex);
        o.volleyBullets = (w && w.bullets) || 0;
        o.volleySpread = (w && w.spread) || 0;
        return o;
    }

    #refreshOutput(entry, o, x, y) {
        o.x = x;
        o.y = y;
        o.spawnX = entry.spawnX;
        o.spawnY = entry.spawnY;
        o.seg0 = entry.seg0;
        o.vx = entry.vx;
        o.vy = entry.vy;
        o.speed = entry.speed;
        o.seg = entry.seg;
        o.hasTarget = !!entry.hasTarget;
        o.targetX = entry.targetX;
        o.targetY = entry.targetY;
        o.ageMs = entry.ageMs;
        o.preMs = entry.preMs || 0;
        o.ownerIndex = entry.ownerIndex;
    }

    #refreshEntry(entry, gid, now, output) {
        const x = this.#fieldS32(entry.ptr, offsets.LogicGameObjectClient_x);
        const y = this.#fieldS32(entry.ptr, offsets.LogicGameObjectClient_y);
        this.#sampleEntryMotion(entry, x, y, now);
        entry.lastX = x;
        entry.lastY = y;
        entry.x = x;
        entry.y = y;
        entry.ownerIndex = this.#readOwnerIndex(entry.ptr);
        if (entry.spawnPending && (x !== 0 || y !== 0)) {
            entry.spawnX = x;
            entry.spawnY = y;
            entry.spawnPending = false;
        }
        entry.ageMs = Math.max(0, now - (entry.spawnTs || now));
        this.#updateEntryTarget(entry, x, y);
        const flown = this.#traveled(entry, x, y);
        entry.seg = this.#segmentLeft(entry, flown);
        if (!this.#entryVisible(entry, this.#resolveOwner(entry))) return;
        const o = entry.out || this.#newOutput(entry, gid);
        this.#refreshOutput(entry, o, x, y);
        output.push(o);
    }

    #updateLiveProjectiles(now) {
        const output = this.#outArr;
        output.length = 0;
        this.#liveProjectiles.forEach((entry, gid) => {
            try {
                if (now - (entry.spawnTs || now) > staleMs) {
                    this.#liveProjectiles.delete(gid);
                    return;
                }
                this.#refreshEntry(entry, gid, now, output);
            } catch {
                this.#liveProjectiles.delete(gid);
            }
        });
        return output;
    }

    #traveled(entry, x, y) {
        return length(x - entry.spawnX, y - entry.spawnY);
    }

    #scanOwn(own, bm) {
        try {
            const mgrForTeam = bm.add(offsets.BattleMode_objectManager).readPointer();
            if (isValidPtr(mgrForTeam)) this.#objMgrPtr = mgrForTeam;
        } catch {}
        this.state.myPlayerIndex = this.#readOwnerIndex(own);
        this.#friendlyIdx.clear();
        this.#friendlyIdx.add(this.state.myPlayerIndex);
        this.#charsByIndex.clear();
        this.#rememberCharacter(this.state.myPlayerIndex, own);
        this.state.myX = this.#fieldS32(own, offsets.LogicGameObjectClient_x);
        this.state.myY = this.#fieldS32(own, offsets.LogicGameObjectClient_y);
        this.state.mySpeed = 0;
        let ownData = this.dataFieldOf(own);
        if (!isValidPtr(ownData)) ownData = this.dataOf(own);
        if (!isValidPtr(ownData)) return;
        this.state.myRadius = Math.trunc(this.collisionRadius(ownData));
        const ownSpeed = this.#characterSpeed(ownData);
        if (ownSpeed >= 300 && ownSpeed <= 3000) this.state.mySpeed = ownSpeed;
    }

    #objectAt(objects, batchView, i, stride) {
        if (batchView) {
            const off = i * stride;
            const lo = batchView.getUint32(off, true);
            const hi = batchView.getUint32(off + 4, true);
            if (lo === 0 && hi === 0) return null;
            return ptrFromU32(lo, hi);
        }
        return objects.add(i * stride).readPointer();
    }

    #isProjectileObj(obj, data) {
        const vtableProj = this.#vtableProj;
        const vtableProjClient = this.#vtableProjClient;
        if (!vtableProj || !vtableProjClient) return false;
        let objVt = null;
        try {
            objVt = obj.readPointer();
        } catch {}
        if (objVt && objVt.equals(vtableProjClient)) return true;
        try {
            return data.readPointer().equals(vtableProj);
        } catch {
            return false;
        }
    }

    #brawlerNameOf(data) {
        const dataKey = this.#ptrKey(data);
        if (!dataKey) return this.#readDataName(data);
        const cached = this.#brawlerNameCache.get(dataKey);
        if (cached !== undefined) return cached;
        const name = this.#readDataName(data);
        this.#brawlerNameCache.set(dataKey, name);
        return name;
    }

    #classifyObject(obj, own, bm, now) {
        const data = this.dataFieldOf(obj);
        if (!isValidPtr(data)) return null;
        if (this.#isProjectileObj(obj, data)) {
            this.#captureProjectile(obj, data, now);
            return null;
        }
        if (obj.equals(own)) return null;
        if (!this.#isEnemyOf(obj, bm, false)) {
            const idx = this.#readOwnerIndex(obj);
            if (idx >= 0) {
                this.#friendlyIdx.add(idx);
                if (idx !== this.state.myPlayerIndex) this.#rememberCharacter(idx, obj);
            }
            return null;
        }
        if (obj.add(offsets.LogicCharacterClient_hitpoints).readU32() === 0) return null;
        const brawlerName = this.#brawlerNameOf(data);
        const radius = Math.trunc(this.collisionRadius(data));
        if (!brawlerName && radius <= 0) return null;
        const playerIndex = this.#readOwnerIndex(obj);
        if (brawlerName) this.#rememberCharacter(playerIndex, obj);
        return {
            gid: this.#ptrKey(obj),
            ptr: obj,
            x: this.#fieldS32(obj, offsets.LogicGameObjectClient_x),
            y: this.#fieldS32(obj, offsets.LogicGameObjectClient_y),
            brawlerName,
            body: obj,
            teamId: this.#teamOf(obj, bm),
            moveSpeed: this.#characterSpeed(data),
            moveAngle: this.#readMoveAngle(obj),
            radius,
            kind: brawlerName ? "player" : "spawnable"
        };
    }

    #scanObjectBatch(objects, count, own, bm, now) {
        const enemies = [];
        const stride = offsets.LogicGameObjectManagerClient_ptrStride;
        let batchView = null;
        try {
            const buf = objects.readByteArray(count * stride);
            if (buf) batchView = new DataView(buf);
        } catch {}
        for (let i = 0; i < count; i++) {
            try {
                const obj = this.#objectAt(objects, batchView, i, stride);
                if (!obj || !isValidPtr(obj)) continue;
                const enemy = this.#classifyObject(obj, own, bm, now);
                if (enemy) enemies.push(enemy);
            } catch {}
        }
        return enemies;
    }

    #scanEnemies(own, bm, now) {
        const objMgr = bm.add(offsets.BattleMode_objectManager).readPointer();
        if (!isValidPtr(objMgr)) return [];
        const objects = objMgr.add(offsets.LogicGameObjectManagerClient_objects).readPointer();
        const count = objMgr.add(offsets.LogicGameObjectManagerClient_count).readU32();
        this.#objectsArr = isValidPtr(objects) ? objects : null;
        const ok = isValidPtr(objects) && count > 0 && count <= 1200;
        this.#objCount = ok ? count : 0;
        if (!ok) return [];
        return this.#scanObjectBatch(objects, count, own, bm, now);
    }

    update(bm, now) {
        if (!this.#moduleBase) return;
        if (now === undefined) now = Date.now();
        try {
            const own = getFunctions().LogicBattleModeClient_getOwnCharacter(bm);
            if (!isValidPtr(own)) {
                this.state.ownCharacter = null;
                this.state.battleModeClient = null;
                this.state.lastUpdate = 0;
                return;
            }
            this.state.ownCharacter = own;
            this.state.battleModeClient = bm;
            this.#scanOwn(own, bm);
            const enemies = this.#scanEnemies(own, bm, now);
            this.#scanCount++;
            if ((this.#scanCount & 63) === 0) {
                this.#brawlerNameCache.clear();
                if (this.#charSpeedByData.size > 256) this.#charSpeedByData.clear();
            }
            this.state.enemies = enemies;
            this.state.projectiles = this.#updateLiveProjectiles(now);
            this.state.lastUpdate = now;
        } catch {}
    }

    resetCache() {
        this.#brawlerNameCache.clear();
        this.#weaponMeta.clear();
        this.#liveProjectiles.clear();
        this.#friendlyIdx.clear();
        this.#objectsArr = null;
        this.#objCount = 0;
        this.#objMgrPtr = null;
        this.#charsByIndex.clear();
        this.#charSpeedByData.clear();
        this.#outArr.length = 0;
        this.state.projectiles = [];
        this.state.myRadius = 0;
    }

    init(base) {
        this.#moduleBase = base;
        this.#vtableProj = base.add(offsets.LogicProjectileData_vtable);
        this.#vtableProjClient = base.add(offsets.LogicProjectileClient_vtable);
        this.#installCoreHooks(base);
    }

    enableProjectileTracking() {
        if (this.#moduleBase) this.#installProjectileHooks(this.#moduleBase);
    }
}

const scanner = new Scanner();
const scanData = scanner.state;

export { scanData };
export const dataOf = (obj) => scanner.dataOf(obj);
export const travelDistance = (ticks, speed) => scanner.travelDistance(ticks, speed);
export const travelTicksFor = (data, rangeUnits, speed) =>
    scanner.travelTicksFor(data, rangeUnits, speed);
export const weaponRangeUnits = (character) => scanner.weaponRangeUnits(character);
export const collisionRadius = (data) => scanner.collisionRadius(data);
export const onDataReload = (callback) => scanner.onDataReload(callback);
export const updateScanner = (bm, now) => scanner.update(bm, now);
export const resetScannerCache = () => scanner.resetCache();
export const initScanner = (base) => scanner.init(base);
export const enableProjectileTracking = () => scanner.enableProjectileTracking();
