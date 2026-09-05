import js from "@eslint/js";

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
];
