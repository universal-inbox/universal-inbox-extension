import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default [
  js.configs.recommended,
  prettier,
  {
    files: ['src/**/*.{js,ts}'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2021,
      sourceType: 'module',
      globals: {
        chrome: 'readonly',
        browser: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLDivElement: 'readonly',
        Event: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin
    },
    rules: {
      'prettier/prettier': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',
      'no-undef': 'error',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
];