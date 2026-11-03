import { offsets } from "./offsets.js";

const DEFAULT_MAX_LENGTH = 256;

export function readScString(value, maxLength = DEFAULT_MAX_LENGTH) {
    try {
        if (!value || value.isNull()) return null;
        const text = value.readCString(maxLength);
        if (!text) return null;
        if (text.length > maxLength) return null;
        return text;
    } catch (_) {
        return null;
    }
}
