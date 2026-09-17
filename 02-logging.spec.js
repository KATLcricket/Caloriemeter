const { test } = require('@playwright/test');
const { openApp, tab, db, foods, logFood, expect } = require('./harness');

const today = (page) => page.evaluate(() => todayKey());
const expected = (food, qty) => ({ k: food.k * qty, p: food.p * qty, c: food.c * qty, f: food.f * qty });
const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(0.01);

test('logging a food by grams stores exactly the database values × quantity', async ({ context }) => {
  const { page } = await openApp(context);
  const tofu = (await foods(page)).find(f => f.n === '365 Organic Tofu');
  await logFood(page, { meal: 'Breakfast', name: '365 Organic Tofu', qty: 150 });
  const e = (await db(page)).days[await today(page)][0];
  const x = expected(tofu, 150);
  expect(e.meal).toBe('Breakfast');
  close(e.k, x.k); close(e.p, x.p); close(e.c, x.c); close(e.f, x.f);
});

test('decimal and piece quantities calculate correctly', async ({ context }) => {
  const { page } = await openApp(context);
  const piece = (await foods(page)).find(f => f.u === 'piece');
  await logFood(page, { meal: 'Snack', name: piece.n, qty: 1.5 });
  const e = (await db(page)).days[await today(page)][0];
  close(e.k, piece.k * 1.5);
});

test('calories remaining and meal subtotal on screen match the log', async ({ context }) => {
  const { page } = await openApp(context);
  const F = await foods(page);
  await logFood(page, { meal: 'Lunch', name: '365 Organic Tofu', qty: 200 });
  await logFood(page, { meal: 'Lunch', name: F.find(f => f.u === 'piece').n, qty: 2 });
  const d = await db(page), list = d.days[await today(page)];
  const total = list.reduce((a, e) => a + e.k, 0);
  await expect(page.locator('#left')).toHaveText(String(Math.abs(Math.round(d.settings.k - total))));
  await expect(page.locator('section.band', { hasText: 'Lunch' }).locator('.band-kcal')).toHaveText(Math.round(total) + ' kcal');
});

test('editing an entry updates its quantity and macros', async ({ context }) => {
  const { page } = await openApp(context);
  const tofu = (await foods(page)).find(f => f.n === '365 Organic Tofu');
  await logFood(page, { meal: 'Dinner', name: '365 Organic Tofu', qty: 100 });
  await page.locator('button.item[data-edit="0"]').click();
  await page.locator('#qv').fill('250');
  await page.locator('#confirm').click();
  const e = (await db(page)).days[await today(page)][0];
  expect(e.qty).toBe(250); close(e.k, tofu.k * 250);
});

test('removing an entry deletes it', async ({ context }) => {
  const { page } = await openApp(context);
  await logFood(page, { meal: 'Dinner', name: '365 Organic Tofu', qty: 100 });
  await page.locator('button.item[data-edit="0"]').click();
  await page.locator('#remove').click();
  expect((await db(page)).days[await today(page)]).toEqual([]);
});

test('zero quantity is rejected', async ({ context }) => {
  const { page } = await openApp(context);
  await logFood(page, { meal: 'Snack', name: '365 Organic Tofu', qty: 0 });
  expect(((await db(page)) || { days: {} }).days[await today(page)] || []).toEqual([]);
  await expect(page.locator('#toast')).toContainText('above zero');
});

test('log survives closing and reopening the app', async ({ context }) => {
  const { page } = await openApp(context);
  await logFood(page, { meal: 'Breakfast', name: '365 Organic Tofu', qty: 120 });
  await page.reload();
  await tab(page, 'today');
  await expect(page.locator('button.item[data-edit="0"]')).toContainText('365 Organic Tofu');
});

test('can log to yesterday, but cannot move into the future', async ({ context }) => {
  const { page } = await openApp(context);
  await tab(page, 'today');
  await expect(page.locator('#next')).toBeDisabled();
  await page.locator('#prev').click();
  await logFood(page, { meal: 'Lunch', name: '365 Organic Tofu', qty: 100 });
  const d = await db(page), t = await today(page);
  const y = await page.evaluate(t => shift(t, -1), t);
  expect(d.days[y].length).toBe(1);
  expect(d.days[t] || []).toEqual([]);
});

test('an entry must stay editable after its custom food is removed', async ({ context }) => {
  const { page } = await openApp(context);
  await tab(page, 'set');
  await page.locator('#cn').fill('QA Sambar');
  await page.locator('#cq').fill('1'); await page.locator('#cu').selectOption({ index: 0 }).catch(() => {});
  await page.locator('#cp').fill('5'); await page.locator('#cc').fill('20'); await page.locator('#cf').fill('4');
  await page.locator('#savec').click();
  await logFood(page, { meal: 'Lunch', name: 'QA Sambar', qty: 1 });
  await tab(page, 'set');
  await page.locator('#customlist [data-delc="0"]').click();
  await tab(page, 'today');
  await page.locator('button.item[data-edit="0"]').click();
  await expect(page.locator('#sheet-qty'), 'tapping the entry does nothing — it can no longer be edited or removed').toHaveClass(/on/, { timeout: 2000 });
});

test('food logged just after midnight goes to the new day', async ({ context }) => {
  const { page } = await openApp(context, { clock: '2026-09-16T23:58:00' });
  await tab(page, 'today');
  await page.clock.fastForward('05:00'); // app left open past midnight
  await logFood(page, { meal: 'Breakfast', name: '365 Organic Tofu', qty: 100 });
  const d = await db(page);
  expect(Object.keys(d.days).filter(k => d.days[k].length), 'entry was filed under the previous day').toEqual(['2026-09-17']);
});

test('an entry from a removed custom food can still be removed', async ({ context }) => {
  const { page } = await openApp(context);
  await tab(page, 'set');
  await page.locator('#cn').fill('QA Sambar'); await page.locator('#cq').fill('1');
  await page.locator('#cp').fill('5'); await page.locator('#cc').fill('20'); await page.locator('#cf').fill('4');
  await page.locator('#savec').click();
  await logFood(page, { meal: 'Lunch', name: 'QA Sambar', qty: 2 });
  await tab(page, 'set');
  await page.locator('#customlist [data-delc="0"]').click();
  await tab(page, 'today');
  await page.locator('button.item[data-edit="0"]').click();
  await expect(page.locator('#pk')).toHaveText(String(Math.round((5 * 4 + 20 * 4 + 4 * 9) * 2)));
  await page.locator('#remove').click();
  expect((await db(page)).days[await today(page)]).toEqual([]);
});

test('viewing a past day is not moved when midnight passes', async ({ context }) => {
  const { page } = await openApp(context, { clock: '2026-09-16T23:58:00' });
  await tab(page, 'today');
  await page.locator('#prev').click(); // looking at 15 Sep
  await page.clock.fastForward('05:00');
  await logFood(page, { meal: 'Dinner', name: '365 Organic Tofu', qty: 100 });
  const d = await db(page);
  expect(Object.keys(d.days).filter(k => d.days[k].length)).toEqual(['2026-09-15']);
});
