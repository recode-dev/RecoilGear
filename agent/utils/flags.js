var FEATURE_NAMES = [
    "aimbot",
    "autododge",
    "esp",
    "spinner",
    "killaura",
    "camera",
    "spray",
    "pin",
    "brawltv",
    "spec",
    "chatspam",
    "fps",
    "fpsunlock",
    "gradient",
    "holdshoot",
    "speedhack"
];

export var state = {};
FEATURE_NAMES.forEach((name) =>
{
    state[name] = false;
});

export function setState(feature, value)
{
    if (!(feature in state)) return;
    state[feature] = !!value;
}

setState("autododge", true);
setState("aimbot", true);
