import
{
    offsets
}
from "../core/offsets.js";

const REQUEST_BODY_PTR = 192;
const REQUEST_BODY_SIZE = 200;
const LICENSE_PATH = "/res/license.bin";

var license = null;
var listener = null;

export function setupLicense()
{
    if (listener) return;

    const off = offsets.Hook_requestBody;
    if (typeof off !== "number" || off <= 0) throw new Error("license: missing offset Hook_requestBody");

    const mod = Process.getModuleByName("Nulls Brawl");
    const dir = mod.path.substring(0, mod.path.lastIndexOf("/"));
    license = File.readAllBytes(dir + LICENSE_PATH);

    const malloc = new NativeFunction(Module.findGlobalExportByName("malloc"), "pointer", ["int"]);

    listener = Interceptor.attach(mod.base.add(off),
    {
        onEnter(args)
        {
            const body = JSON.stringify({ features: [], connection: "Keep-Alive" });
            const total = license.byteLength + body.length + 1;
            const buf = malloc(total);

            Memory.copy(buf, license.unwrap(), license.byteLength);
            buf.add(license.byteLength).writeUtf8String(body);

            args[0].add(REQUEST_BODY_PTR).writePointer(buf);
            args[0].add(REQUEST_BODY_SIZE).writeS32(total);
        }
    });

    Interceptor.flush();
}
