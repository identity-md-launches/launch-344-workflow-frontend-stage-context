import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: false, workers: 1, timeout: 45000,
  reporter: [['list'], ['json', { outputFile: '../docs/evidence/interactions.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173/preview/', viewport: { width: 1440, height: 1000 }, browserName: 'chromium' },
  webServer: { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:4173/preview/', reuseExistingServer: false, timeout: 10000 },
});
