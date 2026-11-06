import { inputToken, matchVariant, tokenVariants } from "../utils/crypto.js";

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
    #fallbackType = 0xdeadbeef;
    #lastToken = 0;
    #variant = null;
    #votes = new Map();
    #hooked = false;
    #signing = false;
    #tries = 0;

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
        return this.#variant ? this.#variant.id : "v69";
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

    #typeConstBytes(type) {
        const raw = type <= maxTableType ? this.#typeTable[type] : this.#fallbackType;
        return new Uint8Array([
            raw & 0xff,
            (raw >>> 8) & 0xff,
            (raw >>> 16) & 0xff,
            (raw >>> 24) & 0xff
        ]);
    }

    #ensureCalibration() {
        if (this.#hooked) return;
        const base = getBase();
        if (!base) return;
        this.#hooked = true;
        try {
            Interceptor.attach(base.add(offsets.ClientInputManager_addInput), {
                onEnter: (args) => {
                    if (this.#signing) return;
                    try {
                        this.#observe(args[1]);
                    } catch {}
                }
            });
        } catch {}
    }

    #observe(input) {
        if (this.#variant || this.#tries > 400 || !input || input.isNull()) return;
        const fns = getFunctions();
        const battle = fns.BattleMode_getInstance();
        if (!battle || battle.isNull()) return;
        if (battle.add(offsets.BattleMode_hashEnabled).readU8() !== 1) return;
        if (!this.#loadSigning()) return;
        const token = input.add(offsets.ClientInput_token).readU32() >>> 0;
        if (token < 2) return;
        this.#tries++;
        const key16 = this.#bytesAt(battle.add(offsets.BattleMode_hashKey), maskSize);
        const snapshot = this.#bytesAt(input.add(data16Offset), maskSize);
        const type = input.add(offsets.ClientInput_type).readU32() >>> 0;
        const hit = matchVariant(
            key16,
            this.#innerMask,
            this.#outerMask,
            this.#typeConstBytes(type),
            snapshot,
            token
        );
        if (!hit) return;
        const votes = (this.#votes.get(hit.id) || 0) + 1;
        this.#votes.set(hit.id, votes);
        if (votes >= 2) this.#variant = hit;
    }

    signClientInput(input, battle) {
        if (!input || input.isNull()) return 0;
        if (!battle || battle.isNull()) return 0;
        try {
            if (battle.add(offsets.BattleMode_hashEnabled).readU8() !== 1) return 0;
            if (!this.#loadSigning()) return 0;
            this.#ensureCalibration();
            const key16 = this.#bytesAt(battle.add(offsets.BattleMode_hashKey), maskSize);
            const snapshot = this.#bytesAt(input.add(data16Offset), maskSize);
            const type = input.add(offsets.ClientInput_type).readU32() >>> 0;
            const value = inputToken(
                key16,
                this.#innerMask,
                this.#outerMask,
                this.#typeConstBytes(type),
                snapshot,
                this.#variant || tokenVariants[0]
            );
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
            this.#signing = true;
            try {
                fns.ClientInputManager_addInput(mgr, ci);
            } finally {
                this.#signing = false;
            }
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
