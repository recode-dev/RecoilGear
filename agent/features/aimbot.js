import
{
    getBase,
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
    BLOCKS_PROJECTILES,
    losCheck
}
from "../utils/wallCache.js";

const SPEED_FALLBACK = 3000;
const SPEED_REFRESH_MS = 500;
const SKIP_NAME_PARTS = ["BALL"];

const LATENCY_S = 0.06;
const LEAD_ITERATIONS = 3;
const RANGE_FLIGHT_S = 1.1;
const RANGE_MARGIN = 0.88;
const RANGE_UNIT = 300;
const SPEED_CAP_MUL = 1.35;
const VEL_SMOOTH = 0.6;
const LEAD_CLAMP = 0.35;
const LEAD_RAMP_DIST = 1200;
const SPEED_DEFAULT_CAP = 1200;
const SPEED_SPIKE_MUL = 1.6;
const STICKY_MARGIN = 1.12;
const AIM_JITTER = 40;

var _target = null;
var _aimX = 0;
var _aimY = 0;
var _track = new Map();
var _projectileSpeed = SPEED_FALLBACK;
var _speedAt = 0;
var _rangeCache = 0;
var _rangeAt = 0;
var _hooks = false;

function _isSkipped(name)
{
    if (!name) return true;
    for (let i = 0; i < SKIP_NAME_PARTS.length; i++)
    {
        if (name.indexOf(SKIP_NAME_PARTS[i]) >= 0) return true;
    }
    return false;
}

function _sample(gid, x, y, moveSpeed, now)
{
    const prev = _track.get(gid);
    let vx = 0;
    let vy = 0;
    const cap = moveSpeed > 0 ? moveSpeed * SPEED_CAP_MUL : SPEED_DEFAULT_CAP;
    if (prev)
    {
        const dt = (now - prev.t) / 1000;
        if (dt >= 0.008 && dt <= 0.4)
        {
            const ivx = (x - prev.x) / dt;
            const ivy = (y - prev.y) / dt;
            const im = Math.sqrt(ivx * ivx + ivy * ivy);
            if (im > cap * SPEED_SPIKE_MUL)
            {
                vx = prev.vx;
                vy = prev.vy;
            }
            else
            {
                vx = ivx * VEL_SMOOTH + prev.vx * (1 - VEL_SMOOTH);
                vy = ivy * VEL_SMOOTH + prev.vy * (1 - VEL_SMOOTH);
            }
        }
    }
    const mag = Math.sqrt(vx * vx + vy * vy);
    if (mag > cap)
    {
        vx = vx / mag * cap;
        vy = vy / mag * cap;
    }
    const hist = prev && prev.hist ? prev.hist : [];
    hist.push({ x, y, t: now });
    while (hist.length > 8) hist.shift();
    let juke = false;
    if (hist.length >= 4)
    {
        const first = hist[0];
        const span = (now - first.t) / 1000;
        if (span > 0.03)
        {
            const mvx = (x - first.x) / span;
            const mvy = (y - first.y) / span;
            const meanMag = Math.sqrt(mvx * mvx + mvy * mvy);
            juke = mag > 1.5 * (meanMag + 40);
        }
    }
    if (juke)
    {
        let bx = 0;
        let by = 0;
        for (let i = 0; i < hist.length; i++)
        {
            bx += hist[i].x;
            by += hist[i].y;
        }
        bx /= hist.length;
        by /= hist.length;
        _track.set(gid, { x, y, t: now, vx, vy, hist });
        return { x: bx, y: by, vx: 0, vy: 0, juke: true };
    }
    _track.set(gid, { x, y, t: now, vx, vy, hist });
    return { x, y, vx, vy, juke: false };
}

function _solve(mx, my, pred, speed, range)
{
    const cdx = pred.x - mx;
    const cdy = pred.y - my;
    const curDist = Math.sqrt(cdx * cdx + cdy * cdy);
    const leadClamp = LEAD_CLAMP * Math.min(1, curDist / LEAD_RAMP_DIST);
    const maxLead = curDist * leadClamp;
    let t = LATENCY_S + curDist / speed;
    let lx = 0;
    let ly = 0;
    for (let i = 0; i < LEAD_ITERATIONS; i++)
    {
        lx = pred.vx * t;
        ly = pred.vy * t;
        const lm = Math.sqrt(lx * lx + ly * ly);
        if (lm > maxLead)
        {
            lx *= maxLead / lm;
            ly *= maxLead / lm;
        }
        const px = pred.x + lx - mx;
        const py = pred.y + ly - my;
        t = LATENCY_S + Math.sqrt(px * px + py * py) / speed;
    }
    const ax = pred.x + lx - mx;
    const ay = pred.y + ly - my;
    if (range > 0 && Math.sqrt(ax * ax + ay * ay) > range) return null;
    return {
        x: Math.round(pred.x + lx),
        y: Math.round(pred.y + ly),
        t
    };
}

function _ownProjectileSpeed()
{
    const now = Date.now();
    if (now - _speedAt < SPEED_REFRESH_MS) return _projectileSpeed;
    _speedAt = now;
    try
    {
        const fns = getFunctions();
        const own = scanData.ownCharacter;
        if (!own || own.isNull()) return _projectileSpeed;
        if (!fns.LogicCharacterClient_getWeaponSkill || !fns.LogicSkillData_getProjectileData) return _projectileSpeed;
        const skill = fns.LogicCharacterClient_getWeaponSkill(own);
        if (!skill || skill.isNull()) return _projectileSpeed;
        const data = fns.LogicSkillData_getProjectileData(skill, 0);
        if (!data || data.isNull()) return _projectileSpeed;
        const raw = data.add(offsets.ProjectileData_speed).readU32() | 0;
        if (raw >= 300 && raw <= 8500) _projectileSpeed = raw;
    }
    catch (_)
    {}
    return _projectileSpeed;
}

function _ownRange(speed)
{
    const now = Date.now();
    if (now - _rangeAt < SPEED_REFRESH_MS) return _rangeCache > 0 ? _rangeCache : speed * RANGE_FLIGHT_S * RANGE_MARGIN;
    _rangeAt = now;
    let tiles = 0;
    try
    {
        const fns = getFunctions();
        const own = scanData.ownCharacter;
        if (own && !own.isNull() && fns.LogicCharacterClient_getWeaponSkill && fns.LogicSkillData_getCastingRange)
        {
            const skill = fns.LogicCharacterClient_getWeaponSkill(own);
            if (skill && !skill.isNull()) tiles = fns.LogicSkillData_getCastingRange(skill) | 0;
        }
    }
    catch (_)
    {}
    if (tiles > 0 && tiles <= 40) _rangeCache = tiles * RANGE_UNIT * RANGE_MARGIN;
    else _rangeCache = 0;
    return _rangeCache > 0 ? _rangeCache : speed * RANGE_FLIGHT_S * RANGE_MARGIN;
}

function _aimAt(enemy, now)
{
    if (!enemy || !enemy.ptr || enemy.ptr.isNull()) return null;
    const fns = getFunctions();
    const target = _validEnemyPtr(enemy.body) ? enemy.body : enemy.ptr;
    let ex = enemy.x;
    let ey = enemy.y;
    try
    {
        ex = fns.LogicGameObjectClient_getX(target) | 0;
        ey = fns.LogicGameObjectClient_getY(target) | 0;
    }
    catch (_)
    {}
    const mx = scanData.myX;
    const my = scanData.myY;
    const speed = _ownProjectileSpeed();
    const pred = _sample(enemy.gid, ex, ey, enemy.moveSpeed, now);
    const aim = _solve(mx, my, pred, speed, _ownRange(speed));
    if (!aim) return null;
    aim.x += Math.round((Math.random() * 2 - 1) * AIM_JITTER);
    aim.y += Math.round((Math.random() * 2 - 1) * AIM_JITTER);
    return aim;
}

function _validEnemyPtr(p)
{
    return p && !p.isNull();
}

function _pickTarget(now)
{
    const list = scanData.enemies || [];
    const myTeam = scanData.myTeamId | 0;
    const mx = scanData.myX;
    const my = scanData.myY;
    const speed = _ownProjectileSpeed();
    const range = _ownRange(speed);
    let best = null;
    let bestD = Infinity;
    let bestPred = null;
    let cur = null;
    let curD = Infinity;

    for (let i = 0; i < list.length; i++)
    {
        const e = list[i];
        if (!e || !e.ptr || e.ptr.isNull()) continue;
        if (e.kind !== "player") continue;
        if (_isSkipped(e.brawlerName)) continue;
        if ((e.teamId | 0) === myTeam) continue;
        if (losCheck(mx, my, e.x, e.y, BLOCKS_PROJECTILES) === false) continue;
        const pred = _sample(e.gid, e.x, e.y, e.moveSpeed, now);
        const dx = e.x - mx;
        const dy = e.y - my;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (range > 0 && d > range) continue;
        if (d < bestD)
        {
            bestD = d;
            best = e;
            bestPred = pred;
        }
        if (_target && e.gid === _target.gid)
        {
            cur = e;
            curD = d;
        }
    }

    let pick;
    let pred;
    if (cur && best && curD <= bestD * STICKY_MARGIN)
    {
        pick = cur;
        pred = cur.gid === best.gid ? bestPred : _sample(cur.gid, cur.x, cur.y, cur.moveSpeed, now);
    }
    else
    {
        pick = best;
        pred = bestPred;
    }
    if (!pick || !pred) return null;

    const aim = _solve(mx, my, pred, speed, range);
    if (!aim) return null;
    _aimX = aim.x;
    _aimY = aim.y;
    return pick;
}

export function setupAimbot()
{
    if (_hooks) return;
    _hooks = true;
    const base = getBase();
    try
    {
        Interceptor.attach(base.add(offsets.BattleScreen_getClosestTargetForAutoshoot),
        {
            onLeave(retval)
            {
                if (!state.aimbot) return;
                if (!_target || !_target.ptr || _target.ptr.isNull()) return;
                try
                {
                    retval.replace(_target.ptr);
                }
                catch (_)
                {}
            }
        });
    }
    catch (_)
    {}
    try
    {
        Interceptor.attach(base.add(offsets.BattleScreen_activateSkill),
        {
            onEnter(args)
            {
                if (!state.aimbot) return;
                if (!_target || !_target.ptr || _target.ptr.isNull()) return;
                const aim = _aimAt(_target, Date.now());
                if (!aim) return;
                try
                {
                    this.context.x1 = aim.x | 0;
                    this.context.x2 = aim.y | 0;
                }
                catch (_)
                {}
            }
        });
    }
    catch (_)
    {}
}

export function updateAimbot()
{
    if (!state.aimbot)
    {
        _target = null;
        return;
    }
    if (scanData.lastUpdate === 0)
    {
        _target = null;
        return;
    }
    _target = _pickTarget(Date.now());
}

export function resetAimbot()
{
    _target = null;
    _track.clear();
}
