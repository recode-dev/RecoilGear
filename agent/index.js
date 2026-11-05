import { initFunctions } from "./core/functions.js";
import { offsets } from "./core/offsets.js";
import { initScanner, resetScannerCache, updateScanner } from "./core/scan.js";
import { notifyBattleModeChanged, watchTileChanges, maybeRefreshWallCache } from "./utils/walls.js";
import { setupLicense } from "./utils/license.js";
import { resetAutododge, setupAutododge, updateAutododge } from "./features/autododge.js";
import { resetAutoaim, setupAutoaim, updateAutoaim } from "./features/autoaim.js";

const retryIntervalMs = 500;
const retryMaxAttempts = 40;

class RecoilGearAgent {
    #lastBattle = null;
    #installed = false;
    #attempts = 0;
    #retryTimer = null;

    #findModule() {
        try {
            return Process.getModuleByName("Nulls Brawl");
        } catch (_) {}
        const mods = Process.enumerateModules();
        for (let i = 0; i < mods.length; i++) {
            if (mods[i].name.toLowerCase().indexOf("nulls") >= 0) return mods[i];
        }
        return null;
    }

    #tick(bm) {
        if (!bm || bm.isNull()) return;
        if (!this.#lastBattle || !this.#lastBattle.equals(bm)) {
            this.#lastBattle = bm;
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
            updateAutoaim();
        } catch (_) {}
        try {
            updateAutododge();
        } catch (_) {}
    }

    #finishInstall(mod) {
        initFunctions(mod.base, mod);
        try {
            setupLicense();
        } catch (_) {}
        initScanner(mod.base);
        watchTileChanges(mod.base);
        setupAutododge();
        setupAutoaim();
        const self = this;
        try {
            Interceptor.attach(mod.base.add(offsets.LogicBattleModeClient_update), {
                onEnter(args) {
                    self.#tick(args[0]);
                }
            });
        } catch (_) {}
        this.#installed = true;
        return true;
    }

    #scheduleRetry() {
        if (this.#retryTimer !== null) return;
        const self = this;
        this.#retryTimer = setTimeout(() => {
            self.#retryTimer = null;
            if (self.#installed || self.#attempts >= retryMaxAttempts) return;
            self.#attempts++;
            const mod = self.#findModule();
            if (mod) self.#finishInstall(mod);
            else self.#scheduleRetry();
        }, retryIntervalMs);
    }

    install() {
        if (this.#installed) return true;
        const mod = this.#findModule();
        if (mod) return this.#finishInstall(mod);
        this.#scheduleRetry();
        return false;
    }
}

const agent = new RecoilGearAgent();
agent.install();
