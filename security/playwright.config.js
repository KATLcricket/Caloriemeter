const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  reporter: [['list'], ['json', { outputFile: 'results/dynamic.json' }], ['html', { open: 'never', outputFolder: 'results/html' }]],
  use: { ...devices['iPhone 13'], browserName: 'chromium', serviceWorkers: 'block', acceptDownloads: true, screenshot: 'only-on-failure' },
});
