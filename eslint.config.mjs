// Lint do frontend (ESM no navegador, sem bundler). Rodar: npm run lint
import js from '@eslint/js';
import globals from 'globals';

export default [
    { ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**', 'js/state.js', 'js/types.js', 'js/utils.js', 'js/toast.js', 'js/dialogo.js', 'supabase-config.js', 'supabase-config.example.js'] },
    js.configs.recommended,
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2023,
            sourceType: 'module',
            globals: { ...globals.browser, THREE: 'readonly', Chart: 'readonly', XLSX: 'readonly' },
        },
        rules: {
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-empty': ['error', { allowEmptyCatch: true }],
        },
    },
    {
        files: ['scripts/**/*.js'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'commonjs', globals: { ...globals.node } },
    },
    {
        files: ['tests/**/*.{js,mjs}', 'eslint.config.mjs', 'playwright.config.mjs'],
        languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
        rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
    },
];
