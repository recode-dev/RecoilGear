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

const RANGE = 3600;
const SPEED_FALLBACK = 3000;
const SPEED_REFRESH_MS = 500;

var _target = null;
var _aimX = 0;
var _aimY = 0;
var _track = new Map();
var _projectileSpeed = SPEED_FALLBACK;
var _speedAt = 0;
var _hooks = false;

function _velOf(enemy, now)
{
    const prev = _track.get(enemy.gid);
    _track.set(enemy.gid, { x: enemy.x, y: enemy.y, t: now });
    if (!prev) return { vx: 0, vy: 0 };
    const dt = now - prev.t;
    if (dt < 8 || dt > 400) return { vx: 0, vy: 0 };
    return {
        vx: (enemy.x - prev.x) * 1000 / dt,
        vy: (enemy.y - prev.y) * 1000 / dt
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

function _pickTarget(now)
{
    const list = scanData.enemies || [];
    const myTeam = scanData.myTeamId | 0;
    const mx = scanData.myX;
    const my = scanData.myY;
    let best = null;
    let bestT = Infinity;

    for (let i = 0; i < list.length; i++)
    {
        const e = list[i];
        if (!e || !e.ptr || e.ptr.isNull()) continue;
        if ((e.teamId | 0) === myTeam) continue;
        const dx = e.x - mx;
        const dy = e.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > RANGE) continue;
        const t = dist / (_projectileSpeed > 0 ? _projectileSpeed : SPEED_FALLBACK);
        if (t < bestT)
        {
            bestT = t;
            best = { enemy: e, dist, dx, dy };
        }
    }
    if (!best) return null;

    const vel = _velOf(best.enemy, now);
    const lead = bestT;
    _aimX = Math.round(best.enemy.x + vel.vx * lead);
    _aimY = Math.round(best.enemy.y + vel.vy * lead);
    return best.enemy;
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
                try
                {
                    const screen = args[0];
                    screen.add(offsets.BattleScreen_aimTargetId).writeU32(Number(_target.gid) >>> 0);
                    screen.add(offsets.BattleScreen_aimX).writeS32(_aimX | 0);
                    screen.add(offsets.BattleScreen_aimY).writeS32(_aimY | 0);
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
    _ownProjectileSpeed();
    _target = _pickTarget(Date.now());
}

export function resetAimbot()
{
    _target = null;
    _track.clear();
}
