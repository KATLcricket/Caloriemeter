// Loads the real Calorie Meter index.html in a phone-sized browser, fully offline.
const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const APP_HTML = process.env.CALORIE_HTML || path.join(__dirname, '..', '..', 'index.html');
const ORIGIN = 'https://calorie.qa.local';
const NOISE = /Failed to load resource|fonts\.g/;

async function openApp(context, { seed, clock } = {}) {
  await context.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ contentType: 'text/css', body: '' }));
  await context.route(`${ORIGIN}/**`, r => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(APP_HTML, 'utf8') }));
  const page = await context.newPage();
  if (clock) await page.clock.install({ time: new Date(clock) });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text()); });
  if (seed) await page.addInitScript(s => { if (!localStorage.getItem('macrolog-v1')) localStorage.setItem('macrolog-v1', s); }, JSON.stringify(seed));
  await page.goto(ORIGIN + '/');
  await expect(page.locator('.tab[data-v="today"]')).toBeVisible();
  await page.waitForTimeout(300);
  return { page, errors };
}

const tab = (page, v) => page.locator(`.tab[data-v="${v}"]`).click();
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('macrolog-v1') || 'null'));
const foods = (page) => page.evaluate(() => FOODS);

// Log a food through the real UI: meal "+" → search → tap result (nth match) → qty → Add
async function logFood(page, { meal, name, qty, nth = 0 }) {
  await tab(page, 'today');
  await page.locator(`button.band-add[data-meal="${meal}"]`).click();
  await page.locator('#q').fill(name);
  const exact = page.locator('#results button', { has: page.locator('b', { hasText: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }) });
  await exact.nth(nth).click();
  await expect(page.locator('#sheet-qty')).toHaveClass(/on/);
  await page.locator('#qv').fill(String(qty));
  await page.locator('#confirm').click();
  await page.waitForTimeout(300);
}

module.exports = { openApp, tab, db, foods, logFood, expect };
