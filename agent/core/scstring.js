import
{
    offsets
}
from "./offsets.js";

const INLINE_MAX_LENGTH = 7;
const DEFAULT_MAX_LENGTH = 256;

export function readScString(value, maxLength = DEFAULT_MAX_LENGTH)
{
    try
    {
        if (!value || value.isNull()) return null;
        const length = value.add(offsets.ScString_length).readS32();
        if (length <= 0 || length > maxLength) return null;
        const data = length <= INLINE_MAX_LENGTH ?
            value.add(offsets.ScString_data) :
            value.add(offsets.ScString_data).readPointer();
        if (!data || data.isNull()) return null;
        return data.readUtf8String(length);
    }
    catch (_)
    {
        return null;
    }
}
