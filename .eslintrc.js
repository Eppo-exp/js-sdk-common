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
    '@typescript-eslint/no-explicit-any': 'off',
    'import/named': 'off',
    'import/no-unresolved': 'off',
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
    'no-restricted-globals': [
      'error',
      {
        name: '__dirname',
        message: 'Not available in JavaScript',
      },
      {
        name: '__filename',
        message: 'Not available in JavaScript',
      },
      {
        name: 'atob',
        message:
          "'atob' unavailable in React Native's Hermes JS engine. Use 'decodeBase64' helper in src/obfuscation.ts instead",
      },
      {
        name: 'btoa',
        message:
          "'btoa' unavailable in React Native's Hermes JS engine. Use 'encodeBase64' helper in src/obfuscation.ts instead",
      },
      {
        name: 'URL',
        message: "URL is improperly implemented in React Native's Hermes JS engine.",
      },
      {
        name: 'Buffer',
        message:
          "'Buffer' unavailable in JavaScript. Use 'Uint8Array' instead. For Base64, use helpers in src/obfuscation.ts",
      },
      {
        name: 'clearImmediate',
        message: "'clearImmediate' unavailable in JavaScript.",
      },
      {
        name: 'process',
        message:
          "'process' unavailable in JavaScript. If this is already defined in webpack.config.js, you can safely disable the error for this line.",
      },
      {
        name: 'setImmediate',
        message: "'setImmediate' unavailable in JavaScript. Use 'setTimeout(fn, 0)' instead",
      },
    ],
    'prettier/prettier': ['warn'],
    'unused-imports/no-unused-imports': 'error',
  },
  overrides: [
    {
      files: ['*.spec.ts'],
      rules: {
        'no-restricted-globals': 'off',
      },
    },
  ],
};
