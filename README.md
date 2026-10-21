# RecoilGear

Autododge for Nulls Brawl 69.252 on iOS.

## Load

Runs inside the app process through Frida Gadget 17.2.11. The script installs itself on load:
it hooks `LogicBattleModeClient_update`, rescans the battle every tick and steers the character
through `setClientPredictionMoveTo` plus a signed `ClientInput`.

## Features

`autododge` is enabled on start. Other flags stay off.

## Logging

Off by default. When enabled, lines go to `Documents/recoilgear.log` inside the app container,
falling back to `/tmp/recoilgear.log`.

```js
setLoggingEnabled(true);
```

## Layout

```
agent/core       offsets, functions, scanner, commands, scstring
agent/features   autododge
agent/helpers    dodge_kinds, dodge_profiles
agent/utils      flags, logger, crypto, wallCache, brawlerName
```
