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
const AD_SKIN = 50;
const AD_SPAWN_MARGIN = 60;
const AD_REACH = 380;
const AD_TICK_MS = 16;
const AD_TICK_MAX_MS = 250;
const AD_WALL_BODY = 240;
const AD_HAZARD_MAX = 96;
const AD_CAP_MAX = 16;
const BD_SAFETY_MARGIN = 28;
const BD_THREAT_MAX = 160;
const WARN_MUL = 4;
const WARN_T = -1;
const DYN_SPEED = 5000;
const CONE_MIN = 999;
const CONE_SPREAD = 0.8;
const CONE_PAD = 0.05;
const FAR_BIG = 1.0e18;
const EPS = 1;
const PROJ_RADIUS_DEFAULT = 150;
const OWN_RADIUS_MIN = 40;
const OWN_RADIUS_MAX = 200;

var _initDone = false;
var _hazards = [], _hazardN = 0;
var _threats = [], _threatN = 0;
var _sel = [], _selN = 0;
var _lastDirX = 0, _lastDirY = 0, _haveLastDir = false;
var _lastTick = 0;
var _holdX = 0, _holdY = 0, _holdUntil = 0, _lastTX = 1e9, _lastTY = 1e9, _lastSendT = 0, _calmSince = 0, _calmSent = false;

function _ok(v, lo, hi) { return v >= lo && v <= hi; }
function _nowMs() { return Date.now(); }
function _hyp(a, b) { return Math.sqrt(a * a + b * b); }

function _initPools()
{
    if (_initDone) return;
    for (let i = 0; i < BD_THREAT_MAX; i++) { _sel.push(0); _threats.push({ x: 0, y: 0, vx: 0, vy: 0, rad: 0, cone: false, ax: 0, ay: 0, adx: 1, ady: 0, ang: 0, rng: 0, spd: 0 }); }
    for (let i = 0; i < AD_HAZARD_MAX; i++) _hazards.push({ x: 0, y: 0, vx: 0, vy: 0, rad: 0, age: 0, fadeBase: 0, fadeK: 0, ax: 0, ay: 0, bx: 0, by: 0, hasSegment: false, name: null });
    _initDone = true;
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

function _margin(spd) { return BD_SAFETY_MARGIN * (1 + spd / DYN_SPEED); }

function _projectileVel(p)
{
    if (!p || !p.hasVelocitySample) return null;
    let dt = p.lastTs && p.spawnedAt ? _nowMs() - p.lastTs : 0;
    if (!(dt >= AD_TICK_MS && dt <= AD_TICK_MAX_MS)) dt = AD_TICK_MS;
    return { vx: (p.x - p.lastX) * 1000 / dt, vy: (p.y - p.lastY) * 1000 / dt };
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
    h.hasSegment = false; h.name = null;
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
        if (g.n < CONE_MIN) continue;
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
        if (dev > CONE_SPREAD) continue;
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
            h.ang = Math.min(1.2, dev + CONE_PAD); h.rng = rng; h.spd = g.sp / g.n;
            h.rad = (g.rad || PROJ_RADIUS_DEFAULT) + 10; h.name = g.first.name;
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

        const caps = shapeHazards(p, nowMs);
        for (let c = 0; c < caps.length && c < AD_CAP_MAX; c++)
        {
            const cap = caps[c];
            if ((cap.t1 - nowMs) / 1000 <= 0) continue;
            if (_hazardN >= AD_HAZARD_MAX) break;
            const h = _pushHazard();
            h.rad = cap.radius; h.hasSegment = !!cap.hasSegment; h.name = p.name || cap.name;
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
    }
}

function _bdPush(x, y, vx, vy, rad) { if (_threatN >= BD_THREAT_MAX) return; const t = _threats[_threatN]; t.x = x; t.y = y; t.vx = vx; t.vy = vy; t.rad = rad; t.cone = false; _threatN++; }

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
            t.cone = true; t.ax = h.ax; t.ay = h.ay; t.adx = h.adx; t.ady = h.ady;
            t.ang = h.ang; t.rng = h.rng; t.spd = h.spd;
            continue;
        }
        _fadeVel(h, 0, vel);
        if (_threatN >= BD_THREAT_MAX) continue;
        const t = _threats[_threatN++];
        t.x = h.x; t.y = h.y; t.vx = vel.vx; t.vy = vel.vy; t.rad = h.rad;
        t.cone = false;
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
        const nt = _nowMs();
        if (Math.abs(tx - _lastTX) < 24 && Math.abs(ty - _lastTY) < 24 && nt - _lastSendT < 160) return true;
        _lastTX = tx; _lastTY = ty; _lastSendT = nt;
        fns.LogicBattleModeClient_setClientPredictionMoveTo(battle, ix, iy, 1);
        return sendCommand(MOVE_INPUT_TYPE, (ci) => { ci.add(offsets.ClientInput_x).writeS32(ix); ci.add(offsets.ClientInput_y).writeS32(iy); });
    }
    catch (e) { logWarn("autododge send failed", { err: String(e && e.message || e) }); return false; }
}

function _forgetLastDir() { _haveLastDir = false; _lastDirX = 0; _lastDirY = 0; }

function _pickDir(mx, my, myR, speed)
{
    _selN = 0;
    for (let i = 0; i < _threatN; i++)
    {
        const p = _threats[i], dx0 = p.x - mx, dy0 = p.y - my;
        if (dx0 * dx0 + dy0 * dy0 <= 4840000) _sel[_selN++] = i;
    }
    if (_selN === 0) return _haveLastDir ? { x: _lastDirX, y: _lastDirY } : { x: 0, y: 0 };

    let prim = _sel[0], ptd = FAR_BIG;
    for (let i = 0; i < _selN; i++)
    {
        const p = _threats[_sel[i]];
        const d = _hyp(p.x - mx, p.y - my) - p.rad;
        if (d < ptd) { ptd = d; prim = _sel[i]; }
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
        let best = FAR_BIG;
        for (let i = 0; i < _selN; i++)
        {
            const p = _threats[_sel[i]];
            const rx = p.x - mx, ry = p.y - my;
            const wvx = p.vx - dx * speed, wvy = p.vy - dy * speed;
            const w2 = wvx * wvx + wvy * wvy;
            let t = w2 > 1e-6 ? -(rx * wvx + ry * wvy) / w2 : 0;
            if (t < 0) t = 0; else if (t > 1.2) t = 1.2;
            const d = _hyp(rx + wvx * t, ry + wvy * t) - myR - p.rad - _margin(_hyp(p.vx, p.vy));
            if (d < best) best = d;
        }
        const ens = scanData.enemies || [];
        for (let q = 0; q < ens.length && q < 8; q++)
        {
            const en = ens[q]; if (!en) continue;
            const ex = en.x, ey = en.y; if (!Number.isFinite(ex) || !Number.isFinite(ey)) continue;
            const d = _hyp(ex - mx, ey - my) - myR - 120;
            if (d < best) best = d;
        }
        for (let s2 = 1; s2 <= 2; s2++)
        {
            const d = 130 * s2;
            if (isBlockedWide(mx + dx * d, my + dy * d, AD_WALL_BODY, BLOCKS_MOVEMENT)) best -= 700;
        }
        return best;
    };

    let bi = 0, bs = -FAR_BIG;
    for (let i = 0; i < dirs.length; i++)
    {
        const d = dirs[i], c = clearOf(d.x, d.y) + (d.tag === 1 ? 45 : 0) - (d.tag === 2 ? 70 : 0) - (d.tag === 3 ? 160 : 0);
        if (c > bs) { bs = c; bi = i; }
    }
    if (_haveLastDir)
    {
        const c = clearOf(_lastDirX, _lastDirY) + 20;
        if (c >= bs - 25 && _lastDirX * dirs[bi].x + _lastDirY * dirs[bi].y > 0.7) return { x: _lastDirX, y: _lastDirY };
    }
    const out = dirs[bi];
    _lastDirX = out.x; _lastDirY = out.y; _haveLastDir = true;
    return { x: out.x, y: out.y };
}

function _adUpdate(mx, my)
{
    const now = _nowMs();
    if (!_ok(mx, -1e8, 1e8) || !_ok(my, -1e8, 1e8)) return false;
    _initPools();
    const speed = _speed(), myR = _ownRadius();
    _collect(mx, my, myR, now);
    _bdBuildThreats();
    if (_threatN === 0) { _forgetLastDir(); return false; }

    if (_bdDanger(mx, my, myR, 2.0, 1.2))
    {
        _calmSince = _nowMs(); _calmSent = false;
        let dir = _pickDir(mx, my, myR, speed);
        const nn = _nowMs();
        if (nn < _holdUntil) dir = { x: _holdX, y: _holdY };
        else if (dir.x * _holdX + dir.y * _holdY > 0.82) { _holdUntil = nn + 300; dir = { x: _holdX, y: _holdY }; }
        else { _holdX = dir.x; _holdY = dir.y; _holdUntil = nn + 460; }
        _lastDirX = dir.x; _lastDirY = dir.y; _haveLastDir = true;
        _sendMove(Math.round(mx + dir.x * AD_REACH), Math.round(my + dir.y * AD_REACH));
        return true;
    }
    if (_bdDanger(mx, my, myR, WARN_MUL, WARN_T))
    {
        const dir = _pickDir(mx, my, myR, speed);
        _sendMove(Math.round(mx + dir.x * AD_REACH * 0.45), Math.round(my + dir.y * AD_REACH * 0.45));
        return true;
    }
    if (!_calmSent && _nowMs() - _calmSince > 350) { _sendMove(Math.round(mx), Math.round(my)); _calmSent = true; }
    return false;
}

export function setupAutododge() { enableProjectileTracking(); }

export function resetAutododge() { _forgetLastDir(); resetProfiles(); }

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