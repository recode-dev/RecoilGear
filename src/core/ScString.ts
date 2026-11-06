const DEFAULT_MAX_LENGTH = 256;

export const readScString = (
    value: NativePointer | null,
    maxLength: number = DEFAULT_MAX_LENGTH
): string | null => {
    try {
        if (!value || value.isNull()) return null;
        const text = value.readCString(maxLength);
        if (!text) return null;
        if (text.length > maxLength) return null;
        return text;
    } catch {
        return null;
    }
};
