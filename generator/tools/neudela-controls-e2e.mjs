#!/usr/bin/env node
/**
 * E2E of the neudela form controls for date, enum and boolean attributes, on a generated
 * TMF642 (Alarm) app served by `vite --mode mock` (run by tools/fe-neudela-build.mjs --e2e).
 *
 *   node tools/neudela-controls-e2e.mjs <baseUrl>
 *
 * Checks: required enum / date / single-ref errors in the summary; the enum dropdown and the date picker
 * fill the form; one checkbox group; a required id without a *Ref (sourceSystemId) is a typed
 * field with a helper text (field policy); the POST body carries the OAS enum value, an ISO 8601
 * date (start of the local day) and `true` for the checked box only; the create succeeds; the
 * record page shows enum labels, a formatted date and Yes / No.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', 'package.json'));
const { chromium } = require('@playwright/test');
const BASE = process.argv[2] ?? 'http://localhost:4913';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('alarm-portal:theme', 'light'));

await page.goto(`${BASE}/alarm`);
await page.getByRole('button', { name: 'New Alarm' }).click();
const dlg = page.locator('.fm-dialog');
await dlg.waitFor();

check('short fields share two-column grids', await dlg.locator('.fm-grid--2').count() >= 1);
check('checkboxes share one group', await dlg.locator('.fm-checks').count() === 1 && await dlg.locator('.fm-checks .neuron-checkbox-wrapper, .fm-checks label').count() >= 3);

check('typed id shows the field-policy helper text', await dlg.getByText('Identifier in the source system — type it as it appears there.').first().isVisible());

await dlg.getByRole('button', { name: 'Create alarm' }).click();
await page.waitForTimeout(300);
const summary = (await dlg.locator('.fm-summary').innerText().catch(() => '')).replace(/\s+/g, ' ');
check('required enum + date + text + typed id + single ref reported', /7 fields need attention/.test(summary), summary);
const sourceId = dlg.getByLabel('Source system ID', { exact: true });
check('typed id (field policy): required text input', await sourceId.isVisible() && await dlg.getByText('Enter a source system ID.').isVisible());
check('date error shown', await dlg.getByText('Select an alarm raised time.').isVisible());
check('enum error shown', await dlg.getByText('Select an alarm type.').isVisible());

const pick = async (group, option) => {
  await dlg.getByRole('group', { name: group }).locator('.neuron-dropdown__trigger').click();
  await page.getByRole('option', { name: option, exact: true }).first().click();
};
await pick('State (required)', 'Raised');
await pick('Alarm type (required)', 'Quality of service alarm');
await pick('Perceived severity (required)', 'Major');
await dlg.getByLabel('Probable cause', { exact: true }).fill('Link down');
await sourceId.fill('ems-7');
// the OAS requires alarmedObject: a single relation, picked from its lookup
const objBox = dlg.getByRole('group', { name: 'Alarmed object (required)' }).getByRole('combobox');
await objBox.click();
await page.getByRole('option').first().click();
await dlg.getByRole('group', { name: 'Alarm raised time (required)' }).locator('button').first().click();
await page.locator('.neuron-datepicker-day:not(.neuron-datepicker-day--muted)', { hasText: /^15$/ }).first().click();
await page.waitForTimeout(200);
const dateTrigger = dlg.getByRole('group', { name: 'Alarm raised time (required)' }).locator('button[aria-haspopup="dialog"]');
if ((await dateTrigger.getAttribute('aria-expanded')) === 'true') await dateTrigger.click(); // close the popover if it stayed open
check('date picker shows the picked day', /15, \d{4}/.test(await dateTrigger.innerText()), await dateTrigger.innerText());
await dlg.getByText('Alarm escalation', { exact: true }).click();
await page.waitForTimeout(200);
check('summary clears once filled', await dlg.locator('.fm-summary').count() === 0);

let body = null;
page.on('request', (r) => { if (r.method() === 'POST' && r.url().includes('/alarm')) body = r.postDataJSON(); });
await dlg.getByRole('button', { name: 'Create alarm' }).click();
await page.waitForTimeout(800);
const raised = body?.alarmRaisedTime ? new Date(body.alarmRaisedTime) : null;
check('payload: enum values from the OAS', body?.state === 'raised' && body?.alarmType === 'qualityOfServiceAlarm' && body?.perceivedSeverity === 'major', JSON.stringify(body));
check('payload: date = ISO 8601, start of the local 15th', !!raised && raised.getDate() === 15 && raised.getHours() === 0 && /Z$/.test(body.alarmRaisedTime));
check('payload: checked box true, unchecked boxes omitted', body?.alarmEscalation === true && !('isRootCause' in (body ?? {})) && !('serviceAffecting' in (body ?? {})));
check('payload: typed id sent as text', body?.sourceSystemId === 'ems-7');
check('payload: required single ref from the LOV', !!body?.alarmedObject?.id && !('href' in (body?.alarmedObject ?? {})), JSON.stringify(body?.alarmedObject));
await page.getByText('Alarm created successfully').waitFor({ timeout: 5000 }).catch(() => {});
check('create succeeds (dialog closed, toast)', await dlg.count() === 0 && await page.getByText('Alarm created successfully').isVisible());

// record page: a record with booleans, created through the API
await page.evaluate(async (base) => {
  await fetch(`${base}/tmf-api/alarm/v5/alarm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      '@type': 'Alarm', state: 'raised', alarmType: 'processingErrorAlarm', perceivedSeverity: 'critical', probableCause: 'Fan failure',
      sourceSystemId: 'ems-2', alarmRaisedTime: '2026-10-01T00:00:00.000Z', alarmEscalation: true, isRootCause: false,
    }),
  });
}, BASE);
await page.reload();
await page.getByRole('textbox', { name: 'Search records in table' }).waitFor();
await page.waitForTimeout(800);
await page.locator('.lt-table tbody tr').first().click();
await page.locator('.dt-header__title').waitFor();
const record = (await page.locator('.dt-kv').last().innerText()).split('\n').join(' | ');
check('record: enum labels', /Alarm type \| Processing error alarm/.test(record) && /Perceived severity \| Critical/.test(record), record.slice(0, 160));
check('record: Yes / No', /Alarm escalation \| Yes/.test(record) && /Is root cause \| No/.test(record));
check('record: formatted date', /Alarm raised time \| [A-Z][a-z]{2} \d{1,2}, 2026/.test(record));
check('console clean', logs.length === 0, logs.join(' | '));

console.log(`${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
