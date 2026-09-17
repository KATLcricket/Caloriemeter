// Your Excel Macro_List is the source of truth. These tests never change values —
// they flag items whose data or behaviour needs a human check against the sheet.
const { test } = require('@playwright/test');
const fs = require('fs');
const { openApp, db, foods, logFood, expect } = require('./harness');

// DATA CHECKs report rows to verify in your Excel sheet. They warn but don't block a deploy,
// because fixing them is a data decision. Set STRICT_DATA=1 to make them fail instead.
function dataWarning(title, rows) {
  if (!rows.length) return;
  if (process.env.STRICT_DATA === '1') expect(rows, title).toEqual([]);
  test.info().annotations.push({ type: 'data warning', description: title + ': ' + rows.join('; ') });
  console.warn('\n⚠️  ' + title + '\n   - ' + rows.join('\n   - '));
  if (process.env.GITHUB_STEP_SUMMARY)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ⚠️ ${title}\n` + rows.map(r => `- ${r}`).join('\n') + '\n\n');
}

test('every item has a name, unit, positive serving size, and non-negative macros', async ({ context }) => {
  const { page } = await openApp(context);
  const bad = (await foods(page)).filter(f => !f.n || !f.u || !(f.q > 0) || ['p', 'c', 'f', 'k'].some(k => typeof f[k] !== 'number' || f[k] < 0));
  expect(bad).toEqual([]);
});

test('every item has a Veg / NV / Egg / Fruit type', async ({ context }) => {
  const { page } = await openApp(context);
  const bad = (await foods(page)).filter(f => !['Veg', 'NV', 'Egg', 'Fruit'].includes(f.t)).map(f => f.n);
  expect(bad).toEqual([]);
});

test('DATA CHECK: calories agree with macros (4/4/9 rule, ±15%)', async ({ context }) => {
  const { page } = await openApp(context);
  const off = (await foods(page)).filter(f => {
    const atw = 4 * f.p + 4 * f.c + 9 * f.f;
    return f.k > 0 && Math.abs(atw - f.k) / f.k > 0.15 && Math.abs(atw - f.k) * f.q > 15;
  }).map(f => `${f.n}: ${Math.round(f.k * f.q)} kcal listed vs ${Math.round((4 * f.p + 4 * f.c + 9 * f.f) * f.q)} from macros, per ${f.q} ${f.u}`);
  dataWarning('Calories do not match macros — check these rows in the Excel sheet', off);
});

test('DATA CHECK: no two foods share the same name and unit', async ({ context }) => {
  const { page } = await openApp(context);
  const seen = {}, dup = [];
  for (const f of await foods(page)) {
    const k = f.n + ' | ' + f.u;
    if (seen[k] && Math.round(seen[k].k * seen[k].q) !== Math.round(f.k * f.q))
      dup.push(`${k}: ${Math.round(seen[k].k * seen[k].q)} vs ${Math.round(f.k * f.q)} kcal per ${f.q} ${f.u}`);
    seen[k] = seen[k] || f;
  }
  dataWarning('Same name and unit, different values — decide which is right in the Excel sheet', dup);
});

test('tapping the second "Coconut milk" logs the second item, not the first', async ({ context }) => {
  const { page } = await openApp(context);
  const both = (await foods(page)).filter(f => f.n === 'Coconut milk' && f.u === 'g');
  test.skip(both.length < 2, 'duplicate no longer present');
  await logFood(page, { meal: 'Breakfast', name: 'Coconut milk', qty: 100, nth: 1 });
  const d = await db(page); const e = Object.values(d.days)[0][0];
  // search sorts matches; find which DB row the 2nd on-screen result shows
  const shownKcal = both.map(f => Math.round(f.k * 100));
  expect(new Set(shownKcal).size).toBe(2);
  expect(Math.round(e.k), `picked the 2nd result but logged ${Math.round(e.k)} kcal; the two items are ${shownKcal.join(' and ')} kcal`).toBe(Math.round(both[1].k * 100));
});

test('optional: app values match your Excel export exactly', async ({ context }) => {
  const file = process.env.MACRO_CSV;
  test.skip(!file, 'set MACRO_CSV=path/to/Macro_List.csv (columns: name,unit,qty,protein,carbs,fat,kcal) to enable');
  const rows = fs.readFileSync(file, 'utf8').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
  const { page } = await openApp(context);
  const F = await foods(page), diffs = [];
  rows.forEach(([n, u, q, p, c, f, k], i) => {
    const a = F[i]; if (!a) return diffs.push(`row ${i + 2} ${n}: missing in app`);
    const near = (x, y) => Math.abs(x - y) < 0.05;
    if (a.n !== n.trim() || !near(a.p * a.q, +p) || !near(a.c * a.q, +c) || !near(a.f * a.q, +f) || !near(a.k * a.q, +k))
      diffs.push(`row ${i + 2} ${n}: sheet ${p}/${c}/${f}/${k} vs app ${(a.p * a.q).toFixed(2)}/${(a.c * a.q).toFixed(2)}/${(a.f * a.q).toFixed(2)}/${(a.k * a.q).toFixed(2)}`);
  });
  expect(diffs).toEqual([]);
});

test('editing an entry from the second "Coconut milk" keeps its own values', async ({ context }) => {
  const { page } = await openApp(context);
  const both = (await foods(page)).filter(f => f.n === 'Coconut milk' && f.u === 'g');
  test.skip(both.length < 2, 'duplicate no longer present');
  await logFood(page, { meal: 'Breakfast', name: 'Coconut milk', qty: 100, nth: 1 });
  await page.locator('button.item[data-edit="0"]').click();
  await page.locator('#qv').fill('200');
  await page.locator('#confirm').click();
  const e = Object.values((await db(page)).days)[0][0];
  expect(Math.round(e.k)).toBe(Math.round(both[1].k * 200));
});

test('quick-add from recents uses the exact item that was logged', async ({ context }) => {
  const { page } = await openApp(context);
  const both = (await foods(page)).filter(f => f.n === 'Coconut milk' && f.u === 'g');
  test.skip(both.length < 2, 'duplicate no longer present');
  await logFood(page, { meal: 'Breakfast', name: 'Coconut milk', qty: 100, nth: 1 });
  await page.locator('button.band-add[data-meal="Lunch"]').click();
  await page.locator('#recents [data-quick]').first().click();
  const list = Object.values((await db(page)).days)[0];
  expect(list.map(e => Math.round(e.k))).toEqual([Math.round(both[1].k * 100), Math.round(both[1].k * 100)]);
});
