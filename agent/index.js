import { initFunctions } from "./core/functions.js";
import { offsets } from "./core/offsets.js";
import { initScanner, resetScannerCache, updateScanner } from "./core/scan.js";
import { resetAutoAim, setupAutoAim, updateAutoAim } from "./features/autoaim.js";
import { resetAutoDodge, setupAutoDodge, updateAutoDodge } from "./features/autododge.js";
import { setupLicense } from "./utils/license.js";
import { notifyBattleModeChanged, watchTileChanges, maybeRefreshWallCache } from "./utils/walls.js";

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
        } catch {}
        const mods = Process.enumerateModules();
        for (const mod of mods) {
            if (mod.name.toLowerCase().includes("nulls")) return mod;
        }
        return null;
    }

    #tick(bm) {
        if (!bm || bm.isNull()) return;
        if (!this.#lastBattle || !this.#lastBattle.equals(bm)) {
            this.#lastBattle = bm;
            resetScannerCache();
            resetAutoDodge();
            resetAutoAim();
            notifyBattleModeChanged(bm);
        }
        const now = Date.now();
        try {
            updateScanner(bm, now);
        } catch {}
        try {
            maybeRefreshWallCache(bm, now);
        } catch {}
        try {
            updateAutoAim();
        } catch {}
        try {
            updateAutoDodge();
        } catch {}
    }

    #finishInstall(mod) {
        initFunctions(mod.base, mod);
        try {
            setupLicense();
        } catch {}
        initScanner(mod.base);
        watchTileChanges(mod.base);
        setupAutoDodge();
        setupAutoAim();
        try {
            Interceptor.attach(mod.base.add(offsets.LogicBattleModeClient_update), {
                onEnter: (args) => {
                    this.#tick(args[0]);
                }
            });
        } catch {}
        this.#installed = true;
        return true;
    }

    #scheduleRetry() {
        if (this.#retryTimer !== null) return;
        this.#retryTimer = setTimeout(() => {
            this.#retryTimer = null;
            if (this.#installed || this.#attempts >= retryMaxAttempts) return;
            this.#attempts++;
            const mod = this.#findModule();
            if (mod) this.#finishInstall(mod);
            else this.#scheduleRetry();
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
