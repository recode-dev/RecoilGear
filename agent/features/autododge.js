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
    firstWallHit,
    isBlockedWide,
    losCheck
}
from "../utils/walls.js";

const DEG = 90;
const HALF = 180;
const FULL = 360;
const MAXI = 0x7fffffff;
const GUARD = 0xb504;

const SIN = new Int32Array(91);
for (let i = 0; i <= DEG; i++) SIN[i] = Math.round(Math.sin(i * Math.PI / 180) * 1024);

const ATAN = new Int32Array(129);
for (let i = 0; i <= 128; i++) ATAN[i] = Math.round(Math.atan(i / 128) * 180 / Math.PI);

const idiv = (a, b) => Math.trunc(a / b);
const wrap360 = (a) => { const r = a % FULL; return r < 0 ? r + FULL : r; };
const shift10 = (v) => (v >= 0 ? v + 1023 : v) >> 10;
const atanIdx = (num, den) => idiv(num << 7, den);

function sinScaled(angle)
{
    const r = wrap360(angle);
    if (r < HALF)
    {
        const i = r < 91 ? r : HALF - r;
        return SIN[i];
    }
    const i = r - HALF < 91 ? r - HALF : FULL - r;
    return -SIN[i];
}

const LogicMath = {
    abs: (v) => (v < 0 ? -v : v),

    min: (a, b) => (a < b ? a : b),

    max: (a, b) => (a > b ? a : b),

    clamp: (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v)),

    sqrt: (v) =>
    {
        if (v <= 0) return 0;
        if (v >= MAXI) return 46340;
        return Math.floor(Math.sqrt(v));
    },

    sin: (angle) => sinScaled(angle),
    cos: (angle) => sinScaled(angle + DEG),

    getRotatedX: (x, y, angle) => shift10(sinScaled(angle + DEG) * x - sinScaled(angle) * y),
    getRotatedY: (x, y, angle) => shift10(sinScaled(angle) * x + sinScaled(angle + DEG) * y),

    getAngle: (dx, dy) =>
    {
        if (dx === 0 && dy === 0) return 0;
        if (dx > 0 && dy >= 0)
        {
            if (dy < dx) return ATAN[atanIdx(dy, dx)];
            return DEG - ATAN[atanIdx(dx, dy)];
        }
        const ax = dx < 0 ? -dx : dx;
        const ay = dy < 0 ? -dy : dy;
        if (dx <= 0 && dy > 0)
        {
            if (ax < dy) return ATAN[atanIdx(ax, dy)] + DEG;
            return HALF - ATAN[atanIdx(dy, ax)];
        }
        if (dx < 0 && dy <= 0)
        {
            if (ay < ax) return ATAN[atanIdx(ay, ax)] + HALF;
            if (ay !== 0) return 270 - ATAN[atanIdx(ax, ay)];
        }
        else
        {
            if (ax < ay) return ATAN[atanIdx(ax, ay)] + 270;
            if (ax !== 0) return wrap360(FULL - ATAN[atanIdx(ay, ax)]);
        }
        return 0;
    },

    normalizeAngle360: (a) => wrap360(a),

    normalizeAngle180: (a) =>
    {
        const r = wrap360(a);
        return r < HALF ? r : r - FULL;
    },

    getAngleBetween: (a, b) => LogicMath.abs(LogicMath.normalizeAngle180(a - b)),

    mulDiv: (a, b, c) => (c === 0 ? 0 : Number((BigInt(Math.trunc(a)) * BigInt(Math.trunc(b))) / BigInt(Math.trunc(c)))),

    getDistanceSquareToLine: (ax, ay, bx, by, px, py) =>
    {
        ax = ax | 0; ay = ay | 0; bx = bx | 0; by = by | 0; px = px | 0; py = py | 0;
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        const rx = px - ax;
        const ry = py - ay;
        if (lenSq === 0) return rx * rx + ry * ry;
        const dot = rx * dx + ry * dy;
        if (dot < 1) return rx * rx + ry * ry;
        if (dot < lenSq) return (rx * rx + ry * ry) - LogicMath.mulDiv(dot, dot, lenSq);
        const ex = px - bx;
        const ey = py - by;
        return ex * ex + ey * ey;
    },

    getDistanceToLine: (ax, ay, bx, by, px, py) =>
        LogicMath.sqrt(LogicMath.getDistanceSquareToLine(ax, ay, bx, by, px, py)),
};

function length(x, y)
{
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return 46340;
    const s = x * x + y * y;
    return s < 0 ? 46340 : LogicMath.sqrt(s);
}

function lengthSquared(x, y)
{
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return MAXI;
    const s = x * x + y * y;
    return s < 0 ? MAXI : s;
}

function distance(x1, y1, x2, y2)
{
    return length(x2 - x1, y2 - y1);
}

function distanceSquared(x1, y1, x2, y2)
{
    return lengthSquared(x2 - x1, y2 - y1);
}

function segmentHitAlong(x1, y1, x2, y2, x3, y3, x4, y4)
{
    const ax = x2 - x1;
    const ay = y2 - y1;
    const bx = x4 - x3;
    const by = y4 - y3;
    const den = ax * by - ay * bx;
    if (den === 0) return -1;
    const ta = ((x3 - x1) * by - (y3 - y1) * bx) / den;
    const tb = ((x3 - x1) * ay - (y3 - y1) * ax) / den;
    if (ta < 0 || ta > 1 || tb < 0 || tb > 1) return -1;
    return ta * length(ax, ay);
}

function dot(ax, ay, bx, by)
{
    return ax * bx + ay * by;
}

function normalize(vec, scale)
{
    const len = length(vec.x, vec.y);
    if (len === 0) return vec;
    vec.x = idiv(vec.x * scale, len);
    vec.y = idiv(vec.y * scale, len);
    return vec;
}

function rotate(vec, angle)
{
    const x = LogicMath.getRotatedX(vec.x, vec.y, angle);
    const y = LogicMath.getRotatedY(vec.x, vec.y, angle);
    vec.x = x;
    vec.y = y;
    return vec;
}

function segmentHitsCircle(x1, y1, x2, y2, cx, cy, radius)
{
    return LogicMath.getDistanceSquareToLine(x1, y1, x2, y2, cx, cy) <= radius * radius;
}

const MOVE_INPUT_TYPE = 2;

const TUNE = {
    AWARE: 3200,
    DIR_COUNT: 40,
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
    MIN_POS: 50,
    CROSS_W: 300
};

let _heading = null;
let _headingIdx = -1;
let _holdUntil = 0;
let _lastDangerTs = 0;
let _lastSentX = 1e9;
let _lastSentY = 1e9;
let _lastSentAt = 0;
const _ring = [];
const _options = {
    reactionSpeed: 100,
    directionPrecision: 40,
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
    const toTarget = p.hasTarget ? distance(p.x, p.y, p.targetX, p.targetY) : Infinity;
    if (!(p.castRange > 0)) return toTarget;
    const flown = _traveled(p);
    return Math.max(0, LogicMath.min(p.castRange - flown, toTarget));
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
        if (distanceSquared(p.x, p.y, myX, myY) > zoneSq) continue;
        const indirect = !!p.isIndirect;
        let vx = p.vx;
        let vy = p.vy;
        if (!isFinite(vx) || !isFinite(vy))
        {
            vx = 0;
            vy = 0;
        }
        let spd = length(vx, vy);
        if (spd < 1 && p.hasTarget)
        {
            const dir = normalize(
            {
                x: p.targetX - p.x,
                y: p.targetY - p.y
            }, 1000);
            const shotSpeed = p.speed > 0 ? p.speed : 0;
            vx = dir.x / 1000 * shotSpeed;
            vy = dir.y / 1000 * shotSpeed;
            spd = length(vx, vy);
        }
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
            const hitX = p.hasTarget ? p.targetX : p.x + reachDir.x;
            const hitY = p.hasTarget ? p.targetY : p.y + reachDir.y;
            if (!p.passesEnv && !p.piercesEnv && !losCheck(p.x, p.y, hitX, hitY, BLOCKS_PROJECTILES)) continue;
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
        if (spd > 1) maxT = LogicMath.clamp((LogicMath.max(0, t.left) + reach) / spd, 0, maxT);
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
        minClear = LogicMath.min(minClear, dist - t.rad);
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
            span = LogicMath.clamp((LogicMath.max(0, t.left) + reach) / vlen, 0, span);
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

function _threatPaths(threats, px, py)
{
    const out = [];
    for (let i = 0; i < threats.length; i++)
    {
        const t = threats[i];
        const vlen = length(t.vx, t.vy);
        if (vlen < 1) continue;
        const reach = distance(t.x, t.y, px, py);
        const span = LogicMath.clamp((LogicMath.max(0, t.left) + reach) / vlen, 0, TUNE.HORIZON_S);
        const end = normalize(
        {
            x: t.vx,
            y: t.vy
        }, (vlen * span) | 0);
        out.push(
        {
            x1: t.x,
            y1: t.y,
            x2: t.x + end.x,
            y2: t.y + end.y
        });
    }
    return out;
}

function _crossesPath(paths, px, py, stepX, stepY)
{
    const tx = px + stepX;
    const ty = py + stepY;
    for (let i = 0; i < paths.length; i++)
    {
        const p = paths[i];
        if (segmentHitAlong(px, py, tx, ty, p.x1, p.y1, p.x2, p.y2) >= 0) return true;
    }
    return false;
}

function _wallAhead(myX, myY, dir, speed, bodyR)
{
    const reach = speed * TUNE.PROBE_T * TUNE.PROBE_N;
    const step = normalize(
    {
        x: dir.x,
        y: dir.y
    }, reach | 0);
    const hit = firstWallHit(myX, myY, myX + step.x, myY + step.y);
    if (hit >= 0)
    {
        if (hit >= reach) return 0;
        const room = LogicMath.clamp(hit / reach, 0, 1);
        return TUNE.WALL_HIT * (1 - room) * TUNE.PROBE_N;
    }
    let raw = 0;
    for (let s = 1; s <= TUNE.PROBE_N; s++)
    {
        const probe = normalize(
        {
            x: dir.x,
            y: dir.y
        }, (speed * TUNE.PROBE_T * s) | 0);
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
    const paths = _threatPaths(hazards, myX, myY);
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
        if (_crossesPath(paths, myX, myY, dirSpeed.x, dirSpeed.y)) s -= TUNE.CROSS_W;
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