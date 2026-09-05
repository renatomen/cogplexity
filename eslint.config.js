import js from "@eslint/js";

import { scoped } from "./src/index.js";

export default [
  { ignores: ["test/fixtures/**", "calibration/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        structuredClone: "readonly",
      },
    },
  },
  // KTD13: the package lints itself with its own rule at threshold 15, under espree.
  scoped(["src/**/*.js", "scripts/**/*.mjs", "test/**/*.js"], 15),
];
