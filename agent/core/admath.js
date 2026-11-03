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

export const LogicMath = {
    abs: (v) => (v < 0 ? -v : v),

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

export function length(x, y)
{
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return 46340;
    const s = x * x + y * y;
    return s < 0 ? 46340 : LogicMath.sqrt(s);
}

export function lengthSquared(x, y)
{
    if (x > GUARD || x < -GUARD || y > GUARD || y < -GUARD) return MAXI;
    const s = x * x + y * y;
    return s < 0 ? MAXI : s;
}

export function distance(x1, y1, x2, y2)
{
    return length(x2 - x1, y2 - y1);
}

export function dot(ax, ay, bx, by)
{
    return ax * bx + ay * by;
}

export function normalize(vec, scale)
{
    const len = length(vec.x, vec.y);
    if (len === 0) return vec;
    vec.x = idiv(vec.x * scale, len);
    vec.y = idiv(vec.y * scale, len);
    return vec;
}

export function rotate(vec, angle)
{
    const x = LogicMath.getRotatedX(vec.x, vec.y, angle);
    const y = LogicMath.getRotatedY(vec.x, vec.y, angle);
    vec.x = x;
    vec.y = y;
    return vec;
}

export function segmentHitsCircle(x1, y1, x2, y2, cx, cy, radius)
{
    return LogicMath.getDistanceSquareToLine(x1, y1, x2, y2, cx, cy) <= radius * radius;
}

export const math = LogicMath;
export default { LogicMath, length, lengthSquared, distance, dot, normalize, rotate, segmentHitsCircle };
