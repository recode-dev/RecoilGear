const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "agent");
const ENTRY = "index.js";

function readModule(rel)
{
    return fs.readFileSync(path.join(SRC, rel), "utf8");
}

function importsOf(rel, source)
{
    const out = [];
    const re = /import\s*\{[\s\S]*?\}\s*from\s*"([^"]+)";/g;
    let m;
    while ((m = re.exec(source)))
    {
        out.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
    }
    return out;
}

function order(entry)
{
    const seen = new Set();
    const list = [];
    (function visit(rel)
    {
        if (seen.has(rel)) return;
        seen.add(rel);
        for (const dep of importsOf(rel, readModule(rel))) visit(dep);
        list.push(rel);
    })(entry);
    return list;
}

function nextVersion()
{
    let max = 0;
    for (const name of fs.readdirSync(ROOT))
    {
        const m = /^recoilgear_(\d+)\.js$/.exec(name);
        if (m) max = Math.max(max, Number(m[1]));
    }
    return max + 1;
}

function build()
{
    const version = nextVersion();
    const parts = ["// RecoilGear v" + version + " — single-file build", "var __mods = {};"];
    for (const rel of order(ENTRY))
    {
        let source = readModule(rel).replace(/\r\n/g, "\n");
        const exported = [];
        source = source.replace(/import\s*\{([\s\S]*?)\}\s*from\s*"([^"]+)";/g, (m, names, spec) =>
        {
            const list = names.split(",").map((x) => x.trim()).filter(Boolean).join(", ");
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
            return "const { " + list + ' } = __mods["' + target + '"];';
        });
        source = source.replace(/export\s+function\s+([A-Za-z0-9_$]+)/g, (m, name) =>
        {
            exported.push(name);
            return "function " + name;
        });
        source = source.replace(/export\s+(var|let|const)\s+([A-Za-z0-9_$]+)/g, (m, kind, name) =>
        {
            exported.push(name);
            return kind + " " + name;
        });
        if (/^\s*(import|export)\s/m.test(source)) throw new Error("module syntax left in " + rel);
        parts.push('__mods["' + rel + '"] = (function(){');
        parts.push(source.trimEnd());
        parts.push("return { " + exported.join(", ") + " };");
        parts.push("})();");
    }
    const outFile = path.join(ROOT, "recoilgear_" + version + ".js");
    fs.writeFileSync(outFile, parts.join("\n") + "\n");
    console.log(path.basename(outFile) + "  (" + order(ENTRY).length + " modules, " + fs.statSync(outFile).size + " bytes)");
}

build();
