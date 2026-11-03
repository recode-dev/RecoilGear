import { initFunctions } from "./core/functions.js";

import { offsets } from "./core/offsets.js";

import { initScanner, resetScannerCache, updateScanner } from "./core/scan.js";

import { notifyBattleModeChanged, watchTileChanges, maybeRefreshWallCache } from "./utils/walls.js";

import { setupLicense } from "./utils/license.js";

import {
    pushDodgeTarget,
    resetAutododge,
    setupAutododge,
    updateAutododge
} from "./features/autododge.js";

import { resetAutoaim, setupAutoaim, updateAutoaim } from "./features/autoaim.js";

let _base = null;
let _lastBattle = null;
const SERVER_TICK_MS = 50;
let _frameMs = 16.7;
let _lastFrameAt = 0;
let _dodgeEveryMs = SERVER_TICK_MS;

let _installed = false;
let _lastLogicAt = 0;

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
    const frameDt = now - _lastFrameAt;
    _lastFrameAt = now;
    if (frameDt >= 4 && frameDt <= 100) {
        _frameMs = _frameMs * 0.85 + frameDt * 0.15;
        const stride = Math.max(1, Math.ceil((SERVER_TICK_MS * 0.8) / _frameMs));
        _dodgeEveryMs = stride * _frameMs - _frameMs * 0.5;
    }
    try {
        updateScanner(bm, now);
    } catch (_) {}
    try {
        pushDodgeTarget();
    } catch (_) {}
    try {
        updateAutoaim();
    } catch (_) {}
    try {
        maybeRefreshWallCache(bm, now);
    } catch (_) {}
    if (now - _lastLogicAt >= _dodgeEveryMs) {
        _lastLogicAt = now;
        try {
            updateAutododge();
        } catch (_) {}
    }
}

export function install() {
    if (_installed) return true;
    const mod = findModule();
    if (!mod) return false;
    _base = mod.base;

    initFunctions(_base, mod);
    setupLicense();
    initScanner(_base);
    watchTileChanges(_base);
    setupAutododge();
    setupAutoaim();

    try {
        Interceptor.attach(_base.add(offsets.LogicBattleModeClient_update), {
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
