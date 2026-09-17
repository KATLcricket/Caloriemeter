const { test } = require('@playwright/test');
const fs = require('fs');
const { openApp, tab, db, logFood, expect } = require('./harness');

async function makeBackup(browser) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const { page } = await openApp(ctx);
  await logFood(page, { meal: 'Breakfast', name: '365 Organic Tofu', qty: 150 });
  await logFood(page, { meal: 'Dinner', name: '365 Organic Tofu', qty: 80 });
  const before = await db(page);
  await tab(page, 'set');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#backup').click()]);
  return { file: await dl.path(), before };
}

test('backup file contains all logged days', async ({ browser }) => {
  const { file, before } = await makeBackup(browser);
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(payload._app).toBe('calorie-meter');
  expect(payload.data.days).toEqual(before.days);
});

test('choosing a backup file shows the "Yes, restore" button', async ({ browser }) => {
  const { file } = await makeBackup(browser);
  const { page } = await openApp(await browser.newContext());
  await tab(page, 'set');
  await page.locator('#restorefile').setInputFiles(file);
  await expect(page.locator('#restoreinfo')).toContainText('Backup from');
  await expect(page.locator('#confirmrestore'), 'button stays hidden (.hide uses !important), so restore is impossible').toBeVisible({ timeout: 2000 });
});

test('restoring a backup on a fresh phone brings every logged day back', async ({ browser }) => {
  const { file, before } = await makeBackup(browser);
  const { page } = await openApp(await browser.newContext());
  await tab(page, 'set');
  await page.locator('#restorefile').setInputFiles(file);
  await expect(page.locator('#restoreinfo')).toContainText('Backup from');
  await page.locator('#confirmrestore').click();
  await expect(page.locator('#toast')).toContainText('Restored');
  expect((await db(page)).days).toEqual(before.days);
});

test('restore rejects a file that is not a Calorie Meter backup', async ({ context }) => {
  const { page } = await openApp(context);
  await tab(page, 'set');
  await page.locator('#restorefile').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await expect(page.locator('#restoreinfo')).toContainText('does not look like');
  await expect(page.locator('#confirmrestore')).toBeHidden();
});

test('CSV export has one correct row per logged item', async ({ context }) => {
  const { page } = await openApp(context);
  await logFood(page, { meal: 'Lunch', name: '365 Organic Tofu', qty: 150 });
  const e = (await db(page)).days[await page.evaluate(() => todayKey())][0];
  await tab(page, 'set');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const lines = fs.readFileSync(await dl.path(), 'utf8').trim().split('\n');
  expect(lines.length).toBe(2);
  const cells = lines[1].split('","').map(s => s.replace(/"/g, ''));
  expect(cells.slice(1)).toEqual(['Lunch', '365 Organic Tofu', '150', 'g', String(Math.round(e.p * 10) / 10), String(Math.round(e.c * 10) / 10), String(Math.round(e.f * 10) / 10), String(Math.round(e.k))]);
});
