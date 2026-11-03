// Frida-глобалы, замоканные для Node: позволяют гонять чистую логику агента
// (scan/autododge/autoaim/walls) в юнит-тестах без устройства.

const hooks = [];
const nativeRegistry = new Map(); // offset -> function(...args)
const callLog = [];
let nativeCallCount = 0;
const nativeByOff = new Map();

function toAddr(v) {
    if (typeof v === "number") return v >>> 0;
    if (typeof v === "string") return parseInt(v, 16) >>> 0;
    if (v && typeof v.__abs === "number") return v.__abs;
    return 0;
}

function makeView(base, off) {
    const view = {
        __base: base,
        __off: off,
        __abs: (base.__addr + off) >>> 0,
        add(o) {
            return makeView(base, off + o);
        },
        readS32() {
            return base.__get(off) | 0;
        },
        readU32() {
            return base.__get(off) >>> 0;
        },
        readU8() {
            return base.__get(off) & 0xff;
        },
        readU16() {
            return base.__get(off) & 0xffff;
        },
        readU64() {
            return base.__get(off);
        },
        readFloat() {
            const b = new ArrayBuffer(4);
            new DataView(b).setUint32(0, base.__get(off) >>> 0, true);
            return new DataView(b).getFloat32(0, true);
        },
        readPointer() {
            return base.__ptr(off);
        },
        readCString(n) {
            return base.__str(off, n);
        },
        readUtf8String(n) {
            return base.__str(off, n);
        },
        readByteArray(n) {
            return base.__bytes(off, n);
        },
        writeS32(v) {
            base.__set(off, v | 0);
        },
        writeU32(v) {
            base.__set(off, v >>> 0);
        },
        writePointer(v) {
            base.__setptr(off, v);
        },
        writeByteArray(b) {
            base.__setbytes(off, b);
        },
        writeUtf8String(s) {
            base.__setstr(off, s);
        },
        isNull() {
            return ((base.__addr + off) >>> 0) === 0;
        },
        equals(o) {
            return toAddr(o) === ((base.__addr + off) >>> 0);
        },
        toString() {
            return "0x" + ((base.__addr + off) >>> 0).toString(16);
        },
        toInt32() {
            return base.__get(off) | 0;
        },
        toUInt32() {
            return base.__get(off) >>> 0;
        },
        unwrap() {
            return view;
        }
    };
    return view;
}

let nextAddr = 0x10000;
const byAddr = new Map();
function makeMem(fields, children, addr, byteArrays, strings) {
    if (addr !== undefined && byAddr.has(addr >>> 0)) return byAddr.get(addr >>> 0);
    const mem = {
        __addr: addr === undefined ? (nextAddr += 0x100) : addr >>> 0,
        __fields: fields || {},
        __children: children || {},
        __strings: strings || {},
        __byteArrays: byteArrays || {},
        __get(off) {
            const v = mem.__fields[off];
            return v === undefined ? 0 : v;
        },
        __set(off, v) {
            mem.__fields[off] = v;
        },
        __ptr(off) {
            const c = mem.__children[off];
            if (c !== undefined) return c;
            if (mem.__fields[off] !== undefined) {
                // Сырое значение-«адрес»: оборачиваем в mem-заглушку.
                return makeMem({}, {}, mem.__fields[off] >>> 0);
            }
            return makeMem({}, {}, 0);
        },
        __setptr(off, v) {
            mem.__children[off] = v;
        },
        __str(off, n) {
            const s = mem.__strings[off];
            if (s === undefined) return null;
            return n && s.length > n ? s.slice(0, n) : s;
        },
        __setstr(off, s) {
            mem.__strings[off] = s;
        },
        __bytes(off, n) {
            const b = mem.__byteArrays[off];
            if (b === undefined) return null;
            return b;
        },
        __setbytes(off, b) {
            mem.__byteArrays[off] = b;
        }
    };
    if (addr !== undefined) byAddr.set(addr >>> 0, makeView(mem, 0));
    return makeView(mem, 0);
}

function globalPtr(v) {
    if (typeof v === "object" && v && typeof v.add === "function") return v;
    return makeMem({}, {}, toAddr(v));
}

function NativeFunctionMock(addrView, ret, args) {
    const off = addrView.__off;
    // Заглушка ищется в момент ВЫЗОВА: тесты могут переопределять поведение на лету.
    return function dynamicNative() {
        nativeCallCount++;
        nativeByOff.set(off, (nativeByOff.get(off) || 0) + 1);
        const stub = nativeRegistry.get(off);
        if (stub) return stub.apply(null, arguments);
        callLog.push({ off, args: Array.prototype.slice.call(arguments) });
        return ret === "pointer" ? makeMem({}, {}, 0) : 0;
    };
}

global.ptr = globalPtr;
global.NativeFunction = NativeFunctionMock;
global.Interceptor = {
    attach(addrView, handlers) {
        hooks.push({ off: addrView.__off, handlers });
    },
    flush() {}
};
global.Memory = {
    alloc(size) {
        return makeMem({}, {});
    },
    copy() {}
};
global.Process = {
    pointerSize: 8,
    getModuleByName() {
        throw new Error("not found");
    },
    enumerateModules() {
        return [];
    }
};
global.Module = {
    findGlobalExportByName() {
        return makeMem({}, {});
    }
};
global.File = {
    readAllBytes() {
        return { byteLength: 16, unwrap: () => makeMem({}, {}) };
    }
};

export const mocks = {
    hooks,
    nativeRegistry,
    callLog,
    get nativeCallCount() {
        return nativeCallCount;
    },
    get nativeByOff() {
        return nativeByOff;
    },
    makeMem,
    makeView,
    toAddr,
    byAddr,
    reset() {
        hooks.length = 0;
        nativeRegistry.clear();
        callLog.length = 0;
    }
};

export { makeMem, makeView, toAddr, byAddr };
