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
    #gridVersion = 1;

    get version() {
        return this.#gridVersion;
    }

    #syncTileSize() {
        try {
            const fn = getFunctions().LogicTileMap_tileToLogic;
            if (!fn) return;
            const a = fn(0) | 0;
            const b = fn(1) | 0;
            const size = b - a;
            if (size >= 100 && size <= 2000) this.tileSize = size;
        } catch (_) {}
    }

    #rebuildFrom(tileMap) {
        if (!isValidPtr(tileMap)) return false;
        try {
            this.#syncTileSize();
            try {
                const pf = tileMap.add(offsets.LogicTileMap_pathFinder).readPointer();
                this.#pathFinder = isValidPtr(pf) ? pf : null;
            } catch (_) {
                this.#pathFinder = null;
            }
            const width = tileMap.add(offsets.LogicTileMap_width).readS32();
            const height = tileMap.add(offsets.LogicTileMap_height).readS32();
            if (width <= 0 || width > maxMapTiles || height <= 0 || height > maxMapTiles)
                return false;
            const total = width * height;
            if (total > maxTotalTiles) return false;
            const tiles = tileMap.add(offsets.LogicTileMap_tiles).readPointer();
            if (!isValidPtr(tiles)) return false;
            const pointerSize = Process.pointerSize;
            const raw = tiles.readByteArray(total * pointerSize);
            if (!raw) return false;
            const view = new DataView(raw);
            const gridData = new Uint8Array(total);
            const flagsByType = new Map();
            for (let i = 0; i < total; i++) {
                const lo = view.getUint32(i * pointerSize, true);
                const hi = view.getUint32(i * pointerSize + 4, true);
                if (lo === 0 && hi === 0) continue;
                const tile = ptrFromU32(lo, hi);
                let tileType;
                try {
                    tileType = tile.readPointer();
                } catch (_) {
                    continue;
                }
                if (!isValidPtr(tileType)) continue;
                const key = tileType.toString();
                let flags = flagsByType.get(key);
                if (flags === undefined) {
                    flags = 0;
                    try {
                        const packed = tileType.add(offsets.LogicTileData_blocksMovement).readU16();
                        if (packed & 0xff) flags |= movementBit;
                        if (packed >> 8) flags |= projectileBit;
                    } catch (_) {}
                    flagsByType.set(key, flags);
                }
                gridData[i] = flags;
            }
            this.#walls = gridData;
            this.#width = width;
            this.#height = height;
            this.#needsRebuild = false;
            this.#gridVersion++;
            return true;
        } catch (_) {
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

    maybeRefreshWallCache(battleMode, now) {
        if (!this.#needsRebuild || !isValidPtr(battleMode)) return;
        if (now === undefined) now = Date.now();
        if (now - this.#lastFailedTs < retryMs) return;
        try {
            const tileMap = getFunctions().LogicBattleModeClient_getTileMap(battleMode);
            if (this.#rebuildFrom(tileMap)) return;
        } catch (_) {}
        this.#lastFailedTs = now;
    }

    #pfKey(size, x1, y1, x2, y2, f1, f2) {
        return `${size}|${x1}|${y1}|${x2}|${y2}|${f1}|${f2}`;
    }

    #pfRemember(size, x1, y1, x2, y2, f1, f2, dist) {
        const now = Date.now();
        if (now - this.#pfMemoTs > pfBucketMs || this.#pfMemo.size > pfMemoMax) {
            this.#pfMemo.clear();
            this.#pfMemoTs = now;
        }
        this.#pfMemo.set(this.#pfKey(size, x1, y1, x2, y2, f1, f2), dist);
    }

    #pfLookup(size, x1, y1, x2, y2, f1, f2) {
        if (Date.now() - this.#pfMemoTs > pfBucketMs) return -1;
        const hit = this.#pfMemo.get(this.#pfKey(size, x1, y1, x2, y2, f1, f2));
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
            } catch (_) {}
        }
        this.#installPathHook(base);
    }

    #installPathHook(base) {
        if (this.#pfHookInstalled) return;
        this.#pfHookInstalled = true;
        try {
            const fns = getFunctions();
            if (!fns.LogicGamePlayUtil_getClosestPathfinderCollision) return;
            const self = this;
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
                            const hx = this.out.readS32() | 0;
                            const hy = this.out.add(4).readS32() | 0;
                            dist = Math.max(0, Math.round(Math.hypot(hx - this.x1, hy - this.y1)));
                        }
                        self.#pfRemember(
                            this.size,
                            this.x1,
                            this.y1,
                            this.x2,
                            this.y2,
                            this.f1,
                            this.f2,
                            dist
                        );
                    } catch (_) {}
                }
            });
        } catch (_) {}
    }

    losCheck(wx0, wy0, wx1, wy1, checkBit) {
        const gridData = this.#walls;
        if (!gridData) return true;
        const width = this.#width;
        const height = this.#height;
        let cx = (wx0 / this.tileSize) | 0;
        let cy = (wy0 / this.tileSize) | 0;
        const tx = (wx1 / this.tileSize) | 0;
        const ty = (wy1 / this.tileSize) | 0;
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
            if (cx === tx && cy === ty) {
                if (
                    tx >= 0 &&
                    tx < width &&
                    ty >= 0 &&
                    ty < height &&
                    gridData[ty * width + tx] & checkBit
                )
                    return false;
                return true;
            }
            if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
            if (gridData[cy * width + cx] & checkBit) return false;
        }
        return true;
    }

    losCheckWide(wx0, wy0, wx1, wy1, checkBit, radius) {
        if (this.losCheck(wx0, wy0, wx1, wy1, checkBit) === false) return false;
        const r = radius > 0 ? radius : 0;
        if (r <= 0) return true;
        const dx = wx1 - wx0;
        const dy = wy1 - wy0;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (!(len > 1)) return this.isBlockedAt(wx1, wy1, checkBit) === false;
        const px = (-dy / len) * r;
        const py = (dx / len) * r;
        if (this.losCheck(wx0 + px, wy0 + py, wx1 + px, wy1 + py, checkBit) === false) return false;
        if (this.losCheck(wx0 - px, wy0 - py, wx1 - px, wy1 - py, checkBit) === false) return false;
        return true;
    }

    pathBlocked(x0, y0, x1, y1, checkBit) {
        const gridData = this.#walls;
        if (!gridData) return false;
        const width = this.#width;
        const height = this.#height;
        if (width <= 0 || height <= 0) return false;
        const cx0 = Math.max(0, Math.floor(Math.min(x0, x1) / this.tileSize));
        const cx1 = Math.min(width - 1, Math.floor(Math.max(x0, x1) / this.tileSize));
        const cy0 = Math.max(0, Math.floor(Math.min(y0, y1) / this.tileSize));
        const cy1 = Math.min(height - 1, Math.floor(Math.max(y0, y1) / this.tileSize));
        const dx = x1 - x0;
        const dy = y1 - y0;
        const lenSq = dx * dx + dy * dy;
        for (let cy = cy0; cy <= cy1; cy++) {
            const by = cy * this.tileSize;
            for (let cx = cx0; cx <= cx1; cx++) {
                if (!(gridData[cy * width + cx] & checkBit)) continue;
                const bx = cx * this.tileSize;
                if (lenSq < 1) {
                    if (
                        x0 >= bx &&
                        x0 <= bx + this.tileSize &&
                        y0 >= by &&
                        y0 <= by + this.tileSize
                    )
                        return true;
                    continue;
                }
                let t =
                    ((bx + this.tileSize * 0.5 - x0) * dx + (by + this.tileSize * 0.5 - y0) * dy) /
                    lenSq;
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                const px = x0 + dx * t;
                const py = y0 + dy * t;
                const qx =
                    px < bx ? bx - px : px > bx + this.tileSize ? px - bx - this.tileSize : 0;
                const qy =
                    py < by ? by - py : py > by + this.tileSize ? py - by - this.tileSize : 0;
                if (qx * qx + qy * qy <= 1) return true;
            }
        }
        return false;
    }

    isBlockedAt(wx, wy, checkBit) {
        const gridData = this.#walls;
        if (!gridData) return false;
        const width = this.#width;
        const height = this.#height;
        if (width <= 0 || height <= 0) return false;
        const tx = (wx / this.tileSize) | 0;
        const ty = (wy / this.tileSize) | 0;
        if (tx < 0 || tx >= width || ty < 0 || ty >= height) return false;
        return !!(gridData[ty * width + tx] & checkBit);
    }

    firstWallHit(wx0, wy0, wx1, wy1, size) {
        const fn = getFunctions().LogicGamePlayUtil_getClosestPathfinderCollision;
        if (!fn || !isValidPtr(this.#pathFinder)) return -1;
        const bodySize = typeof size === "number" ? size | 0 : 0;
        const memo = this.#pfLookup(bodySize, wx0 | 0, wy0 | 0, wx1 | 0, wy1 | 0, 0, 0);
        if (memo >= 0) return memo;
        try {
            if (!this.#probeOut) this.#probeOut = Memory.alloc(8);
            this.#probeOut.writeS32(0);
            this.#probeOut.add(4).writeS32(0);
            const hit =
                fn(
                    bodySize,
                    wx0 | 0,
                    wy0 | 0,
                    wx1 | 0,
                    wy1 | 0,
                    this.#pathFinder,
                    this.#probeOut,
                    0,
                    0
                ) | 0;
            const hx = this.#probeOut.readS32() | 0;
            const hy = this.#probeOut.add(4).readS32() | 0;
            const dist = !(hit & 1)
                ? Math.round(Math.hypot(wx1 - wx0, wy1 - wy0))
                : Math.max(0, Math.round(Math.hypot(hx - wx0, hy - wy0)));
            this.#pfRemember(bodySize, wx0 | 0, wy0 | 0, wx1 | 0, wy1 | 0, 0, 0, dist);
            return dist;
        } catch (_) {
            return -1;
        }
    }

    isBlockedWide(wx, wy, radius, checkBit) {
        if (this.isBlockedAt(wx, wy, checkBit)) return true;
        const r = radius > 0 ? radius : 0;
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

export const wallsVersion = () => wallGrid.version;
export const tileSizeUnits = () => wallGrid.tileSize;
export const notifyBattleModeChanged = (battleMode) => wallGrid.notifyBattleModeChanged(battleMode);
export const maybeRefreshWallCache = (battleMode, now) =>
    wallGrid.maybeRefreshWallCache(battleMode, now);
export const watchTileChanges = (base) => wallGrid.watchTileChanges(base);
export const losCheck = (wx0, wy0, wx1, wy1, checkBit) =>
    wallGrid.losCheck(wx0, wy0, wx1, wy1, checkBit);
export const losCheckWide = (wx0, wy0, wx1, wy1, checkBit, radius) =>
    wallGrid.losCheckWide(wx0, wy0, wx1, wy1, checkBit, radius);
export const pathBlocked = (x0, y0, x1, y1, checkBit) =>
    wallGrid.pathBlocked(x0, y0, x1, y1, checkBit);
export const firstWallHit = (wx0, wy0, wx1, wy1, size) =>
    wallGrid.firstWallHit(wx0, wy0, wx1, wy1, size);
export const isBlockedWide = (wx, wy, radius, checkBit) =>
    wallGrid.isBlockedWide(wx, wy, radius, checkBit);
