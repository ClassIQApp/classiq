import baseConfig from "@classiq/eslint/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
    ...baseConfig,
    {
        files: ["src/**/*.tsx"],
        rules: {
            "unicorn/filename-case": ["error", { cases: { kebabCase: true, pascalCase: true } }],
            "turbo/no-undeclared-env-vars": ["warn", { allowList: ["^(DEV|PROD|MODE|SSR|BASE_URL)$"] }],
        },
    },
    {
        ignores: ["src/mock/**"],
    },
];
