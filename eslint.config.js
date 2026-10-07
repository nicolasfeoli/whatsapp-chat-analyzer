// @ts-check
import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Identifiers shorter than this are rejected, so names stay descriptive.
 * The exceptions are the conventional loop indices and chart coordinates.
 */
const MINIMUM_IDENTIFIER_LENGTH = 3;
const SHORT_IDENTIFIER_EXCEPTIONS = ['i', 'j', 'x', 'y'];

/** Globals that only exist in a browser page or worker, and are therefore off limits in `src/core`. */
const BROWSER_ONLY_GLOBALS = [
  'window',
  'document',
  'navigator',
  'self',
  'localStorage',
  'location',
];

export default tseslint.config(
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', 'public/'],
  },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.core.json', './tsconfig.worker.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      curly: ['error', 'all'],
      eqeqeq: ['error', 'always'],
      'id-length': [
        'error',
        {
          min: MINIMUM_IDENTIFIER_LENGTH,
          exceptions: SHORT_IDENTIFIER_EXCEPTIONS,
          properties: 'never',
        },
      ],
      'no-nested-ternary': 'error',
      'no-param-reassign': 'error',
      'no-var': 'error',
      'one-var': ['error', 'never'],
      'prefer-const': 'error',
    },
  },
  {
    /*
     * The core runs in the page, in the Web Worker and in Node, so it may use
     * neither the page nor the worker. `tsconfig.core.json` already compiles it
     * without the DOM library; these rules give the same answer in the editor,
     * with a sentence that says why.
     */
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...BROWSER_ONLY_GLOBALS.map((name) => ({
          name,
          message: 'src/core must run without a browser: no DOM and no browser globals.',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/ui/**', '**/worker/**'],
              message: 'src/core must not depend on the page or on the worker.',
            },
          ],
        },
      ],
    },
  },
  {
    /* Tests describe invented chats inline; long literal arrays and helper closures are expected there. */
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
  eslintConfigPrettier,
);
