import
{
    getBase
}
from "../core/functions.js";

import
{
    offsets
}
from "../core/offsets.js";

var _base = null;
var _ready = false;
var _listeners = [];
var _license = null;
var _licenseKeep = [];

function _attach(name, handlers)
{
    const off = offsets[name];
    if (typeof off !== "number" || off <= 0) return null;
    try
    {
        const listener = Interceptor.attach(_base.add(off), handlers);
        _listeners.push(listener);
        return listener;
    }
    catch (_)
    {
        return null;
    }
}

function setupLicense()
{
    try
    {
        const path = Process.getModuleByName("Nulls Brawl").path;
        const dir = path.substring(0, path.lastIndexOf("/"));
        _license = File.readAllBytes(dir + "/res/license.bin");
    }
    catch (_)
    {
        return;
    }

    const alloc = new NativeFunction(Module.getGlobalExportByName("malloc"), "pointer", ["int"]);

    _attach("Hook_requestBody",
    {
        onEnter(args)
        {
            try
            {
                const body = JSON.stringify({ features: [], connection: "Keep-Alive" });
                const total = _license.byteLength + body.length + 1;
                const buf = alloc(total);
                Memory.copy(buf, _license.unwrap(), _license.byteLength);
                buf.add(_license.byteLength).writeUtf8String(body);
                _licenseKeep.push(buf);
                const obj = args[0];
                obj.add(192).writePointer(buf);
                obj.add(200).writeS32(total);
            }
            catch (_)
            {}
        }
    });
}

export function setupAnticheat()
{
    if (_ready) return true;

    _base = getBase();
    if (!_base) return false;

    setupLicense();

    try
    {
        Interceptor.flush();
    }
    catch (_)
    {}

    _ready = true;
    return true;
}

export function resetAnticheat()
{
    for (let i = 0; i < _listeners.length; i++)
    {
        try
        {
            _listeners[i].detach();
        }
        catch (_)
        {}
    }
    _listeners.length = 0;
    _ready = false;
}
