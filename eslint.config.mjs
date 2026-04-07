import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: 'module',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': ['error', { destructuring: 'any' }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['webpack.*.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
  },
];
