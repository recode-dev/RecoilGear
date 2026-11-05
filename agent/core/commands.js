import { offsets, offsetsFallback } from "./offsets.js";
import { getBase, getFunctions } from "./functions.js";
import { inputToken } from "../utils/crypto.js";

const CMD_BUF_SIZE = 72;
const MAX_TABLE_TYPE = 0x16;
const TABLE_ENTRIES = 0x17;
const FALLBACK_TYPE_CONST = 0xdeadbeef;
const MASK_SIZE = 16;
const DATA16_OFFSET = 4;
const SANITY_MIN_NONZERO = 16;
const SANITY_MIN_DISTINCT = 16;

const _zeroBuf = new Uint8Array(CMD_BUF_SIZE).buffer;

let _typeTable = null;
let _innerMask = null;
let _outerMask = null;
let _skillTypeTable = null;
let _usedFallback = false;
let _lastToken = 0;

function _bytesAt(address, size) {
    const raw = address.readByteArray(size);
    if (!raw) throw new Error("read failed");
    return new Uint8Array(raw);
}

function _readU32Table(address, entries) {
    const raw = _bytesAt(address, entries * 4);
    const values = new Uint32Array(entries);
    for (let i = 0; i < entries; i++) {
        values[i] =
            (raw[i * 4] |
                (raw[i * 4 + 1] << 8) |
                (raw[i * 4 + 2] << 16) |
                (raw[i * 4 + 3] << 24)) >>>
            0;
    }
    return values;
}

function _tableSane(table) {
    let nonzero = 0;
    const seen = new Set();
    for (let i = 0; i < table.length; i++) {
        const v = table[i];
        if (v !== 0) {
            nonzero++;
            seen.add(v);
        }
    }
    return nonzero >= SANITY_MIN_NONZERO && seen.size >= SANITY_MIN_DISTINCT;
}

function _resolveSet(source) {
    const base = getBase();
    if (!base) return null;
    try {
        const innerMask = _bytesAt(base.add(source.ClientInput_hashInnerMask), MASK_SIZE);
        const outerMask = _bytesAt(base.add(source.ClientInput_hashOuterMask), MASK_SIZE);
        const typeTable = _readU32Table(
            base.add(source.ClientInput_typeConstantTable),
            TABLE_ENTRIES
        );
        if (!_tableSane(typeTable)) return null;
        let skillTypeTable = null;
        const skillOff = source.SkillCommandTypeTable;
        if (typeof skillOff === "number" && skillOff > 0) {
            try {
                const table = _readU32Table(base.add(skillOff), TABLE_ENTRIES);
                if (_tableSane(table)) skillTypeTable = table;
            } catch (_) {}
        }
        return {
            typeTable: typeTable,
            innerMask: innerMask,
            outerMask: outerMask,
            skillTypeTable: skillTypeTable
        };
    } catch (_) {
        return null;
    }
}

function _applySet(set, isFallback) {
    _typeTable = set.typeTable;
    _innerMask = set.innerMask;
    _outerMask = set.outerMask;
    _skillTypeTable = set.skillTypeTable;
    _usedFallback = isFallback;
}

function _loadSigning() {
    if (_typeTable) return true;
    const base = getBase();
    if (!base) return false;
    const primary = _resolveSet(offsets);
    if (primary) {
        _applySet(primary, false);
        return true;
    }
    const fallback = _resolveSet(offsetsFallback);
    if (fallback) {
        _applySet(fallback, true);
        return true;
    }
    return false;
}

export function signingSource() {
    if (!_typeTable) return null;
    return _usedFallback ? "v36" : "v69";
}

export function skillCommandType(index) {
    if (!_skillTypeTable) return 0;
    const i = index | 0;
    if (i < 0 || i >= _skillTypeTable.length) return 0;
    return _skillTypeTable[i];
}

export function signClientInput(input, battle) {
    if (!input || input.isNull()) return 0;
    if (!battle || battle.isNull()) return 0;
    try {
        if (battle.add(offsets.BattleMode_hashEnabled).readU8() !== 1) return 0;
        if (!_loadSigning()) return 0;
        const key16 = _bytesAt(battle.add(offsets.BattleMode_hashKey), MASK_SIZE);
        const data16 = _bytesAt(input.add(DATA16_OFFSET), MASK_SIZE);
        const type = input.add(offsets.ClientInput_type).readU32() >>> 0;
        const mapped = type <= MAX_TABLE_TYPE ? _typeTable[type] : FALLBACK_TYPE_CONST;
        const value = inputToken(key16, _innerMask, _outerMask, data16, mapped);
        input.add(offsets.ClientInput_token).writeU32(value);
        _lastToken = value;
        return value;
    } catch (_) {
        return 0;
    }
}

export function lastToken() {
    return _lastToken;
}

export function sendCommand(cmdType, fillFn) {
    try {
        const fns = getFunctions();
        const battle = fns.BattleMode_getInstance();
        if (!battle || battle.isNull()) return false;

        const mgr = battle.add(offsets.BattleMode_clientInputManager).readPointer();
        if (!mgr || mgr.isNull()) return false;

        const ci = fns.operator_new(CMD_BUF_SIZE);
        if (!ci || ci.isNull()) return false;

        ci.writeByteArray(_zeroBuf);
        fns.ClientInput_constructor_int(ci, cmdType | 0);
        if (fillFn) fillFn(ci, battle);
        signClientInput(ci, battle);
        fns.ClientInputManager_addInput(mgr, ci);
        return true;
    } catch (_) {
        return false;
    }
}
