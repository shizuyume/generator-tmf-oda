// E2E of the edit form (PATCH): open from the row menu and from the record page, prefill from the
// record, send only the attributes that changed, unchanged save makes no request, a cleared
// attribute goes out as null, required rules still hold.
// Needs `npm run dev:mock` (LAB_URL, default :4010), freshly started.
//
//   node e2e/edit-form.mjs [--shots <dir>]
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const require = createRequire(path.join(here, '..', '..', '..', 'generator', 'package.json'));
const { chromium } = require('@playwright/test');
const BASE = process.env.LAB_URL ?? 'http://localhost:4010';
const shotsAt = args.indexOf('--shots');
const OUT = path.resolve(shotsAt === -1 ? path.join(here, 'screenshots', 'edit') : args[shotsAt + 1]);
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => {
  localStorage.setItem('neudela-lab:theme', 'light');
  document.addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';
    document.head.appendChild(style);
  });
});

const patches = [];
page.on('request', (r) => {
  if (r.method() === 'PATCH') patches.push({ url: r.url(), body: JSON.parse(r.postData() ?? '{}') });
});

let shotNo = 0;
const shot = async (name) => {
  await page.waitForTimeout(300);
  shotNo += 1;
  await page.screenshot({ path: path.join(OUT, `${String(shotNo).padStart(2, '0')}-${name}.png`) });
};
const dialog = () => page.getByRole('dialog');
const rows = () => page.locator('.lt-table tbody tr');
const waitToast = async (text) => page.getByText(text).first().waitFor({ timeout: 5000 }).then(() => true).catch(() => false);

await page.goto(`${BASE}/party-rev-sharing-algorithm`);
await rows().first().waitFor();

// ── from the row menu ──
await page.locator('.lt-action--menu').first().click();
await page.locator('.lt-rowmenu').waitFor();
await shot('row-menu-edit');
check('row menu has Edit', await page.locator('.lt-rowmenu').getByText('Edit', { exact: true }).isVisible());
await page.locator('.lt-rowmenu').getByText('Edit', { exact: true }).click();
await dialog().waitFor();
const heading = (await dialog().getByRole('heading').first().innerText()).trim();
const nameInput = dialog().getByRole('textbox', { name: 'Name' });
const prefilled = await nameInput.inputValue();
check('name prefilled from the record', prefilled !== '' && (await rows().first().innerText()).includes(prefilled), prefilled);
check('dialog title = "Edit {name}"', heading === `Edit ${prefilled}`, heading);
check('submit says "Save changes"', await dialog().getByRole('button', { name: 'Save changes' }).isVisible());
const policyItems = await dialog().locator('.fm-item').count();
check('repeatable lists prefilled (items present)', policyItems > 0, `${policyItems} items`);
await shot('edit-dialog-prefilled');

// unchanged save: no request
await dialog().getByRole('button', { name: 'Save changes' }).click();
check('unchanged save → "No changes to save."', await waitToast('No changes to save.'));
check('unchanged save → no PATCH sent', patches.length === 0, `${patches.length} PATCH`);

// change the description only
await page.locator('.lt-action--menu').first().click();
await page.locator('.lt-rowmenu').getByText('Edit', { exact: true }).click();
await dialog().waitFor();
const desc = dialog().getByRole('textbox', { name: /Description/ });
await desc.fill('Edited by the E2E run');
await dialog().getByRole('button', { name: 'Save changes' }).click();
check('save → updated toast', await waitToast('Revenue sharing algorithm updated successfully'));
const p1 = patches.at(-1);
check('PATCH carries only the changed attribute', p1 && JSON.stringify(Object.keys(p1.body)) === '["description"]', JSON.stringify(p1?.body));
check('PATCH goes to the record', !!p1 && /\/partyRevSharingAlgorithm\/[^/]+$/.test(new URL(p1.url).pathname));
await page.getByText('Edited by the E2E run').first().waitFor({ timeout: 5000 }).catch(() => {});
check('list reloads with the new value', await page.getByText('Edited by the E2E run').first().isVisible());

// required rule still holds
await page.locator('.lt-action--menu').first().click();
await page.locator('.lt-rowmenu').getByText('Edit', { exact: true }).click();
await dialog().waitFor();
await dialog().getByRole('textbox', { name: 'Name' }).fill('');
const before = patches.length;
await dialog().getByRole('button', { name: 'Save changes' }).click();
check('cleared required name → error summary, no request', await dialog().getByText(/field needs attention/).isVisible() && patches.length === before);
await shot('edit-required');
await dialog().getByRole('button', { name: 'Cancel' }).click();

// ── from the record page (a record with several policies) ──
await rows().filter({ hasText: /[2-9] policies/ }).first().click();
await page.locator('.dt-header__title').waitFor();
const editBtn = page.locator('.dt-header__actions').getByRole('button', { name: 'Edit' });
check('record page header has Edit', await editBtn.isVisible());
await shot('detail-header-edit');
await editBtn.click();
await dialog().waitFor();
await dialog().getByRole('textbox', { name: /Description/ }).fill('');
await dialog().getByRole('button', { name: 'Save changes' }).click();
check('record page save → updated toast', await waitToast('Revenue sharing algorithm updated successfully'));
const p2 = patches.at(-1);
check('cleared description → sent as null', p2 && JSON.stringify(p2.body) === '{"description":null}', JSON.stringify(p2?.body));
await page.waitForTimeout(400);
check('record page reloads (description gone)', !(await page.locator('.dt-header__desc').isVisible().catch(() => false)));

// lists: remove one policy → policy array sent whole
await editBtn.click();
await dialog().waitFor();
const items = dialog().locator('.fm-section').first().locator('.fm-item');
const n = await items.count();
if (n > 1) {
  await items.last().getByRole('button', { name: /Remove/ }).click();
  await dialog().getByRole('button', { name: 'Save changes' }).click();
  await waitToast('Revenue sharing algorithm updated successfully');
  const p3 = patches.at(-1);
  check('removed policy → PATCH sends the whole policy list, one shorter', Array.isArray(p3?.body.policy) && p3.body.policy.length === n - 1 && Object.keys(p3.body).length === 1, JSON.stringify(p3?.body).slice(0, 160));
  check('policy refs keep @type / @referredType, no href', p3?.body.policy.every((x) => x['@type'] === 'PolicyRef' && x['@referredType'] === 'Policy' && !('href' in x)));
} else {
  await dialog().getByRole('button', { name: 'Cancel' }).click();
  check('record has more than one policy to remove', false, `${n} items`);
}

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
console.log(`${results.filter(Boolean).length}/${results.length} passed — screenshots in ${path.relative(process.cwd(), OUT)}`);
process.exit(results.every(Boolean) ? 0 : 1);
