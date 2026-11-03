import
{
    getFunctions
}
from "./functions.js";

const scratch = Memory.alloc(8);

export function gameDistance(x1, y1, x2, y2)
{
    return getFunctions().LogicGameplayUtil_getDistanceBetween(x1 | 0, y1 | 0, x2 | 0, y2 | 0) | 0;
}

export function gameLength(dx, dy)
{
    scratch.writeS32(dx | 0);
    scratch.add(4).writeS32(dy | 0);
    return getFunctions().LogicVector2_getLength(scratch) | 0;
}

const FINE = 16;

// Engine vector math is integer-only; scale float inputs to keep sub-unit precision.
export function gameLengthFine(dx, dy)
{
    return gameLength(Math.round(dx * FINE), Math.round(dy * FINE)) / FINE;
}

export function gameNormalize(vector, scale)
{
    scratch.writeS32(vector.x | 0);
    scratch.add(4).writeS32(vector.y | 0);
    getFunctions().LogicVector2_normalize(scratch, scale | 0);
    vector.x = scratch.readS32();
    vector.y = scratch.add(4).readS32();
    return vector;
}

export function gameRotateX(x, y, angle)
{
    return getFunctions().LogicMath_getRotateDx(x | 0, y | 0, angle | 0) | 0;
}

export function gameRotateY(x, y, angle)
{
    return getFunctions().LogicMath_getRotateDy(x | 0, y | 0, angle | 0) | 0;
}
