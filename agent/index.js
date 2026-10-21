import
{
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
    resetAutododge,
    setupAutododge,
    updateAutododge
}
from "./features/autododge.js";

import
{
    resetAimbot,
    setupAimbot,
    updateAimbot
}
from "./features/aimbot.js";

let _base = null;
let _lastBattle = null;
let _installed = false;

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

export function install()
{
    if (_installed) return true;
    _base = findBase();
    if (!_base) return false;

    initFunctions(_base);
    initScanner(_base);
    watchTileChanges(_base);
    setupAutododge();
    setupAimbot();

    Interceptor.attach(_base.add(offsets.LogicBattleModeClient_update),
    {
        onEnter(args)
        {
            const bm = args[0];
            if (!bm || bm.isNull()) return;

            if (!_lastBattle || !_lastBattle.equals(bm))
            {
                _lastBattle = bm;
                resetScannerCache();
                resetAutododge();
                resetAimbot();
                notifyBattleModeChanged(bm);
            }

            const now = Date.now();
            try
            {
                updateScanner(bm, now);
                updateAimbot();
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
    });

    _installed = true;
    return true;
}

install();
