import { offsets } from "./offsets.js";
import { getBase, getFunctions } from "./functions.js";
import { inputToken } from "../utils/crypto.js";

const CMD_BUF_SIZE = 72;
const MAX_TABLE_TYPE = 0x16;
const TABLE_ENTRIES = 0x17;
const FALLBACK_TYPE_CONST = 0xdeadbeef;
const MASK_SIZE = 16;
const DATA16_OFFSET = 4;

const _zeroBuf = new Uint8Array(CMD_BUF_SIZE).buffer;

let _typeTable = null;
let _innerMask = null;
let _outerMask = null;
let _lastToken = 0;

function _bytesAt(address, size) {
    const raw = address.readByteArray(size);
    if (!raw) throw new Error("read failed");
    return new Uint8Array(raw);
}

function _loadSigning() {
    if (_typeTable) return true;
    const base = getBase();
    if (!base) return false;
    const table = _bytesAt(base.add(offsets.ClientInput_typeConstantTable), TABLE_ENTRIES * 4);
    const values = new Uint32Array(TABLE_ENTRIES);
    for (let i = 0; i < TABLE_ENTRIES; i++) {
        values[i] =
            (table[i * 4] |
                (table[i * 4 + 1] << 8) |
                (table[i * 4 + 2] << 16) |
                (table[i * 4 + 3] << 24)) >>>
            0;
    }
    _innerMask = _bytesAt(base.add(offsets.ClientInput_hashInnerMask), MASK_SIZE);
    _outerMask = _bytesAt(base.add(offsets.ClientInput_hashOuterMask), MASK_SIZE);
    _typeTable = values;
    return true;
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
