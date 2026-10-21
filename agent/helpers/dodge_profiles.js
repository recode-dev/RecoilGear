import
{
    BLOCKS_PROJECTILES,
    traceWallHit
}
from "../utils/wallCache.js";

const DP_PI = 3.14159265358979;
const DP_TICK_MS = 50;
const DP_SPOKES = 6;
const DP_CHILD_RADIUS = 50;
const DP_SPAWN_OFFSET = 200;
const DP_CHILD_TRAVEL = 1100;
const DP_FLIGHT_DIST = 2035;
const DP_FLIGHT_TIME_MS = 963;
const DP_BURST_LIFE_MS = 360;
const DP_BLAST_MS = 700;
const DP_CURVE_DEV_DEG = 22;
const DP_ARM_LENGTH = DP_SPAWN_OFFSET + DP_CHILD_TRAVEL;

const SPIKE_ARC = [
    [0, 200, 0],
    [110, 515, 32],
    [207, 797, 216],
    [312, 999, 519],
    [411, 1066, 930],
    [513, 995, 1377],
    [557, 883, 1611]
];

const CROSS_BOMBER = { childRadius: 125, childSpeed: 3000, spawnOffset: 200, childTravel: 800, flightTimeMs: 1015 };
const CROSS_ULTI = { childRadius: 375, childSpeed: 3000, spawnOffset: 100, childTravel: 1600, flightTimeMs: 1115 };

var _spikeVariant = 0;

function _seg(name, ax, ay, bx, by, radius, t0, t1)
{
    return { hasSegment: true, ax, ay, bx, by, radius, t0, t1, name };
}

function _blob(name, x, y, radius, t0, t1)
{
    return { hasSegment: false, x, y, radius, t0, t1, name };
}

function _time(projectile, now)
{
    return projectile.spawnedAt ? projectile.spawnedAt : now;
}

function _angleOf(projectile)
{
    const a = projectile.angle;
    return Number.isFinite(a) ? a : 0;
}

function _crossArms(name, cx, cy, arm, radius, t0, t1, diagonal)
{
    const diag = 0.70710678;
    const out = [];
    for (let k = 0; k < 2; k++)
    {
        let dx;
        let dy;
        if (diagonal)
        {
            dx = diag;
            dy = k === 0 ? diag : -diag;
        }
        else
        {
            dx = k === 0 ? 1 : 0;
            dy = k === 0 ? 0 : 1;
        }
        out.push(_seg(name, cx - dx * arm, cy - dy * arm, cx + dx * arm, cy + dy * arm, radius, t0, t1));
    }
    return out;
}

function _crossProfile(projectile, now, spec, diagonal)
{
    const armLength = spec.spawnOffset + spec.childTravel;
    const burstLife = spec.childTravel / spec.childSpeed * 1000;
    let cx = projectile.targetX;
    let cy = projectile.targetY;
    if (cx === 0 && cy === 0)
    {
        const flight = spec.flightTimeMs / 1000;
        cx = projectile.spawnX + projectile.vx * flight;
        cy = projectile.spawnY + projectile.vy * flight;
    }
    if (cx === 0 || cy === 0) return [];
    if (Math.abs(cx) > 1.0e6 || Math.abs(cy) > 1.0e6) return [];
    const landAt = _time(projectile, now) + spec.flightTimeMs;
    const t0 = landAt - DP_TICK_MS;
    const t1 = landAt + burstLife + DP_TICK_MS;
    return _crossArms(projectile.name, cx, cy, armLength, spec.childRadius, t0, t1, diagonal);
}

function _spikeEndpoint(projectile)
{
    const rad = _angleOf(projectile) * DP_PI / 180;
    const dirX = Math.cos(rad);
    const dirY = Math.sin(rad);
    const dist = traceWallHit(projectile.spawnX, projectile.spawnY, dirX, dirY, DP_FLIGHT_DIST, BLOCKS_PROJECTILES);
    return {
        x: projectile.spawnX + dirX * dist,
        y: projectile.spawnY + dirY * dist,
        dist
    };
}

function _cactusProfile(projectile, now)
{
    const end = _spikeEndpoint(projectile);
    const burstAt = _time(projectile, now) + DP_FLIGHT_TIME_MS * (end.dist / DP_FLIGHT_DIST);
    const out = [];
    if (projectile.spawnAreaRadius > 0)
    {
        const life = projectile.spawnAreaActiveTime ? projectile.spawnAreaActiveTime : DP_BLAST_MS;
        out.push(_blob(projectile.name, end.x, end.y, projectile.spawnAreaRadius, burstAt, burstAt + life));
    }
    if (_spikeVariant === 1)
    {
        const t0 = burstAt - DP_TICK_MS;
        const t1 = burstAt + DP_BURST_LIFE_MS + DP_TICK_MS;
        for (let i = 0; i < 3; i++)
        {
            const a = i * DP_PI / 3;
            const dx = Math.cos(a) * DP_ARM_LENGTH;
            const dy = Math.sin(a) * DP_ARM_LENGTH;
            out.push(_seg(projectile.name, end.x - dx, end.y - dy, end.x + dx, end.y + dy, DP_CHILD_RADIUS, t0, t1));
        }
        return out;
    }
    for (let s = 0; s < DP_SPOKES; s++)
    {
        const rot = s * (2 * DP_PI / DP_SPOKES);
        const cr = Math.cos(rot);
        const sr = Math.sin(rot);
        for (let k = 0; k + 1 < SPIKE_ARC.length; k++)
        {
            const a = SPIKE_ARC[k];
            const b = SPIKE_ARC[k + 1];
            out.push(_seg(projectile.name,
                end.x + a[1] * cr - a[2] * sr,
                end.y + a[1] * sr + a[2] * cr,
                end.x + b[1] * cr - b[2] * sr,
                end.y + b[1] * sr + b[2] * cr,
                DP_CHILD_RADIUS, burstAt + a[0], burstAt + b[0]));
        }
    }
    return out;
}

export function shapeHazards(projectile, now)
{
    if (!projectile || !projectile.name) return [];
    const name = projectile.name;
    if (name.indexOf("Overcharged") >= 0 || name.indexOf("MegaBoss") >= 0)
    {
        return _crossProfile(projectile, now, CROSS_ULTI, false)
            .concat(_crossProfile(projectile, now, CROSS_ULTI, true));
    }
    if (name.indexOf("CrossBomber") >= 0 && name.charAt(name.length - 1) !== "2")
    {
        const spec = name.indexOf("Ulti") >= 0 ? CROSS_ULTI : CROSS_BOMBER;
        return _crossProfile(projectile, now, spec, false);
    }
    if (name === "CactusProjectile")
    {
        if (!_spikeVariant) return [];
        return _cactusProfile(projectile, now);
    }
    return [];
}

export function blocksLinear(name)
{
    if (!name) return false;
    if (name.indexOf("CrossBomber") >= 0 && name.charAt(name.length - 1) !== "2") return true;
    if (name === "CactusSpike") return true;
    return false;
}

export function noteBurstDeath(record)
{
    if (_spikeVariant) return;
    if (!record || record.name !== "CactusProjectile") return;
    const dx = record.x - record.spawnX;
    const dy = record.y - record.spawnY;
    if (dx * dx + dy * dy < 1) return;
    const angle = Number.isFinite(record.angle) ? record.angle : 0;
    const chord = Math.atan2(dy, dx) * 180 / DP_PI;
    let deviation = (chord - angle) % 360;
    deviation = ((deviation + 540) % 360) - 180;
    if (deviation < 0) deviation = -deviation;
    _spikeVariant = deviation > DP_CURVE_DEV_DEG ? 2 : 1;
}

export function resetProfiles()
{
    _spikeVariant = 0;
}
