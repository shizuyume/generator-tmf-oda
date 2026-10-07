// E2E of the async-search relation picker (components/form/LookupPicker): typing searches the
// owning API (not just the first page), keyboard selection, no-match state, Escape, combobox ARIA.
// Needs `npm run dev:mock` (LAB_URL, default :4010).
//
//   node e2e/lookup-search.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', '..', '..', 'generator', 'package.json'));
const { chromium } = require('@playwright/test');
const BASE = process.env.LAB_URL ?? 'http://localhost:4010';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const lookupQueries = [];
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.pathname.endsWith('/policy') && r.method() === 'GET') lookupQueries.push(u.searchParams.get('name') ?? '');
});

await page.goto(`${BASE}/party-rev-sharing-algorithm`);
await page.locator('.lt-table tbody tr').first().waitFor();
await page.getByRole('button', { name: 'New Algorithm' }).click();
const dlg = page.getByRole('dialog');
await dlg.waitFor();
const group = dlg.getByRole('group', { name: 'Policy (required)' });
const box = group.getByRole('combobox');
check('picker is a combobox with an accessible name', await box.count() === 1 && (await box.getAttribute('aria-autocomplete')) === 'list');
await page.waitForTimeout(500); // the shared first page

await box.click();
check('opening shows the first page', await page.getByRole('option').count() > 0, `${await page.getByRole('option').count()} options`);
check('aria-expanded follows the list', (await box.getAttribute('aria-expanded')) === 'true');

await box.fill('roam');
await page.getByRole('option', { name: /Roaming Settlement/ }).first().waitFor({ timeout: 4000 }).catch(() => {});
check('typing searches the owning API (name=roam)', lookupQueries.includes('roam'), JSON.stringify(lookupQueries));
check('server results replace the list', await page.getByRole('option').count() === 1 && await page.getByRole('option', { name: /Roaming Settlement/ }).isVisible());

await box.press('ArrowDown');
check('active option is announced (aria-activedescendant)', !!(await box.getAttribute('aria-activedescendant')));
await box.press('Enter');
check('Enter picks it, the list closes', (await box.getAttribute('aria-expanded')) === 'false' && (await box.inputValue()) === 'Roaming Settlement', await box.inputValue());

await box.click();
await box.fill('zzz-nothing');
await page.getByText('No matches for “zzz-nothing”.').waitFor({ timeout: 4000 }).catch(() => {});
check('no-match state', await page.getByText('No matches for “zzz-nothing”.').isVisible());
await box.press('Escape');
check('Escape closes and keeps the picked value', (await box.getAttribute('aria-expanded')) === 'false' && (await box.inputValue()) === 'Roaming Settlement');

// stale responses never win: type quickly, the last query's results are shown
await box.click();
await box.pressSequentially('sta', { delay: 30 });
await page.waitForTimeout(800);
const labels = await page.getByRole('option').allInnerTexts();
check('debounced: only the last query is shown', labels.length > 0 && labels.every((l) => /sta/i.test(l)), labels.join(' | ').slice(0, 120));
await box.press('Escape');

// a catalogue larger than one page: the empty query gets the first 20, the rest only by search
await page.getByRole('button', { name: 'Cancel' }).click();
const big = Array.from({ length: 60 }, (_, i) => ({ id: `pol-big-${i + 1}`, name: `Catalogue policy ${i + 1}` }));
await page.route(/\/policy(\?|$)/, (route) => {
  const u = new URL(route.request().url());
  const q = (u.searchParams.get('name') ?? '').toLowerCase();
  const limit = Number(u.searchParams.get('limit') ?? 20);
  const hits = big.filter((p) => p.name.toLowerCase().includes(q)).slice(0, limit);
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hits) });
});
await page.reload();
await page.locator('.lt-table tbody tr').first().waitFor();
await page.getByRole('button', { name: 'New Algorithm' }).click();
await dlg.waitFor();
await page.waitForTimeout(500);
const bigBox = dlg.getByRole('group', { name: 'Policy (required)' }).getByRole('combobox');
await bigBox.click();
check('a full first page says there is more', await page.getByText('Showing the first 20 — type to search for more.').isVisible()
  && await page.getByRole('option').count() === 20);
await bigBox.fill('policy 37');
await page.getByRole('option', { name: /Catalogue policy 37/ }).waitFor({ timeout: 4000 }).catch(() => {});
check('an entity past the first page is found by searching', await page.getByRole('option', { name: /Catalogue policy 37/ }).isVisible());
await page.getByRole('option', { name: /Catalogue policy 37/ }).click();
check('…and picked', (await bigBox.inputValue()) === 'Catalogue policy 37');

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
