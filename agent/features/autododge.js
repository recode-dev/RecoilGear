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
const CHAR_SPEED = 720;
const SPEED_MIN = 300;
const SPEED_MAX = 8500;
const AWARE = 3200;
const FALLBACK_RANGE = 2800;
const SKIN = 50;
const SPAWN_MARGIN = 60;
const TICK_MS = 16;
const TICK_MAX_MS = 250;
const HAZARD_MAX = 96;
const CAP_MAX = 16;
const SAFETY = 28;
const THREAT_MAX = 200;
const DYN_SPEED = 5000;
const FAR_BIG = 1e18;
const PROJ_RADIUS_DEFAULT = 150;
const OWN_RADIUS_MIN = 40;
const OWN_RADIUS_MAX = 200;

const CAND_ANGLES = 16;
const CAND_DIST = 400;
const COMMIT_MS = 150;
const REACH = 200;
const IDLE_ENTER = 100;
const IDLE_EXIT = -50;
const MIN_START_IMPROVEMENT = 80;
const MIN_SWITCH_IMPROVEMENT = 150;
const CATASTROPHIC = -250;
const SEND_DEADZONE = 32;
const TIME_GRID = [0, 0.05, 0.1, 0.15, 0.25, 0.35, 0.5, 0.65, 0.85, 1.1];
const TGRID_N = 10;

let _initDone = false;
const _hazards = [];
const _threats = [];
const _threatT = [];
let _hazardN = 0;
let _threatN = 0;
let _lastTick = 0;
let _moving = false;
let _dirX = 0;
let _dirY = 0;
let _commitUntil = 0;
let _clientTx = 1e9;
let _clientTy = 1e9;

function _nowMs() {
    return Date.now();
}

function _hyp(a, b) {
    return Math.sqrt(a * a + b * b);
}

function _initPools() {
    if (_initDone) return;
    for (let i = 0; i < THREAT_MAX; i++) {
        _threats.push({ x: 0, y: 0, vx: 0, vy: 0, rad: 0, totalRad: 0, life: 0 });
    }
    for (let i = 0; i < THREAT_MAX * TGRID_N; i++) {
        _threatT.push({ x: 0, y: 0 });
    }
    for (let i = 0; i < HAZARD_MAX; i++) {
        _hazards.push({ x: 0, y: 0, vx: 0, vy: 0, rad: 0, life: 0, ax: 0, ay: 0, bx: 0, by: 0, hasSegment: false });
    }
    _initDone = true;
}

function _speed() {
    const s = scanData.mySpeed | 0;
    if (s < SPEED_MIN || s > SPEED_MAX) return CHAR_SPEED;
    return s;
}

function _ownRadius() {
    const r = scanData.myRadius;
    if (r > 1) {
        if (r > OWN_RADIUS_MAX) return OWN_RADIUS_MAX;
        if (r < OWN_RADIUS_MIN) return OWN_RADIUS_MIN;
        return r;
    }
    return 120;
}

function _margin(spd) {
    return SAFETY * (1 + spd / DYN_SPEED);
}

function _projectileVel(p) {
    if (!p || !p.hasVelocitySample) return null;
    let dt = p.lastTs && p.spawnedAt ? _nowMs() - p.lastTs : 0;
    if (!(dt >= TICK_MS && dt <= TICK_MAX_MS)) dt = TICK_MS;
    return { vx: (p.x - p.lastX) * 1000 / dt, vy: (p.y - p.lastY) * 1000 / dt };
}

function _ballRadius(p) {
    if (p.isBeam) return PROJ_RADIUS_DEFAULT * 0.6;
    return p.radius > 0 ? p.radius : PROJ_RADIUS_DEFAULT;
}

function _traveled(p) {
    if (!p.spawnX && !p.spawnY) return 0;
    return _hyp(p.x - p.spawnX, p.y - p.spawnY);
}

function _isMine(p) {
    const t = p.ownerTeam | 0;
    return t >= 0 && t === (scanData.myTeamId | 0);
}

function _myShot(p, mx, my, bodyR) {
    if (!p.spawnX && !p.spawnY) return false;
    const sx = p.spawnX - mx;
    const sy = p.spawnY - my;
    const nx = p.x - mx;
    const ny = p.y - my;
    const dSpawn = sx * sx + sy * sy;
    const dNow = nx * nx + ny * ny;
    const r = bodyR + SPAWN_MARGIN;
    if (dSpawn > r * r) return false;
    return dNow > dSpawn;
}

function _shielded(p, mx, my) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const d = _hyp(dx, dy);
    if (d <= 1) return false;
    if (isBlockedAt(mx, my, BLOCKS_PROJECTILES)) return false;
    return traceWallHit(mx, my, dx / d, dy / d, d, BLOCKS_PROJECTILES) < d;
}

function _segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq < 1e-6 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    return _hyp(px - (ax + dx * t), py - (ay + dy * t));
}

function _inAware(h, mx, my, zoneSq) {
    if (h.hasSegment) {
        const d = _segDist(mx, my, h.ax, h.ay, h.bx, h.by);
        return d * d <= zoneSq;
    }
    const dx = h.x - mx;
    const dy = h.y - my;
    return dx * dx + dy * dy <= zoneSq;
}

function _kindReach(p, spec, spd) {
    let r = spec && spec.maxRange > 0 ? spec.maxRange : 0;
    if (spec && spec.chargedRange > 0 && spd > 3500) r = spec.chargedRange;
    if (r <= 0 && p.castRange > 0) r = p.castRange;
    if (r <= 0 && p.isThrower && (p.targetX || p.targetY) && p.spawnX && p.spawnY) {
        r = _hyp(p.targetX - p.spawnX, p.targetY - p.spawnY);
    }
    if (r <= 0) r = FALLBACK_RANGE;
    if (spec && spec.reachAdj) r += spec.reachAdj;
    return r > 0 && r < 70000 ? r : FALLBACK_RANGE;
}

function _lifeLeft(p, spec, spd, nowMs) {
    const maxR = _kindReach(p, spec, spd);
    if (spec && (spec.flags & K_FADE)) {
        let age = nowMs - (p.spawnedAt ? p.spawnedAt : nowMs);
        if (age < 0) age = 0;
        const left = maxR * (1 - age / 1000);
        return left > 0 ? left : 0;
    }
    const left = maxR - _traveled(p);
    return left > 0 ? left : 0;
}

function _pushHazard() {
    const h = _hazards[_hazardN];
    h.x = 0;
    h.y = 0;
    h.vx = 0;
    h.vy = 0;
    h.rad = 0;
    h.life = 0;
    h.ax = 0;
    h.ay = 0;
    h.bx = 0;
    h.by = 0;
    h.hasSegment = false;
    _hazardN++;
    return h;
}

function _collect(mx, my, myRadius, nowMs) {
    const zoneSq = AWARE * AWARE;
    const bodyR = myRadius + SKIN;
    const list = (scanData.projectiles || []).slice().sort((a, b) => {
        const da = (a.x - mx) * (a.x - mx) + (a.y - my) * (a.y - my);
        const db = (b.x - mx) * (b.x - mx) + (b.y - my) * (b.y - my);
        return da - db;
    });
    _hazardN = 0;

    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p) continue;
        if (_isMine(p)) continue;
        if (_myShot(p, mx, my, bodyR)) continue;
        if (_shielded(p, mx, my)) continue;

        const caps = shapeHazards(p, nowMs);
        for (let c = 0; c < caps.length && c < CAP_MAX; c++) {
            const cap = caps[c];
            const lifeSec = (cap.t1 - nowMs) / 1000;
            if (lifeSec <= 0) continue;
            if (_hazardN >= HAZARD_MAX) break;
            const h = _pushHazard();
            h.rad = cap.radius;
            h.hasSegment = !!cap.hasSegment;
            h.life = lifeSec;
            if (cap.hasSegment) {
                h.ax = cap.ax;
                h.ay = cap.ay;
                h.bx = cap.bx;
                h.by = cap.by;
            } else {
                h.x = cap.x;
                h.y = cap.y;
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
        if (vx === 0 && vy === 0) {
            const est = _projectileVel(p);
            if (est) {
                vx = est.vx;
                vy = est.vy;
            }
        }
        if (!(vx >= -1e8 && vx <= 1e8 && vy >= -1e8 && vy <= 1e8)) {
            vx = 0;
            vy = 0;
        }
        const flown = _traveled(p);
        if (spec && (spec.flags & K_LOCKPATH) && flown > 120 && p.spawnX && p.spawnY) {
            let base = _hyp(vx, vy);
            if (base < 1) base = 1;
            vx = (p.x - p.spawnX) / flown * base;
            vy = (p.y - p.spawnY) / flown * base;
        }
        let spd = _hyp(vx, vy);
        if (spec && spec.speedMul > 0 && spd > 3500) {
            vx *= spec.speedMul;
            vy *= spec.speedMul;
            spd *= spec.speedMul;
        }
        if (spd < 1) spd = 1;
        const lockPath = !!(spec && (spec.flags & K_LOCKPATH)) || !!p.isBeam;
        const blob = !!(spec && (spec.flags & K_BLOB)) || (!lockPath && !!p.isThrower);
        const fit = fitOf(name);
        const shotR = _ballRadius(p) + (spec ? (spec.growR | 0) : 0);
        const rad = shotR + fit.pad + shotR * fit.grow;
        const