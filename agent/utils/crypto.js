const _k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const _hex = "0123456789abcdef";

const SIGNER = "recode-dev";
const SIGN_KEY = "recode-dev";

let _seq = 0;
let _last = null;

function _rotr(x, n) {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function _utf8(str) {
    const out = new Uint8Array(str.length * 4);
    let n = 0;
    for (let i = 0; i < str.length; i++) {
        let c = str.charCodeAt(i);
        if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
            const d = str.charCodeAt(i + 1);
            if (d >= 0xdc00 && d <= 0xdfff) {
                c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
                i++;
            }
        }
        if (c < 0x80) {
            out[n++] = c;
        } else if (c < 0x800) {
            out[n++] = 0xc0 | (c >> 6);
            out[n++] = 0x80 | (c & 63);
        } else if (c < 0x10000) {
            out[n++] = 0xe0 | (c >> 12);
            out[n++] = 0x80 | ((c >> 6) & 63);
            out[n++] = 0x80 | (c & 63);
        } else {
            out[n++] = 0xf0 | (c >> 18);
            out[n++] = 0x80 | ((c >> 12) & 63);
            out[n++] = 0x80 | ((c >> 6) & 63);
            out[n++] = 0x80 | (c & 63);
        }
    }
    return out.subarray(0, n);
}

function _sha256(data) {
    const len = data.length;
    const total = ((len + 9 + 63) >> 6) << 6;
    const buf = new Uint8Array(total);
    buf.set(data);
    buf[len] = 0x80;
    const bits = len * 8;
    const hi = Math.floor(bits / 4294967296);
    buf[total - 8] = (hi >>> 24) & 0xff;
    buf[total - 7] = (hi >>> 16) & 0xff;
    buf[total - 6] = (hi >>> 8) & 0xff;
    buf[total - 5] = hi & 0xff;
    buf[total - 4] = (bits >>> 24) & 0xff;
    buf[total - 3] = (bits >>> 16) & 0xff;
    buf[total - 2] = (bits >>> 8) & 0xff;
    buf[total - 1] = bits & 0xff;

    let h0 = 0x6a09e667;
    let h1 = 0xbb67ae85;
    let h2 = 0x3c6ef372;
    let h3 = 0xa54ff53a;
    let h4 = 0x510e527f;
    let h5 = 0x9b05688c;
    let h6 = 0x1f83d9ab;
    let h7 = 0x5be0cd19;

    const w = new Int32Array(64);
    for (let off = 0; off < total; off += 64) {
        for (let i = 0; i < 16; i++) {
            const j = off + (i << 2);
            w[i] = (buf[j] << 24) | (buf[j + 1] << 16) | (buf[j + 2] << 8) | buf[j + 3];
        }
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15];
            const b = w[i - 2];
            const s0 = _rotr(a, 7) ^ _rotr(a, 18) ^ (a >>> 3);
            const s1 = _rotr(b, 17) ^ _rotr(b, 19) ^ (b >>> 10);
            w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
        }
        let a = h0;
        let b = h1;
        let c = h2;
        let d = h3;
        let e = h4;
        let f = h5;
        let g = h6;
        let h = h7;
        for (let i = 0; i < 64; i++) {
            const s1 = _rotr(e, 6) ^ _rotr(e, 11) ^ _rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const t1 = (h + s1 + ch + _k[i] + w[i]) | 0;
            const s0 = _rotr(a, 2) ^ _rotr(a, 13) ^ _rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const t2 = (s0 + maj) | 0;
            h = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }
        h0 = (h0 + a) | 0;
        h1 = (h1 + b) | 0;
        h2 = (h2 + c) | 0;
        h3 = (h3 + d) | 0;
        h4 = (h4 + e) | 0;
        h5 = (h5 + f) | 0;
        h6 = (h6 + g) | 0;
        h7 = (h7 + h) | 0;
    }

    const out = new Uint8Array(32);
    out[0] = (h0 >>> 24) & 0xff;
    out[1] = (h0 >>> 16) & 0xff;
    out[2] = (h0 >>> 8) & 0xff;
    out[3] = h0 & 0xff;
    out[4] = (h1 >>> 24) & 0xff;
    out[5] = (h1 >>> 16) & 0xff;
    out[6] = (h1 >>> 8) & 0xff;
    out[7] = h1 & 0xff;
    out[8] = (h2 >>> 24) & 0xff;
    out[9] = (h2 >>> 16) & 0xff;
    out[10] = (h2 >>> 8) & 0xff;
    out[11] = h2 & 0xff;
    out[12] = (h3 >>> 24) & 0xff;
    out[13] = (h3 >>> 16) & 0xff;
    out[14] = (h3 >>> 8) & 0xff;
    out[15] = h3 & 0xff;
    out[16] = (h4 >>> 24) & 0xff;
    out[17] = (h4 >>> 16) & 0xff;
    out[18] = (h4 >>> 8) & 0xff;
    out[19] = h4 & 0xff;
    out[20] = (h5 >>> 24) & 0xff;
    out[21] = (h5 >>> 16) & 0xff;
    out[22] = (h5 >>> 8) & 0xff;
    out[23] = h5 & 0xff;
    out[24] = (h6 >>> 24) & 0xff;
    out[25] = (h6 >>> 16) & 0xff;
    out[26] = (h6 >>> 8) & 0xff;
    out[27] = h6 & 0xff;
    out[28] = (h7 >>> 24) & 0xff;
    out[29] = (h7 >>> 16) & 0xff;
    out[30] = (h7 >>> 8) & 0xff;
    out[31] = h7 & 0xff;
    return out;
}

function _hmac(keyBytes, msgBytes) {
    let key = keyBytes;
    if (key.length > 64) key = _sha256(key);
    const ipad = new Uint8Array(64 + msgBytes.length);
    const opad = new Uint8Array(96);
    ipad.set(key);
    opad.set(key);
    for (let i = 0; i < 64; i++) {
        ipad[i] ^= 0x36;
        opad[i] ^= 0x5c;
    }
    ipad.set(msgBytes, 64);
    opad.set(_sha256(ipad), 64);
    return _sha256(opad);
}

function _toHex(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) {
        s += _hex[bytes[i] >> 4] + _hex[bytes[i] & 15];
    }
    return s;
}

export function hmacSha256Hex(key, msg) {
    return _toHex(_hmac(_utf8(key), _utf8(msg)));
}

export function signAgentInput(cmdType, x, y) {
    _seq++;
    const t = cmdType | 0;
    const ix = x | 0;
    const iy = y | 0;
    const msg = SIGNER + "|input|" + t + "|" + ix + "|" + iy + "|" + _seq;
    const sig = hmacSha256Hex(SIGN_KEY, msg);
    _last = { seq: _seq, type: t, x: ix, y: iy, msg: msg, sig: sig, at: Date.now() };
    return sig;
}

export function lastAgentInputSignature() {
    if (!_last) return null;
    return {
        seq: _last.seq,
        type: _last.type,
        x: _last.x,
        y: _last.y,
        msg: _last.msg,
        sig: _last.sig,
        at: _last.at
    };
}
