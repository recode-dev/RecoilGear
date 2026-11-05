import { sendCommand } from "../core/commands.js";
import { getFunctions } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import {
    collisionRadius,
    dataOf,
    enableProjectileTracking,
    inputSentSince,
    moveAppliedSince,
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
import {
    coreConfigure,
    coreRepublish,
    coreReset,
    coreResetKinematics,
    coreTick
} from "./dodge_core.js";

const MOVE_INPUT_TYPE = 2;

let _lastSentX = 1e9;
let _lastSentY = 1e9;
let _lastSentAt = 0;
let _hitbox = 0;
let _radiusMemoData = null;
let _radiusMemoValue = 0;
let _last = { active: false };

const _wallsApi = {
    firstWallHit,
    isBlockedWide,
    pathBlocked,
    tileSizeUnits,
    wallsVersion,
    BLOCKS_MOVEMENT,
    BLOCKS_PROJECTILES
};

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

function _sendMove(logic, tx, ty) {
    if (!logic || logic.isNull()) return false;
    if (!isFinite(tx) || !isFinite(ty)) return false;
    const now = Date.now();
    if (tx === _lastSentX && ty === _lastSentY && now - _lastSentAt < 40) return true;
    try {
        const fns = getFunctions();
        if (moveAppliedSince(tx, ty, 15) && inputSentSince(tx, ty, 15)) {
            _lastSentX = tx;
            _lastSentY = ty;
            _lastSentAt = now;
            return true;
        }
        if (!moveAppliedSince(tx, ty, 20))
            fns.LogicBattleModeClient_setClientPredictionMoveTo(logic, tx, ty, 1);
        const ok = sendCommand(MOVE_INPUT_TYPE, (ci) => {
            ci.add(offsets.ClientInput_x).writeS32(tx);
            ci.add(offsets.ClientInput_y).writeS32(ty);
        });
        _lastSentX = tx;
        _lastSentY = ty;
        _lastSentAt = now;
        return ok;
    } catch (_) {
        return false;
    }
}

export function dodgeBusy() {
    return !!_last.active;
}

export function pushDodgeTarget() {
    if (!_last.active) return;
    const now = Date.now();
    const r = coreRepublish(now, scanData.myX, scanData.myY);
    if (!r.active) {
        _last = { active: false };
        return;
    }
    _sendMove(scanData.battleModeClient, r.targetX, r.targetY);
}

export function updateAutododge() {
    if (scanData.lastUpdate === 0) return;
    const now = Date.now();
    if (!learnOwnHitbox()) {
        const fb = scanData.myRadius | 0;
        if (fb > 0) _hitbox = fb;
    }
    const decision = coreTick({
        now,
        x: scanData.myX,
        y: scanData.myY,
        speed: scanData.mySpeed | 0,
        radius: _hitbox | 0,
        projectiles: scanData.projectiles,
        walls: _wallsApi,
        stamp: scanData.lastUpdate
    });
    _last = decision;
    if (decision.active && isFinite(decision.targetX) && isFinite(decision.targetY)) {
        _sendMove(scanData.battleModeClient, decision.targetX, decision.targetY);
    }
}

function _invalidateOwnMetrics() {
    _hitbox = 0;
    _radiusMemoData = null;
    _radiusMemoValue = 0;
    coreResetKinematics();
}

export function resetAutododge() {
    coreReset();
    _invalidateOwnMetrics();
    _lastSentX = 1e9;
    _lastSentY = 1e9;
    _lastSentAt = 0;
    _last = { active: false };
}

export function setupAutododge() {
    try {
        enableProjectileTracking();
        onDataReload(_invalidateOwnMetrics);
    } catch (_) {}
    coreConfigure({ clock: Date.now });
}
