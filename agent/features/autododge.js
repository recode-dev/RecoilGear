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
    state
}
from "../utils/flags.js";
import
{
    canonBrawlerName
}
from "../utils/brawlerName.js";
import
{
    fitOf,
    kindOf
}
from "../helpers/dodge_kinds.js";
import
{
    blocksLinear,
    noteBurstDeath,
    resetProfiles,
    shapeHazards
}
from "../helpers/dodge_profiles.js";
import
{
    BLOCKS_MOVEMENT,
    BLOCKS_PROJECTILES,
    getWallCacheH,
    getWallCacheW,
    isBlockedWide,
    losCheck,
    TILE_SIZE
}
from "../utils/wallCache.js";

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
        _skip = new Set();
        for (const name of opts.ignoredBrawlers)
        {
            const id = canonBrawlerName(name);
            if (id) _skip.add(id);
        }
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

function _kindReach(p, spec, spd)
{
    let r = spec && spec.maxRange > 0 ? spec.maxRange : 0;
    if (spec && spec.chargedRange > 0 && spd > 3500) r = spec.chargedRange;
    if (r <= 0 && p.castRange > 0) r = p.castRange;
    if (r <= 0) r = RANGE_FALLBACK;
    if (spec && spec.reachAdj) r += spec.reachAdj;
    if (r > 0 && r < 70000) return r;
    return RANGE_FALLBACK;
}

function _lifeLeft(p, spec, spd, nowMs)
{
    const maxR = _kindReach(p, spec, spd);
    if (spec && spec.fade)
    {
        const age = Math.max(0, nowMs - (p.spawnedAt || nowMs));
        return Math.max(0, maxR * (1 - age / 1000));
    }
    const flown = _traveled(p);
    return Math.max(0, maxR - flown);
}

function _segDist(px, py, ax, ay, bx, by)
{
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq < 1e-6 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function _inAware(myX, myY, hazard, zoneSq)
{
    if (hazard.segment)
    {
        const d = _segDist(myX, myY, hazard.segment.ax, hazard.segment.ay, hazard.segment.bx, hazard.segment.by);
        return d * d <= zoneSq;
    }
    const dx = hazard.x - myX;
    const dy = hazard.y - myY;
    return dx * dx + dy * dy <= zoneSq;
}

function _collectLive(myX, myY, myRadius, nowMs)
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
    const deaths = scanData.destroyed;
    if (deaths && deaths.length)
    {
        for (let d = 0; d < deaths.length; d++) noteBurstDeath(deaths[d]);
    }
    for (let i = 0; i < shots.length; i++)
    {
        const p = shots[i];
        if (!p) continue;
        const gid = p.gid;
        if (!gid) continue;
        live.add(gid);
        const owner = p.ownerName;
        if (owner && _skip.has(canonBrawlerName(owner) || owner)) _muted.add(gid);
        if (_muted.has(gid)) continue;
        const shaped = shapeHazards(p, nowMs);
        if (shaped)
        {
            for (let c = 0; c < shaped.length; c++)
            {
                const cap = shaped[c];
                const until = (cap.t1 - nowMs) / 1e3;
                if (until <= 0) continue;
                const hazard = {
                    rad: cap.radius + bodyR,
                    until,
                    name: p.name || cap.name || ""
                };
                if (cap.ax === void 0)
                {
                    hazard.x = cap.x;
                    hazard.y = cap.y;
                    hazard.vx = 0;
                    hazard.vy = 0;
                }
                else
                {
                    hazard.segment = cap;
                }
                if (_inAware(myX, myY, hazard, zoneSq)) out.push(hazard);
            }
        }
        if (shaped && blocksLinear(p.name)) continue;
        const name = p.name || "";
        const spec = kindOf(name);
        if (spec && spec.drop) continue;
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
        const flown = _traveled(p);
        if (spec && spec.lockPath && flown > 120 && isFinite(p.spawnX) && isFinite(p.spawnY))
        {
            vx = (p.x - p.spawnX) / flown * (p.speed || 1);
            vy = (p.y - p.spawnY) / flown * (p.speed || 1);
        }
        let spd = Math.hypot(vx, vy);
        if (spec && spec.speedMul > 0 && spd > 3500)
        {
            vx *= spec.speedMul;
            vy *= spec.speedMul;
            spd *= spec.speedMul;
        }
        const slow = (p.speed || 0) > 0 && p.speed < 1600;
        const lockPath = !!(spec && spec.lockPath) || !!p.isBeam;
        const blob = !!(spec && spec.blob) || (!lockPath && !indirect && slow);
        const fit = fitOf(name);
        const growR = spec && spec.growR || 0;
        const shotR = _ballR(p) + growR;
        const rad = shotR + bodyR + fit.pad + shotR * fit.grow;
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
        const left = _lifeLeft(p, spec, spd, nowMs);
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
            left,
            name
        });
    }
    for (const k of _muted)
    {
        if (!live.has(k)) _muted.delete(k);
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
        if (t.segment)
        {
            const maxT = t.until > 0 ? Math.min(horizon, t.until) : horizon;
            for (let step = 0; step <= 4; step++)
            {
                const ts = maxT * (step / 4);
                const d = _segDist(myX + mvx * ts, myY + mvy * ts, t.segment.ax, t.segment.ay, t.segment.bx, t.segment.by) - t.rad;
                if (d < minClear) minClear = d;
            }
            continue;
        }
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

export function clampMoveTarget(tx, ty)
{
    return _clampTarget(tx, ty);
}

export function sendBattleMove(logic, tx, ty)
{
    return _sendMove(logic, tx, ty);
}

function _clampToMap(v, maxTiles)
{
    const max = maxTiles * TILE_SIZE - 1;
    if (max <= 0) return v;
    if (v < 0) return 0;
    if (v > max) return max;
    return v;
}

function _clampTarget(tx, ty)
{
    const w = getWallCacheW();
    const h = getWallCacheH();
    if (w <= 0 || h <= 0) return {
        x: tx,
        y: ty
    };
    return {
        x: _clampToMap(tx, w),
        y: _clampToMap(ty, h)
    };
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
    if (!state.autododge) return;
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
    const hazards = _collectLive(myX, myY, myRadius, now);
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
    resetProfiles();
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