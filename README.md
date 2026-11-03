# RecoilGear

Frida agent for **Nulls Brawl v69.252**

## Build

```
npm install frida-compile
npx frida-compile agent/index.js -o dist/agent.js -B iife
```

## Test

Юнит-прогон логики агента (сканер/додж/эйм/стены) на моках Frida, без устройства:

```
echo '{"type":"module"}' > package.json
npm install frida-compile
node test/run_tests.js        # новый код: 22/22
```

## License

**MIT**, see `LICENSE`.
