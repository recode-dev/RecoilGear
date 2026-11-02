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

const SERVER_TICK_MS = 50;
const SPEED_MIN = 300;
const SPEED_MAX = 8500;
const LEAD_PASSES = 2;
const MAX_FLIGHT_S = 1.5;
const MAX_SPEED_EST = 1600;
const VELOCITY_WINDOW_MS = 250;

var _target = null;
var _aim = null;
var _speed = 0;
var _speedAt = 0;
var _points = new Map();
var _hooks = false;

function _isSkipped(name)
{
    return !name || name.indexOf("BALL") >= 0;
}

function _speedNow()
{
    const now = Date.now();
    if (now - _speedAt < 500) return _speed;
    _speedAt = now;

    let speed = 0;
    const fns = getFunctions();
    const own = scanData.ownCharacter;
    if (own && !own.isNull() && fns.LogicCharacterClient_getWeaponSkill && fns.LogicSkillData_getProjectileData)
    {
        try
        {
            const skill = fns.LogicCharacterClient_getWeaponSkill(own);
            const data = skill && !skill.isNull() ? fns.LogicSkillData_getProjectileData(skill, 0) : null;
            if (data && !data.isNull()) speed = data.add(offsets.ProjectileData_speed).readU32() | 0;
        }
        catch (_)
        {}
    }

    if (speed < SPEED_MIN) speed = scanData.friendlySpeed | 0;
    if (speed >= SPEED_MIN && speed <= SPEED_MAX) _speed = speed;
    return _speed;
}

function _velocity(key, x, y, now)
{
    let history = _points.get(key);
    if (!history)
    {
        history = [];
        _points.set(key, history);
    }

    if (history.length && now - history[history.length - 1].t < 8) return { vx: history.vx || 0, vy: history.vy || 0 };

    history.push({ x: x, y: y, t: now });
    while (history.length > 1 && now - history[0].t > VELOCITY_WINDOW_MS) history.shift();

    if (now - history[0].t < SERVER_TICK_MS) return { vx: 0, vy: 0 };

    const first = history[0];
    const last = history[history.length - 1];
    const dt = (last.t - first.t) / 1000;
    let vx = (last.x - first.x) / dt;
    let vy = (last.y - first.y) / dt;

    if (Math.sqrt(vx * vx + vy * vy) > MAX_SPEED_EST)
    {
        vx = 0;
        vy = 0;
    }

    history.vx = vx;
    history.vy = vy;
    return { vx: vx, vy: vy };
}

function _lead(x, y, vx, vy, speed)
{
    const mx = scanData.myX;
    const my = scanData.myY;
    let px = x;
    let py = y;

    for (let pass = 0; pass < LEAD_PASSES; pass++)
    {
        const distance = Math.sqrt((px - mx) * (px - mx) + (py - my) * (py - my));
        const flight = distance / speed;
        if (flight > MAX_FLIGHT_S) return null;
        px = x + vx * flight;
        py = y + vy * flight;
    }

    return { x: Math.round(px), y: Math.round(py) };
}

function _pick(now)
{
    const list = scanData.enemies || [];
    const myTeam = scanData.myTeamId | 0;
    const mx = scanData.myX;
    const my = scanData.myY;

    let best = null;
    let bestDistance = Infinity;

    for (let index = 0; index < list.length; index++)
    {
        const enemy = list[index];
        if (!enemy || !enemy.ptr || enemy.ptr.isNull()) continue;
        if (enemy.kind !== "player") continue;
        if (_isSkipped(enemy.brawlerName)) continue;
        if ((enemy.teamId | 0) === myTeam) continue;
        if (losCheck(mx, my, enemy.x, enemy.y, BLOCKS_PROJECTILES) === false) continue;

        const dx = enemy.x - mx;
        const dy = enemy.y - my;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < bestDistance)
        {
            bestDistance = distance;
            best = enemy;
        }
    }

    if (!best) return null;

    const velocity = _velocity(best.gid, best.x, best.y, now);
    const speed = _speedNow();
    if (speed < SPEED_MIN) return null;

    _aim = _lead(best.x, best.y, velocity.vx, velocity.vy, speed);
    return _aim ? best : null;
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
                try { retval.replace(_target.ptr); } catch (_) {}
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
                if (!_aim) return;
                try
                {
                    this.context.x1 = _aim.x | 0;
                    this.context.x2 = _aim.y | 0;
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
        _aim = null;
        return;
    }
    _target = _pick(Date.now());
    if (!_target) _aim = null;
}

export function resetAutoaim()
{
    _target = null;
    _aim = null;
    _points.clear();
}
