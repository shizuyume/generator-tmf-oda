# fe-default re-skin: Tailwind v4 and a semantic token layer

Status: approved design, not yet implemented
Date: 2026-09-18

## Problem

`fe-default` is the generator's own React + TypeScript + Tailwind adapter — the
one that does not depend on a private component library. It works, but its
visual layer was ported once from a single hand-written HTML demo
(`example-component-in-dashboard.html`) and has not moved since. Three things
follow from that:

1. **The token vocabulary is ad hoc.** Classes read `bg-app-surface`,
   `text-text-primary`, `border-border-strong`. Those names exist nowhere
   outside this adapter, so nothing can be checked against an external
   standard and nobody arriving from a normal Tailwind/shadcn codebase
   recognises them.

2. **It is Tailwind v3.4.** The theme is a `tailwind.config.js` that maps names
   onto CSS variables, and dark mode is an attribute selector
   (`[data-theme="dark"]`). Tailwind v4 moved theming into CSS
   (`@theme inline`) and that is now the shape every current reference
   assumes.

3. **`ui.theme.name` is dead.** Every spec in the repo writes
   `ui.theme.name: indigo`; `fe-default` ignores it entirely and renders
   terracotta. Golden proves this — `frontend-spec-tmf736-fe-default.yaml`
   says `indigo` and `golden/fe/fe-default-full` is orange.

The target is an internal portal UI/UX guideline (master spec at
`C:\REPO-TELIN\revamp-portal\TELIN-PORTAL-UI-UX-GUIDELINE.md`, broken out under
`TELIN-UI-UX/`). It specifies an OKLCH colour system, a semantic token layer,
Instrument Sans + JetBrains Mono, a 14px type scale, a 6-step radius scale, a
6-tier shadow scale with dark-mode suppression, and a density scale. Its
`reference/reference-tailwind-v4.md` is a verified forbidden-vs-approved table
for v4 syntax, and it binds this work.

## Scope: what actually has to change

Measured, not estimated. Token-bearing Tailwind classes:

| Location | Occurrences |
|---|---|
| `generator/templates/fe-default/src/components/*.tsx` (36 files) | ~200 |
| `generator/libs/fe-default.adapter.js` + all of `generator/src/fe/**` | **4** |

The styling lives in static template files that the scaffold copies verbatim.
The emitters barely participate. This is a template-and-CSS change, not an
emitter rewrite — which is why it is tractable at all.

`generator/templates/fe-default/` holds 62 files. The ones this touches:
`package.json.template`, `postcss.config.js`, `craco.config.js`,
`public/index.html`, `src/gen/app.css`, `src/gen/tokens.css`,
`src/gen/theme.ts`, `src/gen/uiwrappers.tsx`, `src/gen/StandardList.tsx`,
`src/gen/StandardFormModal.tsx`, `src/pages/Home.tsx`, and the 36 components.
`tailwind.config.js` is deleted.

## Design

### 1. CSS architecture

Today:

```
@tailwind base; @tailwind components; @tailwind utilities;
tailwind.config.js  →  theme.extend.colors.app.brand = 'var(--bg-brand)'
darkMode: ['selector', '[data-theme="dark"]']
theme.ts            →  injects a <style id="gen-theme"> at runtime
```

After, following `reference-tailwind-v4.md` exactly:

```css
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

:root { --background: …; --foreground: …; --primary: …; /* plain vars */ }
.dark { --background: …; --foreground: …; --primary: …; }

@theme inline {                      /* var() references, never literals */
  --color-background: var(--background);
  --color-primary:    var(--primary);
  …
}
```

The `@theme inline` indirection is not stylistic. If literal values went into
`@theme`, Tailwind would resolve them at build time and the `.dark` overrides
would never reach the utilities — dark mode would silently do nothing. The
guideline calls this out and so does the Tailwind v4 documentation.

Consequences:

- `tailwind.config.js` is deleted. v4 discovers content automatically.
- `autoprefixer` is dropped from `package.json`; v4 includes it.
- `postcss.config.js` loads `@tailwindcss/postcss` instead of `tailwindcss`.
- Dark mode switches from the `data-theme="dark"` attribute to the `.dark`
  class. `theme.ts` and `themeModeContext.ts` toggle a class instead.

**Browser support moves.** Tailwind v4 requires Safari 16.4+, Chrome 111+,
Firefox 128+. Every app the generator emits inherits that floor. This is a real
cost of the change, not a footnote.

**The one unproven assumption.** Nobody in this repo has built CRA5 + CRACO
against Tailwind v4. That is the first implementation step and it gates
everything after it: if the toolchain does not build, the rest of this design
is void and we reconsider rather than work around it.

### 2. Token source and the `crimson` preset

The guideline's brand ramp is a specific organisation's red. `tmfgen` generates
services for 130 TM Forum components for whoever runs it; shipping that red as
the default would brand every generated app as that organisation's. So:

- **Structure is the default.** The semantic layer, neutral slate, status
  colours, radius scale, type scale, shadow tiers and density scale are
  brand-neutral and become `fe-default`'s baseline for everyone.
- **The brand ramp is a preset.** `ui.theme.name` — the field that is written
  in every spec and read by nobody — becomes the selector:

  | `ui.theme.name` | primary ramp |
  |---|---|
  | `default` (and any unrecognised value, with a warning) | terracotta, `#DF7E30` family, 11 OKLCH stops |
  | `crimson` | the red ramp from the guideline's colour system, 11 OKLCH stops, verbatim |

  `crimson` is named for the hue, matching the existing `indigo` convention. No
  organisation name appears in the preset name, in any file name, in any
  generated identifier, or in any comment in generated output.

`ui.theme.tokens` keeps its existing seven knobs (`primary`, `surface`,
`background`, `text`, `textMuted`, `radius`, `font`) and becomes an *override*
on top of the chosen preset rather than the sole input. No new required field,
so all seven current specs stay valid and `name: indigo` keeps working — it
just falls to `default` with a warning instead of being silently ignored.

Schema change: `ui.theme.name` gains no enum. Constraining it would break the
existing specs that say `indigo`. The adapter warns on an unknown name and
falls back; `libraryWarnings` already exists for exactly this.

### 3. Class remap

One-to-one and mechanical. The full table is the implementation contract:

| Current | After |
|---|---|
| `bg-app-bg` | `bg-background` |
| `bg-app-surface` | `bg-card` |
| `bg-app-surface-secondary` | `bg-muted` |
| `bg-app-brand` | `bg-primary` |
| `bg-app-brand-subtle` | `bg-primary/10` |
| `bg-app-brand-strong` | `bg-primary-hover` |
| `text-app-brand`, `text-text-brand` | `text-primary` |
| `text-text-primary` | `text-foreground` |
| `text-text-secondary` | `text-muted-foreground` |
| `text-text-disabled` | `text-neutral-400` |
| `text-text-on-brand` | `text-primary-foreground` |
| `border-border` | `border-border` (unchanged) |
| `border-border-strong` | `border-input` |
| `ring-app-brand`, `ring-focus` | `ring-ring` |
| `*-danger-*` | `*-destructive-*` |
| `gray-*` | `neutral-*` |
| `shadow-xs` / `shadow-sm` / `shadow-md` / `shadow-lg` | `shadow-1` / `shadow-2` / `shadow-3` / `shadow-4` |

`primary-700` and friends (direct ramp references, 3 occurrences) resolve to
`primary-hover`. The guideline forbids components touching brand primitives
directly, and a guardrail will enforce that (§6).

### 4. Typography, radius, density, motion

- **Fonts.** Instrument Sans + JetBrains Mono, loaded from Google Fonts in
  `public/index.html`, exposed as `--font-sans` / `--font-mono`.
- **Type scale.** Eight steps with paired line heights, base `0.875rem` (14px).
  The app already renders at 14px/20px, so this formalises what is there rather
  than resizing the UI.
- **Radius.** 4 / 6 / 8 / 12 / 16 / full. Note `md` moves 8px → 6px, so every
  button and input gets slightly tighter corners. This is a visible change.
- **Density.** `--control-h: 2.25rem`, `--table-row-h: 2.5rem`,
  `--header-h: 3.5rem`, with `[data-density="compact"]` and
  `[data-density="comfortable"]` variants. Wired into `Button`, `TextInput`,
  `Select`, `Table`, `Topbar`.
- **Shadows.** Six tiers; `shadow-1..3` suppressed to `none` in dark mode with
  the elevation carried by the surface ladder instead.
- **Motion.** 120/180/240ms ease-out, with a `prefers-reduced-motion` kill
  switch.

### 5. What this deliberately does not do

The guideline also specifies page-level components that `fe-default` has no
equivalent for: `PageHeader`, `FilterBar`, `StatusBadge`, `ViewState`,
`ConfirmDialog`, `Stepper`, and its own `Breadcrumb`. Those are page structure,
not skin — adding them means changing `emit/page.mjs`, `emit/form.mjs` and
`emit/detail.mjs` and changing what a generated page *is*. That is a separate
feature with its own design.

This work stops at tokens, classes, typography and density across the 36
components that already exist.

### 6. Verification

- **Golden.** `fe-default-full`, `fe-default-dashboard` and `fe-default-mfe`
  (72 files each) will go red across most of their surface. The diff is read by
  category — CSS architecture, class remap, token values, dependency changes —
  before anything is recorded. Recording first and reading after would make the
  snapshot meaningless.
- **Adapter coverage gate** must stay at 26/26 semantic slots. A re-skin that
  drops a capability is a regression, and `check-all` already measures this.
- **Two new guardrails**, both rules the guideline states explicitly and both
  currently unenforced:
  1. no arbitrary Tailwind values (`p-[13px]`, `bg-[#DC2626]`) in any
     `fe-default` template or golden tree;
  2. no direct brand-primitive reference (`bg-primary-600`, `text-primary-700`)
     in a component — components use the semantic layer only.
- **Dark mode is proven, not assumed.** The `@theme inline` trap fails silently:
  the build succeeds, the classes exist, and toggling dark changes nothing. So
  a check asserts that `@theme` blocks contain `var()` references and no literal
  colour, and the built app is toggled and screenshotted in both modes.
- **Visual evidence.** `fe-default-full` is built and run, light and dark, and
  screenshotted. Golden proves bytes; it cannot prove the page looks right.
- **Determinism.** Two runs byte-identical, as for every other golden case.

### 7. Implementation shape

Four phases, each verifiable on its own, in this order because each depends on
the one before:

1. **Toolchain.** CRA5 + CRACO + Tailwind v4 builds and serves. Nothing else
   is touched. If this fails, stop.
2. **CSS architecture and token presets.** `app.css`, `tokens.css`,
   `theme.ts`, the adapter `theme()` rewrite, the `default` and `crimson`
   ramps. Classes are still v3-named at this point, so the app renders wrong
   on purpose; golden is not recorded yet.
3. **Class remap.** The 36 components plus the four `src/gen/` files, against
   the table in §3. This is where golden goes green again.
4. **Typography, density, and the two new guardrails.**

## Risks

| Risk | Handling |
|---|---|
| CRA5 + CRACO cannot build Tailwind v4 | Proven first, before any template is edited. Failure voids the design. |
| Dark mode silently breaks via literal `@theme` values | Structural check plus a toggled screenshot; not left to review. |
| Browser floor rises (Safari 16.4+) | Stated here as an accepted cost; no mitigation. |
| A class in the remap table is missed | The remap is exhaustive against a measured census, and the two new guardrails catch strays that survive. |
| Radius change (8px → 6px) surprises | Called out as a visible change, not shipped quietly. |

## Follow-ups, named not done

- The page-structure components in §5.
- `neudela` and `mui` adapters are untouched and stay on their own theming.
- The guideline's accessibility Definition of Done (WCAG 2.2, contrast pairs
  verified in both modes) is not automated here; only the focus-ring rule lands
  as part of the base layer.
