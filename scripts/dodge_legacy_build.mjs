// Generates scripts/.gen/before/{dodge_core.js,autododge.js} from a frozen
// commit so the mock can drive the REAL pre-fix dodge logic (agent command
// layer included) for an honest before/after comparison.
//
//   node scripts/dodge_legacy_build.mjs
//
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const REPO = new URL("..", import.meta.url).pathname;
const OUT = new URL("./.gen/before/", import.meta.url).pathname;
// frozen pre-fix state of the dodge feature
const REF = process.env.DODGE_BEFORE_REF || "bb71a2a";

mkdirSync(OUT, { recursive: true });

const show = (path) => execSync(`git -C ${REPO} show ${REF}:${path}`).toString();

// dodge_core.js is pure (no Frida) -> copy verbatim
writeFileSync(OUT + "dodge_core.js", show("agent/features/dodge_core.js"));

// autododge.js talks to Frida modules -> stub the import block, keep the logic
const src = show("agent/features/autododge.js");
const cut = src.indexOf("const MOVE_INPUT_TYPE");
if (cut < 0) throw new Error("legacy autododge.js: anchor not found");

const stubs = `// ---- generated pre-fix command layer (git ${REF} autododge.js + mock stubs) ----
const __stub = globalThis.__DODGE_STUB;
const scanData = __stub.scanData;
const getFunctions = () => __stub.fns;
const sendCommand = (type, fill) => {
    try {
        fill({
            add: (off) => ({
                writeS32: (v) => {
                    if (off === 0x10) __stub.pendingX = v;
                    if (off === 0x11) __stub.moves.push({ t: Date.now(), x: __stub.pendingX, y: v, kind: "input" });
                }
            })
        });
    } catch (_) {}
    return true;
};
const offsets = new Proxy(
    {},
    { get: (t, k) => (k === "ClientInput_x" ? 0x10 : k === "ClientInput_y" ? 0x11 : 0x10) }
);
const collisionRadius = () => 0;
const dataOf = () => null;
const enableProjectileTracking = () => {};
const inputSentSince = () => false;
const moveAppliedSince = () => false;
const onDataReload = () => {};
const BLOCKS_MOVEMENT = 128;
const BLOCKS_PROJECTILES = 64;
const firstWallHit = (...a) => __stub.walls.firstWallHit(...a);
const isBlockedWide = (...a) => __stub.walls.isBlockedWide(...a);
const pathBlocked = (...a) => __stub.walls.pathBlocked(...a);
const tileSizeUnits = () => 300;
const wallsVersion = () => 1;
import { coreConfigure, coreRepublish, coreReset, coreResetKinematics, coreTick } from "./dodge_core.js";

export function __legacyProbe() {
    return {
        active: !!_last.active,
        targetX: _last.targetX,
        targetY: _last.targetY,
        headingDeg: _last.headingDeg,
        started: !!_last.started
    };
}
`;

const body = src.slice(cut);
writeFileSync(OUT + "autododge.js", stubs + "\n" + body);
console.log("before-bundle generated at scripts/.gen/before (ref " + REF + ")");
