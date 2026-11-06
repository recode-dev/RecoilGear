import { attachOffset, getFunctions, isValidPtr, ptrFromU32, readClampedS32 } from "./Functions";
import { OFFSETS } from "./Offsets";
import { readScString } from "./ScString";

const TILE_UNITS = 100;
export const TICKS_PER_SEC = 20;
export const BEAM_TICKS = 18000;
const PROJECTILE_SPEED_PER_TICK = 0.1;
const STALE_MS = 10000;
const DEFAULT_PROJECTILE_RADIUS = 40;
const MAX_OBJECTS = 1200;

const length = (x: number, y: number): number => Math.floor(Math.hypot(x, y));

interface ProjectileTarget {
    x: number;
    y: number;
}

interface WeaponStats {
    spread: number;
    bullets: number;
    msBetween: number;
}

export interface EnemyInfo {
    gid: string | null;
    ptr: NativePointer;
    x: number;
    y: number;
    brawlerName: string | null;
    body: NativePointer;
    teamId: number;
    moveSpeed: number;
    moveAngle: number;
    radius: number;
    kind: "player" | "spawnable";
}

export interface ProjectileOutput {
    gid: string;
    radius: number;
    isIndirect: boolean;
    travelType: number;
    stunMs: number;
    silenceMs: number;
    volleyBullets: number;
    volleySpread: number;
    x: number;
    y: number;
    spawnX: number;
    spawnY: number;
    seg0: number;
    vx: number;
    vy: number;
    speed: number;
    seg: number;
    hasTarget: boolean;
    targetX: number;
    targetY: number;
    ageMs: number;
    ownerIndex: number;
}

interface ProjectileEntry {
    gid: string | null;
    ptr: NativePointer;
    data: NativePointer;
    ownerIndex: number;
    radius: number;
    speed: number;
    x: number;
    y: number;
    spawnX: number;
    spawnY: number;
    spawnPending: boolean;
    targetX: number;
    targetY: number;
    hasTarget: boolean;
    seg0: number;
    isIndirect: boolean;
    ageMs: number;
    spawnTs: number;
    lastX: number;
    lastY: number;
    lastMoveTs: number;
    vx: number;
    vy: number;
    hasVelocitySample: boolean;
    travelType: number;
    stunMs: number;
    silenceMs: number;
    lifeTicks: number;
    seg: number;
    out: ProjectileOutput | null;
}

export interface ScanState {
    ownCharacter: NativePointer | null;
    battleModeClient: NativePointer | null;
    myPlayerIndex: number;
    myX: number;
    myY: number;
    mySpeed: number;
    myRadius: number;
    inputX: number;
    inputY: number;
    enemies: EnemyInfo[];
    projectiles: ProjectileOutput[];
    lastUpdate: number;
}

class Scanner {
    #brawlerNameCache = new Map<string, string | null>();
    #scanCount = 0;
    #liveProjectiles = new Map<string, ProjectileEntry>();
    #friendlyIdx = new Set<number>();
    #objMgrPtr: NativePointer | null = null;
    #projectileHooksInstalled = false;
    #weaponMeta = new Map<number, WeaponStats>();
    #charSpeedByData = new Map<string, number>();
    #charsByIndex = new Map<number, NativePointer>();
    #reloadCallbacks: Array<() => void> = [];
    #dataHooksInstalled = false;
    #outArr: ProjectileOutput[] = [];
    #moduleBase: NativePointer | null = null;
    #vtableProj: NativePointer | null = null;
    #vtableProjClient: NativePointer | null = null;
    state: ScanState = {
        ownCharacter: ptr(0),
        battleModeClient: ptr(0),
        myPlayerIndex: -1,
        myX: 0,
        myY: 0,
        mySpeed: 0,
        myRadius: 0,
        inputX: 0,
        inputY: 0,
        enemies: [],
        projectiles: [],
        lastUpdate: 0,
    };

    #ptrKey(value: NativePointer): string | null {
        try {
            return value.toString();
        } catch {
            return null;
        }
    }

    dataFieldOf(obj: NativePointer): NativePointer {
        if (!isValidPtr(obj)) return ptr(0);
        try {
            return getFunctions().LogicGameObjectClient_getData(obj);
        } catch {
            return ptr(0);
        }
    }

    #posX(obj: NativePointer): number {
        try {
            return Math.trunc(getFunctions().LogicGameObjectClient_getX(obj));
        } catch {
            return 0;
        }
    }

    #posY(obj: NativePointer): number {
        try {
            return Math.trunc(getFunctions().LogicGameObjectClient_getY(obj));
        } catch {
            return 0;
        }
    }

    #readDataName(data: NativePointer): string | null {
        if (!isValidPtr(data)) return null;
        try {
            const name = readScString(getFunctions().LogicData_getName(data), 128);
            if (!name) return null;
            return (name.startsWith("hero_icon_") ? name.slice(10) : name).toUpperCase();
        } catch {}
        return null;
    }

    #validAngleDeg(deg: number): boolean {
        return isFinite(deg) && deg >= -720 && deg <= 720;
    }

    #readMoveAngle(obj: NativePointer): number {
        try {
            const deg = Math.trunc(obj.add(OFFSETS.LogicCharacterClient_moveAngle).readS32());
            if (this.#validAngleDeg(deg)) return (deg * Math.PI) / 180;
        } catch {}
        return 0;
    }

    #readOwnerIndex(obj: NativePointer): number {
        try {
            return obj.add(OFFSETS.LogicGameObjectClient_ownerIndex).readS32();
        } catch {
            return -1;
        }
    }

    #rememberCharacter(index: number, character: NativePointer): void {
        if (index < 0 || !isValidPtr(character)) return;
        this.#charsByIndex.set(index, character);
    }

    #teamOf(obj: NativePointer, bm: NativePointer): number {
        if (!isValidPtr(bm)) return -1;
        try {
            const mgr = bm.add(OFFSETS.BattleMode_objectManager).readPointer();
            if (!isValidPtr(mgr)) return -1;
            return Math.trunc(getFunctions().LogicGameObjectClient_getTeam(obj, mgr));
        } catch {
            return -1;
        }
    }

    #isEnemyOf(obj: NativePointer, unknownAsEnemy: boolean): boolean {
        if (!isValidPtr(obj)) return unknownAsEnemy;
        try {
            return getFunctions().LogicGamePlayUtil_isEnemy(obj) !== 0;
        } catch {
            return unknownAsEnemy;
        }
    }

    travelDistance(ticks: number, speed: number): number {
        if (!(ticks > 0) || ticks >= BEAM_TICKS || !(speed > 0)) return 0;
        return Math.round((ticks * speed) / (TICKS_PER_SEC * 1000));
    }

    #weaponSkillFor(character: NativePointer): NativePointer | null {
        if (!isValidPtr(character)) return null;
        try {
            const skill = getFunctions().LogicCharacterClient_getWeaponSkill(character);
            if (isValidPtr(skill)) return skill;
        } catch {}
        return null;
    }

    #castingRangeTiles(character: NativePointer): number {
        const skill = this.#weaponSkillFor(character);
        if (!skill) return 0;
        try {
            const tiles = Math.trunc(getFunctions().LogicSkillData_getCastingRange(skill));
            if (tiles >= 1 && tiles <= 64) return tiles;
        } catch {}
        return 0;
    }

    weaponRangeUnits(character: NativePointer): number {
        if (!isValidPtr(character)) return 0;
        const tiles = this.#castingRangeTiles(character);
        return tiles > 0 ? tiles * TILE_UNITS : 0;
    }

    #characterSpeed(data: NativePointer): number {
        if (!isValidPtr(data)) return 0;
        const key = this.#ptrKey(data);
        if (key) {
            const hit = this.#charSpeedByData.get(key);
            if (hit !== undefined && hit > 0) return hit;
        }
        const speed = readClampedS32(data, OFFSETS.LogicCharacterData_speed, 1, 6000);
        if (key && speed > 0) this.#charSpeedByData.set(key, speed);
        return speed;
    }

    collisionRadius(data: NativePointer): number {
        if (!isValidPtr(data)) return 0;
        try {
            return Math.trunc(getFunctions().LogicCharacterData_getCollisionRadius(data));
        } catch {}
        return 0;
    }

    travelTicksFor(data: NativePointer, rangeUnits: number, speed: number): number {
        if (!isValidPtr(data) || !(rangeUnits > 0) || !(speed > 0)) return 0;
        try {
            return Math.trunc(
                getFunctions().LogicProjectileClient_getTravelTicks(data, rangeUnits, speed),
            );
        } catch {}
        return 0;
    }

    #skillStats(owner: NativePointer): WeaponStats {
        const out: WeaponStats = { spread: 0, bullets: 0, msBetween: 0 };
        try {
            const fns = getFunctions();
            const skill = fns.LogicCharacterClient_getWeaponSkill(owner);
            if (!isValidPtr(skill)) return out;
            out.bullets = Math.trunc(fns.LogicSkillData_getNumBulletsInOneAttack(skill));
            out.msBetween = Math.trunc(fns.LogicSkillData_getMsBetweenAttacks(skill));
            out.spread = Math.trunc(fns.LogicSkillData_getSpread(skill));
        } catch {}
        return out;
    }

    #weaponForOwner(ownerIndex: number): WeaponStats | null {
        if (ownerIndex < 0) return null;
        const cached = this.#weaponMeta.get(ownerIndex);
        if (cached) return cached;
        const owner = this.#charsByIndex.get(ownerIndex);
        if (!isValidPtr(owner)) return null;
        const out: WeaponStats = { spread: 0, bullets: 0, msBetween: 0 };
        const stats = this.#skillStats(owner);
        if (stats.bullets >= 1 && stats.bullets <= 40) out.bullets = stats.bullets;
        if (stats.msBetween >= 0 && stats.msBetween <= 3000) out.msBetween = stats.msBetween;
        if (stats.spread > 0 && stats.spread <= 120) out.spread = stats.spread;
        this.#weaponMeta.set(ownerIndex, out);
        return out;
    }

    #validTarget(tx: number, ty: number, x: number, y: number): ProjectileTarget | null {
        if (tx === 0 && ty === 0) return null;
        if (tx > 100000 || tx < -100000 || ty > 100000 || ty < -100000) return null;
        if (tx === x && ty === y) return null;
        return { x: tx, y: ty };
    }

    #readProjectileTarget(
        projectile: NativePointer,
        x: number,
        y: number,
    ): ProjectileTarget | null {
        const fns = getFunctions();
        try {
            return this.#validTarget(
                Math.trunc(fns.LogicProjectileClient_getTargetX(projectile)),
                Math.trunc(fns.LogicProjectileClient_getTargetY(projectile)),
                x,
                y,
            );
        } catch {}
        return null;
    }

    #readPtrField(obj: NativePointer, off: number): NativePointer | null {
        try {
            const v = obj.add(off).readPointer();
            return isValidPtr(v) ? v : null;
        } catch {
            return null;
        }
    }

    #travelTypeOf(projectile: NativePointer): number {
        try {
            const raw = projectile.add(OFFSETS.LogicProjectileClient_travelType).readU32();
            return raw <= 20 ? raw : 0;
        } catch {}
        return 0;
    }

    #captureProjectile(projectile: NativePointer, data: NativePointer | null, now: number): void {
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

    #newProjectileEntry(
        projectile: NativePointer,
        data: NativePointer,
        now: number,
    ): ProjectileEntry {
        let radius = readClampedS32(data, OFFSETS.LogicProjectileData_radius, 1, 2000);
        if (!(radius > 0)) radius = DEFAULT_PROJECTILE_RADIUS;
        const x = this.#posX(projectile);
        const y = this.#posY(projectile);
        const spawnReady = x !== 0 || y !== 0;
        const target = this.#readProjectileTarget(projectile, x, y);
        const travelType = this.#travelTypeOf(projectile);
        const isIndirect = travelType === 6 ? 1 : 0;
        const targetObj = this.#readPtrField(
            projectile,
            OFFSETS.LogicProjectileClient_targetObject,
        );
        return {
            gid: this.#ptrKey(projectile),
            ptr: projectile,
            data,
            ownerIndex: this.#readOwnerIndex(projectile),
            radius,
            speed: readClampedS32(data, OFFSETS.LogicProjectileData_speed, 1, 20000),
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
            stunMs: readClampedS32(projectile, OFFSETS.LogicProjectileClient_stunMs, 1, 60000),
            silenceMs: readClampedS32(projectile, OFFSETS.LogicProjectileClient_effectMs, 1, 60000),
            lifeTicks: readClampedS32(
                projectile,
                OFFSETS.LogicProjectileClient_lifeTicks,
                1,
                100000,
            ),
        } as ProjectileEntry;
    }

    #removeProjectile(projectile: NativePointer): void {
        if (!isValidPtr(projectile)) return;
        const key = this.#ptrKey(projectile);
        if (!key) return;
        const entry = this.#liveProjectiles.get(key);
        if (!entry || !entry.ptr.equals(projectile)) return;
        this.#liveProjectiles.delete(key);
    }

    onDataReload(callback: () => void): void {
        this.#reloadCallbacks.push(callback);
    }

    #notifyDataReload(): void {
        this.#weaponMeta.clear();
        this.#charSpeedByData.clear();
        for (const callback of this.#reloadCallbacks) {
            try {
                callback();
            } catch {}
        }
    }

    #installDataReloadHooks(base: NativePointer): void {
        if (this.#dataHooksInstalled) return;
        this.#dataHooksInstalled = true;
        const notify = (): void => this.#notifyDataReload();
        const remember = (character: NativePointer): void => {
            const index = this.#readOwnerIndex(character);
            if (index >= 0) this.#rememberCharacter(index, character);
        };
        for (const key of [
            "LogicProjectileData_createReferences",
            "LogicSkillData_createReferences",
            "LogicCharacterData_createReferences",
        ] as const) {
            attachOffset(base, OFFSETS[key], { onLeave: notify });
        }
        attachOffset(base, OFFSETS.LogicCharacterClient_decode, {
            onEnter(args) {
                this.character = args[0];
            },
            onLeave() {
                remember(this.character);
            },
        });
    }

    #installProjectileHooks(base: NativePointer): void {
        if (this.#projectileHooksInstalled) return;
        this.#projectileHooksInstalled = true;
        const capture = (projectile: NativePointer): void =>
            this.#captureProjectile(projectile, null, Date.now());
        const remove = (projectile: NativePointer): void => this.#removeProjectile(projectile);
        attachOffset(base, OFFSETS.LogicProjectileClient_ctor, {
            onEnter(args) {
                this.projectile = args[0];
            },
            onLeave() {
                capture(this.projectile);
            },
        });
        attachOffset(base, OFFSETS.LogicProjectileClient_destruct, {
            onEnter: (args) => {
                remove(args[0]);
            },
        });
        attachOffset(base, OFFSETS.LogicProjectileClient_decode, {
            onEnter(args) {
                this.projectile = args[0];
            },
            onLeave() {
                capture(this.projectile);
            },
        });
        this.#installDataReloadHooks(base);
    }

    #segmentLeft(entry: ProjectileEntry, flown: number): number {
        let cap = 0;
        if (entry.lifeTicks > 0 && entry.speed > 0)
            cap = entry.lifeTicks * entry.speed * PROJECTILE_SPEED_PER_TICK;
        if (!(cap > 0)) cap = entry.seg0;
        if (!(cap > 0)) return 0;
        return Math.max(cap - flown, 0);
    }

    #blendVelocity(entry: ProjectileEntry, dx: number, dy: number, dt: number): void {
        const observedVx = dx / dt;
        const observedVy = dy / dt;
        if (length(observedVx, observedVy) > 8500) return;
        const alpha = entry.hasVelocitySample ? 0.4 : 1;
        entry.vx = entry.vx * (1 - alpha) + observedVx * alpha;
        entry.vy = entry.vy * (1 - alpha) + observedVy * alpha;
        entry.hasVelocitySample = true;
    }

    #sampleEntryMotion(entry: ProjectileEntry, x: number, y: number, now: number): void {
        const dx = x - entry.lastX;
        const dy = y - entry.lastY;
        if (dx === 0 && dy === 0) return;
        const dt = (now - entry.lastMoveTs) / 1000;
        if (!entry.spawnPending && dt > 0.008 && dt < 0.3 && dx * dx + dy * dy >= 16)
            this.#blendVelocity(entry, dx, dy, dt);
        entry.lastMoveTs = now;
    }

    #updateEntryTarget(entry: ProjectileEntry, x: number, y: number): void {
        const target = this.#readProjectileTarget(entry.ptr, x, y);
        if (!target) return;
        entry.targetX = target.x;
        entry.targetY = target.y;
        entry.hasTarget = true;
        if (!(entry.seg0 > 0) && !entry.spawnPending)
            entry.seg0 = length(target.x - entry.spawnX, target.y - entry.spawnY);
    }

    #badOwner(resolved: NativePointer, entry: ProjectileEntry): boolean {
        if (!isValidPtr(resolved) || resolved.equals(entry.ptr)) return true;
        const base = this.#moduleBase;
        if (!base) return false;
        try {
            return resolved.readPointer().equals(base.add(OFFSETS.LogicProjectileClient_vtable));
        } catch {
            return false;
        }
    }

    #findOwnerObject(entry: ProjectileEntry): NativePointer | null {
        if (!isValidPtr(this.#objMgrPtr)) return null;
        try {
            const resolved = getFunctions().LogicGameObjectManagerClient_findGameObject(
                this.#objMgrPtr,
                entry.ownerIndex,
                -1,
            );
            if (this.#badOwner(resolved, entry)) return null;
            this.#rememberCharacter(entry.ownerIndex, resolved);
            return resolved;
        } catch {
            return null;
        }
    }

    #resolveOwner(entry: ProjectileEntry): NativePointer | null {
        if (entry.ownerIndex < 0) return null;
        const known = this.#charsByIndex.get(entry.ownerIndex);
        if (isValidPtr(known)) return known;
        return this.#findOwnerObject(entry);
    }

    #entryVisible(entry: ProjectileEntry, ownerObj: NativePointer | null): boolean {
        if (ownerObj && this.state.ownCharacter && ownerObj.equals(this.state.ownCharacter))
            return false;
        if (ownerObj && !this.#isEnemyOf(ownerObj, true)) return false;
        if (entry.ownerIndex >= 0 && this.#friendlyIdx.has(entry.ownerIndex)) return false;
        if (entry.ownerIndex === this.state.myPlayerIndex) return false;
        return entry.seg > 0 || entry.hasTarget || entry.hasVelocitySample;
    }

    #newOutput(entry: ProjectileEntry, gid: string): ProjectileOutput {
        const output = {} as ProjectileOutput;
        entry.out = output;
        output.gid = gid;
        output.radius = entry.radius;
        output.isIndirect = !!entry.isIndirect;
        output.travelType = entry.travelType || 0;
        output.stunMs = entry.stunMs || 0;
        output.silenceMs = entry.silenceMs || 0;
        const weapon = this.#weaponForOwner(entry.ownerIndex);
        output.volleyBullets = (weapon && weapon.bullets) ?? 0;
        output.volleySpread = (weapon && weapon.spread) ?? 0;
        return output;
    }

    #refreshOutput(entry: ProjectileEntry, o: ProjectileOutput, x: number, y: number): void {
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
        o.ownerIndex = entry.ownerIndex;
    }

    #refreshEntry(
        entry: ProjectileEntry,
        gid: string,
        now: number,
        output: ProjectileOutput[],
    ): void {
        const x = this.#posX(entry.ptr);
        const y = this.#posY(entry.ptr);
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
        const o = entry.out ?? this.#newOutput(entry, gid);
        this.#refreshOutput(entry, o, x, y);
        output.push(o);
    }

    #updateLiveProjectiles(now: number): ProjectileOutput[] {
        const output = this.#outArr;
        output.length = 0;
        this.#liveProjectiles.forEach((entry, gid) => {
            try {
                if (now - (entry.spawnTs || now) > STALE_MS) {
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

    #traveled(entry: ProjectileEntry, x: number, y: number): number {
        return length(x - entry.spawnX, y - entry.spawnY);
    }

    #scanOwn(own: NativePointer, bm: NativePointer): void {
        try {
            const mgrForTeam = bm.add(OFFSETS.BattleMode_objectManager).readPointer();
            if (isValidPtr(mgrForTeam)) this.#objMgrPtr = mgrForTeam;
        } catch {}
        this.state.myPlayerIndex = this.#readOwnerIndex(own);
        this.#friendlyIdx.clear();
        this.#friendlyIdx.add(this.state.myPlayerIndex);
        this.#charsByIndex.clear();
        this.#rememberCharacter(this.state.myPlayerIndex, own);
        this.state.myX = this.#posX(own);
        this.state.myY = this.#posY(own);
        this.state.mySpeed = 0;
        const ownData = this.dataFieldOf(own);
        if (!isValidPtr(ownData)) return;
        this.state.myRadius = Math.trunc(this.collisionRadius(ownData));
        const ownSpeed = this.#characterSpeed(ownData);
        if (ownSpeed >= 300 && ownSpeed <= 3000) this.state.mySpeed = ownSpeed;
    }

    #objectAt(
        objects: NativePointer,
        batchView: DataView | null,
        i: number,
        stride: number,
    ): NativePointer | null {
        if (batchView) {
            const off = i * stride;
            const lo = batchView.getUint32(off, true);
            const hi = batchView.getUint32(off + 4, true);
            if (lo === 0 && hi === 0) return null;
            return ptrFromU32(lo, hi);
        }
        return objects.add(i * stride).readPointer();
    }

    #isProjectileObj(obj: NativePointer, data: NativePointer): boolean {
        const vtableProj = this.#vtableProj;
        const vtableProjClient = this.#vtableProjClient;
        if (!vtableProj || !vtableProjClient) return false;
        let objVtable: NativePointer | null = null;
        try {
            objVtable = obj.readPointer();
        } catch {}
        if (objVtable && objVtable.equals(vtableProjClient)) return true;
        try {
            return data.readPointer().equals(vtableProj);
        } catch {
            return false;
        }
    }

    #brawlerNameOf(data: NativePointer): string | null {
        const dataKey = this.#ptrKey(data);
        if (!dataKey) return this.#readDataName(data);
        const cached = this.#brawlerNameCache.get(dataKey);
        if (cached !== undefined) return cached;
        const name = this.#readDataName(data);
        this.#brawlerNameCache.set(dataKey, name);
        return name;
    }

    #classifyObject(
        obj: NativePointer,
        own: NativePointer,
        bm: NativePointer,
        now: number,
    ): EnemyInfo | null {
        const data = this.dataFieldOf(obj);
        if (!isValidPtr(data)) return null;
        if (this.#isProjectileObj(obj, data)) {
            this.#captureProjectile(obj, data, now);
            return null;
        }
        if (obj.equals(own)) return null;
        if (!this.#isEnemyOf(obj, false)) {
            const idx = this.#readOwnerIndex(obj);
            if (idx >= 0) {
                this.#friendlyIdx.add(idx);
                if (idx !== this.state.myPlayerIndex) this.#rememberCharacter(idx, obj);
            }
            return null;
        }
        if (obj.add(OFFSETS.LogicCharacterClient_hitpoints).readU32() === 0) return null;
        const brawlerName = this.#brawlerNameOf(data);
        const radius = Math.trunc(this.collisionRadius(data));
        if (!brawlerName && radius <= 0) return null;
        const playerIndex = this.#readOwnerIndex(obj);
        if (brawlerName) this.#rememberCharacter(playerIndex, obj);
        return {
            gid: this.#ptrKey(obj),
            ptr: obj,
            x: this.#posX(obj),
            y: this.#posY(obj),
            brawlerName,
            body: obj,
            teamId: this.#teamOf(obj, bm),
            moveSpeed: this.#characterSpeed(data),
            moveAngle: this.#readMoveAngle(obj),
            radius,
            kind: brawlerName ? "player" : "spawnable",
        };
    }

    #scanObjectBatch(
        objects: NativePointer,
        count: number,
        own: NativePointer,
        bm: NativePointer,
        now: number,
    ): EnemyInfo[] {
        const enemies: EnemyInfo[] = [];
        const stride = OFFSETS.LogicGameObjectManagerClient_ptrStride;
        let batchView: DataView | null = null;
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

    #scanEnemies(own: NativePointer, bm: NativePointer, now: number): EnemyInfo[] {
        const objMgr = bm.add(OFFSETS.BattleMode_objectManager).readPointer();
        if (!isValidPtr(objMgr)) return [];
        const objects = objMgr.add(OFFSETS.LogicGameObjectManagerClient_objects).readPointer();
        const count = objMgr.add(OFFSETS.LogicGameObjectManagerClient_count).readU32();
        if (!isValidPtr(objects) || count <= 0 || count > MAX_OBJECTS) return [];
        return this.#scanObjectBatch(objects, count, own, bm, now);
    }

    update(bm: NativePointer, now: number = Date.now()): void {
        if (!this.#moduleBase) return;
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

    resetCache(): void {
        this.#brawlerNameCache.clear();
        this.#weaponMeta.clear();
        this.#liveProjectiles.clear();
        this.#friendlyIdx.clear();
        this.#objMgrPtr = null;
        this.#charsByIndex.clear();
        this.#charSpeedByData.clear();
        this.#outArr.length = 0;
        this.state.projectiles = [];
        this.state.myRadius = 0;
    }

    init(base: NativePointer): void {
        this.#moduleBase = base;
        this.#vtableProj = base.add(OFFSETS.LogicProjectileData_vtable);
        this.#vtableProjClient = base.add(OFFSETS.LogicProjectileClient_vtable);
    }

    enableProjectileTracking(): void {
        if (this.#moduleBase) this.#installProjectileHooks(this.#moduleBase);
    }
}

const scanner = new Scanner();
const scanData = scanner.state;

export { scanData };
export const travelDistance = (ticks: number, speed: number): number =>
    scanner.travelDistance(ticks, speed);
export const travelTicksFor = (data: NativePointer, rangeUnits: number, speed: number): number =>
    scanner.travelTicksFor(data, rangeUnits, speed);
export const weaponRangeUnits = (character: NativePointer): number =>
    scanner.weaponRangeUnits(character);
export const collisionRadius = (data: NativePointer): number => scanner.collisionRadius(data);
export const onDataReload = (callback: () => void): void => scanner.onDataReload(callback);
export const updateScanner = (bm: NativePointer, now: number): void => scanner.update(bm, now);
export const resetScannerCache = (): void => scanner.resetCache();
export const initScanner = (base: NativePointer): void => scanner.init(base);
export const enableProjectileTracking = (): void => scanner.enableProjectileTracking();
