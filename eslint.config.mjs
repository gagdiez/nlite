import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['dist/**', 'old-cli/**', '.pnpm-store/**'] },
  {
    files: ['**/*.{js,cjs,mjs,ts}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['**/*.ts'],
    extends: [tseslint.configs.recommended],
    rules: { '@typescript-eslint/no-explicit-any': 'off' }
  }
);
