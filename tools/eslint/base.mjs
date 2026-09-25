import jseslint from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import pluginReact from "eslint-plugin-react";
import pluginReactHooks from "eslint-plugin-react-hooks";
import turboPlugin from "eslint-plugin-turbo";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

/** @type {import("eslint").Linter.ConfigWithExtendsArray} */
export const options = [
    jseslint.configs.recommended,
    tseslint.configs.recommended,
    eslintPluginUnicorn.configs.recommended,
    pluginReact.configs.flat.recommended,
    globalIgnores([".husky", "build/**", "dist/**", "node_modules", ".env*", "pnpm-*", "cdk.out/**"]),
    {
        rules: {
            "unicorn/no-null": "off",
            "unicorn/no-array-reduce": "off",
            "unicorn/no-abusive-eslint-disable": "off",
            "unicorn/no-useless-undefined": "off",
            "unicorn/prevent-abbreviations": "off",
            "unicorn/no-for-loop": "error",

            "@typescript-eslint/no-unused-vars": "warn",
            "@typescript-eslint/no-explicit-any": "error",
            "@typescript-eslint/consistent-type-imports": "error",

            curly: ["error", "all"],
            "padding-line-between-statements": ["error", { blankLine: "always", prev: "*", next: "return" }],
            "no-restricted-syntax": [
                "error",
                {
                    selector: "ForStatement",
                    message: "Prefer declarative array methods (map, filter, reduce) or for-of loops over imperative for loops.",
                },
                {
                    selector: "ForInStatement",
                    message: "Prefer declarative methods or for-of loops over for-in loops.",
                },
                {
                    selector: "TSAsExpression[typeAnnotation.type='TSUnknownKeyword']",
                    message: "Do not use 'as unknown'. Fix the types strictly.",
                },
                {
                    selector: "TSAsExpression > TSAsExpression",
                    message: "Do not use double assertions (e.g. 'as unknown as Type'). Fix the types strictly.",
                },
            ],
        },
    },
    {
        plugins: {
            turbo: turboPlugin,
        },
        rules: {
            "turbo/no-undeclared-env-vars": "warn",
        },
    },
    {
        languageOptions: {
            ...pluginReact.configs.flat.recommended.languageOptions,
            globals: {
                ...globals.browser,
            },
        },
    },
    {
        plugins: {
            "react-hooks": pluginReactHooks,
        },
        settings: { react: { version: "detect" } },
        rules: {
            ...pluginReactHooks.configs.recommended.rules,
            "react/react-in-jsx-scope": "off",
        },
    },
    eslintConfigPrettier,
];

/** @type {import("eslint").Linter.Config} */
export default defineConfig(options);
