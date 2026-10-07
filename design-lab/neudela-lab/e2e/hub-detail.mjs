// E2E of the Event Hub read path: create sends "@type": "Hub" (Hub_FVO is Extensible), a row
// opens the subscription's record page (GET /hub/{id}), back returns to the list.
// Needs `npm run dev:mock` (LAB_URL, default :4010).
//
//   node e2e/hub-detail.mjs
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
const posts = [];
const gets = [];
page.on('request', (r) => {
  const u = new URL(r.url());
  if (!/\/hub(\/|$)/.test(u.pathname)) return;
  if (r.method() === 'POST') posts.push(JSON.parse(r.postData() ?? '{}'));
  if (r.method() === 'GET') gets.push(u.pathname);
});

await page.goto(`${BASE}/hub`);
await page.locator('.lt-table tbody tr').first().waitFor();

// create: @type goes out
await page.getByRole('button', { name: 'New Subscription' }).click();
const dlg = page.getByRole('dialog');
await dlg.getByRole('textbox', { name: 'Callback URL' }).fill('https://e2e.example/hook');
await dlg.getByRole('button', { name: 'Subscribe' }).click();
await page.getByText('Subscription created').first().waitFor({ timeout: 5000 }).catch(() => {});
check('create sends "@type": "Hub"', posts.at(-1)?.['@type'] === 'Hub', JSON.stringify(posts.at(-1)));
check('…and keys in Hub_FVO order (@type first)', Object.keys(posts.at(-1) ?? {})[0] === '@type');

// row → record page
const row = page.locator('.lt-table tbody tr').filter({ hasText: 'https://e2e.example/hook' }).first();
await row.waitFor();
await row.click();
await page.locator('.dt-header__title').waitFor({ timeout: 5000 }).catch(() => {});
check('row opens the record page, titled with the callback', (await page.locator('.dt-header__title').innerText().catch(() => '')).trim() === 'https://e2e.example/hook');
check('record page loads through GET /hub/{id}', gets.some((p) => /\/hub\/[^/]+$/.test(p)), gets.join(' '));
check('query filter shows "All events" when empty', await page.getByText('All events').first().isVisible());
check('type shown (Hub)', await page.locator('.dt-kv, .dt-card').getByText('Hub', { exact: true }).first().isVisible().catch(() => false));
check('no Edit on a hub (no PATCH in the API)', !(await page.locator('.dt-header__actions').getByRole('button', { name: 'Edit' }).isVisible()));
await page.screenshot({ path: path.join(here, 'screenshots', 'hub-detail.png'), fullPage: true });
await page.locator('.dt-header__actions').getByRole('button', { name: 'Back to list' }).click();
await page.locator('.lt-table tbody tr').first().waitFor();
check('back returns to the list', await page.locator('.lt-table').isVisible());

// the row menu offers View details
await page.locator('.lt-action--menu').first().click();
check('row menu has View details', await page.locator('.lt-rowmenu').getByText('View details', { exact: true }).isVisible());
await page.keyboard.press('Escape');

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
