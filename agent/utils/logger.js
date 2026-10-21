const LEVEL_DEBUG = "debug";
const LEVEL_INFO = "info";
const LEVEL_WARN = "warn";
const LEVEL_ERROR = "error";
const FILE_NAME = "recoilgear.log";

var _enabled = false;
var _file = null;
var _failed = false;
var _repeatCounts = Object.create(null);
var _repeatAt = Object.create(null);

function _objcString(ptrValue)
{
    try
    {
        if (!ptrValue || ptrValue.isNull()) return null;
        if (typeof ObjC !== "undefined") return new ObjC.Object(ptrValue).toString();
    }
    catch (_)
    {}
    try
    {
        const msgSendPtr = Module.findGlobalExportByName("objc_msgSend");
        const selPtr = Module.findGlobalExportByName("sel_registerName");
        if (!msgSendPtr || !selPtr) return null;
        const msgSend = new NativeFunction(msgSendPtr, "pointer", ["pointer", "pointer"]);
        const selReg = new NativeFunction(selPtr, "pointer", ["pointer"]);
        const str = msgSend(ptrValue, selReg(Memory.allocUtf8String("UTF8String")));
        if (!str || str.isNull()) return null;
        return str.readUtf8String();
    }
    catch (_)
    {
        return null;
    }
}

function _logPath()
{
    try
    {
        const fn = Module.findGlobalExportByName("NSHomeDirectory");
        if (fn)
        {
            const home = new NativeFunction(fn, "pointer", [])();
            const path = _objcString(home);
            if (path) return path.replace(/\/+$/, "") + "/Documents/" + FILE_NAME;
        }
    }
    catch (_)
    {}
    return "/tmp/" + FILE_NAME;
}

function _open()
{
    if (_file || _failed) return _file;
    const paths = [];
    const primary = _logPath();
    if (primary) paths.push(primary);
    const fallback = "/tmp/" + FILE_NAME;
    if (paths.indexOf(fallback) < 0) paths.push(fallback);
    for (let i = 0; i < paths.length; i++)
    {
        try
        {
            _file = new File(paths[i], "a");
            return _file;
        }
        catch (_)
        {}
    }
    _failed = true;
    return null;
}

function _stamp()
{
    const d = new Date();
    const p = (n, w) => String(n).padStart(w || 2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " +
        p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + "." + p(d.getMilliseconds(), 3);
}

function _emit(level, message, data)
{
    if (!_enabled) return;
    const f = _open();
    if (!f) return;
    let line = _stamp() + " [" + level + "] " + String(message || "");
    if (data !== void 0)
    {
        try
        {
            line += " " + JSON.stringify(data);
        }
        catch (_)
        {}
    }
    try
    {
        f.write(line + "\n");
        f.flush();
    }
    catch (_)
    {}
}

export function setLoggingEnabled(value)
{
    const next = !!value;
    if (next === _enabled) return;
    _enabled = next;
    if (_enabled)
    {
        _emit(LEVEL_DEBUG, "logging enabled");
    }
    else
    {
        _repeatCounts = Object.create(null);
        _repeatAt = Object.create(null);
    }
}

export function isLoggingEnabled()
{
    return _enabled;
}

export function logInfo(message, data)
{
    _emit(LEVEL_INFO, message, data);
}

export function logWarn(message, data)
{
    _emit(LEVEL_WARN, message, data);
}

export function logError(message, data)
{
    _emit(LEVEL_ERROR, message, data);
}

export function logEvery(interval, message, data)
{
    if (!_enabled) return;
    const key = String(message || "");
    const count = (_repeatCounts[key] || 0) + 1;
    _repeatCounts[key] = count;
    const every = interval | 0 || 1;
    if (count % every !== 0) return;
    const now = Date.now();
    if (now - (_repeatAt[key] || 0) < 100) return;
    _repeatAt[key] = now;
    _emit(LEVEL_DEBUG, message, data);
}

export function resetLogCounters()
{
    _repeatCounts = Object.create(null);
    _repeatAt = Object.create(null);
}
