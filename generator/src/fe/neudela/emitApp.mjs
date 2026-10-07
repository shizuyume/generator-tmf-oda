// emitApp.mjs — the neudela adapter's per-app emitter.
//
// emitApp(spec) → Map<relativePath, content> for every file of a generated app that depends on
// the spec's `app` block. The fixed files (runtime, components, styles) are copied verbatim from
// templates/fe-neudela/files by scaffold.mjs. Pure and deterministic: same spec, same bytes.
import { code, quote, tsLiteral } from './tsLiteral.mjs';

const pascal = (s) => s.replace(/(^|[-_ ])(\w)/g, (_m, _p, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase());
const constName = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase();

/** Every `icon: 'Name'` (and `badge.icon`) a value names, sorted and unique. */
function iconNames(value, out = new Set()) {
  if (Array.isArray(value)) value.forEach((v) => iconNames(v, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'icon' && typeof v === 'string') out.add(v);
      else iconNames(v, out);
    }
  }
  return out;
}

const sorted = (set) => [...set].sort((a, b) => a.localeCompare(b));

// ── root files ──

function packageJson(spec) {
  const { meta } = spec.app;
  const { stack } = spec.template;
  return `${JSON.stringify({
    name: meta.packageName,
    version: meta.version,
    private: stack.packageJson.private,
    type: stack.packageJson.type,
    description: meta.packageDescription,
    scripts: stack.packageJson.scripts,
    dependencies: stack.dependencies,
    devDependencies: stack.devDependencies,
  }, null, 2)}\n`;
}

function indexHtml(spec) {
  const { meta } = spec.app;
  const { fonts, darkMode } = spec.template.theme;
  return `<!DOCTYPE html>
<html lang="${meta.uiLang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="${meta.description}" />
    <link rel="icon" type="${meta.favicon.type}" href="${meta.favicon.href}" />
    <!-- neudela's --font-family is Inter but the package ships no @font-face; load it here,
         plus JetBrains Mono for record ids (--lab-font-mono, as in the Neudela dashboard designs). -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="${fonts.stylesheet}" rel="stylesheet" />
    <title>${meta.title}</title>
    <!-- Apply the saved / OS theme before first paint (no light flash when dark). Same key and
         logic as readInitialDarkMode in src/App.tsx. -->
    <script>
      (function () {
        var dark;
        try {
          var saved = localStorage.getItem('${themeKey(spec)}');
          if (saved) dark = saved === '${darkMode.storage.values.dark}';
        } catch (e) {}
        if (dark === undefined) dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        if (dark) document.documentElement.classList.add('${spec.template.theme.darkClass}');
      })();
    </script>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <script type="module" src="/src/index.tsx"></script>
  </body>
</html>
`;
}

const themeKey = (spec) => `${spec.app.meta.name}:theme`;

/** The Module Federation remote name of an app: its package name as an identifier. */
export const federationName = (spec) => spec.app.meta.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^(\d)/, '_$1');

/** Exposed modules, in navigation order: `./PartyRevSharingAlgorithm` → src/exposes/PartyRevSharingAlgorithm.tsx. */
const exposesOf = (spec) => spec.app.navigation
  .map((n) => spec.app.pages[n.page])
  .filter((p) => p.kind === 'resource')
  .map((p) => [p.expose.key, `./src/exposes/${p.expose.file}.tsx`]);

function viteConfig(spec) {
  const { environment, tmf } = spec.app;
  const { federation: fed, stack } = spec.template;
  const backend = tmf ? `the real TMF${tmf.number} backend` : 'the backend';
  const name = federationName(spec);
  const exposes = exposesOf(spec).map(([k, v]) => `          ${quote(k)}: ${quote(v)},`).join('\n');
  const shared = fed.shared.map((pkg) => `          ${/^[a-z]+$/.test(pkg) ? pkg : quote(pkg)}: { singleton: true, requiredVersion: ${quote(stack.dependencies[pkg])} },`).join('\n');
  return `import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { federation } from '@module-federation/vite';
import { mockApi } from './mock/mockApi.ts';
import { MOCK } from './mock/seed.ts';

// A full app that is also a Module Federation remote: \`${name}\` serves ${fed.filename} (and
// mf-manifest.json) exposing every page of src/exposes; ${fed.shared.join(', ').replace(/, ([^,]+)$/, ' and $1')} are shared
// singletons, so a host that already has them provides its copy. The async bootstrap in
// src/index.tsx is where the federation runtime negotiates those shares before the app starts.
//
// \`npm run dev\`      → /tmf-api is proxied to ${backend} (API_PROXY_TARGET).
// \`npm run dev:mock\` → /tmf-api and ${environment.lookupMockBase} are served in-memory by mock/mockApi.ts (data: mock/seed.ts).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const useMock = mode === 'mock';

  return {
    plugins: [
      react(),
      federation({
        name: ${quote(name)},
        filename: ${quote(fed.filename)},
        manifest: true,
        exposes: {
${exposes}
        },
        shared: {
${shared}
        },
        dts: false,
      }),
      ...(useMock ? [mockApi(MOCK)] : []),
    ],
    // the federation runtime uses top-level await
    build: { target: ${quote(fed.buildTarget)} },
    server: {
      port: ${environment.port},
      strictPort: true,
      // a host on another origin loads ${fed.filename} and the exposed chunks
      cors: true,
      proxy: useMock
        ? undefined
        : {
            '/tmf-api': {
              target: env.API_PROXY_TARGET || '${environment.apiProxyTargetDefault}',
              changeOrigin: true,
            },
          },
    },
    preview: {
      port: ${environment.port},
      strictPort: true,
      cors: true,
    },
  };
});
`;
}

function envExample(spec) {
  const lines = ['# Copy to .env.local (git-ignored) and adjust.', ''];
  for (const v of spec.app.environment.variables) {
    for (const c of v.comment.split('\n')) lines.push(`# ${c}`);
    lines.push(`${v.name}=${v.value}`, '');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function envMock(spec) {
  const lines = ['# Loaded by `npm run dev:mock` (vite --mode mock). mock/mockApi.ts serves these paths.'];
  for (const v of spec.app.environment.mock) lines.push(`${v.name}=${v.value}`);
  return `${lines.join('\n')}\n`;
}

const gitignore = (spec) => `${spec.template.stack.gitignore.join('\n')}\n`;

// ── src/app ──

function envTs(spec) {
  const { tmf } = spec.app;
  const what = tmf ? `TMF${tmf.number} ${tmf.specTitle} v${tmf.specVersion.split('.')[0]}` : spec.app.meta.title;
  return `// API base path of this app's TMF component (${what}).
export const TMF_BASE = ${quote(spec.app.api.basePath)};
`;
}

function servicesTs(spec) {
  const services = spec.app.services;
  const types = sorted(new Set(services.flatMap((s) => [s.type, s.create, s.update].filter(Boolean))));
  const factories = [services.some((s) => !s.nested) && 'resourceService', services.some((s) => s.nested) && 'nestedResourceService'].filter(Boolean);
  const lines = [
    ...(services.some((s) => s.nested)
      ? ['// Resource collections of this app\'s API (paths under TMF_BASE, src/app/env.ts); a nested one', '// (`/parent/{id}/child`) is bound to its parent record by the page that shows it.']
      : ['// Resource collections of this app\'s API (paths under TMF_BASE, src/app/env.ts).']),
    `import { ${factories.join(', ')} } from '../service/resource';`,
    `import type { ${types.join(', ')} } from '../types';`,
    '',
  ];
  for (const s of services) {
    const generics = [s.type, s.create, s.update].filter(Boolean).join(', ');
    lines.push(`export const ${s.name} = ${s.nested ? 'nestedResourceService' : 'resourceService'}<${generics}>(${quote(s.path)});`);
  }
  return `${lines.join('\n')}\n`;
}

function lookupsTs(spec) {
  const { apis, items } = spec.app.lookups;
  const keys = Object.keys(items);
  const apiConst = (k) => `${constName(k)}_URL`;
  const lines = [
    "// Relation lookups of this app: one per referenced entity, each calling the API that owns it.",
    "import { searchLookup } from '../service/lookupService';",
    "import type { LookupConfig } from '../service/lookupService';",
    '',
  ];
  for (const [k, api] of Object.entries(apis)) lines.push(`const ${apiConst(k)} = import.meta.env.${api.baseUrlEnv};`);
  if (Object.keys(apis).length) lines.push('');
  const lookups = Object.fromEntries(keys.map((k) => {
    const it = items[k];
    const api = apis[it.api];
    return [k, {
      noun: it.noun,
      service: api.service,
      baseUrl: code(apiConst(it.api)),
      basePath: api.basePath,
      path: it.path,
      queryParam: api.queryParam,
      limit: api.limit,
      labelField: api.labelField,
      valueField: api.valueField,
    }];
  }));
  lines.push(`export const LOOKUPS: Record<string, LookupConfig> = ${tsLiteral(lookups)};`, '');
  lines.push('/** Base-URL env var of each lookup (shown on the Overview). */');
  lines.push(`export const LOOKUP_ENV: Record<string, string> = ${tsLiteral(Object.fromEntries(keys.map((k) => [k, apis[items[k].api].baseUrlEnv])))};`, '');
  lines.push('/** The referenced *Ref type of each lookup. */');
  lines.push(`export const LOOKUP_REFS: Record<string, string> = ${tsLiteral(Object.fromEntries(keys.map((k) => [k, items[k].ref])))};`, '');
  lines.push('/** Stable search functions, one per lookup (the form keeps one state per key). */');
  lines.push('export const LOOKUP_FNS = Object.fromEntries(');
  lines.push('  Object.entries(LOOKUPS).map(([key, config]) => [key, (query: string) => searchLookup(config, query)]),');
  lines.push(');');
  return `${lines.join('\n')}\n`;
}

function resourcePages(spec) {
  return Object.entries(spec.app.pages).filter(([, p]) => p.kind === 'resource');
}

function iconsTs(spec) {
  const names = new Set();
  for (const [, p] of resourcePages(spec)) iconNames(p.config, names);
  const list = sorted(names);
  return `// Icons the resource configs name (lucide-react), imported one by one so the bundle only
// carries these. Generated from the icon names used in the neudela-fe/v1 spec.
import {
${list.map((n) => `  ${n},`).join('\n')}
} from 'lucide-react';

export const ICONS = {
${list.map((n) => `  ${n},`).join('\n')}
};
`;
}

function shellTsx(spec) {
  const { navigation, brand, pages } = spec.app;
  const icons = sorted(new Set(navigation.map((n) => n.icon)));
  const imports = navigation.map((n) => {
    const page = pages[n.page];
    return page.kind === 'overview'
      ? "import OverviewPage from '../pages/overview';"
      : `import ${page.expose.file} from '../exposes/${page.expose.file}';`;
  });
  const items = navigation.map((n) => {
    const page = pages[n.page];
    const comp = page.kind === 'overview' ? 'OverviewPage' : page.expose.file;
    return `  { path: ${quote(n.path)}, label: ${quote(n.label)}, icon: <${n.icon} size={18} />, page: ${comp}, remountOnNav: ${page.kind !== 'overview'} },`;
  });
  return `// Shell of this app: brand, theme storage key and the sidebar pages (in order).
import type { ComponentType, ReactNode } from 'react';
import { ${icons.join(', ')} } from 'lucide-react';
${imports.join('\n')}

export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  page: ComponentType;
  /** Re-clicking the nav item remounts the page (back from the detail view to the list). */
  remountOnNav: boolean;
}

export const BRAND = ${tsLiteral(brand, 0, 'export const BRAND = '.length, 1)};

export const THEME_STORAGE_KEY = ${quote(themeKey(spec))};

export const NAV_ITEMS: NavItem[] = [
${items.join('\n')}
];
`;
}

function summaryTs(spec) {
  const { pages, navigation, tmf } = spec.app;
  const [, home] = Object.entries(pages).find(([, p]) => p.kind === 'overview');
  const s = home.summary;
  const modules = navigation
    .filter((n) => pages[n.page].kind === 'resource')
    .map((n) => ({ key: pages[n.page].expose.key, pageName: pages[n.page].expose.pageName, route: n.path, label: n.label }));
  const source = tmf ? `the TMF${tmf.number} IR\n// (meta, resources, hub, listeners), the OAS \`info\` block and this app's exposes.` : 'the API spec and this app\'s exposes.';
  return `// What the Overview page shows about the TMF API and this frontend: values from ${source}
import { ${s.countService} } from './services';
import type { ApiInfo, EventSummary, FederationSummary, ModuleSummary, OperationSummary, ResourceSummary } from '../pages/overview/summary';

export const API_INFO: ApiInfo = ${tsLiteral(s.apiInfo, 0, 'export const API_INFO: ApiInfo = '.length, 1)};

export const RESOURCES: ResourceSummary[] = ${tsLiteral(s.resources, 0, 'export const RESOURCES: ResourceSummary[] = '.length)};

export const OPERATIONS: OperationSummary[] = [
${s.operations.map((o) => `  ${tsLiteral(o, 2, 0, 10000)},`).join('\n')}
];

export const EVENTS: EventSummary[] = [
${s.events.map((e) => `  ${tsLiteral(e, 2, 0, 10000)},`).join('\n')}
];

export const MODULES: ModuleSummary[] = [
${modules.map((m) => `  ${tsLiteral(m, 2, 0, 10000)},`).join('\n')}
];

/** This app as a Module Federation remote (vite.config.ts). */
export const FEDERATION: FederationSummary = ${tsLiteral({ name: federationName(spec), remoteEntry: spec.template.federation.filename, shared: spec.template.federation.shared }, 0, 'export const FEDERATION: FederationSummary = '.length)};

/** Read cheaply for the live KPI: \`limit=1\`, total from X-Total-Count. */
export const countPrimaryResource = ${s.countService}.list;
export const PRIMARY_RESOURCE_NOUN = ${quote(s.primaryResourceNoun)};
`;
}

// ── pages + exposes ──

function configTs(spec, page) {
  const usesLookups = page.lookups === true;
  const nested = page.config.detail?.nested ?? [];
  const lines = ["import type { ResourceConfig } from '../../resource/types';"];
  if (usesLookups) lines.push("import { LOOKUP_FNS } from '../../app/lookups';");
  lines.push(`import { ${[page.service, ...nested.map((n) => n.service)].join(', ')} } from '../../app/services';`, '');
  const config = nested.length
    ? {
        ...page.config,
        detail: {
          ...page.config.detail,
          nested: nested.map((n) => ({ ...n, service: code(n.service), lookups: n.lookups ? code('LOOKUP_FNS') : {} })),
        },
      }
    : page.config;
  const value = {
    service: code(page.service),
    lookups: usesLookups ? code('LOOKUP_FNS') : {},
    ...config,
  };
  lines.push(`export const config: ResourceConfig = ${tsLiteral(value, 0, 'export const config: ResourceConfig = '.length)};`);
  return `${lines.join('\n')}\n`;
}

function pageIndexTsx(page) {
  return `import ResourcePage from '../../resource/ResourcePage';
import { config } from './config';

// ${page.comment}
export default function ${page.component}() {
  return <ResourcePage config={config} />;
}
`;
}

function exposeTsx(page) {
  return `import { createProtectedPage } from '../federation/createProtectedPage';

export default createProtectedPage(() => import('../pages/${page.dir}'), {
  pageName: ${quote(page.expose.pageName)},
});
`;
}

// ── types ──

function tsType(prop) {
  if (prop.array) return `${prop.array}[]`;
  if (prop.ref) return prop.ref;
  if (prop.enum) return prop.enum.map((v) => quote(v)).join(' | ');
  if (prop.type === 'boolean' || prop.type === 'number') return prop.type;
  return 'string';
}

const propKey = (k) => (/^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k));

function typesTs(spec) {
  const { schemas, tmf } = spec.app;
  const out = [];
  out.push('/**');
  out.push(tmf
    ? ` * TMF${tmf.number} ${tmf.specTitle} v${tmf.specVersion} — TypeScript types, from the neudela-fe/v1 spec`
    : ` * ${spec.app.meta.title} — TypeScript types, from the neudela-fe/v1 spec`);
  out.push(' * (`app.schemas`, aligned with the OAS). Optional unless the OAS / backend requires it.');
  out.push(' */');
  for (const [name, schema] of Object.entries(schemas)) {
    if (schema.kind === 'error') continue;
    const props = Object.entries(schema.properties);
    // response: `required`, a non-empty array, or the id of a resource; FVO adds `requiredInFVO`
    const requiredIn = (p, shape) => {
      if (shape === 'MVO') return false;
      if (p.required || p.minItems >= 1) return true;
      if (shape === 'FVO') return !!p.requiredInFVO;
      return (schema.kind === 'resource' || schema.kind === 'hub') && p === schema.properties.id;
    };
    const iface = (title, list, shape, docs) => {
      out.push('');
      if (docs) out.push(`/** ${docs} */`);
      out.push(`export interface ${title} {`);
      for (const [k, p] of list) {
        const note = p.extension === 'backend' ? '  /** Not in the OAS — added by the backend. */\n' : '';
        out.push(`${note}  ${propKey(k)}${requiredIn(p, shape) ? '' : '?'}: ${tsType(p)};`);
      }
      out.push('}');
    };
    iface(name, props, 'resource');
    for (const [shape, keys] of Object.entries(schema.shapes ?? {})) {
      const docs = shape === 'FVO' ? 'Create body (FVO): id, href and server-managed dates are never sent.' : 'Update body (MVO).';
      iface(`${name}_${shape}`, keys.map((k) => [k, schema.properties[k]]), shape, docs);
    }
  }
  return `${out.join('\n')}\n`;
}

const typesIndex = (spec) => `export * from './${spec.app.meta.typesFile}';\n`;

// ── mock ──

function seedTs(spec) {
  const { mock, lookups, environment } = spec.app;
  const lookupData = Object.fromEntries(Object.entries(mock.lookups).map(([k, list]) => {
    const it = lookups.items[k];
    return [`${environment.lookupMockBase}${lookups.apis[it.api].basePath}${it.path}`, list];
  }));
  const value = {
    name: spec.app.meta.name,
    apiBase: spec.app.api.basePath,
    latencyMs: mock.latencyMs,
    lookups: lookupData,
    resources: mock.resources,
  };
  return `// Data of the dev:mock API (mock/mockApi.ts): the seeded records, lookups and create rules.
// Seeded ids and dates are fixed, so every restart serves the same records.
import type { MockSpec } from './mockApi.ts';

export const MOCK: MockSpec = ${tsLiteral(value, 0, 'export const MOCK: MockSpec = '.length)};
`;
}

// ── theme overrides ──

function themeCss(spec) {
  const lines = [
    '/* Theme overrides of this app over neudela and the template (generated from the spec).',
    '   Empty when the app keeps the neudela palette and the template layout. */',
  ];
  const overrides = spec.app.theme?.overrides ?? {};
  const light = Object.entries(overrides.light ?? {});
  const dark = Object.entries(overrides.dark ?? {});
  if (light.length) lines.push('', ':root {', ...light.map(([k, v]) => `  ${k}: ${v};`), '}');
  if (dark.length) lines.push('', `.${spec.template.theme.darkClass} {`, ...dark.map(([k, v]) => `  ${k}: ${v};`), '}');
  return `${lines.join('\n')}\n`;
}

/** Every per-app file of the generated app. */
export function emitApp(spec) {
  const files = new Map();
  const put = (p, c) => files.set(p, c);
  put('package.json', packageJson(spec));
  put('index.html', indexHtml(spec));
  put('vite.config.ts', viteConfig(spec));
  put('.env.example', envExample(spec));
  put('.env.mock', envMock(spec));
  put('.gitignore', gitignore(spec));
  put('src/app/env.ts', envTs(spec));
  put('src/app/services.ts', servicesTs(spec));
  put('src/app/lookups.ts', lookupsTs(spec));
  put('src/app/icons.ts', iconsTs(spec));
  put('src/app/shell.tsx', shellTsx(spec));
  put('src/app/summary.ts', summaryTs(spec));
  put('src/app/theme.css', themeCss(spec));
  for (const [, page] of resourcePages(spec)) {
    put(`src/pages/${page.dir}/config.ts`, configTs(spec, page));
    put(`src/pages/${page.dir}/index.tsx`, pageIndexTsx(page));
    put(`src/exposes/${page.expose.file}.tsx`, exposeTsx(page));
  }
  put(`src/types/${spec.app.meta.typesFile}.ts`, typesTs(spec));
  put('src/types/index.ts', typesIndex(spec));
  put('mock/seed.ts', seedTs(spec));
  return new Map([...files.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export { pascal };
