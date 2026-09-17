# Adapter Library — Frontend Generator (Kontrak)

Adapter = satu file `generator/libs/<name>.adapter.js` yang menerjemahkan **semantic vocabulary netral** (schema `generator/src/schema/fe-spec.schema.json` — `x-semantic-vocabulary`) dan **theme tokens IR** ke komponen spesifik satu library FE. Emitter TIDAK boleh hardcode komponen library apa pun — selalu lewat `resolve()`.

Saat ini: `mui.adapter.js` (M2 skeleton). M6 akan membuktikan extensibility dengan `neudela.adapter.js` memakai kontrak yang SAMA.

---

## 1. `components` — semantic → komponen

Wajib menutupi **SEMUA** semantic type di `x-semantic-vocabulary` (satu-satunya sumber; jangan invent tipe baru). Tipe yang library tak punya → `UNSUPPORTED` (throw di `resolve`) + tercatat di `coverage()` sebagai gap — **tidak boleh diam**.

Bentuk entry:

```js
{
  module: '@mui/material/TextField', // import path hasil generate
  export: 'TextField',               // named export
  propsMap: (props) => ({ /* props tambahan hasil transform */ }), // opsional
  companions: [{ module: '@mui/material/MenuItem', export: 'MenuItem' }], // opsional: import wajib lain
  status: 'fallback',   // opsional; 'fallback' = bukan primitif 1:1 (Box + assembling runtime). Absen = 'covered'
  note: 'catatan utk emitter', // opsional
}
```

`propsMap` = **satu bentuk resmi: object literal function `(props) => ({...})`** (bukan objek statis) — agar bisa baca `props.tone` / `props.rows` / dst. Hasil mapping dibubuhkan ke props asli oleh emitter.

### Mapping MUI per semantic (status default `covered`)

| semantic | module / export | propsMap / catatan |
|---|---|---|
| text-input | `@mui/material/TextField` | `{type:'text'}` |
| textarea | `@mui/material/TextField` | `{multiline:true, rows: props.rows \|\| 4}` |
| number-input | `@mui/material/TextField` | `{type:'number'}` |
| email-input | `@mui/material/TextField` | `{type:'email'}` |
| password-input | `@mui/material/TextField` | `{type:'password'}` |
| select | `@mui/material/Select` + companion `MenuItem` | options → child `MenuItem` |
| toggle | `@mui/material/Switch` | — |
| data-grid | `@mui/x-data-grid/DataGrid` | **COMMUNITY** (server-mode statis); Pro dilarang |
| status-chip | `@mui/material/Chip` | tone/status → `color: success/error/warning/info/default` |
| tag | `@mui/material/Chip` | `{size:'small'}` |
| row-actions | `@mui/material/IconButton` | — |
| button | `@mui/material/Button` | tone → **semantik**: primary→`{variant:'contained'}`, secondary→`{variant:'outlined'}`, ghost→`{variant:'text'}`, danger→`{color:'error'}`, warning→`{color:'warning'}`, info→`{color:'info'}`, link→`{variant:'text',color:'primary'}` |
| modal | `@mui/material/Dialog` | — |
| tabs | `@mui/material/Tabs` + companion `Tab` | — |
| card | `@mui/material/Card` | — |
| description-list | `@mui/material/Box` | **fallback**: bukan primitif — emitter merakit label/value via Box+Typography |
| table | `@mui/material/Table` + companions Head/Body/Row/Cell | — |
| timeline | `@mui/material/Timeline` + companions Item/Separator/Dot/Content | MUI sudah punya |
| repeatable-group | `@mui/material/Box` | **fallback**: bukan primitif — emitter pakai `useFieldArray` (react-hook-form) di runtime |
| typeahead | `@mui/material/Autocomplete` | `{freeSolo:true}` |

### F3 — 4 semantic baru + 1 alias (20 -> 24 total)

| semantic | module / export | propsMap / catatan |
|---|---|---|
| date-input | `@mui/material/TextField` | `{type:'date', InputLabelProps:{shrink:true}}` |
| datetime-input | `@mui/material/TextField` | `{type:'datetime-local', InputLabelProps:{shrink:true}}` — **BUKAN** `@mui/x-date-pickers` (dependency baru, kelas `@mui/x-*` yang sudah dilarang guardrail) |
| checkbox | `@mui/material/Checkbox` | — |
| radio-group | `@mui/material/RadioGroup` + companions `Radio`, `FormControlLabel` | — |

`autocomplete` (field type YAML) memetakan ke semantic **`typeahead` yang sudah ada** — bukan
entri baru. fe-default: `date-input`/`datetime-input`/`checkbox` = primitif native HTML nyata
(`covered`); `radio-group` juga primitif nyata (`RadioGroup.tsx`). neudela: `date-input`/
`datetime-input` = `NeuronInput` fallback (`type="date"`, bukan date-picker khusus); `checkbox`
= `NeuronCheckbox` nyata (`covered`); `radio-group` = **UNSUPPORTED** — `NeuronRadioGroup`
butuh children `NeuronRadio` terkomposisi, bukan `options` array datar seperti kontrak
`FieldSpec`; assembly itu belum ditulis, jadi diam-diam menurunkan kualitas ditolak, bukan
dipaksakan setengah jadi.

## 2. `theme(tokens, darkMode)` → objek tema

`tokens` = objek netral dari YAML (`ui.theme.tokens`: `primary, surface, background, text, textMuted, radius, font`). Kembalikan **objek biasa** (bukan `createTheme` ter-instansiasi — consumer yang memanggil `createTheme`). Bila `darkMode` true, tambah `colorSchemes.dark` (nilai turunan shade dari token yang sama: background digelapkan, teks dicerahkan).

```js
theme({primary:'#2563eb', surface:'#fff', background:'#f8fafc',
       text:'#0f172a', textMuted:'#64748b', radius:8, font:'Inter'}, true)
// -> { palette: {...}, shape: {borderRadius:8}, typography:{fontFamily:'Inter'}, colorSchemes:{dark:{palette:{...}}} }
```

## 3. `scaffoldDeps()` → daftar dependency

Versi terpisah di konstanta file adapter. MUI v1: `@mui/material ^9`, `@mui/x-data-grid` (community), `react-hook-form ^7`, `zod ^3`, `react-router-dom 6.30.1`, `lucide-react`. **TIDAK**: `@mui/x-charts` (tak ada consumer stats v1), `zustand` (state `context|none` di schema), fitur MUI berbayar (Pro/Advanced — dilarang).

## 4. `gateCommand()` → string perintah build

Konvensi tim CRA5+Craco: `'craco build'`.

## 5. `resolve(semantic, props)` + `coverage()`

- `resolve(semantic, props)` → `{module, export, propsMap?, companions?, status?, note?}`.
  - Tipe **fallback** (`status:'fallback'`) → **JANGAN throw** — fallback sah, resolver mengembalikan Box + note.
  - Tipe **tak terdaftar / unsupported** → `throw new Error('adapter <name>: UNSUPPORTED semantic "<X>"')`.
- `coverage()` → array `{semantic, status: 'covered'|'fallback'|'unsupported'}` — **iterate `SCHEMA['x-semantic-vocabulary']`** (import dari `generator/src/fe/validateFESpec.mjs`, jangan hardcode duplikat). Semua tipe dilaporkan; 0 `'unlisted'`. Dipakai gate M6 (neudela harus laporkan gap tertulis).

---

### F7 — 2 semantic baru (24 -> 26 total): `stat-card`, `chart`

| semantic | mui | neudela | fe-default |
|---|---|---|---|
| stat-card | fallback (`Card` — emitter merakit label/value/trend via `UiCard`+`UiTypography`, BUKAN simbol `UiStatCard`) | fallback (`NeuronCard`, rakitan sama) | **covered** (`StatCard.tsx`, sudah ada sejak template awal) |
| chart | **unsupported** (v1, sengaja — `@mui/x-charts` dilarang guardrail) | **unsupported** (v1, sengaja) | **unsupported** (v1, sengaja) |

`chart` UNSUPPORTED di **ketiga** adapter secara sengaja (keputusan user: tanpa dependency
chart baru). `emit/dashboard.mjs` TIDAK PERNAH memanggil `resolve('chart')` (yang akan
throw sesuai kontrak) — ia membaca `coverage()` sekali dan menulis placeholder + satu
warning per chart. `UiStatCard` (barrel symbol) HANYA ditambahkan untuk fe-default, dan
HANYA saat FEIR punya halaman dashboard (`barrelMembersFor()` di `emit/page.mjs`) — mui/
neudela tidak pernah mendapat simbol ini karena keduanya `fallback`, bukan `covered`;
`adapter.resolve('stat-card')` untuk mui hanya mengembalikan `Card` MENTAH, bukan komponen
berprop `label`/`value`/`trend`.

## Cara register lib baru (mis. neudela di M6)

1. Buat `generator/libs/<name>.adapter.js` — ikuti 5 bagian kontrak di atas:
   - `components`: map semantic → komponen lib; tipe tak punya → `UNSUPPORTED` + gap di `coverage()` (wajib lapor, jangan diam).
   - `theme(tokens, darkMode)`: tokens IR → objek tema lib (neudela: CSS var, pola `tokens.css` / `.dark-theme`).
   - `scaffoldDeps()`: daftar dep app hasil generate (versi di konstanta).
   - `gateCommand()`: perintah build.
   - `resolve()` + `coverage()` + `UNSUPPORTED` throw — API sama persis.
2. Pastikan setiap semantic punya entry ATAU fallback eksplisit ATAU `UNSUPPORTED` — `coverage()` harus 0 `'unlisted'`.
3. Jalankan gates yang sama (build `gateCommand()`, slice emitter, grep guardrails). Fitur yang tak didukung lib = **warnings terdokumentasi**, bukan failure senyap.