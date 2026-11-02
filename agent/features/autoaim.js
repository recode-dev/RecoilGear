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
    TILE_UNITS,
    scanData
}
from "../core/scan.js";
import
{
    BLOCKS_PROJECTILES,
    losCheck
}
from "../utils/walls.js";

const SPEED_FALLBACK = 3000;
const SPEED_REFRESH_MS = 500;
const SKIP_NAME_PARTS = ["BALL"];

const RANGE_FLIGHT_S = 1.1;
const RANGE_MARGIN = 0.88;
const SERVER_TICK_MS = 50;
const VELOCITY_WINDOW_MS = 400;
const MIN_TRACK_MS = 200;
const MAX_SPEED_EST = 1600;
const LEAD_PASSES = 2;
const MAX_FLIGHT_S = 1.5;
const STICKY_MARGIN = 1.12;

var _target = null;
var _aimX = 0;
var _aimY = 0;
var _track = new Map();
var _projectileSpeed = SPEED_FALLBACK;
var _speedAt = 0;
var _ownBeam = false;
var _pathFn = null;
var _pathBuf = null;
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
    while (track.hist.length > 1 && now - track.hist[0].t > VELOCITY_WINDOW_MS) track.hist.shift();

    const first = track.hist[0];
    const span = (now - first.t) / 1000;

    if (now - first.t < MIN_TRACK_MS) return null;

    let vx = (x - first.x) / span;
    let vy = (y - first.y) / span;
    if (Math.sqrt(vx * vx + vy * vy) > MAX_SPEED_EST) return null;

    return { x: x, y: y, vx: vx, vy: vy, juke: false };
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
        px = pred.x + pred.vx * flight;
        py = pred.y + pred.vy * flight;
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
                speed = data.add(offsets.ProjectileData_speed).readU32() | 0;
                _ownBeam = !!(fns.LogicProjectileData_isBeam && fns.LogicProjectileData_isBeam(data));
            }
        }
    }
    catch (_)
    {}

    if (!(speed >= 300 && speed <= 8500))
    {
        const observed = scanData.friendlySpeed | 0;
        if (observed >= 300 && observed <= 8500) speed = observed;
    }

    if (speed >= 300 && speed <= 8500)
    {
        _projectileSpeed = speed;
        _speedAt = now;
    }
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
    if (tiles > 0 && tiles <= 40) _rangeCache = tiles * TILE_UNITS * RANGE_MARGIN;
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
    if (!pred) return null;
    const aim = _solve(mx, my, pred, speed, _ownRange(speed));
    if (!aim) return null;
    return aim;
}

function _pathCall(screen, own, skill, mx, my, ax, ay)
{
    if (!_pathFn)
    {
        _pathFn = new NativeFunction(getBase().add(offsets.BattleScreen__calculateProjectilePath), "void",
            ["pointer", "pointer", "pointer", "pointer", "int",
             "float", "float", "float", "float", "float", "float"]);
        _pathBuf = Memory.alloc(0x40);
    }
    _pathFn(_pathBuf, screen, own, skill, 0, mx, my, 0, ax, ay, 0);
    const begin = _pathBuf.readPointer();
    const end = _pathBuf.add(Process.pointerSize).readPointer();
    if (!begin || begin.isNull() || !end || end.isNull()) return null;
    const count = end.sub(begin).toInt32() / 12;
    if (count < 2 || count > 64) return null;
    const last = begin.add((count - 1) * 12);
    const px = last.add(4).readFloat();
    const py = last.add(8).readFloat();
    if (!isFinite(px) || !isFinite(py)) return null;
    if (Math.abs(px) > 40000 || Math.abs(py) > 40000) return null;
    return { x: Math.round(px), y: Math.round(py) };
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
                scanData.battleScreen = args[0];
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
}
