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
    logWarn
}
from "../utils/logger.js";
import
{
    K_BLOB,
    K_DROP,
    K_FADE,
    K_LOCKPATH,
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
    TILE_SIZE,
    getWallCacheH,
    getWallCacheW,
    isBlockedAt,
    isBlockedWide,
    losCheck,
    traceWallHit
}
from "../utils/wallCache.js";

const MOVE_INPUT_TYPE = 2;

const DODGE_CHAR_SPEED = 720;
const DODGE_SPEED_MIN = 300;
const DODGE_SPEED_MAX = 8500;

const AD_AWARE = 3200;
const AD_FALLBACK_RANGE = 2800;
const AD_DIR_COUNT = 64;
const AD_SKIN = 50;
const AD_SPAWN_MARGIN = 60;
const AD_REACH = 600;
const AD_TICK_MS = 16;
const AD_TICK_MAX_MS = 250;
const AD_WALL_BODY = 240;
const AD_HAZARD_MAX = 96;
const AD_CAP_MAX = 16;

const BD_SAFETY_MARGIN = 28;
const BD_T_FIELD = 1.8;
const BD_THREAT_MAX = 160;

const BDC_EXTRA = 12;
const BDC_DANGER = 1000000;
const BDC_T_FIELD = 2.4;
const BDC_T_URGENT = 0.9;
const BDC_KEEP = 0.15;
const BDC_KEEP_IMPACT = 0.9;
const BDC_TIE = 1.05;
const BDC_WALL_HIT = 200000;
const BDC_WALL_BAND = 170;
const BDC_WALL_PROBE = 3;
const BDC_EXTRA_BLEND = 120;
const BDC_HIT_GATE = 1.15;
const BDC_FAR = 1.0e18;
const BDC_EPS = 1;
const BDC_DIR_MAX = AD_DIR_COUNT + BDC_EXTRA;

const PROJ_RADIUS_DEFAULT = 150;
const OWN_RADIUS_MIN = 40;
const OWN_RADIUS_MAX = 200;

var _ring = [];
var _dirBuilt = false;

var _hazards = [];
var _hazardN = 0;

var _threats = [];
var _threatN = 0;

var _bdcDirs = [];
var _bdcScores = [];
var _bdcImpacts = [];
var _bdcSel = [];
var _bdcSelN = 0;
var _bdcLastX = 0;
var _bdcLastY = 0;
var _bdcHaveLast = false;

var _lastTick = 0;

function _ok(v, lo, hi)
{
    return v >= lo && v <= hi;
}

function _nowMs()
{
    return Date.now();
}

function _buildRing()
{
    if (_dirBuilt) return;
    for (let i = 0; i < AD_DIR_COUNT; i++)
    {
        const a = Math.PI * 2 * i / AD_DIR_COUNT;
        _ring.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    for (let i = 0; i < BDC_DIR_MAX; i++)
    {
        _bdcDirs.push({ x: 0, y: 0 });
        _bdcScores.push(0);
        _bdcImpacts.push(0);
    }
    for (let i = 0; i < BD_THREAT_MAX; i++)
    {
        _bdcSel.push(0);
        _threats.push({ x: 0, y: 0, vx: 0, vy: 0, rad: 0 });
    }
    for (let i = 0; i < AD_HAZARD_MAX; i++)
    {
        _hazards.push({
            x: 0, y: 0, vx: 0, vy: 0, rad: 0, age: 0,
            fadeBase: 0, fadeK: 0, ax: 0, ay: 0, bx: 0, by: 0,
            hasSegment: false, name: null
        });
    }
    _dirBuilt = true;
}

function _speed()
{
    const s = scanData.mySpeed | 0;
    if (s < DODGE_SPEED_MIN || s > DODGE_SPEED_MAX) return DODGE_CHAR_SPEED;
    return s;
}

function _ownRadius()
{
    const r = scanData.myRadius;
    if (r > 1)
    {
        if (r > OWN_RADIUS_MAX) return OWN_RADIUS_MAX;
        if (r < OWN_RADIUS_MIN) return OWN_RADIUS_MIN;
        return r;
    }
    return 120;
}

function _projectileVel(p)
{
    if (!p || !p.hasVelocitySample) return null;
    let dt = p.lastTs && p.spawnedAt ? _nowMs() - p.lastTs : 0;
    if (!(dt >= AD_TICK_MS && dt <= AD_TICK_MAX_MS)) dt = AD_TICK_MS;
    return {
        vx: (p.x - p.lastX) * 1000 / dt,
        vy: (p.y - p.lastY) * 1000 / dt
    };
}

function _ballRadius(p)
{
    return p.radius > 0 ? p.radius : PROJ_RADIUS_DEFAULT;
}

function _traveled(p)
{
    if (!p.spawnX && !p.spawnY) return 0;
    const dx = p.x - p.spawnX;
    const dy = p.y - p.spawnY;
    return Math.sqrt(dx * dx + dy * dy);
}

function _isMine(p)
{
    const team = p.ownerTeam | 0;
    if (team < 0) return false;
    return team === (scanData.myTeamId | 0);
}

function _myShot(p, mx, my, bodyR)
{
    if (!p.spawnX && !p.spawnY) return false;
    const sx = p.spawnX - mx;
    const sy = p.spawnY - my;
    const nx = p.x - mx;
    const ny = p.y - my;
    const dSpawn = sx * sx + sy * sy;
    const dNow = nx * nx + ny * ny;
    const r = bodyR + AD_SPAWN_MARGIN;
    if (dSpawn > r * r) return false;
    return dNow > dSpawn;
}

function _shielded(p, mx, my)
{
    const dx = p.x - mx;
    const dy = p.y - my;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= 1) return false;
    if (isBlockedAt(mx, my, BLOCKS_PROJECTILES)) return false;
    return traceWallHit(mx, my, dx / d, dy / d, d, BLOCKS_PROJECTILES) < d;
}

function _segDist(px, py, ax, ay, bx, by)
{
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq < 0.000001 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = px - (ax + dx * t);
    const cy = py - (ay + dy * t);
    return Math.sqrt(cx * cx + cy * cy);
}

function _fadeVel(h, dt, out)
{
    let vx = h.vx;
    let vy = h.vy;
    if (h.fadeBase && h.fadeK)
    {
        const nowAge = h.age > 0 ? h.age : 0;
        const laterAge = nowAge + dt * 1000;
        const cur = h.fadeBase * Math.exp(h.fadeK * nowAge);
        const nxt = h.fadeBase * Math.exp(h.fadeK * laterAge);
        if (cur > 0.000001)
        {
            const r = nxt / cur;
            vx *= r;
            vy *= r;
        }
    }
    out.vx = vx;
    out.vy = vy;
    return out;
}

function _inAware(h, mx, my, zoneSq)
{
    if (h.hasSegment)
    {
        const d = _segDist(mx, my, h.ax, h.ay, h.bx, h.by);
        return d * d <= zoneSq;
    }
    const dx = h.x - mx;
    const dy = h.y - my;
    return dx * dx + dy * dy <= zoneSq;
}

function _kindReach(p, spec, spd)
{
    let r = 0;
    if (spec && spec.maxRange > 0) r = spec.maxRange;
    if (spec && spec.chargedRange > 0 && spd > 3500) r = spec.chargedRange;
    if (r <= 0 && p.castRange > 0) r = p.castRange;
    if (r <= 0 && p.isThrower && (p.targetX || p.targetY) && p.spawnX && p.spawnY)
    {
        const dx = p.targetX - p.spawnX;
        const dy = p.targetY - p.spawnY;
        const td = Math.sqrt(dx * dx + dy * dy);
        if (td > 0) r = td;
    }
    if (r <= 0) r = AD_FALLBACK_RANGE;
    if (spec && spec.reachAdj) r += spec.reachAdj;
    if (r > 0 && r < 70000) return r;
    return AD_FALLBACK_RANGE;
}

function _lifeLeft(p, spec, spd, nowMs)
{
    const maxR = _kindReach(p, spec, spd);
    if (spec && (spec.flags & K_FADE))
    {
        const spawned = p.spawnedAt ? p.spawnedAt : nowMs;
        let age = nowMs - spawned;
        if (age < 0) age = 0;
        const left = maxR * (1 - age / 1000);
        return left > 0 ? left : 0;
    }
    const left = maxR - _traveled(p);
    return left > 0 ? left : 0;
}

function _pushHazard()
{
    const h = _hazards[_hazardN];
    h.x = 0; h.y = 0; h.vx = 0; h.vy = 0; h.rad = 0; h.age = 0;
    h.fadeBase = 0; h.fadeK = 0; h.ax = 0; h.ay = 0; h.bx = 0; h.by = 0;
    h.hasSegment = false; h.name = null;
    _hazardN++;
    return h;
}

function _collect(mx, my, myRadius, nowMs)
{
    const zoneSq = AD_AWARE * AD_AWARE;
    const bodyR = myRadius + AD_SKIN;
    const list = scanData.projectiles || [];

    _hazardN = 0;

    for (let i = 0; i < list.length && i < 16; i++)
    {
        const p = list[i];
        if (!p) continue;
        if (_isMine(p)) continue;
        if (_myShot(p, mx, my, bodyR)) continue;
        if (_shielded(p, mx, my)) continue;

        const caps = shapeHazards(p, nowMs);
        for (let c = 0; c < caps.length && c < AD_CAP_MAX; c++)
        {
            const cap = caps[c];
            const until = (cap.t1 - nowMs) / 1000;
            if (until <= 0) continue;
            if (_hazardN >= AD_HAZARD_MAX) break;
            const h = _pushHazard();
            h.rad = cap.radius;
            h.hasSegment = !!cap.hasSegment;
            h.name = p.name || cap.name;
            if (cap.hasSegment)
            {
                h.ax = cap.ax; h.ay = cap.ay; h.bx = cap.bx; h.by = cap.by;
            }
            else
            {
                h.x = cap.x; h.y = cap.y;
            }
            if (!_inAware(h, mx, my, zoneSq)) _hazardN--;
        }

        if (caps.length > 0 && blocksLinear(p.name)) continue;

        const name = p.name || "";
        const spec = kindOf(name);
        if (spec && (spec.flags & K_DROP)) continue;

        const dx = p.x - mx;
        const dy = p.y - my;
        if (dx * dx + dy * dy > zoneSq) continue;

        let vx = p.vx || 0;
        let vy = p.vy || 0;
        if (vx === 0 && vy === 0)
        {
            const est = _projectileVel(p);
            if (est)
            {
                vx = est.vx;
                vy = est.vy;
            }
            else
            {
                vx = 0;
                vy = 0;
            }
        }
        if (!_ok(vx, -1e8, 1e8) || !_ok(vy, -1e8, 1e8))
        {
            vx = 0;
            vy = 0;
        }

        const flown = _traveled(p);
        if (spec && (spec.flags & K_LOCKPATH) && flown > 120 && p.spawnX && p.spawnY)
        {
            let base = Math.sqrt(vx * vx + vy * vy);
            if (base < 1) base = 1;
            vx = (p.x - p.spawnX) / flown * base;
            vy = (p.y - p.spawnY) / flown * base;
        }

        let spd = Math.sqrt(vx * vx + vy * vy);
        if (spec && spec.speedMul > 0 && spd > 3500)
        {
            vx *= spec.speedMul;
            vy *= spec.speedMul;
            spd *= spec.speedMul;
        }

        const lockPath = !!(spec && (spec.flags & K_LOCKPATH)) || !!p.isBeam;
        const blob = !!(spec && (spec.flags & K_BLOB)) || (!lockPath && !!p.isThrower);
        const fit = fitOf(name);
        const shotR = _ballRadius(p) + (spec ? (spec.growR | 0) : 0);
        const rad = shotR + fit.pad + shotR * fit.grow;

        let ux = 0;
        let uy = 0;
        if (spd >= 1)
        {
            ux = vx / spd;
            uy = vy / spd;
        }

        let playerAlong = 0;
        if (!blob && spd >= 1)
        {
            playerAlong = (mx - p.x) * ux + (my - p.y) * uy;
            if (playerAlong < -50) continue;
            if (!p.isThrower)
            {
                const tHit = playerAlong > 0 ? playerAlong : 0;
                const hitX = p.x + ux * tHit;
                const hitY = p.y + uy * tHit;
                if (!losCheck(p.x, p.y, hitX, hitY, BLOCKS_PROJECTILES)) continue;
            }
        }

        const left = _lifeLeft(p, spec, spd, nowMs);
        if (left <= 10) continue;

        const gap = Math.sqrt(dx * dx + dy * dy) - bodyR - shotR;
        if (left < 0.85 * (gap > 0 ? gap : 0)) continue;
        if (!blob && spd >= 1 && playerAlong > left + shotR) continue;
        if (_hazardN >= AD_HAZARD_MAX) break;

        const h = _pushHazard();
        h.x = p.x;
        h.y = p.y;
        h.vx = vx;
        h.vy = vy;
        h.rad = rad;
        h.name = p.name;
        h.age = (spec && (spec.flags & K_FADE))
            ? nowMs - (p.spawnedAt ? p.spawnedAt : nowMs)
            : 0;
        if (h.age < 0) h.age = 0;
        h.fadeBase = spec ? spec.fadeBase : 0;
        h.fadeK = spec ? spec.fadeK : 0;
    }
}

function _bdPush(x, y, vx, vy, rad)
{
    if (_threatN >= BD_THREAT_MAX) return;
    const t = _threats[_threatN];
    t.x = x;
    t.y = y;
    t.vx = vx;
    t.vy = vy;
    t.rad = rad;
    _threatN++;
}

function _bdBuildThreats()
{
    const vel = { vx: 0, vy: 0 };
    _threatN = 0;
    for (let i = 0; i < _hazardN; i++)
    {
        const h = _hazards[i];
        if (h.hasSegment)
        {
            _bdPush(h.ax, h.ay, 0, 0, h.rad);
            _bdPush(h.bx, h.by, 0, 0, h.rad);
            continue;
        }
        _fadeVel(h, 0, vel);
        _bdPush(h.x, h.y, vel.vx, vel.vy, h.rad);
    }
}

function _bdDanger(mx, my, myR)
{
    for (let i = 0; i < _threatN; i++)
    {
        const p = _threats[i];
        const r = myR + p.rad + BD_SAFETY_MARGIN * 2.5;
        const dx = mx - p.x;
        const dy = my - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= r * r) return true;
        const c1 = dx * p.vx + dy * p.vy;
        if (c1 <= 0) continue;
        const c2 = p.vx * p.vx + p.vy * p.vy;
        if (c2 <= 0) continue;
        const tHit = c1 / c2;
        if (tHit > BD_T_FIELD) continue;
        const cx = p.x + p.vx * tHit;
        const cy = p.y + p.vy * tHit;
        if ((mx - cx) * (mx - cx) + (my - cy) * (my - cy) <= r * r) return true;
    }
    return false;
}

function _clampToMap(v, maxTiles)
{
    const maxV = maxTiles * TILE_SIZE - 1;
    if (maxV <= 0) return v;
    if (v < 0) return 0;
    if (v > maxV) return maxV;
    return v;
}

function _sendMove(tx, ty)
{
    const w = getWallCacheW();
    const h = getWallCacheH();
    if (w > 0 && h > 0)
    {
        tx = _clampToMap(tx, w);
        ty = _clampToMap(ty, h);
    }
    const battle = scanData.battleModeClient;
    if (!battle || battle.isNull()) return false;
    try
    {
        const fns = getFunctions();
        const ix = Math.round(tx);
        const iy = Math.round(ty);
        fns.LogicBattleModeClient_setClientPredictionMoveTo(battle, ix, iy, 1);
        return sendCommand(MOVE_INPUT_TYPE, (ci) =>
        {
            ci.add(offsets.ClientInput_x).writeS32(ix);
            ci.add(offsets.ClientInput_y).writeS32(iy);
        });
    }
    catch (e)
    {
        logWarn("autododge send failed", { err: String(e && e.message || e) });
        return false;
    }
}

function _bdcForget()
{
    _bdcHaveLast = false;
    _bdcLastX = 0;
    _bdcLastY = 0;
}

function _bdcAimedOne(p, mx, my, myR)
{
    const r = myR + p.rad + BD_SAFETY_MARGIN;
    const vx = p.vx;
    const vy = p.vy;
    const px = p.x - mx;
    const py = p.y - my;
    const a = vx * vx + vy * vy;
    const b = 2 * (px * vx + py * vy);
    const c = px * px + py * py;
    let minD2 = c;
    if (a > 0.000001)
    {
        let tm = -b / (2 * a);
        if (tm < 0) tm = 0;
        if (tm > BDC_T_FIELD) tm = BDC_T_FIELD;
        minD2 = c + b * tm + a * tm * tm;
    }
    const gate = r * BDC_HIT_GATE;
    return minD2 <= gate * gate;
}

function _bdcWallCost(mx, my, dx, dy)
{
    let raw = 0;
    for (let s = 1; s <= BDC_WALL_PROBE; s++)
    {
        const d = BDC_WALL_BAND * s / BDC_WALL_PROBE;
        if (isBlockedWide(mx + dx * d, my + dy * d, AD_WALL_BODY, BLOCKS_MOVEMENT))
        {
            raw += BDC_WALL_HIT * (BDC_WALL_PROBE - s + 1);
        }
    }
    return raw;
}

function _bdcScoreDir(dx, dy, mx, my, myR, speed)
{
    let score = 0;
    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        const r = myR + p.rad + BD_SAFETY_MARGIN;
        const vx = p.vx - dx * speed;
        const vy = p.vy - dy * speed;
        const px = p.x - mx;
        const py = p.y - my;
        const a = vx * vx + vy * vy;
        const b = 2 * (px * vx + py * vy);
        const c = px * px + py * py;
        let minD2 = c;
        if (a > 0.000001)
        {
            let tm = -b / (2 * a);
            if (tm < 0) tm = 0;
            if (tm > BDC_T_FIELD) tm = BDC_T_FIELD;
            minD2 = c + b * tm + a * tm * tm;
        }
        if (minD2 < BDC_EPS) minD2 = BDC_EPS;
        score += BDC_DANGER * (r * r) / minD2;
    }
    return score;
}

function _bdcImpactDir(dx, dy, mx, my, myR, speed)
{
    let best = BDC_FAR;
    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        const r = myR + p.rad + BD_SAFETY_MARGIN;
        const vx = p.vx - dx * speed;
        const vy = p.vy - dy * speed;
        const px = p.x - mx;
        const py = p.y - my;
        const a = vx * vx + vy * vy;
        const b = 2 * (px * vx + py * vy);
        const c = px * px + py * py - r * r;
        if (c < 0) return 0;
        if (a > 0.000001)
        {
            const disc = b * b - 4 * a * c;
            if (disc >= 0)
            {
                const t1 = (-b - Math.sqrt(disc)) / (2 * a);
                if (t1 > 0 && t1 < best) best = t1;
            }
        }
    }
    return best;
}

function _bdcThreatD2(k, mx, my)
{
    const p = _threats[_bdcSel[k]];
    const dx = p.x - mx;
    const dy = p.y - my;
    return dx * dx + dy * dy;
}

function _bdcExtraDirs(mx, my)
{
    let first = -1;
    let second = -1;
    let at = AD_DIR_COUNT;

    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        const dx = p.x - mx;
        const dy = p.y - my;
        const d2 = dx * dx + dy * dy;
        if (first < 0)
        {
            first = i;
            continue;
        }
        const f2 = _bdcThreatD2(first, mx, my);
        if (d2 < f2)
        {
            second = first;
            first = i;
            continue;
        }
        if (second < 0)
        {
            second = i;
            continue;
        }
        const s2 = _bdcThreatD2(second, mx, my);
        if (d2 < s2) second = i;
    }

    for (let j = 0; j < 2; j++)
    {
        const k = j === 0 ? first : second;
        if (k < 0 || at + 3 > BDC_DIR_MAX) continue;
        const p = _threats[_bdcSel[k]];
        let pxv = -p.vy;
        let pyv = p.vx;
        let len = Math.sqrt(pxv * pxv + pyv * pyv);
        if (len < 0.000001) continue;
        const px = pxv / len;
        const py = pyv / len;
        _bdcDirs[at].x = px;
        _bdcDirs[at].y = py;
        _bdcDirs[at + 1].x = -px;
        _bdcDirs[at + 1].y = -py;
        pxv = (mx - p.x) + px * BDC_EXTRA_BLEND;
        pyv = (my - p.y) + py * BDC_EXTRA_BLEND;
        len = Math.sqrt(pxv * pxv + pyv * pyv);
        if (len < 0.000001)
        {
            pxv = -px;
            pyv = -py;
            len = 1;
        }
        _bdcDirs[at + 2].x = pxv / len;
        _bdcDirs[at + 2].y = pyv / len;
        at += 3;
    }

    return at - AD_DIR_COUNT;
}

function _bdcPick(mx, my, myR, ix, iy, speed)
{
    let rx = ix;
    let ry = iy;
    let hasRef = ix !== 0 || iy !== 0;
    let best = 0;
    let cand;
    let leastBad = false;
    let bestScore = BDC_FAR;
    let impactBest;
    let fence;
    let tBest;

    for (let i = 0; i < AD_DIR_COUNT; i++)
    {
        _bdcDirs[i].x = _ring[i].x;
        _bdcDirs[i].y = _ring[i].y;
    }

    _bdcSelN = 0;
    for (let i = 0; i < _threatN; i++)
    {
        if (_bdcAimedOne(_threats[i], mx, my, myR))
        {
            _bdcSel[_bdcSelN] = i;
            _bdcSelN++;
        }
    }

    if (_bdcSelN === 0)
    {
        let ox;
        let oy;
        if (!hasRef && _threatN > 0)
        {
            let nearest = 0;
            let nd = BDC_FAR;
            for (let i = 0; i < _threatN; i++)
            {
                const dx = _threats[i].x - mx;
                const dy = _threats[i].y - my;
                const d2 = dx * dx + dy * dy;
                if (d2 < nd)
                {
                    nd = d2;
                    nearest = i;
                }
            }
            rx = mx - _threats[nearest].x;
            ry = my - _threats[nearest].y;
            hasRef = true;
        }
        if (hasRef && (rx !== 0 || ry !== 0))
        {
            const len = Math.sqrt(rx * rx + ry * ry);
            ox = rx / len;
            oy = ry / len;
        }
        else if (_bdcHaveLast)
        {
            ox = _bdcLastX;
            oy = _bdcLastY;
        }
        else
        {
            ox = 0;
            oy = 0;
        }
        _bdcLastX = ox;
        _bdcLastY = oy;
        _bdcHaveLast = true;
        if (_threatN > 0 && (ox !== 0 || oy !== 0))
        {
            let nearest = 0;
            let nd = BDC_FAR;
            for (let i = 0; i < _threatN; i++)
            {
                const dx = _threats[i].x - mx;
                const dy = _threats[i].y - my;
                const d2 = dx * dx + dy * dy;
                if (d2 < nd)
                {
                    nd = d2;
                    nearest = i;
                }
            }
            const tdx = _threats[nearest].x - mx;
            const tdy = _threats[nearest].y - my;
            const tl = Math.sqrt(tdx * tdx + tdy * tdy);
            if (tl > 0.001 && (ox * tdx + oy * tdy) / tl > 0.9)
            {
                const px = -tdy / tl;
                const py = tdx / tl;
                if (ox * px + oy * py >= 0)
                {
                    ox = px;
                    oy = py;
                }
                else
                {
                    ox = -px;
                    oy = -py;
                }
            }
        }
        return { x: ox, y: oy };
    }

    const count = AD_DIR_COUNT + _bdcExtraDirs(mx, my);

    for (let i = 0; i < count; i++)
    {
        const d = _bdcDirs[i];
        _bdcScores[i] = _bdcScoreDir(d.x, d.y, mx, my, myR, speed) + _bdcWallCost(mx, my, d.x, d.y);
        _bdcImpacts[i] = _bdcImpactDir(d.x, d.y, mx, my, myR, speed);
        if (_bdcScores[i] < bestScore)
        {
            bestScore = _bdcScores[i];
            best = i;
        }
    }

    cand = best;
    impactBest = _bdcImpacts[best];

    if (_bdcHaveLast && best < AD_DIR_COUNT)
    {
        let pi = 0;
        let a = Math.atan2(_bdcLastY, _bdcLastX);
        const len = Math.sqrt(_bdcLastX * _bdcLastX + _bdcLastY * _bdcLastY);
        if (len > 0.000001)
        {
            if (a < 0) a += Math.PI * 2;
            pi = Math.round(a / (Math.PI * 2) * AD_DIR_COUNT);
            if (pi >= AD_DIR_COUNT) pi = 0;
        }
        if (_bdcScores[pi] <= bestScore * (1 + BDC_KEEP) &&
            _bdcImpacts[pi] >= impactBest * BDC_KEEP_IMPACT)
        {
            cand = pi;
        }
    }

    if (_bdcImpacts[cand] <= BDC_T_URGENT)
    {
        let s = -1;
        let sScore = BDC_FAR;
        for (let i = 0; i < count; i++)
        {
            if (_bdcImpacts[i] > BDC_T_URGENT && _bdcScores[i] < sScore)
            {
                sScore = _bdcScores[i];
                s = i;
            }
        }
        if (s >= 0)
        {
            cand = s;
        }
        else
        {
            let tMax = _bdcImpacts[cand];
            let lb = cand;
            leastBad = true;
            fence = _bdcScores[cand] * BDC_TIE + BDC_EPS;
            for (let i = 0; i < count; i++)
            {
                if (_bdcScores[i] <= fence && _bdcImpacts[i] > tMax * 1.1)
                {
                    tMax = _bdcImpacts[i];
                    lb = i;
                }
            }
            cand = lb;
        }
    }

    if (!leastBad)
    {
        fence = _bdcScores[cand] * BDC_TIE + BDC_EPS;
        tBest = _bdcImpacts[cand];
        for (let i = 0; i < count; i++)
        {
            const sameClass = (_bdcImpacts[i] > BDC_T_URGENT) === (_bdcImpacts[cand] > BDC_T_URGENT);
            if (!sameClass || _bdcScores[i] > fence) continue;
            if (_bdcImpacts[i] > tBest * 1.1)
            {
                tBest = _bdcImpacts[i];
                cand = i;
            }
        }
    }

    const out = { x: _bdcDirs[cand].x, y: _bdcDirs[cand].y };
    _bdcLastX = out.x;
    _bdcLastY = out.y;
    _bdcHaveLast = true;
    return out;
}

function _adUpdate(mx, my)
{
    const now = _nowMs();

    if (!_ok(mx, -1e8, 1e8)) return false;
    if (!_ok(my, -1e8, 1e8)) return false;

    _buildRing();

    const speed = _speed();
    const myR = _ownRadius();

    _collect(mx, my, myR, now);
    _bdBuildThreats();

    if (_threatN === 0)
    {
        _bdcForget();
        return false;
    }

    if (!_bdDanger(mx, my, myR)) return false;

    const dir = _bdcPick(mx, my, myR, 0, 0, speed);

    const tx = Math.round(mx + dir.x * AD_REACH);
    const ty = Math.round(my + dir.y * AD_REACH);

    _sendMove(tx, ty);
    return true;
}

export function setupAutododge()
{
    enableProjectileTracking();
}

export function resetAutododge()
{
    _bdcForget();
    resetProfiles();
}

export function updateAutododge()
{
    if (!state.autododge) return;
    if (scanData.lastUpdate === 0) return;
    const now = _nowMs();
    if (now - _lastTick < AD_TICK_MS) return;
    _lastTick = now;

    const destroyed = scanData.destroyed;
    if (destroyed)
    {
        for (let i = 0; i < destroyed.length && i < 16; i++) noteBurstDeath(destroyed[i]);
    }

    _adUpdate(scanData.myX, scanData.myY);
}
