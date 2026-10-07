// Full E2E of the lab (list, filter, sort, row menu, paging, detail, form, hub, theme) plus a
// screenshot per visual state, for pixel comparison between two builds of the same UI.
// Needs `npm run dev:mock` on :4010, freshly started (seeded data, deterministic ids).
//
//   node e2e/lab-full.mjs [--shots <dir>]          default dir: e2e/screenshots/full
//   node e2e/lab-full.mjs --compare <dirA> <dirB>  byte-compare two screenshot sets
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

if (args[0] === '--compare') {
  const [a, b] = args.slice(1);
  const names = [...new Set([...fs.readdirSync(a), ...fs.readdirSync(b)])].sort();
  let diff = 0;
  for (const n of names) {
    const fa = path.join(a, n);
    const fb = path.join(b, n);
    const same = fs.existsSync(fa) && fs.existsSync(fb) && fs.readFileSync(fa).equals(fs.readFileSync(fb));
    if (!same) diff += 1;
    console.log(`${same ? 'SAME' : 'DIFF'}  ${n}`);
  }
  console.log(`${names.length - diff}/${names.length} identical`);
  process.exit(diff ? 1 : 0);
}

const require = createRequire(path.join(here, '..', '..', '..', 'generator', 'package.json'));
const { chromium } = require('@playwright/test');
const BASE = process.env.LAB_URL ?? 'http://localhost:4010';
const shotsAt = args.indexOf('--shots');
const OUT = path.resolve(shotsAt === -1 ? path.join(here, 'screenshots', 'full') : args[shotsAt + 1]);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
await page.addInitScript(() => {
  localStorage.setItem('neudela-lab:theme', 'light');
  // test-only: freeze motion and the caret so screenshots are pixel-stable between runs
  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';
    document.head.appendChild(style);
  });
});

let shotNo = 0;
const shot = async (name, opts = {}) => {
  await page.waitForTimeout(350); // let transitions / popovers settle
  shotNo += 1;
  await page.screenshot({ path: path.join(OUT, `${String(shotNo).padStart(2, '0')}-${name}.png`), ...opts });
};
const rows = () => page.locator('.lt-table tbody tr');
const waitRows = async (n) => {
  await page.waitForFunction((count) => document.querySelectorAll('.lt-table tbody tr').length === count
    && !document.querySelector('.lt-table.is-refreshing'), n, { timeout: 5000 }).catch(() => {});
};
const cellTexts = async (col) => rows().evaluateAll((trs, c) => trs.map((tr) => tr.children[c]?.textContent?.trim() ?? ''), col);

// ── list ──
await page.goto(`${BASE}/party-rev-sharing-algorithm`);
await page.locator('.lt-chip', { hasText: '12 algorithms' }).waitFor();
await waitRows(10);
check('list: 10 rows of 12', await rows().count() === 10 && /12 algorithms/.test(await page.locator('.lt-chip').first().innerText()), `${await rows().count()} rows, chip ${await page.locator('.lt-chip').first().innerText()}`);
check('list: row numbers 1.–10.', (await cellTexts(0)).join(' ') === '1. 2. 3. 4. 5. 6. 7. 8. 9. 10.', (await cellTexts(0)).join(' '));
check('list: header columns', (await page.locator('.lt-table thead th').allInnerTexts()).map((t) => t.trim()).join('|').startsWith('No|ID|Name|Description|Policies|Last Update|Actions'));
await shot('list');

await page.getByRole('button', { name: 'Page 2', exact: true }).click();
await waitRows(2);
check('pagination: page 2 continues numbering', (await cellTexts(0)).join(' ') === '11. 12.');
check('pagination: range text', await page.getByText('11–12 of 12').isVisible());
await page.getByRole('button', { name: 'Page 1', exact: true }).click();
await waitRows(10);

await page.locator('.lt-psize__trigger').click();
await shot('rows-per-page');
await page.getByRole('option', { name: '25' }).click();
await waitRows(12);
check('rows per page 25 → 12 rows', await rows().count() === 12);
await page.locator('.lt-psize__trigger').click();
await page.getByRole('option', { name: '10' }).click();
await waitRows(10);

await page.getByRole('button', { name: /^Sort By/ }).click();
await shot('sort-menu');
await page.locator('.neuron-dropdown-menu__item').filter({ hasText: /^\s*Name\s*$/ }).click();
await waitRows(10);
const names = await cellTexts(2);
check('sort by name asc', JSON.stringify(names) === JSON.stringify([...names].sort((x, y) => x.localeCompare(y))), names.slice(0, 3).join(', '));

await page.getByRole('button', { name: /^Filter/ }).click();
await page.locator('.lt-filters').waitFor();
await page.locator('.lt-filters__value input').first().fill('6');
await shot('filter-panel');
await page.getByRole('button', { name: 'Apply filters' }).click();
await page.locator('.lt-fchips').waitFor();
await waitRows(1).catch(() => {});
await page.waitForTimeout(500);
check('filter ID contains "6" → chip shown', await page.locator('.lt-fchip').count() === 1);
await shot('filter-chips');
await page.getByRole('button', { name: 'Clear all' }).click();
await waitRows(10);

await page.getByRole('textbox', { name: 'Search records in table' }).fill('zzz-none');
await page.getByText('No algorithms match “zzz-none”').waitFor({ timeout: 4000 }).catch(() => {});
check('search: no-match empty state', await page.getByText('No algorithms match “zzz-none”').isVisible());
await shot('empty-search');
await page.getByRole('button', { name: 'Clear search', exact: true }).click();
await waitRows(10);

// row menu (keyboard)
const firstMenu = page.locator('.lt-action--menu').first();
await firstMenu.focus();
await page.keyboard.press('ArrowDown');
await page.locator('.lt-rowmenu').waitFor();
check('row menu: opens with focus on first item', await page.evaluate(() => document.activeElement?.textContent?.includes('View details')));
await shot('row-menu');
await page.keyboard.press('Escape');

// ── detail ──
await rows().first().click();
await page.locator('.dt-header__title').waitFor();
const title = await page.locator('.dt-header__title').innerText();
check('detail: breadcrumb ends with the name', (await page.locator('.dt-header__crumbs').innerText()).trim().endsWith(title));
check('detail: 4 tabs', await page.getByRole('tab').count() === 4);
await shot('detail-overview', { fullPage: true });
await page.getByRole('tab', { name: /Policies/ }).click();
await shot('detail-policies');
await page.locator('[aria-label="Table view"]').click();
await shot('detail-policies-table');
await page.getByRole('tab', { name: /Condition Variables/ }).click();
await shot('detail-conditions');
await page.getByRole('tab', { name: /Action Variables/ }).click();
await page.locator('[aria-label="Card view"]').click();
await shot('detail-actions-cards');
await page.getByRole('button', { name: 'Back to list' }).click();
await waitRows(10);

// ── form ──
await page.getByRole('button', { name: 'New Algorithm' }).click();
const dlg = page.locator('.fm-dialog');
await dlg.waitFor();
await dlg.getByText('Standard Partner Split').count(); // lookups load in the background
await page.waitForTimeout(600);
await shot('form-open');
check('form: no ✕ close button', await dlg.locator('.neuron-modal__close').count() === 0);
await dlg.getByRole('button', { name: 'Add condition variable' }).click();
await dlg.getByRole('button', { name: 'Create algorithm' }).click();
await page.waitForTimeout(300);
check('form: summary counts 5 fields', /5 fields need attention/.test(await dlg.locator('.fm-summary').innerText()));
await shot('form-invalid');
const pick = async (group, option) => {
  await dlg.getByRole('group', { name: group }).locator('.neuron-dropdown__trigger').click();
  await page.getByRole('option', { name: new RegExp(option) }).first().click();
};
await dlg.getByLabel('Name', { exact: true }).fill('E2E Split');
await pick('Policy (required)', 'Roaming Settlement');
await pick('Policy condition (required)', 'Monthly revenue above threshold');
await pick('Variable (required)', 'revenueThreshold');
await dlg.getByLabel('Condition variable 1 value').fill('500');
await page.waitForTimeout(200);
check('form: summary clears when fixed', await dlg.locator('.fm-summary').count() === 0);
await dlg.locator('.neuron-modal__body').evaluate((el) => el.scrollTo(0, el.scrollHeight));
await shot('form-filled');
let body = null;
page.once('request', (r) => { if (r.method() === 'POST') body = r.postDataJSON(); });
await dlg.getByRole('button', { name: 'Create algorithm' }).click();
await page.getByText('Revenue sharing algorithm created successfully').waitFor();
check('form: FVO payload', JSON.stringify(body) === JSON.stringify({
  '@type': 'PartyRevSharingAlgorithm',
  name: 'E2E Split',
  policy: [{ id: 'pol-004', name: 'Roaming Settlement', '@type': 'PolicyRef', '@referredType': 'Policy' }],
  conditionVariable: [{
    '@type': 'PartyRevSharingPolicyConditionVariable',
    value: '500',
    policyCondition: { id: 'pcond-002', name: 'Monthly revenue above threshold', '@type': 'PolicyConditionRef', '@referredType': 'PolicyCondition' },
    policyConditionVariable: { id: 'pvar-003', name: 'revenueThreshold', '@type': 'PolicyVariableRef', '@referredType': 'PolicyVariable' },
  }],
}), JSON.stringify(body));
await waitRows(10);
check('list: count chip 13 after create', /13 algorithms/.test(await page.locator('.lt-chip').first().innerText()));

// delete the created record again (keeps the mock state as seeded)
await page.getByRole('textbox', { name: 'Search records in table' }).fill('E2E Split');
await waitRows(1);
await page.locator('.lt-action--menu').first().click();
await page.getByRole('menuitem', { name: 'Delete' }).click();
await page.getByRole('heading', { name: 'Delete revenue sharing algorithm?' }).waitFor();
await shot('delete-confirm', { mask: [page.locator('.lt-cell-id'), page.locator('.lt-cell-stack')] }); // the created record's id + time are not seeded
await page.getByRole('button', { name: 'Delete', exact: true }).click();
await page.getByText('Deleted successfully').waitFor();
check('delete: toast', true);
await page.getByRole('button', { name: 'Clear search', exact: true }).click();
await waitRows(10);

// ── hub ──
await page.getByRole('link', { name: 'Event Hub' }).click();
await waitRows(2);
check('hub: 2 subscriptions', await rows().count() === 2);
await shot('hub-list');
await page.getByRole('button', { name: 'New Subscription' }).click();
await page.locator('.fm-dialog').waitFor();
await page.getByRole('button', { name: 'Subscribe' }).click();
await page.waitForTimeout(200);
check('hub form: 1 field needs attention', /1 field needs attention/.test(await page.locator('.fm-dialog .fm-summary').innerText()));
await page.getByLabel('Callback URL').fill('not a url');
await page.getByLabel('Callback URL').blur();
await shot('hub-form-invalid');
await page.getByLabel('Callback URL').fill('https://e2e.example.com/hook');
let hubBody = null;
page.once('request', (r) => { if (r.method() === 'POST') hubBody = r.postDataJSON(); });
await page.getByRole('button', { name: 'Subscribe' }).click();
await page.getByText('Subscription created').waitFor();
check('hub: payload (Hub_FVO: @type + callback)', JSON.stringify(hubBody) === JSON.stringify({ '@type': 'Hub', callback: 'https://e2e.example.com/hook' }), JSON.stringify(hubBody));
await waitRows(3);
await page.locator('.lt-action--menu').first().click();
await page.getByRole('menuitem', { name: 'Remove' }).click();
await page.getByRole('button', { name: 'Remove', exact: true }).click();
await page.getByText('Subscription removed').waitFor();
await waitRows(2);
check('hub: removed again', await rows().count() === 2);

// ── theme ──
await page.getByRole('link', { name: 'Revenue Sharing Algorithms' }).click();
await waitRows(10);
await page.getByText('Dark mode').click();
await shot('list-dark');
check('theme: html + body dark', await page.evaluate(() => document.documentElement.classList.contains('dark-theme') && document.body.classList.contains('dark-theme')));

// ── mobile ──
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
check('mobile: card list', await page.locator('.lt-card').count() === 10);
await shot('list-mobile-dark');

check('console clean', logs.length === 0, logs.slice(0, 3).join(' | '));
console.log(`${results.filter(Boolean).length}/${results.length} passed — screenshots in ${path.relative(process.cwd(), OUT)}`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
