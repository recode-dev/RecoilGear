import { getFunctions, isValidPtr, ptrFromU32 } from "./functions.js";
import { offsets } from "./offsets.js";
import { readScString } from "./scstring.js";
const GUARD = 0xb504;

function length(x, y) {
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return 46340;
    const s = x * x + y * y;
    if (s < 0) return 46340;
    return Math.floor(Math.sqrt(s));
}

var moduleBase = null;
var _brawlerNameCache = new Map();
var _scanCount = 0;
var _activeGidSet = new Set();
var _liveProjectiles = new Map();
var _friendlyIdx = new Set();
var _projectileHooksInstalled = false;
var _charRange = new Map();
var _weaponMeta = new Map();
var _auditState = { done: false, result: null };
var _speedByData = new Map();
var _charsByIndex = new Map();

export var scanData = {
    ownCharacter: ptr(0),
    battleModeClient: ptr(0),
    myTeamId: 0,
    myPlayerIndex: -1,
    myX: 0,
    myY: 0,
    mySpeed: 720,
    myRadius: 0,
    enemies: [],
    projectiles: [],
    measuredSpeed: 0,
    lastUpdate: 0
};

function _readDataName(data) {
    if (!isValidPtr(data)) return null;
    const fns = getFunctions();
    if (!fns.LogicData_getName) return null;
    try {
        const name = readScString(fns.LogicData_getName(data), 128);
        if (!name) return null;
        return (name.indexOf("hero_icon_") === 0 ? name.substring(10) : name).toUpperCase();
    } catch (_) {}
    return null;
}

function _readProjectileName(value) {
    const fns = getFunctions();
    if (!fns.LogicData_getName || !isValidPtr(value)) return null;
    try {
        const direct = readScString(fns.LogicData_getName(value), 128);
        if (direct) return direct;
    } catch (_) {}
    try {
        const data = value.add(offsets.ProjectileClient_data).readPointer();
        if (isValidPtr(data)) return readScString(fns.LogicData_getName(data), 128);
    } catch (_) {}
    return null;
}

function _readMoveAngle(obj) {
    const fns = getFunctions();
    if (fns.LogicCharacterClient_getMoveAngle) {
        try {
            const a = fns.LogicCharacterClient_getMoveAngle(obj);
            if (isFinite(a) && Math.abs(a) <= Math.PI * 2) return a;
        } catch (_) {}
    }
    try {
        const a = obj.add(offsets.CharacterClient_moveAngle).readFloat();
        if (isFinite(a) && Math.abs(a) <= Math.PI * 2) return a;
    } catch (_) {}
    return 0;
}

function _readOwnerIndex(obj) {
    try {
        return obj.add(offsets.LogicGameObjectClient_ownerIndex).readS32();
    } catch (_) {
        return -1;
    }
}

function _rememberCharacter(index, character) {
    if (index < 0 || !isValidPtr(character)) return;
    _charsByIndex.set(index, character);
}

function _rangeForOwner(ownerIndex) {
    if (ownerIndex < 0) return 0;

    const cached = _charRange.get(ownerIndex) || 0;
    if (cached > 0) return cached;

    const owner = _charsByIndex.get(ownerIndex);
    if (!isValidPtr(owner)) return 0;

    const fns = getFunctions();
    if (!fns.LogicSkillData_getCastingRange) return 0;

    let units = 0;
    if (fns.LogicCharacterClient__getWeaponSkill) {
        const skill = fns.LogicCharacterClient__getWeaponSkill(owner);
        if (isValidPtr(skill)) {
            try {
                const v = fns.LogicSkillData_getCastingRange(skill) | 0;
                if (v >= 100 && v <= 20000) units = v;
            } catch (_) {}
        }
    }
    if (units <= 0 && fns.LogicGameObjectClient_getData) {
        const data = fns.LogicGameObjectClient_getData(owner);
        if (isValidPtr(data)) {
            try {
                const v = fns.LogicSkillData_getCastingRange(data) | 0;
                if (v >= 100 && v <= 20000) units = v;
            } catch (_) {}
        }
    }

    if (units < 100 || units > 20000) return 0;

    _charRange.set(ownerIndex, units);
    return units;
}

function _readProjectileField(data, off, min, max) {
    try {
        const v = data.add(off).readS32() | 0;
        if (v < min || v > max) return 0;
        return v;
    } catch (_) {
        return 0;
    }
}

function _readProjectileRadius(data) {
    return _readProjectileField(data, offsets.ProjectileData_radiusField, 1, 2000);
}

function _readProjectileFlags(data) {
    let passes = 0;
    let pierces = 0;
    try {
        passes = data.add(offsets.ProjectileData_passesEnvironment).readU8() & 1;
    } catch (_) {}
    try {
        pierces = data.add(offsets.ProjectileData_piercesEnvironment).readU8() & 1;
    } catch (_) {}
    return { passes: !!passes, pierces: !!pierces };
}

function _volleyMs(weapon) {
    if (!weapon) return 0;
    if (weapon.bullets < 2 || weapon.msBetween <= 0) return 0;
    const total = weapon.bullets * weapon.msBetween;
    if (total > 0 && total <= 4000) return total;
    return 0;
}

function _readProjectileMeta(projectile, data) {
    const fns = getFunctions();
    let preMs = _readProjectileField(data, offsets.ProjectileData_preExplosionMs, 1, 60000);
    let lifeMs = 0;
    let typeId = -1;
    const homing = _readProjectileField(data, offsets.ProjectileData_isHomingMissile, 0, 1);
    const bouncing = _readProjectileField(data, offsets.ProjectileData_isBouncing, 0, 1);
    let steer = 0;
    if (fns.LogicProjectileClient_getPreExplosionTimeMs && !(preMs > 0)) {
        try {
            const v = fns.LogicProjectileClient_getPreExplosionTimeMs(data) | 0;
            if (v > 0 && v <= 60000) preMs = v;
        } catch (_) {}
    }
    if (fns.LogicProjectileClient_getTravelTicks) {
        try {
            const ticks = fns.LogicProjectileClient_getTravelTicks(projectile) | 0;
            if (ticks > 0 && ticks <= 3000) lifeMs = ticks * 20;
        } catch (_) {}
    }
    if (fns.LogicProjectileClient_getType) {
        try {
            const t = fns.LogicProjectileClient_getType(projectile) | 0;
            if (t >= 0 && t <= 20) typeId = t;
        } catch (_) {}
    }
    try {
        const v = data.add(offsets.ProjectileData_steerStrength).readFloat();
        if (v > 0 && v <= 1000) steer = v;
    } catch (_) {}
    return { preMs, lifeMs, typeId, homing: !!homing, bouncing: !!bouncing, steer };
}

function _weaponForOwner(ownerIndex) {
    if (ownerIndex < 0) return null;
    if (_weaponMeta.has(ownerIndex)) return _weaponMeta.get(ownerIndex);
    const owner = _charsByIndex.get(ownerIndex);
    if (!isValidPtr(owner)) return null;
    const fns = getFunctions();
    const out = { spread: 0, bullets: 0, msBetween: 0 };
    if (fns.LogicCharacterClient__getWeaponSkill && fns.LogicSkillData_getSpread) {
        try {
            const skill = fns.LogicCharacterClient__getWeaponSkill(owner);
            if (isValidPtr(skill)) {
                const bullets = fns.LogicSkillData_getNumBulletsInOneAttack
                    ? fns.LogicSkillData_getNumBulletsInOneAttack(skill) | 0
                    : 0;
                const between = fns.LogicSkillData_getMsBetweenAttacks
                    ? fns.LogicSkillData_getMsBetweenAttacks(skill) | 0
                    : 0;
                const spread = fns.LogicSkillData_getSpread(skill) | 0;
                if (bullets >= 1 && bullets <= 40) out.bullets = bullets;
                if (between >= 0 && between <= 3000) out.msBetween = between;
                if (spread > 0 && spread <= 120) out.spread = spread;
            }
        } catch (_) {}
    }
    _weaponMeta.set(ownerIndex, out);
    return out;
}

function _auditCheck(audit, name, fnValue, fieldValue, tol) {
    audit.done++;
    if (Math.abs(fnValue - fieldValue) > (tol || 0)) audit.bad.push(name);
}

function _runOffsetAudit(own, ownData, proj) {
    const audit = { done: 0, bad: [] };
    const fns = getFunctions();
    const client = proj.ptr;
    const data = proj.data;
    const checks = [
        [
            "getTargetX",
            () => fns.LogicProjectileClient_getTargetX(client),
            () => client.add(offsets.ProjectileClient_targetX).readS32()
        ],
        [
            "getTargetY",
            () => fns.LogicProjectileClient_getTargetY(client),
            () => client.add(offsets.ProjectileClient_targetY).readS32()
        ],
        [
            "getPreExplosionTimeMs",
            () => fns.LogicProjectileClient_getPreExplosionTimeMs(data),
            () => data.add(offsets.ProjectileData_preExplosionMs).readS32()
        ],
        [
            "isBeam",
            () => fns.LogicProjectileClient_isBeam(data),
            () => data.add(offsets.ProjectileData_isBeamField).readS8()
        ],
        [
            "isHomingMissile",
            () => fns.LogicProjectileClient_isHomingMissile(data),
            () => data.add(offsets.ProjectileData_isHomingMissile).readS8()
        ],
        [
            "isBouncing",
            () => fns.LogicProjectileClient_isBouncing(data),
            () => data.add(offsets.ProjectileData_isBouncing).readS8()
        ],
        [
            "piercesEnvironment",
            () => fns.LogicProjectileClient_piercesEnvironment(data),
            () => data.add(offsets.ProjectileData_piercesEnvironment).readS8()
        ],
        [
            "getType",
            () => fns.LogicProjectileClient_getType(client),
            () => client.add(offsets.ProjectileClient_typeField).readS32()
        ],
        [
            "ProjectileData_getSpeed",
            () => fns.LogicProjectileData_getSpeed(data),
            () => data.add(offsets.ProjectileData_speedField).readS32()
        ],
        [
            "ProjectileData_getRadius",
            () => fns.LogicProjectileData_getRadius(data),
            () => data.add(offsets.ProjectileData_radiusField).readS32()
        ],
        [
            "CharacterData_getSpeed",
            () => fns.LogicCharacterData_getSpeed(ownData),
            () => ownData.add(offsets.CharacterData_speedField).readS32()
        ],
        [
            "CharacterData_getCollisionRadius",
            () => fns.LogicCharacterData_getCollisionRadius(ownData),
            () => ownData.add(offsets.CharacterData_collisionRadiusField).readS32()
        ],
        [
            "getMoveAngle",
            () => fns.LogicCharacterClient_getMoveAngle(own),
            () => own.add(offsets.CharacterClient_moveAngle).readFloat()
        ]
    ];
    for (let i = 0; i < checks.length; i++) {
        const check = checks[i];
        audit.done++;
        try {
            const fnValue = check[1]();
            const fieldValue = check[2]();
            const tol = check[0] === "getMoveAngle" ? 0.01 : 0;
            if (Math.abs(fnValue - fieldValue) > tol) audit.bad.push(check[0]);
        } catch (_) {
            audit.bad.push(check[0] + ":exception");
        }
    }
    audit.done++;
    try {
        const ticks = fns.LogicProjectileClient_getTravelTicks(client) | 0;
        if (ticks < 0 || ticks > 3000) audit.bad.push("getTravelTicks:range");
    } catch (_) {
        audit.bad.push("getTravelTicks:exception");
    }
    audit.done++;
    try {
        const startR = fns.LogicCharacterData_getProjectileStartRadius(ownData) | 0;
        if (startR !== 50) audit.bad.push("getProjectileStartRadius:const");
    } catch (_) {
        audit.bad.push("getProjectileStartRadius:exception");
    }
    audit.ok = audit.done - audit.bad.length;
    _auditState = { done: true, result: audit };
    scanData.audit = audit;
}

function _readProjectileTarget(projectile, x, y) {
    try {
        const tx = projectile.add(offsets.ProjectileClient_targetX).readS32() | 0;
        const ty = projectile.add(offsets.ProjectileClient_targetY).readS32() | 0;
        if (tx === 0 && ty === 0) return null;
        if (tx > 100000 || tx < -100000 || ty > 100000 || ty < -100000) return null;
        if (tx === x && ty === y) return null;
        return { x: tx, y: ty };
    } catch (_) {
        return null;
    }
}

function _captureProjectile(projectile, data) {
    if (!isValidPtr(projectile)) return;
    const fns = getFunctions();
    try {
        if (!isValidPtr(data)) data = fns.LogicGameObjectClient_getData(projectile);
        if (!isValidPtr(data)) return;
        const gid = String(fns.LogicGameObjectClient_getGlobalID(projectile));
        const existing = _liveProjectiles.get(gid);
        if (existing) {
            existing.ptr = projectile;
            existing.data = data;
            return;
        }
        const x = fns.LogicGameObjectClient_getX(projectile) | 0;
        const y = fns.LogicGameObjectClient_getY(projectile) | 0;
        const dataSpeed = _readProjectileField(data, offsets.ProjectileData_speedField, 1, 20000);
        const radius = _readProjectileRadius(data);
        const flags = _readProjectileFlags(data);
        const target = _readProjectileTarget(projectile, x, y);
        let isIndirect = 0;
        try {
            if (offsets.Projectile_isIndirect && isValidPtr(data)) {
                isIndirect = data.add(offsets.Projectile_isIndirect).readU8() | 0;
            }
        } catch (_) {}
        let isBeam = false;
        try {
            isBeam = data.add(offsets.ProjectileData_isBeamField).readU8() > 0;
        } catch (_) {}
        if (!isBeam && fns.LogicProjectileClient_isBeam) {
            try {
                isBeam = !!fns.LogicProjectileClient_isBeam(data);
            } catch (_) {}
        }
        const ownerIndex = _readOwnerIndex(projectile);
        const name = _readProjectileName(data);
        const castRange = _rangeForOwner(ownerIndex);
        const meta = _readProjectileMeta(projectile, data);
        let seekX = 0;
        let seekY = 0;
        if (meta.homing && (scanData.myX || scanData.myY)) {
            const dx = scanData.myX - x;
            const dy = scanData.myY - y;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len > 1) {
                seekX = dx / len;
                seekY = dy / len;
            }
        }
        const now = Date.now();
        _liveProjectiles.set(gid, {
            gid,
            ptr: projectile,
            data,
            ownerIndex,
            name,
            seekX,
            seekY,
            x,
            y,
            spawnX: x,
            spawnY: y,
            speed: dataSpeed,
            radius,
            targetX: target ? target.x : 0,
            targetY: target ? target.y : 0,
            hasTarget: !!target,
            passesEnv: flags.passes,
            piercesEnv: flags.pierces,
            isIndirect: isIndirect,
            isBeam,
            castRange,
            preMs: meta.preMs,
            lifeMs: meta.lifeMs,
            typeId: meta.typeId,
            homing: meta.homing,
            bouncing: meta.bouncing,
            steer: meta.steer,
            weapon: _weaponForOwner(ownerIndex),
            lastX: x,
            lastY: y,
            lastTs: now,
            hasVelocitySample: false,
            vx: 0,
            vy: 0
        });
    } catch (_) {}
}

function _removeProjectile(projectile) {
    try {
        const gid = String(getFunctions().LogicGameObjectClient_getGlobalID(projectile));
        _liveProjectiles.delete(gid);
    } catch (_) {}
}

function _installProjectileHooks(base) {
    if (_projectileHooksInstalled) return;
    _projectileHooksInstalled = true;
    try {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_ctor), {
            onEnter(args) {
                this.projectile = args[0];
                this.data = args[1];
            },
            onLeave() {
                _captureProjectile(this.projectile, this.data);
            }
        });
    } catch (_) {}
    try {
        Interceptor.attach(base.add(offsets.LogicProjectileClient_destruct), {
            onEnter(args) {
                _removeProjectile(args[0]);
            }
        });
    } catch (_) {}
}

function _updateLiveProjectiles(now) {
    const fns = getFunctions();
    const output = [];
    for (const [gid, projectile] of _liveProjectiles) {
        try {
            if (projectile.ptr.isNull()) {
                _liveProjectiles.delete(gid);
                continue;
            }
            const x = fns.LogicGameObjectClient_getX(projectile.ptr) | 0;
            const y = fns.LogicGameObjectClient_getY(projectile.ptr) | 0;
            const dt = (now - projectile.lastTs) / 1000;
            const dx = x - projectile.lastX;
            const dy = y - projectile.lastY;
            if (dt > 0.008 && dt < 0.3 && dx * dx + dy * dy >= 16) {
                const observedVx = dx / dt;
                const observedVy = dy / dt;
                if (length(observedVx, observedVy) > 8500) {
                    projectile.lastX = x;
                    projectile.lastY = y;
                    projectile.lastTs = now;
                    continue;
                }
                const alpha = projectile.hasVelocitySample ? 0.4 : 1;
                projectile.vx = projectile.vx * (1 - alpha) + observedVx * alpha;
                projectile.vy = projectile.vy * (1 - alpha) + observedVy * alpha;
                projectile.hasVelocitySample = true;

                const measured = length(projectile.vx, projectile.vy);
                if (measured >= 300 && measured <= 8500) {
                    projectile.speed = measured;
                    if (projectile.ownerIndex === scanData.myPlayerIndex) {
                        const dataPtr = projectile.data;
                        if (isValidPtr(dataPtr)) {
                            const key = dataPtr.toString();
                            const entry = _speedByData.get(key) || { sum: 0, count: 0 };
                            entry.sum += measured;
                            entry.count++;
                            _speedByData.set(key, entry);
                            scanData.measuredSpeed = Math.round(entry.sum / entry.count);
                        }
                    }
                }
            }
            const liveTarget = _readProjectileTarget(projectile.ptr, x, y);
            if (liveTarget) {
                projectile.targetX = liveTarget.x;
                projectile.targetY = liveTarget.y;
                projectile.hasTarget = true;
            } else {
                projectile.hasTarget = false;
            }
            projectile.lastX = x;
            projectile.lastY = y;
            projectile.lastTs = now;
            if (projectile.castRange <= 0) {
                projectile.castRange = _rangeForOwner(projectile.ownerIndex);
            }
            if (projectile.ownerIndex >= 0 && _friendlyIdx.has(projectile.ownerIndex)) continue;
            if (projectile.ownerIndex >= 0 && projectile.ownerIndex === scanData.myPlayerIndex)
                continue;
            output.push({
                gid,
                name: projectile.name,
                x,
                y,
                spawnX: projectile.spawnX,
                spawnY: projectile.spawnY,
                speed: projectile.speed,
                radius: projectile.radius,
                targetX: projectile.targetX,
                targetY: projectile.targetY,
                hasTarget: !!projectile.hasTarget,
                passesEnv: !!projectile.passesEnv,
                piercesEnv: !!projectile.piercesEnv,
                isIndirect: !!projectile.isIndirect,
                isBeam: !!projectile.isBeam,
                castRange: projectile.castRange || 0,
                preMs: projectile.preMs || 0,
                lifeMs: projectile.lifeMs || 0,
                typeId: projectile.typeId,
                homing: projectile.homing,
                seekX: projectile.seekX,
                seekY: projectile.seekY,
                bouncing: projectile.bouncing,
                steer: projectile.steer || 0,
                volleyMs: _volleyMs(projectile.weapon),
                ownerIndex: projectile.ownerIndex,
                vx: projectile.vx,
                vy: projectile.vy
            });
        } catch (_) {
            _liveProjectiles.delete(gid);
        }
    }
    return output;
}

export function updateScanner(bm, now) {
    if (!moduleBase) return;
    if (now === void 0) now = Date.now();
    const functions = getFunctions();
    try {
        const own = functions.LogicBattleModeClient_getOwnCharacter(bm);
        if (!isValidPtr(own)) {
            scanData.ownCharacter = null;
            scanData.battleModeClient = null;
            scanData.lastUpdate = 0;
            return;
        }
        scanData.ownCharacter = own;
        scanData.battleModeClient = bm;
        scanData.myTeamId = bm.add(offsets.BattleModeClient_ownTeam).readS32();
        scanData.myPlayerIndex = _readOwnerIndex(own);
        _friendlyIdx.clear();
        _friendlyIdx.add(scanData.myPlayerIndex);
        _charsByIndex.clear();
        _rememberCharacter(scanData.myPlayerIndex, own);
        scanData.myX = functions.LogicGameObjectClient_getX(own) | 0;
        scanData.myY = functions.LogicGameObjectClient_getY(own) | 0;
        scanData.mySpeed = 720;
        const ownData = functions.LogicGameObjectClient_getData(own);
        if (isValidPtr(ownData)) {
            const getRadius = functions.LogicCharacterData_getCollisionRadius;
            if (getRadius) scanData.myRadius = getRadius(ownData) | 0;
            try {
                const speed = functions.LogicCharacterData_getSpeed
                    ? functions.LogicCharacterData_getSpeed(ownData) | 0
                    : 0;
                if (speed >= 300 && speed <= 3000) scanData.mySpeed = speed;
            } catch (_) {}
        }
        const enemies = [];
        const vtableProj = moduleBase.add(offsets.VTABLE_PROJECTILE_DATA);
        const objMgr = bm.add(offsets.BattleModeClient_objectManager).readPointer();
        if (isValidPtr(objMgr)) {
            const objects = objMgr.add(offsets.ObjectManager_objectsArray).readPointer();
            const count = objMgr.add(offsets.ObjectManager_count).readU32();
            if (isValidPtr(objects) && count > 0 && count <= 1200) {
                const stride = offsets.ObjectManager_ptrStride;
                let batchView = null;
                try {
                    const buf = objects.readByteArray(count * stride);
                    if (buf) batchView = new DataView(buf);
                } catch (_) {}
                for (let i = 0; i < count; i++) {
                    try {
                        let obj;
                        if (batchView) {
                            const off = i * stride;
                            const lo = batchView.getUint32(off, true);
                            const hi = batchView.getUint32(off + 4, true);
                            if (lo === 0 && hi === 0) continue;
                            obj = ptrFromU32(lo, hi);
                        } else {
                            obj = objects.add(i * stride).readPointer();
                        }
                        if (!isValidPtr(obj)) continue;
                        const data = functions.LogicGameObjectClient_getData(obj);
                        if (!isValidPtr(data)) continue;
                        const team = obj.add(offsets.GameObj_team).readU32();
                        if (data.readPointer().equals(vtableProj)) {
                            _captureProjectile(obj, data);
                            continue;
                        }
                        if (team === scanData.myTeamId) {
                            const idx = _readOwnerIndex(obj);
                            if (idx >= 0) _friendlyIdx.add(idx);
                            continue;
                        }
                        if (obj.add(offsets.GameObj_hp).readU32() === 0) continue;
                        const gid = String(functions.LogicGameObjectClient_getGlobalID(obj));
                        let brawlerName = _brawlerNameCache.get(gid);
                        if (brawlerName === void 0) {
                            brawlerName = _readDataName(data);
                            _brawlerNameCache.set(gid, brawlerName);
                        }
                        let radius = 0;
                        try {
                            radius = functions.LogicCharacterData_getCollisionRadius
                                ? functions.LogicCharacterData_getCollisionRadius(data) | 0
                                : 0;
                        } catch (_) {}
                        if (!brawlerName && radius <= 0) continue;
                        const kind = brawlerName ? "player" : "spawnable";
                        let moveSpeed = 0;
                        try {
                            moveSpeed = functions.LogicCharacterData_getSpeed
                                ? functions.LogicCharacterData_getSpeed(data) | 0
                                : 0;
                        } catch (_) {}
                        const playerIndex = _readOwnerIndex(obj);
                        if (brawlerName) _rememberCharacter(playerIndex, obj);
                        enemies.push({
                            gid,
                            ptr: obj,
                            x: functions.LogicGameObjectClient_getX(obj) | 0,
                            y: functions.LogicGameObjectClient_getY(obj) | 0,
                            brawlerName,
                            body: obj,
                            teamId: team,
                            moveSpeed,
                            moveAngle: _readMoveAngle(obj),
                            kind: kind
                        });
                    } catch (_) {}
                }
            }
        }
        _scanCount++;
        if ((_scanCount & 63) === 0) {
            _activeGidSet.clear();
            for (const enemy of enemies) _activeGidSet.add(enemy.gid);
            for (const gid of _brawlerNameCache.keys()) {
                if (!_activeGidSet.has(gid)) _brawlerNameCache.delete(gid);
            }
        }
        scanData.enemies = enemies;
        scanData.projectiles = _updateLiveProjectiles(now);
        if (!_auditState.done && ownData && _liveProjectiles.size > 0) {
            const first = _liveProjectiles.values().next().value;
            if (first && first.ptr && first.data) {
                try {
                    _runOffsetAudit(own, ownData, first);
                } catch (_) {}
            }
        }
        scanData.lastUpdate = now;
    } catch (_) {}
}

export function resetScannerCache() {
    _brawlerNameCache.clear();
    _charRange.clear();
    _weaponMeta.clear();
    _liveProjectiles.clear();
    _friendlyIdx.clear();
    _charsByIndex.clear();
    _speedByData.clear();
    scanData.projectiles = [];
    scanData.measuredSpeed = 0;
    scanData.myRadius = 0;
}

export function initScanner(base) {
    moduleBase = base;
}

export function enableProjectileTracking() {
    if (moduleBase) _installProjectileHooks(moduleBase);
}
