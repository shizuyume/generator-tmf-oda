// E2E: Overview (TMF API + frontend modules) and relation lookups that fail gracefully.
// Needs `npm run dev:mock` on :4010 (fresh start = 12 algorithms). Playwright comes from
// generator/node_modules. Screenshots land in e2e/screenshots/ (git-ignored).
//
//   node e2e/overview-lookups.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '..', '..', '..', 'generator', 'package.json'));
const { chromium } = require('@playwright/test');

const BASE = process.env.LAB_URL ?? 'http://localhost:4010';
const OUT = path.join(here, 'screenshots');
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(m.text()); });
await page.addInitScript(() => localStorage.setItem('neudela-lab:theme', 'light'));

// ── Overview ──
await page.goto(`${BASE}/`);
await page.getByRole('heading', { level: 1, name: 'Revenue Sharing Algorithm Management' }).waitFor();
await page.getByText('Live, from X-Total-Count').waitFor({ timeout: 5000 }).catch(() => {});
check('hero: TMF number + version', await page.getByText('TMF736 · Open API v5.0.0').isVisible());
check('hero: OAS description', await page.getByText('API goal is to provide the Algorithm to calculate a revenue share').isVisible());
const kpis = page.locator('.lab-kpi-grid > *');
check('4 KPI cards', await kpis.count() === 4);
const live = (await kpis.nth(3).innerText()).replace(/\s+/g, ' ');
check('live total from X-Total-Count', /Algorithms \d+ Live, from X-Total-Count/.test(live), live);
const opsCard = page.locator('section.dt-card', { has: page.getByRole('heading', { name: 'API operations' }) });
check('operations table: 9 rows (5 resource, 2 hub in the OAS, GET /hub + GET /hub/{id} from the generated backend)', await opsCard.locator('tbody tr').count() === 9);
check('GET /hub and GET /hub/{id} flagged "Not in spec"', await opsCard.getByText('Not in spec').count() === 2);
const events = page.locator('section.dt-card', { has: page.getByRole('heading', { name: 'Notification events' }) });
check('4 notification events', await events.locator('.dt-erow').count() === 4);
const modules = page.locator('section.dt-card', { has: page.getByRole('heading', { name: 'Frontend modules' }) });
check('2 MFE modules', await modules.locator('.dt-erow').count() === 2
  && await modules.getByText('./PartyRevSharingAlgorithm').isVisible() && await modules.getByText('./Hub').isVisible());
const lookups = page.locator('section.dt-card', { has: page.getByRole('heading', { name: 'External lookups' }) });
check('4 external lookups, configured in mock mode', await lookups.locator('tbody tr').count() === 4
  && await lookups.getByText('Configured', { exact: true }).count() === 4);
await page.screenshot({ path: path.join(OUT, 'overview-light.png'), fullPage: true });

await page.getByRole('button', { name: 'Open Revenue Sharing Algorithms' }).first().click();
const listHeading = page.getByRole('heading', { level: 1, name: 'Party Revenue Sharing Algorithms' });
await listHeading.waitFor({ timeout: 5000 }).catch(() => {});
check('hero action opens the list', await listHeading.isVisible());

// ── Lookup service down → friendly message, form still usable ──
await page.route('**/mock-policy-api/**', (route) => route.abort('connectionrefused'));
const expectedOutage = logs.length; // the aborted lookups log ERR_CONNECTION_REFUSED by design
await page.reload();
await page.getByRole('button', { name: 'New Algorithm' }).click();
const dlg = page.locator('.fm-dialog');
await dlg.waitFor();
await dlg.getByText("Couldn't load policies — the Policy Management service is unavailable. Reopen the form to try again.").waitFor({ timeout: 5000 }).catch(() => {});
check('policy picker explains the outage', await dlg.getByText("Couldn't load policies — the Policy Management service is unavailable.", { exact: false }).isVisible());
check('form still opens (name field usable)', await dlg.getByLabel('Name', { exact: true }).isEditable());
await page.waitForTimeout(500); // modal open animation
await page.screenshot({ path: path.join(OUT, 'lookup-unavailable.png') });

// service back → reopening retries
await page.unroute('**/mock-policy-api/**');
logs.splice(expectedOutage); // drop the simulated-outage errors, keep anything else
await dlg.getByRole('button', { name: 'Cancel' }).click();
await page.getByRole('button', { name: 'New Algorithm' }).click();
await dlg.waitFor();
await dlg.getByRole('group', { name: 'Policy (required)' }).locator('.neuron-dropdown__trigger').click();
const opt = page.getByRole('option', { name: /Roaming Settlement/ }).first();
await opt.waitFor({ timeout: 5000 }).catch(() => {});
check('reopening the form retries the lookup', await opt.isVisible());
await page.keyboard.press('Escape');

// ── dark overview ──
await page.goto(`${BASE}/`);
await page.getByText('Dark mode').click();
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(OUT, 'overview-dark.png'), fullPage: true });

check('console clean', logs.length === 0, logs.join(' | '));
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
