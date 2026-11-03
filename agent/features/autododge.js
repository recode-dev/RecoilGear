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
from "../core/scan.js";
import
{
    BLOCKS_MOVEMENT,
    BLOCKS_PROJECTILES,
    isBlockedWide,
    losCheck
}
from "../utils/walls.js";

const MOVE_INPUT_TYPE = 2;

const TUNE = {
    AWARE: 3200,
    TICK_MS: 4,
    TICK_MS_IDLE: 48,
    DIR_COUNT: 96,
    SKIN: 50,
    LOCK_MS: 150,
    REACH: 1200,
    HORIZON_S: 1.4,
    KEEP_BAND: 250,
    MOMENTUM: 150,
    ENGAGE: 100,
    RELEASE_GRACE_MS: 200,
    WALL_HIT: 9000,
    PROBE_N: 3,
    PROBE_T: 0.35,
    WALL_BODY: 240,
    SEND_MIN_MS: 50,
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
const _ring = [];
const _options = {
    reactionSpeed: 100,
    directionPrecision: 48,
    safetyMargin: 25
};

const _vec2 = Memory.alloc(8);

function _buildRing()
{
    _ring.length = 0;
    const n = TUNE.DIR_COUNT;
    for (let i = 0; i < n; i++)
    {
        const a = Math.round(360 * i / n);
        _ring.push(
        {
            x: getFunctions().LogicMath_getRotateDx(10000, 0, a),
            y: getFunctions().LogicMath_getRotateDy(10000, 0, a)
        });
    }
    _headingIdx = -1;
}

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
        if (_ring.length) _buildRing();
    }
    TUNE.SKIN = Math.max(0, Math.min(120, _options.safetyMargin)) * 2;
}
_syncTuning();
function _ballR(p)
{
    return p.radius > 0 ? p.radius : 100;
}

function _traveled(p)
{
    const sx = p.spawnX;
    const sy = p.spawnY;
    if (!isFinite(sx) || !isFinite(sy)) return 0;
    _vec2.writeS32((p.x - sx) | 0);
    _vec2.add(4).writeS32((p.y - sy) | 0);
    return getFunctions().LogicVector2_getLength(_vec2);
}

function _lifeLeft(p)
{
    if (!(p.castRange > 0)) return Infinity;
    const flown = _traveled(p);
    return Math.max(0, p.castRange - flown);
}

function _collectLive(myX, myY, myRadius)
{
    const out = [];
    const shots = scanData.projectiles;
    if (!shots || shots.length === 0)
    {
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
        const name = p.name || "";
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
        _vec2.writeS32(vx | 0);
        _vec2.add(4).writeS32(vy | 0);
        const spd = getFunctions().LogicVector2_getLength(_vec2);
        const slow = (p.speed || 0) > 0 && p.speed < 1600;
        const lockPath = !!p.isBeam;
        const blob = !lockPath && !indirect && slow;
        const shotR = _ballR(p);
        const rad = shotR + bodyR + 60 + shotR * 0.45;
        const skipAlong = blob || indirect;
        let playerAlong = 0;
        if (!skipAlong && spd >= 1)
        {
            const heading = getFunctions().LogicMath_normalizeAngle180(
                getFunctions().LogicMath_getAngle(vx | 0, vy | 0));
            playerAlong = getFunctions().LogicMath_getRotateDx(myX - p.x, myY - p.y, -heading);
            if (playerAlong < -50) continue;
            _vec2.writeS32(vx | 0);
            _vec2.add(4).writeS32(vy | 0);
            getFunctions().LogicVector2_normalize(_vec2, Math.max(playerAlong, 0) | 0);
            const hitX = p.x + _vec2.readS32();
            const hitY = p.y + _vec2.add(4).readS32();
            if (!losCheck(p.x, p.y, hitX, hitY, BLOCKS_PROJECTILES)) continue;
        }
        const left = _lifeLeft(p);
        if (left <= 10) continue;
        const gap = getFunctions().LogicGameplayUtil_getDistanceBetween(p.x | 0, p.y | 0, myX | 0, myY | 0) - bodyR - shotR;
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
            left,
            name
        });
    }
    return out;
}

function _clearanceFor(threats, myX, myY, mvx, mvy)
{
    const fns = getFunctions();
    let minClear = Infinity;
    for (let i = 0; i < threats.length; i++)
    {
        const t = threats[i];
        const relx = t.x - myX;
        const rely = t.y - myY;
        const reach = fns.LogicGameplayUtil_getDistanceBetween(t.x | 0, t.y | 0, myX | 0, myY | 0);
        _vec2.writeS32(t.vx | 0);
        _vec2.add(4).writeS32(t.vy | 0);
        const spd = fns.LogicVector2_getLength(_vec2);
        let maxT = TUNE.HORIZON_S;
        if (spd > 1) maxT = Math.min(maxT, (Math.max(0, t.left) + reach) / spd);
        const vrx = t.vx - mvx;
        const vry = t.vy - mvy;
        _vec2.writeS32(vrx | 0);
        _vec2.add(4).writeS32(vry | 0);
        const vlen = fns.LogicVector2_getLength(_vec2);
        let cx;
        let cy;
        if (vlen < 1)
        {
            cx = relx;
            cy = rely;
        }
        else
        {
            const heading = fns.LogicMath_normalizeAngle180(fns.LogicMath_getAngle(vrx | 0, vry | 0));
            const along = fns.LogicMath_getRotateDx(relx, rely, -heading);
            let ts = -along / vlen;
            if (ts < 0) ts = 0;
            else if (ts > maxT) ts = maxT;
            cx = relx + vrx * ts;
            cy = rely + vry * ts;
        }
        _vec2.writeS32(cx | 0);
        _vec2.add(4).writeS32(cy | 0);
        const clear = fns.LogicVector2_getLength(_vec2) - t.rad;
        if (clear < minClear) minClear = clear;
    }
    return minClear;
}

function _pathsHitMe(threats, px, py)
{
    const fns = getFunctions();
    for (let i = 0; i < threats.length; i++)
    {
        const t = threats[i];
        _vec2.writeS32(t.vx | 0);
        _vec2.add(4).writeS32(t.vy | 0);
        const vlen = fns.LogicVector2_getLength(_vec2);
        const reach = fns.LogicGameplayUtil_getDistanceBetween(t.x | 0, t.y | 0, px | 0, py | 0);
        let span = TUNE.HORIZON_S;
        if (vlen > 1)
        {
            span = Math.min(span, (Math.max(0, t.left) + reach) / vlen);
            fns.LogicVector2_normalize(_vec2, (vlen * span) | 0);
        }
        const endX = t.x + _vec2.readS32();
        const endY = t.y + _vec2.add(4).readS32();
        if (fns.LogicGameplayUtil_lineSegmentIntersectsCircle(
                t.x | 0, t.y | 0, endX | 0, endY | 0, px | 0, py | 0, (t.rad + TUNE.ENGAGE) | 0, ptr(0)))
        {
            return true;
        }
    }
    return false;
}

function _wallAhead(myX, myY, dir, speed, bodyR)
{
    const fns = getFunctions();
    const step = speed * TUNE.PROBE_T;
    let raw = 0;
    for (let s = 1; s <= TUNE.PROBE_N; s++)
    {
        _vec2.writeS32(dir.x | 0);
        _vec2.add(4).writeS32(dir.y | 0);
        fns.LogicVector2_normalize(_vec2, (step * s) | 0);
        const px = myX + _vec2.readS32();
        const py = myY + _vec2.add(4).readS32();
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
    const myRadius = scanData.myRadius > 0 ? scanData.myRadius : 120;
    const hazards = _collectLive(myX, myY, myRadius);
    if (hazards.length === 0)
    {
        if (_heading && now - _lastDangerTs > TUNE.RELEASE_GRACE_MS) _clearHeading();
        return;
    }
    const stayClear = _clearanceFor(hazards, myX, myY, 0, 0);
    const inDanger = _pathsHitMe(hazards, myX, myY);
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
        _vec2.writeS32(d.x | 0);
        _vec2.add(4).writeS32(d.y | 0);
        getFunctions().LogicVector2_normalize(_vec2, speed | 0);
        let s = _clearanceFor(hazards, myX, myY, _vec2.readS32(), _vec2.add(4).readS32());
        s -= _wallAhead(myX, myY, d, speed, bodyR);
        if (prevDir)
        {
            const turn = getFunctions().LogicMath_normalizeAngle180(
                getFunctions().LogicMath_getAngle(d.x | 0, d.y | 0) -
                getFunctions().LogicMath_getAngle(prevDir.x | 0, prevDir.y | 0));
            s += TUNE.MOMENTUM * (180 - Math.abs(turn)) / 180;
        }
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
    _vec2.writeS32(chosen.x | 0);
    _vec2.add(4).writeS32(chosen.y | 0);
    getFunctions().LogicVector2_normalize(_vec2, TUNE.REACH | 0);
    const tx = myX + _vec2.readS32();
    const ty = myY + _vec2.add(4).readS32();
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
    _buildRing();
}