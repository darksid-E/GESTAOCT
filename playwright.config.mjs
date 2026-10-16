// Testes de navegador (Playwright) com um Supabase FALSO: nada toca o banco real.
// Rodar: npm run test:e2e   (primeira vez: npx playwright install chromium)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: 'tests/e2e',
    testMatch: '**/*.spec.mjs',
    timeout: 60_000,
    expect: { timeout: 15_000 },
    fullyParallel: true,
    retries: process.env.CI ? 1 : 0,
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', locale: 'pt-BR', timezoneId: 'America/Sao_Paulo' },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } } }],
    webServer: { command: 'node tests/e2e/servidor.mjs', url: 'http://127.0.0.1:4173/index.html', reuseExistingServer: !process.env.CI },
});
