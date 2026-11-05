import { offsets } from "./offsets.js";
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

function _loadSigning() {
    if (_typeTable) return true;
    const base = getBase();
    if (!base) return false;
    try {
        _innerMask = _bytesAt(base.add(offsets.ClientInput_hashInnerMask), MASK_SIZE);
        _outerMask = _bytesAt(base.add(offsets.ClientInput_hashOuterMask), MASK_SIZE);
        _typeTable = _readU32Table(
            base.add(offsets.ClientInput_typeConstantTable),
            TABLE_ENTRIES
        );
        if (!_tableSane(_typeTable)) {
            _typeTable = null;
            return false;
        }
        try {
            const table = _readU32Table(base.add(offsets.SkillCommandTypeTable), TABLE_ENTRIES);
            if (_tableSane(table)) _skillTypeTable = table;
        } catch (_) {}
        return true;
    } catch (_) {
        _typeTable = null;
        _innerMask = null;
        _outerMask = null;
        return false;
    }
}

export function signingSource() {
    if (!_typeTable) return null;
    return "v69";
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
