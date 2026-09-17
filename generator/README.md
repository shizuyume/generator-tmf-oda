# tmfgen

Generator kode deterministik untuk komponen TM Forum ODA: membaca spec TMF
OpenAPI/Swagger lalu menghasilkan backend NestJS + TypeORM yang siap jalan
(entity, DTO, controller, service, hub/listener, event) — tanpa LLM di jalur
generate-nya, jadi input yang sama selalu menghasilkan output yang sama persis.

Panduan ini mencakup semuanya dari "saya punya spec komponen TMF" sampai "saya
punya backend yang jalan dan berhasil di-build": apa yang perlu disiapkan,
bagaimana pipeline-nya bekerja, referensi CLI lengkap, dan pengecekan yang harus
dilakukan sebelum mempercayai hasilnya.

## 1. Prasyarat

- **Node.js 18+** (repo ini dikembangkan dengan Node 22) dan **Yarn 1.x**
  (servis hasil generate adalah Yarn workspace yang di-pin ke `yarn@1.22.22`).
- Setup sekali di awal, di dalam `generator/`:

  ```bash
  cd generator
  npm install
  ```

- Semua contoh di bawah memakai wrapper `tmfgen` di root repo (`./tmfgen` di
  bash/git-bash, `tmfgen` di cmd/PowerShell) supaya tidak perlu `cd generator`
  dan tidak perlu prefix `node src/cli.mjs`. Wrapper ini cuma memanggil
  `generator/src/cli.mjs` — tidak butuh instalasi tambahan, jalan langsung dari
  root repo manapun kamu berada. Kalau lebih suka cara lama, `node
  generator/src/cli.mjs <perintah> ...` tetap berfungsi sama persis.

- File `generator/tmfgen.config.json` yang menunjuk ke lokasi hasil generate:

  ```json
  {
    "targetRoot": "D:/Neuronworks/project/tm-forum",
    "overrides": {}
  }
  ```

  - `targetRoot` — setiap `--name <service>` di scaffold/emit akan di-resolve
    relatif ke direktori ini. Bisa di-override per-perintah dengan
    `--target-root`.
  - `overrides` — override IR khusus per-komponen (jarang dibutuhkan; diskusikan
    dulu sebelum memakainya).
  - `portRange` (opsional, jarang perlu diisi) — range fallback yang dipakai
    HANYA kalau identity port komponen (lihat §4) sudah dipakai servis lain,
    atau `tmfNumber`-nya gagal diturunkan dari spec. Kalau tidak diisi,
    generator sudah punya default `[3026, 3099]` bawaan di kode.

## 2. Menyiapkan input: folder komponen TMF

tmfgen membaca langsung dari struktur `documents/<tmfNNN>/<versi>/` yang sudah
dipakai di workspace ini. Arahkan langsung ke salah satu folder versi ini
sebagai argumen posisional (tidak perlu nama flag):

```
documents/tmf736/5.0.0/
├── openapi/
│   └── TMF736-Revenue_Sharing_Algorithm_Management-v5.0.0.oas.yaml   ← wajib
├── userguide/
│   └── TMF736_..._userguide.pdf   atau  .md                          ← opsional
├── conformance/                                                      ← tidak dibaca tmfgen
└── postman/                                                          ← tidak dibaca tmfgen
```

Ketentuan:

- **File OpenAPI/Swagger adalah satu-satunya input wajib.** Boleh `.yaml`,
  `.yml`, atau `.json`. Kalau ada beberapa file mirip-spec di dalam `openapi/`,
  tmfgen mengambil yang urutan alfabetnya paling awal dan melewati file yang
  namanya mengandung `postman` — kalau ini ambigu, arahkan langsung ke file
  spec-nya (bukan folder komponen) sebagai argumen posisional, atau pakai
  `-s <path pasti>` / `--spec <path pasti>` secara eksplisit.
- **User guide Markdown bersifat opsional dan hanya menambah.** Kalau ada
  `userguide/*.md`, tmfgen akan menggabungkannya untuk pengayaan yang tidak ada
  di spec. **PDF** user guide (deliverable normal dari TM Forum) **tidak**
  di-parse otomatis — kalau ada detail spec-vs-dokumen yang ingin ikut
  dipertimbangkan, konversi bagian relevannya ke `.md` dulu, atau pass eksplisit
  lewat `-m <path>` / `--md <path>`.
- **`conformance/` dan `postman/` tidak dipakai oleh generator.** Keduanya baru
  relevan nanti saat conformance-testing API hasil generate — bukan saat proses
  generate. Lihat §7 untuk alasan kenapa spec OAS saja tidak cukup untuk
  menjamin conformance.
- Sebelum generate komponen *baru*, pastikan dulu file spec-nya bisa dimuat
  dengan bersih. Beberapa spec vendor punya `$ref` yang tidak bisa diresolusi
  (tmfgen akan bilang dengan jelas lalu keluar, bukan menebak-nebak):

  ```bash
  ./tmfgen ir documents/tmf736/5.0.0
  ```

  Ini juga cara tercepat untuk melihat pratinjau apa yang akan digenerate
  (resource, operasi, field wajib, sub-entity, house filter) tanpa menulis kode
  apa pun — baca seluruh ringkasannya sebelum scaffold.

## 3. Pipeline

```
   ir        →       scaffold        →         emit          →   (opsional) inject
(pratinjau,    (kerangka servis baru,   (entity/DTO/             (sisipan bedah ke
 tanpa kode)    dijalankan SEKALI        controller/module,        servis hand-written
                per servis)              aman dijalankan ulang)    yang sudah ada)
```

- **`ir`** — mem-parsing spec menjadi intermediate representation milik tmfgen
  dan mencetak ringkasan yang mudah dibaca manusia. Menulis
  `ir-cache/tmf<N>-<versi>.ir.json` untuk keperluan inspeksi/debug. Tidak ada
  kode backend yang disentuh.
- **`scaffold`** — membuat direktori servis baru dari nol: `package.json`,
  `main.ts`, kerangka `app.module.ts`, `.env.example`, filter/guard umum,
  wiring database. **Menolak berjalan kalau direktori target sudah ada** — ini
  langkah sekali-jalan per servis.
- **`emit`** — menggenerate entity, DTO, controller, service, wiring
  hub/subscription dan listener untuk setiap resource di dalam spec, ke servis
  yang sudah di-scaffold. **Aman dijalankan berulang kali**: file hasil generate
  selalu ditimpa ulang (memang itu tujuannya — menjalankan ulang setelah spec
  atau generator berubah harus langsung bisa dipakai), tapi ada beberapa titik
  hand-edit yang ditulis sekali saja dan tidak pernah disentuh lagi (lihat §6).
- **`inject`** — proses emit yang sama, tapi diarahkan ke servis hand-written,
  bukan servis milik generator, lewat deteksi + rencana dry-run yang harus
  eksplisit di-`--apply`. Pakai ini hanya kalau menambahkan komponen TMF ke
  servis NestJS yang sudah ada dan dikelola manual, yang bukan buatan tmfgen.

## 4. Alokasi port

Setiap servis hasil generate mendapat port default yang diturunkan dari nomor
TMF-nya: **`3` + nomor TMF**. TMF736 → `3736`, TMF622 → `3622`, dan seterusnya.
Ini adalah *default yang tertanam di `.env.example` dan fallback `{{PORT}}` di
`main.ts`* — selalu bisa di-override dengan mengisi `PORT` di `.env` asli
servisnya.

Urutan resolusi saat menjalankan `scaffold`:

1. `--port <n>` — eksplisit, selalu menang (akan error kalau sudah diklaim
   servis lain yang sudah di-scaffold di bawah `targetRoot` yang sama).
2. **Identity port** (`3<nomorTmf>`) — dipakai otomatis kalau masih bebas.
3. Port bebas pertama di `portRange` (dari `tmfgen.config.json` kalau diisi,
   atau default bawaan `[3026, 3099]` di kode kalau tidak) — hanya dipakai
   kalau identity port-nya bentrok dengan servis lain yang sudah ada, atau
   `tmfNumber`-nya tidak bisa diturunkan dari spec.

Output konsol `scaffold` selalu menyebutkan port mana dari tiga opsi di atas
yang dipakai dan alasannya — baca, jangan diasumsikan sendiri.

## 5. Resep CLI yang umum dipakai

Dijalankan dari mana saja di repo lewat wrapper `./tmfgen` (root repo). Ganti
path komponen sesuai kebutuhan; path folder komponen bisa relatif terhadap
direktori kerja kamu saat ini.

Setiap perintah punya bentuk pendek `tmfgen <perintah> <target> [opsi]`, di
mana `<target>` adalah argumen posisional pertama (folder komponen atau file
spec) — tidak perlu ditulis `--component`/`--spec` lagi kecuali kalau ambigu.
Kalau butuh flag lain, semua yang sering dipakai sudah punya alias pendek:
`-n` (`--name`), `-r` (`--target-root`), `-m` (`--md`), `-p` (`--port`),
`-q` (`--quiet`), `-a` (`--apply`). Lihat `tmfgen <perintah> --help` untuk
daftar lengkap.

### Servis baru, satu komponen

```bash
tmfgen scaffold documents/tmf736/5.0.0
tmfgen emit     documents/tmf736/5.0.0
```

`scaffold` menurunkan nama direktori servis dari spec-nya
(`revenue-sharing-algorithm-service` untuk TMF736); override dengan
`-n <dir>`/`--name <dir>` kalau mau nama lain. `emit` harus menyasar pasangan
`--name`/`--target-root` yang persis sama dengan yang dipakai `scaffold`.

### Servis baru, beberapa komponen dalam satu servis

Scaffold sekali (dari komponen *pertama*), lalu `emit` setiap komponen ke
dalamnya:

```bash
tmfgen scaffold documents/tmf673/4.0.0 -n geographic-service
tmfgen emit     documents/tmf673/4.0.0 -n geographic-service
tmfgen emit     documents/tmf674/4.0.0 -n geographic-service
tmfgen emit     documents/tmf675/4.0.0 -n geographic-service
```

Setiap `emit` mendaftarkan komponennya ke `.tmfgen-manifest.json` di dalam
backend dan menggenerate ulang file wiring bersama (`app.module.ts`,
`entities.ts`, `event-types.ts`, `listener.controller.ts`) dari manifest yang
sudah lengkap — jadi jalankan `emit` setiap komponen ke servis yang sama sebelum
menganggap prosesnya selesai.

### Regenerate servis yang sudah ada setelah ada perubahan generator/template

`scaffold` menolak berjalan di atas direktori yang sudah ada, jadi ini
**bukan** cara untuk menerapkan perbaikan `main.ts`/template ke servis yang
sudah pernah di-generate. Ada dua opsi:

- **Jalankan ulang `emit` saja** — otomatis mengambil perubahan apa pun pada
  emitter entity/DTO/controller/service (`src/emit/**`), karena file-file itu
  selalu ditimpa ulang. **Tidak** mengambil perubahan level-scaffold
  (`templates/src/main.ts`, bentuk `.env.example`, kerangka `app.module.ts`).
- **Hapus direktori servis lalu `scaffold` + `emit` ulang dari nol** —
  satu-satunya cara mengambil perubahan scaffold/template. Ini akan membuang
  semua edit manual yang dibuat di luar titik hand-edit generator (§6), jadi
  cek dulu apakah ada edit semacam itu sebelum menghapus.

### Menambahkan komponen ke servis hand-written yang sudah ada

```bash
# 1. dry run — selalu cek ini dulu sebelum --apply
tmfgen inject /path/ke/servis-hand-written/backend documents/tmf679/5.0.0

# 2. terapkan setelah rencananya terlihat benar
tmfgen inject /path/ke/servis-hand-written/backend documents/tmf679/5.0.0 -a
```

`inject` mendeteksi konvensi host (kontrak event emitter, nama infra entity,
gaya listener, base path hub) dan langsung menolak — dengan alasan spesifik —
alih-alih menebak kalau ada yang tidak bisa dipastikan, misalnya host dengan
lebih dari satu kontrak event (pass `--host-emitter <ClassName>` untuk memilih)
atau host yang tidak punya barrel `entities.ts`.

## 6. Tempat menaruh logika custom

Jangan pernah mengedit file yang diawali `// GENERATED by tmfgen - DO NOT EDIT.`
— akan ditimpa diam-diam pada `emit` berikutnya. Ada dua titik ekstensi yang
didukung, keduanya ditulis sekali saja dan tidak pernah disentuh lagi setelah
itu:

- **`src/<resource>/<resource>.hooks.ts`** — `beforeCreate`, `beforeUpdate`,
  `afterFindOne`, dst. Taruh logika business-rule di sini (validasi di luar
  decorator DTO, field turunan, side effect).
- **`src/<resource>/<resource>.controller.extra.ts`** — dibuat sekali kalau
  belum ada; tempat untuk route tambahan hand-written di atas controller hasil
  generate.

## 7. Opsi yang memengaruhi bentuk hasil generate

Diberikan ke `emit`/`inject` (atau diset sebagai default di
`tmfgen.config.json`):

- `--ref-strategy table|flatten` (default `table`) — bagaimana referensi
  tunggal (bukan array) ke resource lain disimpan: `table` menormalisasi
  jadi baris/tabel tersendiri (default, sesuai golden reference); `flatten`
  mendenormalisasi jadi kolom dengan prefix di parent-nya.
- `--soft-delete roots|all` (default `roots`) — `roots` soft-delete hanya pada
  entity aggregate-root; `all` menambahkan `deletedAt`/`deletedBy`/
  `deletedReason` ke semua entity, termasuk sub-resource.

## 8. Memverifikasi hasil generate

Setiap generate sebaiknya diakhiri dengan build sungguhan, bukan cuma exit CLI
yang bersih:

```bash
cd <targetRoot>/<service>
yarn install
yarn build            # tsc lewat `nest build` — menangkap apa pun yang gagal typecheck
```

Untuk perubahan pada generator itu sendiri (template, emitter), jalankan
harness golden-snapshot dulu sebelum mempercayai hasil diff-nya:

```bash
cd generator
node tools/golden.mjs             # verifikasi output saat ini terhadap snapshot tersimpan
node tools/golden.mjs --update     # rekam ulang snapshot (cek dulu diff-nya sebelum ini!)
node tools/golden.mjs --case tmf736-v5   # cuma satu case
```

Harness ini juga menguji determinisme: generate case yang sama dua kali harus
menghasilkan output byte-identik. Kalau perubahan template membuat outputnya
tidak deterministik (misalnya timestamp atau random ID yang bocor ke kode hasil
generate — bukan kode runtime), harness akan gagal hanya karena alasan ini.

## 9. Keputusan desain terkait conformance profile, dan fitur auto-version

### Field yang required di conformance profile tapi optional di OAS — disengaja

Generator menurunkan field *required* murni dari list `required:` schema OAS
itu sendiri, TIDAK dari tabel mandatory-attribute di conformance profile PDF
TM Forum — dan ini **keputusan desain, bukan bug**. Contoh nyata: conformance
profile TMF736 menandai `policy` dan `policy.@type` sebagai wajib (mandatory)
di `POST`, tapi list `required:` di schema OAS `PartyRevSharingAlgorithm_FVO`
cuma berisi `['@type', 'name']`, dan `PolicyRef_FVO` cuma mewajibkan `id`.
Field-field itu tetap ada di DTO hasil generate sebagai atribut **optional**:
diterima dan dikembalikan kalau client mengirimnya, tidak menghalangi request
kalau tidak dikirim. Alasannya:

- **OAS adalah kontrak teknis minimum**; conformance profile & SID adalah
  aturan main yang lebih lengkap (ekspektasi bisnis/fungsional), tapi
  keduanya tidak selalu sinkron satu sama lain pada dokumen resmi TM Forum
  sendiri.
- Memvalidasi lebih ketat dari OAS berisiko menolak request yang justru sah
  menurut spec teknis API, termasuk berisiko menolak request dari CTK sendiri
  kalau CTK mengirim payload minimal yang cuma memenuhi OAS.
- Fleksibel lebih aman daripada ketat di sini: menerima elemen tambahan yang
  dikirim client tidak merusak apa pun, sedangkan menolak elemen yang hilang
  padahal OAS tidak mewajibkannya bisa false-reject request yang valid.

Tidak ada mekanisme override untuk mengubah ini per-komponen — kalau memang
OAS sendiri hilang sebuah properti yang seharusnya ada (bukan cuma soal
required/optional, tapi propertinya benar-benar tidak dideklarasikan sama
sekali), itu perlu diperbaiki di file spec-nya, bukan ditambal di generator.

### Auto-version untuk atribut `version`

Untuk resource TMF ODA mana pun yang punya atribut bernama persis `version`
(di root ATAU di sub-resource, termasuk item di dalam array), generator
menghasilkan kode yang mengelola nilainya sendiri — client tidak pernah bisa
mengisinya lewat payload:

- **Create** (resource baru, atau item array yang tidak cocok dengan item
  lama manapun): `version` selalu dipaksa `"1.0"`.
- **Update** pada baris yang punya "state sebelumnya" untuk dibandingkan (PATCH
  root itu sendiri; ATAU, untuk sub-resource array yang di-delete+rebuild
  total setiap PATCH parent, sebuah item baru yang cocok dengan item lama
  lewat identity key alami — `id` client untuk sub-resource biasa, atau `id`
  yang tersimpan sebagai `refId` untuk reference-wrapper seperti `PolicyRef`):
  - **Major bump** (`"1.7"` → `"2.0"`) kalau ada field yang ada di `required:`
    OAS milik entity itu sendiri yang dihapus/di-null-kan/dikosongkan.
  - **Minor bump** (`"1.0"` → `"1.1"`) untuk perubahan lain apa pun pada field
    milik entity itu sendiri.
  - **Tidak ada bump** kalau tidak ada perubahan nilai sama sekali.
  - Diff hanya melihat field milik entity itu sendiri — perubahan di nested
    child/array di bawahnya tidak ikut memicu bump di parent.
- **Batasan yang disengaja**: entity `kind: 'ref'` (referensi tunggal/non-array
  yang dinormalisasi lewat `refToPlan`, mis. sebuah single `relatedParty`
  field) selalu dapat baris & PK baru setiap update, tanpa identity yang bisa
  dicocokkan — kalau entity semacam ini kebetulan punya kolom `version`,
  nilainya selalu `"1.0"`, tidak pernah di-carry-forward.

Karena field-nya cukup dideteksi lewat namanya, tidak ada opsi CLI/config yang
perlu diaktifkan — otomatis berlaku untuk komponen apa pun yang punya atribut
`version`.

### `@type`/`@baseType`/`@schemaLocation` immutable di PATCH, dan `href` di owned sub-resource

Dua gap yang sebelumnya tercatat di sini sudah diperbaiki di generator:
`@type`/`@baseType`/`@schemaLocation` sekarang tidak bisa diubah lewat PATCH
apa pun isi body-nya (berlaku generik untuk semua komponen), dan sub-resource
yang dimiliki langsung (owned, bukan reference-wrapper — mis. item
`actionVariable[]`/`conditionVariable[]` di TMF736) sekarang mendapat `href`
tersintesis di response (`.../{rootSegment}/{rootId}/{ownProperty}/{ownId}`,
identifier-shaped, bukan route yang benar-benar bisa di-dereference).

## 10. Troubleshooting

- **`error: cannot load spec` / `$ref` tidak bisa diresolusi** — spec vendor-nya
  sendiri yang cacat (pernah terjadi di TMF685 3.0.0). Bukan bug generator;
  perbaiki spec-nya atau laporkan ke pihak yang membuatnya.
- **`error: <backendDir> not found — run tmfgen scaffold first`** — `emit`/
  `inject` dijalankan ke servis yang belum pernah di-scaffold (atau di-scaffold
  dengan `--name`/`--target-root` berbeda). Cek keduanya sama persis.
  Kalau memang sudah pernah di-scaffold di sesi sebelumnya lalu benar-benar
  hilang (terhapus, atau sesi/shell yang reset menghapus workspace yang belum
  tersimpan), harus `scaffold` lagi — ini akan menghilangkan semua edit manual
  di luar file `.hooks.ts`.
- **`error: <serviceDir> already exists`** — lihat §5, "Regenerate servis yang
  sudah ada."
- **`EBUSY: resource busy or locked` saat membersihkan direktori kerja
  (Windows)** — biasanya ada `node.exe` tersisa (bekas `nest start --watch`,
  atau server yang lupa dimatikan) yang masih memegang file handle. Cek
  `tasklist | grep node`, hentikan proses yang tersisa itu, coba lagi.
- **Dua servis berebut port yang sama** — `allocatePort` sudah memindai setiap
  `<service>/backend/.env`, `.env.example`, dan `main.ts` di bawah `targetRoot`
  sebelum mengalokasikan, jadi ini seharusnya cuma terjadi kalau ada port yang
  di-hardcode manual di luar jangkauan scan itu. Perbaiki nilai yang
  di-hardcode itu, bukan generator-nya.

## 11. Frontend generator (fe-spec + fe-gen)

Pipeline frontend berdiri di atas engine yang sama (IR, determinism, golden), dan sejak
plan `General Frontend Generator` (F0-F8) berkembang jadi general-purpose: YAML apa pun
yang memenuhi `src/schema/fe-spec.schema.json` bisa digenerate — TMF adalah salah satu
domain (via `fe-spec`, opsional), bukan satu-satunya cara masuk. Lihat
`examples/fe-spec-inventory.yaml` (manajemen inventaris gudang, non-TMF, ditulis tangan)
sebagai bukti.

```
fe-spec (opsional, khusus TMF)   fe-ir              fe-gen scaffold        fe-gen emit
IR TMF -> frontend-spec.yaml  ─┐                                              │
                                ├─> validate+normalize -> FEIR (.feir/*.json) ─┤
YAML ditulis tangan (non-TMF) ─┘        │                       │             │
                                         │                kerangka CRA5+Craco │
                                         │                 ke feTargetRoot    │
                                         ▼                                    ▼
                                 checkApiRegistry,                  list/form/detail/
                                 checkDashboardSources,              dashboard pages,
                                 pruneAjvErrors+formatErrors          api client + zod +
                                 (pesan actionable, §20)              types.generated.ts,
                                                                       routes/ui/bootstrap
```

### CLI

```
node src/cli.mjs fe-ir --spec <fe-spec.yaml>                        # validate + build FEIR
node src/cli.mjs fe-gen scaffold --spec <fe-spec.yaml> --out <dir> --port <n>
node src/cli.mjs fe-gen emit --spec <fe-spec.yaml> --out <dir>/<meta.name>

# khusus TMF (opsional): IR BE -> baseline fe-spec.yaml
node src/cli.mjs fe-spec --component documents/tmf736/5.0.0 --out frontend-spec-tmf736.yaml
```

Contoh nyata: `examples/fe-spec-inventory.yaml` (non-TMF lengkap: list+filter, form
tambah dengan payload transform, detail bertab, dashboard) dan
`frontend-spec-tmf736-fe-default.yaml` (TMF736, fe-default).

### Kontrak schema (`src/schema/fe-spec.schema.json`)

Skema tunggal, `x-semantic-vocabulary` (26 semantic type) sebagai satu-satunya sumber
kosakata UI netral-library. Bagian utama:

- **`meta`/`api`/`output`/`ui`/`formEngine`/`layout`/`auth`** — wajib, konfigurasi app.
  `output.type: full-repo | mfe` menentukan mode (§ konvensi CRA5+Craco tim, MFE via
  Webpack Module Federation).
- **`pages[]`** — `view: list | form | detail | dashboard`. Tiap view punya blok sesuai
  namanya (`list`, `form`/`forms`, `detail`, `dashboard`).
- **`apis[]` + `models{}`** (opsional) — registry API bertipe. `apiDef` punya
  `request.body`/`response.shape`; `shapeNode` berdiskriminator `kind` (BUKAN `type` —
  menghindari classifier semantic FE di `buildFEIR.scan()`). Dirujuk lewat `apiRef`
  (`listView`/`formDef.api`/`detailView`) atau `dashboardSource` (`<apiName>.<path>`).
  Tanpa `apis[]`, `api.endpoints` (map ringkas `nama -> 'METHOD /path'`) tetap sah.
- **Field type** (`$defs.fieldType`) — `text, textarea, number, email, password, select,
  toggle, repeatable, date, datetime, checkbox, radio, autocomplete`. Validasi deklaratif
  first-class: `required, minLength, maxLength, min, max, pattern`; `validation[]` bebas
  tetap ada sebagai escape hatch (menang bila rule sama didefinisikan dua kali).
- **Payload transform** — `field: { source: "form.x" | "fields.x" | "item.x", transform:
  <verb> }`. 10 verb tertutup: `id, name, value, string, number, boolean, trim, iso-date,
  array-ids, json`. Diserialisasi jadi `{$src,$tx}` di FEIR, diterapkan runtime oleh
  `applyTransform()` di `StandardFormModal.tsx`. Field yang memakai transform tidak bisa
  di-inverse saat edit (dikosongkan, dengan warning eksplisit saat emit).
- **`dashboard`** — `stats[]` (kartu angka), `charts[]` (placeholder v1 — TIDAK
  dirender, tanpa dependency chart baru, tetap satu warning per chart), `tables[]`
  (tabel baca-saja). Sumber data selalu lewat `apis[]` (bukan `api.endpoints`).

### Validasi (`src/fe/validateFESpec.mjs`)

ajv 2020-12 (`verbose: true`) + `pruneAjvErrors()` (buang derau kombinator `oneOf/anyOf/
allOf/if/then/else` kecuali itu satu-satunya error) + gate tangan:
`checkUiVersion`, `checkHeaders` (secret WAJIB `{{config.*}}`, dilarang `{{env.*}}`),
`checkIcons` (whitelist `lucide-icons.json`, termasuk `dashboard.stats[].icon`),
`checkApiRegistry` (nama `apis[]` unik, `apiRef`/`kind:ref` resolve, deteksi siklus),
`checkDashboardSources` (`dashboardSource` merujuk `apis[].name` yang ada). Semua error
melalui **satu** `formatErrors()` — dipakai validator CLI, `fe-ir`, dan `fe-gen
scaffold/emit` — sehingga formatnya konsisten:

```
Invalid FE Spec: <file>:

pages[0].forms.add.fields[1].type   (line 164)

Unknown field type: "dropdownn"

Supported:
- text
- textarea
- ...
```

### Emitter (`src/fe/emit/`)

Konvensi: file `<kind>.mjs` mengekspor `emit<Kind>s(feir, appDir) -> {written, summary,
warnings}`, **didaftarkan** di `EMITTER_KINDS` (`src/fe/emit/index.mjs`) — meletakkan file
saja tidak cukup, harus ditambahkan ke array itu juga.

| Kind | Urutan | Fungsi |
|---|---|---|
| `apitype` | 1 (pertama) | `apis[]`/`models{}` -> `src/gen/api/types.generated.ts` (interface TS, dilewati total bila spec tidak punya registry) |
| `page` | 2 | List page + `src/gen/api/<resource>.ts`. `apiFile()` pakai tipe registry untuk payload create/update HANYA bila `forms.*.api.ref` resolve — jalur lama (`Record<string, unknown>`) tetap dipakai bila tidak |
| `form` | 3 | Modal add/edit: `zodSchemas.ts` + `AddForm.tsx`/`EditForm.tsx`. Preflight: setiap field type di-`adapter.resolve()` lebih dulu — field yang UNSUPPORTED untuk library aktif gagal SEBELUM generate, bukan diam-diam jadi input generik |
| `detail` | 4 | Halaman detail: tab diderivasi dari bentuk API (scalar → tab Overview; tiap array-of-object → satu tab) |
| `dashboard` | 5 | `view: dashboard` -> `src/pages/<id>/Dashboard.tsx`: stat card, chart placeholder (TIDAK fetch data), tabel baca-saja |
| `mfe` | 6 | `output.type: mfe`: `craco.config.js` (Module Federation) + `exposes/*.tsx` + `.tmfgen-fe-manifest.json` (idempoten, hash per file) |

Semua emitter memakai teknik yang sama untuk import: sentinel di-`push()` dulu
(`CRUD_IMPORT_SLOT`, `UI_IMPORT_SLOT` di `page.mjs`/`detail.mjs`), diisi SETELAH body
selesai dibangun dengan menyaring simbol yang benar-benar muncul di teks — bukan dari
kondisi yang menyusun body. Ini yang menjamin nol unused-import (§21) walau kombinasi
fitur berubah-ubah antar spec.

### Kontrak adapter library (`libs/README.md`)

5 bagian: `components`/`resolve(semantic, props)`, `coverage()`, `theme(tokens,
darkMode)`, `scaffoldDeps()`, `gateCommand()`, plus `libraryWarnings()`. Tiga adapter
live, **ketiganya wajib berbentuk sama** (dijaga gate coverage):

| | mui | neudela | **fe-default** |
|---|---|---|---|
| Paket | `@mui/material` v9 | `neudela` (sub-repo) | **tidak ada** — komponen lokal `src/components/*`, Tailwind + CSS var token |
| `stat-card` | fallback (rakit Card+Typography) | fallback (rakit NeuronCard) | **covered** (`StatCard.tsx`) |
| `chart` | unsupported (sengaja, v1) | unsupported (sengaja, v1) | unsupported (sengaja, v1) |
| `radio-group` | covered | **unsupported** (`NeuronRadioGroup` butuh children ter-komposisi, bukan `options` datar) | covered |
| `typeahead`/`autocomplete` | covered (`Autocomplete`) | unsupported | unsupported (kombobox sungguhan di luar scope v1) |

Cara register lib baru: bagian "Cara register lib baru" di `libs/README.md`. Setiap
semantic WAJIB punya entri `covered`/`fallback`/`unsupported` **bernote** — gap diam
(tanpa note, tanpa masuk `libraryWarnings()`) digagalkan gate coverage.

### Template (`templates/fe-{mui,neudela,fe-default}/`)

`fe-default` adalah target pengembangan utama saat ini: CRA5+Craco+Tailwind, nol
dependency UI eksternal, ~35 komponen lokal (`src/components/*`) + runtime `src/gen/*`
(`useCrudPage`, `StandardList`, `StandardFormModal`, `uiwrappers.tsx`). Server-mode murni
(pagination/sort/search/filter semua lewat query param, tidak ada re-slice/re-sort
client-side). `fe-mui`/`fe-neudela` distabilkan lebih dulu (M0-M6 lama) dan saat ini
**tidak dikembangkan lebih lanjut** kecuali perubahan yang genuinely dibagi lewat emitter
bersama (`page.mjs`/`form.mjs`/`detail.mjs`) — keduanya diketahui gagal `npm install`
bersih (`typescript ^5.9.0` vs peer `react-scripts@5` yang minta `^3.2.1 || ^4`; belum
diperbaiki, di luar scope saat ini).

### Gates

- **`tools/fe-coverage.mjs`** — 3 adapter × `x-semantic-vocabulary`: coverage lengkap, 0
  gap diam, `resolve()` fail-closed untuk semantic tak dikenal, setiap adapter
  mengekspor kontrak lengkap (termasuk `libraryWarnings`).
- **`tools/fe-golden.mjs`** — determinism (generate 2x, byte-identik) + golden match.
  Matrix `golden/fe/` (6 app case, port dipin supaya byte-stable):
  `mui-indigo-full` (5012), `mui-indigo-mfe` (5013), `neudela-warn-full` (5014),
  `fe-default-full` (5015), `fe-default-dashboard` (5016), `fe-default-mfe` (5017).
  Spec hilang = **FAIL** (bukan `BLOCKED` yang tetap lolos — pernah membuat gate hijau
  padahal separuh matrix tidak menguji apa pun, lihat §21). `--update` untuk rekam ulang,
  `--case <nama>` untuk satu case, `--diff` untuk hunk lengkap saat gagal.
- **`tools/fe-negative.mjs`** — 5 fixture invalid (`golden/fe-spec/invalid/*.yaml`) di-
  byte-compare ke `.expected.txt`: format error (§20) tidak boleh regresi diam-diam.
- **`tools/fe-build-verify.mjs`** — **di luar** `check-all` (sengaja): `npm install` ->
  `tsc --noEmit` -> `craco build` (eslint ikut di build CRA) pada app hasil generate
  NYATA. Gate akhir tiap milestone, bukan tiap commit (statis+golden sudah cukup cepat
  untuk itu). `--spec <yaml> --port <n>` atau `--app <dir>` (app yang sudah terinstal).
- **`tools/check-all.mjs`** (statis, hitungan detik) — golden matrix, schema-validate
  10 spec, coverage, negative-fixture, grep guardrail (0 hit: `common_remote`,
  `@mui/x-data-grid-pro`, `@mui/x-charts`, `zustand`, import `.tsx`, secret di
  `REACT_APP_*`).

### Boundary hybrid

Determinism/golden berlaku pada file *emitted* (`src/pages`, `src/gen/api|ui|routes`,
zod, craco, fe-spec YAML). Runtime `src/gen/{useCrudPage,StandardList,
StandardFormModal,uiwrappers}.tsx` adalah lapisan template yang di-scaffold sekali dan
diuji terpisah (`fe-build-verify`) — perubahan di sana selalu memicu rebaseline golden
untuk app case yang memakai library itu.

Referensi implementasi: `src/fe/buildFEIR.mjs`, `src/fe/scaffoldApp.mjs`,
`src/fe/emit/index.mjs` (+ `apitype.mjs`, `page.mjs`, `form.mjs`, `detail.mjs`,
`dashboard.mjs`, `mfe.mjs`), `src/fe/allocateFePort.mjs`, `src/fe/emitFESpec.mjs`
(jalur IR-TMF -> `frontend-spec.yaml`, opsional). Retrospektif lengkap tiap milestone
(F0-F8, keputusan desain, bug yang ditemukan, known limitations): `TMFGEN-PLAN.md` §21
dan seterusnya.
