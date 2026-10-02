// A deliberately small lint set: only the mistakes the type checker cannot see. No style rules, no formatter.
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["dist-spa", "dist-real", "node_modules", "test-logs", "src/routeTree.gen.ts", "src/**/*.test.ts", "e2e", "scripts", "stress", "docs", "artifacts", "handoff"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser: tseslint.parser, parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname } },
    plugins: { "react-hooks": reactHooks, "@typescript-eslint": tseslint.plugin },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      "@typescript-eslint/no-floating-promises": "error",
      // Async click handlers are normal in React, so only promises passed as plain function arguments are checked.
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
    },
  },
);
