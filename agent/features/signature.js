import { getBase, getFunctions } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import { sendCommand } from "../core/commands.js";
import { scanData } from "../core/scan.js";
import { BLOCKS_MOVEMENT, isBlockedWide, pathBlocked, tileSizeUnits } from "../utils/walls.js";
import { dodgeBusy } from "./autododge.js";

const MOVE_INPUT_TYPE = 2;
const IDLE_MS = 700;
const QUIET_MS = 900;
const STEP_TIMEOUT_MS = 550;
const SPIN_STEPS = 6;
const REACH_EPS = 40;
const MOVE_EPS = 12;
const PAUSE_JUDGE_MS = 250;
const SAMPLE_MS = 90;
const LOOP_PAUSE_MS = 800;
const MAX_SKIP = 3;
const POS_MIN = 50;
const WORLD_MAX = 100000;
const TETHER = 280;

let _pattern = null;
let _stepIdx = -1;
let _stepAt = 0;
let _pauseAt = 0;
let _active = false;
let _anchorX = 0;
let _anchorY = 0;
let _lastMoveTs = 0;
let _actionAt = 0;
let _px = 0;
let _py = 0;
let _pAt = 0;
let _sentX = 1e9;
let _sentY = 1e9;
let _sentAt = 0;
let _skips = 0;
let _installed = false;

function _abort() {
    _pattern = null;
    _stepIdx = -1;
    _active = false;
    _skips = 0;
}

function _hitpoints() {
    const own = scanData.ownCharacter;
    if (!own) return -1;
    try {
        return own.add(offsets.LogicCharacterClient_hitpoints).readU32() | 0;
    } catch (_) {
        return -1;
    }
}

function _bodyRadius() {
    const r = scanData.myRadius | 0;
    if (r > 0) return r;
    return Math.floor((tileSizeUnits() || 300) * 0.4);
}

function _buildPattern(ax, ay) {
    const tile = tileSizeUnits() || 300;
    const wig = Math.max(60, Math.round((tile * 3) / 10));
    const spin = Math.max(80, Math.round((tile * 2) / 5));
    const pts = [];
    pts.push({ x: ax - wig, y: ay });
    pts.push({ x: ax + wig, y: ay });
    pts.push({ x: ax - wig, y: ay });
    pts.push({ x: ax + wig, y: ay });
    for (let i = 1; i <= SPIN_STEPS; i++) {
        const a = (i * 360) / SPIN_STEPS;
        const r = (a * Math.PI) / 180;
        pts.push({
            x: ax + Math.round(Math.cos(r) * spin),
            y: ay + Math.round(Math.sin(r) * spin)
        });
    }
    return pts;
}

function _walkable(x, y, tx, ty, bodyR) {
    if (!isFinite(tx) || !isFinite(ty)) return false;
    if (tx < -WORLD_MAX || tx > WORLD_MAX || ty < -WORLD_MAX || ty > WORLD_MAX) return false;
    if (isBlockedWide(tx, ty, bodyR, BLOCKS_MOVEMENT)) return false;
    return !pathBlocked(x, y, tx, ty, BLOCKS_MOVEMENT);
}

function _sendMove(logic, tx, ty) {
    if (!logic || logic.isNull()) return false;
    if (!isFinite(tx) || !isFinite(ty)) return false;
    const now = Date.now();
    if (tx === _sentX && ty === _sentY && now - _sentAt < 40) return true;
    _sentX = tx;
    _sentY = ty;
    _sentAt = now;
    try {
        getFunctions().LogicBattleModeClient_setClientPredictionMoveTo(logic, tx, ty, 1);
        return sendCommand(MOVE_INPUT_TYPE, (ci) => {
            ci.add(offsets.ClientInput_x).writeS32(tx);
            ci.add(offsets.ClientInput_y).writeS32(ty);
        });
    } catch (_) {
        return false;
    }
}

function _sample(x, y, now) {
    if (!_pAt) {
        _px = x;
        _py = y;
        _pAt = now;
        return;
    }
    if (now - _pAt < SAMPLE_MS) return;
    const dx = x - _px;
    const dy = y - _py;
    _px = x;
    _py = y;
    _pAt = now;
    if (dx * dx + dy * dy <= MOVE_EPS * MOVE_EPS) return;
    if (!_active) {
        _lastMoveTs = now;
        return;
    }
    if (_stepIdx < 0 && now - _pauseAt > PAUSE_JUDGE_MS) {
        _abort();
        _lastMoveTs = now;
    }
}

function _advance(x, y, now) {
    const bodyR = _bodyRadius();
    while (_pattern && _stepIdx + 1 < _pattern.length) {
        _stepIdx++;
        const t = _pattern[_stepIdx];
        if (_walkable(x, y, t.x, t.y, bodyR)) {
            _skips = 0;
            _stepAt = now;
            return;
        }
        _skips++;
        if (_skips >= MAX_SKIP) {
            _abort();
            _lastMoveTs = now;
            return;
        }
    }
    _stepIdx = -1;
    _pauseAt = now;
}

function _drive(x, y, now) {
    if (!_pattern || _pattern.length === 0) {
        _abort();
        return;
    }
    if (_stepIdx < 0) {
        if (now - _pauseAt < LOOP_PAUSE_MS) return;
        _anchorX = x;
        _anchorY = y;
        _pattern = _buildPattern(x, y);
        _advance(x, y, now);
        return;
    }
    const t = _pattern[_stepIdx];
    const dx = t.x - x;
    const dy = t.y - y;
    if (dx * dx + dy * dy <= REACH_EPS * REACH_EPS) {
        _advance(x, y, now);
        return;
    }
    if (now - _stepAt >= STEP_TIMEOUT_MS) {
        _skips++;
        if (_skips >= MAX_SKIP) {
            _abort();
            _lastMoveTs = now;
            return;
        }
        _advance(x, y, now);
        return;
    }
    if (!_sendMove(scanData.battleModeClient, t.x, t.y)) _abort();
}

export function updateSignature() {
    if (scanData.lastUpdate === 0) {
        _abort();
        return;
    }
    const now = Date.now();
    const x = scanData.myX;
    const y = scanData.myY;
    if (!isFinite(x) || !isFinite(y)) {
        _abort();
        return;
    }
    if (Math.abs(x) < POS_MIN && Math.abs(y) < POS_MIN) {
        _abort();
        return;
    }
    if (_hitpoints() === 0) {
        _abort();
        return;
    }
    _sample(x, y, now);
    if (!_active) {
        if (dodgeBusy()) return;
        if (now - _lastMoveTs < IDLE_MS) return;
        if (now - _actionAt < QUIET_MS) return;
        _anchorX = x;
        _anchorY = y;
        _pattern = _buildPattern(x, y);
        _stepIdx = -1;
        _pauseAt = now - LOOP_PAUSE_MS;
        _active = true;
        _skips = 0;
        _drive(x, y, now);
        return;
    }
    if (dodgeBusy()) {
        _abort();
        return;
    }
    const ax = x - _anchorX;
    const ay = y - _anchorY;
    if (ax * ax + ay * ay > TETHER * TETHER) {
        _abort();
        _lastMoveTs = now;
        return;
    }
    _drive(x, y, now);
}

export function resetSignature() {
    _abort();
    _lastMoveTs = 0;
    _actionAt = 0;
    _px = 0;
    _py = 0;
    _pAt = 0;
    _sentX = 1e9;
    _sentY = 1e9;
    _sentAt = 0;
}

export function setupSignature() {
    if (_installed) return;
    _installed = true;
    try {
        Interceptor.attach(getBase().add(offsets.BattleScreen_activateSkill), {
            onEnter() {
                _actionAt = Date.now();
                _abort();
            }
        });
    } catch (_) {}
    try {
        Interceptor.attach(getBase().add(offsets.ClientInputManager_addInput), {
            onEnter(args) {
                try {
                    if (!_active) return;
                    const ci = args[1];
                    if (!ci || ci.isNull()) return;
                    const now = Date.now();
                    if (now - _sentAt <= 25) {
                        const ix = ci.add(offsets.ClientInput_x).readS32() | 0;
                        const iy = ci.add(offsets.ClientInput_y).readS32() | 0;
                        if (Math.abs(ix - _sentX) <= 2 && Math.abs(iy - _sentY) <= 2) return;
                    }
                    _lastMoveTs = now;
                    _abort();
                } catch (_) {}
            }
        });
    } catch (_) {}
}
