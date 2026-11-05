import { offsets } from "./offsets.js";
import { getFunctions } from "./functions.js";
import { signAgentInput } from "../utils/crypto.js";

const CMD_BUF_SIZE = 72;
const _zeroBuf = new Uint8Array(CMD_BUF_SIZE).buffer;

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
        fns.ClientInputManager_addInput(mgr, ci);
        signAgentInput(
            cmdType,
            ci.add(offsets.ClientInput_x).readS32() | 0,
            ci.add(offsets.ClientInput_y).readS32() | 0
        );
        return true;
    } catch (_) {
        return false;
    }
}
