# Gap analysis: FE neudela hasil generate ⇄ BE NestJS hasil generate

**Tanggal:** 2026-10-02 (temuan tambahan dan keputusan: 2026-10-03)
**Status:** terbuka. Rencana perbaikan disetujui; lihat §6 (keputusan), §7 (temuan tambahan), §8 (pelacak status).
**Alat ulang:** `tools/neudela-be-probe.mjs`

Pertanyaan yang dijawab: bila FE dari adapter neudela (`fe-spec --ui neudela` + `fe-gen scaffold`) dijalankan terhadap backend NestJS dari `tmfgen scaffold` + `emit` untuk TMF yang sama, apa yang tidak cocok?

Jawabannya dibuktikan dengan menjalankan, bukan dengan membaca kode saja.

---

## 1. Metode

1. **Backend sungguhan.** BE di-generate untuk TMF736 v5, TMF620 v5, TMF642 v5, dan TMF673 v4. TMF673 memakai `--nested-routes`. Semuanya di-build dan dijalankan dengan SQLite (`SKIP_AUTH=true`, tanpa RabbitMQ).
2. **Probe kontrak** (`tools/neudela-be-probe.mjs`). Probe memakai kode runtime FE yang sama dengan app hasil generate, yaitu `buildPayload`, `valuesFromRecord`, `buildPatch`, `toJsonPathFilters`, dan `toSortParam` dari `design-lab/neudela-lab/src`. Untuk setiap halaman resource di spec, probe mengirim:
   - `GET` list dengan `offset`/`limit`, lalu memeriksa header `X-Total-Count`;
   - setiap `sortOptions`, naik dan turun (`sort=key` / `sort=-key`);
   - setiap `filterFields` sebagai `filter=` JSONPath (teks `=~ /a/i`, rentang tanggal, field ber-`list`), ditambah kotak search;
   - `POST` dengan **semua field form terisi** (nilai sintetis per kontrol). Bila gagal, dicoba lagi dengan field wajib saja;
   - `GET` record → `valuesFromRecord` → `buildPayload` lagi. Hasilnya dibandingkan dengan payload yang dikirim (round trip);
   - kolom list (`rowFrom`) dan field record page (key-value / timeline): mana yang kosong untuk record yang baru dibuat;
   - edit: `buildPatch` untuk mengubah teks, mengosongkan atribut opsional (`null`), dan mengosongkan list (`[]`);
   - resource nested di bawah record parent, dan `DELETE`;
   - Event Hub dengan pola yang sama.
3. **Browser.** Lab TMF736 dijalankan dalam mode `dev` biasa (bukan `dev:mock`) dengan proxy `/tmf-api` ke BE. LOV policy dilayani instance lab `dev:mock` lain (`VITE_POLICY_API_BASE_URL`). Alurnya: list, create lewat form, search, sort header, record page, edit, delete, hub.

### Menjalankan ulang

```bash
# BE (contoh TMF736), di path TANPA folder ber-titik bila nanti menjalankan jest
node src/cli.mjs scaffold --component ../documents/tmf736/5.0.0 --target-root D:/tmp-be --name be736
node src/cli.mjs emit     --component ../documents/tmf736/5.0.0 --target-root D:/tmp-be --name be736
cd D:/tmp-be/be736 && corepack yarn install && corepack yarn build
cd backend && PORT=3736 DATABASE_TYPE=sqlite DATABASE_PATH=./probe.db DATABASE_SYNCHRONIZE=true SKIP_AUTH=true RABBITMQ_URL= node dist/main.js

# FE spec + probe (dari generator/)
node src/cli.mjs fe-spec --component ../documents/tmf736/5.0.0 --ui neudela --out /tmp/spec736.yaml   # atau golden/fe-spec/neudela-tmf736.yaml
node tools/neudela-be-probe.mjs /tmp/spec736.yaml http://127.0.0.1:3736          # ringkasan
node tools/neudela-be-probe.mjs /tmp/spec736.yaml http://127.0.0.1:3736 --json   # baris mentah
```

Port BE mengikuti identitas komponen (`3` + nomor TMF, mis. 3736). Port ini sama dengan default proxy FE (`environment.apiProxyTargetDefault`).

---

## 2. Yang sudah selaras (terbukti)

| Area | Bukti |
|---|---|
| Paging | `offset`/`limit`; header `X-Total-Count` dan `X-Result-Count` dikirim dan di-expose lewat CORS |
| Port, base path, CORS | port BE `3<TMF>` = target proxy FE; `/tmf-api/...` sama; `enableCors` mengizinkan `*` |
| Sort | semua `sortOptions` di 4 TMF diterima, termasuk `lastUpdate` / `createdDate` (`timestamps` di filter schema) |
| Filter + search | semua `filterFields` di 4 TMF diterima: `filter=` JSONPath, `=~`, rentang tanggal, `list[?(…)]` |
| Create | ref (`@type` / `@referredType`, tanpa `href`), number, JSON, value object (`validFor`), list bertingkat diterima. List bertingkat kembali utuh |
| Edit | hanya atribut yang berubah; `null` menghapus atribut; list diganti utuh |
| Delete | 204 |
| Event Hub | `POST` dengan `@type: Hub`, `GET /hub`, `GET /hub/{id}`, filter, `DELETE`: semua cocok |
| Nested (dengan `--nested-routes`) | `GET /parent/{id}/child` ter-scope ke parent; item dari parent lain → 404 |
| Error | body TMF Error (`code`, `reason`, `message`) dibaca FE dari `message` |
| Browser TMF736 (mode real) | list, create via form + LOV, search, sort, record, edit, delete, hub record: tanpa request gagal dan tanpa error console |

---

## 3. Daftar gap

Kolom **Sisi**: BE = generator NestJS, FE = adapter neudela, Keduanya = perlu kesepakatan.

### Tinggi: data salah atau fitur tidak bisa dipakai

| ID | Sisi | Gap | Bukti | Lokasi | Usulan |
|---|---|---|---|---|---|
| **G1** | BE | **Dua list dengan kelas Ref yang sama saling tercampur.** TMF642 `Alarm.correlatedAlarm` dan `Alarm.parentAlarm` sama-sama `@OneToMany(() => AlarmRef, child => child.owner)` dengan kolom `owner` yang sama dan tanpa pembeda | POST `correlatedAlarm:[CORR-1]`, `parentAlarm:[PARENT-1]` → GET mengembalikan **keduanya di kedua list** (`["PARENT-1","CORR-1"]`). Ini korupsi data | `src/emit/entityPlan.mjs` (reuse kelas Ref lintas properti) | tabel/entitas per properti, atau kolom diskriminator `ownerField` di tabel ref bersama + `where` pada relasi |
| **G2** | BE | **TMF620 ProductOffering tidak bisa create/read di SQLite**: `SQLITE_ERROR: at most 64 tables in a join` | POST → 500 (INSERT sukses, read-back gagal); juga untuk payload field wajib saja | `src/emit/service.mjs:582` (semua relasi `leftJoinAndSelect` dalam satu query) | muat relasi dalam beberapa query (relationLoadStrategy `query` / load per cabang), atau batasi kedalaman join; Postgres juga diuntungkan |
| **G3** | BE | **TMF620 tidak bisa di-generate tanpa campur tangan.** (a) `emit` berhenti: nama tabel 80 karakter > batas 63 Postgres, perlu override manual di `tmfgen.config.json`. (b) Hasilnya **tidak compile**: `product-specification.service.ts` memakai `rootId` yang tidak didefinisikan. Corpus sweep tidak menangkap ini karena tidak meng-compile | `emit` gagal sampai `overrides["ProductOffering.prodSpecCharValueUse.productSpecCharacteristicValue"]` diisi; `yarn build` → `TS2304 Cannot find name 'rootId'` (dist tetap ter-emit) | (a) `src/emit/index.mjs:86`; (b) `src/emit/service.mjs:183`: mapper child ref-like tanpa parameter `rootId` meneruskan `rootId` ke anaknya | (a) pemendek nama tabel otomatis yang deterministik (hash suffix); (b) teruskan `rootId` di semua mapper berantai, dan tambahkan `tsc` ke sweep untuk sampel komponen besar |
| **G4** | FE | **Objek tunggal besar yang wajib tidak punya kontrol, sehingga create selalu gagal.** TMF673 `GeographicAddressValidation.submittedGeographicAddress` (GeographicAddress, > 6 atribut) | POST → 400 `submittedGeographicAddress should not be null or undefined`. FE hanya memberi warning saat `fe-spec` | `src/fe/neudela/emitSpec.mjs` (`valueObjectColumns`: ≤ 6 atribut) | kontrol group bertingkat / form section untuk objek besar, atau minimal: halaman tanpa tombol create plus alasan bila objek wajib tidak bisa diisi |
| **G5** | Keduanya | **Resource nested bergantung pada flag BE.** FE memanggil path OAS `/geographicAddress/{id}/geographicSubAddress`; BE default (`nestedRoutes: false`) melayani `/geographicSubAddress` (flat) | default → 404 di path nested; `--nested-routes` → 200. Selain itu sub-address nested disimpan di tabel terpisah (`geographic_sub_address`) dari list embedded parent (`geographic_address_geographic_sub_address`), sehingga tab FE dan JSON parent bisa berbeda isi | BE `src/cli.mjs:256`, `config.nestedRoutes`; FE `emitSpec.mjs` (nested menggantikan tab embedded) | tentukan satu kontrak: FE membaca mode BE (manifest / opsi `fe-spec --nested-routes`), dan/atau BE menyatukan penyimpanan nested + embedded |

### Sedang

| ID | Sisi | Gap | Bukti | Lokasi | Usulan |
|---|---|---|---|---|---|
| **G6** | Keduanya | **`lastUpdate` / `createdDate` tidak pernah ada di response BE**, padahal FE menampilkan kolom Last Update, timeline, dan stat "Last update" | 4 TMF: kolom `lastUpdate` dan field `createdDate` kosong; browser: "Last update — Not provided". BE tetap bisa filter/sort keduanya (`timestamps`) | BE `src/emit/service.mjs` (`isHousekeeping` dibuang dari mapper); FE `emitSpec.mjs` (`opts.timestamps`) | **perlu keputusan**: expose sebagai atribut ekstensi di response, atau FE menyembunyikan kolom/timeline bila OAS tidak mendeklarasikannya |
| **G7** | FE | **`version` server-managed di BE, tetapi FE menampilkannya sebagai input teks** (top-level dan di entri, mis. TMF620 Category / ProductCatalog / ProductOfferingPrice / ProductSpecification, `bundledProductSpecification[].version`) | kirim `"Probe version"` → kembali `"1.0"`; PATCH `version` diabaikan (atau naik ke `1.1`). Isian user hilang diam-diam | BE `entityPlan.mjs:163` (`isVersion: name === 'version'`); FE `emitSpec.mjs` (`FORMABLE`) | FE mengeluarkan atribut `version` dari form (aturan yang sama dengan BE), dan menampilkannya read-only di record |
| **G8** | BE | **PATCH kadang 500 di SQLite**: `TransactionNotStartedError: Transaction is not started yet` di `*.service.update` | muncul di TMF736 dan TMF620, kira-kira 1 dari 4 run probe; tidak muncul bila request dikirim satu per satu. Data tetap berubah | `src/emit/service.mjs` (update dalam `dataSource.transaction`) | dugaan, belum dikonfirmasi: tulisan lain (event store / outbox) memakai koneksi SQLite tunggal bersamaan dengan transaksi. Perlu reproduksi terarah lalu serialisasi tulisan atau pakai queryRunner yang sama |
| **G9** | FE | **Lookup (LOV) ke API lain.** (a) `searchLookup` tidak mengirim `X-API-Key`, jadi 401 bila API tujuan memakai auth. (b) Pencarian memakai `name=<ketikan>` dan mengandalkan konvensi BE tmfgen (`name` = contains). API TMF standar memperlakukan `name=` sebagai sama persis (TMF630), jadi ketikan sebagian tidak menemukan apa pun | kode: `design-lab/neudela-lab/src/service/lookupService.ts:55` (fetch tanpa header); registry `libs/neudela/ref-registry.yaml` (`queryParam: name`) | FE runtime + registry | header auth per API lookup (env), dan mode pencarian per API di registry: `name` (tmfgen), `filter=` JSONPath `=~`, atau `name=` exact + filter klien |

### Rendah

| ID | Sisi | Gap | Bukti / lokasi | Usulan |
|---|---|---|---|---|
| G10 | Keduanya | BE mengembalikan `@baseType` / `@schemaLocation` sebagai `""` (sengaja, untuk profil CTK), sehingga baris record page FE kosong | `src/emit/behaviour.mjs:65-68` (`ALWAYS_PRESENT_TRAILER`, `EMPTY_TRAILER_VALUE`) | FE memperlakukan `""` sebagai kosong (sembunyikan baris / tampilkan "—") |
| G11 | BE | Response resource nested membocorkan kolom internal parent (`geographicAddressId`) | GET `/geographicAddress/ADDR-1/geographicSubAddress` → item memuat `"geographicAddressId":"ADDR-1"` | buang kunci parent dari mapper (sudah tersirat di path / href) |
| G12 | BE | PATCH `policy: []` diterima padahal OAS mewajibkan `minItems: 1` | `PATCH {policy: []}` → 200. FE mencegahnya lewat rule form, tetapi klien lain tidak | validasi `minItems` juga di DTO update |
| G13 | Keduanya | Auth hanya jalan karena `SKIP_AUTH=true`. Tanpa itu BE mengharapkan `API_KEY` (default `dev-key-123`) sementara `VITE_API_KEY` FE kosong, sehingga semua request 401 | `templates/src/common/guards/api-key.guard.ts`; `.env.example` FE dan BE | samakan default dev di kedua `.env.example`, atau dokumentasikan pasangannya |
| G14 | — | TMF620 `*_FVO` mewajibkan `lastUpdate`, jadi user harus memilih tanggal "Last update" saat create. Ini konsisten dengan OAS dan BE, hanya UX-nya ganjil | OAS TMF620 | pertimbangkan isi otomatis (sekarang) untuk atribut audit yang diwajibkan OAS |
| G15 | BE (go-gin) | Adapter go-gin belum mendukung `filter=` JSONPath, sehingga FE neudela terhadap BE Go gagal di filter dan search | TMFGEN-PLAN §33 | port `common/filter` ke Go |

### Catatan probe (bukan gap)

- **TMF642:** field yang tidak ada di form create (mis. `externalAlarmId`, `ackSystemId`, `clearUserId`) kosong di record page. Ini wajar karena diisi operasi lain atau ditolak field policy.
- **Hub record page:** sempat gagal di uji browser karena timing klik saat toast masih menutup; diulang dan berhasil (`GET /hub/{id}` 200).

---

## 4. Ringkasan hasil probe per TMF

| TMF | Halaman | Temuan utama |
|---|---|---|
| 736 v5 | algorithm, hub | 26/29 ok. Sisa: G6 (lastUpdate), G10 (trailer), G8 (PATCH list kosong 500, intermiten) |
| 642 v5 | 7 resource + hub | **G1** (Alarm ref list tercampur); G6 dan G10 di semua resource |
| 620 v5 | 7 resource + hub | **G2** (ProductOffering 500), **G3** (generate/compile), **G7** (`version`), G8, G6, G10 |
| 673 v4 | 2 resource + nested + hub | 38/41 ok. **G4** (validation create 400), **G5** (nested hanya dengan `--nested-routes`), G11 |

---

## 5. Yang perlu dibahas

1. **G6.** `lastUpdate` / `createdDate`: di-expose BE, atau disembunyikan FE bila tidak ada di OAS?
2. **G5.** Kontrak nested: apakah `--nested-routes` jadi default untuk BE yang dipasangkan dengan FE neudela, atau FE mengikuti mode BE?
3. **G4.** Objek tunggal besar yang wajib: bangun kontrol form bertingkat, atau nyatakan resource itu "tidak bisa dibuat dari UI"?
4. **G9.** Pencarian LOV ke API non-tmfgen: mode pencarian per API di `ref-registry.yaml`?
5. **G1–G3.** Perbaikan generator BE: G1 dan G3b bug murni, G2 dan G3a keputusan desain kecil.

### Usulan urutan setelah diskusi

G1 → G3 → G2 → G7 → G6 (sesuai keputusan) → G5 → G4 → G9 → sisanya.

Setelah itu `tools/neudela-be-probe.mjs` dijadikan gate (mis. `check-all --fe-be-contract`) untuk sampel TMF, supaya gap yang sudah ditutup tidak muncul lagi.

---

## 6. Keputusan (user, 2026-10-03)

1. **G6:** BE meng-expose `createdDate` dan `lastUpdate` (read-only) di response, dan FE menampilkannya.
2. **G5 + arah umum: FE mengikuti BE.** BE sudah terkonfirmasi lolos CTK, jadi bagian API di YAML FE (path, operasi, request, response) harus **identik** dengan BE.
   - Kontrak API diturunkan dari generator BE (modul bersama `src/contract/apiContract.mjs`, ditulis BE sebagai `api-contract.json`).
   - FE neudela mengonsumsi kontrak itu, bukan menafsirkan ulang OAS.
   - Route nested atau flat mengikuti BE.
3. **G4:** bangun kontrol untuk atribut wajib yang belum punya input: LOV untuk `resourceRefs`, fieldset bertingkat untuk objek besar. Resource yang tetap tidak bisa diisi tidak diberi tombol create, disertai alasan.
4. **Cakupan verifikasi:** semua komponen TMF di SQLite, ditambah sampel di Postgres lokal (`TEST_DATABASE_URL` diisi user). Tanpa Docker.

Rencana lengkap ada di TMFGEN-PLAN.md §36. Urutannya: F0 discovery sweep, F1 kontrak tunggal, F2 BE, F3 FE, F4 gate, F5 verifikasi.

---

## 7. Temuan tambahan (eksplorasi kode 2026-10-03, ★)

| ID | Sisi | Temuan | Akar penyebab |
|---|---|---|---|
| G1b | BE | PATCH satu list ikut menghapus list kembarannya yang memakai kelas Ref sama (delete berdasarkan owner saja) | `src/emit/service.mjs:696`; reuse kelas di `entityPlan.mjs:407-418`, `:460-469` (`shapeHash` tanpa `ownerField`) |
| G2b | BE | `eager: true` di semua relasi membuat graf join `findOne` merambat lintas resource lewat kelas bersama. TMF620 ProductOffering v5: 41 join eksplisit, graf eager ≥ 63 tabel | `entity.mjs:167/188/199`; `service.mjs:401-413`, `:607-610`, `:644-647` |
| G3c | Gate | `tools/sweep-emit.mjs` tidak meng-compile, sehingga G3b lolos "130/130 OK" | `tools/sweep-emit.mjs` |
| G4b | FE | `r.resourceRefs` tidak pernah dibaca emitSpec. Atribut wajib berbentuk resourceRef hilang dari form **tanpa warning**: TMF673 `submittedGeographicAddress`, TMF620 ProductOffering.productSpecification, TMF622 CancelProductOrder.productOrder, TMF654 bucket/receiverBucket, TMF668, TMF686 graphSource, TMF708 ×4, TMF909 ×4, TMF915 aiModelSpecification. Atribut wajib lain yang juga tidak dirender: TMF628, TMF642 ×6, TMF908 category, TMF915 Alarm.alarmedObject, TMF931 productOrderItem | `src/fe/neudela/emitSpec.mjs` (`resourceModel`, `formConfig`) |
| G4c | FE | Tombol create tetap muncul walau ada atribut wajib tanpa kontrol | `emitSpec.mjs` `listConfig` (`primaryAction` hanya bergantung pada `operations.create`) |
| G5b | BE | Dengan `--nested-routes`, sub-resource nested disimpan di tabel terpisah dari list embedded parent (TMF673: `geographic_sub_address` vs `geographic_address_geographic_sub_address`) | `src/emit/index.mjs:63-71`, `nestedRoutes.mjs` |
| G6b | FE | Filter `lastUpdate` dobel bila OAS juga mendeklarasikannya (TMF620); `serverManaged` di schema menimpa definisi spec | `emitSpec.mjs` `listConfig` (filter tanggal + `opts.timestamps`), `schemasFrom` |
| G7b | BE/FE | DTO create mewajibkan `version` bila OAS mewajibkannya (TMF704 TestCase/TestSuite/NonFunctionalTestModel, TMF705 ×4, TMF706 ×2, TMF709), padahal BE mengabaikan nilainya (server-managed). `version` di entri: TMF620 bundledProductSpecification, TMF711 constraint, TMF759/915 featureSpecification, TMF908/909/915 | `src/emit/dto.mjs` (tanpa pengecualian `isVersion`) |
| G8 (akar) | BE | `emitEvent` dipanggil tanpa `await` (create/update/remove), dan event store menulis lewat repository default di luar transaksi. Saat SQLite memakai satu QueryRunner bersama, tulisan ini bertabrakan dengan `dataSource.transaction` request berikutnya | `service.mjs:448-450`, `templates/src/event/event-emitter.service.ts:26-28`, `event-store.service.ts:25` |
| G9b | FE | `ref-registry.yaml` salah/tidak lengkap. Path sama dipakai API berbeda: `/serviceSpecification` (registry → serviceCatalogManagement/v5, TMF909 → naas/v3) dan `/resourceSpecification` (→ resourceCatalogManagement/v5 vs TMF908 iotdevicemanagement/v4). Ref yang bisa dilayani IR lokal tetap unresolved: TMF708 → 704/709/705, TMF707 → 708, PaymentMethodRef → TMF670, ProductOrderRef → TMF622, TMF737 → 738/735, Intent* → TMF921, ShipmentTrackingRef → TMF684 (basePath tanpa `tmf-api/`). Semua entri `verified: false` | `libs/neudela/ref-registry.yaml`, `emitSpec.mjs` `lookupsFrom` |
| G9c | FE | `baseUrl` lookup kosong dianggap "unconfigured", sehingga proxy same-origin tidak bisa dipakai | `design-lab/neudela-lab/src/service/lookupService.ts:46` |
| G9d | BE/FE | `name=` hanya berarti contains bila resource tujuan punya atribut `name`; selain itu jadi filter atribut, dan atribut tak dikenal menghasilkan 400 | `templates/src/common/filter/filter-typeorm.ts` |
| G10 (koreksi) | FE | Runtime sudah menyembunyikan nilai `''` (`expr.ts` `present()`, `DetailCard.tsx`). Probe menandai field kosong dari data mentah, sehingga G10 kemungkinan tidak terlihat di UI. Perlu verifikasi UI; whitespace belum di-trim | `src/resource/expr.ts`, `components/detail/DetailCard.tsx` |
| G11 (akar) | BE | Kolom parent nested ditambahkan tanpa flag housekeeping/internal, sehingga mapper mengeluarkannya | `nestedRoutes.mjs:49-60`, `service.mjs:130-131` |
| G12b | BE | `minItems` tidak pernah diterapkan pada list bertingkat (DTO kelas nested) | `src/emit/dto.mjs:142` |
| G12c | Gate | `tools/validate-dto.mjs` hanya dijalankan untuk mode create | `tools/check-all.mjs:286` |
| G13b | BE | Tanpa `.env` (hanya `.env.example`), guard aktif dengan kunci default `dev-key-123`; FE tanpa kunci → 401 | `api-key.guard.ts:12-16`, `scaffold/newService.mjs:255-257` |
| G14b | BE | Builder sudah mengisi `lastUpdate ?? new Date()`, tetapi validasi DTO (`@IsDefined`) berjalan lebih dulu | `service.mjs:267-269`, `dto.mjs` |
| G16 | FE | Mock `dev:mock` tidak setia ke BE: aturan wajib hanya string/array; PATCH shallow merge; menerima `version`; atribut filter tak dikenal diabaikan (BE: 400); lookup mengabaikan API key dan selalu contains; route nested selalu ada; timestamp selalu di response | `design-lab/neudela-lab/mock/mockApi.ts`, `emitSpec.mjs` `mockFrom` |
| G17 | Gate | Runtime gate `check-all` (CRUD, event, DTO, filter) ter-hardcode ke resource TMF736 | `tools/check-all.mjs:250-262` |
| G18 | Gate | Flaky: screenshot gate (1×), boot smoke dengan batas 20 s, timing klik E2E hub/host setelah dialog/toast | `tools/smoke.mjs`, `design-lab/neudela-lab/e2e/*` |
| G19 | Gate | Postgres belum pernah diuji live: cabang `strpos`, parameter `Date`, dan integrasi FE⇄BE | — |
| G20 | Tooling | Jest yang di-emit tidak menemukan test bila service berada di path dengan folder ber-titik (mis. `.claude`) | `templates/jest.config.js` (`testMatch`) |
| G21 | Gate (lama) | 2 gate FE lama merah karena `frontend-spec-*.yaml` hilang dari root workspace (bukan FE neudela; di luar cakupan) | `tools/check-all.mjs` |

---

## 8. Pelacak status

Semua item di §3 dan §7 berstatus **terbuka** per 2026-10-03. Setiap perbaikan memperbarui baris ini dengan status, fase, dan bukti.

| Fase | Item | Status |
|---|---|---|
| F0: discovery sweep semua TMF (SQLite) + sampel Postgres | menambah G22+ bila ada | belum mulai |
| F1: kontrak API tunggal BE → FE | G5, G5b, G6b, G9d, G13, G16 | belum mulai |
| F2: BE | G1, G1b, G2, G2b, G3a, G3b, G6, G7b, G8, G11, G12, G12b, G13b, G14b | belum mulai |
| F3: FE | G4, G4b, G4c, G5, G6, G6b, G7, G9, G9b, G9c, G9d, G10, G14, G16 | belum mulai |
| F4: gate | G3c, G12c, G17, G18, G20 | belum mulai |
| F5: verifikasi akhir | semua | belum mulai |
| di luar cakupan | G15 (go-gin), G21 | tercatat |
