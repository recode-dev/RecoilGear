import { sendCommand } from "../core/commands.js";
import { getFunctions } from "../core/functions.js";
import { offsets } from "../core/offsets.js";
import {
    TICKS_PER_SEC,
    collisionRadius,
    dataOf,
    enableProjectileTracking,
    inputSentSince,
    moveAppliedSince,
    onDataReload,
    scanData
} from "../core/scan.js";
import {
    BLOCKS_MOVEMENT,
    BLOCKS_PROJECTILES,
    firstWallHit,
    isBlockedWide,
    pathBlocked,
    tileSizeUnits,
    wallsVersion
} from "../utils/walls.js";

const DEG = 90;
const HALF = 180;
const FULL = 360;
const MAXI = 0x7fffffff;
const GUARD = 0xb504;

const SIN = new Int32Array(91);
for (let i = 0; i <= DEG; i++) SIN[i] = Math.round(Math.sin((i * Math.PI) / 180) * 1024);

const ATAN = new Int32Array(129);
for (let i = 0; i <= 128; i++) ATAN[i] = Math.round((Math.atan(i / 128) * 180) / Math.PI);

const idiv = (a, b) => Math.trunc(a / b);
const wrap360 = (a) => {
    const r = a % FULL;
    return r < 0 ? r + FULL : r;
};
const shift10 = (v) => (v >= 0 ? v + 1023 : v) >> 10;
const atanIdx = (num, den) => idiv(num << 7, den);

function sinScaled(angle) {
    const r = wrap360(angle);
    if (r < HALF) {
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

    clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),

    sqrt: (v) => {
        if (v <= 0) return 0;
        if (v >= MAXI) return 46340;
        return Math.floor(Math.sqrt(v));
    },

    sin: (angle) => sinScaled(angle),
    cos: (angle) => sinScaled(angle + DEG),

    getRotatedX: (x, y, angle) => shift10(sinScaled(angle + DEG) * x - sinScaled(angle) * y),
    getRotatedY: (x, y, angle) => shift10(sinScaled(angle) * x + sinScaled(angle + DEG) * y),

    getAngle: (dx, dy) => {
        if (dx === 0 && dy === 0) return 0;
        if (dx > 0 && dy >= 0) {
            if (dy < dx) return ATAN[atanIdx(dy, dx)];
            return DEG - ATAN[atanIdx(dx, dy)];
        }
        const ax = dx < 0 ? -dx : dx;
        const ay = dy < 0 ? -dy : dy;
        if (dx <= 0 && dy > 0) {
            if (ax < dy) return ATAN[atanIdx(ax, dy)] + DEG;
            return HALF - ATAN[atanIdx(dy, ax)];
        }
        if (dx < 0 && dy <= 0) {
            if (ay < ax) return ATAN[atanIdx(ay, ax)] + HALF;
            if (ay !== 0) return 270 - ATAN[atanIdx(ax, ay)];
        } else {
            if (ax < ay) return ATAN[atanIdx(ax, ay)] + 270;
            if (ax !== 0) return wrap360(FULL - ATAN[atanIdx(ay, ax)]);
        }
        return 0;
    },

    normalizeAngle360: (a) => wrap360(a),

    normalizeAngle180: (a) => {
        const r = wrap360(a);
        return r < HALF ? r : r - FULL;
    },

    getAngleBetween: (a, b) => LogicMath.abs(LogicMath.normalizeAngle180(a - b)),

    mulDiv: (a, b, c) =>
        c === 0
            ? 0
            : Number((BigInt(Math.trunc(a)) * BigInt(Math.trunc(b))) / BigInt(Math.trunc(c))),

    getDistanceSquareToLine: (ax, ay, bx, by, px, py) => {
        ax = ax | 0;
        ay = ay | 0;
        bx = bx | 0;
        by = by | 0;
        px = px | 0;
        py = py | 0;
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        const rx = px - ax;
        const ry = py - ay;
        if (lenSq === 0) return rx * rx + ry * ry;
        const dot = rx * dx + ry * dy;
        if (dot < 1) return rx * rx + ry * ry;
        if (dot < lenSq) return rx * rx + ry * ry - LogicMath.mulDiv(dot, dot, lenSq);
        const ex = px - bx;
        const ey = py - by;
        return ex * ex + ey * ey;
    },

    getDistanceToLine: (ax, ay, bx, by, px, py) =>
        LogicMath.sqrt(LogicMath.getDistanceSquareToLine(ax, ay, bx, by, px, py))
};

function length(x, y) {
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return 46340;
    const s = x * x + y * y;
    return s < 0 ? 46340 : LogicMath.sqrt(s);
}

function lengthSquared(x, y) {
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return MAXI;
    const s = x * x + y * y;
    return s < 0 ? MAXI : s;
}

function distance(x1, y1, x2, y2) {
    return length(x2 - x1, y2 - y1);
}

function distanceSquared(x1, y1, x2, y2) {
    return lengthSquared(x2 - x1, y2 - y1);
}

function segmentHitAlong(x1, y1, x2, y2, x3, y3, x4, y4) {
    const ax = x2 - x1;
    const ay = y2 - y1;
    const bx = x4 - x3;
    const by = y4 - y3;
    const den = ax * by - ay * bx;
    if (den === 0) return -1;
    const ta = ((x3 - x1) * by - (y3 - y1) * bx) / den;
    const tb = ((x3 - x1) * ay - (y3 - y1) * ax) / den;
    if (ta < 0.02 || ta > 1 || tb < 0 || tb > 1) return -1;
    return ta * length(ax, ay);
}

function dot(ax, ay, bx, by) {
    return ax * bx + ay * by;
}

function normalize(vec, scale) {
    const len = length(vec.x, vec.y);
    if (len === 0) return vec;
    vec.x = idiv(vec.x * scale, len);
    vec.y = idiv(vec.y * scale, len);
    return vec;
}

function rotate(vec, angle) {
    const x = LogicMath.getRotatedX(vec.x, vec.y, angle);
    const y = LogicMath.getRotatedY(vec.x, vec.y, angle);
    vec.x = x;
    vec.y = y;
    return vec;
}

function _missDistance(x1, y1, x2, y2, cx, cy) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    const rx = cx - x1;
    const ry = cy - y1;
    if (!(lenSq > 0)) return Math.sqrt(rx * rx + ry * ry);
    let t = (rx * dx + ry * dy) / lenSq;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = rx - dx * t;
    const qy = ry - dy * t;
    return Math.sqrt(qx * qx + qy * qy);
}

function segmentHitsCircle(x1, y1, x2, y2, cx, cy, radius) {
    return _missDistance(x1, y1, x2, y2, cx, cy) <= radius;
}

const MOVE_INPUT_TYPE = 2;

const TUNE = {
    AWARE: 3200,
    DIR_COUNT: 40,
    SKIN: 50,
    LOCK_MS: 40,
    REACH: 1200,
    HORIZON_S: 1.4,
    KEEP_BAND: 250,
    MOMENTUM: 150,
    CURVE_MAX: 400,
    CURVE_FRAC: 0.35,
    RELEASE_GRACE_MS: 120,
    WALL_HIT: 2400,
    MIN_ROOM: 400,
    MERGE_MAX_RAD: 240,
    MERGE_SAME_VOLLEY: 260,
    MIN_POS: 50,
    CROSS_W: 300,
    CORRIDOR_W: 75,
    SWITCH_MARGIN: 200,
    REFREEZE_DIST: 260,
    ENGAGE_S: 1.6,
    ENGAGE_NEAR: 700,
    KEEP_FLOOR: 140,
    VOLLEY_RAD: 60,
    CLEAR_HORIZON_S: 2.6,
    WEAK_RELEASE_MS: 140
};

let _heading = null;
let _headingIdx = -1;
let _holdUntil = 0;
let _lastDangerTs = 0;
let _lastSentX = 1e9;
let _lastSentY = 1e9;
let _lastSentAt = 0;
let _targetX = 0;
let _targetY = 0;
let _weakSince = 0;
let _hitbox = 0;
let _walkDir = null;
let _walkAt = 0;
let _walkPx = 0;
let _walkPy = 0;
let _radiusMemoData = null;
let _radiusMemoValue = 0;
const BODY_SUBTILE_UNITS = 199;
const _ring = [];
const _options = {
    reactionSpeed: 100,
    directionPrecision: 40,
    safetyMargin: 25
};
let _threatCacheAt = -1;
let _threatCache = null;
let _roomMemo = null;
let _roomMemoVer = 0;
let _roomMemoX = 0;
let _roomMemoY = 0;
const ROOM_Q = 50;
const WALL_VALIDATE = 10;

function _buildRing() {
    _ring.length = 0;
    const n = TUNE.DIR_COUNT;
    for (let i = 0; i < n; i++) {
        const a = LogicMath.normalizeAngle360(Math.round((360 * i) / n));
        _ring.push({
            x: LogicMath.cos(a),
            y: LogicMath.sin(a)
        });
    }
    _headingIdx = -1;
}

function _syncTuning() {
    const t = Math.max(0, Math.min(100, _options.reactionSpeed)) / 100;
    TUNE.LOCK_MS = Math.max(40, Math.round(80 - t * 40));
    const n = Math.max(8, Math.min(128, _options.directionPrecision | 0));
    if (n !== TUNE.DIR_COUNT) {
        TUNE.DIR_COUNT = n;
        if (_ring.length) _buildRing();
    }
    TUNE.SKIN = Math.max(0, Math.min(120, _options.safetyMargin)) * 2;
}
_syncTuning();
function _ballR(p) {
    return p.radius;
}

function _bounceBudget(p) {
    if (!p.bouncing || !(p.bounceAdd > 0)) return 0;
    const keep = p.bounceKeep > 0 && p.bounceKeep <= 1 ? p.bounceKeep : 0.5;
    let hops = 2;
    if (p.bounceMax > 0 && p.bounceMax <= 12) hops = p.bounceMax;
    else if (p.bounceMax > 12) hops = LogicMath.clamp(Math.floor(p.bounceMax / 200), 1, 6);
    let budget = 0;
    let factor = 1;
    for (let i = 0; i < hops; i++) {
        factor *= keep;
        budget += p.bounceAdd * factor;
        if (!p.rehit) break;
    }
    return budget;
}

function _sweptEnd(x, y, vx, vy, left) {
    const vlen = length(vx, vy);
    if (!(vlen > 1)) return null;
    let span = vlen * TUNE.HORIZON_S;
    if (left >= 0 && left < span) span = left;
    if (!(span > 0)) return { x: x, y: y, len: 0 };
    const k = span / vlen;
    return { x: x + vx * k, y: y + vy * k, len: span };
}

function _reachesMe(p, myX, myY, contact, vx, vy, left) {
    const vlen = length(vx, vy);
    if (p.isIndirect && p.hasTarget) {
        if (distance(p.targetX, p.targetY, myX, myY) > contact) return false;
        const toLand = distance(p.x, p.y, p.targetX, p.targetY);
        if (left >= 0 && left + 1 < toLand) return false;
        return true;
    }
    if (!(vlen > 1)) return distance(p.x, p.y, myX, myY) <= contact;
    if (left >= 0 && left < distance(p.x, p.y, myX, myY) - contact) return false;
    const end = _sweptEnd(p.x, p.y, vx, vy, left);
    return _missDistance(p.x, p.y, end.x, end.y, myX, myY) <= contact;
}

function _steerActive(p) {
    if (!(p.steer > 0) && !p.homing) return false;
    const ignore = p.steerIgnoreMs > 0 ? p.steerIgnoreMs : 0;
    const life = p.steerLifeMs > 0 ? p.steerLifeMs : 0;
    if (ignore <= 0 && life <= 0) return true;
    const age = p.ageMs > 0 ? p.ageMs : 0;
    if (age < ignore) return false;
    if (life > 0 && age > ignore + life) return false;
    return true;
}

const _scratchA = { x: 0, y: 0 };
const _scratchB = { x: 0, y: 0 };
const _scratchC = { x: 0, y: 0 };
const _scratchD = { x: 0, y: 0 };
const _scores = new Float64Array(160);
const _order = new Int32Array(160);

function _wallShields(px, py, ex, ey, mx, my, hitR) {
    const dx = ex - px;
    const dy = ey - py;
    const fx = px - mx;
    const fy = py - my;
    const a = dx * dx + dy * dy;
    const c = fx * fx + fy * fy - hitR * hitR;
    if (c <= 0) return false;
    let t = 1;
    if (a > 0) {
        const b = 2 * (fx * dx + fy * dy);
        const disc = b * b - 4 * a * c;
        if (disc > 0) {
            const t0 = (-b - Math.sqrt(disc)) / (2 * a);
            if (t0 < 1) t = t0 > 0 ? t0 : 0;
        }
    }
    if (t <= 0) return false;
    return pathBlocked(px, py, px + dx * t, py + dy * t, BLOCKS_PROJECTILES);
}

function _collectLive(myX, myY, myRadius, now, mySpeed) {
    const out = [];
    const shots = scanData.projectiles;
    if (!shots || shots.length === 0) return out;
    const zoneSq = TUNE.AWARE * TUNE.AWARE;
    const armedOwners = new Set();
    const buckets = new Map();
    const bucketOrder = [];
    for (let i = 0; i < shots.length; i++) {
        const p = shots[i];
        if (!p) continue;
        if (!p.gid) continue;
        if (distanceSquared(p.x, p.y, myX, myY) > zoneSq) continue;
        const tt = p.travelType | 0;
        const indirect = !!p.isIndirect || tt > 0;
        const lob = tt === 6 || (p.gravity | 0) > 0;
        const boomerang = (p.boomerang | 0) > 0;
        const grapples = !!p.grapples || tt === 10;
        const attaches = tt === 9 || !!p.attachArea;
        const trigger = (p.triggerMs | 0) > 0;
        const shotR = _ballR(p);
        if (!(shotR > 0)) continue;
        const hitR = shotR + myRadius;
        let rad = hitR + TUNE.SKIN + 60 + shotR * 0.45;
        if (p.volleyMs > 0) rad += TUNE.VOLLEY_RAD;
        if (p.stunMs > 0 || p.silenceMs > 0) rad += 40;
        if (p.attachArea) rad += 30;
        if (p.trail) rad += LogicMath.min(200, p.trailMin || 0) / 2;

        if (indirect && lob && p.hasTarget && !boomerang && !grapples && !attaches) {
            const lx = p.targetX;
            const ly = p.targetY;
            if (distance(lx, ly, myX, myY) <= rad + 150) {
                const dist = distance(p.x, p.y, lx, ly);
                const left = p.seg > 0 ? p.seg : -1;
                if (left >= 0 && left + 1 < dist) continue;
                const flight = p.speed > 0 ? p.speed : 0;
                const t2land = flight > 0 ? dist / flight : 0;
                if (!_heading && !armedOwners.has(p.ownerIndex) && t2land > TUNE.ENGAGE_S) continue;
                armedOwners.add(p.ownerIndex);
                out.push({
                    x: lx,
                    y: ly,
                    vx: 0,
                    vy: 0,
                    rad: rad,
                    hitRad: rad,
                    left: -1,
                    chase: 0,
                    owner: p.ownerIndex,
                    sx: p.spawnX,
                    sy: p.spawnY
                });
                continue;
            }
        }

        let vx = p.vx;
        let vy = p.vy;
        if (!isFinite(vx) || !isFinite(vy)) {
            vx = 0;
            vy = 0;
        }
        let spd = length(vx, vy);
        let chase = 0;
        if ((p.homing && _steerActive(p)) || attaches) {
            chase = 1;
            if (spd > 1) {
                const dx = myX - p.x;
                const dy = myY - p.y;
                const d = length(dx, dy);
                if (d > 1) {
                    vx = (dx / d) * spd;
                    vy = (dy / d) * spd;
                }
                rad += 60;
            }
        } else if (spd < 1 && p.hasTarget && p.speed > 0) {
            _scratchA.x = p.targetX - p.x;
            _scratchA.y = p.targetY - p.y;
            normalize(_scratchA, 1000);
            vx = (_scratchA.x / 1000) * p.speed;
            vy = (_scratchA.y / 1000) * p.speed;
            spd = length(vx, vy);
        } else if (spd < 1 && (p.spawnX || p.spawnY)) {
            const rx = p.x - p.spawnX;
            const ry = p.y - p.spawnY;
            const rsq = rx * rx + ry * ry;
            if (rsq >= 16) {
                let est = p.speed > 0 ? p.speed : 0;
                if (!(est > 0) && p.ageMs > 40) {
                    const avg = (Math.sqrt(rsq) * 1000) / p.ageMs;
                    if (avg >= 300 && avg <= 8500) est = Math.round(avg);
                }
                if (est > 0) {
                    const inv = est / Math.sqrt(rsq);
                    vx = rx * inv;
                    vy = ry * inv;
                    spd = est;
                }
            }
        }
        const lockPath = !!p.isBeam || !!p.beamCopy;
        const landed = trigger && !(p.seg > 0);
        const blob = landed || (!lockPath && !indirect && spd < 120);
        if (blob && distance(p.x, p.y, myX, myY) > rad + 150) continue;
        const skipAlong = blob || indirect || boomerang || grapples || attaches || lob;
        if (!skipAlong && spd >= 1) {
            const heading = LogicMath.normalizeAngle180(LogicMath.getAngle(vx, vy));
            _scratchA.x = myX - p.x;
            _scratchA.y = myY - p.y;
            const frame = rotate(_scratchA, -heading);
            const playerAlong = frame.x;
            const steerBack = p.steer > 0 || p.homing ? 50 : 0;
            if (playerAlong < -steerBack) continue;
            _scratchB.x = vx;
            _scratchB.y = vy;
            const reachDir = normalize(_scratchB, Math.max(playerAlong, 0) | 0);
            const endX = p.hasTarget ? p.targetX : p.x + reachDir.x;
            const endY = p.hasTarget ? p.targetY : p.y + reachDir.y;
            if (!p.passesEnv && !p.piercesEnv && _wallShields(p.x, p.y, endX, endY, myX, myY, hitR))
                continue;
        }
        const travel = spd >= 1 ? spd : p.speed > 0 ? p.speed : 0;
        let left = p.seg > 0 ? p.seg : p.seg0 > 0 ? 0 : -1;
        if (p.constantFly && p.earlyTicks > 0 && travel > 0 && left >= 0)
            left = LogicMath.min(left, (p.earlyTicks * travel) / TICKS_PER_SEC);
        if (left >= 0) left += _bounceBudget(p);
        if (!blob && left >= 0 && left <= 10 && distance(p.x, p.y, myX, myY) > hitR) continue;
        if (!_heading && travel > 0 && !armedOwners.has(p.ownerIndex)) {
            const gap = distance(p.x, p.y, myX, myY) - hitR;
            if (gap / travel > TUNE.ENGAGE_S) continue;
        }
        armedOwners.add(p.ownerIndex);
        const vb = p.volleyBullets | 0;
        const vs = p.volleySpread | 0;
        if (!blob && spd >= 1 && vb >= 2 && vs > 0) {
            const pk = p.ownerIndex + ":" + (p.spawnX | 0) + ":" + (p.spawnY | 0);
            let bucket = buckets.get(pk);
            if (!bucket) {
                bucket = {
                    dirs: [],
                    spawnX: p.spawnX,
                    spawnY: p.spawnY,
                    owner: p.ownerIndex,
                    speed: spd,
                    vb,
                    vs,
                    seg0: 0,
                    hitR: 0,
                    rad: 0
                };
                buckets.set(pk, bucket);
                bucketOrder.push(pk);
            }
            bucket.dirs.push(Math.atan2(vy, vx));
            bucket.seg0 = p.seg0 > 0 ? p.seg0 : p.seg > 0 ? p.seg : bucket.seg0;
            bucket.hitR = hitR;
            bucket.rad = rad;
        }
        if (!_reachesMe(p, myX, myY, hitR, vx, vy, blob ? -1 : left)) {
            if (blob || chase) continue;
            const end = _sweptEnd(p.x, p.y, vx, vy, left);
            if (!end) continue;
            const miss = _missDistance(p.x, p.y, end.x, end.y, myX, myY);
            const gap = distance(p.x, p.y, myX, myY);
            const tti = travel > 0 ? LogicMath.max(0, gap - hitR) / travel : TUNE.HORIZON_S;
            const widen = LogicMath.min(TUNE.REACH, (mySpeed * tti) | 0);
            if (miss > hitR + widen) continue;
        }
        out.push({
            x: p.x,
            y: p.y,
            vx: blob ? 0 : vx,
            vy: blob ? 0 : vy,
            rad: rad,
            hitRad: hitR,
            left: left,
            chase: chase,
            owner: p.ownerIndex,
            sx: p.spawnX,
            sy: p.spawnY
        });
    }
    for (let bi = 0; bi < bucketOrder.length; bi++) {
        const bucket = buckets.get(bucketOrder[bi]);
        const dirs = bucket.dirs;
        const step = (bucket.vs / (bucket.vb - 1)) * (Math.PI / 180);
        const missing = bucket.vb - dirs.length;
        if (missing <= 0) continue;
        const extra = [];
        if (dirs.length >= 2) {
            let last = dirs[0];
            let delta = null;
            for (let k = 1; k < dirs.length; k++) {
                let d = dirs[k] - last;
                while (d > Math.PI) d -= 2 * Math.PI;
                while (d < -Math.PI) d += 2 * Math.PI;
                if (Math.abs(d) > (45 * Math.PI) / 180) {
                    delta = null;
                } else if (delta === null || d * delta > 0) {
                    delta = delta === null ? d : delta;
                }
                last = dirs[k];
            }
            if (delta !== null && delta !== 0) {
                for (let k = 1; k <= missing; k++) extra.push(last + delta * k);
                if (extra.length > 6) extra.length = 6;
            }
        } else if (step > 0) {
            extra.push(dirs[0] + step, dirs[0] - step);
        }
        for (let k = 0; k < extra.length; k++) {
            const a = extra[k];
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            out.push({
                x: bucket.spawnX,
                y: bucket.spawnY,
                vx: ca * bucket.speed,
                vy: sa * bucket.speed,
                rad: bucket.rad,
                hitRad: bucket.hitR,
                left: bucket.seg0 > 0 ? bucket.seg0 : -1,
                chase: 0,
                owner: bucket.owner,
                sx: bucket.spawnX,
                sy: bucket.spawnY
            });
        }
    }
    return _mergeThreats(out, myX, myY);
}

function _mergeGroup(arr, px, py) {
    const ref = arr[0];
    const spd = length(ref.vx, ref.vy);
    if (!(spd > 1)) return null;
    const ux = ref.vx / spd;
    const uy = ref.vy / spd;
    const alongPlayer = (px - ref.x) * ux + (py - ref.y) * uy;
    let lo = 0;
    let hi = 0;
    let hitLo = 0;
    let hitHi = 0;
    let left = Infinity;
    for (let i = 0; i < arr.length; i++) {
        const t = arr[i];
        const alongT = (t.x - ref.x) * ux + (t.y - ref.y) * uy;
        const forward = t.vx * ux + t.vy * uy;
        let fx = t.x;
        let fy = t.y;
        if (forward > 1) {
            const dt = (alongPlayer - alongT) / forward;
            if (dt > 0 && dt < TUNE.HORIZON_S) {
                fx = t.x + t.vx * dt;
                fy = t.y + t.vy * dt;
            }
        }
        const off = (fx - ref.x) * -uy + (fy - ref.y) * ux;
        const contact = t.hitRad > 0 ? t.hitRad : t.rad;
        lo = LogicMath.min(lo, off - t.rad);
        hi = LogicMath.max(hi, off + t.rad);
        hitLo = LogicMath.min(hitLo, off - contact);
        hitHi = LogicMath.max(hitHi, off + contact);
        left = LogicMath.min(left, t.left);
    }
    const mid = (lo + hi) / 2;
    const half = (hi - lo) / 2;
    if (half > TUNE.MERGE_MAX_RAD) return null;
    return {
        x: ref.x - uy * mid,
        y: ref.y + ux * mid,
        vx: ref.vx,
        vy: ref.vy,
        rad: half,
        hitRad: (hitHi - hitLo) / 2,
        left,
        chase: ref.chase | 0,
        owner: ref.owner
    };
}

function _mergeThreats(list, px, py) {
    if (list.length < 2) return list;
    const parent = [];
    for (let i = 0; i < list.length; i++) parent.push(i);
    const find = (i) => {
        let r = i;
        while (parent[r] !== r) r = parent[r];
        while (parent[i] !== r) {
            const n = parent[i];
            parent[i] = r;
            i = n;
        }
        return r;
    };
    const reach = TUNE.MERGE_SAME_VOLLEY * TUNE.MERGE_SAME_VOLLEY;
    for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
            const a = list[i];
            const b = list[j];
            if (!(a.owner >= 0) || a.owner !== b.owner) continue;
            if (!(length(a.vx, a.vy) > 1) || !(length(b.vx, b.vy) > 1)) continue;
            const dx = a.sx - b.sx;
            const dy = a.sy - b.sy;
            if (dx * dx + dy * dy > reach) continue;
            parent[find(i)] = find(j);
        }
    }
    const groups = new Map();
    for (let i = 0; i < list.length; i++) {
        const root = find(i);
        const bucket = groups.get(root);
        if (bucket) bucket.push(list[i]);
        else groups.set(root, [list[i]]);
    }
    const out = [];
    for (const bucket of groups.values()) {
        if (bucket.length === 1) {
            out.push(bucket[0]);
            continue;
        }
        const merged = _mergeGroup(bucket, px, py);
        if (merged) out.push(merged);
        else for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
    }
    return out;
}

function _clearanceFor(threats, myX, myY, mvx, mvy) {
    let minClear = Infinity;
    for (let i = 0; i < threats.length; i++) {
        const t = threats[i];
        const relx = t.x - myX;
        const rely = t.y - myY;
        const reach = distance(t.x, t.y, myX, myY);
        const spd = length(t.vx, t.vy);
        let maxT = TUNE.CLEAR_HORIZON_S;
        if (spd > 1 && t.left >= 0) maxT = LogicMath.min(maxT, t.left / spd);
        let dist;
        if (t.chase) {
            const away = reach > 1 ? -(mvx * relx + mvy * rely) / reach : length(mvx, mvy);
            dist = reach + (away - spd) * maxT;
            if (dist < 0) dist = 0;
        } else if (length(t.vx, t.vy) < 1) {
            const away = reach > 1 ? -(mvx * relx + mvy * rely) / reach : length(mvx, mvy);
            dist = reach + away * maxT;
        } else {
            const vrx = t.vx - mvx;
            const vry = t.vy - mvy;
            const vlen = length(vrx, vry);
            if (lengthSquared(vrx, vry) < 1) {
                dist = reach;
            } else {
                const heading = LogicMath.normalizeAngle180(LogicMath.getAngle(vrx, vry));
                _scratchB.x = relx;
                _scratchB.y = rely;
                const frame = rotate(_scratchB, -heading);
                const towards = -dot(relx, rely, vrx, vry);
                if (towards <= 0) {
                    dist = reach;
                } else if (frame.x >= 0) {
                    dist = reach;
                } else if (LogicMath.abs(frame.x) >= maxT * vlen) {
                    _scratchB.x = vrx;
                    _scratchB.y = vry;
                    const end = normalize(_scratchB, (maxT * vlen) | 0);
                    dist = distance(t.x + end.x, t.y + end.y, myX, myY);
                } else {
                    dist = LogicMath.getDistanceToLine(t.x, t.y, t.x + vrx, t.y + vry, myX, myY);
                }
            }
        }
        minClear = LogicMath.min(minClear, dist - t.rad);
    }
    return minClear;
}

function _pathEnd(t) {
    return _sweptEnd(t.x, t.y, t.vx, t.vy, t.left);
}

function _pathsHitMe(threats, px, py) {
    for (let i = 0; i < threats.length; i++) {
        const t = threats[i];
        if (t.chase) {
            const reach = distance(t.x, t.y, px, py);
            const spd = length(t.vx, t.vy);
            const leftT = t.left >= 0 ? t.left : TUNE.CLEAR_HORIZON_S * spd;
            const maxT = spd > 1 ? LogicMath.min(TUNE.HORIZON_S, leftT / spd) : TUNE.HORIZON_S;
            if (reach - t.hitRad <= spd * maxT) return true;
            continue;
        }
        const end = _pathEnd(t);
        const endX = end ? end.x : t.x;
        const endY = end ? end.y : t.y;
        if (segmentHitsCircle(t.x, t.y, endX, endY, px, py, t.hitRad)) return true;
    }
    return false;
}

function _threatPaths(threats) {
    const out = [];
    for (let i = 0; i < threats.length; i++) {
        const t = threats[i];
        const end = _pathEnd(t);
        if (!end) continue;
        out.push({
            x1: t.x,
            y1: t.y,
            x2: end.x,
            y2: end.y,
            rad: t.rad
        });
    }
    return out;
}

function _pathCoversPoint(paths, px, py, radius) {
    for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        const dx = p.x2 - p.x1;
        const dy = p.y2 - p.y1;
        const lenSq = dx * dx + dy * dy;
        let t = lenSq < 1 ? 0 : ((px - p.x1) * dx + (py - p.y1) * dy) / lenSq;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        if (distance(px, py, p.x1 + dx * t, p.y1 + dy * t) < radius) return true;
    }
    return false;
}

function _crossesPath(paths, px, py, stepX, stepY) {
    const tx = px + stepX;
    const ty = py + stepY;
    for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        if (segmentHitAlong(px, py, tx, ty, p.x1, p.y1, p.x2, p.y2) >= 0) return true;
    }
    return false;
}

function _corridorPenalty(paths, px, py, stepX, stepY) {
    const ex = px + stepX;
    const ey = py + stepY;
    let worst = 0;
    for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        const dx = p.x2 - p.x1;
        const dy = p.y2 - p.y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 1) continue;
        const ux = dx / lenSq;
        const uy = dy / lenSq;
        const rx = ex - p.x1;
        const ry = ey - p.y1;
        const along = rx * ux + ry * uy;
        if (along <= 0) continue;
        const perp = Math.abs(rx * uy - ry * ux) * Math.sqrt(lenSq);
        const corridor = p.rad + 140;
        if (perp >= corridor) continue;
        const pen = TUNE.CORRIDOR_W * (1 - perp / corridor);
        if (pen > worst) worst = pen;
    }
    return worst;
}

function _wallRoom(myX, myY, dir, bodyR) {
    const maxDist = TUNE.REACH;
    _scratchC.x = dir.x;
    _scratchC.y = dir.y;
    const step = normalize(_scratchC, maxDist | 0);
    const endX = myX + step.x;
    const endY = myY + step.y;
    const hit = firstWallHit(myX, myY, endX, endY, _bodySubtiles(_hitbox));
    if (hit >= 0) {
        if (hit >= maxDist) return maxDist;
        const room = hit - bodyR;
        return room > TUNE.MIN_ROOM ? room : 0;
    }
    if (!isBlockedWide(endX, endY, bodyR, BLOCKS_MOVEMENT)) return maxDist;
    let lo = 0;
    let hi = maxDist;
    for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        _scratchD.x = dir.x;
        _scratchD.y = dir.y;
        const p = normalize(_scratchD, mid | 0);
        if (isBlockedWide(myX + p.x, myY + p.y, bodyR, BLOCKS_MOVEMENT)) hi = mid;
        else lo = mid;
    }
    const room = lo - bodyR;
    return room > TUNE.MIN_ROOM ? room : 0;
}

function _roomFor(myX, myY, idx, bodyR) {
    const ver = wallsVersion();
    const qx = (myX / ROOM_Q) | 0;
    const qy = (myY / ROOM_Q) | 0;
    if (!_roomMemo || _roomMemoVer !== ver || _roomMemoX !== qx || _roomMemoY !== qy) {
        _roomMemo = new Int16Array(_ring.length);
        for (let i = 0; i < _roomMemo.length; i++) _roomMemo[i] = -32768;
        _roomMemoVer = ver;
        _roomMemoX = qx;
        _roomMemoY = qy;
    }
    const m = _roomMemo[idx];
    if (m !== -32768) return m;
    const room = _wallRoom(myX, myY, _ring[idx], bodyR);
    _roomMemo[idx] = room;
    return room;
}

function _sendMove(logic, tx, ty) {
    if (!logic || logic.isNull()) return false;
    if (!isFinite(tx) || !isFinite(ty)) return false;
    const now = Date.now();
    if (tx === _lastSentX && ty === _lastSentY && now - _lastSentAt < 40) return true;
    try {
        const fns = getFunctions();
        if (moveAppliedSince(tx, ty, 15) && inputSentSince(tx, ty, 15)) {
            _lastSentX = tx;
            _lastSentY = ty;
            _lastSentAt = now;
            return true;
        }
        if (!moveAppliedSince(tx, ty, 20))
            fns.LogicBattleModeClient_setClientPredictionMoveTo(logic, tx, ty, 1);
        const ok = sendCommand(MOVE_INPUT_TYPE, (ci) => {
            ci.add(offsets.ClientInput_x).writeS32(tx);
            ci.add(offsets.ClientInput_y).writeS32(ty);
        });
        _lastSentX = tx;
        _lastSentY = ty;
        _lastSentAt = now;
        return ok;
    } catch (_) {
        return false;
    }
}

function _directionScore(hazards, paths, myX, myY, bodyR, speed, idx, refDir) {
    const d = _ring[idx];
    _scratchA.x = d.x;
    _scratchA.y = d.y;
    const dirSpeed = normalize(_scratchA, speed | 0);
    let s = _clearanceFor(hazards, myX, myY, dirSpeed.x, dirSpeed.y);
    if (_crossesPath(paths, myX, myY, dirSpeed.x, dirSpeed.y)) s -= TUNE.CROSS_W;
    s -= _corridorPenalty(paths, myX, myY, dirSpeed.x, dirSpeed.y);
    if (refDir) {
        const turn = LogicMath.getAngleBetween(
            LogicMath.getAngle(d.x, d.y),
            LogicMath.getAngle(refDir.x, refDir.y)
        );
        s += (TUNE.MOMENTUM * (180 - turn)) / 180;
    }
    const room = _roomFor(myX, myY, idx, bodyR);
    if (room <= 0) return -Infinity;
    return s - (TUNE.WALL_HIT * (TUNE.REACH - room)) / TUNE.REACH;
}

function _clearHeading() {
    _heading = null;
    _headingIdx = -1;
    _holdUntil = 0;
    _weakSince = 0;
}

function _collectLiveCached(myX, myY, myRadius, now, mySpeed) {
    if (_threatCache && _threatCacheAt === scanData.lastUpdate) return _threatCache;
    _threatCache = _collectLive(myX, myY, myRadius, now, mySpeed);
    _threatCacheAt = scanData.lastUpdate;
    return _threatCache;
}

export function pushDodgeTarget() {
    if (!_heading) return;
    const now = Date.now();
    const myRadius = _hitbox > 0 ? _hitbox : scanData.myRadius;
    const hazards = _collectLiveCached(scanData.myX, scanData.myY, myRadius, now, scanData.mySpeed);
    if (hazards.length === 0 && now - _lastDangerTs > TUNE.RELEASE_GRACE_MS) return;
    _push(now, scanData.myX, scanData.myY);
}

function _anchor(myX, myY, dir, bodyR) {
    const room = _wallRoom(myX, myY, dir, bodyR);
    if (room <= 0) return null;
    const dist = room < TUNE.REACH ? room : TUNE.REACH;
    _scratchC.x = dir.x;
    _scratchC.y = dir.y;
    const step = normalize(_scratchC, dist | 0);
    return { x: myX + step.x, y: myY + step.y };
}

function _push(now, myX, myY) {
    if (!_heading) return;
    const dx = _targetX - myX;
    const dy = _targetY - myY;
    if (dx * dx + dy * dy < TUNE.REFREEZE_DIST * TUNE.REFREEZE_DIST) {
        const t = _anchor(myX, myY, _heading, _frameMargin());
        if (!t) {
            _clearHeading();
            return;
        }
        _targetX = t.x;
        _targetY = t.y;
    }
    if (!isFinite(_targetX) || !isFinite(_targetY)) return;
    _sendMove(scanData.battleModeClient, _targetX, _targetY);
}

function characterCollisionRadius(data) {
    if (!data || data.isNull()) return 0;
    if (_radiusMemoData !== null && data.equals(_radiusMemoData) && _radiusMemoValue > 0) {
        return _radiusMemoValue;
    }
    const value = collisionRadius(data) | 0;
    if (value > 0) {
        _radiusMemoData = data;
        _radiusMemoValue = value;
    }
    return value;
}

function _bodySubtiles(radius) {
    return radius > BODY_SUBTILE_UNITS ? 2 : 1;
}

function _bodyPad() {
    return Math.floor(tileSizeUnits() / 5);
}

let _estX = 0;
let _estY = 0;
let _estAt = 0;
let _estSpd = 0;

function _estimateMoveSpeed(x, y, now) {
    if (!_estAt || now <= _estAt) {
        _estX = x;
        _estY = y;
        _estAt = now;
        return _estSpd;
    }
    const dt = (now - _estAt) / 1000;
    const dx = x - _estX;
    const dy = y - _estY;
    _estX = x;
    _estY = y;
    _estAt = now;
    if (dt < 0.02 || dt > 0.5) return _estSpd;
    const d2 = dx * dx + dy * dy;
    if (d2 < 4) return _estSpd;
    const v = Math.sqrt(d2) / dt;
    if (v < 50 || v > 3000) return _estSpd;
    _estSpd = _estSpd > 0 ? Math.round(_estSpd * 0.8 + v * 0.2) : Math.round(v);
    return _estSpd;
}

function learnOwnHitbox() {
    try {
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return false;
        const fns = getFunctions();
        if (!fns.LogicGameObjectClient_getData) return false;
        const radius = characterCollisionRadius(dataOf(own)) | 0;
        if (!(radius > 0)) return false;
        _hitbox = radius;
        return true;
    } catch (_) {
        return false;
    }
}

function _frameMargin() {
    return _hitbox + _bodyPad();
}

export function updateAutododge() {
    if (scanData.lastUpdate === 0) return;
    const now = Date.now();
    const myX = scanData.myX;
    const myY = scanData.myY;
    if (!isFinite(myX) || !isFinite(myY)) return;
    if (Math.abs(myX) < TUNE.MIN_POS && Math.abs(myY) < TUNE.MIN_POS) return;

    if (!_walkAt || now - _walkAt >= 150) {
        const wdx = myX - _walkPx;
        const wdy = myY - _walkPy;
        if (wdx * wdx + wdy * wdy >= 64) {
            const wa = LogicMath.getAngle(wdx, wdy);
            _walkDir = { x: LogicMath.cos(wa), y: LogicMath.sin(wa) };
        } else _walkDir = null;
        _walkPx = myX;
        _walkPy = myY;
        _walkAt = now;
    }

    let speed = scanData.mySpeed | 0;
    if (!learnOwnHitbox()) {
        const fb = scanData.myRadius | 0;
        if (fb > 0) _hitbox = fb;
        else _hitbox = Math.floor(tileSizeUnits() * 0.4);
    }
    if (!(speed > 0)) {
        const est = _estimateMoveSpeed(myX, myY, now);
        if (est > 0) speed = est;
    }
    const myRadius = _hitbox;
    if (!(speed > 0)) {
        _clearHeading();
        return;
    }

    const hazards = _collectLiveCached(myX, myY, myRadius, now, speed);
    if (hazards.length === 0) {
        if (_heading && now - _lastDangerTs > TUNE.RELEASE_GRACE_MS) _clearHeading();
        return;
    }

    const bodyR = _frameMargin();
    const paths = _threatPaths(hazards);
    const inDanger = _pathsHitMe(hazards, myX, myY);
    if (inDanger) _lastDangerTs = now;

    if (_heading && now < _holdUntil) {
        _push(now, myX, myY);
        return;
    }

    if (!inDanger && !_heading) return;

    let stayClear = _clearanceFor(hazards, myX, myY, 0, 0);
    if (_pathCoversPoint(paths, myX, myY, bodyR)) stayClear -= TUNE.CROSS_W;

    const prevIdx = _headingIdx >= 0 && _headingIdx < _ring.length ? _headingIdx : -1;
    const prevDir = prevIdx >= 0 ? _ring[prevIdx] : null;
    if (_heading && prevIdx >= 0) {
        const keep = _directionScore(hazards, paths, myX, myY, bodyR, speed, prevIdx, prevDir);
        if (keep > stayClear && keep > TUNE.KEEP_FLOOR) {
            _holdUntil = now + TUNE.LOCK_MS;
            _push(now, myX, myY);
            return;
        }
        _clearHeading();
    }
    const refDir = prevDir || _walkDir;
    const n = _ring.length;
    const scores = _scores;
    for (let i = 0; i < n; i++) {
        const d = _ring[i];
        _scratchA.x = d.x;
        _scratchA.y = d.y;
        const dirSpeed = normalize(_scratchA, speed | 0);
        let s = _clearanceFor(hazards, myX, myY, dirSpeed.x, dirSpeed.y);
        if (_crossesPath(paths, myX, myY, dirSpeed.x, dirSpeed.y)) s -= TUNE.CROSS_W;
        s -= _corridorPenalty(paths, myX, myY, dirSpeed.x, dirSpeed.y);
        if (refDir) {
            const turn = LogicMath.getAngleBetween(
                LogicMath.getAngle(d.x, d.y),
                LogicMath.getAngle(refDir.x, refDir.y)
            );
            s += (TUNE.MOMENTUM * (180 - turn)) / 180;
        }
        scores[i] = s;
        _order[i] = i;
    }
    for (let i = 1; i < n; i++) {
        const v = _order[i];
        let j = i - 1;
        while (j >= 0 && scores[_order[j]] < scores[v]) {
            _order[j + 1] = _order[j];
            j--;
        }
        _order[j + 1] = v;
    }

    let bestIdx = -1;
    let bestScore = -Infinity;
    let prevScore = -Infinity;
    let validated = 0;
    for (let k = 0; k < n; k++) {
        const i = _order[k];
        if (validated >= WALL_VALIDATE && i !== prevIdx) break;
        const room = _roomFor(myX, myY, i, bodyR);
        validated++;
        if (room <= 0) {
            if (i === prevIdx) prevScore = -Infinity;
            continue;
        }
        const s = scores[i] - (TUNE.WALL_HIT * (TUNE.REACH - room)) / TUNE.REACH;
        if (i === prevIdx) prevScore = s;
        if (s > bestScore) {
            bestScore = s;
            bestIdx = i;
        }
        if (validated >= WALL_VALIDATE && bestIdx >= 0) break;
    }
    if (bestIdx < 0) {
        if (!_heading) return;
        if (!_weakSince) _weakSince = now;
        if (now - _weakSince >= TUNE.WEAK_RELEASE_MS) {
            _clearHeading();
            return;
        }
        _push(now, myX, myY);
        return;
    }

    let chosenIdx = bestIdx;
    let chosenScore = bestScore;
    if (prevIdx >= 0 && chosenIdx !== prevIdx && prevScore + TUNE.SWITCH_MARGIN >= bestScore) {
        chosenIdx = prevIdx;
        chosenScore = prevScore;
    }
    if (chosenScore <= stayClear) {
        if (!_heading) return;
        if (!_weakSince) _weakSince = now;
        if (now - _weakSince >= TUNE.WEAK_RELEASE_MS) {
            _clearHeading();
            return;
        }
        _push(now, myX, myY);
        return;
    }
    _weakSince = 0;
    if (prevIdx >= 0 && chosenIdx === prevIdx) {
        _holdUntil = now + TUNE.LOCK_MS;
        _push(now, myX, myY);
        return;
    }

    const chosen = _ring[chosenIdx];
    _headingIdx = chosenIdx;
    _heading = chosen;
    const anchor = _anchor(myX, myY, chosen, bodyR);
    if (!anchor) {
        _clearHeading();
        return;
    }
    _targetX = anchor.x;
    _targetY = anchor.y;
    _holdUntil = now + TUNE.LOCK_MS;
    _push(now, myX, myY);
}

function _invalidateOwnMetrics() {
    _hitbox = 0;
    _radiusMemoData = null;
    _radiusMemoValue = 0;
    _estSpd = 0;
    _estAt = 0;
}

export function resetAutododge() {
    _clearHeading();
    _hitbox = 0;
    _walkDir = null;
    _walkAt = 0;
    _walkPx = 0;
    _walkPy = 0;
    _radiusMemoData = null;
    _radiusMemoValue = 0;
    _estSpd = 0;
    _estAt = 0;
    _lastDangerTs = 0;
    _lastSentX = 1e9;
    _lastSentY = 1e9;
    _lastSentAt = 0;
    _targetX = 0;
    _targetY = 0;
    _threatCache = null;
    _threatCacheAt = -1;
    _roomMemo = null;
}

export function setupAutododge() {
    try {
        enableProjectileTracking();
        onDataReload(_invalidateOwnMetrics);
    } catch (_) {}
    _buildRing();
}
