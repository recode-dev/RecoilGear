import
{
    getFunctions,
    initFunctions
}
from "./core/functions.js";

import
{
    offsets
}
from "./core/offsets.js";

import
{
    initScanner,
    resetScannerCache,
    updateScanner
}
from "./core/scanner.js";

import
{
    notifyBattleModeChanged,
    watchTileChanges,
    maybeRefreshWallCache
}
from "./utils/wallCache.js";

import
{
    setupAnticheat
}
from "./utils/anticheat.js";

import
{
    resetAutododge,
    setupAutododge,
    updateAutododge
}
from "./features/autododge.js";

import
{
    resetAutoaim,
    setupAutoaim,
    updateAutoaim
}
from "./features/autoaim.js";

let _base = null;
let _lastBattle = null;
let _installed = false;
let _ticker = null;

function findBase()
{
    try
    {
        return Process.getModuleByName("Nulls Brawl").base;
    }
    catch (_)
    {}
    const mods = Process.enumerateModules();
    for (let i = 0; i < mods.length; i++)
    {
        if (mods[i].name.toLowerCase().indexOf("nulls") >= 0) return mods[i].base;
    }
    return null;
}

function battleModeClient()
{
    try
    {
        const fns = getFunctions();
        if (!fns.BattleMode_getInstance) return null;
        const mode = fns.BattleMode_getInstance();
        if (!mode || mode.isNull()) return null;
        const client = mode.add(offsets.BattleMode_objectManagerPtr).readPointer();
        if (!client || client.isNull()) return null;
        return client;
    }
    catch (_)
    {
        return null;
    }
}

function tick(bm)
{
    if (!bm || bm.isNull()) return;

    if (!_lastBattle || !_lastBattle.equals(bm))
    {
        _lastBattle = bm;
        resetScannerCache();
        resetAutododge();
        resetAutoaim();
        notifyBattleModeChanged(bm);
    }

    const now = Date.now();
    try
    {
        updateScanner(bm, now);
        updateAutoaim();
    }
    catch (e)
    {
        return;
    }
    try
    {
        maybeRefreshWallCache(bm, now);
    }
    catch (_)
    {}
    try
    {
        updateAutododge();
    }
    catch (_)
    {}
}

export function install()
{
    if (_installed) return true;
    _base = findBase();
    if (!_base) return false;

    initFunctions(_base);
    initScanner(_base);
    watchTileChanges(_base);
    setupAutododge();
    setupAutoaim();
    setupAnticheat();

    let hooked = false;
    try
    {
        Interceptor.attach(_base.add(offsets.LogicBattleModeClient_update),
        {
            onEnter(args)
            {
                tick(args[0]);
            }
        });
        hooked = true;
    }
    catch (_)
    {}

    if (!hooked && !_ticker)
    {
        _ticker = setInterval(function ()
        {
            tick(battleModeClient());
        }, 16);
    }

    _installed = true;
    return true;
}

install();
