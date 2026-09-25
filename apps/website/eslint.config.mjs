import baseConfig from "@classiq/eslint/base";

/** @type {import("eslint").Linter.Config[]} */
export default [
    ...baseConfig,
    {
        ignores: ["src/mock/**"],
    },
];
