module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  globals: {
    canvas: 'readonly',
    ChatMessage: 'readonly',
    CONFIG: 'readonly',
    CONST: 'readonly',
    Dialog: 'readonly',
    FormDataExtended: 'readonly',
    Playlist: 'readonly',
    foundry: 'readonly',
    game: 'readonly',
    Handlebars: 'readonly',
    Hooks: 'readonly',
    ui: 'readonly',
    window: 'readonly',
    navigator: 'readonly'
  },
  extends: ['airbnb-base', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  overrides: [
    {
      files: ['**/*.mjs'],
      rules: {
        semi: ['error', 'never'],
        quotes: ['error', 'single', { avoidEscape: true }],
        'comma-dangle': ['error', 'never'],
        indent: 'off',
        'no-underscore-dangle': 'off',
        'class-methods-use-this': 'off',
        'no-new': 'off',
        'new-cap': 'off',
        'no-param-reassign': 'off',
        'no-bitwise': 'off',
        'no-alert': 'off',
        'no-unused-vars': ['error', { argsIgnorePattern: '^_' }]
      }
    }
  ],
  rules: {
    'linebreak-style': 0,
    quotes: ['error', 'single', { avoidEscape: true }],
    'comma-dangle': ['error', 'never'],
    'import/extensions': 'off',
    'import/prefer-default-export': 'off',
    'no-continue': 'off',
    'no-await-in-loop': 'off',
    'no-restricted-syntax': 'off',
    'prefer-destructuring': 'off',
    semi: ['error', 'never'],
    'no-console': ['warn', { allow: ['error'] }],
    'no-plusplus': [2, { allowForLoopAfterthoughts: true }],
    'no-nested-ternary': 0,
    'arrow-body-style': 0,
    'object-shorthand': 0,
    'no-param-reassign': [
      'error',
      {
        props: true,
        ignorePropertyModificationsFor: ['acc', 'e']
      }
    ],
    'no-shadow': ['error', { allow: ['state'] }],
    'import/no-restricted-paths': 'off',
    'keyword-spacing': 'off'
  }
}
