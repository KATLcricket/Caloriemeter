const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const APP_HTML = process.env.APP_HTML || path.join(__dirname, '..', '..', 'index.html');
const ORIGIN = 'https://app.security.local';

// A payload that records (instead of doing harm) whenever injected markup actually runs.
const payload = (tag) => `<img src=x onerror="(window.__pwned=window.__pwned||[]).push('${tag}')">`;

async function openApp(context, { storage } = {}) {
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ contentType: 'text/css', body: '' }));
  await context.route(`${ORIGIN}/**`, r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(APP_HTML, 'utf8') }));
  const page = await context.newPage();
  if (storage) await page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('macrolog-v1', s); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(storage));
  await page.goto(ORIGIN + '/');
  await expect(page.locator('.tab[data-v="today"]')).toBeVisible();
  return page;
}
const tab = (page, v) => page.locator(`.tab[data-v="${v}"]`).click({ timeout: 5000 });
async function openBackup(page) {
  const btn = page.locator('#backupbtn');
  if (await btn.count()) { await btn.click(); await expect(page.locator('#sheet-backup')).toHaveClass(/on/); }
  else await tab(page, 'set');
}
const pwned = (page) => page.evaluate(() => [...new Set(window.__pwned || [])]);

// Visit every screen and the main pop-up sheets so any unescaped value gets rendered.
async function renderEverything(page) {
  await page.evaluate(() => typeof closeSheets === 'function' && closeSheets());
  await page.waitForTimeout(300);
  for (const v of ['home', 'today', 'train', 'trends', 'set']) { await tab(page, v); await page.waitForTimeout(250); }
  await tab(page, 'today');
  await page.locator('button.band-add[data-meal="Lunch"]').click();
  await page.waitForTimeout(350);
  for (const f of ['All', 'Mine']) { await page.locator(`#filters [data-filter="${f}"]`).click(); await page.waitForTimeout(200); }
  const first = page.locator('#results button').first();
  if (await first.count()) { await first.click(); await page.waitForTimeout(500); }
  await page.evaluate(() => typeof closeSheets === 'function' && closeSheets());
  await page.waitForTimeout(300);
  const item = page.locator('button.item[data-edit="0"]');
  if (await item.count()) { await item.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); }
  await page.evaluate(() => typeof closeSheets === 'function' && closeSheets());
  await page.waitForTimeout(300);
}

const todayKey = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

module.exports = { openApp, tab, openBackup, pwned, payload, renderEverything, todayKey, expect };
