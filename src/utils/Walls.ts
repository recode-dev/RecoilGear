import { attachOffset, getFunctions, isValidPtr, ptrFromU32 } from "../core/Functions";
import { OFFSETS } from "../core/Offsets";

const MAX_MAP_TILES = 120;
const MAX_TOTAL_TILES = MAX_MAP_TILES * MAX_MAP_TILES;
const RETRY_MS = 2000;
const PF_MEMO_MAX = 256;
const PF_BUCKET_MS = 40;

export const MOVEMENT_BIT = 128;
export const PROJECTILE_BIT = 64;

export interface WallRayOptions {
    bit: number;
    radius: number;
}

export interface WallsApi {
    firstWallHit(wx0: number, wy0: number, wx1: number, wy1: number, size?: number): number;
    rayHitDistance(
        wx0: number,
        wy0: number,
        wx1: number,
        wy1: number,
        opts: WallRayOptions,
    ): number;
    movementBit: number;
}

interface PfQuery {
    size: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    f1: number;
    f2: number;
}

class WallGrid {
    tileSize = 300;
    #pathFinder: NativePointer | null = null;
    #probeOut: NativePointer | null = null;
    #walls: Uint8Array | null = null;
    #width = 0;
    #height = 0;
    #needsRebuild = true;
    #lastFailedTs = -RETRY_MS;
    #tileWatchInstalled = false;
    #pfHookInstalled = false;
    #pfMemo = new Map<string, number>();
    #pfMemoTs = 0;

    #syncTileSize(): void {
        try {
            const fn = getFunctions().LogicTileMap_tileToLogic;
            const a = Math.trunc(fn(0));
            const b = Math.trunc(fn(1));
            const size = b - a;
            if (size >= 100 && size <= 2000) this.tileSize = size;
        } catch {}
    }

    #syncPathFinder(tileMap: NativePointer): void {
        try {
            const pf = tileMap.add(OFFSETS.LogicTileMap_pathFinder).readPointer();
            this.#pathFinder = isValidPtr(pf) ? pf : null;
        } catch {
            this.#pathFinder = null;
        }
    }

    #flagsFor(tileType: NativePointer, flagsByType: Map<string, number>): number {
        const key = tileType.toString();
        let flags = flagsByType.get(key);
        if (flags !== undefined) return flags;
        flags = 0;
        try {
            const packed = tileType.add(OFFSETS.LogicTileData_blocksMovement).readU16();
            if (packed & 0xff) flags |= MOVEMENT_BIT;
            if (packed >> 8) flags |= PROJECTILE_BIT;
        } catch {}
        flagsByType.set(key, flags);
        return flags;
    }

    #tileFlags(view: DataView, i: number, flagsByType: Map<string, number>): number {
        const lo = view.getUint32(i * Process.pointerSize, true);
        const hi = view.getUint32(i * Process.pointerSize + 4, true);
        if (lo === 0 && hi === 0) return 0;
        let tileType: NativePointer | null = null;
        try {
            tileType = ptrFromU32(lo, hi).readPointer();
        } catch {
            return 0;
        }
        if (!isValidPtr(tileType)) return 0;
        return this.#flagsFor(tileType, flagsByType);
    }

    #readGrid(tiles: NativePointer, total: number): Uint8Array | null {
        const raw = tiles.readByteArray(total * Process.pointerSize);
        if (!raw) return null;
        const view = new DataView(raw);
        const gridData = new Uint8Array(total);
        const flagsByType = new Map<string, number>();
        for (let i = 0; i < total; i++) gridData[i] = this.#tileFlags(view, i, flagsByType);
        return gridData;
    }

    #rebuildFrom(tileMap: NativePointer): boolean {
        if (!isValidPtr(tileMap)) return false;
        try {
            this.#syncTileSize();
            this.#syncPathFinder(tileMap);
            const width = tileMap.add(OFFSETS.LogicTileMap_width).readS32();
            const height = tileMap.add(OFFSETS.LogicTileMap_height).readS32();
            if (width <= 0 || width > MAX_MAP_TILES || height <= 0 || height > MAX_MAP_TILES)
                return false;
            if (width * height > MAX_TOTAL_TILES) return false;
            const tiles = tileMap.add(OFFSETS.LogicTileMap_tiles).readPointer();
            if (!isValidPtr(tiles)) return false;
            const gridData = this.#readGrid(tiles, width * height);
            if (!gridData) return false;
            this.#walls = gridData;
            this.#width = width;
            this.#height = height;
            this.#needsRebuild = false;
            return true;
        } catch {
            return false;
        }
    }

    notifyBattleModeChanged(battleMode: NativePointer): void {
        this.#pfMemo.clear();
        this.#pfMemoTs = 0;
        this.#walls = null;
        this.#width = 0;
        this.#height = 0;
        this.#needsRebuild = true;
        this.#lastFailedTs = -RETRY_MS;
        this.maybeRefreshWallCache(battleMode, Date.now());
    }

    maybeRefreshWallCache(battleMode: NativePointer, now: number = Date.now()): void {
        if (!this.#needsRebuild || !isValidPtr(battleMode)) return;
        if (now - this.#lastFailedTs < RETRY_MS) return;
        try {
            const tileMap = getFunctions().LogicBattleModeClient_getTileMap(battleMode);
            if (this.#rebuildFrom(tileMap)) return;
        } catch {}
        this.#lastFailedTs = now;
    }

    #pfKey(query: PfQuery): string {
        return `${query.size}|${query.x1}|${query.y1}|${query.x2}|${query.y2}|${query.f1}|${query.f2}`;
    }

    #pfRemember(query: PfQuery, dist: number): void {
        const now = Date.now();
        if (now - this.#pfMemoTs > PF_BUCKET_MS || this.#pfMemo.size > PF_MEMO_MAX) {
            this.#pfMemo.clear();
            this.#pfMemoTs = now;
        }
        this.#pfMemo.set(this.#pfKey(query), dist);
    }

    #pfLookup(query: PfQuery): number {
        if (Date.now() - this.#pfMemoTs > PF_BUCKET_MS) return -1;
        const hit = this.#pfMemo.get(this.#pfKey(query));
        return hit === undefined ? -1 : hit;
    }

    watchTileChanges(base: NativePointer): void {
        if (!this.#tileWatchInstalled) {
            const listener = attachOffset(base, OFFSETS.LogicTile_setData, {
                onEnter: () => {
                    this.#needsRebuild = true;
                    this.#pfMemo.clear();
                },
            });
            this.#tileWatchInstalled = listener !== null;
        }
        this.#installPathHook(base);
    }

    #installPathHook(base: NativePointer): void {
        if (this.#pfHookInstalled) return;
        this.#pfHookInstalled = true;
        const remember = (query: PfQuery, dist: number): void => this.#pfRemember(query, dist);
        attachOffset(base, OFFSETS.LogicGamePlayUtil_getClosestPathfinderCollision, {
            onEnter(args) {
                this.size = args[0].toInt32();
                this.x1 = args[1].toInt32();
                this.y1 = args[2].toInt32();
                this.x2 = args[3].toInt32();
                this.y2 = args[4].toInt32();
                this.out = args[6];
                this.f1 = args[7].toInt32();
                this.f2 = args[8].toInt32();
            },
            onLeave(retval) {
                try {
                    let dist = Math.round(Math.hypot(this.x2 - this.x1, this.y2 - this.y1));
                    if (retval.toInt32() & 1) {
                        const hx = Math.trunc(this.out.readS32());
                        const hy = Math.trunc(this.out.add(4).readS32());
                        dist = Math.max(0, Math.round(Math.hypot(hx - this.x1, hy - this.y1)));
                    }
                    remember(this as unknown as PfQuery, dist);
                } catch {}
            },
        });
    }

    #circleTouchesTile(wx: number, wy: number, r: number, tx: number, ty: number): boolean {
        const size = this.tileSize;
        const cx = Math.max(tx * size, Math.min(wx, (tx + 1) * size));
        const cy = Math.max(ty * size, Math.min(wy, (ty + 1) * size));
        const dx = wx - cx;
        const dy = wy - cy;
        return dx * dx + dy * dy <= r * r;
    }

    segBlocked(wx0: number, wy0: number, wx1: number, wy1: number, opts: WallRayOptions): boolean {
        if (!this.#walls) return false;
        const radius = Math.max(opts.radius, 0);
        const checkBit = opts.bit;
        const dx = wx1 - wx0;
        const dy = wy1 - wy0;
        const len = Math.hypot(dx, dy);
        if (!(len > 1)) return this.isBlockedCircle(wx1, wy1, radius, checkBit);
        const n = Math.min(160, Math.max(1, Math.ceil(len / 25)));
        for (let i = 0; i <= n; i++) {
            const t = i / n;
            if (this.isBlockedCircle(wx0 + dx * t, wy0 + dy * t, radius, checkBit)) return true;
        }
        return false;
    }

    losCheckWide(
        wx0: number,
        wy0: number,
        wx1: number,
        wy1: number,
        opts: WallRayOptions,
    ): boolean {
        return !this.segBlocked(wx0, wy0, wx1, wy1, opts);
    }

    isBlockedAt(wx: number, wy: number, checkBit: number): boolean {
        const gridData = this.#walls;
        if (!gridData) return false;
        const width = this.#width;
        const height = this.#height;
        if (width <= 0 || height <= 0) return false;
        const tx = Math.trunc(wx / this.tileSize);
        const ty = Math.trunc(wy / this.tileSize);
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) return false;
        return !!(gridData[ty * width + tx] & checkBit);
    }

    #queryFor(size: number, wx0: number, wy0: number, wx1: number, wy1: number): PfQuery {
        return {
            size,
            x1: Math.trunc(wx0),
            y1: Math.trunc(wy0),
            x2: Math.trunc(wx1),
            y2: Math.trunc(wy1),
            f1: 0,
            f2: 0,
        };
    }

    firstWallHit(wx0: number, wy0: number, wx1: number, wy1: number, size?: number): number {
        const fn = getFunctions().LogicGamePlayUtil_getClosestPathfinderCollision;
        if (!isValidPtr(this.#pathFinder)) return -1;
        const bodySize = typeof size === "number" ? Math.trunc(size) : 0;
        const query = this.#queryFor(bodySize, wx0, wy0, wx1, wy1);
        const memo = this.#pfLookup(query);
        if (memo >= 0) return memo;
        try {
            if (!this.#probeOut) this.#probeOut = Memory.alloc(8);
            this.#probeOut.writeS32(0);
            this.#probeOut.add(4).writeS32(0);
            const hit = Math.trunc(
                fn(
                    bodySize,
                    query.x1,
                    query.y1,
                    query.x2,
                    query.y2,
                    this.#pathFinder,
                    this.#probeOut,
                    0,
                    0,
                ),
            );
            const hx = Math.trunc(this.#probeOut.readS32());
            const hy = Math.trunc(this.#probeOut.add(4).readS32());
            const dist =
                hit & 1
                    ? Math.max(0, Math.round(Math.hypot(hx - wx0, hy - wy0)))
                    : Math.round(Math.hypot(wx1 - wx0, wy1 - wy0));
            this.#pfRemember(query, dist);
            return dist;
        } catch {
            return -1;
        }
    }

    isBlockedCircle(wx: number, wy: number, radius: number, checkBit: number): boolean {
        const gridData = this.#walls;
        if (!gridData) return false;
        const width = this.#width;
        const height = this.#height;
        if (width <= 0 || height <= 0) return false;
        const r = Math.max(radius, 0);
        if (!(r > 0)) return this.isBlockedAt(wx, wy, checkBit);
        const size = this.tileSize;
        const tx0 = Math.max(0, Math.trunc((wx - r) / size));
        const tx1 = Math.min(width - 1, Math.trunc((wx + r) / size));
        const ty0 = Math.max(0, Math.trunc((wy - r) / size));
        const ty1 = Math.min(height - 1, Math.trunc((wy + r) / size));
        for (let ty = ty0; ty <= ty1; ty++) {
            for (let tx = tx0; tx <= tx1; tx++) {
                if (!(gridData[ty * width + tx] & checkBit)) continue;
                if (this.#circleTouchesTile(wx, wy, r, tx, ty)) return true;
            }
        }
        return false;
    }

    rayHitDistance(
        wx0: number,
        wy0: number,
        wx1: number,
        wy1: number,
        opts: WallRayOptions,
    ): number {
        if (!this.#walls) return -1;
        const radius = Math.max(opts.radius, 0);
        const checkBit = opts.bit;
        const dx = wx1 - wx0;
        const dy = wy1 - wy0;
        const len = Math.hypot(dx, dy);
        if (!(len > 1)) return this.isBlockedCircle(wx1, wy1, radius, checkBit) ? 0 : -1;
        const samples = Math.min(96, Math.max(2, Math.ceil(len / (this.tileSize / 4))));
        let prevT = 0;
        for (let i = 1; i <= samples; i++) {
            const t = i / samples;
            if (this.isBlockedCircle(wx0 + dx * t, wy0 + dy * t, radius, checkBit)) {
                let lo = prevT;
                let hi = t;
                for (let k = 0; k < 5; k++) {
                    const mid = (lo + hi) / 2;
                    if (this.isBlockedCircle(wx0 + dx * mid, wy0 + dy * mid, radius, checkBit))
                        hi = mid;
                    else lo = mid;
                }
                return hi * len;
            }
            prevT = t;
        }
        return -1;
    }
}

const wallGrid = new WallGrid();

export const notifyBattleModeChanged = (battleMode: NativePointer): void =>
    wallGrid.notifyBattleModeChanged(battleMode);
export const maybeRefreshWallCache = (battleMode: NativePointer, now: number): void =>
    wallGrid.maybeRefreshWallCache(battleMode, now);
export const watchTileChanges = (base: NativePointer): void => wallGrid.watchTileChanges(base);
export const losCheckWide = (
    wx0: number,
    wy0: number,
    wx1: number,
    wy1: number,
    opts: WallRayOptions,
): boolean => wallGrid.losCheckWide(wx0, wy0, wx1, wy1, opts);
export const firstWallHit = (
    wx0: number,
    wy0: number,
    wx1: number,
    wy1: number,
    size?: number,
): number => wallGrid.firstWallHit(wx0, wy0, wx1, wy1, size);
export const rayHitDistance = (
    wx0: number,
    wy0: number,
    wx1: number,
    wy1: number,
    opts: WallRayOptions,
): number => wallGrid.rayHitDistance(wx0, wy0, wx1, wy1, opts);
