// Calorie Meter — automated QA tester
const { defineConfig, devices } = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  timeout: 45_000,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'qa-report' }]],
  use: { ...devices['iPhone 13'], browserName: 'chromium', acceptDownloads: true, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
});
