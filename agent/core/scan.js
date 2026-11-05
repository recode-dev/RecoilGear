import { getFunctions, isValidPtr, ptrFromU32 } from "./functions.js";
import { offsets } from "./offsets.js";
import { readScString } from "./scstring.js";
import { tileSizeUnits } from "../utils/walls.js";

const guard = 0xb504;
export const tileUnits = 100;
export const ticksPerSec = 20;
const tickMs = 1000 / ticksPerSec;
export const beamTicks = 18000;
const columnSpan = 48;
const staleMs = 10000;
const defaultProjectileRadius = 40;
const cacheMax = 2048;
const dataTtlMs = 3000;
const angleTtlMs = 120;
const ringCap = 24;

const length = (x, y) => {
    if (x > guard || x < -guard || y > guard || y < -guard) return 46340;
    const s = x * x + y * y;
    if (s < 0) return 46340;
    return Math.floor(Math.sqrt(s));
};

class Scanner {
    #brawlerNameCache = new Map();
    #scanCount = 0;
    #liveProjectiles = new Map();
    #friendlyIdx = new Set();
    #objectsArr = null;
    #objCount = 0;
    #objMgrPtr = null;
    #projectileHooksInstalled = false;
    #charRange = new Map();
    #weaponMeta = new Map();
    #speedByData = new Map();
    #charSpeedByData = new Map();
    #charsByIndex = new Map();
    #learnedTravel = new Map();
    #rangeBonus = new Map();
    #rangeScale = 0;
    #columnCache = new Map();
    #colCands = new Map();
    #reloadCallbacks = [];
    #dataHooksInstalled = false;
    #insideTravelCall = false;
    #flightRange = new Map();
    #probeBudget = 0;
    #dataCache = new Map();
    #angleCache = new Map();
    #coreHooksInstalled = false;
    #moveAppliedAt = 0;
    #moveAppliedX = 0;
    #moveAppliedY = 0;
    #inputAt = 0;
    #inputX = 0;
    #inputY = 0;
    #ringKeys = new Array(ringCap).fill(0);
    #ringVals = new Array(ringCap).fill(null);
    #ringHead = 0;
    #outArr = [];
    #moduleBase = null;
    state = {
        ownCharacter: ptr(0),
        battleModeClient: ptr(0),
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
    };

    #ptrKey(value) {
        try {
            return value.toString();
        } catch (_) {
            return null;
        }
    }

    dataFieldOf(obj) {
        if (!isValidPtr(obj)) return ptr(0);
        try {
            return obj.add(offsets.LogicGameObjectClient_data).readPointer();
        } catch (_) {
            return ptr(0);
        }
    }

    #fieldS32(obj, off) {
        try {
            return obj.add(off).readS32() | 0;
        } catch (_) {
            return 0;
        }
    }

    dataOf(obj) {
        if (!isValidPtr(obj)) return ptr(0);
        const key = this.#ptrKey(obj);
        const now = Date.now();
        if (key) {
            const hit = this.#dataCache.get(key);
            if (hit && now - hit.ts <= dataTtlMs) return hit.data;
        }
        const fns = getFunctions();
        if (!fns.LogicGameObjectClient_getData) return ptr(0);
        const data = fns.LogicGameObjectClient_getData(obj);
        if (key && isValidPtr(data)) this.#cacheData(key, data, now);
        return data;
    }

    #cacheData(key, data, now) {
        if (this.#dataCache.size > cacheMax) this.#dataCache.clear();
        this.#dataCache.set(key, { data, ts: now });
    }

    #ringMemo(obj, val) {
        const raw = obj.toInt32();
        for (let i = 0; i < ringCap; i++) {
            if (this.#ringKeys[i] === raw) return;
        }
        const key = this.#ptrKey(obj);
        if (!key) return;
        const slot = this.#ringHead;
        this.#ringHead = (this.#ringHead + 1) % ringCap;
        this.#ringKeys[slot] = raw;
        this.#ringVals[slot] = key;
        this.#cacheData(key, val, Date.now());
    }

    #ringLookup(obj) {
        const raw = obj.toInt32();
        for (let i = 0; i < ringCap; i++) {
            if (this.#ringKeys[i] === raw) return this.#ringVals[i];
        }
        return null;
    }

    #moveAngleOf(obj) {
        if (!isValidPtr(obj)) return 0;
        const key = this.#ptrKey(obj);
        if (key) {
            const hit = this.#angleCache.get(key);
            if (hit && Date.now() - hit.ts <= angleTtlMs) return hit.angle;
        }
        return this.#readMoveAngle(obj);
    }

    moveAppliedSince(x, y, ms) {
        if (!(this.#moveAppliedAt > 0)) return false;
        if (Date.now() - this.#moveAppliedAt > ms) return false;
        const dx = x - this.#moveAppliedX;
        const dy = y - this.#moveAppliedY;
        return dx * dx + dy * dy <= 4;
    }

    inputSentSince(x, y, ms) {
        if (!(this.#inputAt > 0) || Date.now() - this.#inputAt > ms) return false;
        const dx = x - this.#inputX;
        const dy = y - this.#inputY;
        return dx * dx + dy * dy <= 4;
    }

    #installCoreHooks(base) {
        if (this.#coreHooksInstalled || !base) return;
        this.#coreHooksInstalled = true;
        const self = this;
        try {
            Interceptor.attach(base.add(offsets.LogicGameObjectClient_getData), {
                onEnter(args) {
                    this.obj = args[0];
                },
                onLeave(retval) {
                    try {
                        if (retval.isNull()) return;
                        if (self.#ringLookup(this.obj) !== null) return;
                        self.#ringMemo(this.obj, retval);
                    } catch (_) {}
                }
            });
        } catch (_) {}
        try {
            Interceptor.attach(base.add(offsets.LogicCharacterClient_getMoveAngle), {
                onEnter(args) {
                    this.obj = args[0];
                },
                onLeave() {
                    try {
                        if (!isValidPtr(this.obj)) return;
                        const key = self.#ringLookup(this.obj);
                        if (key !== null) return;
                        const deg =
                            this.obj.add(offsets.LogicCharacterClient_moveAngle).readS32() | 0;
                        if (deg < -720 || deg > 720) return;
                        const slotKey = self.#ptrKey(this.obj);
                        if (!slotKey) return;
                        const raw = this.obj.toInt32();
                        const slot = self.#ringHead;
                        self.#ringHead = (self.#ringHead + 1) % ringCap;
                        self.#ringKeys[slot] = raw;
                        self.#ringVals[slot] = slotKey;
                        if (self.#angleCache.size > cacheMax) self.#angleCache.clear();
                        self.#angleCache.set(slotKey, {
                            angle: (deg * Math.PI) / 180,
                            ts: Date.now()
                        });
                    } catch (_) {}
                }
            });
        } catch (_) {}
        try {
            Interceptor.attach(base.add(offsets.LogicBattleModeClient_setClientPredictionMoveTo), {
                onEnter: (args) => {
                    self.#moveAppliedAt = Date.now();
                    self.#moveAppliedX = args[1].toInt32();
                    self.#moveAppliedY = args[2].toInt32();
                }
            });
        } catch (_) {}
        try {
            Interceptor.attach(base.add(offsets.ClientInputManager_addInput), {
                onEnter(args) {
                    try {
                        const ci = args[1];
                        if (!isValidPtr(ci)) return;
                        self.#inputX = ci.add(offsets.ClientInput_x).readS32() | 0;
                        self.#inputY = ci.add(offsets.ClientInput_y).readS32() | 0;
                        self.#inputAt = Date.now();
                    } catch (_) {}
                }
            });
        } catch (_) {}
    }

    #readDataName(data) {
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

    #validAngleDeg(deg) {
        return isFinite(deg) && deg >= -720 && deg <= 720;
    }

    #readMoveAngle(obj) {
        const fns = getFunctions();
        if (fns.LogicCharacterClient_getMoveAngle) {
            try {
                const deg = fns.LogicCharacterClient_getMoveAngle(obj) | 0;
                if (this.#validAngleDeg(deg)) return (deg * Math.PI) / 180;
            } catch (_) {}
        }
        try {
            const deg = obj.add(offsets.LogicCharacterClient_moveAngle).readS32() | 0;
            if (this.#validAngleDeg(deg)) return (deg * Math.PI) / 180;
        } catch (_) {}
        return 0;
    }

    #readOwnerIndex(obj) {
        try {
            return obj.add(offsets.LogicGameObjectClient_ownerIndex).readS32();
        } catch (_) {
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
                    const t = fns.LogicGameObjectClient_getTeam(obj, mgr) | 0;
                    if (t !== -1) return t;
                }
            } catch (_) {}
        }
        try {
            const t = obj.add(offsets.LogicGameObjectClient_team).readU32() | 0;
            return t === -1 ? -1 : t;
        } catch (_) {
            return -1;
        }
    }

    #ownTeamOf(mgr) {
        if (!isValidPtr(mgr)) return -1;
        const fns = getFunctions();
        if (fns.LogicGameObjectManagerClient_getOwnPlayerTeam) {
            try {
                const t = fns.LogicGameObjectManagerClient_getOwnPlayerTeam(mgr) | 0;
                if (t >= 0) return t;
            } catch (_) {}
        }
        try {
            const t = mgr.add(offsets.LogicGameObjectManagerClient_ownTeam).readS32() | 0;
            return t >= 0 ? t : -1;
        } catch (_) {
            return -1;
        }
    }

    #isEnemyOf(obj, bm, unknownAsEnemy) {
        if (!isValidPtr(obj)) return unknownAsEnemy === true;
        const fns = getFunctions();
        if (fns.LogicGamePlayUtil_isEnemy) {
            try {
                return fns.LogicGamePlayUtil_isEnemy(obj) !== 0;
            } catch (_) {}
        }
        try {
            const mode = isValidPtr(bm) ? bm : this.state.battleModeClient;
            if (isValidPtr(mode)) {
                const mgr = mode.add(offsets.BattleMode_objectManager).readPointer();
                if (isValidPtr(mgr)) {
                    const myTeam = this.#ownTeamOf(mgr);
                    if (myTeam >= 0 && fns.LogicGameObjectClient_getTeam) {
                        try {
                            return (fns.LogicGameObjectClient_getTeam(obj, mgr) | 0) !== myTeam;
                        } catch (_) {}
                    }
                }
            }
        } catch (_) {}
        return unknownAsEnemy === true;
    }

    isEnemyObject(obj) {
        return this.#isEnemyOf(obj, this.state.battleModeClient, false);
    }

    #roundDiv(a, b) {
        if (b === 0) return 0;
        return Math.round(a / b);
    }

    travelTicks(rangeUnits, speed, beam) {
        if (beam) return beamTicks;
        if (!(rangeUnits > 0) || !(speed > 0)) return 0;
        return Math.max(1, this.#roundDiv(rangeUnits * ticksPerSec, speed));
    }

    travelDistance(ticks, speed) {
        if (!(ticks > 0) || ticks >= beamTicks || !(speed > 0)) return 0;
        return Math.round((ticks * speed) / ticksPerSec);
    }

    #learnTravel(key, a1, a2, ticks) {
        if (!key || !(ticks >= 0)) return;
        if (ticks >= beamTicks) {
            if (!this.#learnedTravel.has(key))
                this.#learnedTravel.set(key, { ticks: beamTicks, range: 0, speed: 0, beam: true });
            return;
        }
        if (ticks <= 0) return;
        const pairs = a1 <= a2 ? [a1, a2, a2, a1] : [a2, a1, a1, a2];
        for (let i = 0; i < 4; i += 2) {
            const range = pairs[i];
            const speed = pairs[i + 1];
            if (range < 50 || range > 30000 || speed < 50 || speed > 20000) continue;
            if (Math.abs(this.travelTicks(range, speed, false) - ticks) > 1) continue;
            const prev = this.#learnedTravel.get(key);
            if (prev && prev.range === range && prev.ticks === ticks) return;
            this.#learnedTravel.set(key, { ticks, range, speed, beam: false });
            return;
        }
    }

    #learnedFor(projectile, data) {
        if (isValidPtr(projectile)) {
            const hit = this.#learnedTravel.get(projectile.toString());
            if (hit) return hit;
        }
        if (isValidPtr(data)) {
            const hit = this.#learnedTravel.get(data.toString());
            if (hit) return hit;
        }
        return null;
    }

    travelFor(data) {
        if (!isValidPtr(data)) return null;
        return this.#learnedTravel.get(data.toString()) || null;
    }

    #callTravelTicks(data, rangeUnits, speed) {
        if (!isValidPtr(data) || !(rangeUnits > 0) || !(speed > 0)) return 0;
        const fn = getFunctions().LogicProjectileClient_getTravelTicks;
        if (!fn) return 0;
        this.#insideTravelCall = true;
        try {
            const ticks = fn(data, rangeUnits, speed) | 0;
            if (ticks <= 0 || ticks > beamTicks) return 0;
            if (ticks >= beamTicks) return ticks;
            if (Math.abs(this.travelTicks(rangeUnits, speed, false) - ticks) > 1) return 0;
            return ticks;
        } catch (_) {
            return 0;
        } finally {
            this.#insideTravelCall = false;
        }
    }

    #weaponSkillFor(character) {
        if (!isValidPtr(character)) return null;
        const fns = getFunctions();
        if (!fns.LogicCharacterClient_getWeaponSkill) return null;
        try {
            const skill = fns.LogicCharacterClient_getWeaponSkill(character);
            if (isValidPtr(skill)) return skill;
        } catch (_) {}
        return null;
    }

    #calibrateRangeScale(tiles, rangeUnits) {
        if (!(tiles >= 1 && tiles <= 64) || !(rangeUnits >= 100 && rangeUnits <= 30000))
            return false;
        const per = rangeUnits / tiles;
        const tile = tileSizeUnits();
        const candidates = [tile, Math.floor(tile / 3), tileUnits];
        let best = 0;
        for (let i = 0; i < candidates.length; i++) {
            const c = candidates[i];
            if (!(c > 0)) continue;
            const ratio = per / c;
            if (ratio < 0.95 || ratio > 2) continue;
            if (c > best) best = c;
        }
        if (!(best > 0) || best === this.#rangeScale) return false;
        this.#rangeScale = best;
        this.#charRange.clear();
        this.#rangeBonus.clear();
        return true;
    }

    #rangeScaleUnits() {
        return this.#rangeScale > 0 ? this.#rangeScale : tileUnits;
    }

    rangeScaleCalibrated() {
        return this.#rangeScale > 0;
    }

    #castingRangeTiles(character) {
        const skill = this.#weaponSkillFor(character);
        if (!skill) return 0;
        const fns = getFunctions();
        if (!fns.LogicSkillData_getCastingRange) return 0;
        try {
            const tiles = fns.LogicSkillData_getCastingRange(skill) | 0;
            if (tiles >= 1 && tiles <= 64) return tiles;
        } catch (_) {}
        return 0;
    }

    #rangeForOwner(ownerIndex) {
        if (ownerIndex < 0) return 0;
        const cached = this.#charRange.get(ownerIndex) || 0;
        if (cached > 0) return cached;
        const owner = this.#charsByIndex.get(ownerIndex);
        if (!isValidPtr(owner)) return 0;
        const tiles = this.#castingRangeTiles(owner);
        if (tiles <= 0) return 0;
        if (!this.rangeScaleCalibrated()) return 0;
        const units = tiles * this.#rangeScaleUnits() + (this.#rangeBonus.get(ownerIndex) || 0);
        this.#charRange.set(ownerIndex, units);
        return units;
    }

    weaponRangeUnits(character) {
        if (!isValidPtr(character)) return 0;
        const tiles = this.#castingRangeTiles(character);
        if (tiles <= 0 || !this.rangeScaleCalibrated()) return 0;
        const index = this.#readOwnerIndex(character);
        return (
            tiles * this.#rangeScaleUnits() + (index >= 0 ? this.#rangeBonus.get(index) || 0 : 0)
        );
    }

    #learnRangeBonus(ownerIndex, rangeUnits) {
        if (ownerIndex < 0 || !(rangeUnits > 0)) return;
        const owner = this.#charsByIndex.get(ownerIndex);
        if (!isValidPtr(owner)) return;
        const tiles = this.#castingRangeTiles(owner);
        if (tiles <= 0) return;
        this.#calibrateRangeScale(tiles, rangeUnits);
        const bonus = rangeUnits - tiles * this.#rangeScaleUnits();
        if (bonus < 0 || bonus > 4 * this.#rangeScaleUnits()) return;
        if ((this.#rangeBonus.get(ownerIndex) || 0) === bonus) return;
        this.#rangeBonus.set(ownerIndex, bonus);
        this.#charRange.delete(ownerIndex);
    }

    #readProjectileField(data, off, min, max) {
        try {
            const v = data.add(off).readS32() | 0;
            if (v < min || v > max) return 0;
            return v;
        } catch (_) {
            return 0;
        }
    }

    #dataRow(data) {
        try {
            const row = data.add(offsets.LogicProjectileData_reader).readPointer();
            return isValidPtr(row) ? row : null;
        } catch (_) {
            return null;
        }
    }

    #columnInt(data, col) {
        const fns = getFunctions();
        if (fns.LogicProjectileData_getIntValueFromColumn) {
            try {
                return fns.LogicProjectileData_getIntValueFromColumn(data, col) | 0;
            } catch (_) {}
        }
        const row = this.#dataRow(data);
        if (!row) return 0;
        if (fns.LogicData_getIntegerValueAt) {
            try {
                return fns.LogicData_getIntegerValueAt(row, col) | 0;
            } catch (_) {}
        }
        return 0;
    }

    #columnBool(data, col) {
        const fns = getFunctions();
        if (fns.LogicProjectileData_getBoolValueFromColumn) {
            try {
                return fns.LogicProjectileData_getBoolValueFromColumn(data, col) ? 1 : 0;
            } catch (_) {}
        }
        if (fns.LogicProjectileData_getBoolValueFromColumn2) {
            try {
                return fns.LogicProjectileData_getBoolValueFromColumn2(data, col) ? 1 : 0;
            } catch (_) {}
        }
        const row = this.#dataRow(data);
        if (row && fns.LogicData_getBooleanValueAt) {
            try {
                return fns.LogicData_getBooleanValueAt(row, col) ? 1 : 0;
            } catch (_) {}
        }
        return 0;
    }

    #probeColumn(kind, read, data, value) {
        if (this.#probeBudget <= 0) return;
        let st = this.#colCands.get(kind);
        if (!st) {
            let budget = 2;
            st = { cols: null, next: 0, rounds: 1 };
            while (budget > 0 && this.#probeBudget > 0 && st.next < columnSpan) {
                this.#probeBudget--;
                budget--;
                if (read.call(this, data, st.next) === value) {
                    if (!st.cols) st.cols = new Set();
                    st.cols.add(st.next);
                }
                st.next++;
            }
            if (st.next >= columnSpan && !st.cols) {
                this.#columnCache.set(kind, -1);
                this.#colCands.set(kind, { cols: null, next: columnSpan, rounds: 99 });
                return;
            }
            this.#colCands.set(kind, st);
            if (st.cols && st.cols.size === 1 && st.next >= columnSpan)
                this.#columnCache.set(kind, st.cols.values().next().value);
            return;
        }
        if (!st.cols || st.next >= columnSpan) return;
        let budget = 2;
        while (budget > 0 && this.#probeBudget > 0 && st.next < columnSpan) {
            this.#probeBudget--;
            budget--;
            if (read.call(this, data, st.next) === value) st.cols.add(st.next);
            st.next++;
        }
        if (st.next >= columnSpan) {
            if (st.cols.size === 1) this.#columnCache.set(kind, st.cols.values().next().value);
            else if (st.cols.size === 0) this.#columnCache.set(kind, -1);
            else if (st.rounds < 10) {
                st.rounds++;
                st.next = 0;
                return;
            } else this.#columnCache.set(kind, -1);
        }
    }

    #readProjectileInt(data, off, kind, min, max, getter) {
        let value = 0;
        if (getter) {
            try {
                const v = getter(data) | 0;
                if (v >= min && v <= max) value = v;
            } catch (_) {}
        }
        if (!(value > 0)) value = this.#readProjectileField(data, off, min, max);
        if (value > 0) {
            if (this.#columnCache.get(kind) === undefined)
                this.#probeColumn(kind, this.#columnInt, data, value);
            return value;
        }
        const known = this.#columnCache.get(kind);
        if (known > 0) {
            const v = this.#columnInt(data, known) | 0;
            if (v >= min && v <= max) return v;
            return 0;
        }
        if (known === undefined) {
            for (let col = 0; col < columnSpan; col++) {
                const v = this.#columnInt(data, col) | 0;
                if (v >= min && v <= max) {
                    this.#columnCache.set(kind, col);
                    return v;
                }
            }
            this.#columnCache.set(kind, -1);
        }
        return 0;
    }

    #readProjectileBool(data, off, kind) {
        let field = -1;
        try {
            field = data.add(off).readU8() & 1;
        } catch (_) {}
        if (field >= 0) {
            if (this.#columnCache.get(kind) === undefined)
                this.#probeColumn(kind, this.#columnBool, data, field);
            return field;
        }
        const known = this.#columnCache.get(kind);
        if (known > 0) return this.#columnBool(data, known);
        return 0;
    }

    #readProjectileRadius(data) {
        const fns = getFunctions();
        return this.#readProjectileInt(
            data,
            offsets.LogicProjectileData_radius,
            "radius",
            1,
            2000,
            fns.LogicProjectileData_getRadius
        );
    }

    #readProjectileSpeed(data) {
        const fns = getFunctions();
        return this.#readProjectileInt(
            data,
            offsets.LogicProjectileData_speed,
            "speed",
            1,
            20000,
            fns.LogicProjectileData_getSpeed
        );
    }

    #characterSpeed(data) {
        if (!isValidPtr(data)) return 0;
        const key = this.#ptrKey(data);
        if (key) {
            const hit = this.#charSpeedByData.get(key);
            if (hit !== undefined && hit > 0) return hit;
        }
        let speed = 0;
        const fns = getFunctions();
        try {
            if (fns.LogicCharacterData_getSpeed) {
                const v = fns.LogicCharacterData_getSpeed(data) | 0;
                if (v > 0) speed = v;
            }
        } catch (_) {}
        if (!(speed > 0))
            speed = this.#readProjectileField(data, offsets.LogicCharacterData_speed, 1, 6000);
        if (key && speed > 0) this.#charSpeedByData.set(key, speed);
        return speed;
    }

    collisionRadius(data) {
        if (!isValidPtr(data)) return 0;
        try {
            const direct = data.add(offsets.LogicCharacterData_collisionRadius).readS32() | 0;
            if (direct > 0) return direct;
        } catch (_) {}
        try {
            const getRadius = getFunctions().LogicCharacterData_getCollisionRadius;
            if (getRadius) return getRadius(data) | 0;
        } catch (_) {}
        return 0;
    }

    #readProjectileFlags(data) {
        let passes = 0;
        let pierces = 0;
        let piercesChars = 0;
        try {
            passes = data.add(offsets.LogicProjectileData_passesEnvironment).readU8() & 1;
        } catch (_) {}
        try {
            pierces = data.add(offsets.LogicProjectileData_piercesEnvironmentField).readU8() & 1;
        } catch (_) {}
        try {
            piercesChars = data.add(offsets.LogicProjectileData_piercesCharacters).readU8() & 1;
        } catch (_) {}
        return { passes, pierces, piercesChars };
    }

    #readProjectileU8(data, off, kind, min, max) {
        try {
            const v = data.add(off).readU8();
            if (v >= min && v <= max) {
                if (this.#columnCache.get(kind) === undefined)
                    this.#probeColumn(kind, this.#columnInt, data, v);
                return v;
            }
        } catch (_) {}
        const known = this.#columnCache.get(kind);
        if (known > 0) {
            const v = this.#columnInt(data, known) | 0;
            if (v >= min && v <= max) return v;
        }
        return 0;
    }

    #readBounceKeep(data) {
        const percent = this.#readProjectileU8(
            data,
            offsets.LogicProjectileData_bouncePercent,
            "bouncePercent",
            1,
            100
        );
        return percent > 0 ? percent / 100 : 0;
    }

    #flagFrom(fn, data, projectile) {
        if (!fn) return 0;
        try {
            if (fn(data)) return 1;
        } catch (_) {}
        try {
            if (fn(projectile)) return 1;
        } catch (_) {}
        return 0;
    }

    #readClientU32(obj, off, max) {
        try {
            const v = obj.add(off).readU32();
            if (v <= max) return v;
        } catch (_) {}
        return -1;
    }

    #volleyMs(weapon) {
        if (!weapon) return 0;
        if (weapon.bullets < 2 || weapon.msBetween <= 0) return 0;
        const total = weapon.bullets * weapon.msBetween;
        if (total > 0 && total <= 4000) return total;
        return 0;
    }

    #readProjectileMeta(projectile, data, speed, rangeUnits, beam) {
        const fns = getFunctions();
        let preMs = this.#readProjectileField(
            data,
            offsets.LogicProjectileData_preExplosionTimeMs,
            1,
            60000
        );
        let typeId = -1;
        let steer = 0;
        let isBeam = !!beam;
        let homing = this.#readProjectileBool(
            data,
            offsets.LogicProjectileData_isHomingMissileField,
            "homing"
        );
        let bouncing = this.#readProjectileBool(
            data,
            offsets.LogicProjectileData_isBouncingField,
            "bouncing"
        );
        const steerIgnoreTicks = this.#readProjectileInt(
            data,
            offsets.LogicProjectileData_steerIgnoreTicks,
            "steerIgnore",
            1,
            400,
            null
        );
        const steerLifeRaw = this.#readProjectileInt(
            data,
            offsets.LogicProjectileData_steerLifeTime,
            "steerLife",
            1,
            20000,
            null
        );
        const bounceAdd = this.#readProjectileInt(
            data,
            offsets.LogicProjectileData_distanceAddFromBounce,
            "bounceAdd",
            1,
            3000,
            null
        );
        const bounceMax = this.#readProjectileInt(
            data,
            offsets.LogicProjectileData_maxDistanceAddBounces,
            "bounceMax",
            1,
            20000,
            null
        );
        const bounceKeep = this.#readBounceKeep(data);
        const rehit = this.#readProjectileBool(
            data,
            offsets.LogicProjectileData_canHitAgainAfterBounce,
            "rehit"
        );
        if (fns.LogicProjectileData_getPreExplosionTimeMs && !(preMs > 0)) {
            try {
                const v = fns.LogicProjectileData_getPreExplosionTimeMs(data) | 0;
                if (v > 0 && v <= 60000) preMs = v;
            } catch (_) {}
        }
        if (!homing)
            homing = this.#flagFrom(fns.LogicProjectileData_isHomingMissile, data, projectile);
        if (!bouncing)
            bouncing = this.#flagFrom(fns.LogicProjectileData_isBouncing, data, projectile);
        const learned = this.#learnedFor(projectile, data);
        let ticks = 0;
        if (learned && learned.ticks > 0) {
            ticks = learned.ticks;
            if (learned.beam) isBeam = true;
        }
        if (!(ticks > 0)) ticks = this.#callTravelTicks(data, rangeUnits, speed);
        if (!(ticks > 0)) ticks = this.travelTicks(rangeUnits, speed, isBeam);
        if (ticks >= beamTicks) isBeam = true;
        let lifeMs = 0;
        let travel = 0;
        if (isBeam || ticks >= beamTicks) {
            lifeMs = Infinity;
            travel = rangeUnits > 0 ? rangeUnits : 0;
        } else if (ticks > 0) {
            lifeMs = ticks * tickMs;
            travel = this.travelDistance(ticks, speed);
        }
        if (fns.LogicProjectileData_getUniqueProperty) {
            try {
                const t = fns.LogicProjectileData_getUniqueProperty(data) | 0;
                if (t >= 0 && t <= 20) typeId = t;
            } catch (_) {}
        }
        if (typeId < 0) {
            const t = this.#readClientU32(data, offsets.LogicProjectileData_uniqueProperty, 20);
            if (t >= 0) typeId = t;
        }
        try {
            const v = data.add(offsets.LogicProjectileData_steerStrength).readFloat();
            if (v > 0 && v <= 1000) steer = v;
        } catch (_) {}
        const travelType = this.#readClientU32(
            projectile,
            offsets.LogicProjectileClient_travelType,
            16
        );
        let beamCopy = 0;
        try {
            beamCopy = projectile.add(offsets.LogicProjectileClient_isBeamCopy).readU8() & 1;
        } catch (_) {}
        if (beamCopy) isBeam = true;
        const steerIgnoreMs = steerIgnoreTicks > 0 ? steerIgnoreTicks * tickMs : 0;
        const steerLifeMs =
            steerLifeRaw > 0 ? (steerLifeRaw > 400 ? steerLifeRaw : steerLifeRaw * tickMs) : 0;
        return {
            preMs,
            lifeMs,
            ticks,
            travel,
            typeId,
            travelType,
            isBeam,
            beamCopy: !!beamCopy,
            homing: !!homing,
            bouncing: !!bouncing,
            steer,
            steerIgnoreMs,
            steerLifeMs,
            bounceAdd,
            bounceMax,
            bounceKeep,
            rehit: !!rehit
        };
    }

    #weaponForOwner(ownerIndex) {
        if (ownerIndex < 0) return null;
        if (this.#weaponMeta.has(ownerIndex)) return this.#weaponMeta.get(ownerIndex);
        const owner = this.#charsByIndex.get(ownerIndex);
        if (!isValidPtr(owner)) return null;
        const fns = getFunctions();
        const out = { spread: 0, bullets: 0, msBetween: 0 };
        if (fns.LogicCharacterClient_getWeaponSkill && fns.LogicSkillData_getSpread) {
            try {
                const skill = fns.LogicCharacterClient_getWeaponSkill(owner);
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
                projectile.add(offsets.LogicProjectileClient_targetX).readS32() | 0,
                projectile.add(offsets.LogicProjectileClient_targetY).readS32() | 0,
                x,
                y
            );
            if (hit) return hit;
        } catch (_) {}
        if (fns.LogicProjectileClient_getTargetX && fns.LogicProjectileClient_getTargetY) {
            try {
                const hit = this.#validTarget(
                    fns.LogicProjectileClient_getTargetX(projectile) | 0,
                    fns.LogicProjectileClient_getTargetY(projectile) | 0,
                    x,
                    y
                );
                if (hit) return hit;
            } catch (_) {}
        }
        return null;
    }

    #readPtrField(obj, off) {
        try {
            const v = obj.add(off).readPointer();
            return isValidPtr(v) ? v : null;
        } catch (_) {
            return null;
        }
    }

    #dataU8(data, off) {
        try {
            return data.add(off).readU8() & 1;
        } catch (_) {
            return 0;
        }
    }

    #dataS32(data, off, min, max) {
        try {
            const v = data.add(off).readS32() | 0;
            return v >= min && v <= max ? v : 0;
        } catch (_) {
            return 0;
        }
    }

    #clientS32(obj, off, min, max) {
        try {
            const v = obj.add(off).readS32() | 0;
            return v >= min && v <= max ? v : 0;
        } catch (_) {
            return 0;
        }
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
            let radius = this.#readProjectileRadius(data);
            if (!(radius > 0)) radius = defaultProjectileRadius;
            const x = this.#fieldS32(projectile, offsets.LogicGameObjectClient_x);
            const y = this.#fieldS32(projectile, offsets.LogicGameObjectClient_y);
            const spawnReady = x !== 0 || y !== 0;
            const target = this.#readProjectileTarget(projectile, data, x, y);
            const flags = this.#readProjectileFlags(data);
            let isIndirect = this.#dataU8(data, offsets.LogicProjectileData_indirect);
            let travelType = this.#dataS32(data, offsets.LogicProjectileData_travelType, 0, 20);
            if (!travelType) {
                const raw = this.#readClientU32(
                    projectile,
                    offsets.LogicProjectileClient_travelType,
                    20
                );
                travelType = raw > 0 ? raw : 0;
            }
            if (!travelType) {
                const fn = getFunctions().LogicProjectileData_getTravelType;
                if (fn) {
                    try {
                        const v = fn(data) | 0;
                        if (v > 0 && v <= 20) travelType = v;
                    } catch (_) {}
                }
            }
            const dynamicRange = this.#dataU8(data, offsets.LogicProjectileData_allowDynamicRange);
            if (travelType === 6 || dynamicRange) isIndirect = 1;
            let beam = 0;
            try {
                beam = data.add(offsets.LogicProjectileData_isBeamField).readU8() & 1;
            } catch (_) {}
            const ownerIndex = this.#readOwnerIndex(projectile);
            const targetObj = this.#readPtrField(
                projectile,
                offsets.LogicProjectileClient_targetObject
            );
            const entry = {
                gid: key,
                ptr: projectile,
                data,
                ownerIndex,
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
                passesEnv: flags.passes,
                piercesEnv: flags.pierces,
                piercesChars: flags.piercesChars,
                isIndirect: !!isIndirect,
                isBeam: !!beam,
                beamCopy: false,
                ageMs: 0,
                spawnTs: now,
                lastX: x,
                lastY: y,
                lastTs: now,
                lastMoveTs: now,
                vx: 0,
                vy: 0,
                hasVelocitySample: false,
                meta: null,
                travelType,
                dynamicRange,
                ignoreChars: this.#dataU8(
                    data,
                    offsets.LogicProjectileData_ignoreCharacterCollisions
                ),
                ignoreEnv: this.#dataU8(
                    data,
                    offsets.LogicProjectileData_ignoreEnvironmentCollisions
                ),
                grapples: this.#dataU8(data, offsets.LogicProjectileData_grapplesEnemy),
                boomerang: this.#dataS32(data, offsets.LogicProjectileData_boomerang, 1, 8),
                chains: this.#dataU8(data, offsets.LogicProjectileData_chainsToEnemies),
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
                constantFly: this.#dataU8(data, offsets.LogicProjectileData_constantFlyTime),
                earlyTicks: this.#dataS32(data, offsets.LogicProjectileData_numEarlyTicks, 1, 400),
                homeDistance: this.#dataS32(
                    data,
                    offsets.LogicProjectileData_homingDistance,
                    1,
                    30000
                ),
                gravity: this.#dataS32(data, offsets.LogicProjectileData_gravity, 1, 20000),
                shotByHero: this.#dataU8(data, offsets.LogicProjectileData_isShotByHero),
                visualized: this.#dataU8(data, offsets.LogicProjectileData_visualizeEndPoint),
                attachArea: this.#dataU8(
                    data,
                    offsets.LogicProjectileData_attachAreaEffectToTarget
                ),
                trail: this.#dataU8(data, offsets.LogicProjectileData_spawnAreaEffectTrail),
                trailMin: this.#dataS32(
                    data,
                    offsets.LogicProjectileData_areaEffectTrailMinDistance,
                    1,
                    20000
                ),
                lifeTicks: this.#clientS32(
                    projectile,
                    offsets.LogicProjectileClient_lifeTicks,
                    1,
                    100000
                ),
                clientRadius: 0,
                seekX: 0,
                seekY: 0
            };
            this.#liveProjectiles.set(key, entry);
        } catch (_) {}
    }

    #removeProjectile(projectile) {
        if (!isValidPtr(projectile)) return;
        const key = this.#ptrKey(projectile);
        if (!key) return;
        const entry = this.#liveProjectiles.get(key);
        if (!entry || !entry.ptr.equals(projectile)) return;
        const flown = this.#traveled(entry, entry.lastX, entry.lastY);
        if (flown > 0) {
            this.#learnFlightRange(entry.data, flown);
            this.#learnRangeBonus(entry.ownerIndex, flown + entry.radius);
        }
        this.#liveProjectiles.delete(key);
    }

    #installTravelTicksHook(base) {
        try {
            const self = this;
            Interceptor.attach(base.add(offsets.LogicProjectileClient_getTravelTicks), {
                onEnter(args) {
                    this.key = args[0].toString();
                    this.a1 = args[1].toUInt32();
                    this.a2 = args[2].toUInt32();
                },
                onLeave(retval) {
                    if (self.#insideTravelCall) return;
                    self.#learnTravel(this.key, this.a1, this.a2, retval.toInt32());
                }
            });
        } catch (_) {}
    }

    #installProjectilePathHook(base) {
        try {
            const self = this;
            Interceptor.attach(base.add(offsets.CalculateProjectilePath), {
                onEnter: () => {
                    self.state.pathRanAt = Date.now();
                }
            });
        } catch (_) {}
    }

    onDataReload(callback) {
        if (typeof callback === "function") this.#reloadCallbacks.push(callback);
    }

    #notifyDataReload() {
        this.#charRange.clear();
        this.#weaponMeta.clear();
        this.#learnedTravel.clear();
        this.#flightRange.clear();
        this.#rangeBonus.clear();
        this.#columnCache.clear();
        this.#colCands.clear();
        this.#charSpeedByData.clear();
        for (const [, projectile] of this.#liveProjectiles) {
            projectile.castRange = 0;
            projectile.travelDistance = 0;
            projectile.ticks = 0;
        }
        for (const callback of this.#reloadCallbacks) {
            try {
                callback();
            } catch (_) {}
        }
    }

    #installDataReloadHooks(base) {
        if (this.#dataHooksInstalled) return;
        this.#dataHooksInstalled = true;
        const self = this;
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
                    onLeave: () => self.#notifyDataReload()
                });
            } catch (_) {}
        }
        try {
            Interceptor.attach(base.add(offsets.LogicCharacterClient_decode), {
                onEnter(args) {
                    this.character = args[0];
                },
                onLeave() {
                    const index = self.#readOwnerIndex(this.character);
                    if (index < 0) return;
                    self.#charRange.delete(index);
                    self.#rangeBonus.delete(index);
                    self.#rememberCharacter(index, this.character);
                }
            });
        } catch (_) {}
    }

    #installProjectileHooks(base) {
        if (this.#projectileHooksInstalled) return;
        this.#projectileHooksInstalled = true;
        const self = this;
        try {
            Interceptor.attach(base.add(offsets.LogicProjectileClient_ctor), {
                onEnter(args) {
                    this.projectile = args[0];
                },
                onLeave() {
                    try {
                        self.#captureProjectile(this.projectile, null, Date.now());
                    } catch (_) {}
                }
            });
        } catch (_) {}
        try {
            Interceptor.attach(base.add(offsets.LogicProjectileClient_destruct), {
                onEnter(args) {
                    self.#removeProjectile(args[0]);
                }
            });
        } catch (_) {}
        try {
            Interceptor.attach(base.add(offsets.LogicProjectileClient_decode), {
                onEnter(args) {
                    this.projectile = args[0];
                },
                onLeave() {
                    self.#captureProjectile(this.projectile, null, Date.now());
                }
            });
        } catch (_) {}
        this.#installTravelTicksHook(base);
        this.#installProjectilePathHook(base);
        this.#installDataReloadHooks(base);
    }

    learnedFlightRange(data) {
        if (!isValidPtr(data)) return 0;
        const v = this.#flightRange.get(data.toString()) || 0;
        return v > 0 ? v : 0;
    }

    #learnFlightRange(data, flown) {
        if (!isValidPtr(data) || !(flown > 0)) return;
        const key = data.toString();
        const prev = this.#flightRange.get(key) || 0;
        if (flown > prev) this.#flightRange.set(key, flown);
    }

    #flightSeg(entry, flown) {
        const learned = this.learnedFlightRange(entry.data);
        let cap = learned > 0 ? learned + entry.radius : 0;
        if (entry.lifeTicks > 0 && entry.speed > 0) {
            const lifeCap = (entry.lifeTicks * entry.speed) / ticksPerSec;
            if (lifeCap > cap) cap = lifeCap;
        }
        if (!(cap > 0) && entry.seg0 > 0) cap = entry.seg0;
        if (!(cap > 0)) return 0;
        const remain = cap - flown;
        return remain > 0 ? remain : 0;
    }

    #applyMeta(entry, meta) {
        entry.meta = meta;
        if (!meta) return;
        entry.isBeam = !!meta.isBeam;
        entry.beamCopy = !!meta.beamCopy;
        entry.isIndirect = entry.isIndirect || meta.travelType > 0;
        entry.preMs = meta.preMs;
        entry.lifeMs = meta.lifeMs;
        entry.ticks = meta.ticks;
        if (meta.travel > 0) entry.travelDistance = meta.travel;
        entry.homing = meta.homing;
        entry.bouncing = meta.bouncing;
        entry.steer = meta.steer;
        entry.steerIgnoreMs = meta.steerIgnoreMs;
        entry.steerLifeMs = meta.steerLifeMs;
        entry.bounceAdd = meta.bounceAdd;
        entry.bounceMax = meta.bounceMax;
        entry.bounceKeep = meta.bounceKeep;
        entry.rehit = meta.rehit;
        entry.typeId = meta.typeId;
    }

    #updateLiveProjectiles(now) {
        const output = this.#outArr;
        output.length = 0;
        let metaBudget = this.#probeBudget > 0 ? 4 : 0;
        const self = this;
        this.#liveProjectiles.forEach((entry, gid) => {
            try {
                if (now - (entry.spawnTs || now) > staleMs) {
                    self.#liveProjectiles.delete(gid);
                    return;
                }
                const x = self.#fieldS32(entry.ptr, offsets.LogicGameObjectClient_x);
                const y = self.#fieldS32(entry.ptr, offsets.LogicGameObjectClient_y);
                const dx = x - entry.lastX;
                const dy = y - entry.lastY;
                if (dx !== 0 || dy !== 0) {
                    const dt = (now - entry.lastMoveTs) / 1000;
                    if (!entry.spawnPending && dt > 0.008 && dt < 0.3 && dx * dx + dy * dy >= 16) {
                        const observedVx = dx / dt;
                        const observedVy = dy / dt;
                        if (length(observedVx, observedVy) <= 8500) {
                            const alpha = entry.hasVelocitySample ? 0.4 : 1;
                            entry.vx = entry.vx * (1 - alpha) + observedVx * alpha;
                            entry.vy = entry.vy * (1 - alpha) + observedVy * alpha;
                            entry.hasVelocitySample = true;
                            const measured = length(entry.vx, entry.vy);
                            if (measured >= 300 && measured <= 8500) {
                                entry.speed = measured;
                                if (entry.ownerIndex === self.state.myPlayerIndex) {
                                    const dataPtr = entry.data;
                                    if (isValidPtr(dataPtr)) {
                                        const key = dataPtr.toString();
                                        const acc = self.#speedByData.get(key) || {
                                            sum: 0,
                                            count: 0
                                        };
                                        acc.sum += measured;
                                        acc.count++;
                                        self.#speedByData.set(key, acc);
                                        self.state.measuredSpeed = Math.round(acc.sum / acc.count);
                                    }
                                }
                            }
                        }
                    }
                    entry.lastMoveTs = now;
                }
                entry.lastX = x;
                entry.lastY = y;
                entry.lastTs = now;
                entry.x = x;
                entry.y = y;
                entry.ownerIndex = self.#readOwnerIndex(entry.ptr);
                if (entry.spawnPending && (x !== 0 || y !== 0)) {
                    entry.spawnX = x;
                    entry.spawnY = y;
                    entry.spawnPending = false;
                }
                entry.ageMs = Math.max(0, now - (entry.spawnTs || now));
                const target = self.#readProjectileTarget(entry.ptr, entry.data, x, y);
                if (target) {
                    entry.targetX = target.x;
                    entry.targetY = target.y;
                    entry.hasTarget = true;
                    if (!(entry.seg0 > 0) && !entry.spawnPending)
                        entry.seg0 = length(target.x - entry.spawnX, target.y - entry.spawnY);
                }
                if (!entry.meta && metaBudget > 0) {
                    metaBudget--;
                    self.#applyMeta(
                        entry,
                        self.#readProjectileMeta(
                            entry.ptr,
                            entry.data,
                            entry.speed,
                            0,
                            entry.isBeam
                        )
                    );
                }
                const flown = self.#traveled(entry, x, y);
                entry.flown = flown;
                const moving = entry.hasVelocitySample && now - entry.lastMoveTs < 200;
                if (moving) {
                    const capLearned = self.learnedFlightRange(entry.data);
                    if (capLearned > 0 && flown > capLearned + entry.radius + 50)
                        self.#learnFlightRange(entry.data, flown + entry.speed * 0.7);
                }
                entry.seg = self.#flightSeg(entry, flown);
                entry.segUncertain = !!(
                    moving &&
                    !(entry.seg > 0) &&
                    length(entry.vx, entry.vy) > 100
                );
                let ownerObj =
                    entry.ownerIndex >= 0 ? self.#charsByIndex.get(entry.ownerIndex) || null : null;
                if (!ownerObj && entry.ownerIndex >= 0 && isValidPtr(self.#objMgrPtr)) {
                    const fns2 = getFunctions();
                    if (fns2.LogicGameObjectManagerClient_findGameObject) {
                        try {
                            const resolved = fns2.LogicGameObjectManagerClient_findGameObject(
                                self.#objMgrPtr,
                                entry.ownerIndex,
                                -1
                            );
                            let bad = true;
                            if (isValidPtr(resolved) && !resolved.equals(entry.ptr)) {
                                bad = false;
                                try {
                                    bad = resolved
                                        .readPointer()
                                        .equals(
                                            self.#moduleBase.add(
                                                offsets.LogicProjectileClient_vtable
                                            )
                                        );
                                } catch (_) {}
                            }
                            if (!bad) {
                                ownerObj = resolved;
                                self.#rememberCharacter(entry.ownerIndex, resolved);
                            }
                        } catch (_) {}
                    }
                }
                if (ownerObj && self.state.ownCharacter && ownerObj.equals(self.state.ownCharacter))
                    return;
                if (ownerObj && !self.#isEnemyOf(ownerObj, self.state.battleModeClient, true))
                    return;
                if (entry.ownerIndex >= 0 && self.#friendlyIdx.has(entry.ownerIndex)) return;
                if (entry.ownerIndex === self.state.myPlayerIndex) return;
                if (!(entry.seg > 0) && !entry.hasTarget && !entry.hasVelocitySample) return;
                let o = entry.out;
                if (!o) {
                    o = {};
                    entry.out = o;
                    o.gid = gid;
                    o.radius = entry.radius;
                    o.passesEnv = !!entry.passesEnv;
                    o.piercesEnv = !!entry.piercesEnv;
                    o.piercesChars = !!entry.piercesChars;
                    o.isIndirect = !!entry.isIndirect;
                    o.isBeam = !!entry.isBeam;
                    o.beamCopy = !!entry.beamCopy;
                    o.travelType = entry.travelType || 0;
                    o.dynamicRange = entry.dynamicRange || 0;
                    o.ignoreChars = entry.ignoreChars || 0;
                    o.ignoreEnv = entry.ignoreEnv || 0;
                    o.grapples = entry.grapples || 0;
                    o.boomerang = entry.boomerang || 0;
                    o.chains = entry.chains || 0;
                    o.stunMs = entry.stunMs || 0;
                    o.silenceMs = entry.silenceMs || 0;
                    o.triggerMs = entry.triggerMs || 0;
                    o.constantFly = entry.constantFly || 0;
                    o.earlyTicks = entry.earlyTicks || 0;
                    o.homeDistance = entry.homeDistance || 0;
                    o.gravity = entry.gravity || 0;
                    o.shotByHero = entry.shotByHero || 0;
                    o.levelBorder = entry.levelBorder || 0;
                    o.visualized = entry.visualized || 0;
                    o.attachArea = entry.attachArea || 0;
                    o.trail = entry.trail || 0;
                    o.trailMin = entry.trailMin || 0;
                    o.lifeTicks = entry.lifeTicks || 0;
                    o.clientRadius = entry.clientRadius || 0;
                    const w = self.#weaponForOwner(entry.ownerIndex);
                    o.volleyMs = self.#volleyMs(w);
                    o.volleyBullets = (w && w.bullets) || 0;
                    o.volleySpread = (w && w.spread) || 0;
                }
                o.x = x;
                o.y = y;
                o.spawnX = entry.spawnX;
                o.spawnY = entry.spawnY;
                o.seg0 = entry.seg0;
                o.vx = entry.vx;
                o.vy = entry.vy;
                o.speed = entry.speed;
                o.seg = entry.seg;
                o.segUncertain = !!entry.segUncertain;
                o.flown = flown;
                o.hasTarget = !!entry.hasTarget;
                o.targetX = entry.targetX;
                o.targetY = entry.targetY;
                o.ageMs = entry.ageMs;
                o.preMs = entry.preMs || 0;
                o.lifeMs = entry.lifeMs || 0;
                o.ticks = entry.ticks || 0;
                o.travelDistance = entry.travelDistance || 0;
                o.typeId = entry.typeId;
                o.homing = !!entry.homing;
                o.seekX = entry.seekX || 0;
                o.seekY = entry.seekY || 0;
                o.bouncing = !!entry.bouncing;
                o.steer = entry.steer || 0;
                o.steerIgnoreMs = entry.steerIgnoreMs || 0;
                o.steerLifeMs = entry.steerLifeMs || 0;
                o.bounceAdd = entry.bounceAdd || 0;
                o.bounceMax = entry.bounceMax || 0;
                o.bounceKeep = entry.bounceKeep || 0;
                o.rehit = !!entry.rehit;
                o.ownerIndex = entry.ownerIndex;
                output.push(o);
            } catch (_) {
                self.#liveProjectiles.delete(gid);
            }
        });
        return output;
    }

    #traveled(entry, x, y) {
        return length(x - entry.spawnX, y - entry.spawnY);
    }

    update(bm, now) {
        if (!this.#moduleBase) return;
        if (now === undefined) now = Date.now();
        const functions = getFunctions();
        try {
            const own = functions.LogicBattleModeClient_getOwnCharacter(bm);
            if (!isValidPtr(own)) {
                this.state.ownCharacter = null;
                this.state.battleModeClient = null;
                this.state.lastUpdate = 0;
                return;
            }
            this.state.ownCharacter = own;
            this.state.battleModeClient = bm;
            let myTeamFromMgr = -1;
            try {
                const mgrForTeam = bm.add(offsets.BattleMode_objectManager).readPointer();
                if (isValidPtr(mgrForTeam)) {
                    this.#objMgrPtr = mgrForTeam;
                    myTeamFromMgr = this.#ownTeamOf(mgrForTeam);
                }
            } catch (_) {}
            this.state.myTeamId = myTeamFromMgr >= 0 ? myTeamFromMgr : this.#teamOf(own, bm);
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
            if (isValidPtr(ownData)) {
                this.state.myRadius = this.collisionRadius(ownData) | 0;
                const ownSpeed = this.#characterSpeed(ownData);
                if (ownSpeed >= 300 && ownSpeed <= 3000) this.state.mySpeed = ownSpeed;
            }
            this.#probeBudget = 8;
            const enemies = [];
            const vtableProj = this.#moduleBase.add(offsets.LogicProjectileData_vtable);
            const vtableProjClient = this.#moduleBase.add(offsets.LogicProjectileClient_vtable);
            const objMgr = bm.add(offsets.BattleMode_objectManager).readPointer();
            if (isValidPtr(objMgr)) {
                const objects = objMgr
                    .add(offsets.LogicGameObjectManagerClient_objects)
                    .readPointer();
                const count = objMgr.add(offsets.LogicGameObjectManagerClient_count).readU32();
                this.#objectsArr = isValidPtr(objects) ? objects : null;
                this.#objCount = isValidPtr(objects) && count > 0 && count <= 1200 ? count : 0;
                if (isValidPtr(objects) && count > 0 && count <= 1200) {
                    const stride = offsets.LogicGameObjectManagerClient_ptrStride;
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
                            const data = this.dataFieldOf(obj);
                            if (!isValidPtr(data)) continue;
                            let objVt = null;
                            try {
                                objVt = obj.readPointer();
                            } catch (_) {}
                            if (
                                (objVt && objVt.equals(vtableProjClient)) ||
                                data.readPointer().equals(vtableProj)
                            ) {
                                this.#captureProjectile(obj, data, now);
                                continue;
                            }
                            if (obj.equals(own)) continue;
                            if (!this.#isEnemyOf(obj, bm, false)) {
                                const idx = this.#readOwnerIndex(obj);
                                if (idx >= 0) {
                                    this.#friendlyIdx.add(idx);
                                    if (idx !== this.state.myPlayerIndex)
                                        this.#rememberCharacter(idx, obj);
                                }
                                continue;
                            }
                            if (obj.add(offsets.LogicCharacterClient_hitpoints).readU32() === 0)
                                continue;
                            const dataKey = this.#ptrKey(data);
                            let brawlerName;
                            if (dataKey) {
                                const cached = this.#brawlerNameCache.get(dataKey);
                                if (cached !== undefined) brawlerName = cached;
                                else {
                                    brawlerName = this.#readDataName(data);
                                    this.#brawlerNameCache.set(dataKey, brawlerName);
                                }
                            } else brawlerName = this.#readDataName(data);
                            const radius = this.collisionRadius(data) | 0;
                            if (!brawlerName && radius <= 0) continue;
                            const kind = brawlerName ? "player" : "spawnable";
                            const moveSpeed = this.#characterSpeed(data);
                            const playerIndex = this.#readOwnerIndex(obj);
                            if (brawlerName) this.#rememberCharacter(playerIndex, obj);
                            enemies.push({
                                gid: this.#ptrKey(obj),
                                ptr: obj,
                                x: this.#fieldS32(obj, offsets.LogicGameObjectClient_x),
                                y: this.#fieldS32(obj, offsets.LogicGameObjectClient_y),
                                brawlerName,
                                body: obj,
                                teamId: this.#teamOf(obj, bm),
                                moveSpeed,
                                moveAngle: this.#moveAngleOf(obj),
                                radius,
                                kind
                            });
                        } catch (_) {}
                    }
                }
            }
            this.#scanCount++;
            if ((this.#scanCount & 63) === 0) {
                this.#brawlerNameCache.clear();
                if (this.#charSpeedByData.size > 256) this.#charSpeedByData.clear();
            }
            this.state.enemies = enemies;
            this.state.projectiles = this.#updateLiveProjectiles(now);
            this.state.lastUpdate = now;
        } catch (_) {}
    }

    resetCache() {
        this.#dataCache.clear();
        this.#angleCache.clear();
        this.#brawlerNameCache.clear();
        this.#charRange.clear();
        this.#weaponMeta.clear();
        this.#liveProjectiles.clear();
        this.#friendlyIdx.clear();
        this.#objectsArr = null;
        this.#objCount = 0;
        this.#objMgrPtr = null;
        this.#charsByIndex.clear();
        this.#speedByData.clear();
        this.#charSpeedByData.clear();
        this.#learnedTravel.clear();
        this.#flightRange.clear();
        this.#rangeBonus.clear();
        this.#columnCache.clear();
        this.#colCands.clear();
        this.#rangeScale = 0;
        this.#outArr.length = 0;
        this.#ringKeys.fill(0);
        this.#ringVals.fill(null);
        this.#ringHead = 0;
        this.state.pathRanAt = 0;
        this.state.projectiles = [];
        this.state.measuredSpeed = 0;
        this.state.myRadius = 0;
    }

    init(base) {
        this.#moduleBase = base;
        this.#installCoreHooks(base);
    }

    enableProjectileTracking() {
        if (this.#moduleBase) this.#installProjectileHooks(this.#moduleBase);
    }
}

const scanner = new Scanner();
const scanData = scanner.state;

export { scanData };
export const dataFieldOf = (obj) => scanner.dataFieldOf(obj);
export const dataOf = (obj) => scanner.dataOf(obj);
export const moveAppliedSince = (x, y, ms) => scanner.moveAppliedSince(x, y, ms);
export const inputSentSince = (x, y, ms) => scanner.inputSentSince(x, y, ms);
export const isEnemyObject = (obj) => scanner.isEnemyObject(obj);
export const travelTicks = (rangeUnits, speed, beam) =>
    scanner.travelTicks(rangeUnits, speed, beam);
export const travelDistance = (ticks, speed) => scanner.travelDistance(ticks, speed);
export const travelFor = (data) => scanner.travelFor(data);
export const rangeScaleCalibrated = () => scanner.rangeScaleCalibrated();
export const weaponRangeUnits = (character) => scanner.weaponRangeUnits(character);
export const collisionRadius = (data) => scanner.collisionRadius(data);
export const learnedFlightRange = (data) => scanner.learnedFlightRange(data);
export const onDataReload = (callback) => scanner.onDataReload(callback);
export const updateScanner = (bm, now) => scanner.update(bm, now);
export const resetScannerCache = () => scanner.resetCache();
export const initScanner = (base) => scanner.init(base);
export const enableProjectileTracking = () => scanner.enableProjectileTracking();
