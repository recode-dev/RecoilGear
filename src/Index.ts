import { attachOffset, initFunctions } from "./core/Functions";
import { OFFSETS } from "./core/Offsets";
import { initScanner, resetScannerCache, updateScanner } from "./core/Scan";
import { resetAutoAim, setupAutoAim, updateAutoAim } from "./features/AutoAim";
import { resetAutoDodge, setupAutoDodge, updateAutoDodge } from "./features/AutoDodge";
import { setupLicense } from "./utils/License";
import { maybeRefreshWallCache, notifyBattleModeChanged, watchTileChanges } from "./utils/Walls";

const RETRY_INTERVAL_MS = 500;
const RETRY_MAX_ATTEMPTS = 40;

class RecoilGearAgent {
    #lastBattle: NativePointer | null = null;
    #installed = false;
    #attempts = 0;
    #retryTimer: TimeoutId | null = null;
    #lastTickAt = 0;
    #lastAimAt = 0;
    #lastDodgeAt = 0;

    #findModule(): Module | null {
        try {
            return Process.getModuleByName("Nulls Brawl");
        } catch {}
        const mods = Process.enumerateModules();
        for (const mod of mods) {
            if (mod.name.toLowerCase().includes("nulls")) return mod;
        }
        return null;
    }

    #tick(bm: NativePointer): void {
        if (!bm || bm.isNull()) return;
        if (!this.#lastBattle || !this.#lastBattle.equals(bm)) {
            this.#lastBattle = bm;
            resetScannerCache();
            resetAutoDodge();
            resetAutoAim();
            notifyBattleModeChanged(bm);
        }
        const now = Date.now();
        if (now - this.#lastTickAt < 6) return;
        this.#lastTickAt = now;
        try {
            updateScanner(bm, now);
        } catch {}
        try {
            maybeRefreshWallCache(bm, now);
        } catch {}
        if (now - this.#lastAimAt >= 18) {
            this.#lastAimAt = now;
            try {
                updateAutoAim();
            } catch {}
        }
        if (now - this.#lastDodgeAt >= 45) {
            this.#lastDodgeAt = now;
            try {
                updateAutoDodge();
            } catch {}
        }
    }

    #finishInstall(mod: Module): boolean {
        initFunctions(mod.base, mod);
        try {
            setupLicense();
        } catch {}
        initScanner(mod.base);
        watchTileChanges(mod.base);
        setupAutoDodge();
        setupAutoAim();
        attachOffset(mod.base, OFFSETS.LogicBattleModeClient_update, {
            onEnter: (args) => {
                this.#tick(args[0]);
            }
        });
        this.#installed = true;
        return true;
    }

    #scheduleRetry(): void {
        if (this.#retryTimer !== null) return;
        this.#retryTimer = setTimeout(() => {
            this.#retryTimer = null;
            if (this.#installed || this.#attempts >= RETRY_MAX_ATTEMPTS) return;
            this.#attempts++;
            const mod = this.#findModule();
            if (mod) this.#finishInstall(mod);
            else this.#scheduleRetry();
        }, RETRY_INTERVAL_MS);
    }

    install(): boolean {
        if (this.#installed) return true;
        const mod = this.#findModule();
        if (mod) return this.#finishInstall(mod);
        this.#scheduleRetry();
        return false;
    }
}

const agent = new RecoilGearAgent();
agent.install();
