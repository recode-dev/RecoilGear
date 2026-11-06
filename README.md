# RecoilGear

Frida agent for **Nulls Brawl** `v69.252`

## Build

```
npm ci
npx frida-compile src/Index.ts -o dist/agent.js -B iife
```

## Typecheck

```
npx tsc --noEmit
```

### License

**MIT**, see `LICENSE`
