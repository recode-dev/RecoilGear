import { attachOffset, initFunctions } from "./core/Functions";
import { OFFSETS } from "./core/Offsets";
import { initScanner, resetScannerCache, updateScanner } from "./core/Scan";
import { resetAutoAim, setupAutoAim, updateAutoAim } from "./features/AutoAim";
import { resetAutoDodge, setupAutoDodge, updateAutoDodge } from "./features/AutoDodge";
import { setupLicense } from "./utils/License";
import { maybeRefreshWallCache, notifyBattleModeChanged, watchTileChanges } from "./utils/Walls";

const RETRY_INTERVAL_MS = 500;
const RETRY_MAX_ATTEMPTS = 40;
const TICK_MIN_INTERVAL_MS = 6;
const AIM_INTERVAL_MS = 18;
const DODGE_INTERVAL_MS = 45;

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
        return (
            Process.enumerateModules().find((mod) => mod.name.toLowerCase().includes("nulls")) ??
            null
        );
    }

    #tick(bm: NativePointer): void {
        if (bm.isNull()) return;
        if (!this.#lastBattle || !this.#lastBattle.equals(bm)) {
            this.#lastBattle = bm;
            resetScannerCache();
            resetAutoDodge();
            resetAutoAim();
            notifyBattleModeChanged(bm);
        }
        const now = Date.now();
        if (now - this.#lastTickAt < TICK_MIN_INTERVAL_MS) return;
        this.#lastTickAt = now;
        try {
            updateScanner(bm, now);
        } catch {}
        try {
            maybeRefreshWallCache(bm, now);
        } catch {}
        if (now - this.#lastAimAt >= AIM_INTERVAL_MS) {
            this.#lastAimAt = now;
            try {
                updateAutoAim();
            } catch {}
        }
        if (now - this.#lastDodgeAt >= DODGE_INTERVAL_MS) {
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
            },
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
