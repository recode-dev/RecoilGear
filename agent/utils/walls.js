import { getFunctions, isValidPtr, ptrFromU32 } from "../core/functions.js";
import { offsets } from "../core/offsets.js";

const MAX_MAP_TILES = 120;
const MAX_TOTAL_TILES = MAX_MAP_TILES * MAX_MAP_TILES;
const RETRY_MS = 2e3;
let tileSize = 300;
export const BLOCKS_MOVEMENT = 128;
export const BLOCKS_PROJECTILES = 64;

var pathFinder = null;
var probeOut = null;
var walls = null;
var wallsWidth = 0;
var wallsHeight = 0;
var needsRebuild = true;
var lastFailedTs = 0;
var tileWatchInstalled = false;
var pfHookInstalled = false;
var pfMemo = new Map();
var pfMemoTs = 0;

function _syncTileSize() {
    try {
        const fn = getFunctions().LogicTileMap_tileToLogic;
        if (!fn) return;
        const a = fn(0) | 0;
        const b = fn(1) | 0;
        const size = b - a;
        if (size >= 100 && size <= 2000) tileSize = size;
    } catch (_) {}
}

function _rebuildFrom(tileMap) {
    if (!isValidPtr(tileMap)) return false;
    try {
        _syncTileSize();
        try {
            const pf = tileMap.add(offsets.TileMap_pathFinder).readPointer();
            pathFinder = isValidPtr(pf) ? pf : null;
        } catch (_) {
            pathFinder = null;
        }
        const width = tileMap.add(offsets.TileMap_Width).readS32();
        const height = tileMap.add(offsets.TileMap_Height).readS32();
        if (width <= 0 || width > MAX_MAP_TILES || height <= 0 || height > MAX_MAP_TILES)
            return false;
        const total = width * height;
        if (total > MAX_TOTAL_TILES) return false;
        const tiles = tileMap.add(offsets.TileMap_TilesArray).readPointer();
        if (!isValidPtr(tiles)) return false;

        const pointerSize = Process.pointerSize;
        const raw = tiles.readByteArray(total * pointerSize);
        if (!raw) return false;
        const view = new DataView(raw);
        const grid = new Uint8Array(total);
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
            if (flags === void 0) {
                flags = 0;
                try {
                    const packed = tileType.add(offsets.TileTypeData_BlocksMovement).readU16();
                    if (packed & 0xff) flags |= BLOCKS_MOVEMENT;
                    if (packed >> 8) flags |= BLOCKS_PROJECTILES;
                } catch (_) {}
                flagsByType.set(key, flags);
            }
            grid[i] = flags;
        }

        walls = grid;
        wallsWidth = width;
        wallsHeight = height;
        needsRebuild = false;
        return true;
    } catch (_) {
        return false;
    }
}

export function notifyBattleModeChanged(battleMode) {
    pfMemo.clear();
    pfMemoTs = 0;
    walls = null;
    wallsWidth = 0;
    wallsHeight = 0;
    needsRebuild = true;
    lastFailedTs = 0;
    maybeRefreshWallCache(battleMode, Date.now());
}

export function maybeRefreshWallCache(battleMode, now) {
    if (!needsRebuild || !isValidPtr(battleMode)) return;
    if (now === void 0) now = Date.now();
    if (now - lastFailedTs < RETRY_MS) return;
    try {
        const tileMap = getFunctions().LogicBattleModeClient_getTileMap(battleMode);
        if (_rebuildFrom(tileMap)) return;
    } catch (_) {}
    lastFailedTs = now;
}

const PF_MEMO_MAX = 256;
const PF_BUCKET_MS = 40;

function _pfKey(size, x1, y1, x2, y2, f1, f2) {
    return `${size}|${x1}|${y1}|${x2}|${y2}|${f1}|${f2}`;
}

function _pfRemember(size, x1, y1, x2, y2, f1, f2, dist) {
    const now = Date.now();
    if (now - pfMemoTs > PF_BUCKET_MS || pfMemo.size > PF_MEMO_MAX) {
        pfMemo.clear();
        pfMemoTs = now;
    }
    pfMemo.set(_pfKey(size, x1, y1, x2, y2, f1, f2), dist);
}

function _pfLookup(size, x1, y1, x2, y2, f1, f2) {
    if (Date.now() - pfMemoTs > PF_BUCKET_MS) return -1;
    const hit = pfMemo.get(_pfKey(size, x1, y1, x2, y2, f1, f2));
    return hit === void 0 ? -1 : hit;
}

function _installPathHook(base) {
    if (pfHookInstalled) return;
    pfHookInstalled = true;
    try {
        const fns = getFunctions();
        if (!fns.LogicGamePlayUtil_getClosestPathfinderCollision) return;
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
                    _pfRemember(
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

export function watchTileChanges(base) {
    if (tileWatchInstalled) return;
    try {
        Interceptor.attach(base.add(offsets.LogicTile__setData), {
            onEnter() {
                needsRebuild = true;
                pfMemo.clear();
            }
        });
        tileWatchInstalled = true;
    } catch (_) {}
    _installPathHook(base);
}
export function losCheck(wx0, wy0, wx1, wy1, checkBit) {
    const grid = walls;
    if (!grid) return true;
    const width = wallsWidth;
    const height = wallsHeight;
    let cx = (wx0 / tileSize) | 0;
    let cy = (wy0 / tileSize) | 0;
    const tx = (wx1 / tileSize) | 0;
    const ty = (wy1 / tileSize) | 0;
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
        if (cx === tx && cy === ty) return true;
        if (cx < 0 || cx >= width || cy < 0 || cy >= height) continue;
        if (grid[cy * width + cx] & checkBit) return false;
    }
    return true;
}
function isBlockedAt(wx, wy, checkBit) {
    const grid = walls;
    if (!grid) return false;
    const width = wallsWidth;
    const height = wallsHeight;
    if (width <= 0 || height <= 0) return false;
    const tx = (wx / tileSize) | 0;
    const ty = (wy / tileSize) | 0;
    if (tx < 0 || tx >= width || ty < 0 || ty >= height) return false;
    return !!(grid[ty * width + tx] & checkBit);
}

export function tileSizeUnits() {
    return tileSize;
}

export function firstWallHit(wx0, wy0, wx1, wy1, size) {
    const fn = getFunctions().LogicGamePlayUtil_getClosestPathfinderCollision;
    if (!fn || !isValidPtr(pathFinder)) return -1;
    const bodySize = typeof size === "number" ? size | 0 : 0;
    const memo = _pfLookup(bodySize, wx0 | 0, wy0 | 0, wx1 | 0, wy1 | 0, 1, 1);
    if (memo >= 0) return memo;
    try {
        if (!probeOut) probeOut = Memory.alloc(8);
        probeOut.writeS32(0);
        probeOut.add(4).writeS32(0);
        const hit =
            fn(bodySize, wx0 | 0, wy0 | 0, wx1 | 0, wy1 | 0, pathFinder, probeOut, 1, 1) | 0;
        const hx = probeOut.readS32() | 0;
        const hy = probeOut.add(4).readS32() | 0;
        const dist = !(hit & 1)
            ? Math.round(Math.hypot(wx1 - wx0, wy1 - wy0))
            : Math.max(0, Math.round(Math.hypot(hx - wx0, hy - wy0)));
        _pfRemember(bodySize, wx0 | 0, wy0 | 0, wx1 | 0, wy1 | 0, 1, 1, dist);
        return dist;
    } catch (_) {
        return -1;
    }
}

export function isBlockedWide(wx, wy, radius, checkBit) {
    if (isBlockedAt(wx, wy, checkBit)) return true;
    const r = radius > 0 ? radius : 0;
    if (r <= 0) return false;
    return (
        isBlockedAt(wx + r, wy, checkBit) ||
        isBlockedAt(wx - r, wy, checkBit) ||
        isBlockedAt(wx, wy + r, checkBit) ||
        isBlockedAt(wx, wy - r, checkBit)
    );
}
