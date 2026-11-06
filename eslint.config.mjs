import js from "@eslint/js";
import tseslint from "typescript-eslint";

const noComments = {
    meta: {
        messages: {
            comment: "Comments are banned: code must explain itself.",
            suppression: "Lint suppressions are banned: fix the code, not the linter.",
        },
        schema: [],
    },
    create(context) {
        const suppression =
            /^\s*(?:eslint-(?:disable|enable)|jshint|istanbul|c8|v8-|ts-(?:ignore|expect-error|nocheck))/;
        return {
            "Program:exit"() {
                for (const comment of context.sourceCode.getAllComments()) {
                    context.report({
                        node: comment,
                        messageId: suppression.test(comment.value) ? "suppression" : "comment",
                    });
                }
            },
        };
    },
};

export default tseslint.config(
    { ignores: ["build/**", "dist/**", "node_modules/**", "eslint.config.mjs"] },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            guard: { meta: { name: "guard" }, rules: { "no-comments": noComments } },
        },
        rules: {
            "guard/no-comments": "error",

            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/no-unnecessary-condition": "error",
            "@typescript-eslint/no-unnecessary-type-assertion": "error",
            "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
            "@typescript-eslint/no-non-null-assertion": "error",
            "@typescript-eslint/no-floating-promises": "error",
            "@typescript-eslint/no-misused-promises": "error",
            "@typescript-eslint/require-await": "error",
            "@typescript-eslint/no-require-imports": "error",
            "@typescript-eslint/consistent-type-imports": [
                "error",
                { fixStyle: "inline-type-imports" },
            ],
            "@typescript-eslint/explicit-function-return-type": [
                "error",
                { allowExpressions: true },
            ],
            "@typescript-eslint/default-param-last": "error",
            "@typescript-eslint/prefer-nullish-coalescing": "error",

            "@typescript-eslint/no-unsafe-argument": "off",
            "@typescript-eslint/no-unsafe-assignment": "off",
            "@typescript-eslint/no-unsafe-call": "off",
            "@typescript-eslint/no-unsafe-member-access": "off",
            "@typescript-eslint/no-unsafe-return": "off",

            "no-console": "error",
            eqeqeq: ["error", "smart"],
            "no-var": "error",
            "prefer-const": "error",
            "object-shorthand": ["error", "always"],
            "prefer-template": "error",
            "no-useless-concat": "error",
            "no-useless-rename": "error",
            "no-useless-return": "error",
            "no-nested-ternary": "error",
            "no-shadow": "error",
            "prefer-arrow-callback": "error",
            camelcase: ["error", { properties: "never" }],
            "id-denylist": ["error", "tmp", "temp", "foo", "bar", "baz"],
            "no-empty": ["error", { allowEmptyCatch: true }],
            "max-lines-per-function": [
                "error",
                { max: 80, skipBlankLines: true, skipComments: true },
            ],
        },
    },
);
