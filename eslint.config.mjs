export default [
    {
        files: ["agent/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ptr: "readonly",
                NULL: "readonly",
                Memory: "readonly",
                NativeFunction: "readonly",
                Module: "readonly",
                Process: "readonly",
                Interceptor: "readonly",
                send: "readonly",
                Java: "readonly",
                JavaImporter: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                globalThis: "readonly",
                console: "readonly",
                File: "readonly",
                rpc: "readonly",
                Script: "readonly"
            }
        },
        rules: {
            "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_" }],
            "no-undef": "error",
            "no-redeclare": "error",
            "no-dupe-keys": "error",
            "no-duplicate-case": "error",
            "no-unreachable": "error",
            "no-constant-condition": ["error", { checkLoops: false }],
            "no-empty": ["error", { allowEmptyCatch: true }],
            "no-fallthrough": "error",
            "eqeqeq": ["error", "smart"],
            "prefer-const": "warn"
        }
    }
];
