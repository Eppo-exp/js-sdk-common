module.exports = {
  root: true,
  env: {
    es6: true,
    jest: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
    'plugin:promise/recommended',
    'plugin:import/recommended',
  ],
  plugins: ['@typescript-eslint', 'prettier', 'import', 'promise', 'unused-imports'],
  rules: {
    'prettier/prettier': [
      'warn',
      {
        singleQuote: true,
        trailingComma: 'all',
        printWidth: 100,
      },
    ],
    'import/named': 'off',
    'import/no-unresolved': 'off',
    'unused-imports/no-unused-imports': 'error',
    '@typescript-eslint/no-explicit-any': 'off',
    'import/order': [
      'warn',
      {
        pathGroups: [
          {
            pattern: 'src/**',
            group: 'parent',
            position: 'before',
          },
        ],
        groups: ['builtin', 'external', 'parent', 'sibling', 'index'],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc' /* sort in ascending order. Options: ['ignore', 'asc', 'desc'] */,
          caseInsensitive: true /* ignore case. Options: [true, false] */,
        },
      },
    ],
  },
};
