#!/usr/bin/env node
/**
 * E2E of the neudela form controls for numbers, JSON, single references, value objects (TimePeriod)
 * and nested lists, on a generated TMF620 (Product Catalog) app served by `vite --mode mock`
 * (run by tools/fe-neudela-build.mjs --e2e).
 *
 *   node tools/neudela-controls2-e2e.mjs <baseUrl>
 *
 * Checks: number / JSON rules in the form; validFor as a group of two date pickers; a single
 * relation (serviceLevelAgreement, Category.parent) from the async LOV; a characteristic with a
 * nested value list; the POST body carries JSON numbers, a parsed JSON object, {startDateTime}
 * only, the picked refs (@type / @referredType, no href) and the nested arrays; the edit dialog
 * prefills all of it and PATCHes only the changed list.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', 'package.json'));
const { chromium } = require('@playwright/test');
const BASE = process.argv[2] ?? 'http://localhost:4914';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push(e.message));
await page.addInitScript(() => localStorage.setItem('product-catalog-portal:theme', 'light'));
const bodies = { POST: [], PATCH: [] };
page.on('request', (r) => {
  if ((r.method() === 'POST' || r.method() === 'PATCH') && /\/(productOffering|category)(\/|$)/.test(new URL(r.url()).pathname)) {
    bodies[r.method()].push(r.postDataJSON());
  }
});

const dlg = page.locator('.fm-dialog');
const pickDay = async (scope, groupName, day) => {
  const group = scope.getByRole('group', { name: groupName });
  const trigger = group.locator('button[aria-haspopup="dialog"]');
  await trigger.click();
  await page.locator('.neuron-datepicker-day:not(.neuron-datepicker-day--muted)', { hasText: new RegExp(`^${day}$`) }).first().click();
  await page.waitForTimeout(200);
  if ((await trigger.getAttribute('aria-expanded')) === 'true') await trigger.click();
  return trigger.innerText();
};
const pickRef = async (scope, groupName) => {
  const box = scope.getByRole('group', { name: groupName }).getByRole('combobox');
  await box.click();
  const first = page.getByRole('option').first();
  await first.waitFor({ timeout: 4000 });
  const label = (await first.locator('.neuron-dropdown__option-label').innerText()).trim();
  await first.click();
  return label;
};

// ── ProductOffering: everything in one create ──
await page.goto(`${BASE}/product-offering`);
await page.getByRole('button', { name: 'New Product Offering' }).click();
await dlg.waitFor();
await page.waitForTimeout(500);

check('validFor is a group of two date pickers', await dlg.getByRole('group', { name: 'Valid for start date time' }).isVisible()
  && await dlg.getByRole('group', { name: 'Valid for end date time' }).isVisible());
check('single relation is an async LOV picker', await dlg.getByRole('group', { name: 'Service level agreement' }).getByRole('combobox').isVisible());

await dlg.getByLabel('Name', { exact: true }).fill('Fibre 1G');
await dlg.getByLabel('Lifecycle status', { exact: true }).fill('Active');
await pickDay(dlg, 'Last update (required)', 15);
const validStart = await pickDay(dlg, 'Valid for start date time', 1);
check('validFor start shows the picked day', /\b1, \d{4}/.test(validStart), validStart);
const sla = await pickRef(dlg, 'Service level agreement');

// characteristic: numbers + a nested value list
await dlg.getByRole('button', { name: 'Add product offering characteristic' }).click();
const charItem = dlg.getByRole('group', { name: 'Product offering characteristic 1' });
await charItem.getByLabel('Min cardinality 1', { exact: true }).fill('abc');
await charItem.getByLabel('Max cardinality 1', { exact: true }).fill('3');
const valueList = charItem.getByRole('group', { name: 'Characteristic value specifications' });
await valueList.getByRole('button', { name: 'Add characteristic value specification' }).click();
await valueList.getByLabel('Value from 1', { exact: true }).fill('10');

// bundled group: a nested list holding a JSON attribute
await dlg.getByRole('button', { name: 'Add bundled group product offering' }).first().click();
const bundle = dlg.getByRole('group', { name: 'Bundled group product offering 1' }).first();
await bundle.getByRole('textbox', { name: 'Bundled group product offering 1 name' }).first().fill('Gold bundle');
const innerList = bundle.getByRole('group', { name: 'Bundled group product offerings' });
await innerList.getByRole('button', { name: 'Add bundled group product offering' }).click();
await innerList.getByRole('textbox', { name: 'Bundled group product offering 1 name' }).fill('Inner');
const json = innerList.getByLabel('Bundled product offering 1', { exact: true });
await json.fill('[{"id": "bpo-1"}'); // a JSON list (refs nested deeper than one list level)

await dlg.getByRole('button', { name: 'Create product offering' }).click();
await page.waitForTimeout(300);
check('number rule: "Enter a number."', await charItem.getByText('Enter a number.').isVisible());
check('JSON rule: invalid JSON reported', await innerList.getByText(/Enter valid JSON: a list/).isVisible());
check('no request while invalid', bodies.POST.length === 0);

await charItem.getByLabel('Min cardinality 1', { exact: true }).fill('1');
await json.fill('[{"id": "bpo-1"}]');
await dlg.getByRole('button', { name: 'Create product offering' }).click();
await page.getByText('Product offering created successfully').waitFor({ timeout: 5000 }).catch(() => {});
const body = bodies.POST.at(-1) ?? {};
const ch = body.productOfferingCharacteristic?.[0];
check('payload: numbers are JSON numbers', ch?.minCardinality === 1 && ch?.maxCardinality === 3, JSON.stringify(ch));
check('payload: nested list inside the characteristic', ch?.characteristicValueSpecification?.[0]?.valueFrom === 10
  && ch.characteristicValueSpecification[0]['@type'] === 'CharacteristicValueSpecification', JSON.stringify(ch?.characteristicValueSpecification));
check('payload: validFor = { startDateTime } only, ISO 8601', !!body.validFor?.startDateTime && /Z$/.test(body.validFor.startDateTime) && !('endDateTime' in body.validFor), JSON.stringify(body.validFor));
check('payload: single ref from the LOV (@type / @referredType, no href)', body.serviceLevelAgreement?.name === sla
  && body.serviceLevelAgreement['@type'] === 'SLARef' && body.serviceLevelAgreement['@referredType'] === 'SLA' && !('href' in body.serviceLevelAgreement), JSON.stringify(body.serviceLevelAgreement));
const inner = body.bundledGroupProductOffering?.[0]?.bundledGroupProductOffering?.[0];
check('payload: JSON attribute sent parsed', JSON.stringify(inner?.bundledProductOffering) === '[{"id":"bpo-1"}]', JSON.stringify(inner));
check('create succeeds (dialog closed, toast)', await dlg.count() === 0 && await page.getByText('Product offering created successfully').isVisible());

// ── edit: everything prefilled, only the changed list is PATCHed ──
await page.locator('.lt-table tbody tr').filter({ hasText: 'Fibre 1G' }).first().click();
await page.locator('.dt-header__title').waitFor();
await page.locator('.dt-header__actions').getByRole('button', { name: 'Edit' }).click();
await dlg.waitFor();
const startTrigger = dlg.getByRole('group', { name: 'Valid for start date time' }).locator('button[aria-haspopup="dialog"]');
check('edit: validFor prefilled', /\b1, \d{4}/.test(await startTrigger.innerText()), await startTrigger.innerText());
check('edit: single ref prefilled', (await dlg.getByRole('group', { name: 'Service level agreement' }).getByRole('combobox').inputValue()) === sla);
const eChar = dlg.getByRole('group', { name: 'Product offering characteristic 1' });
check('edit: numbers prefilled as text', (await eChar.getByLabel('Min cardinality 1', { exact: true }).inputValue()) === '1');
check('edit: nested list prefilled', (await eChar.getByRole('group', { name: 'Characteristic value specifications' }).getByLabel('Value from 1', { exact: true }).inputValue()) === '10');
const eJson = dlg.getByRole('group', { name: 'Bundled group product offerings' }).getByLabel('Bundled product offering 1', { exact: true });
check('edit: JSON pretty-printed', (await eJson.inputValue()).includes('"id": "bpo-1"'), await eJson.inputValue());
await eChar.getByLabel('Max cardinality 1', { exact: true }).fill('5');
await dlg.getByRole('button', { name: 'Save changes' }).click();
await page.getByText('Product offering updated successfully').waitFor({ timeout: 5000 }).catch(() => {});
const patch = bodies.PATCH.at(-1) ?? {};
check('PATCH: only the changed list, maxCardinality now 5', JSON.stringify(Object.keys(patch)) === '["productOfferingCharacteristic"]'
  && patch.productOfferingCharacteristic[0].maxCardinality === 5 && patch.productOfferingCharacteristic[0].characteristicValueSpecification[0].valueFrom === 10, JSON.stringify(patch).slice(0, 200));

// ── Category: a single relation to another category (parent) ──
await page.goto(`${BASE}/category`);
await page.getByRole('button', { name: 'New Category' }).click();
await dlg.waitFor();
await page.waitForTimeout(500);
await dlg.getByLabel('Name', { exact: true }).fill('Broadband');
const parent = await pickRef(dlg, 'Parent');
await dlg.getByRole('button', { name: 'Create category' }).click();
await page.getByText('Category created successfully').waitFor({ timeout: 5000 }).catch(() => {});
const cat = bodies.POST.at(-1) ?? {};
check('Category.parent: CategoryRef from the LOV', cat.parent?.name === parent && cat.parent['@type'] === 'CategoryRef' && cat.parent['@referredType'] === 'Category', JSON.stringify(cat.parent));
check('optional value object left empty is not sent', !('validFor' in cat), JSON.stringify(cat).slice(0, 160));

check('console clean', logs.length === 0, logs.join(' | '));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
