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

const malloc = new NativeFunction(Module.getGlobalExportByName("malloc"), "pointer", ["int"]);

var license = null;
var listener = null;

function _inject(request)
{
    const total = license.byteLength + LICENSE_BODY.length + 1;
    const body = malloc(total);
    if (body.isNull()) throw new Error("license: malloc(" + total + ") failed");

    Memory.copy(body, license.unwrap(), license.byteLength);
    body.add(license.byteLength).writeUtf8String(LICENSE_BODY);

    request.add(REQUEST_BODY_PTR).writePointer(body);
    request.add(REQUEST_BODY_SIZE).writeS32(total);
}

export function setupLicense()
{
    if (listener) return;

    const off = offsets.Hook_requestBody;
    if (typeof off !== "number" || off <= 0) throw new Error("license: missing offset Hook_requestBody");

    const base = getBase();
    const mod = Process.findModuleByAddress(base);
    if (!mod) throw new Error("license: no module for base " + base);

    const dir = mod.path.substring(0, mod.path.lastIndexOf("/"));
    license = File.readAllBytes(dir + "/res/license.bin");

    listener = Interceptor.attach(base.add(off),
    {
        onEnter(args)
        {
            _inject(args[0]);
        }
    });

    Interceptor.flush();
}
