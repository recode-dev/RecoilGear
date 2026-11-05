import { inputToken } from "../utils/crypto.js";

import { getBase, getFunctions } from "./functions.js";
import { offsets } from "./offsets.js";

const cmdBufSize = 72;
const maxTableType = 0x16;
const tableEntries = 0x17;
const priorityTableEntries = 0x15;
const maskSize = 16;
const fallbackConstSize = 8;
const data16Offset = 4;
const sanityMinNonzero = 16;
const sanityMinDistinct = 16;

class CommandSigner {
    #zeroBuf = new Uint8Array(cmdBufSize).buffer;
    #typeTable = null;
    #innerMask = null;
    #outerMask = null;
    #skillTypeTable = null;
    #priorityTable = null;
    #fallbackType = 0xDEADBEEF;
    #lastToken = 0;

    #bytesAt(address, size) {
        const raw = address.readByteArray(size);
        if (!raw) throw new Error("read failed");
        return new Uint8Array(raw);
    }

    #readU32Table(address, entries) {
        const raw = this.#bytesAt(address, entries * 4);
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

    #tableSane(table) {
        let nonzero = 0;
        const seen = new Set();
        for (const v of table) {
            if (v !== 0) {
                nonzero++;
                seen.add(v);
            }
        }
        return nonzero >= sanityMinNonzero && seen.size >= sanityMinDistinct;
    }

    #decodeFallbackConst(raw) {
        return ((raw[6] << 24) | (raw[4] << 16) | (raw[2] << 8) | raw[0]) >>> 0;
    }

    #loadSigning() {
        if (this.#typeTable) return true;
        const base = getBase();
        if (!base) return false;
        try {
            this.#innerMask = this.#bytesAt(base.add(offsets.ClientInput_hashInnerMask), maskSize);
            this.#outerMask = this.#bytesAt(base.add(offsets.ClientInput_hashOuterMask), maskSize);
            this.#typeTable = this.#readU32Table(
                base.add(offsets.ClientInput_typeConstantTable),
                tableEntries
            );
            if (!this.#tableSane(this.#typeTable)) {
                this.#typeTable = null;
                return false;
            }
            try {
                const table = this.#readU32Table(
                    base.add(offsets.SkillCommandTypeTable),
                    tableEntries
                );
                if (this.#tableSane(table)) this.#skillTypeTable = table;
            } catch {}
            try {
                this.#priorityTable = this.#readU32Table(
                    base.add(offsets.ClientInput_typePriorityTable),
                    priorityTableEntries
                );
            } catch {}
            try {
                const decoded = this.#decodeFallbackConst(
                    this.#bytesAt(
                        base.add(offsets.ClientInput_typeConstantFallback),
                        fallbackConstSize
                    )
                );
                if (decoded !== 0) this.#fallbackType = decoded;
            } catch {}
            return true;
        } catch {
            this.#typeTable = null;
            this.#innerMask = null;
            this.#outerMask = null;
            return false;
        }
    }

    signingSource() {
        if (!this.#typeTable) return null;
        return "v69";
    }

    skillCommandType(index) {
        if (!this.#skillTypeTable) return 0;
        const i = Math.trunc(index);
        if (i < 0 || i >= this.#skillTypeTable.length) return 0;
        return this.#skillTypeTable[i];
    }

    clientInputTypePriority(type) {
        const t = Math.trunc(type);
        if (t < 0 || t >= priorityTableEntries) return -1;
        if (!this.#priorityTable) return 0;
        return Math.trunc(this.#priorityTable[t]);
    }

    signClientInput(input, battle) {
        if (!input || input.isNull()) return 0;
        if (!battle || battle.isNull()) return 0;
        try {
            if (battle.add(offsets.BattleMode_hashEnabled).readU8() !== 1) return 0;
            if (!this.#loadSigning()) return 0;
            const key16 = this.#bytesAt(battle.add(offsets.BattleMode_hashKey), maskSize);
            const data16 = this.#bytesAt(input.add(data16Offset), maskSize);
            const type = input.add(offsets.ClientInput_type).readU32() >>> 0;
            const mapped = type <= maxTableType ? this.#typeTable[type] : this.#fallbackType;
            const value = inputToken(key16, this.#innerMask, this.#outerMask, data16, mapped);
            input.add(offsets.ClientInput_token).writeU32(value);
            this.#lastToken = value;
            return value;
        } catch {
            return 0;
        }
    }

    get token() {
        return this.#lastToken;
    }

    sendCommand(cmdType, fillFn) {
        try {
            const fns = getFunctions();
            const battle = fns.BattleMode_getInstance();
            if (!battle || battle.isNull()) return false;
            const mgr = battle.add(offsets.BattleMode_clientInputManager).readPointer();
            if (!mgr || mgr.isNull()) return false;
            const ci = fns.operator_new(cmdBufSize);
            if (!ci || ci.isNull()) return false;
            ci.writeByteArray(this.#zeroBuf);
            fns.ClientInput_constructor_int(ci, Math.trunc(cmdType));
            if (fillFn) fillFn(ci, battle);
            this.signClientInput(ci, battle);
            fns.ClientInputManager_addInput(mgr, ci);
            return true;
        } catch {
            return false;
        }
    }
}

const signer = new CommandSigner();

export const signingSource = () => signer.signingSource();
export const skillCommandType = (index) => signer.skillCommandType(index);
export const clientInputTypePriority = (type) => signer.clientInputTypePriority(type);
export const signClientInput = (input, battle) => signer.signClientInput(input, battle);
export const lastToken = () => signer.token;
export const sendCommand = (cmdType, fillFn) => signer.sendCommand(cmdType, fillFn);
