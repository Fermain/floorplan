import js from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import svelteConfig from './svelte.config.js'
import ts from 'typescript-eslint'
import { defineConfig } from 'eslint/config'

export default defineConfig(
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  eslintConfigPrettier,
  {
    ignores: ['dist/**', 'build/**', '.svelte-kit/**', 'eslint.config.js', 'svelte.config.js'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    rules: {
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        extraFileExtensions: ['.svelte'],
        parser: ts.parser,
        svelteConfig,
      },
    },
  },
  {
    files: ['**/*.{ts,js}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
)
