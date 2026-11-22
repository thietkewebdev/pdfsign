import globals from "globals";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["js/**/*.js"],
    ignores: ["js/demo-mock.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
