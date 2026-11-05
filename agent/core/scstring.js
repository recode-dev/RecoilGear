const defaultMaxLength = 256;

export const readScString = (value, maxLength = defaultMaxLength) => {
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
