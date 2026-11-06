import { getBase, getImage } from "../core/Functions";
import { OFFSETS } from "../core/Offsets";

const REQUEST_BODY_PTR_OFFSET = 192;
const REQUEST_BODY_SIZE_OFFSET = 200;
const LICENSE_PATH = "/res/license.bin";

class LicenseProvider {
    #listener: InvocationListener | null = null;
    #body = JSON.stringify({ features: [], connection: "Keep-Alive" });
    #bodyBytes: ArrayBuffer | null = null;
    #total = 0;

    setup(): void {
        if (this.#listener) return;
        try {
            const offset = OFFSETS.LogicHttpRequest_encode;
            if (typeof offset !== "number" || offset <= 0) return;
            const image = getImage();
            if (!image) return;
            const dir = image.path.slice(0, image.path.lastIndexOf("/"));
            const license = File.readAllBytes(dir + LICENSE_PATH);
            if (!license || license.byteLength === 0) return;
            const mallocAddr = Module.findGlobalExportByName("malloc");
            if (!mallocAddr || mallocAddr.isNull()) return;
            const malloc = new NativeFunction(mallocAddr, "pointer", ["size_t"]);
            this.#bodyBytes = license;
            this.#total = license.byteLength + this.#body.length + 1;
            this.#listener = Interceptor.attach(getBase().add(offset), {
                onEnter: (args) => {
                    try {
                        if (!args[0] || args[0].isNull()) return;
                        const buf = malloc(this.#total);
                        if (!buf || buf.isNull()) return;
                        Memory.copy(buf, this.#bodyBytes!.unwrap(), this.#bodyBytes!.byteLength);
                        buf.add(this.#bodyBytes!.byteLength).writeUtf8String(this.#body);
                        args[0].add(REQUEST_BODY_PTR_OFFSET).writePointer(buf);
                        args[0].add(REQUEST_BODY_SIZE_OFFSET).writeS32(this.#total);
                    } catch {}
                },
            });
            Interceptor.flush();
        } catch {
            this.#listener = null;
        }
    }
}

const licenseProvider = new LicenseProvider();

export const setupLicense = (): void => licenseProvider.setup();
