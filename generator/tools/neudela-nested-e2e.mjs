#!/usr/bin/env node
/**
 * E2E of a nested resource (OAS /parent/{id}/child) on a generated TMF673 app served by
 * `vite --mode mock` (run by tools/fe-neudela-build.mjs --e2e): GeographicSubAddress under
 * GeographicAddress.
 *
 *   node tools/neudela-nested-e2e.mjs <baseUrl>
 *
 * Checks: the parent's record page has a tab that lists the children live from
 * /geographicAddress/{id}/geographicSubAddress (not from the parent's embedded copy), with the
 * list toolbar (search → filter=, count); only this parent's children; a row opens the child's
 * record page (GET …/geographicSubAddress/{subId}) with breadcrumbs through the parent; back
 * returns to the parent on the same tab.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', 'package.json'));
const { chromium } = require('@playwright/test');
const BASE = process.argv[2] ?? 'http://localhost:4915';
const API = `${BASE}/tmf-api/geographicAddressManagement/v4`;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const post = async (p, body) => {
  const r = await fetch(`${API}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.json();
};
// two addresses; sub-addresses only under the first (the embedded copy is deliberately stale)
const main = await post('/geographicAddress', { '@type': 'GeographicAddress', name: 'HQ Jakarta', city: 'Jakarta', streetName: 'Sudirman', geographicSubAddress: [] });
const other = await post('/geographicAddress', { '@type': 'GeographicAddress', name: 'Branch Bandung', city: 'Bandung' });
await post(`/geographicAddress/${main.id}/geographicSubAddress`, { '@type': 'GeographicSubAddress', name: 'Tower A', buildingName: 'Tower A', levelNumber: '12' });
await post(`/geographicAddress/${main.id}/geographicSubAddress`, { '@type': 'GeographicSubAddress', name: 'Tower B', buildingName: 'Tower B', levelNumber: '3' });
await post(`/geographicAddress/${other.id}/geographicSubAddress`, { '@type': 'GeographicSubAddress', name: 'Annex', buildingName: 'Annex' });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push(e.message));
await page.addInitScript(() => localStorage.setItem('geographic-address-portal:theme', 'light'));
const nestedCalls = [];
page.on('request', (r) => {
  const p = new URL(r.url()).pathname;
  if (/\/geographicSubAddress/.test(p)) nestedCalls.push(`${r.method()} ${p}${new URL(r.url()).search}`);
});

await page.goto(`${BASE}/geographic-address`);
await page.locator('.lt-table tbody tr').filter({ hasText: 'HQ Jakarta' }).first().click();
await page.locator('.dt-header__title').waitFor();
const tab = page.getByRole('tab', { name: /Geographic Sub Address/ });
check('parent record page has the nested tab', await tab.isVisible());
await tab.click();
const rows = page.locator('.lab-embedded-list .lt-table tbody tr');
const settle = () => page.waitForFunction(() => !document.querySelector('.lab-embedded-list .is-refreshing, .lab-embedded-list [aria-busy="true"]')
  && !!document.querySelector('.lab-embedded-list .lt-chip'), null, { timeout: 5000 }).catch(() => {});
await settle();
check('the tab lists the children live from the nested path', nestedCalls.some((c) => c.startsWith(`GET /tmf-api/geographicAddressManagement/v4/geographicAddress/${main.id}/geographicSubAddress?`)), nestedCalls.join(' | '));
check('only this parent\'s children (2, not the other address\'s)', await rows.count() === 2, `${await rows.count()} rows`);
const chip = (await page.locator('.lab-embedded-list .lt-chip').innerText().catch(() => '')).trim();
check('the list card has its toolbar (search) and count', await page.locator('.lab-embedded-list .lt-toolbar__search input').isVisible() && /^2 /.test(chip), chip);
check('no page breadcrumb / title inside the tab', await page.locator('.lab-embedded-list .lab-page__title').count() === 0);

// search goes to the nested API as filter=
const search = page.locator('.lab-embedded-list .lt-toolbar__search input');
await search.fill('Tower B');
await page.waitForTimeout(600);
await settle();
check('search → filter= on the nested path', nestedCalls.some((c) => /geographicSubAddress\?.*filter=/.test(c)) && await rows.count() === 1, nestedCalls.at(-1));
await search.fill('');
await page.waitForTimeout(900);

// a row opens the child's record page
await rows.filter({ hasText: 'Tower A' }).first().click();
await page.locator('.dt-header__title').filter({ hasText: 'Tower A' }).waitFor({ timeout: 5000 }).catch(() => {});
check('row opens the child record page', (await page.locator('.dt-header__title').innerText()).trim() === 'Tower A');
check('child loaded by GET …/geographicSubAddress/{subId}', nestedCalls.some((c) => new RegExp(`^GET /tmf-api/geographicAddressManagement/v4/geographicAddress/${main.id}/geographicSubAddress/[^/?]+$`).test(c)));
const crumbs = (await page.locator('.dt-header__crumbs').innerText()).replace(/\s+/g, ' ');
check('breadcrumbs run through the parent', /Geographic Address.*HQ Jakarta.*Tower A/.test(crumbs), crumbs);
check('back button names the parent', await page.locator('.dt-header__actions').getByRole('button', { name: 'Back to HQ Jakarta' }).isVisible());
await page.screenshot({ path: path.join(path.dirname(here), '..', 'design-lab', 'neudela-lab', 'e2e', 'screenshots', 'nested-record.png'), fullPage: true }).catch(() => {});

await page.locator('.dt-header__actions').getByRole('button', { name: 'Back to HQ Jakarta' }).click();
await page.locator('.dt-header__title').filter({ hasText: 'HQ Jakarta' }).waitFor({ timeout: 5000 }).catch(() => {});
check('back returns to the parent', (await page.locator('.dt-header__title').innerText()).trim() === 'HQ Jakarta');
check('…on the nested tab', (await page.getByRole('tab', { name: /Geographic Sub Address/ }).getAttribute('aria-selected')) === 'true');

// the parent crumb from the child page goes back to the parent too; the root crumb to the list
await rows.filter({ hasText: 'Tower B' }).first().click();
await page.locator('.dt-header__title').filter({ hasText: 'Tower B' }).waitFor({ timeout: 5000 }).catch(() => {});
await page.locator('.dt-header__crumbs').getByText('Geographic Address', { exact: true }).click();
await page.locator('.lt-table tbody tr').first().waitFor({ timeout: 5000 }).catch(() => {});
check('root crumb returns to the address list', await page.locator('.lab-page__title').first().isVisible() && !(await page.locator('.dt-header__title').isVisible().catch(() => false)));

check('console clean', logs.length === 0, logs.join(' | '));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
