import { getBase, getImage } from "../core/functions.js";

import { offsets } from "../core/offsets.js";

const REQUEST_BODY_PTR = 192;
const REQUEST_BODY_SIZE = 200;
const LICENSE_PATH = "/res/license.bin";

var license = null;
var listener = null;

export function setupLicense() {
    if (listener) return;
    try {
        const off = offsets.LogicHttpRequest_clear;
        if (typeof off !== "number" || off <= 0) return;

        const image = getImage();
        if (!image) return;
        const dir = image.path.substring(0, image.path.lastIndexOf("/"));
        license = File.readAllBytes(dir + LICENSE_PATH);

        const malloc = new NativeFunction(Module.findGlobalExportByName("malloc"), "pointer", [
            "int"
        ]);

        listener = Interceptor.attach(getBase().add(off), {
            onEnter(args) {
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
    } catch (_) {
        listener = null;
    }
}
