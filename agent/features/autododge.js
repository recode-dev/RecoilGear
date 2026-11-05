import { sendCommand } from "../core/commands.js";
import { getFunctions } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import {
    collisionRadius,
    dataOf,
    enableProjectileTracking,
    onDataReload,
    scanData
} from "../core/scan.js";
import {
    BLOCKS_MOVEMENT,
    BLOCKS_PROJECTILES,
    firstWallHit,
    isBlockedWide,
    pathBlocked,
    tileSizeUnits,
    wallsVersion
} from "../utils/walls.js";
import { coreReset, coreTick } from "./dodge_core.js";

const MOVE_INPUT_TYPE = 2;

let _hitbox = 0;
let _radiusMemoData = null;
let _radiusMemoValue = 0;
let _last = { active: false };
let _stopSent = false;

// offline-mock seams (scripts/dodge_mock.mjs): swap the native command path
// and the wall api. Production code never sets them.
let _transport = null;
let _wallsApi = {
    firstWallHit,
    isBlockedWide,
    pathBlocked,
    tileSizeUnits,
    wallsVersion,
    BLOCKS_MOVEMENT,
    BLOCKS_PROJECTILES
};
export function __setDodgeTransport(t) {
    _transport = t;
}
export function __setDodgeWalls(api) {
    if (api) _wallsApi = api;
}
export function __dodgeProbe() {
    return {
        active: !!_last.active,
        targetX: _last.targetX,
        targetY: _last.targetY,
        headingDeg: _last.headingDeg,
        started: !!_last.started,
        stopped: !!_last.stopped
    };
}

function characterCollisionRadius(data) {
    if (!data || data.isNull()) return 0;
    if (_radiusMemoData !== null && data.equals(_radiusMemoData) && _radiusMemoValue > 0) {
        return _radiusMemoValue;
    }
    const value = collisionRadius(data) | 0;
    if (value > 0) {
        _radiusMemoData = data;
        _radiusMemoValue = value;
    }
    return value;
}

function learnOwnHitbox() {
    try {
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return false;
        const fns = getFunctions();
        if (!fns.LogicGameObjectClient_getData) return false;
        const radius = characterCollisionRadius(dataOf(own)) | 0;
        if (!(radius > 0)) return false;
        _hitbox = radius;
        return true;
    } catch (_) {
        return false;
    }
}

// Every dodge movement goes through this single path: prediction move plus
// one signed input command. No second sender exists, so the server sees one
// consistent stream (this is what used to cause rubber-banding).
function issueMove(x, y) {
    if (_transport) {
        _transport.predict(x, y);
        _transport.input(x, y);
        return true;
    }
    try {
        const logic = scanData.battleModeClient;
        if (!logic || logic.isNull()) return false;
        const fns = getFunctions();
        if (!fns.LogicBattleModeClient_setClientPredictionMoveTo) return false;
        fns.LogicBattleModeClient_setClientPredictionMoveTo(logic, x, y, 1);
        return sendCommand(MOVE_INPUT_TYPE, (ci) => {
            ci.add(offsets.ClientInput_x).writeS32(x);
            ci.add(offsets.ClientInput_y).writeS32(y);
        });
    } catch (_) {
        return false;
    }
}

// The explicit half of "one start, one stop": a single move-to-self input so
// the last dodge vector dies with the dodge instead of lingering server-side.
function issueStop() {
    if (_transport) {
        _transport.stop(scanData.myX, scanData.myY);
        return true;
    }
    try {
        const logic = scanData.battleModeClient;
        if (!logic || logic.isNull()) return false;
        return sendCommand(MOVE_INPUT_TYPE, (ci) => {
            ci.add(offsets.ClientInput_x).writeS32(scanData.myX);
            ci.add(offsets.ClientInput_y).writeS32(scanData.myY);
        });
    } catch (_) {
        return false;
    }
}

export function updateAutododge() {
    if (scanData.lastUpdate === 0) return;
    const now = Date.now();
    if (!learnOwnHitbox()) {
        const fb = scanData.myRadius | 0;
        if (fb > 0) _hitbox = fb;
    }
    const d = coreTick({
        now,
        x: scanData.myX,
        y: scanData.myY,
        speed: scanData.mySpeed | 0,
        radius: _hitbox | 0,
        projectiles: scanData.projectiles,
        walls: _wallsApi,
        stamp: scanData.lastUpdate
    });
    _last = d;
    if (d.active) {
        _stopSent = false;
        if (d.send && isFinite(d.targetX) && isFinite(d.targetY)) issueMove(d.targetX, d.targetY);
        return;
    }
    if (d.stopped && !_stopSent) {
        _stopSent = true;
        issueStop();
    }
}

function _invalidateOwnMetrics() {
    _hitbox = 0;
    _radiusMemoData = null;
    _radiusMemoValue = 0;
}

export function resetAutododge() {
    coreReset();
    _invalidateOwnMetrics();
    _last = { active: false };
    _stopSent = false;
}

export function setupAutododge() {
    try {
        enableProjectileTracking();
        onDataReload(_invalidateOwnMetrics);
    } catch (_) {}
}
