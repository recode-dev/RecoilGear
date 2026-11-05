// Pure dodge decision core. No Frida APIs: every native dependency is
// injected through the `world` object so the same code runs in-game and in
// the offline mock (scripts/dodge_mock.mjs).

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
        const i = Math.floor(r < 91 ? r : HALF - r);
        return SIN[i];
    }
    const i = Math.floor(r - HALF < 91 ? r - HALF : FULL - r);
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

const TUNE = {
    AWARE: 3200,
    DIR_COUNT: 40,
    SKIN: 50,
    LOCK_MS: 40,
    REACH: 1200,
    HORIZON_S: 1.4,
    MOMENTUM: 150,
    RELEASE_GRACE_MS: 120,
    WALL_HIT: 2400,
    MIN_ROOM: 400,
    MERGE_MAX_RAD: 240,
    MERGE_SAME_VOLLEY: 260,
    MIN_POS: 50,
    SWITCH_MARGIN: 200,
    REFREEZE_DIST: 260,
    ENGAGE_S: 1.6,
    VOLLEY_RAD: 60,
    CLEAR_HORIZON_S: 2.6,
    WEAK_RELEASE_MS: 140,
    RISK_W: 900,
    PREP_LATENCY_MS: 80,
    PREP_SAFETY: 1.25
};

let _clock = () => 0;
const _ring = [];
const _options = {
    reactionSpeed: 100,
    directionPrecision: 40,
    safetyMargin: 25
};
let _heading = null;
let _headingIdx = -1;
let _holdUntil = 0;
let _lastDangerTs = 0;
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
let _threatCacheAt = -1;
let _threatCache = null;
let _roomMemo = null;
let _roomMemoVer = 0;
let _roomMemoX = 0;
let _roomMemoY = 0;
const ROOM_Q = 50;
const WALL_VALIDATE = 10;
let _walls = null;

const _scratchA = { x: 0, y: 0 };
const _scratchB = { x: 0, y: 0 };
const _scratchC = { x: 0, y: 0 };
const _scratchD = { x: 0, y: 0 };
const _scores = new Float64Array(160);
const _order = new Int32Array(160);

export function coreConfigure(opts) {
    if (!opts) return;
    if (typeof opts.clock === "function") _clock = opts.clock;
    if (typeof opts.reactionSpeed === "number") _options.reactionSpeed = opts.reactionSpeed;
    if (typeof opts.directionPrecision === "number")
        _options.directionPrecision = opts.directionPrecision;
    if (typeof opts.safetyMargin === "number") _options.safetyMargin = opts.safetyMargin;
    _syncTuning();
}

export function coreTune() {
    return TUNE;
}

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
    return _walls.pathBlocked(px, py, px + dx * t, py + dy * t, _walls.BLOCKS_PROJECTILES);
}

function _collectLive(myX, myY, myRadius, now, mySpeed) {
    const out = [];
    const shots = _world.projectiles || [];
    if (shots.length === 0) return out;
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
                let dvx = 0;
                let dvy = 0;
                if (flight > 0 && dist > 1) {
                    dvx = ((lx - p.x) / dist) * flight;
                    dvy = ((ly - p.y) / dist) * flight;
                }
                out.push({
                    x: p.x,
                    y: p.y,
                    vx: dvx,
                    vy: dvy,
                    rad: rad,
                    hitRad: rad,
                    scoreRad: rad,
                    left: left >= 0 ? left : -1,
                    chase: 0,
                    owner: p.ownerIndex,
                    suspect: false,
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
        let left;
        if (p.seg > 0) left = p.seg;
        else if (p.segUncertain) left = -1;
        else if (p.seg0 > 0) left = 0;
        else left = -1;
        if (p.constantFly && p.earlyTicks > 0 && travel > 0 && left >= 0)
            left = LogicMath.min(left, (p.earlyTicks * travel) / TICKS_PER_SEC_LOCAL);
        if (left >= 0) left += _bounceBudget(p);
        if (!blob && !p.segUncertain && left >= 0 && left <= 10 && distance(p.x, p.y, myX, myY) > hitR)
            continue;
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
            const rayEnd = p.hasTarget
                ? { x: p.targetX, y: p.targetY }
                : _sweptEnd(p.x, p.y, vx, vy, -1) || end;
            const miss = _missDistance(p.x, p.y, rayEnd.x, rayEnd.y, myX, myY);
            const gap = distance(p.x, p.y, myX, myY);
            const tti = travel > 0 ? LogicMath.max(0, gap - hitR) / travel : TUNE.HORIZON_S;
            const widen = LogicMath.min(TUNE.REACH, (mySpeed * tti) | 0);
            if (miss > hitR + widen) continue;
        }
        const suspect =
            !blob &&
            !chase &&
            p.hasTarget &&
            left >= 0 &&
            distance(p.spawnX, p.spawnY, p.targetX, p.targetY) > left + 1;
        out.push({
            x: p.x,
            y: p.y,
            vx: blob ? 0 : vx,
            vy: blob ? 0 : vy,
            rad: rad,
            hitRad: hitR,
            scoreRad: blob ? hitR : hitR + TUNE.SKIN * 0.5,
            left: left,
            chase: chase,
            owner: p.ownerIndex,
            suspect: suspect,
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

let _world = { projectiles: [] };
const TICKS_PER_SEC_LOCAL = 20;

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
        scoreRad: (hitHi - hitLo) / 2 + TUNE.SKIN * 0.5,
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

function _minSeparation(threats, myX, myY, dirVx, dirVy, steps) {
    let worst = Infinity;
    const dt = TUNE.HORIZON_S / steps;
    for (let s = 0; s <= steps; s++) {
        const t = dt * s;
        const mx = myX + dirVx * t;
        const my = myY + dirVy * t;
        for (let i = 0; i < threats.length; i++) {
            const th = threats[i];
            let tvx = th.vx;
            let tvy = th.vy;
            if (th.chase) {
                const d = distance(th.x, th.y, mx, my);
                const spd = length(th.vx, th.vy);
                if (d > 1 && spd > 1) {
                    tvx = ((mx - th.x) / d) * spd;
                    tvy = ((my - th.y) / d) * spd;
                }
            }
            const spd = length(tvx, tvy);
            if (th.left >= 0 && spd > 1 && t > th.left / spd + 0.05) continue;
            const d = distance(mx, my, th.x + tvx * t, th.y + tvy * t) - th.scoreRad;
            if (d < worst) worst = d;
        }
    }
    return worst;
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

function _minTimeToContact(threats, px, py) {
    let worst = Infinity;
    for (let i = 0; i < threats.length; i++) {
        const t = threats[i];
        let tti = Infinity;
        const end = _pathEnd(t);
        const endX = end ? end.x : t.x;
        const endY = end ? end.y : t.y;
        if (segmentHitsCircle(t.x, t.y, endX, endY, px, py, t.hitRad)) {
            const reach = distance(t.x, t.y, px, py);
            const spd = length(t.vx, t.vy);
            tti = spd > 1 ? LogicMath.max(0, reach - t.hitRad) / spd : 0;
        } else if (t.suspect) {
            const reach = distance(t.x, t.y, px, py);
            const spd = length(t.vx, t.vy);
            if (spd > 1 && reach > t.hitRad) {
                const ux = t.vx / spd;
                const uy = t.vy / spd;
                const closing = (px - t.x) * ux + (py - t.y) * uy;
                if (closing > 0) {
                    const perp = Math.abs((px - t.x) * uy - (py - t.y) * ux);
                    if (perp <= t.hitRad) tti = (reach - t.hitRad) / spd;
                }
            }
        }
        if (tti < worst) worst = tti;
    }
    return worst;
}

function _escapePrepMs(threats, px, py, mySpeed) {
    let need = 0;
    for (let i = 0; i < threats.length; i++) {
        need = LogicMath.max(need, threats[i].hitRad);
    }
    need += TUNE.SKIN + 60;
    const moveMs = mySpeed > 1 ? ((need / mySpeed) * 1000 * TUNE.PREP_SAFETY) | 0 : 400;
    return moveMs + TUNE.PREP_LATENCY_MS;
}

function _wallRoom(myX, myY, dir, bodyR) {
    const maxDist = TUNE.REACH;
    _scratchC.x = dir.x;
    _scratchC.y = dir.y;
    const step = normalize(_scratchC, maxDist | 0);
    const endX = myX + step.x;
    const endY = myY + step.y;
    const hit = _walls.firstWallHit(myX, myY, endX, endY, _bodySubtiles(_hitbox));
    if (hit >= 0) {
        if (hit >= maxDist) return maxDist;
        const room = hit - bodyR;
        return room > TUNE.MIN_ROOM ? room : 0;
    }
    if (!_walls.isBlockedWide(endX, endY, bodyR, _walls.BLOCKS_MOVEMENT)) return maxDist;
    let lo = 0;
    let hi = maxDist;
    for (let i = 0; i < 6; i++) {
        const mid = (lo + hi) / 2;
        _scratchD.x = dir.x;
        _scratchD.y = dir.y;
        const p = normalize(_scratchD, mid | 0);
        if (_walls.isBlockedWide(myX + p.x, myY + p.y, bodyR, _walls.BLOCKS_MOVEMENT)) hi = mid;
        else lo = mid;
    }
    const room = lo - bodyR;
    return room > TUNE.MIN_ROOM ? room : 0;
}

function _roomFor(myX, myY, idx, bodyR) {
    const ver = _walls.wallsVersion();
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

function _anchor(myX, myY, dir, bodyR) {
    const room = _wallRoom(myX, myY, dir, bodyR);
    if (room <= 0) return null;
    const dist = room < TUNE.REACH ? room : TUNE.REACH;
    _scratchC.x = dir.x;
    _scratchC.y = dir.y;
    const step = normalize(_scratchC, dist | 0);
    return { x: myX + step.x, y: myY + step.y };
}

function _directionScore(hazards, myX, myY, speed, idx, refDir, bodyR) {
    const d = _ring[idx];
    _scratchA.x = d.x;
    _scratchA.y = d.y;
    const dirSpeed = normalize(_scratchA, speed | 0);
    let s = _minSeparation(hazards, myX, myY, dirSpeed.x, dirSpeed.y, 20);
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
    if (_threatCache && _threatCacheAt === _world.stamp) return _threatCache;
    _threatCache = _collectLive(myX, myY, myRadius, now, mySpeed);
    _threatCacheAt = _world.stamp;
    return _threatCache;
}

function _push(now, myX, myY) {
    if (!_heading) return null;
    const dx = _targetX - myX;
    const dy = _targetY - myY;
    if (dx * dx + dy * dy < TUNE.REFREEZE_DIST * TUNE.REFREEZE_DIST) {
        const t = _anchor(myX, myY, _heading, _frameMargin());
        if (!t) {
            _clearHeading();
            return null;
        }
        _targetX = t.x;
        _targetY = t.y;
    }
    return { x: _targetX, y: _targetY };
}

function _bodySubtiles(radius) {
    return radius > BODY_SUBTILE_UNITS ? 2 : 1;
}

function _bodyPad() {
    return Math.floor(_walls.tileSizeUnits() / 5);
}

function _frameMargin() {
    return _hitbox + _bodyPad();
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

export function coreRepublish(now, x, y) {
    if (!_heading) return { active: false };
    const t = _push(now, x, y);
    if (!t) return { active: false };
    return { active: true, targetX: t.x, targetY: t.y };
}

export function coreResetKinematics() {
    _hitbox = 0;
    _radiusMemoData = null;
    _radiusMemoValue = 0;
    _estSpd = 0;
    _estAt = 0;
}

export function coreReset() {
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
    _targetX = 0;
    _targetY = 0;
    _threatCache = null;
    _threatCacheAt = -1;
    _roomMemo = null;
    _world = { projectiles: [] };
}

export function coreBusy() {
    return _heading !== null;
}

let _dbg = null;
export function coreDbg() {
    return _dbg;
}

export function coreTick(world) {
    _world = world;
    _walls = world.walls;
    if (!_ring.length) _buildRing();
    const now = world.now;
    const myX = world.x;
    const myY = world.y;
    if (!isFinite(myX) || !isFinite(myY)) return { active: false };
    if (Math.abs(myX) < TUNE.MIN_POS && Math.abs(myY) < TUNE.MIN_POS) return { active: false };

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

    let speed = world.speed | 0;
    if (world.radius > 0) _hitbox = world.radius;
    else if (!(_hitbox > 0)) _hitbox = Math.floor(_walls.tileSizeUnits() * 0.4);
    if (!(speed > 0)) {
        const est = _estimateMoveSpeed(myX, myY, now);
        if (est > 0) speed = est;
    }
    const myRadius = _hitbox;
    if (!(speed > 0)) {
        _clearHeading();
        return { active: false };
    }

    const hazards = _collectLiveCached(myX, myY, myRadius, now, speed);
    const threatCount = hazards.length;
    if (threatCount === 0) {
        if (_heading && now - _lastDangerTs > TUNE.RELEASE_GRACE_MS) _clearHeading();
        return { active: !!_heading, danger: false, threatCount: 0 };
    }

    const bodyR = _frameMargin();
    const touch = _pathsHitMe(hazards, myX, myY);
    const tti = _minTimeToContact(hazards, myX, myY);
    const prep = _escapePrepMs(hazards, myX, myY, speed) / 1000;
    const inDanger = touch || (tti <= prep);
    if (inDanger) _lastDangerTs = now;

    if (_heading && now < _holdUntil) {
        const t = _push(now, myX, myY);
        return {
            active: !!t,
            targetX: t ? t.x : undefined,
            targetY: t ? t.y : undefined,
            danger: inDanger,
            threatCount
        };
    }

    if (!inDanger && !_heading) {
        return { active: false, danger: false, threatCount, ttiMs: tti === Infinity ? -1 : tti * 1000 };
    }

    let stayClear = _minSeparation(hazards, myX, myY, 0, 0, 20);

    const prevIdx = _headingIdx >= 0 && _headingIdx < _ring.length ? _headingIdx : -1;
    const prevDir = prevIdx >= 0 ? _ring[prevIdx] : null;
    const refDir = prevDir || _walkDir;
    const n = _ring.length;
    const scores = _scores;
    for (let i = 0; i < n; i++) {
        scores[i] = _directionScore(hazards, myX, myY, speed, i, refDir, bodyR);
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
    _dbg = {
        now,
        threatCount,
        top: []
    };
    for (let k = 0; k < 6 && k < n; k++) {
        const i = _order[k];
        _dbg.top.push({
            deg: LogicMath.normalizeAngle360(Math.round((360 * i) / n)),
            score: Math.round(scores[i] * 10) / 10
        });
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
        if (!_heading) return { active: false, danger: inDanger, threatCount };
        if (!_weakSince) _weakSince = now;
        if (now - _weakSince >= TUNE.WEAK_RELEASE_MS) {
            _clearHeading();
            return { active: false, danger: inDanger, threatCount };
        }
        const t = _push(now, myX, myY);
        return { active: !!t, targetX: t ? t.x : undefined, targetY: t ? t.y : undefined, danger: inDanger, threatCount };
    }

    let chosenIdx = bestIdx;
    let chosenScore = bestScore;
    if (prevIdx >= 0 && chosenIdx !== prevIdx && prevScore + TUNE.SWITCH_MARGIN >= bestScore) {
        chosenIdx = prevIdx;
        chosenScore = prevScore;
    }
    // refine inside the chosen sector (ring granularity is 360/n): probe ±step/2
    let chosenVec = chosenIdx >= 0 ? _ring[chosenIdx] : null;
    if (chosenVec && chosenScore > -Infinity) {
        const stepDeg = 360 / n;
        const baseDeg = LogicMath.normalizeAngle360(LogicMath.getAngle(chosenVec.x, chosenVec.y));
        let bestRefDeg = baseDeg;
        let bestRefScore = chosenScore;
        const room0 = _roomFor(myX, myY, chosenIdx, bodyR);
        const wallTerm = (TUNE.WALL_HIT * (TUNE.REACH - room0)) / TUNE.REACH;
        for (let f = -2; f <= 2; f++) {
            if (f === 0) continue;
            const a = LogicMath.normalizeAngle360(baseDeg + (stepDeg * f) / 5);
            const cs = Math.cos((a * Math.PI) / 180);
            const sn = Math.sin((a * Math.PI) / 180);
            _scratchA.x = cs;
            _scratchA.y = sn;
            const dirSpeed = normalize(_scratchA, speed | 0);
            let s = _minSeparation(hazards, myX, myY, dirSpeed.x, dirSpeed.y, 20);
            if (refDir) {
                const turn = LogicMath.getAngleBetween(
                    LogicMath.getAngle(cs, sn),
                    LogicMath.getAngle(refDir.x, refDir.y)
                );
                s += (TUNE.MOMENTUM * (180 - turn)) / 180;
            }
            const total = s - wallTerm;
            if (total > bestRefScore + 1) {
                bestRefScore = total;
                bestRefDeg = a;
            }
        }
        if (bestRefDeg !== baseDeg) {
            chosenVec = {
                x: LogicMath.cos(bestRefDeg),
                y: LogicMath.sin(bestRefDeg)
            };
            chosenScore = bestRefScore;
        }
    }
    if (_dbg) {
        _dbg.chosen = {
            idx: chosenIdx,
            x: chosenVec && chosenVec.x,
            y: chosenVec && chosenVec.y,
            score: chosenScore,
            stay: stayClear
        };
    }
    if (chosenScore <= stayClear) {
        if (!_heading) return { active: false, danger: inDanger, threatCount };
        if (!_weakSince) _weakSince = now;
        if (now - _weakSince >= TUNE.WEAK_RELEASE_MS) {
            _clearHeading();
            return { active: false, danger: inDanger, threatCount };
        }
        const t = _push(now, myX, myY);
        return { active: !!t, targetX: t ? t.x : undefined, targetY: t ? t.y : undefined, danger: inDanger, threatCount };
    }
    _weakSince = 0;
    if (prevIdx >= 0 && chosenIdx === prevIdx && chosenVec === _ring[chosenIdx]) {
        _holdUntil = now + TUNE.LOCK_MS;
        const t = _push(now, myX, myY);
        return { active: !!t, targetX: t ? t.x : undefined, targetY: t ? t.y : undefined, danger: inDanger, threatCount };
    }

    _headingIdx = chosenIdx;
    _heading = chosenVec;
    const anchor = _anchor(myX, myY, chosenVec, bodyR);
    if (!anchor) {
        _clearHeading();
        return { active: false, danger: inDanger, threatCount };
    }
    _targetX = anchor.x;
    _targetY = anchor.y;
    _holdUntil = now + TUNE.LOCK_MS;
    return {
        active: true,
        targetX: _targetX,
        targetY: _targetY,
        danger: inDanger,
        threatCount,
        headingIdx: chosenIdx,
        headingDeg: LogicMath.normalizeAngle360(LogicMath.getAngle(chosenVec.x, chosenVec.y)),
        started: true
    };
}
