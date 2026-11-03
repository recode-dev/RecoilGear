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

    const data = fns.LogicGameObjectClient_getData
        ? fns.LogicGameObjectClient_getData(owner)
        : null;
    if (!isValidPtr(data)) return 0;

    let units = 0;
    try {
        units = fns.LogicSkillData_getCastingRange(data) | 0;
    } catch (_) {
        return 0;
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
            isBeam = !!(fns.LogicProjectileData_isBeam && fns.LogicProjectileData_isBeam(data));
        } catch (_) {}
        const ownerIndex = _readOwnerIndex(projectile);
        const name = _readProjectileName(data);
        const castRange = _rangeForOwner(ownerIndex);
        const now = Date.now();
        _liveProjectiles.set(gid, {
            gid,
            ptr: projectile,
            data,
            ownerIndex,
            name,
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
        scanData.lastUpdate = now;
    } catch (_) {}
}

export function resetScannerCache() {
    _brawlerNameCache.clear();
    _charRange.clear();
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
