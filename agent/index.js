import { initFunctions } from "./core/functions.js";

import { offsets } from "./core/offsets.js";

import { initScanner, resetScannerCache, updateScanner } from "./core/scan.js";

import { notifyBattleModeChanged, watchTileChanges, maybeRefreshWallCache } from "./utils/walls.js";

import {
    pushDodgeTarget,
    resetAutododge,
    setupAutododge,
    updateAutododge
} from "./features/autododge.js";

import { resetAutoaim, setupAutoaim, updateAutoaim } from "./features/autoaim.js";

let _lastBattle = null;
let _installed = false;

function findModule() {
    try {
        return Process.getModuleByName("Nulls Brawl");
    } catch (_) {}
    const mods = Process.enumerateModules();
    for (let i = 0; i < mods.length; i++) {
        if (mods[i].name.toLowerCase().indexOf("nulls") >= 0) return mods[i];
    }
    return null;
}

function tick(bm) {
    if (!bm || bm.isNull()) return;

    if (!_lastBattle || !_lastBattle.equals(bm)) {
        _lastBattle = bm;
        resetScannerCache();
        resetAutododge();
        resetAutoaim();
        notifyBattleModeChanged(bm);
    }

    const now = Date.now();
    try {
        updateScanner(bm, now);
    } catch (_) {}
    try {
        maybeRefreshWallCache(bm, now);
    } catch (_) {}
    try {
        pushDodgeTarget();
    } catch (_) {}
    try {
        updateAutoaim();
    } catch (_) {}
    try {
        updateAutododge();
    } catch (_) {}
}

export function install() {
    if (_installed) return true;
    const mod = findModule();
    if (!mod) return false;

    initFunctions(mod.base, mod);
    initScanner(mod.base);
    watchTileChanges(mod.base);
    setupAutododge();
    setupAutoaim();

    try {
        Interceptor.attach(mod.base.add(offsets.LogicBattleModeClient_update), {
            onEnter(args) {
                tick(args[0]);
            }
        });
    } catch (_) {}

    _installed = true;
    return true;
}

if (!install()) {
    let attempts = 0;
    const retry = setInterval(function () {
        attempts++;
        try {
            if (install()) clearInterval(retry);
            else if (attempts >= 40) clearInterval(retry);
        } catch (_) {
            if (attempts >= 40) clearInterval(retry);
        }
    }, 500);
}
