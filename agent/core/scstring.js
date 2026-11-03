import { offsets } from "./offsets.js";

const DEFAULT_MAX_LENGTH = 256;

// v69 (Ghidra, дамп "v69 arm64 iOS"): LogicData_getName возвращает готовый char*
// (разыменование таблицы строк внутри функции), а не объект строки.
// Читаем NUL-терминированную UTF-8 строку с ограничением длины.
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
