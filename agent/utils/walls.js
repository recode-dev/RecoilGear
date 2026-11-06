import { getFunctions, isValidPtr, ptrFromU32 } from "../core/functions.js";
import { offsets } from "../core/offsets.js";

const maxMapTiles = 120;
const maxTotalTiles = maxMapTiles * maxMapTiles;
const retryMs = 2000;
const pfMemoMax = 256;
const pfBucketMs = 40;

export const movementBit = 128;
export const projectileBit = 64;

class WallGrid {
    tileSize = 300;
    #pathFinder = null;
    #probeOut = null;
    #walls = null;
    #width = 0;
    #height = 0;
    #needsRebuild = true;
    #lastFailedTs = 0;
    #tileWatchInstalled = false;
    #pfHookInstalled = false;
    #pfMemo = new Map();
    #pfMemoTs = 0;

    #syncTileSize() {
        try {
            const fn = getFunctions().LogicTileMap_tileToLogic;
            if (!fn) return;
            const a = Math.trunc(fn(0));
            const b = Math.trunc(fn(1));
            const size = b - a;
            if (size >= 100 && size <= 2000) this.tileSize = size;
        } catch {}
    }

    #syncPathFinder(tileMap) {
        try {
            const pf = tileMap.add(offsets.LogicTileMap_pathFinder).readPointer();
            this.#pathFinder = isValidPtr(pf) ? pf : null;
        } catch {
            this.#pathFinder = null;
        }
    }

    #flagsFor(tileType, flagsByType) {
        const key = tileType.toString();
        let flags = flagsByType.get(key);
        if (flags !== undefined) return flags;
        flags = 0;
        try {
            const packed = tileType.add(offsets.LogicTileData_blocksMovement).readU16();
            if (packed & 0xff) flags |= movementBit;
            if (packed >> 8) flags |= projectileBit;
        } catch {}
        flagsByType.set(key, flags);
        return flags;
    }

    #tileFlags(view, i, flagsByType) {
        const lo = view.getUint32(i * Process.pointerSize, true);
        const hi = view.getUint32(i * Process.pointerSize + 4, true);
        if (lo === 0 && hi === 0) return 0;
        let tileType = null;
        try {
            tileType = ptrFromU32(lo, hi).readPointer();
        } catch {
            return 0;
        }
        if (!isValidPtr(tileType)) return 0;
        return this.#flagsFor(tileType, flagsByType);
    }

    #readGrid(tiles, total) {
        const raw = tiles.readByteArray(total * Process.pointerSize);
        if (!raw) return null;
        const view = new DataView(raw);
        const gridData = new Uint8Array(total);
        const flagsByType = new Map();
        for (let i = 0; i < total; i++) gridData[i] = this.#tileFlags(view, i, flagsByType);
        return gridData;
    }

    #rebuildFrom(tileMap) {
        if (!isValidPtr(tileMap)) return false;
        try {
            this.#syncTileSize();
            this.#syncPathFinder(tileMap);
            const width = tileMap.add(offsets.LogicTileMap_width).readS32();
            const height = tileMap.add(offsets.LogicTileMap_height).readS32();
            if (width <= 0 || width > maxMapTiles || height <= 0 || height > maxMapTiles)
                return false;
            if (width * height > maxTotalTiles) return false;
            const tiles = tileMap.add(offsets.LogicTileMap_tiles).readPointer();
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

    notifyBattleModeChanged(battleMode) {
        this.#pfMemo.clear();
        this.#pfMemoTs = 0;
        this.#walls = null;
        this.#width = 0;
        this.#height = 0;
        this.#needsRebuild = true;
        this.#lastFailedTs = 0;
        this.maybeRefreshWallCache(battleMode, Date.now());
    }

    maybeRefreshWallCache(battleMode, now = Date.now()) {
        if (!this.#needsRebuild || !isValidPtr(battleMode)) return;
        if (now - this.#lastFailedTs < retryMs) return;
        try {
            const tileMap = getFunctions().LogicBattleModeClient_getTileMap(battleMode);
            if (this.#rebuildFrom(tileMap)) return;
        } catch {}
        this.#lastFailedTs = now;
    }

    #pfKey(q) {
        return `${q.size}|${q.x1}|${q.y1}|${q.x2}|${q.y2}|${q.f1}|${q.f2}`;
    }

    #pfRemember(q, dist) {
        const now = Date.now();
        if (now - this.#pfMemoTs > pfBucketMs || this.#pfMemo.size > pfMemoMax) {
            this.#pfMemo.clear();
            this.#pfMemoTs = now;
        }
        this.#pfMemo.set(this.#pfKey(q), dist);
    }

    #pfLookup(q) {
        if (Date.now() - this.#pfMemoTs > pfBucketMs) return -1;
        const hit = this.#pfMemo.get(this.#pfKey(q));
        return hit === undefined ? -1 : hit;
    }

    watchTileChanges(base) {
        if (!this.#tileWatchInstalled) {
            try {
                Interceptor.attach(base.add(offsets.LogicTile_setData), {
                    onEnter: () => {
                        this.#needsRebuild = true;
                        this.#pfMemo.clear();
                    }
                });
                this.#tileWatchInstalled = true;
            } catch {}
        }
        this.#installPathHook(base);
    }

    #installPathHook(base) {
        if (this.#pfHookInstalled) return;
        this.#pfHookInstalled = true;
        try {
            const fns = getFunctions();
            if (!fns.LogicGamePlayUtil_getClosestPathfinderCollision) return;
            const remember = (q, dist) => this.#pfRemember(q, dist);
            Interceptor.attach(base.add(offsets.LogicGamePlayUtil_getClosestPathfinderCollision), {
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
                        remember(this, dist);
                    } catch {}
                }
            });
        } catch {}
    }

    #blockedCell(cx, cy, checkBit) {
        const width = this.#width;
        const height = this.#height;
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) return false;
        return !!(this.#walls[cy * width + cx] & checkBit);
    }

    losCheck(wx0, wy0, wx1, wy1, checkBit) {
        if (!this.#walls) return true;
        let cx = Math.trunc(wx0 / this.tileSize);
        let cy = Math.trunc(wy0 / this.tileSize);
        const tx = Math.trunc(wx1 / this.tileSize);
        const ty = Math.trunc(wy1 / this.tileSize);
        if (cx === tx && cy === ty) return true;
        const dx = Math.abs(tx - cx);
        const dy = -Math.abs(ty - cy);
        const sx = cx < tx ? 1 : -1;
        const sy = cy < ty ? 1 : -1;
        let err = dx + dy;
        const maxSteps = dx - dy + 2;
        for (let n = 0; n < maxSteps; n++) {
            const e2 = 2 * err;
            if (e2 >= dy) {
                err += dy;
                cx += sx;
            }
            if (e2 <= dx) {
                err += dx;
                cy += sy;
            }
            if (cx === tx && cy === ty) return !this.#blockedCell(tx, ty, checkBit);
            if (this.#blockedCell(cx, cy, checkBit)) return false;
        }
        return true;
    }

    losCheckWide(wx0, wy0, wx1, wy1, opts) {
        const checkBit = opts.bit;
        if (this.losCheck(wx0, wy0, wx1, wy1, checkBit) === false) return false;
        const r = Math.max(opts.radius, 0);
        if (r <= 0) return true;
        const dx = wx1 - wx0;
        const dy = wy1 - wy0;
        const len = Math.hypot(dx, dy);
        if (!(len > 1)) return this.isBlockedAt(wx1, wy1, checkBit) === false;
        const px = (-dy / len) * r;
        const py = (dx / len) * r;
        if (this.losCheck(wx0 + px, wy0 + py, wx1 + px, wy1 + py, checkBit) === false) return false;
        if (this.losCheck(wx0 - px, wy0 - py, wx1 - px, wy1 - py, checkBit) === false) return false;
        return true;
    }

    isBlockedAt(wx, wy, checkBit) {
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

    #queryFor(size, wx0, wy0, wx1, wy1) {
        return {
            size,
            x1: Math.trunc(wx0),
            y1: Math.trunc(wy0),
            x2: Math.trunc(wx1),
            y2: Math.trunc(wy1),
            f1: 0,
            f2: 0
        };
    }

    firstWallHit(wx0, wy0, wx1, wy1, size) {
        const fn = getFunctions().LogicGamePlayUtil_getClosestPathfinderCollision;
        if (!fn || !isValidPtr(this.#pathFinder)) return -1;
        const bodySize = typeof size === "number" ? Math.trunc(size) : 0;
        const q = this.#queryFor(bodySize, wx0, wy0, wx1, wy1);
        const memo = this.#pfLookup(q);
        if (memo >= 0) return memo;
        try {
            if (!this.#probeOut) this.#probeOut = Memory.alloc(8);
            this.#probeOut.writeS32(0);
            this.#probeOut.add(4).writeS32(0);
            const hit = Math.trunc(
                fn(bodySize, q.x1, q.y1, q.x2, q.y2, this.#pathFinder, this.#probeOut, 0, 0)
            );
            const hx = Math.trunc(this.#probeOut.readS32());
            const hy = Math.trunc(this.#probeOut.add(4).readS32());
            const dist =
                hit & 1
                    ? Math.max(0, Math.round(Math.hypot(hx - wx0, hy - wy0)))
                    : Math.round(Math.hypot(wx1 - wx0, wy1 - wy0));
            this.#pfRemember(q, dist);
            return dist;
        } catch {
            return -1;
        }
    }

    isBlockedWide(wx, wy, radius, checkBit) {
        if (this.isBlockedAt(wx, wy, checkBit)) return true;
        const r = Math.max(radius, 0);
        if (r <= 0) return false;
        return (
            this.isBlockedAt(wx + r, wy, checkBit) ||
            this.isBlockedAt(wx - r, wy, checkBit) ||
            this.isBlockedAt(wx, wy + r, checkBit) ||
            this.isBlockedAt(wx, wy - r, checkBit)
        );
    }
}

const wallGrid = new WallGrid();

export const notifyBattleModeChanged = (battleMode) => wallGrid.notifyBattleModeChanged(battleMode);
export const maybeRefreshWallCache = (battleMode, now) =>
    wallGrid.maybeRefreshWallCache(battleMode, now);
export const watchTileChanges = (base) => wallGrid.watchTileChanges(base);
export const losCheckWide = (wx0, wy0, wx1, wy1, opts) =>
    wallGrid.losCheckWide(wx0, wy0, wx1, wy1, opts);
export const firstWallHit = (wx0, wy0, wx1, wy1, size) =>
    wallGrid.firstWallHit(wx0, wy0, wx1, wy1, size);
export const isBlockedWide = (wx, wy, radius, checkBit) =>
    wallGrid.isBlockedWide(wx, wy, radius, checkBit);
