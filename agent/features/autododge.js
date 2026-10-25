import
{
    sendCommand
}
from "../core/commands.js";
import
{
    getFunctions
}
from "../core/functions.js";
import
{
    offsets
}
from "../core/offsets.js";
import
{
    enableProjectileTracking,
    scanData
}
from "../core/scanner.js";
import
{
    BLOCKS_MOVEMENT,
    BLOCKS_PROJECTILES,
    isBlockedWide,
    losCheck
}
from "../utils/wallCache.js";

const DEFAULT_FIT = { grow: 0.5, pad: 80.0 };
const MOVE_INPUT_TYPE = 2;
const RANGE_FALLBACK = 2800;

const TUNE = {
    AWARE: 3200,
    TICK_MS: 4,
    TICK_MS_IDLE: 48,
    DIR_COUNT: 48,
    SKIN: 50,
    LOCK_MS: 70,
    REACH: 600,
    HORIZON_S: 1.4,
    KEEP_BAND: 100,
    MOMENTUM: 55,
    ENGAGE: 100,
    RELEASE_GRACE_MS: 200,
    WALL_HIT: 9000,
    PROBE_N: 3,
    PROBE_T: 0.35,
    WALL_BODY: 240,
    SEND_MIN_MS: 80,
    SEND_MIN_DIST: 8,
    MIN_POS: 50
};

let _heading = null;
let _headingIdx = -1;
let _holdUntil = 0;
let _lastDangerTs = 0;
let _lastTick = 0;
let _lastSentX = 1e9;
let _lastSentY = 1e9;
let _lastSentAt = 0;
const _muted = new Set();
const _ring = [];
let _skip = new Set();
const _options = {
    reactionSpeed: 100,
    directionPrecision: 48,
    safetyMargin: 25
};

function _buildRing()
{
    _ring.length = 0;
    const n = TUNE.DIR_COUNT;
    for (let i = 0; i < n; i++)
    {
        const a = Math.PI * 2 * i / n;
        _ring.push(
        {
            x: Math.cos(a),
            y: Math.sin(a)
        });
    }
    _headingIdx = -1;
}
_buildRing();

function _syncTuning()
{
    const t = Math.max(0, Math.min(100, _options.reactionSpeed)) / 100;
    TUNE.TICK_MS = Math.max(4, Math.round(24 - t * 20));
    TUNE.TICK_MS_IDLE = Math.max(16, Math.round(64 - t * 16));
    TUNE.LOCK_MS = Math.max(70, Math.round(240 - t * 180));
    const n = Math.max(8, Math.min(128, _options.directionPrecision | 0));
    if (n !== TUNE.DIR_COUNT)
    {
        TUNE.DIR_COUNT = n;
        _buildRing();
    }
    TUNE.SKIN = Math.max(0, Math.min(120, _options.safetyMargin)) * 2;
}
_syncTuning();

export function getDodgeDir()
{
    return _heading;
}

export function setAutododgeOptions(opts)
{
    if (!opts || typeof opts !== "object") return;
    if (typeof opts.reactionSpeed === "number" && isFinite(opts.reactionSpeed))
    {
        _options.reactionSpeed = Math.max(0, Math.min(100, opts.reactionSpeed));
    }
    if (typeof opts.directionPrecision === "number" && isFinite(opts.directionPrecision))
    {
        _options.directionPrecision = Math.max(8, Math.min(128, opts.directionPrecision | 0));
    }
    if (typeof opts.safetyMargin === "number" && isFinite(opts.safetyMargin))
    {
        _options.safetyMargin = Math.max(0, Math.min(120, opts.safetyMargin));
    }
    if (Array.isArray(opts.ignoredBrawlers))
    {
        _skip = new Set(opts.ignoredBrawlers.filter(name => typeof name === "string" && name).map(name => name.toUpperCase()));
        _muted.clear();
    }
    _syncTuning();
}

function _ballR(p)
{
    return p.radius > 0 ? p.radius : 100;
}

function _traveled(p)
{
    const sx = p.spawnX;
    const sy = p.spawnY;
    if (!isFinite(sx) || !isFinite(sy)) return 0;
    return Math.hypot(p.x - sx, p.y - sy);
}

function _lifeLeft(p)
{
    const maxRange = p.castRange > 0 ? p.castRange : RANGE_FALLBACK;
    return Math.max(0, maxRange - _traveled(p));
}

function _collectLive(myX, myY, myRadius)
{
    const out = [];
    const live = new Set();
    const shots = scanData.projectiles;
    if (!shots || shots.length === 0)
    {
        if (_muted.size > 0) _muted.clear();
        return out;
    }
    const zoneSq = TUNE.AWARE * TUNE.AWARE;
    const bodyR = myRadius + TUNE.SKIN;
    for (let i = 0; i < shots.length; i++)
    {
        const p = shots[i];
        if (!p) continue;
        const gid = p.gid;
        if (!gid) continue;
        live.add(gid);
        const owner = p.ownerName;
        if (owner && _skip.has(owner.toUpperCase())) _muted.add(gid);
        if (_muted.has(gid)) continue;
        const dx = p.x - myX;
        const dy = p.y - myY;
        if (dx * dx + dy * dy > zoneSq) continue;
        const indirect = !!p.isIndirect;
        let vx = p.vx;
        let vy = p.vy;
        if (!isFinite(vx) || !isFinite(vy))
        {
            vx = 0;
            vy = 0;
        }
        const spd = Math.hypot(vx, vy);
        const blob = !p.isBeam && !indirect && (p.speed || 0) > 0 && p.speed < 1600;
        const shotR = _ballR(p);
        const rad = shotR + bodyR + DEFAULT_FIT.pad + shotR * DEFAULT_FIT.grow;
        let ux = 0;
        let uy = 0;
        if (spd >= 1)
        {
            ux = vx / spd;
            uy = vy / spd;
        }
        const skipAlong = blob || indirect;
        let playerAlong = 0;
        if (!skipAlong && spd >= 1)
        {
            playerAlong = (myX - p.x) * ux + (myY - p.y) * uy;
            if (playerAlong < -50) continue;
            const hitX = p.x + ux * Math.max(playerAlong, 0);
            const hitY = p.y + uy * Math.max(playerAlong, 0);
            if (!losCheck(p.x, p.y, hitX, hitY, BLOCKS_PROJECTILES)) continue;
        }
        const left = _lifeLeft(p);
        if (left <= 10) continue;
        const gap = Math.hypot(p.x - myX, p.y - myY) - bodyR - shotR;
        if (left < 0.85 * Math.max(0, gap)) continue;
        if (!skipAlong && spd >= 1 && playerAlong > left + shotR) continue;
        out.push(
        {
            x: p.x,
            y: p.y,
            vx: blob ? 0 : vx,
            vy: blob ? 0 : vy,
            rad,
            pathLen: left + shotR,
            left
        });
    }
    for (const gid of _muted)
    {
        if (!live.has(gid)) _muted.delete(gid);
    }
    return out;
}

function _clearanceFor(threats, myX, myY, mvx, mvy)
{
    let minClear = Infinity;
    const horizon = TUNE.HORIZON_S;
    for (let i = 0; i < threats.length; i++)
    {
        const t = threats[i];
        const spd = Math.hypot(t.vx, t.vy);
        let maxT = horizon;
        if (spd > 1)
        {
            if (t.left > 0) maxT = Math.min(maxT, t.left / spd);
            if (t.pathLen > 0) maxT = Math.min(maxT, t.pathLen / spd);
        }
        if (t.until > 0) maxT = Math.min(maxT, t.until);
        const relx = t.x - myX;
        const rely = t.y - myY;
        const vrx = t.vx - mvx;
        const vry = t.vy - mvy;
        const vv = vrx * vrx + vry * vry;
        let cx;
        let cy;
        if (vv < 1e-6)
        {
            cx = relx;
            cy = rely;
        }
        else
        {
            let ts = -(relx * vrx + rely * vry) / vv;
            if (ts < 0) ts = 0;
            else if (ts > maxT) ts = maxT;
            cx = relx + vrx * ts;
            cy = rely + vry * ts;
        }
        const clear = Math.sqrt(cx * cx + cy * cy) - t.rad;
        if (clear < minClear) minClear = clear;
    }
    return minClear;
}

function _wallAhead(myX, myY, dir, speed, bodyR)
{
    const step = speed * TUNE.PROBE_T;
    let raw = 0;
    for (let s = 1; s <= TUNE.PROBE_N; s++)
    {
        const px = myX + dir.x * step * s;
        const py = myY + dir.y * step * s;
        if (isBlockedWide(px, py, bodyR, BLOCKS_MOVEMENT))
        {
            raw += TUNE.WALL_HIT * (TUNE.PROBE_N - s + 1);
        }
    }
    return raw;
}

function _sendMove(logic, tx, ty)
{
    if (!logic || logic.isNull()) return false;
    if (!isFinite(tx) || !isFinite(ty)) return false;
    try
    {
        const fns = getFunctions();
        fns.LogicBattleModeClient_setClientPredictionMoveTo(logic, tx, ty, 1);
        return sendCommand(MOVE_INPUT_TYPE, (ci) =>
        {
            ci.add(offsets.ClientInput_x).writeS32(tx);
            ci.add(offsets.ClientInput_y).writeS32(ty);
        });
    }
    catch (e)
    {
        return false;
    }
}

function _clearHeading()
{
    _heading = null;
    _headingIdx = -1;
    _holdUntil = 0;
}

export function updateAutododge()
{
    if (scanData.lastUpdate === 0) return;
    const now = Date.now();
    const tickMs = _heading ? TUNE.TICK_MS : TUNE.TICK_MS_IDLE;
    if (now - _lastTick < tickMs) return;
    _lastTick = now;
    const myX = scanData.myX;
    const myY = scanData.myY;
    if (!isFinite(myX) || !isFinite(myY)) return;
    if (Math.abs(myX) < TUNE.MIN_POS && Math.abs(myY) < TUNE.MIN_POS) return;
    const speed = scanData.mySpeed || 720;
    const myRadius = scanData.myRadius || 60;
    const hazards = _collectLive(myX, myY, myRadius);
    if (hazards.length === 0)
    {
        if (_heading && now - _lastDangerTs > TUNE.RELEASE_GRACE_MS) _clearHeading();
        return;
    }
    const stayClear = _clearanceFor(hazards, myX, myY, 0, 0);
    const inDanger = stayClear < TUNE.ENGAGE;
    if (inDanger) _lastDangerTs = now;
    if (!inDanger && (!_heading || now - _lastDangerTs > TUNE.RELEASE_GRACE_MS))
    {
        if (_heading) _clearHeading();
        return;
    }
    const prevIdx = _headingIdx >= 0 && _headingIdx < _ring.length ? _headingIdx : -1;
    const prevDir = prevIdx >= 0 ? _ring[prevIdx] : null;
    const bodyR = TUNE.WALL_BODY;
    let bestIdx = 0;
    let bestScore = -Infinity;
    let prevScore = -Infinity;
    for (let i = 0; i < _ring.length; i++)
    {
        const d = _ring[i];
        let s = _clearanceFor(hazards, myX, myY, speed * d.x, speed * d.y);
        s -= _wallAhead(myX, myY, d, speed, bodyR);
        if (prevDir) s += TUNE.MOMENTUM * (d.x * prevDir.x + d.y * prevDir.y);
        if (i === prevIdx) prevScore = s;
        if (s > bestScore)
        {
            bestScore = s;
            bestIdx = i;
        }
    }
    let chosenIdx = bestIdx;
    let chosenScore = bestScore;
    if (prevIdx >= 0 && now < _holdUntil && chosenIdx !== prevIdx)
    {
        if (prevScore + TUNE.KEEP_BAND >= bestScore)
        {
            chosenIdx = prevIdx;
            chosenScore = prevScore;
        }
        else
        {
            _holdUntil = now + TUNE.LOCK_MS;
        }
    }
    else if (now >= _holdUntil)
    {
        _holdUntil = now + TUNE.LOCK_MS;
    }
    if (chosenScore <= stayClear)
    {
        if (_heading) _clearHeading();
        return;
    }
    const chosen = _ring[chosenIdx];
    _headingIdx = chosenIdx;
    _heading = chosen;
    if (state.speedhack) return;
    const tx = Math.round(myX + chosen.x * TUNE.REACH);
    const ty = Math.round(myY + chosen.y * TUNE.REACH);
    if (!isFinite(tx) || !isFinite(ty)) return;
    const ddx = tx - _lastSentX;
    const ddy = ty - _lastSentY;
    const moved = ddx * ddx + ddy * ddy > TUNE.SEND_MIN_DIST * TUNE.SEND_MIN_DIST;
    const stale = now - _lastSentAt > TUNE.SEND_MIN_MS;
    if (!moved && !stale) return;
    _lastSentX = tx;
    _lastSentY = ty;
    _lastSentAt = now;
    _sendMove(scanData.battleModeClient, tx, ty);
}

export function resetAutododge()
{
    _muted.clear();
    _clearHeading();
    _lastDangerTs = 0;
    _lastTick = 0;
    _lastSentX = 1e9;
    _lastSentY = 1e9;
    _lastSentAt = 0;
}

export function setupAutododge()
{
    try
    {
        enableProjectileTracking();
    }
    catch (e)
    {}
}