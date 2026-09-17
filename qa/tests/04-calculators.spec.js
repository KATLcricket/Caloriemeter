const { test } = require('@playwright/test');
const R = require('./refs');
const { openApp, tab, db, expect } = require('./harness');

async function fillProfile(page, p) {
  await tab(page, 'set');
  for (const [id, v] of Object.entries({ pw: p.w, pbf: p.bf, ph: p.h, pa: p.a, ppro: p.pro, pfat: p.fat }))
    if (v !== undefined) await page.locator('#' + id).fill(String(v));
  if (p.sex) await page.locator('#psex').selectOption(p.sex);
  if (p.act) await page.locator('#pact').selectOption(String(p.act));
  if (p.goal) await page.locator('#pgoal').selectOption(p.goal);
}
const figs = async (page) => (await page.locator('#calcout .v').allTextContents()).map(Number); // BMR, TDEE, target, kcal, P, C, F
const goalK = (bmr, tdee, g) => g === 'mid' ? (bmr + tdee) / 2 : g === 'd20' ? tdee * 0.8 : g === 'gain' ? tdee * 1.1 : tdee;

const cases = [
  { name: 'Katch-McArdle · male 78 kg 18% BF · moderate · midpoint cut', w: 78, bf: 18, h: 175, a: 38, sex: 'm', act: 1.55, goal: 'mid' },
  { name: 'Katch-McArdle · 20% deficit · hard training', w: 85, bf: 22, h: 180, a: 38, sex: 'm', act: 1.725, goal: 'd20' },
  { name: 'Mifflin-St Jeor fallback · male · maintain', w: 78, bf: '', h: 175, a: 38, sex: 'm', act: 1.375, goal: 'maint' },
  { name: 'Mifflin-St Jeor fallback · female · +10% build', w: 60, bf: '', h: 162, a: 34, sex: 'f', act: 1.2, goal: 'gain' },
];
for (const c of cases) {
  test(`target calculator: ${c.name}`, async ({ context }) => {
    const { page } = await openApp(context);
    await fillProfile(page, { ...c, pro: 1.8, fat: 25 });
    const bmr = c.bf ? R.katch(c.w, c.bf) : R.mifflin(c.w, c.h, c.a, c.sex);
    const tdee = bmr * c.act, k = goalK(bmr, tdee, c.goal);
    const p = Math.round(c.w * 1.8), f = Math.round(k * 0.25 / 9), carb = Math.max(Math.round((k - p * 4 - f * 9) / 4), 0);
    expect(await figs(page)).toEqual([Math.round(bmr), Math.round(tdee), Math.round(k), Math.round(k), p, carb, f]);
    await expect(page.locator('#calcout .note')).toContainText(c.bf ? 'Katch-McArdle' : 'Mifflin-St Jeor');
  });
}

test('weekly rate estimate uses 7700 kcal per kg', async ({ context }) => {
  const { page } = await openApp(context);
  await fillProfile(page, { w: 78, bf: 18, act: 1.55, goal: 'd20' });
  const bmr = R.katch(78, 18), tdee = bmr * 1.55, gap = Math.round(tdee - tdee * 0.8);
  await expect(page.locator('#calcout .note')).toContainText(`About ${Math.round(gap * 7 / 7700 * 10) / 10} kg lost a week`);
});

test('warns when protein and fat alone exceed the calorie target', async ({ context }) => {
  const { page } = await openApp(context);
  await fillProfile(page, { w: 120, bf: 45, act: 1.2, goal: 'd20', pro: 3.3, fat: 45 });
  await expect(page.locator('#calcout .note')).toContainText('exceed the calorie target');
});

test('body fat: US Navy tape method, male', async ({ context }) => {
  const { page } = await openApp(context);
  await fillProfile(page, { h: 175, w: 78, a: 38, sex: 'm' });
  await page.locator('#bfbox summary').click();
  await page.locator('#bneck').fill('39'); await page.locator('#bwaist').fill('88');
  await expect(page.locator('#bfout .v')).toHaveText((Math.round(R.navyMale(175, 39, 88) * 10) / 10) + '%');
  await expect(page.locator('#bfout')).toContainText('US Navy');
});

test('body fat: US Navy tape method, female (needs hip)', async ({ context }) => {
  const { page } = await openApp(context);
  await fillProfile(page, { h: 162, w: 60, a: 34, sex: 'f' });
  await page.locator('#bfbox summary').click();
  await page.locator('#bneck').fill('32'); await page.locator('#bwaist').fill('74'); await page.locator('#bhip').fill('98');
  await expect(page.locator('#bfout .v')).toHaveText((Math.round(R.navyFemale(162, 32, 74, 98) * 10) / 10) + '%');
});

test('body fat: falls back to Deurenberg when tape measurements are missing', async ({ context }) => {
  const { page } = await openApp(context);
  await fillProfile(page, { h: 175, w: 78, a: 38, sex: 'm' });
  await page.locator('#bfbox summary').click();
  await expect(page.locator('#bfout .v')).toHaveText((Math.round(R.deurenberg(78, 175, 38, 'm') * 10) / 10) + '%');
  await expect(page.locator('#bfout')).toContainText('Deurenberg');
});

test('"Use this" copies the body fat estimate into the calculator', async ({ context }) => {
  const { page } = await openApp(context);
  await fillProfile(page, { h: 175, w: 78, a: 38, sex: 'm' });
  await page.locator('#bfbox summary').click();
  await page.locator('#bneck').fill('39'); await page.locator('#bwaist').fill('88');
  await page.locator('#usebf').click();
  await expect(page.locator('#pbf')).toHaveValue(String(Math.round(R.navyMale(175, 39, 88) * 10) / 10));
});

test('applying calculator targets keeps your water and sets goals', async ({ context }) => {
  const { page } = await openApp(context);
  await tab(page, 'set');
  await page.locator('#tw').fill('4000'); await page.locator('#tset').fill('24');
  await page.locator('#savet').click();
  await fillProfile(page, { w: 78, bf: 18, act: 1.55, goal: 'mid' });
  await page.locator('#applycalc').click();
  const s = (await db(page)).settings;
  expect({ water: s.water, sets: s.sets }, 'water/sets goals were wiped by "Apply these targets"').toEqual({ water: 4000, sets: 24 });
});
