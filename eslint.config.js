import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'test-results', 'playwright-report']),
  // Every block below is scoped to .ts/.tsx, so before this one NO rule applied
  // to any .js or .mjs file in the repo — `eslint --print-config` resolved 0
  // rules for scripts/*.js against 92 for a src file. That left ~400 lines of
  // Playwright-driving Node checked by nothing (F77).
  {
    files: ['**/*.{js,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.app.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    files: ['tests/e2e/**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: './tsconfig.e2e.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
])
