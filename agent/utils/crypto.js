const k = [
    0x428A2F98, 0x71374491, 0xB5C0FBCF, 0xE9B5DBA5, 0x3956C25B, 0x59F111F1, 0x923F82A4, 0xAB1C5ED5,
    0xD807AA98, 0x12835B01, 0x243185BE, 0x550C7DC3, 0x72BE5D74, 0x80DEB1FE, 0x9BDC06A7, 0xC19BF174,
    0xE49B69C1, 0xEFBE4786, 0x0FC19DC6, 0x240CA1CC, 0x2DE92C6F, 0x4A7484AA, 0x5CB0A9DC, 0x76F988DA,
    0x983E5152, 0xA831C66D, 0xB00327C8, 0xBF597FC7, 0xC6E00BF3, 0xD5A79147, 0x06CA6351, 0x14292967,
    0x27B70A85, 0x2E1B2138, 0x4D2C6DFC, 0x53380D13, 0x650A7354, 0x766A0ABB, 0x81C2C92E, 0x92722C85,
    0xA2BFE8A1, 0xA81A664B, 0xC24B8B70, 0xC76C51A3, 0xD192E819, 0xD6990624, 0xF40E3585, 0x106AA070,
    0x19A4C116, 0x1E376C08, 0x2748774C, 0x34B0BCB5, 0x391C0CB3, 0x4ED8AA4A, 0x5B9CCA4F, 0x682E6FF3,
    0x748F82EE, 0x78A5636F, 0x84C87814, 0x8CC70208, 0x90BEFFFA, 0xA4506CEB, 0xBEF9A3F7, 0xC67178F2
];

const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0;

const compress = (buf) => {
    const hv = new Int32Array([
        0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB,
        0x5BE0CD19
    ]);
    const v = new Int32Array(8);
    const w = new Int32Array(64);
    for (let off = 0; off < buf.length; off += 64) {
        for (let i = 0; i < 16; i++) {
            const j = off + (i << 2);
            w[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
        }
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15];
            const b = w[i - 2];
            const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
            const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        v.set(hv);
        for (let i = 0; i < 64; i++) {
            const s1 = rotr(v[4], 6) ^ rotr(v[4], 11) ^ rotr(v[4], 25);
            const ch = (v[4] & v[5]) ^ (~v[4] & v[6]);
            const t1 = v[7] + s1 + ch + k[i] + w[i];
            const s0 = rotr(v[0], 2) ^ rotr(v[0], 13) ^ rotr(v[0], 22);
            const maj = (v[0] & v[1]) ^ (v[0] & v[2]) ^ (v[1] & v[2]);
            const t2 = s0 + maj;
            v[7] = v[6];
            v[6] = v[5];
            v[5] = v[4];
            v[4] = v[3] + t1;
            v[3] = v[2];
            v[2] = v[1];
            v[1] = v[0];
            v[0] = t1 + t2;
        }
        for (let i = 0; i < 8; i++) hv[i] += v[i];
    }
    const out = new Uint8Array(32);
    for (let i = 0; i < 8; i++) {
        out[i * 4] = (hv[i] >>> 24) & 0xFF;
        out[i * 4 + 1] = (hv[i] >>> 16) & 0xFF;
        out[i * 4 + 2] = (hv[i] >>> 8) & 0xFF;
        out[i * 4 + 3] = hv[i] & 0xFF;
    }
    return out;
};

export const sha256 = (bytes) => {
    const len = bytes.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(bytes);
    buf[len] = 0x80;
    const bits = len * 8;
    const hi = Math.floor(bits / 4294967296);
    buf[total - 8] = (hi >>> 24) & 0xFF;
    buf[total - 7] = (hi >>> 16) & 0xFF;
    buf[total - 6] = (hi >>> 8) & 0xFF;
    buf[total - 5] = hi & 0xFF;
    buf[total - 4] = (bits >>> 24) & 0xFF;
    buf[total - 3] = (bits >>> 16) & 0xFF;
    buf[total - 2] = (bits >>> 8) & 0xFF;
    buf[total - 1] = bits & 0xFF;
    return compress(buf);
};

export const inputToken = (key16, innerMask, outerMask, data16, mapped) => {
    const a = new Uint8Array(128);
    for (let i = 0; i < 16; i++) a[i] = key16[i] ^ innerMask[i];
    a.fill(0x36, 16, 64);
    for (let i = 0; i < 12; i++) a[64 + i] = data16[4 + i];
    for (let i = 0; i < 4; i++) a[76 + i] = data16[i];
    a[80] = mapped & 0xFF;
    a[81] = (mapped >>> 8) & 0xFF;
    a[82] = (mapped >>> 16) & 0xFF;
    a[83] = (mapped >>> 24) & 0xFF;
    a[84] = 0x80;
    a[126] = 0x02;
    a[127] = 0xA0;
    const inner = compress(a);
    const b = new Uint8Array(128);
    for (let i = 0; i < 16; i++) b[i] = key16[i] ^ outerMask[i];
    b.fill(0x5C, 16, 64);
    b.set(inner, 64);
    b[96] = 0x80;
    b[126] = 0x03;
    b[127] = 0x00;
    const digest = compress(b);
    const value = (digest[0] | ((digest[1] & 0x7F) << 8)) >>> 0;
    return value < 2 ? 1 : value;
};
