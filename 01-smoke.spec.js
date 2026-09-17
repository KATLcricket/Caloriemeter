const { test } = require('@playwright/test');
const { openApp, tab, foods, expect } = require('./harness');

test('app opens with no JavaScript errors', async ({ context }) => {
  const { errors } = await openApp(context);
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const v of ['home', 'today', 'train', 'trends', 'set']) {
  test(`"${v}" tab renders without errors`, async ({ context }) => {
    const { page, errors } = await openApp(context);
    await tab(page, v);
    await expect(page.locator('#v-' + v)).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('needs no network apart from optional Google Fonts (offline-capable)', async ({ context }) => {
  const external = [];
  context.on('request', r => { const h = new URL(r.url()).host; if (!/calorie\.qa\.local|fonts\.g/.test(h)) external.push(r.url()); });
  const { page } = await openApp(context);
  for (const v of ['home', 'today', 'train', 'trends', 'set']) await tab(page, v);
  expect(external).toEqual([]);
});

test('all five meal slots are present', async ({ context }) => {
  const { page } = await openApp(context);
  await tab(page, 'today');
  for (const m of ['Breakfast', 'Lunch', 'Snack', 'Workout', 'Dinner'])
    await expect(page.locator(`button.band-add[data-meal="${m}"]`)).toBeVisible();
});

test('food database has 198 items', async ({ context }) => {
  const { page } = await openApp(context);
  expect((await foods(page)).length).toBe(198);
});
