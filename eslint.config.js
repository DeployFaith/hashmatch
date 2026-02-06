import tseslint from "typescript-eslint";

export default [
  {
    // Ignore build artifacts and generated output
    ignores: ["dist/**", ".next/**", "out/**", "coverage/**"],
  },
  {
    files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always"],
      "no-console": "warn",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "prefer-const": "error",
    },
  },
];
