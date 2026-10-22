import { sendCommand } from "../core/commands.js";
import { getFunctions } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import { enableProjectileTracking, scanData } from "../core/scanner.js";
import { state } from "../utils/flags.js";
import { logWarn } from "../utils/logger.js";
import { K_BLOB, K_DROP, K_FADE, K_LOCKPATH, fitOf, kindOf } from "../helpers/dodge_kinds.js";
import { blocksLinear, noteBurstDeath, resetProfiles, shapeHazards } from "../helpers/dodge_profiles.js";
import { BLOCKS_MOVEMENT, BLOCKS_PROJECTILES, TILE_SIZE, getWallCacheH, getWallCacheW, isBlockedAt, isBlockedWide, losCheck, traceWallHit } from "../utils/wallCache.js";

const MOVE_INPUT_TYPE = 2;
const DODGE_CHAR_SPEED = 720;
const DODGE_SPEED_MIN = 300;
const DODGE_SPEED_MAX = 8500;
const AD_FAR_LOOKAHEAD = 1.6;
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
const BDC_WARN_MUL = 4;
const BDC_WARN_T = -1;
const BDC_MOMENTUM = 0.3;
const BDC_DYN_SPEED = 5000;
const BDC_AGE_MS = 48;
const BDC_CONE_MIN = 999;
const BDC_CONE_SPREAD = 0.8;
const BDC_CONE_PAD = 0.05;
const BDC_STALL_MAX = 8;
const PROJ_RADIUS_DEFAULT = 150;
const OWN_RADIUS_MIN = 40;
const OWN_RADIUS_MAX = 200;
const SEV = { beam: 1.5, slow: 0.7, fade: 0.5, grab: 2.0, cone: 1.25, area: 0.8 };

var _ring = [], _dirBuilt = false;
var _hazards = [], _hazardN = 0;
var _threats = [], _threatN = 0;
var _bdcDirs = [], _bdcScores = [], _bdcImpacts = [], _bdcSel = [], _bdcSelN = 0;
var _bdcLastX = 0, _bdcLastY = 0, _bdcHaveLast = false;
var _lastTick = 0;
var _myPX = 0, _myPY = 0, _myVX = 0, _myVY = 0, _myInit = false, _myTs = 0;
var _lastReason = "none";
var _hits = [], _hitN = 0, _hitSeen = 0;
var _stall = 0, _stallHold = 0;
var _holdX = 0, _holdY = 0, _holdUntil = 0;

function _ok(v, lo, hi) { return v >= lo && v <= hi; }
function _nowMs() { return Date.now(); }
function _hyp(a, b) { return Math.sqrt(a * a + b * b); }
function _sevOf(p) { if (p.isBeam) return SEV.beam; if (p.isSlow) return SEV.slow; return 1; }

function _buildRing()
{
    if (_dirBuilt) return;
    for (let i = 0; i < AD_DIR_COUNT; i++)
    {
        const a = Math.PI * 2 * i / AD_DIR_COUNT;
        _ring.push({ x: Math.cos(a), y: Math.sin(a) });
    }
    for (let i = 0; i < BDC_DIR_MAX; i++) { _bdcDirs.push({ x: 0, y: 0 }); _bdcScores.push(0); _bdcImpacts.push(0); }
    for (let i = 0; i < BD_THREAT_MAX; i++) { _bdcSel.push(0); _threats.push({ x: 0, y: 0, vx: 0, vy: 0, rad: 0, sev: 1, cone: false, ax: 0, ay: 0, adx: 1, ady: 0, ang: 0, rng: 0, spd: 0, ageMs: 0 }); }
    for (let i = 0; i < AD_HAZARD_MAX; i++) _hazards.push({ x: 0, y: 0, vx: 0, vy: 0, rad: 0, age: 0, fadeBase: 0, fadeK: 0, ax: 0, ay: 0, bx: 0, by: 0, hasSegment: false, name: null, sev: 1, ageMs: 0, unstable: false });
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
    if (r > 1) { if (r > OWN_RADIUS_MAX) return OWN_RADIUS_MAX; if (r < OWN_RADIUS_MIN) return OWN_RADIUS_MIN; return r; }
    return 120;
}

function _margin(spd) { return BD_SAFETY_MARGIN * (1 + spd / BDC_DYN_SPEED); }

function _trackSelf(mx, my)
{
    const now = _nowMs();
    if (_myInit)
    {
        const dt = (now - _myTs) / 1000;
        if (dt > 0.005 && dt < 0.4)
        {
            const vx = (mx - _myPX) / dt, vy = (my - _myPY) / dt;
            if (_hyp(vx, vy) < 6000) { _myVX = _myVX * 0.5 + vx * 0.5; _myVY = _myVY * 0.5 + vy * 0.5; }
        }
    }
    _myPX = mx; _myPY = my; _myTs = now; _myInit = true;
}

function _projectileVel(p)
{
    if (!p || !p.hasVelocitySample) return null;
    let dt = p.lastTs && p.spawnedAt ? _nowMs() - p.lastTs : 0;
    if (!(dt >= AD_TICK_MS && dt <= AD_TICK_MAX_MS)) dt = AD_TICK_MS;
    const vx = (p.x - p.lastX) * 1000 / dt, vy = (p.y - p.lastY) * 1000 / dt;
    const ex = vx - (p.svx || 0), ey = vy - (p.svy || 0);
    if (p.svx !== undefined)
    {
        const a = _hyp(vx, vy), b = _hyp(p.svx, p.svy);
        if (a > 1 && b > 1) { const c = (vx * p.svx + vy * p.svy) / (a * b); if (c < 0.7071) p.unstable = true; }
    }
    p.svx = vx; p.svy = vy;
    return { vx, vy };
}

function _ballRadius(p) { if (p.isBeam) return PROJ_RADIUS_DEFAULT * 0.6; return p.radius > 0 ? p.radius : PROJ_RADIUS_DEFAULT; }
function _traveled(p) { if (!p.spawnX && !p.spawnY) return 0; return _hyp(p.x - p.spawnX, p.y - p.spawnY); }
function _isMine(p) { const t = p.ownerTeam | 0; return t >= 0 && t === (scanData.myTeamId | 0); }

function _myShot(p, mx, my, bodyR)
{
    if (!p.spawnX && !p.spawnY) return false;
    const sx = p.spawnX - mx, sy = p.spawnY - my, nx = p.x - mx, ny = p.y - my;
    const dSpawn = sx * sx + sy * sy, dNow = nx * nx + ny * ny, r = bodyR + AD_SPAWN_MARGIN;
    if (dSpawn > r * r) return false;
    return dNow > dSpawn;
}

function _shielded(p, mx, my)
{
    const dx = p.x - mx, dy = p.y - my, d = _hyp(dx, dy);
    if (d <= 1) return false;
    if (isBlockedAt(mx, my, BLOCKS_PROJECTILES)) return false;
    return traceWallHit(mx, my, dx / d, dy / d, d, BLOCKS_PROJECTILES) < d;
}

function _segDist(px, py, ax, ay, bx, by)
{
    const dx = bx - ax, dy = by - ay, lenSq = dx * dx + dy * dy;
    let t = lenSq < 1e-6 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    return _hyp(px - (ax + dx * t), py - (ay + dy * t));
}

function _fadeVel(h, dt, out)
{
    let vx = h.vx, vy = h.vy;
    if (h.fadeBase && h.fadeK)
    {
        const cur = h.fadeBase * Math.exp(h.fadeK * (h.age > 0 ? h.age : 0));
        const nxt = h.fadeBase * Math.exp(h.fadeK * ((h.age > 0 ? h.age : 0) + dt * 1000));
        if (cur > 1e-6) { const r = nxt / cur; vx *= r; vy *= r; }
    }
    out.vx = vx; out.vy = vy;
    return out;
}

function _inAware(h, mx, my, zoneSq)
{
    if (h.hasSegment) { const d = _segDist(mx, my, h.ax, h.ay, h.bx, h.by); return d * d <= zoneSq; }
    const dx = h.x - mx, dy = h.y - my;
    return dx * dx + dy * dy <= zoneSq;
}

function _kindReach(p, spec, spd)
{
    let r = spec && spec.maxRange > 0 ? spec.maxRange : 0;
    if (spec && spec.chargedRange > 0 && spd > 3500) r = spec.chargedRange;
    if (r <= 0 && p.castRange > 0) r = p.castRange;
    if (r <= 0 && p.isThrower && (p.targetX || p.targetY) && p.spawnX && p.spawnY) r = _hyp(p.targetX - p.spawnX, p.targetY - p.spawnY);
    if (r <= 0) r = AD_FALLBACK_RANGE;
    if (spec && spec.reachAdj) r += spec.reachAdj;
    return r > 0 && r < 70000 ? r : AD_FALLBACK_RANGE;
}

function _lifeLeft(p, spec, spd, nowMs)
{
    const maxR = _kindReach(p, spec, spd);
    if (spec && (spec.flags & K_FADE))
    {
        let age = nowMs - (p.spawnedAt ? p.spawnedAt : nowMs);
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
    h.hasSegment = false; h.name = null; h.sev = 1; h.ageMs = 0; h.unstable = false;
    _hazardN++;
    return h;
}

function _collect(mx, my, myRadius, nowMs)
{
    const zoneSq = AD_AWARE * AD_AWARE, bodyR = myRadius + AD_SKIN;
    const list = (scanData.projectiles || []).slice().sort((a, b) =>
    {
        const da = (a.x - mx) * (a.x - mx) + (a.y - my) * (a.y - my);
        const db = (b.x - mx) * (b.x - mx) + (b.y - my) * (b.y - my);
        return da - db;
    });
    _hazardN = 0;

    const used = {};
    const groups = {};
    for (let i = 0; i < list.length; i++)
    {
        const p = list[i];
        if (!p || _isMine(p)) continue;
        if (p.isBeam) continue;
        if (!(p.speed > 200)) continue;
        const vx = p.vx || 0, vy = p.vy || 0;
        const sp = _hyp(vx, vy);
        if (sp < 200) continue;
        const key = (p.name || "?") + "|" + (p.ownerIndex | 0) + "|" + Math.floor((p.spawnedAt || 0) / 32);
        let g = groups[key];
        if (!g) { g = groups[key] = { n: 0, idx: [], sx: 0, sy: 0, dx: 0, dy: 0, sp: 0, rad: 0, ang: 0, first: null }; }
        g.n++; g.idx.push(i);
        g.sx += p.spawnX; g.sy += p.spawnY;
        g.dx += vx / sp; g.dy += vy / sp; g.sp += sp;
        if (p.radius > g.rad) g.rad = p.radius;
        if (!g.first) g.first = p;
    }
    for (const key in groups)
    {
        const g = groups[key];
        if (g.n < BDC_CONE_MIN) continue;
        let ax = g.dx, ay = g.dy;
        const l = _hyp(ax, ay);
        if (l < 1e-6) continue;
        ax /= l; ay /= l;
        let dev = 0;
        for (let k = 0; k < g.idx.length; k++)
        {
            const q = list[g.idx[k]];
            const sp = _hyp(q.vx || 0, q.vy || 0);
            if (sp < 1) continue;
            const c = ((q.vx / sp) * ax + (q.vy / sp) * ay);
            const a = Math.acos(c < -1 ? -1 : c > 1 ? 1 : c);
            if (a > dev) dev = a;
        }
        if (dev > BDC_CONE_SPREAD) continue;
        const apexX = g.sx / g.n, apexY = g.sy / g.n;
        let rng = 0;
        for (let k = 0; k < g.idx.length; k++)
        {
            const q = list[g.idx[k]];
            const r = _kindReach(q, kindOf(q.name), _hyp(q.vx || 0, q.vy || 0));
            if (r > rng) rng = r;
        }
        if (_hazardN < AD_HAZARD_MAX)
        {
            const h = _pushHazard();
            h.cone = true; h.ax = apexX; h.ay = apexY; h.adx = ax; h.ady = ay;
            h.ang = Math.min(1.2, dev + BDC_CONE_PAD); h.rng = rng; h.spd = g.sp / g.n;
            h.rad = (g.rad || PROJ_RADIUS_DEFAULT) + 10; h.name = g.first.name; h.sev = SEV.cone;
            h.ageMs = nowMs - (g.first.spawnedAt || nowMs);
            for (let k = 0; k < g.idx.length; k++) used[g.idx[k]] = 1;
        }
    }

    for (let i = 0; i < list.length; i++)
    {
        if (used[i]) continue;
        const p = list[i];
        if (!p) continue;
        if (_isMine(p)) continue;
        if (_myShot(p, mx, my, bodyR)) continue;
        if (_shielded(p, mx, my)) continue;
        const ageMs = nowMs - (p.spawnedAt || nowMs);
        const sev = _sevOf(p);

        const caps = shapeHazards(p, nowMs);
        for (let c = 0; c < caps.length && c < AD_CAP_MAX; c++)
        {
            const cap = caps[c];
            if ((cap.t1 - nowMs) / 1000 <= 0) continue;
            if (_hazardN >= AD_HAZARD_MAX) break;
            const h = _pushHazard();
            h.rad = cap.radius; h.hasSegment = !!cap.hasSegment; h.name = p.name || cap.name; h.sev = SEV.area; h.ageMs = ageMs;
            if (cap.hasSegment) { h.ax = cap.ax; h.ay = cap.ay; h.bx = cap.bx; h.by = cap.by; }
            else { h.x = cap.x; h.y = cap.y; }
            if (!_inAware(h, mx, my, zoneSq)) _hazardN--;
        }
        if (caps.length > 0 && blocksLinear(p.name)) continue;

        const name = p.name || "";
        const spec = kindOf(name);
        if (spec && (spec.flags & K_DROP)) continue;
        const dx = p.x - mx, dy = p.y - my;
        if (dx * dx + dy * dy > zoneSq) continue;

        let vx = p.vx || 0, vy = p.vy || 0;
        if (vx === 0 && vy === 0)
        {
            const est = _projectileVel(p);
            if (est) { vx = est.vx; vy = est.vy; }
        }
        if (!_ok(vx, -1e8, 1e8) || !_ok(vy, -1e8, 1e8)) { vx = 0; vy = 0; }
        const flown = _traveled(p);
        if (spec && (spec.flags & K_LOCKPATH) && flown > 120 && p.spawnX && p.spawnY)
        {
            let base = _hyp(vx, vy); if (base < 1) base = 1;
            vx = (p.x - p.spawnX) / flown * base; vy = (p.y - p.spawnY) / flown * base;
        }
        let spd = _hyp(vx, vy);
        if (spec && spec.speedMul > 0 && spd > 3500) { vx *= spec.speedMul; vy *= spec.speedMul; spd *= spec.speedMul; }
        if (spd < 1) spd = 1;
        const lockPath = !!(spec && (spec.flags & K_LOCKPATH)) || !!p.isBeam;
        const blob = !!(spec && (spec.flags & K_BLOB)) || (!lockPath && !!p.isThrower);
        const fit = fitOf(name);
        const shotR = _ballRadius(p) + (spec ? (spec.growR | 0) : 0);
        const rad = shotR + fit.pad + shotR * fit.grow;
        const ux = vx / spd, uy = vy / spd;

        let playerAlong = 0;
        if (!blob)
        {
            playerAlong = (mx - p.x) * ux + (my - p.y) * uy;
            if (playerAlong < -50) continue;
            if (!p.isThrower)
            {
                const tHit = playerAlong > 0 ? playerAlong : 0;
                if (!losCheck(p.x, p.y, p.x + ux * tHit, p.y + uy * tHit, BLOCKS_PROJECTILES)) continue;
            }
        }
        const left = _lifeLeft(p, spec, spd, nowMs);
        if (left <= 10) continue;
        const gap = _hyp(dx, dy) - bodyR - shotR;
        if (left < 0.85 * (gap > 0 ? gap : 0)) continue;
        if (!blob && playerAlong > left + shotR) continue;
        if (_hazardN >= AD_HAZARD_MAX) break;
        const h = _pushHazard();
        h.x = p.x; h.y = p.y; h.vx = vx; h.vy = vy; h.rad = rad; h.name = p.name;
        h.age = (spec && (spec.flags & K_FADE)) ? ageMs : 0;
        if (h.age < 0) h.age = 0;
        h.fadeBase = spec ? spec.fadeBase : 0;
        h.fadeK = spec ? spec.fadeK : 0;
        h.sev = sev; h.ageMs = ageMs; h.unstable = !!p.unstable;
    }
}

function _bdPush(x, y, vx, vy, rad) { if (_threatN >= BD_THREAT_MAX) return; const t = _threats[_threatN]; t.x = x; t.y = y; t.vx = vx; t.vy = vy; t.rad = rad; t.sev = 1; t.cone = false; t.ageMs = 0; _threatN++; }

function _bdBuildThreats()
{
    const vel = { vx: 0, vy: 0 };
    _threatN = 0;
    for (let i = 0; i < _hazardN; i++)
    {
        const h = _hazards[i];
        if (h.hasSegment) { _bdPush(h.ax, h.ay, 0, 0, h.rad); _bdPush(h.bx, h.by, 0, 0, h.rad); continue; }
        if (h.cone)
        {
            if (_threatN >= BD_THREAT_MAX) continue;
            const t = _threats[_threatN++];
            t.x = h.ax; t.y = h.ay; t.vx = h.adx * h.spd; t.vy = h.ady * h.spd; t.rad = h.rad;
            t.sev = h.sev; t.cone = true; t.ax = h.ax; t.ay = h.ay; t.adx = h.adx; t.ady = h.ady;
            t.ang = h.ang; t.rng = h.rng; t.spd = h.spd; t.ageMs = h.ageMs;
            continue;
        }
        _fadeVel(h, 0, vel);
        if (_threatN >= BD_THREAT_MAX) continue;
        const t = _threats[_threatN++];
        t.x = h.x; t.y = h.y; t.vx = vel.vx; t.vy = vel.vy; t.rad = h.rad;
        t.sev = h.sev || 1; t.cone = false; t.ageMs = h.ageMs || 0;
    }
}

function _pointDanger(p, mx, my, r, tmax)
{
    const dx = mx - p.x, dy = my - p.y;
    if (dx * dx + dy * dy <= r * r) return true;
    const c1 = dx * p.vx + dy * p.vy;
    if (c1 <= 0) return false;
    const c2 = p.vx * p.vx + p.vy * p.vy;
    if (c2 <= 0) return false;
    const t = c1 / c2;
    if (t > tmax) return false;
    const cx = p.x + p.vx * t, cy = p.y + p.vy * t;
    return (mx - cx) * (mx - cx) + (my - cy) * (my - cy) <= r * r;
}

function _coneTTI(p, mx, my)
{
    const rx = mx - p.ax, ry = my - p.ay;
    const along = rx * p.adx + ry * p.ady;
    const perp = Math.abs(-rx * p.ady + ry * p.adx);
    let d;
    if (along < 0) d = _hyp(rx, ry) - p.rad;
    else if (along > p.rng) d = _hyp(along - p.rng, perp) - p.rad;
    else d = Math.max(0, perp - Math.tan(p.ang) * along - p.rad);
    if (d <= 0) return 0;
    return d / Math.max(p.spd || 1, 1);
}

function _bdDanger(mx, my, myR, mul, tmax)
{
    for (let i = 0; i < _threatN; i++)
    {
        const p = _threats[i];
        if (p.cone) { if (_coneTTI(p, mx, my) <= tmax) return true; continue; }
        if (_pointDanger(p, mx, my, myR + p.rad + _margin(_hyp(p.vx, p.vy)) * mul, tmax)) return true;
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
    const w = getWallCacheW(), h = getWallCacheH();
    if (w > 0 && h > 0) { tx = _clampToMap(tx, w); ty = _clampToMap(ty, h); }
    const battle = scanData.battleModeClient;
    if (!battle || battle.isNull()) return false;
    try
    {
        const fns = getFunctions(), ix = Math.round(tx), iy = Math.round(ty);
        if (_stallHold > 0) { _stallHold--; return false; }
        fns.LogicBattleModeClient_setClientPredictionMoveTo(battle, ix, iy, 1);
        return sendCommand(MOVE_INPUT_TYPE, (ci) => { ci.add(offsets.ClientInput_x).writeS32(ix); ci.add(offsets.ClientInput_y).writeS32(iy); });
    }
    catch (e) { logWarn("autododge send failed", { err: String(e && e.message || e) }); return false; }
}

function _bdcForget() { _bdcHaveLast = false; _bdcLastX = 0; _bdcLastY = 0; }

function _bdcAimedOne(p, mx, my, myR)
{
    if (p.cone) return _coneTTI(p, mx, my) <= BDC_T_FIELD;
    const r = myR + p.rad + _margin(_hyp(p.vx, p.vy));
    const vx = p.vx, vy = p.vy, px = p.x - mx, py = p.y - my;
    const a = vx * vx + vy * vy, b = 2 * (px * vx + py * vy), c = px * px + py * py;
    let minD2 = c;
    if (a > 1e-6)
    {
        let tm = -b / (2 * a);
        if (tm < 0) tm = 0; if (tm > BDC_T_FIELD) tm = BDC_T_FIELD;
        minD2 = c + b * tm + a * tm * tm;
    }
    const gate = r * BDC_HIT_GATE;
    return minD2 <= gate * gate;
}

function _wallsNear(mx, my)
{
    let n = 0;
    const d = [1, 0, -1, 0, 0, 1, 0, -1];
    for (let k = 0; k < 4; k++)
    {
        if (isBlockedWide(mx + d[k * 2] * 120, my + d[k * 2 + 1] * 120, AD_WALL_BODY, BLOCKS_MOVEMENT)) n++;
    }
    return n;
}

function _bdcWallCost(mx, my, dx, dy, mul)
{
    let raw = 0;
    for (let s = 1; s <= BDC_WALL_PROBE; s++)
    {
        const d = BDC_WALL_BAND * s / BDC_WALL_PROBE;
        if (isBlockedWide(mx + dx * d, my + dy * d, AD_WALL_BODY, BLOCKS_MOVEMENT)) raw += BDC_WALL_HIT * (BDC_WALL_PROBE - s + 1);
    }
    return raw * mul;
}

function _pointMinD2(p, dx, dy, mx, my, speed)
{
    const vx = p.vx - dx * speed, vy = p.vy - dy * speed;
    const px = p.x - mx, py = p.y - my;
    const a = vx * vx + vy * vy, b = 2 * (px * vx + py * vy), c = px * px + py * py;
    let minD2 = c;
    if (a > 1e-6)
    {
        let tm = -b / (2 * a);
        if (tm < 0) tm = 0; if (tm > BDC_T_FIELD) tm = BDC_T_FIELD;
        minD2 = c + b * tm + a * tm * tm;
    }
    return minD2 < BDC_EPS ? BDC_EPS : minD2;
}

function _bdcScoreDir(dx, dy, mx, my, myR, speed, wallMul, momX, momY, momOn)
{
    let score = 0;
    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        const r = myR + p.rad + _margin(_hyp(p.vx, p.vy));
        let minD2, tti;
        if (p.cone) { tti = _coneTTI(p, mx, my); minD2 = Math.max(BDC_EPS, r * r + tti * tti * 1000); }
        else
        {
            minD2 = _pointMinD2(p, dx, dy, mx, my, speed);
            const sp = Math.max(1, _hyp(p.vx, p.vy));
            tti = Math.sqrt(minD2) / sp;
        }
        const urgency = 1 / (tti + 0.1);
        const spd = _hyp(p.vx, p.vy);
        const trust = p.ageMs < BDC_AGE_MS ? 0.5 : 1;
        score += BDC_DANGER * (r * r) / minD2 * urgency * (1 + spd / 3000) * (p.sev || 1) * trust;
    }
    score += _bdcWallCost(mx, my, dx, dy, wallMul);
    if (momOn)
    {
        const dot = dx * momX + dy * momY;
        if (dot > 0) score *= 1 - BDC_MOMENTUM * dot;
    }
    return score;
}

function _bdcImpactDir(dx, dy, mx, my, myR, speed)
{
    let best = BDC_FAR;
    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        if (p.cone) { const t = _coneTTI(p, mx, my); if (t < best) best = t; continue; }
        const r = myR + p.rad + _margin(_hyp(p.vx, p.vy));
        const vx = p.vx - dx * speed, vy = p.vy - dy * speed;
        const px = p.x - mx, py = p.y - my;
        const a = vx * vx + vy * vy, b = 2 * (px * vx + py * vy), c = px * px + py * py - r * r;
        if (c < 0) return 0;
        if (a > 1e-6)
        {
            const disc = b * b - 4 * a * c;
            if (disc >= 0) { const t1 = (-b - Math.sqrt(disc)) / (2 * a); if (t1 > 0 && t1 < best) best = t1; }
        }
    }
    return best;
}

function _bdcThreatD2(k, mx, my) { const p = _threats[_bdcSel[k]]; return (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my); }

function _bdcExtraDirs(mx, my)
{
    let first = -1, second = -1, at = AD_DIR_COUNT;
    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]], dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (first < 0) { first = i; continue; }
        const f2 = _bdcThreatD2(first, mx, my);
        if (d2 < f2) { second = first; first = i; continue; }
        if (second < 0) { second = i; continue; }
        if (d2 < _bdcThreatD2(second, mx, my)) second = i;
    }
    for (let j = 0; j < 2; j++)
    {
        const k = j === 0 ? first : second;
        if (k < 0 || at + 3 > BDC_DIR_MAX) continue;
        const p = _threats[_bdcSel[k]];
        let pxv = -p.vy, pyv = p.vx;
        let len = _hyp(pxv, pyv);
        if (len < 1e-6) continue;
        const px = pxv / len, py = pyv / len;
        _bdcDirs[at].x = px; _bdcDirs[at].y = py;
        _bdcDirs[at + 1].x = -px; _bdcDirs[at + 1].y = -py;
        pxv = (mx - p.x) + px * BDC_EXTRA_BLEND; pyv = (my - p.y) + py * BDC_EXTRA_BLEND;
        len = _hyp(pxv, pyv);
        if (len < 1e-6) { pxv = -px; pyv = -py; len = 1; }
        _bdcDirs[at + 2].x = pxv / len; _bdcDirs[at + 2].y = pyv / len;
        at += 3;
    }
    return at - AD_DIR_COUNT;
}

function _escapeSum(mx, my)
{
    let ex = 0, ey = 0;
    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        const dx = mx - p.x, dy = my - p.y, d = _hyp(dx, dy);
        if (d < 1) continue;
        ex += dx / d; ey += dy / d;
    }
    const len = _hyp(ex, ey);
    return len > 0.01 ? { x: ex / len, y: ey / len } : null;
}

function _bdcPick(mx, my, myR, ix, iy, speed, wallMul, momX, momY, momOn)
{
    _bdcSelN = 0;
    for (let i = 0; i < _threatN; i++) if (_bdcAimedOne(_threats[i], mx, my, myR)) _bdcSel[_bdcSelN++] = i;
    if (_bdcSelN === 0) return _bdcHaveLast ? { x: _bdcLastX, y: _bdcLastY } : { x: 0, y: 0 };

    let prim = _bdcSel[0], ptd = BDC_FAR;
    for (let i = 0; i < _bdcSelN; i++)
    {
        const p = _threats[_bdcSel[i]];
        const d = _hyp(p.x - mx, p.y - my) - p.rad;
        if (d < ptd) { ptd = d; prim = _bdcSel[i]; }
    }
    const pp = _threats[prim];
    let ux = pp.vx, uy = pp.vy, ul = _hyp(ux, uy);
    if (ul < 1) { ux = mx - pp.x; uy = my - pp.y; ul = _hyp(ux, uy); }
    if (ul < 1) { ux = 1; uy = 0; ul = 1; }
    ux /= ul; uy /= ul;
    const pspd = _hyp(pp.vx, pp.vy);
    const nx = -uy, ny = ux;

    const dirs = [];
    const add = (x, y, tag) => { const l = _hyp(x, y); if (l > 1e-6) dirs.push({ x: x / l, y: y / l, tag }); };
    add(nx, ny, 1); add(-nx, -ny, 1);
    add(nx + ux * 0.7, ny + uy * 0.7, 1); add(-nx + ux * 0.7, -ny + uy * 0.7, 1);
    add(nx - ux * 0.7, ny - uy * 0.7, 1); add(-nx - ux * 0.7, -ny - uy * 0.7, 1);
    if (pspd < 150) { add(ux, uy, 2); add(-ux, -uy, 3); } else add(-ux, -uy, 2);
    for (let i = 0; i < 16; i++) { const a2 = Math.PI * 2 * i / 16; add(Math.cos(a2), Math.sin(a2), 0); }

    const clearOf = (dx, dy) =>
    {
        let best = BDC_FAR;
        const px0 = mx + dx * 60, py0 = my + dy * 60;
        for (let s = 1; s <= 8; s++)
        {
            const t = s * 0.15, px = mx + dx * speed * t, py = my + dy * speed * t;
            for (let i = 0; i < _bdcSelN; i++)
            {
                const p = _threats[_bdcSel[i]];
                const tx = p.cone ? p.ax : p.x + p.vx * t;
                const ty = p.cone ? p.ay : p.y + p.vy * t;
                const dd = _hyp(tx - px, ty - py) - myR - p.rad - _margin(_hyp(p.vx, p.vy));
                if (dd < best) best = dd;
            }
        }
        const ens = scanData.enemies || [];
        for (let q = 0; q < ens.length && q < 8; q++) { const en = ens[q]; if (!en) continue; const ex = en.x, ey = en.y; if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue; const dd = _hyp(ex - px0, ey - py0) - myR - 120; if (dd < best) best = dd; }
        for (let s = 1; s <= 2; s++)
        {
            const d = 130 * s;
            if (isBlockedWide(mx + dx * d, my + dy * d, AD_WALL_BODY, BLOCKS_MOVEMENT)) best -= 700;
        }
        return best;
    };

    let bi = 0, bs = -BDC_FAR;
    for (let i = 0; i < dirs.length; i++)
    {
        const d = dirs[i], c = clearOf(d.x, d.y) + (d.tag === 1 ? 45 : 0) - (d.tag === 2 ? 70 : 0) - (d.tag === 3 ? 160 : 0);
        if (c > bs) { bs = c; bi = i; }
    }
    if (_bdcHaveLast)
    {
        const c = clearOf(_bdcLastX, _bdcLastY) + 20;
        if (c >= bs - 25 && _bdcLastX * dirs[bi].x + _bdcLastY * dirs[bi].y > 0.7) return { x: _bdcLastX, y: _bdcLastY };
    }
    const out = dirs[bi];
    _bdcLastX = out.x; _bdcLastY = out.y; _bdcHaveLast = true;
    return { x: out.x, y: out.y };
}

function _recordHits(mx, my, myR)
{
    for (let i = 0; i < _threatN; i++)
    {
        const p = _threats[i];
        let d;
        if (p.cone) d = _coneTTI(p, mx, my) * Math.max(p.spd || 1, 1);
        else d = _hyp(p.x - mx, p.y - my) - myR - p.rad;
        if (d > 0) continue;
        if (_hitN >= 64) { for (let k = 1; k < 64; k++) _hits[k - 1] = _hits[k]; _hitN = 63; }
        _hits[_hitN++] = { spd: Math.round(_hyp(p.vx, p.vy)), rad: Math.round(p.rad), tti: 0, dir: _bdcLastX.toFixed(2) + "," + _bdcLastY.toFixed(2), at: _nowMs() };
        _hitSeen++;
    }
}

function _adUpdate(mx, my)
{
    const now = _nowMs();
    if (!_ok(mx, -1e8, 1e8) || !_ok(my, -1e8, 1e8)) return false;
    _buildRing();
    _trackSelf(mx, my);
    const speed = _speed(), myR = _ownRadius();
    _collect(mx, my, myR, now);
    _bdBuildThreats();
    if (_threatN === 0) { _bdcForget(); _lastReason = "none"; return false; }

    const walls = _wallsNear(mx, my);
    const wallMul = walls >= 3 ? 0.35 : 1;
    const spdNow = _hyp(_myVX, _myVY), momOn = spdNow > 100;
    const momX = momOn ? _myVX / spdNow : 0, momY = momOn ? _myVY / spdNow : 0;

    if (walls >= 3) _recordHits(mx, my, myR);

    if (_bdDanger(mx, my, myR, 2.0, 1.2))
    {
        let dir = _bdcPick(mx, my, myR, 0, 0, speed, wallMul, momX, momY, momOn);
        const nn = _nowMs();
        if (nn < _holdUntil && dir.x * _holdX + dir.y * _holdY > 0.9) dir = { x: _holdX, y: _holdY };
        else { _holdX = dir.x; _holdY = dir.y; _holdUntil = nn + 320; }
        _sendMove(Math.round(mx + dir.x * AD_REACH), Math.round(my + dir.y * AD_REACH));
        _lastReason = "reactive";
        return true;
    }
    if (_bdDanger(mx, my, myR, BDC_WARN_MUL, BDC_WARN_T))
    {
        const dir = _bdcPick(mx, my, myR, 0, 0, speed, wallMul, momX, momY, momOn);
        _sendMove(Math.round(mx + dir.x * AD_REACH * 0.45), Math.round(my + dir.y * AD_REACH * 0.45));
        _lastReason = "warning";
        return true;
    }
    _lastReason = "none";
    return false;
}

export function setupAutododge() { enableProjectileTracking(); }

export function resetAutododge() { _bdcForget(); resetProfiles(); _myInit = false; _hitN = 0; _hitSeen = 0; _stall = 0; _stallHold = 0; }

export function updateAutododge()
{
    if (!state.autododge) return;
    if (scanData.lastUpdate === 0) return;
    const now = _nowMs();
    if (now - _lastTick < AD_TICK_MS) return;
    _lastTick = now;
    const destroyed = scanData.destroyed;
    if (destroyed) for (let i = 0; i < destroyed.length && i < 16; i++) noteBurstDeath(destroyed[i]);
    _adUpdate(scanData.myX, scanData.myY);
}

export function debugDodgeSnapshot()
{
    const top = [];
    for (let i = 0; i < Math.min(12, _bdcScores.length); i++) top.push(Math.round(_bdcScores[i]));
    return { threats: _threatN, aimed: _bdcSelN, scored: top, picked: _bdcLastX.toFixed(2) + "," + _bdcLastY.toFixed(2), reason: _lastReason, hits: _hitSeen, walls: _wallsNear(scanData.myX, scanData.myY) };
}

export function recentDodgeHits() { return _hits.slice(0, _hitN); }
