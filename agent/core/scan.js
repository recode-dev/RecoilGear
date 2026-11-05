import { tileSizeUnits } from "../utils/walls.js";

import { getFunctions, isValidPtr, ptrFromU32 } from "./functions.js";
import { offsets } from "./offsets.js";
import { readScString } from "./scstring.js";

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
    #ringKeys = Array.from({ length: ringCap }).fill(0);
    #ringVals = Array.from({ length: ringCap }).fill(null);
    #ringHead = 0;
    #metaBudget = 0;
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

    #learnMoveAngle(obj) {
        try {
            if (!isValidPtr(obj)) return;
            const key = this.#ringLookup(obj);
            if (key !== null) return;
            const deg = Math.trunc(obj.add(offsets.LogicCharacterClient_moveAngle).readS32());
            if (deg < -720 || deg > 720) return;
            const slotKey = this.#ptrKey(obj);
            if (!slotKey) return;
            const raw = obj.toInt32();
            const slot = this.#ringHead;
            this.#ringHead = (this.#ringHead + 1) % ringCap;
            this.#ringKeys[slot] = raw;
            this.#ringVals[slot] = slotKey;
            if (this.#angleCache.size > cacheMax) this.#angleCache.clear();
            this.#angleCache.set(slotKey, {
                angle: (deg * Math.PI) / 180,
                ts: Date.now()
            });
        } catch {}
    }

    #learnInput(ci) {
        this.#inputX = Math.trunc(ci.add(offsets.ClientInput_x).readS32());
        this.#inputY = Math.trunc(ci.add(offsets.ClientInput_y).readS32());
        this.#inputAt = Date.now();
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
        const ringMemo = (obj, val) => this.#ringMemo(obj, val);
        const ringLookup = (obj) => this.#ringLookup(obj);
        const learnAngle = (obj) => this.#learnMoveAngle(obj);
        const learnInput = (ci) => this.#learnInput(ci);
        try {
            Interceptor.attach(base.add(offsets.LogicGameObjectClient_getData), {
                onEnter(args) {
                    this.obj = args[0];
                },
                onLeave(retval) {
                    try {
                        if (retval.isNull()) return;
                        if (ringLookup(this.obj) !== null) return;
                        ringMemo(this.obj, retval);
                    } catch {}
                }
            });
        } catch {}
        try {
            Interceptor.attach(base.add(offsets.LogicCharacterClient_getMoveAngle), {
                onEnter(args) {
                    this.obj = args[0];
                },
                onLeave() {
                    learnAngle(this.obj);
                }
            });
        } catch {}
        try {
            Interceptor.attach(base.add(offsets.LogicBattleModeClient_setClientPredictionMoveTo), {
                onEnter: (args) => {
                    this.#moveAppliedAt = Date.now();
                    this.#moveAppliedX = args[1].toInt32();
                    this.#moveAppliedY = args[2].toInt32();
                }
            });
        } catch {}
        try {
            Interceptor.attach(base.add(offsets.ClientInputManager_addInput), {
                onEnter: (args) => {
                    try {
                        const ci = args[1];
                        if (!isValidPtr(ci)) return;
                        learnInput(ci);
                    } catch {}
                }
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
        const fns = getFunctions();
        if (fns.LogicCharacterClient_getMoveAngle) {
            try {
                const deg = Math.trunc(fns.LogicCharacterClient_getMoveAngle(obj));
                if (this.#validAngleDeg(deg)) return (deg * Math.PI) / 180;
            } catch {}
        }
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

    #learnBeamTravel(key) {
        if (this.#learnedTravel.has(key)) return;
        this.#learnedTravel.set(key, { ticks: beamTicks, range: 0, speed: 0, beam: true });
    }

    #learnPairTravel(key, a1, a2, ticks) {
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

    #learnTravel(key, a1, a2, ticks) {
        if (!key || !(ticks >= 0)) return;
        if (ticks >= beamTicks) return this.#learnBeamTravel(key);
        if (ticks <= 0) return;
        this.#learnPairTravel(key, a1, a2, ticks);
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
            const ticks = Math.trunc(fn(data, rangeUnits, speed));
            if (ticks <= 0 || ticks > beamTicks) return 0;
            if (ticks >= beamTicks) return ticks;
            if (Math.abs(this.travelTicks(rangeUnits, speed, false) - ticks) > 1) return 0;
            return ticks;
        } catch {
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
        } catch {}
        return null;
    }

    #calibrateRangeScale(tiles, rangeUnits) {
        if (!(tiles >= 1 && tiles <= 64) || !(rangeUnits >= 100 && rangeUnits <= 30000))
            return false;
        const per = rangeUnits / tiles;
        const tile = tileSizeUnits();
        const candidates = [tile, Math.floor(tile / 3), tileUnits];
        let best = 0;
        for (const c of candidates) {
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
            const tiles = Math.trunc(fns.LogicSkillData_getCastingRange(skill));
            if (tiles >= 1 && tiles <= 64) return tiles;
        } catch {}
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
            const v = Math.trunc(data.add(off).readS32());
            if (v < min || v > max) return 0;
            return v;
        } catch {
            return 0;
        }
    }

    #dataRow(data) {
        try {
            const row = data.add(offsets.LogicProjectileData_reader).readPointer();
            return isValidPtr(row) ? row : null;
        } catch {
            return null;
        }
    }

    #columnInt(data, col) {
        const fns = getFunctions();
        if (fns.LogicProjectileData_getIntValueFromColumn) {
            try {
                return Math.trunc(fns.LogicProjectileData_getIntValueFromColumn(data, col));
            } catch {}
        }
        const row = this.#dataRow(data);
        if (!row) return 0;
        if (fns.LogicData_getIntegerValueAt) {
            try {
                return Math.trunc(fns.LogicData_getIntegerValueAt(row, col));
            } catch {}
        }
        return 0;
    }

    #boolViaFn(fn, data, col) {
        if (!fn) return null;
        try {
            return fn(data, col) ? 1 : 0;
        } catch {
            return null;
        }
    }

    #columnBool(data, col) {
        const fns = getFunctions();
        let v = this.#boolViaFn(fns.LogicProjectileData_getBoolValueFromColumn, data, col);
        if (v === null)
            v = this.#boolViaFn(fns.LogicProjectileData_getBoolValueFromColumn2, data, col);
        if (v === null) {
            const row = this.#dataRow(data);
            if (row) v = this.#boolViaFn(fns.LogicData_getBooleanValueAt, row, col);
        }
        return v === null ? 0 : v;
    }

    #probeStep(read, data, st, value) {
        let budget = 2;
        while (budget > 0 && this.#probeBudget > 0 && st.next < columnSpan) {
            this.#probeBudget--;
            budget--;
            if (read.call(this, data, st.next) === value) {
                if (!st.cols) st.cols = new Set();
                st.cols.add(st.next);
            }
            st.next++;
        }
    }

    #probeColumn(kind, read, data, value) {
        if (this.#probeBudget <= 0) return;
        const st = this.#colCands.get(kind);
        if (!st) return this.#probeStart(kind, read, data, value);
        if (!st.cols || st.next >= columnSpan) return;
        this.#probeStep(read, data, st, value);
        if (st.next >= columnSpan) {
            if (st.cols.size === 1) this.#columnCache.set(kind, st.cols.values().next().value);
            else if (st.cols.size === 0) this.#columnCache.set(kind, -1);
            else if (st.rounds < 10) {
                st.rounds++;
                st.next = 0;
            } else this.#columnCache.set(kind, -1);
        }
    }

    #probeStart(kind, read, data, value) {
        const st = { cols: null, next: 0, rounds: 1 };
        this.#probeStep(read, data, st, value);
        if (st.next >= columnSpan && !st.cols) {
            this.#columnCache.set(kind, -1);
            this.#colCands.set(kind, { cols: null, next: columnSpan, rounds: 99 });
            return;
        }
        this.#colCands.set(kind, st);
        if (st.cols && st.cols.size === 1 && st.next >= columnSpan)
            this.#columnCache.set(kind, st.cols.values().next().value);
    }

    #scanColumnsFor(data, spec) {
        for (let col = 0; col < columnSpan; col++) {
            const v = Math.trunc(this.#columnInt(data, col));
            if (v >= spec.min && v <= spec.max) {
                this.#columnCache.set(spec.kind, col);
                return v;
            }
        }
        this.#columnCache.set(spec.kind, -1);
        return 0;
    }

    #readProjectileInt(data, spec) {
        let value = 0;
        if (spec.getter) {
            try {
                const v = Math.trunc(spec.getter(data));
                if (v >= spec.min && v <= spec.max) value = v;
            } catch {}
        }
        if (!(value > 0)) value = this.#readProjectileField(data, spec.off, spec.min, spec.max);
        if (value > 0) {
            if (this.#columnCache.get(spec.kind) === undefined)
                this.#probeColumn(spec.kind, this.#columnInt, data, value);
            return value;
        }
        const known = this.#columnCache.get(spec.kind);
        if (known > 0) {
            const v = Math.trunc(this.#columnInt(data, known));
            return v >= spec.min && v <= spec.max ? v : 0;
        }
        if (known === undefined) return this.#scanColumnsFor(data, spec);
        return 0;
    }

    #readProjectileBool(data, off, kind) {
        let field = -1;
        try {
            field = data.add(off).readU8() & 1;
        } catch {}
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
        return this.#readProjectileInt(data, {
            kind: "radius",
            off: offsets.LogicProjectileData_radius,
            min: 1,
            max: 2000,
            getter: getFunctions().LogicProjectileData_getRadius
        });
    }

    #readProjectileSpeed(data) {
        return this.#readProjectileInt(data, {
            kind: "speed",
            off: offsets.LogicProjectileData_speed,
            min: 1,
            max: 20000,
            getter: getFunctions().LogicProjectileData_getSpeed
        });
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
                const v = Math.trunc(fns.LogicCharacterData_getSpeed(data));
                if (v > 0) speed = v;
            }
        } catch {}
        if (!(speed > 0))
            speed = this.#readProjectileField(data, offsets.LogicCharacterData_speed, 1, 6000);
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

    #readProjectileFlags(data) {
        let passes = 0;
        let pierces = 0;
        let piercesChars = 0;
        try {
            passes = data.add(offsets.LogicProjectileData_passesEnvironment).readU8() & 1;
        } catch {}
        try {
            pierces = data.add(offsets.LogicProjectileData_piercesEnvironmentField).readU8() & 1;
        } catch {}
        try {
            piercesChars = data.add(offsets.LogicProjectileData_piercesCharacters).readU8() & 1;
        } catch {}
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
        } catch {}
        const known = this.#columnCache.get(kind);
        if (known > 0) {
            const v = Math.trunc(this.#columnInt(data, known));
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
        } catch {}
        try {
            if (fn(projectile)) return 1;
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

    #volleyMs(weapon) {
        if (!weapon) return 0;
        if (weapon.bullets < 2 || weapon.msBetween <= 0) return 0;
        const total = weapon.bullets * weapon.msBetween;
        if (total > 0 && total <= 4000) return total;
        return 0;
    }

    #steerSpecs(data) {
        return {
            ignore: this.#readProjectileInt(data, {
                kind: "steerIgnore",
                off: offsets.LogicProjectileData_steerIgnoreTicks,
                min: 1,
                max: 400,
                getter: null
            }),
            life: this.#readProjectileInt(data, {
                kind: "steerLife",
                off: offsets.LogicProjectileData_steerLifeTime,
                min: 1,
                max: 20000,
                getter: null
            })
        };
    }

    #bounceSpecs(data) {
        return {
            add: this.#readProjectileInt(data, {
                kind: "bounceAdd",
                off: offsets.LogicProjectileData_distanceAddFromBounce,
                min: 1,
                max: 3000,
                getter: null
            }),
            max: this.#readProjectileInt(data, {
                kind: "bounceMax",
                off: offsets.LogicProjectileData_maxDistanceAddBounces,
                min: 1,
                max: 20000,
                getter: null
            }),
            keep: this.#readBounceKeep(data),
            rehit: this.#readProjectileBool(
                data,
                offsets.LogicProjectileData_canHitAgainAfterBounce,
                "rehit"
            )
        };
    }

    #resolveTicks(projectile, data, rangeUnits, speed, beam) {
        let isBeam = !!beam;
        const learned = this.#learnedFor(projectile, data);
        let ticks = 0;
        if (learned && learned.ticks > 0) {
            ticks = learned.ticks;
            if (learned.beam) isBeam = true;
        }
        if (!(ticks > 0)) ticks = this.#callTravelTicks(data, rangeUnits, speed);
        if (!(ticks > 0)) ticks = this.travelTicks(rangeUnits, speed, isBeam);
        if (ticks >= beamTicks) isBeam = true;
        return { ticks, isBeam };
    }

    #lifeSpecs(ticks, isBeam, rangeUnits, speed) {
        if (isBeam || ticks >= beamTicks)
            return { lifeMs: Infinity, travel: Math.max(rangeUnits, 0) };
        if (ticks > 0) return { lifeMs: ticks * tickMs, travel: this.travelDistance(ticks, speed) };
        return { lifeMs: 0, travel: 0 };
    }

    #typeIdOf(data) {
        const fns = getFunctions();
        if (fns.LogicProjectileData_getUniqueProperty) {
            try {
                const t = Math.trunc(fns.LogicProjectileData_getUniqueProperty(data));
                if (t >= 0 && t <= 20) return t;
            } catch {}
        }
        return this.#readClientU32(data, offsets.LogicProjectileData_uniqueProperty, 20);
    }

    #preExplosionMs(data, preMs) {
        const fn = getFunctions().LogicProjectileData_getPreExplosionTimeMs;
        if (!fn || preMs > 0) return preMs;
        try {
            const v = Math.trunc(fn(data));
            if (v > 0 && v <= 60000) return v;
        } catch {}
        return preMs;
    }

    #flagFallback(fn, data, projectile, field) {
        if (field) return field;
        return this.#flagFrom(fn, data, projectile);
    }

    #steerStrengthOf(data) {
        try {
            const v = data.add(offsets.LogicProjectileData_steerStrength).readFloat();
            if (v > 0 && v <= 1000) return v;
        } catch {}
        return 0;
    }

    #beamCopyOf(projectile) {
        try {
            return projectile.add(offsets.LogicProjectileClient_isBeamCopy).readU8() & 1;
        } catch {
            return 0;
        }
    }

    #readProjectileMeta(projectile, data, speed, rangeUnits, beam) {
        const fns = getFunctions();
        let preMs = this.#readProjectileField(
            data,
            offsets.LogicProjectileData_preExplosionTimeMs,
            1,
            60000
        );
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
        preMs = this.#preExplosionMs(data, preMs);
        homing = this.#flagFallback(
            fns.LogicProjectileData_isHomingMissile,
            data,
            projectile,
            homing
        );
        bouncing = this.#flagFallback(
            fns.LogicProjectileData_isBouncing,
            data,
            projectile,
            bouncing
        );
        const steerSpecs = this.#steerSpecs(data);
        const bounceSpecs = this.#bounceSpecs(data);
        const resolved = this.#resolveTicks(projectile, data, rangeUnits, speed, beam);
        const life = this.#lifeSpecs(resolved.ticks, resolved.isBeam, rangeUnits, speed);
        const travelType = this.#readClientU32(
            projectile,
            offsets.LogicProjectileClient_travelType,
            16
        );
        const beamCopy = this.#beamCopyOf(projectile);
        let steerLifeMs = 0;
        if (steerSpecs.life > 0)
            steerLifeMs = steerSpecs.life > 400 ? steerSpecs.life : steerSpecs.life * tickMs;
        return {
            preMs,
            lifeMs: life.lifeMs,
            ticks: resolved.ticks,
            travel: life.travel,
            typeId: this.#typeIdOf(data),
            travelType,
            isBeam: resolved.isBeam || !!beamCopy,
            beamCopy: !!beamCopy,
            homing: !!homing,
            bouncing: !!bouncing,
            steer: this.#steerStrengthOf(data),
            steerIgnoreMs: steerSpecs.ignore > 0 ? steerSpecs.ignore * tickMs : 0,
            steerLifeMs,
            bounceAdd: bounceSpecs.add,
            bounceMax: bounceSpecs.max,
            bounceKeep: bounceSpecs.keep,
            rehit: !!bounceSpecs.rehit
        };
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
        const flags = this.#readProjectileFlags(data);
        let isIndirect = this.#dataU8(data, offsets.LogicProjectileData_indirect);
        const travelType = this.#travelTypeOf(data, projectile);
        const dynamicRange = this.#dataU8(data, offsets.LogicProjectileData_allowDynamicRange);
        if (travelType === 6 || dynamicRange) isIndirect = 1;
        let beam = 0;
        try {
            beam = data.add(offsets.LogicProjectileData_isBeamField).readU8() & 1;
        } catch {}
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
            ignoreChars: this.#dataU8(data, offsets.LogicProjectileData_ignoreCharacterCollisions),
            ignoreEnv: this.#dataU8(data, offsets.LogicProjectileData_ignoreEnvironmentCollisions),
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
            homeDistance: this.#dataS32(data, offsets.LogicProjectileData_homingDistance, 1, 30000),
            gravity: this.#dataS32(data, offsets.LogicProjectileData_gravity, 1, 20000),
            shotByHero: this.#dataU8(data, offsets.LogicProjectileData_isShotByHero),
            visualized: this.#dataU8(data, offsets.LogicProjectileData_visualizeEndPoint),
            attachArea: this.#dataU8(data, offsets.LogicProjectileData_attachAreaEffectToTarget),
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
            const insideCall = () => this.#insideTravelCall;
            const learn = (key, a1, a2, ticks) => this.#learnTravel(key, a1, a2, ticks);
            Interceptor.attach(base.add(offsets.LogicProjectileClient_getTravelTicks), {
                onEnter(args) {
                    this.key = args[0].toString();
                    this.a1 = args[1].toUInt32();
                    this.a2 = args[2].toUInt32();
                },
                onLeave(retval) {
                    if (insideCall()) return;
                    learn(this.key, this.a1, this.a2, retval.toInt32());
                }
            });
        } catch {}
    }

    #installProjectilePathHook(base) {
        try {
            Interceptor.attach(base.add(offsets.CalculateProjectilePath), {
                onEnter: () => {
                    this.state.pathRanAt = Date.now();
                }
            });
        } catch {}
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
            this.#charRange.delete(index);
            this.#rangeBonus.delete(index);
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
        this.#installTravelTicksHook(base);
        this.#installProjectilePathHook(base);
        this.#installDataReloadHooks(base);
    }

    learnedFlightRange(data) {
        if (!isValidPtr(data)) return 0;
        const v = this.#flightRange.get(data.toString()) || 0;
        return Math.max(v, 0);
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
        return Math.max(remain, 0);
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

    #blendVelocity(entry, dx, dy, dt) {
        const observedVx = dx / dt;
        const observedVy = dy / dt;
        if (length(observedVx, observedVy) > 8500) return;
        const alpha = entry.hasVelocitySample ? 0.4 : 1;
        entry.vx = entry.vx * (1 - alpha) + observedVx * alpha;
        entry.vy = entry.vy * (1 - alpha) + observedVy * alpha;
        entry.hasVelocitySample = true;
        const measured = length(entry.vx, entry.vy);
        if (measured >= 300 && measured <= 8500) this.#learnOwnSpeed(entry, measured);
    }

    #learnOwnSpeed(entry, measured) {
        if (entry.ownerIndex !== this.state.myPlayerIndex) return;
        const dataPtr = entry.data;
        if (!isValidPtr(dataPtr)) return;
        const key = dataPtr.toString();
        const acc = this.#speedByData.get(key) || { sum: 0, count: 0 };
        acc.sum += measured;
        acc.count++;
        this.#speedByData.set(key, acc);
        this.state.measuredSpeed = Math.round(acc.sum / acc.count);
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

    #learnCapOvershoot(entry, flown, now) {
        if (!(entry.hasVelocitySample && now - entry.lastMoveTs < 200)) return;
        const capLearned = this.learnedFlightRange(entry.data);
        if (capLearned > 0 && flown > capLearned + entry.radius + 50)
            this.#learnFlightRange(entry.data, flown + entry.speed * 0.7);
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
    }

    #effectOutputFields(entry, o) {
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
    }

    #newOutput(entry, gid) {
        const o = {};
        entry.out = o;
        o.gid = gid;
        o.radius = entry.radius;
        o.passesEnv = !!entry.passesEnv;
        o.piercesEnv = !!entry.piercesEnv;
        o.piercesChars = !!entry.piercesChars;
        o.isIndirect = !!entry.isIndirect;
        o.isBeam = !!entry.isBeam;
        o.beamCopy = !!entry.beamCopy;
        this.#staticOutputFields(entry, o);
        this.#effectOutputFields(entry, o);
        const w = this.#weaponForOwner(entry.ownerIndex);
        o.volleyMs = this.#volleyMs(w);
        o.volleyBullets = (w && w.bullets) || 0;
        o.volleySpread = (w && w.spread) || 0;
        return o;
    }

    #refreshOutput(entry, o, x, y, flown) {
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
    }

    #refreshEntry(entry, gid, now, output) {
        const x = this.#fieldS32(entry.ptr, offsets.LogicGameObjectClient_x);
        const y = this.#fieldS32(entry.ptr, offsets.LogicGameObjectClient_y);
        this.#sampleEntryMotion(entry, x, y, now);
        entry.lastX = x;
        entry.lastY = y;
        entry.lastTs = now;
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
        if (!entry.meta && this.#metaBudget > 0) {
            this.#metaBudget--;
            this.#applyMeta(
                entry,
                this.#readProjectileMeta(entry.ptr, entry.data, entry.speed, 0, entry.isBeam)
            );
        }
        const flown = this.#traveled(entry, x, y);
        entry.flown = flown;
        this.#learnCapOvershoot(entry, flown, now);
        entry.seg = this.#flightSeg(entry, flown);
        entry.segUncertain = !!(
            entry.hasVelocitySample &&
            now - entry.lastMoveTs < 200 &&
            !(entry.seg > 0) &&
            length(entry.vx, entry.vy) > 100
        );
        if (!this.#entryVisible(entry, this.#resolveOwner(entry))) return;
        const o = entry.out || this.#newOutput(entry, gid);
        this.#refreshOutput(entry, o, x, y, flown);
        output.push(o);
    }

    #updateLiveProjectiles(now) {
        const output = this.#outArr;
        output.length = 0;
        this.#metaBudget = this.#probeBudget > 0 ? 4 : 0;
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
        let myTeamFromMgr = -1;
        try {
            const mgrForTeam = bm.add(offsets.BattleMode_objectManager).readPointer();
            if (isValidPtr(mgrForTeam)) {
                this.#objMgrPtr = mgrForTeam;
                myTeamFromMgr = this.#ownTeamOf(mgrForTeam);
            }
        } catch {}
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
        const vtableProj = this.#moduleBase.add(offsets.LogicProjectileData_vtable);
        const vtableProjClient = this.#moduleBase.add(offsets.LogicProjectileClient_vtable);
        let objVt = null;
        try {
            objVt = obj.readPointer();
        } catch {}
        return !!(objVt && objVt.equals(vtableProjClient)) || data.readPointer().equals(vtableProj);
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
            moveAngle: this.#moveAngleOf(obj),
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
        this.#probeBudget = 8;
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
