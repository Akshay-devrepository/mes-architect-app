// Flat config. The www/ scripts are classic <script> tags sharing one global
// scope (functions in app.js are called from enhance.js, license.js, …), so
// cross-file globals are expected there: no-undef is off and unused-vars only
// checks locals. Everything else is the stock recommended rule set.
const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['www/assets/vendor/**', 'www/assets/translations/**', 'android/**', 'node_modules/**', 'backend/node_modules/**', 'backend/.content-export/**', 'apk-releases/**'] },
  js.configs.recommended,
  {
    files: ['www/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'script',
      globals: { ...globals.browser, Capacitor: 'readonly' }
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': ['error', { vars: 'local', args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['www/sw.js'],
    languageOptions: { globals: { ...globals.serviceworker } }
  },
  {
    files: ['scripts/**/*.js', 'gen-*.js', 'eslint.config.js', 'tests/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] }
  },
  {
    // Callbacks passed to page.evaluate() run in the app's page, not in Node.
    files: ['tests/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-undef': 'off' }
  },
  {
    files: ['backend/**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.worker, ...globals.node } },
    rules: { 'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }] }
  }
];
