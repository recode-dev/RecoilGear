import
{
    getBase,
    getFunctions
}
from "../core/functions.js";

import
{
    offsets
}
from "../core/offsets.js";

const calls = Object.freeze({
    setUrl: 0xd3f5dc,
    stringInit: 0xd3f6bc,
    stateContains: 0xac3850,
    objectNotify: 0x56d350,
    objectSetRate: 0x581744,
    widgetSetLayout: 0xb854b0,
    widgetAddChild: 0xb9d680,
    widgetFindChild: 0xb89e1c,
    uiLoadScene: 0xb45c38,
    uiAttachWidget: 0x5434f8,
    uiLock: 0x85cf48,
});

const TUNE = {
    URL: true,
    SHOP_OWNED: true,
    LICENSE: true,
    SERVER_HEALTH: false,
    SHOP_SCALE: false,
    INDICES: false,
    CHAT: true,
    CHAT_BUILD: false,
    CHAT_POS: false,
    CHAT_GUARDS: true,
    UI_LAYER_ARG: false,
    FORCED_RETURNS: true,
};

const spHooks = Object.freeze([
    "Hook_spPatch01",
    "Hook_spPatch02",
    "Hook_spPatch03",
    "Hook_spPatch04",
    "Hook_spPatch05",
    "Hook_spPatch06",
    "Hook_spPatch07",
    "Hook_spPatch08",
    "Hook_spPatch09",
    "Hook_spPatch10",
    "Hook_spPatch11",
    "Hook_spPatch12",
    "Hook_spPatch13",
    "Hook_spPatch14",
    "Hook_spPatch15",
]);

const spValues = Object.freeze([15, 11, 4, 37]);

const serverFix = Object.freeze({
    14079131: 1890893003,
});

const Y_MIN = 70;
const R_IDX = 72;
const N_STATE = 73;

var _base = null;
var _ops = null;
var _listeners = [];
var _license = null;
var _licenseKeep = [];
var _chatOn = false;

function _nf(off, ret, args)
{
    if (typeof off !== "number" || off <= 0) return null;
    try
    {
        return new NativeFunction(_base.add(off), ret, args);
    }
    catch (_)
    {
        return null;
    }
}

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

function initOps()
{
    const fns = getFunctions();
    _ops = {
        battleModeGetInstance: fns.BattleMode_getInstance,
        setUrl: _nf(calls.setUrl, "void", ["pointer", "pointer", "int"]),
        stringInit: _nf(calls.stringInit, "void", ["pointer", "pointer"]),
        widgetSetPosition: _nf(offsets.Hook_widgetSetPosition, "void", ["pointer", "float", "float"]),
        stateContains: _nf(calls.stateContains, "bool", ["pointer", "int"]),
        objectNotify: _nf(calls.objectNotify, "void", ["pointer"]),
        objectSetRate: _nf(calls.objectSetRate, "void", ["pointer", "float"]),
        widgetSetLayout: _nf(calls.widgetSetLayout, "void", ["pointer", "float", "float"]),
        widgetAddChild: _nf(calls.widgetAddChild, "void", ["pointer", "pointer"]),
        widgetFindChild: _nf(calls.widgetFindChild, "pointer", ["pointer", "pointer"]),
        uiLoadScene: _nf(calls.uiLoadScene, "pointer", ["pointer", "pointer"]),
        uiAttachWidget: _nf(calls.uiAttachWidget, "pointer", ["pointer", "pointer", "pointer"]),
        uiLock: _nf(calls.uiLock, "void", []),
    };
    Object.freeze(_ops);
}

function setupUrl()
{
    const modsUrl = Memory.allocUtf8String("https://ext.nulls.gg/mods/?ios=1");

    if (TUNE.URL)
    {
        _attach("Hook_openUrl",
        {
            onEnter(args)
            {
                const obj = args[0];
                if (obj.isNull()) return;
                const str = obj.add(4).readU32() >= 8 ? obj.add(8).readPointer() : obj.add(8);
                if (str.isNull()) return;
                const value = str.readCString();
                if (!value || value.indexOf("nullsbrawlmods://") !== 0) return;
                if (_ops.setUrl) _ops.setUrl(obj, modsUrl, 128);
            }
        });
    }

    if (TUNE.SHOP_OWNED)
    {
        _attach("Hook_shopOwnedCheck",
        {
            onEnter(args)
            {
                const flag = args[4];
                const owner = args[1];
                if (owner.isNull() || flag.isNull()) return;
                if (flag.readU8() === 0) return;
                const list = owner.add(136).readPointer().add(16);
                const items = list.readPointer();
                const count = list.add(12).readU32();
                for (let i = 0; i < count; i++)
                {
                    if (items.add(4 * i).readU32() === R_IDX) args[6] = ptr(1);
                }
            }
        });
    }
}

function setupLicense()
{
    if (!TUNE.LICENSE) return;

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

function setupServerHealth()
{
    if (!TUNE.SERVER_HEALTH) return;

    _attach("Hook_serverHealth",
    {
        onEnter()
        {
            const obj = this.context.x0;
            const holder = this.context.x19;
            if (obj.isNull() || holder.isNull()) return;
            if (!Process.findRangeByAddress(obj)) return;
            if (!Process.findRangeByAddress(holder)) return;
            const idField = obj.add(1432);
            const down = holder.add(60).readFloat();
            const since = obj.add(1460).readFloat();
            if (!(down > 3 || down === 0) || since <= 5) return;
            const fix = serverFix[String(idField.readU32() & 0xffffff)];
            if (fix) idField.writeU32(fix);
        }
    });
}

function setupShopScale()
{
    if (!TUNE.SHOP_SCALE) return;

    _attach("Hook_shopListScale",
    {
        onEnter(args)
        {
            this.list = args[0];
        },
        onLeave()
        {
            const items = this.list.readPointer();
            const count = this.list.add(12).readU32();
            for (let i = 0; i < count; i++)
            {
                const slot = items.add(4 * i);
                slot.writeS32(slot.readS32() * 10);
            }
        }
    });
}

function setupIndices()
{
    if (!TUNE.INDICES) return;

    for (let i = 0; i < spHooks.length; i++)
    {
        _attach(spHooks[i],
        {
            onEnter()
            {
                const pos = this.context.sp.readS32() - Y_MIN;
                if (pos < 0 || pos >= spValues.length) return;
                this.context.sp.writeS32(spValues[pos]);
            }
        });
    }
}

function setupChat()
{
    const str = function (value)
    {
        const out = Memory.alloc(16);
        if (_ops.stringInit) _ops.stringInit(out, Memory.allocUtf8String(value));
        return out;
    };

    const mark = function (target, value)
    {
        target.add(8).writeU8(value);
    };

    if (TUNE.CHAT_BUILD)
    {
        _attach("Hook_uiBuild",
        {
            onEnter(args)
            {
                this.object = args[0];
            },
            onLeave()
            {
                try
                {
                    const obj = this.object;
                    if (!obj || obj.isNull()) return;
                    if (!_ops.battleModeGetInstance || !_ops.stateContains) return;
                    if (!_ops.uiLoadScene || !_ops.widgetFindChild) return;
                    if (!_ops.uiAttachWidget || !_ops.widgetSetLayout || !_ops.widgetAddChild) return;

                    const mode = _ops.battleModeGetInstance();
                    if (mode.isNull()) return;
                    const state = mode.add(40).readPointer();
                    if (state.isNull()) return;
                    if (!_ops.stateContains(state, N_STATE)) return;
                    if (state.add(320).readU32() !== 0) return;

                    const scene = _ops.uiLoadScene(str("sc/ui.sc"), str("gameroom_party_mode"));
                    if (scene.isNull()) return;

                    const button = _ops.widgetFindChild(scene, str("button_chat"));
                    if (button.isNull()) return;

                    const badge = _ops.widgetFindChild(button, str("notification"));
                    if (!badge.isNull()) mark(badge, 0);
                    mark(button, 1);

                    const widget = _ops.uiAttachWidget(scene, str("button_chat"), str("button_chat"));
                    if (widget.isNull()) return;

                    _ops.widgetSetLayout(widget, obj.add(1640).readFloat() - 40, 40);
                    _ops.widgetAddChild(obj, widget);

                    _chatOn = true;
                }
                catch (_)
                {}
            }
        });
    }

    if (TUNE.CHAT_POS)
    {
        _attach("Hook_widgetSetPosition",
        {
            onEnter(args)
            {
                if (!_chatOn) return;
                try
                {
                    const host = _base.add(0x1123808).readPointer();
                    if (host.isNull()) return;
                    if (!Process.findRangeByAddress(host)) return;
                    if (_ops.objectSetRate) _ops.objectSetRate(host, args[2]);
                    if (_ops.objectNotify) _ops.objectNotify(host);
                }
                catch (_)
                {}
            }
        });
    }

    if (TUNE.CHAT_GUARDS)
    {
        _attach("Hook_guardShort",
        {
            onEnter(args)
            {
                this.nullArg = args[0].isNull();
            }
        });

        _attach("Hook_guardWide",
        {
            onEnter(args)
            {
                this.nullArg = args[0].isNull();
            }
        });
    }

    if (TUNE.UI_LAYER_ARG)
    {
        const buffer = Memory.alloc(512);

        _attach("Hook_uiLayerArg",
        {
            onEnter()
            {
                if (!this.context.x0.isNull()) this.context.x0 = buffer;
            }
        });
    }
}

function setupForcedReturns()
{
    if (!TUNE.FORCED_RETURNS) return;

    _attach("Hook_forcedReturnZero",
    {
        onLeave(retval)
        {
            retval.replace(ptr(0));
        }
    });

    _attach("Hook_forcedReturnOne",
    {
        onLeave(retval)
        {
            retval.replace(ptr(1));
        }
    });
}

export function setupAnticheat()
{
    if (_ops) return true;

    _base = getBase();
    if (!_base) return false;

    initOps();
    setupUrl();
    setupLicense();
    setupServerHealth();
    setupShopScale();
    setupIndices();

    if (TUNE.CHAT)
    {
        setupChat();
    }

    setupForcedReturns();

    Interceptor.flush();
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
    _chatOn = false;
    _ops = null;
}

export function configure(patch)
{
    for (const key in patch)
    {
        if (key in TUNE) TUNE[key] = patch[key];
    }
    return TUNE;
}
