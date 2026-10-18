import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import react from "@eslint-react/eslint-plugin";
import jsxA11y from "eslint-plugin-jsx-a11y-x";

export default defineConfig([
  globalIgnores([".next/", "out/", "next-env.d.ts", "public/ffmpeg/"]),
  tseslint.configs.recommended,
  react.configs["recommended-typescript"],
  jsxA11y.configs.recommended,
  { rules: { "jsx-a11y-x/label-has-associated-control": ["error", { depth: 3 }] } },
]);
