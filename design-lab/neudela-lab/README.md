# neudela-lab

design-lab prototype: the TMF736 Revenue Sharing Algorithm pages of
`design-lab/revenue-sharing-algorithm` rebuilt on the [neudela](https://www.npmjs.com/package/neudela)
design system (pinned `0.2.0`), to settle list / form / detail patterns before
the generator's neudela adapter generates them.

Differences from `revenue-sharing-algorithm`: Vite instead of CRA + craco, neudela instead of
`common_remote` + MUI, and a full app that is also a Module Federation remote.

## Mode: full app + Module Federation remote

The lab runs as one standalone app with its own shell (topbar, sidebar, routing, dark mode), with no
host and no `common_remote` to start — and it is a federation remote at the same time:

- `vite.config.ts` → `@module-federation/vite`: remote `neudela_lab`, `remoteEntry.js` + `mf-manifest.json`,
  exposes `./PartyRevSharingAlgorithm` and `./Hub`, shares react / react-dom / neudela as singletons
- `src/index.tsx` → `import('./bootstrap')` async boundary (where the runtime negotiates the shares)
- `src/exposes/*` → pages wrapped by `src/federation/createProtectedPage.tsx` (lazy + error boundary),
  which also imports the styles a page needs when a host mounts it
- pages stay router-agnostic (list ↔ detail is local state, as in the reference)

`node e2e/mfe-host.mjs` proves it: a separate Vite host (`e2e/mfe-host`, its own shell) reads the
remote's manifest, mounts every expose, and checks the shared singletons, list, dialog and record page.
Watch for: neudela's `:root` tokens and `.dark-theme` palette apply to the whole host page, and a
webpack host needs the module-federation enhanced plugin (remoteEntry is an ES module).

## Run

```bash
npm install
npm run dev:mock   # http://localhost:4010 — in-memory TMF736 + policy lookup (mock/tmf736MockApi.ts), no backend
npm run dev        # proxies /tmf-api to the TMF736 backend (API_PROXY_TARGET, default http://localhost:3736)
npm run build      # typecheck (app + config/mock) then vite build — vite alone does not typecheck
npm run preview
```

Env vars: see `.env.example` (`VITE_API_BASE_URL`, `API_PROXY_TARGET`, `VITE_API_KEY`,
`VITE_POLICY_API_BASE_URL`). `.env.mock` points the policy lookup at the mock. The mock resets on restart.

The relation pickers call the API that owns the referenced entity directly —
`{VITE_POLICY_API_BASE_URL}/tmf-api/policyManagement/v5/{policy|policyCondition|policyAction|policyVariable}?name=…&limit=20`
(declared per relation in `src/service/policyLookupService.ts`). When the base URL is unset or the
service is down, the picker says so under the field (e.g. "Couldn't load policies — the Policy
Management service is unavailable.") and the form still opens; reopening the form retries.

## Structure

This lab is exactly what the generator's neudela adapter writes for TMF736
(`tmfgen fe-spec --ui neudela` + `golden/fe-spec/neudela-tmf736.overrides.yaml`, then
`fe-gen scaffold`); `generator/tools/fe-neudela-golden.mjs` proves it file for file.

```
neudela-lab/
├── neudela-fe-template.yaml   # source of truth: template (fixed) + app (TMF736) — see the generator README
├── index.html, package.json, vite.config.ts, .env.*        # per app (generated from the app block)
├── mock/mockApi.ts            # dev:mock engine (fixed) — data in mock/seed.ts (per app)
├── e2e/                       # lab-full.mjs (all pages + pixel baseline), overview-lookups.mjs
└── src/
    ├── index.tsx / bootstrap.tsx / App.tsx / *.css   # shell + styles (fixed)
    ├── resource/              # generic list / form / detail / hub runtime, driven by ResourceConfig data
    ├── components/            # list-table, detail, form, Toast (fixed)
    ├── service/               # API client, resourceService, lookupService (fixed)
    ├── pages/overview/        # home layout (fixed); its data is src/app/summary.ts
    ├── pages/<page>/          # config.ts (per app: the page as data) + index.tsx
    ├── app/                   # per app: env, services, lookups (LOV → owning TMF API), shell (brand + nav), summary, icons, theme.css
    ├── exposes/               # MFE seams (createProtectedPage), per app
    └── types/                 # TypeScript types from app.schemas, per app
```

Change a fixed file here, then run `node generator/tools/neudela-yaml-sync.mjs --write` to copy it
into `generator/templates/fe-neudela` and `node generator/tools/fe-neudela-golden.mjs --update`.

## UI/UX redesign (in stages)

Reference: Claude Design project "Neudela design system files" → `Neudela Logistics Dashboard.dc.html`.
Only the UI follows the design; content and data stay TMF736.

1. **List table** (done): `src/components/list-table/` is the design's "Work queue" card built on
   neudela, used by the algorithm list and the event hub. It has:
   - a header with a count chip;
   - a toolbar: Filter, a Sort By menu, Refresh, search and the primary action;
   - an advanced filter: any number of conditions, one per column — text "contains", date
     range via NeuronDatePicker — applied together and shown as removable chips with Clear all.
     The search box and the conditions go out as TMF630 JSONPath `filter=` params
     (`$[?(@.name=~/video/i && @.lastUpdate>='…')]`, `policy[?(@.name=~/roaming/i)]`; all ANDed),
     sort as `sort=-field` — the grammar of the generated backend's `common/filter`, which
     `dev:mock` evaluates the same way;
   - NeuronTable with a leading "No" column (1., 2., … continuing across pages), sortable headers,
     the mono id link, two-line cells and sticky row actions — `buttonActionVariant` picks
     `"inline"` icon buttons or a `"menu"` ⋯ trigger (the list pages use `"menu"`) (row selection + a bulk action remain
     available in `ListTable` via `bulkAction`, but the pages use row numbers instead);
   - a footer with a styled rows-per-page listbox (opens upward), "1–10 of N", page numbers and Previous/Next;
   - empty, no-match and error (Try again) states, and a card list below 768px.

   Pages keep the data and call the API; `ListTable` only lays it out. Give every column a `width`
   except one flexible text column, because the table uses a fixed layout. Pages are fluid
   (no max-width), so at a small browser zoom the card spans the content area edge to edge.

2. **Detail page** (done): `src/components/detail/` follows the design's shipment detail.
   - The header has a breadcrumb ending in the record id, the title with a copyable mono id, the
     description, and "Back to list".
   - Underlined tabs with icon + count, as a real WAI-ARIA tablist.
   - **Overview:** a stat strip (policies / conditions / actions / last update, each opens its tab),
     a "Sharing rule" card reading the variables as *When condition · variable = value → Then
     action · variable = value*, policy rows, a date timeline and the "Record" identifiers.
   - Every TMF736 v5 OAS attribute is mapped: entity cards also show the nested refs' id / href /
     @type / @referredType / @baseType / @schemaLocation and each variable entry's own id / href /
     @type (types aligned with the OAS).
   - **List tabs:** search, a card/table toggle, entity cards for policies, numbered tables for
     variables. Policies default to cards, variables to a table.
   - Loading skeleton.

   Same TMF736 fields as before.

3. **Create form** (done): `src/components/form/FormDialog.tsx` follows the design's "Create
   shipment" dialog — no ✕ (Cancel closes), pinned header/footer, scrolling body, error summary,
   numbered repeatable cards, dashed "+ Add". Fields follow `PartyRevSharingAlgorithm_FVO`: name,
   description, policy[] / conditionVariable[] / actionVariable[] whose references are LOV picks
   only; id, href and `@`-attributes are never typed (the payload sets `@type` / `@referredType`,
   the backend sets id and href). Also used by the Event Hub dialog (`Hub_FVO`).
   Dark mode: the theme class and `color-scheme` are also on `<html>`, so page scrollbars follow it.

4. **Overview** (done): the home page summarises the TMF API and this frontend, all from data a
   generator has (IR + OAS `info` + exposes + lookups, in `src/pages/overview/apiSummary.ts`):
   API hero (TMF number, version, description, base path, auth, notifications), KPIs (resources,
   operations, events, live total from `X-Total-Count`), a card per resource (paths, required on
   create, embedded lists), the operations table (`GET /hub` and `GET /hub/{id}` — served by the
   generated backend — are flagged "Not in spec"),
   notification events, frontend modules (MFE exposes) and external lookups with their status.

5. **Edit form** (done): Edit on the record header and in the row menu opens the same dialog with
   the record (`_MVO` fields only, prefilled by reversing the payload spec); PATCH carries only the
   attributes that changed (cleared → null, a list → the whole list), never `@type`; an unchanged
   save makes no request. `e2e/edit-form.mjs`.

6. **Relation picker** (done): `src/components/form/LookupPicker.tsx` — NeuronDropdown's look, but an
   async-search combobox: typing queries the owning API (so entities past the first page are
   reachable), debounced, stale responses dropped, keyboard + ARIA. `e2e/lookup-search.mjs`.

7. **Event Hub record** (done): a row opens the subscription (`GET /hub/{id}`); the create payload
   sends `"@type": "Hub"`. `e2e/hub-detail.mjs`.

8. **More form controls** (in the runtime, exercised on generated apps): number, JSON (object / list),
   a single relation (top-level LOV), a value object as a group (TimePeriod, Money…), and one level of
   list inside a list item. **Nested resources** (`/parent/{id}/child`) get a tab on the parent's
   record page (the full list, live from their own path) and their own record page.

## Design notes → generator

How every common_remote / MUI pattern of `design-lab/revenue-sharing-algorithm` maps onto neudela
0.2.0 (this used to be `src/pages/overview/coverage.ts`, rendered on the old Overview page):

| Pattern (common_remote / MUI) | Neudela 0.2.0 | Status | Note |
|---|---|---|---|
| Breadcrumbs | `NeuronBreadcrumb` | native | items[] with onClick per crumb. |
| Button | `NeuronButton` | native | variant="danger" for destructive actions. No default type — pass type="button" inside forms. |
| IconButton | `NeuronButton iconOnly` | native | Icon goes in children; always give it an aria-label. |
| DataGrid (server mode) | `NeuronTable inside components/list-table` | workaround | NeuronTable keeps the table (selection, sortable headers, sticky actions, skeleton). Its toolbar re-filters the current page client-side and its pagination has no "1–10 of N", so toolbar, filter panel, footer and empty/error states are composed around it. Controlled sort is still re-applied per page: keep raw values in rows. Fixed table layout with one flexible column, else a nowrap cell slides under the sticky Actions column. |
| DataGrid column filter (advanced) | `list-table filter panel + chips` | workaround | NeuronTable only renders a Filter button. The panel builds any number of conditions (one per column): text → "contains", date → NeuronDatePicker range. Apply sends them in one request (TMF630 JSONPath `filter=`: text `=~ /x/i`, date `>=`/`<=`, list fields `policy[?(…)]`); applied conditions show as removable chips with Clear all. |
| Date range filter | `NeuronDatePicker mode="range" trigger="popover"` | native | Presets + its own Cancel/Apply. Rendered inline (neudela never portals), so the list card has no overflow:hidden and the panel sits above the sticky table cells. |
| Removable filter chip | `own chip (not NeuronBadge onClose)` | gap | NeuronBadge onClose renders a span[role=button] labelled "Remove badge" on every chip; chips use their own button with "Remove filter: …". |
| Row number column | `NeuronTable column render(value, row, index)` | native | A leading "No" column (1., 2., …) from the page-relative index plus page × pageSize, so numbering continues across pages; mobile cards lead with the same number. Replaces the selection checkboxes (ListTable still supports selection + a bulk action when a page passes bulkAction). |
| Rows per page | `own listbox (ListTablePageSize)` | gap | NeuronTable's rows-per-page is a native <select> whose option list the OS draws unstyled; NeuronDropdown opens downward in a full form-field frame and NeuronDropdownMenu radio items expose no selected state. The footer uses a small listbox (opens upward, check on the current size, arrow/Home/End/Enter/Escape). |
| Row actions menu (⋯) | `own ListTableRowMenu (portal)` | workaround | ListTable buttonActionVariant: "inline" (icon buttons) or "menu" (one ⋯ trigger). NeuronDropdownMenu renders inline and NeuronTable's wrapper scrolls (overflow-x:auto clips vertically), so the menu is portalled to <body>, fixed to its trigger, flips up near the viewport bottom; ↑/↓/Home/End/Escape/Tab, outside click and scroll close it. |
| Sort menu | `NeuronDropdownMenu` | workaround | The trigger slot is a <div> with no role or tabindex, so the trigger must be a NeuronButton. Radio items render as role="menuitem" without aria-checked; the trigger label states the active sort. |
| Search with clear button | `NeuronInput trailingIcon` | workaround | Icon slots are pointer-events: none, so an interactive trailing button needs pointer-events re-enabled (ListTable.css). |
| Dialog (form) | `NeuronModal + own FormDialog (components/form)` | workaround | NeuronModal tops out at 448px and never scrolls. FormDialog widens it (760 / 520px), pins title + footer and scrolls the body; no ✕ (showCloseButton=false) — Cancel / Escape close; footer = Cancel + primary at equal width; error summary ("N fields need attention", focused on a failed submit); repeatable groups as numbered cards with a dashed "+ Add" button. Relations are LOV pickers only — no id / UUID / href inputs. |
| Dialog (confirm) | `NeuronModal variant="danger"` | native | Pass a custom footer: the default footer always renders a primary confirm button. |
| TextField | `NeuronInput` | native | state="error" + helperText for inline validation. |
| TextField multiline | `NeuronTextArea` | native | autoResize with minRows / maxRows. The only field whose <label> is tied to its control (for/id). |
| Field labelling (a11y) | `NeuronInput, NeuronDropdown` | workaround | Both render a <label> without for/id and never set aria-required. NeuronInput passes extra props to <input>, so aria-label/aria-required are added there; NeuronDropdown takes no aria props, so a role="group" wrapper carries the name. |
| Autocomplete (async relation search) | `NeuronDropdown searchable` | workaround | Filters the options loaded up front only — no onSearch or loading props, so server-side search is not possible. |
| Snackbar | `components/Toast.tsx (NeuronAlert)` | gap | No toast primitive; a NeuronAlert is pinned bottom-right and auto-hides. |
| PillTabs (record sections) | `own DetailTabs (components/detail)` | gap | No Tabs primitive. The first stand-in (NeuronButtonGroup type="radio") had radiogroup semantics and a pill track that vanished on the slate-50 canvas; the record page now uses underlined tabs with icon + count pill as a real WAI-ARIA tablist (roving tabindex, ←/→/Home/End). |
| Record header | `NeuronBreadcrumb + own DetailHeader` | workaround | Breadcrumb ends in the record id (mono via CSS on aria-current), title + copyable mono id (clipboard + live-region "Copied"), summary line, actions on the right. |
| Detail fields / referenced entities | `own DetailCard, KeyValueList, EntityCard (+ NeuronTable)` | gap | Card with title + count chip + header actions; label ⟷ value rows ("Key dates", "Record"); entity cards for references (design "Parties"); embedded lists as numbered NeuronTable with client-side search. No card-section or description-list primitive in neudela. |
| ToggleButtonGroup (card / table) | `NeuronButtonGroup type="radio" iconOnly` | native | ariaLabel per option. |
| Chip (status) | `NeuronBadge` | native | Always with a text label (dot + text), never colour alone. |
| Responsive layout | `neudela/style.css` | gap | The stylesheet has no media queries; e.g. the NeuronTable toolbar clips its actions below ~480px. Mobile rules live in App.css / ListTable.css, and below 768px the list card swaps the table for a card list. |
| Typography / Box / Stack | `HTML + tokens (App.css)` | gap | No text or layout primitives; pages use lab-* classes over neudela CSS variables. |

Primitives used: `NeuronAlert`, `NeuronBadge`, `NeuronBreadcrumb`, `NeuronButton`, `NeuronButtonGroup`, `NeuronCard`, `NeuronCheckbox`, `NeuronDatePicker`, `NeuronDropdown`, `NeuronDropdownMenu`, `NeuronInput`, `NeuronModal`, `NeuronTable`, `NeuronTextArea`, `NeuronToggle`.

Main findings:

- **NeuronModal** tops out at 448px and never scrolls → `FormDialog` widens it (760 / 520px) and
  scrolls the body; its default footer always renders a primary confirm → destructive confirms
  pass a custom footer.
- **NeuronTable** server mode: controlled search and sort are still re-applied to the current page
  → keep raw values in rows; toolbar and pagination are built outside it (`src/components/list-table`).
- **NeuronDropdown**: no async search / loading / warning state; its `<label>` is not tied to the
  trigger. **NeuronInput** has the same labelling gap (fixed with `aria-label`).
- Popovers render inline (no portal) → containers must not clip them; the row menu is portalled.
- No Tabs, Toast, Typography or layout primitives, and no media queries in `neudela/style.css`.

The whole template (theme, layout, components, styles, API contract) is recorded in
`neudela-fe-template.yaml`, the source of truth of the generator's neudela adapter.
