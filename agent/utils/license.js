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

const REQUEST_BODY_PTR = 192;
const REQUEST_BODY_SIZE = 200;
const LICENSE_BODY = "{\"features\":[],\"connection\":\"Keep-Alive\"}";

var payload = null;
var payloadSize = 0;
var listener = null;

function _validPtr(value)
{
    return value && !value.isNull();
}

function buildPayload(base)
{
    try
    {
        const mod = Process.findModuleByAddress(base);
        if (!mod) return false;
        const dir = mod.path.substring(0, mod.path.lastIndexOf("/"));
        const raw = File.readAllBytes(dir + "/res/license.bin");
        payloadSize = raw.byteLength + LICENSE_BODY.length + 1;
        payload = Memory.alloc(payloadSize);
        Memory.copy(payload, raw.unwrap(), raw.byteLength);
        payload.add(raw.byteLength).writeUtf8String(LICENSE_BODY);
        return true;
    }
    catch (_)
    {
        return false;
    }
}

export function setupLicense()
{
    if (listener) return true;

    let base = null;
    try
    {
        base = getBase();
    }
    catch (_)
    {
        return false;
    }

    if (!base) return false;
    if (!buildPayload(base)) return false;

    try
    {
        listener = Interceptor.attach(base.add(offsets.Hook_requestBody),
        {
            onEnter(args)
            {
                const request = args[0];
                if (!_validPtr(request)) return;
                request.add(REQUEST_BODY_PTR).writePointer(payload);
                request.add(REQUEST_BODY_SIZE).writeS32(payloadSize);
            }
        });
    }
    catch (_)
    {
        listener = null;
    }

    try
    {
        Interceptor.flush();
    }
    catch (_)
    {}

    return !!listener;
}

export function resetLicense()
{
    if (!listener) return;
    try
    {
        listener.detach();
    }
    catch (_)
    {}
    listener = null;
}
