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
from "../core/scan.js";
import
{
    BLOCKS_PROJECTILES,
    losCheck
}
from "../utils/walls.js";

const SPEED_REFRESH_MS = 500;
const SKIP_NAME_PARTS = ["BALL"];

const SERVER_TICK_MS = 50;
const MIN_TRACK_MS = 120;
const MAX_SPEED_EST = 1600;
const MAX_ACCEL = 6000;
const LEAD_PASSES = 3;
const MAX_FLIGHT_S = 1.5;
const STICKY_MARGIN = 1.12;

var _target = null;
var _aimX = 0;
var _aimY = 0;
var _track = new Map();
var _projectileSpeed = 0;
var _speedAt = 0;
var _ownBeam = false;
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
    let track = _track.get(gid);
    if (!track)
    {
        track = { hist: [] };
        _track.set(gid, track);
    }

    track.hist.push({ x: x, y: y, t: now });
    while (track.hist.length > 16) track.hist.shift();

    const first = track.hist[0];
    const span = (now - first.t) / 1000;
    if (now - first.t < MIN_TRACK_MS || span <= 0) return null;

    const vxWindow = (x - first.x) / span;
    const vyWindow = (y - first.y) / span;
    const magnitude = Math.sqrt(vxWindow * vxWindow + vyWindow * vyWindow);
    if (magnitude < 30) return { x: x, y: y, vx: 0, vy: 0, juke: false };

    let dx = 0;
    let dy = 0;
    for (let index = track.hist.length - 2; index >= 0; index--)
    {
        const point = track.hist[index];
        if (point.x === x && point.y === y) continue;
        dx = x - point.x;
        dy = y - point.y;
        break;
    }

    const direction = Math.sqrt(dx * dx + dy * dy);
    const speed = Math.min(magnitude, moveSpeed >= 200 && moveSpeed <= 1500 ? moveSpeed : magnitude);
    if (direction < 0.5 || speed > MAX_SPEED_EST) return null;

    const vx = dx / direction * speed;
    const vy = dy / direction * speed;

    if (!track.vhist) track.vhist = [];
    track.vhist.push({ x: vx, y: vy, t: now });
    while (track.vhist.length > 12) track.vhist.shift();

    let ax = 0;
    let ay = 0;
    for (let index = 0; index < track.vhist.length; index++)
    {
        const past = track.vhist[index];
        const dt = (now - past.t) / 1000;
        if (dt < 0.12) continue;
        ax = (vx - past.x) / dt;
        ay = (vy - past.y) / dt;
        break;
    }

    if (Math.sqrt(ax * ax + ay * ay) > MAX_ACCEL)
    {
        ax = 0;
        ay = 0;
    }

    return { x: x, y: y, vx: vx, vy: vy, ax: ax, ay: ay, juke: false };
}

function _solve(mx, my, pred, speed, range)
{
    if (_ownBeam) return { x: Math.round(pred.x), y: Math.round(pred.y), t: 0 };

    let px = pred.x;
    let py = pred.y;

    for (let pass = 0; pass < LEAD_PASSES; pass++)
    {
        const distance = Math.sqrt((px - mx) * (px - mx) + (py - my) * (py - my));
        if (range > 0 && distance > range) return null;
        const flight = distance / speed;
        if (flight > MAX_FLIGHT_S) return null;
        px = pred.x + pred.vx * flight + 0.5 * pred.ax * flight * flight;
        py = pred.y + pred.vy * flight + 0.5 * pred.ay * flight * flight;
    }

    return { x: Math.round(px), y: Math.round(py), t: 0 };
}

function _ownProjectileSpeed()
{
    const now = Date.now();
    if (_projectileSpeed >= 300 && now - _speedAt < SPEED_REFRESH_MS) return _projectileSpeed;

    let speed = 0;
    try
    {
        const fns = getFunctions();
        const own = scanData.ownCharacter;
        if (own && !own.isNull() && fns.LogicCharacterClient_getWeaponSkill && fns.LogicSkillData_getProjectileData)
        {
            const skill = fns.LogicCharacterClient_getWeaponSkill(own);
            const data = skill && !skill.isNull() ? fns.LogicSkillData_getProjectileData(skill, 0) : null;
            if (data && !data.isNull())
            {
                _ownBeam = !!(fns.LogicProjectileData_isBeam && fns.LogicProjectileData_isBeam(data));
            }
        }
    }
    catch (_)
    {}

    if (!(speed >= 300 && speed <= 8500))
    {
        const observed = scanData.measuredSpeed | 0;
        if (observed >= 300 && observed <= 8500) speed = observed;
    }

    if (speed >= 300 && speed <= 8500)
    {
        _projectileSpeed = speed;
        _speedAt = now;
    }
    return _projectileSpeed;
}

function _ownRange()
{
    const now = Date.now();
    if (now - _rangeAt < SPEED_REFRESH_MS) return _rangeCache;
    _rangeAt = now;
    _rangeCache = 0;

    const fns = getFunctions();
    const own = scanData.ownCharacter;
    if (!own || own.isNull() || !fns.LogicGameObjectClient_getData || !fns.LogicSkillData_getCastingRange) return 0;

    const data = fns.LogicGameObjectClient_getData(own);
    if (!data || data.isNull()) return 0;

    const units = fns.LogicSkillData_getCastingRange(data) | 0;
    if (units < 100 || units > 20000) return 0;

    _rangeCache = units;
    return _rangeCache;
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
    if (!pred) return null;
    const aim = _solve(mx, my, pred, speed, _ownRange());
    if (!aim) return null;
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
    const range = _ownRange();
    let best = null;
    let bestD = Infinity;
    let bestPred = null;
    let calm = null;
    let calmD = Infinity;
    let calmPred = null;
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
        if (!pred.juke && d < calmD)
        {
            calmD = d;
            calm = e;
            calmPred = pred;
        }
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

    if (calm && calmD <= bestD * 1.4)
    {
        best = calm;
        bestD = calmD;
        bestPred = calmPred;
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

export function setupAutoaim()
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

export function updateAutoaim()
{
    if (scanData.lastUpdate === 0)
    {
        _target = null;
        return;
    }
    _target = _pickTarget(Date.now());
}

export function resetAutoaim()
{
    _target = null;
    _track.clear();
    _speed = 0;
    _speedAt = 0;
}
