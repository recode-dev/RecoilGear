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
from "./core/scan.js";

import
{
    notifyBattleModeChanged,
    watchTileChanges,
    maybeRefreshWallCache
}
from "./utils/walls.js";

import
{
    setupLicense
}
from "./utils/license.js";

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

function findBase()
{
    return Process.getModuleByName("Nulls Brawl").base;
}

export function install()
{
    if (_installed) return true;
    _base = findBase();

    initFunctions(_base);
    initScanner(_base);
    watchTileChanges(_base);
    setupAutododge();
    setupAutoaim();
    setupLicense();

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
    });

    _installed = true;
    return true;
}

install();
