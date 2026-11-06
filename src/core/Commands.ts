import { inputToken } from "../utils/Crypto";

import { getBase, getFunctions } from "./Functions";
import { OFFSETS } from "./Offsets";

const CMD_BUF_SIZE = 72;
const TABLE_ENTRIES = 0x17;
const MASK_SIZE = 16;
const DATA16_OFFSET = 4;
const SANITY_MIN_NONZERO = 16;
const SANITY_MIN_DISTINCT = 16;

type InputFill = (ci: NativePointer, battle: NativePointer) => void;

class CommandSigner {
    #zeroBuf = new Uint8Array(CMD_BUF_SIZE).buffer;
    #typeTable: Uint32Array | null = null;
    #innerMask: Uint8Array | null = null;
    #outerMask: Uint8Array | null = null;

    #bytesAt(address: NativePointer, size: number): Uint8Array {
        const raw = address.readByteArray(size);
        if (!raw) throw new Error("read failed");
        return new Uint8Array(raw);
    }

    #readU32Table(address: NativePointer, entries: number): Uint32Array {
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

    #tableSane(table: Uint32Array): boolean {
        let nonzero = 0;
        const seen = new Set<number>();
        for (const v of table) {
            if (v !== 0) {
                nonzero++;
                seen.add(v);
            }
        }
        return nonzero >= SANITY_MIN_NONZERO && seen.size >= SANITY_MIN_DISTINCT;
    }

    #loadSigning(): boolean {
        if (this.#typeTable) return true;
        const base = getBase();
        if (!base) return false;
        try {
            this.#innerMask = this.#bytesAt(base.add(OFFSETS.ClientInput_hashInnerMask), MASK_SIZE);
            this.#outerMask = this.#bytesAt(base.add(OFFSETS.ClientInput_hashOuterMask), MASK_SIZE);
            this.#typeTable = this.#readU32Table(
                base.add(OFFSETS.ClientInput_typeConstantTable),
                TABLE_ENTRIES
            );
            if (!this.#tableSane(this.#typeTable)) {
                this.#typeTable = null;
                return false;
            }
            return true;
        } catch {
            this.#typeTable = null;
            this.#innerMask = null;
            this.#outerMask = null;
            return false;
        }
    }

    #typeConstBytes(type: number): Uint8Array {
        const raw = this.#typeTable![type];
        return new Uint8Array([raw & 0xff, (raw >>> 16) & 0xff, 0, 0]);
    }

    #signClientInput(input: NativePointer, battle: NativePointer): number {
        if (!input || input.isNull()) return 0;
        if (!battle || battle.isNull()) return 0;
        try {
            if (battle.add(OFFSETS.BattleMode_hashEnabled).readU8() !== 1) return 0;
            if (!this.#loadSigning()) return 0;
            const secrets = {
                key16: this.#bytesAt(battle.add(OFFSETS.BattleMode_hashKey), MASK_SIZE),
                maskIn: this.#innerMask!,
                maskOut: this.#outerMask!
            };
            const snapshot = this.#bytesAt(input.add(DATA16_OFFSET), MASK_SIZE);
            const type = input.add(OFFSETS.ClientInput_type).readU32() >>> 0;
            const value = inputToken(secrets, this.#typeConstBytes(type), snapshot);
            input.add(OFFSETS.ClientInput_token).writeU32(value);
            return value;
        } catch {
            return 0;
        }
    }

    sendCommand(cmdType: number, fillFn: InputFill | null): boolean {
        try {
            const fns = getFunctions();
            const battle = fns.BattleMode_getInstance();
            if (!battle || battle.isNull()) return false;
            const mgr = battle.add(OFFSETS.BattleMode_clientInputManager).readPointer();
            if (!mgr || mgr.isNull()) return false;
            const ci = fns.operator_new(CMD_BUF_SIZE);
            if (!ci || ci.isNull()) return false;
            ci.writeByteArray(this.#zeroBuf);
            fns.ClientInput_constructor_int(ci, Math.trunc(cmdType));
            if (fillFn) fillFn(ci, battle);
            this.#signClientInput(ci, battle);
            fns.ClientInputManager_addInput(mgr, ci);
            return true;
        } catch {
            return false;
        }
    }
}

const signer = new CommandSigner();

export const sendCommand = (cmdType: number, fillFn: InputFill | null): boolean =>
    signer.sendCommand(cmdType, fillFn);
