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
    LogicMath,
    distance,
    dot,
    length,
    lengthSquared,
    normalize,
    rotate,
    segmentHitsCircle,
}
from "../core/admath.js";
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

function _buildRing()
{
    _ring.length = 0;
    const n = TUNE.DIR_COUNT;
    for (let i = 0; i < n; i++)
    {
        const a = LogicMath.normalizeAngle360(Math.round(360 * i / n));
        _ring.push(
        {
            x: LogicMath.cos(a),
            y: LogicMath.sin(a)
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
    return length(p.x - sx, p.y - sy);
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
        const spd = length(vx, vy);
        const slow = (p.speed || 0) > 0 && p.speed < 1600;
        const lockPath = !!p.isBeam;
        const blob = !lockPath && !indirect && slow;
        const shotR = _ballR(p);
        const rad = shotR + bodyR + 60 + shotR * 0.45;
        const skipAlong = blob || indirect;
        let playerAlong = 0;
        if (!skipAlong && spd >= 1)
        {
            const heading = LogicMath.normalizeAngle180(LogicMath.getAngle(vx, vy));
            const frame = rotate(
            {
                x: myX - p.x,
                y: myY - p.y
            }, -heading);
            playerAlong = frame.x;
            if (playerAlong < -50) continue;
            const reachDir = normalize(
            {
                x: vx,
                y: vy
            }, Math.max(playerAlong, 0) | 0);
            const hitX = p.x + reachDir.x;
            const hitY = p.y + reachDir.y;
            if (!losCheck(p.x, p.y, hitX, hitY, BLOCKS_PROJECTILES)) continue;
        }
        const left = _lifeLeft(p);
        if (left <= 10) continue;
        const gap = distance(p.x, p.y, myX, myY) - bodyR - shotR;
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
    let minClear = Infinity;
    for (let i = 0; i < threats.length; i++)
    {
        const t = threats[i];
        const relx = t.x - myX;
        const rely = t.y - myY;
        const reach = distance(t.x, t.y, myX, myY);
        const spd = length(t.vx, t.vy);
        let maxT = TUNE.HORIZON_S;
        if (spd > 1) maxT = Math.min(maxT, (Math.max(0, t.left) + reach) / spd);
        const vrx = t.vx - mvx;
        const vry = t.vy - mvy;
        const vlen = length(vrx, vry);
        let dist;
        if (lengthSquared(vrx, vry) < 1)
        {
            dist = reach;
        }
        else
        {
            const heading = LogicMath.normalizeAngle180(LogicMath.getAngle(vrx, vry));
            const frame = rotate(
            {
                x: relx,
                y: rely
            }, -heading);
            const towards = -dot(relx, rely, vrx, vry);
            if (towards <= 0)
            {
                dist = reach;
            }
            else if (frame.x >= 0)
            {
                dist = reach;
            }
            else if (LogicMath.abs(frame.x) >= (maxT * vlen) | 0)
            {
                const end = normalize(
                {
                    x: vrx,
                    y: vry
                }, (maxT * vlen) | 0);
                dist = distance(t.x + end.x, t.y + end.y, myX, myY);
            }
            else
            {
                dist = LogicMath.getDistanceToLine(t.x, t.y, t.x + vrx, t.y + vry, myX, myY);
            }
        }
        const clear = dist - t.rad;
        if (clear < minClear) minClear = clear;
    }
    return minClear;
}

function _pathsHitMe(threats, px, py)
{
    for (let i = 0; i < threats.length; i++)
    {
        const t = threats[i];
        const vlen = length(t.vx, t.vy);
        const reach = distance(t.x, t.y, px, py);
        let span = TUNE.HORIZON_S;
        let endX = t.x;
        let endY = t.y;
        if (vlen > 1)
        {
            span = Math.min(span, (Math.max(0, t.left) + reach) / vlen);
            const end = normalize(
            {
                x: t.vx,
                y: t.vy
            }, (vlen * span) | 0);
            endX = t.x + end.x;
            endY = t.y + end.y;
        }
        if (segmentHitsCircle(t.x, t.y, endX, endY, px, py, t.rad + TUNE.ENGAGE))
        {
            return true;
        }
    }
    return false;
}

function _wallAhead(myX, myY, dir, speed, bodyR)
{
    const step = speed * TUNE.PROBE_T;
    let raw = 0;
    for (let s = 1; s <= TUNE.PROBE_N; s++)
    {
        const probe = normalize(
        {
            x: dir.x,
            y: dir.y
        }, (step * s) | 0);
        const px = myX + probe.x;
        const py = myY + probe.y;
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
        const dirSpeed = normalize(
        {
            x: d.x,
            y: d.y
        }, speed | 0);
        let s = _clearanceFor(hazards, myX, myY, dirSpeed.x, dirSpeed.y);
        s -= _wallAhead(myX, myY, d, speed, bodyR);
        if (prevDir)
        {
            const turn = LogicMath.getAngleBetween(LogicMath.getAngle(d.x, d.y), LogicMath.getAngle(prevDir.x, prevDir.y));
            s += TUNE.MOMENTUM * (180 - turn) / 180;
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
    const step = normalize(
    {
        x: chosen.x,
        y: chosen.y
    }, TUNE.REACH | 0);
    const tx = myX + step.x;
    const ty = myY + step.y;
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