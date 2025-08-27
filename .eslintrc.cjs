module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'prettier', 'import'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  rules: {
    'prettier/prettier': 'error',
    'import/no-unresolved': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
  settings: {
    'import/resolver': {
      typescript: {},
    },
  },
};
