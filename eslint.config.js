import tseslint from "typescript-eslint";

export default [
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tseslint.parser,
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
