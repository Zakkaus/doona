import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'contract/**', 'src/api/types.ts', 'src/fonts.css', 'src/fonts-sc.css', 'node_modules/**', 'test-results/**']
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', {ignoreRestSiblings: true, argsIgnorePattern: '^_'}]
    }
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {globals: globals.browser}
  },
  {
    files: ['tools/*.mjs', '*.config.{ts,js}', 'e2e/**/*.ts'],
    languageOptions: {globals: globals.node}
  },
  {
    ...reactHooks.configs.flat.recommended,
    files: ['src/**/*.{ts,tsx}']
  },
  {
    ...jsxA11y.flatConfigs.recommended,
    files: ['src/**/*.tsx']
  },
  prettier
];
