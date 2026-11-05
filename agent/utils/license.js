import { getBase, getImage } from "../core/functions.js";
import { offsets } from "../core/offsets.js";

const requestBodyPtrOffset = 192;
const requestBodySizeOffset = 200;
const licensePath = "/res/license.bin";

class LicenseProvider {
    #listener = null;
    #body = JSON.stringify({ features: [], connection: "Keep-Alive" });
    #bodyBytes = null;
    #total = 0;

    setup() {
        if (this.#listener) return;
        try {
            const off = offsets.LogicHttpRequest_encode;
            if (typeof off !== "number" || off <= 0) return;
            const image = getImage();
            if (!image) return;
            const dir = image.path.slice(0, image.path.lastIndexOf("/"));
            const license = File.readAllBytes(dir + licensePath);
            if (!license || license.byteLength === 0) return;
            const mallocAddr = Module.findGlobalExportByName("malloc");
            if (!mallocAddr || mallocAddr.isNull()) return;
            const malloc = new NativeFunction(mallocAddr, "pointer", ["size_t"]);
            this.#bodyBytes = license;
            this.#total = license.byteLength + this.#body.length + 1;
            this.#listener = Interceptor.attach(getBase().add(off), {
                onEnter: (args) => {
                    try {
                        if (!args[0] || args[0].isNull()) return;
                        const buf = malloc(this.#total);
                        if (!buf || buf.isNull()) return;
                        Memory.copy(buf, this.#bodyBytes.unwrap(), this.#bodyBytes.byteLength);
                        buf.add(this.#bodyBytes.byteLength).writeUtf8String(this.#body);
                        args[0].add(requestBodyPtrOffset).writePointer(buf);
                        args[0].add(requestBodySizeOffset).writeS32(this.#total);
                    } catch {}
                }
            });
            Interceptor.flush();
        } catch {
            this.#listener = null;
        }
    }
}

const licenseProvider = new LicenseProvider();

export const setupLicense = () => licenseProvider.setup();
