# BSM C12 · Procurement Request Management (Permintaan pengadaan & SOW)

Ini spec komponen **baru** BSM (TIF) untuk Proses 2 · Permintaan Pengadaan & PR.

Spec ini bukan TMF Open API resmi. Isinya API custom yang **mengikuti pola TMF v5** sesuai AD-07 Solution Design BSM v1.5: Entity/Extensible, `_FVO`/`_MVO`, hub + listener TMF688, dan paging `X-Total-Count`.

Status: **draf diskusi**, 7 Oktober 2026.

```
external/bsm-c12-procurement-request/
├── 1.0.0/
│   ├── openapi/BSM-C12-...-v1.0.0.oas.yaml            ← input tmfgen (hanya resource tersimpan)
│   ├── contract/BSM-C12-...-v1.0.0-contract.oas.yaml  ← KONTRAK API LENGKAP (untuk FE/BFF; tidak dibaca tmfgen)
│   └── userguide/BSM-C12-..._userguide.md             ← enrichment (dibaca otomatis tmfgen)
├── build-spec.mjs   ← sumber kedua YAML; ubah di sini lalu `node build-spec.mjs`
├── tools/runtime-check.mjs  ← uji runtime CRUD semua resource + hub (timeout per request, heap 512 MB); password DB lewat env DATABASE_PASSWORD
├── sync-brd.mjs     ← menulis ulang lampiran §12 BRD tif-bsm dari kontrak (`node sync-brd.mjs`)
├── C12-design.md    ← analisis kelengkapan vs Analisis Programmer: matriks endpoint, ERD, class diagram
└── README.md
```

## Isi komponen

Keterangan kolom **Sumber**: G = di-generate tmfgen; K = endpoint aksi/turunan di kontrak, ditulis tangan di `*.controller.extra.ts`.

| Resource | Path | Sumber | Sub-menu | Event |
|---|---|---|---|---|
| ProcurementRequest | `/procurementRequest` list/create/retrieve/patch | G | 1.2.1 | Create, AttributeValueChange, StateChange |
| ↳ aksi | `/procurementRequest/{id}/sow`, `/cancel`, `/merge`, `/requestToCheck`, `/documentCheck` | K | 1.2.3, 1.2.8, 1.3.1 | — |
| Sow (+ Deliverable) | `/sow` list/create/retrieve/patch/delete | G | 1.2.3 | Create, AttributeValueChange, StateChange, Delete |
| ↳ aksi | **`/sow/{id}/documentChecklist`**, `/sow/{id}/incidentQuestionnaire` (+ `/submit`, `/delegate`) | K | 1.2.4 | — |
| RequestToCheck | `/requestToCheck` (satu baris per SOW) | G | 1.2.8 | Create, StateChange |
| RequestDocumentCheck | `/requestDocumentCheck` | G | 1.3.1 (Proses 3) | Create, AttributeValueChange |
| ExternalOrderCandidate | `/externalOrderCandidate`; **create = API inbound MyCarrier (TBD)** | G | 1.2.2 | Create, StateChange |
| ↳ aksi | `/externalOrderCandidate/{id}/convert` | K | 1.2.2 | — |
| ProcurementCategory | `/procurementCategory` | G | master | Create, AttributeValueChange |
| Currency, ExchangeRate | `/currency`, `/exchangeRate` | G | master (usulan valas) | Create, AttributeValueChange |
| IncidentQuestion, IncidentQuestionnaire | `/incidentQuestion`, `/incidentQuestionnaire` | G | temuan demo, **tidak ada di v1.5** | Create, AttributeValueChange / StateChange |
| Hub | `/hub` GET/POST, `/hub/{id}` GET/DELETE | G | — | — |

Endpoint aksi (K) tidak ada di spec generator karena tmfgen menjadikan setiap path sebuah resource. Contohnya, `GET /sow/{id}/documentChecklist` akan menjadi tabel `document_checklist`, padahal checklist dihitung, bukan disimpan. Rincian dan buktinya ada di `C12-design.md` §2.

Listener `/listener/...Event` hanya POST. Menurut pola TMF688, listener adalah callback milik konsumen. Riwayat event tersimpan di tabel `event_log` hasil generate.

**Sengaja tidak termasuk:**
- BOQ (1.2.5) = C13, penyesuaian TMF620.
- PR (1.2.7) = C14, penyesuaian TMF663.
- Berkas dokumen = C06 / TIRTA.
- 1.2.6 NDE dihapus (A04).

## Menjalankan generator

Komponen custom tidak punya nomor TMF, sehingga **`--tmf` wajib diisi**. Generator membaca nomor dari nama file atau judul, dan file ini sengaja tidak diberi nama "tmfNNN" palsu. Nomor yang dipakai di sini adalah `9012`, angka 4 digit di luar rentang TMF resmi.

```bash
# dari root repo oh-my-tmf-agent-workspace
./tmfgen ir       external/bsm-c12-procurement-request/1.0.0 --tmf 9012
./tmfgen scaffold external/bsm-c12-procurement-request/1.0.0 --tmf 9012 -n procurement-request-service -p <port> --db postgres
./tmfgen emit     external/bsm-c12-procurement-request/1.0.0 --tmf 9012 -n procurement-request-service --db postgres
```

- **Port:** tanpa `-p`, port otomatisnya `3` + `9012` = `39012`.
- **Base path:** default-nya `tmf-api/procurementRequestManagement/v1`, dengan exchange `procurementRequest.events`.
  - Untuk awalan BSM, tambahkan `-b bsm/procurementRequestManagement/v1` di `ir`, `scaffold`, dan `emit`.
  - Jangan pakai `-b bsm/v1`: nama exchange menjadi `v1.events`, dan prefix bersama itu bentrok di registry rute BFF.
- **Ref-strategy:** pakai default `table`. Mode `--ref-strategy flatten` lebih dekat ke ERD, tetapi saat ini membuat 31 test hasil generate gagal karena bug generator (`C12-design.md` §3.2).
- **Mengubah spec:** edit `build-spec.mjs`, lalu jalankan `node build-spec.mjs` (menulis ulang spec generator dan kontrak).

## Hasil verifikasi (7 Okt 2026, ke folder sementara, SQLite)

- **`ir`:** 10 resource, 23 listener event, hub GET/POST/DELETE/RETRIEVE. Semua FK sesuai ERD C12.
- **Enrichment:** 36 enrichment diterapkan, semua resource cocok.
- **Kontrak lengkap:** dimuat bersih oleh loader tmfgen. Isinya 55 path, termasuk 10 endpoint aksi bertanda `x-bsm-implementation`.
- **`scaffold` + `emit`:** 26 entity. `nest build` lulus dan `yarn test` lulus (**19 suite, 563 test**).
- **Peringatan yang disengaja:**
  - tidak ada `lifecycleStatus`, karena v1.5 memakai `state`;
  - tidak ada DELETE selain pada Sow;
  - base path diturunkan dari judul.

## Logika yang harus ditulis tangan (hooks / controller.extra)

1. **Nilai release** (R11): total release semua SOW ≤ `projectValue`, kalau tidak `409 RELEASE_EXCEEDS_PROJECT_VALUE`. `totalReleaseValue` dihitung sistem.
2. **Aturan SP** (R09 R24 R67): `khsAgreement` wajib, `sourcingStatus = auto`, metode Surat Pesanan.
3. **Transisi state** (C12-state) dan penerbitan `procurementRequestStateChangeEvent`.
4. **`GET /sow/{id}/documentChecklist`** (1.2.4): daftar dokumen wajib dari konfigurasi (Jaskeb, BOQ, Ketersediaan Anggaran/PR, UPP), status BOQ, kuesioner, `canRequestToCheck`, dan `blocker`.
5. **Request to Check** (R38 R12 R54):
   - ditolak `422 REQUEST_TO_CHECK_BLOCKED` bila syarat belum lengkap;
   - membuat satu baris per SOW;
   - `roundNumber` naik;
   - notifikasi lewat C09.
6. **Document check** (1.3.1): komentar wajib bila ditolak. Semua accepted → `docCheckStatus` approved.
7. **API inbound MyCarrier:**
   - idempoten per `(sourceSystem, externalOrderId)`;
   - dipanggil lewat service account;
   - `convert` membuat permintaan OBL.
8. **Keberadaan FK:** FK struktural (mis. `sow → procurementRequest`) nullable di hasil generate. Hooks wajib menolak bila baris target tidak ada.
9. **Penomoran dan audit:** `requestNumber` (C20), validasi kategori level 2, serta `If-Match` / `row_version` (412).

## Keputusan yang masih terbuka

Lihat `tif-bsm/docs/brd/BRD-1.2-permintaan-pengadaan.md` §10 dan `C12-design.md` §5.

Yang dari BRD:
- **10.2** kontrak MyCarrier;
- **10.3** aturan nilai release dan bobot;
- **10.5** Kuesioner Dampak Insiden;
- **10.6** fitur batal/gabung;
- **10.11** valas.

Yang dari keterbatasan generator:
- ref-strategy;
- base path;
- siklus relasi eager tidak dideteksi generator (hindari referensi dua arah antar resource).

Tipe uang sudah `numeric` (generator mendukung `format: decimal` + `x-db-precision`/`x-db-scale`).

## Hasil uji runtime (7 Okt 2026)

| DB | Hasil |
|---|---|
| **Postgres 17 lokal** (`bsm-c12-procurement-request`) | **52/52 lulus**: CRUD 10 resource + hub + rantai relasi + 20× create/read beruntun. Tidak ada loop atau crash. Desimal pecahan (`1234567890123.45`, `0.1`, `16250.123456`) kembali persis. Semua kolom angka bertipe `numeric(p,s)`. |
| SQLite | POST RequestToCheck, RequestDocumentCheck, dan IncidentQuestionnaire gagal `SQLITE_ERROR: at most 64 tables in a join`. Penyebabnya semua relasi eager dari tmfgen, dan ini batas keras SQLite. **Jalankan C12 dengan `--db postgres`.** |

```bash
# Postgres (password dari env, jangan ditulis ke file)
DATABASE_PASSWORD=*** node tools/runtime-check.mjs <backendDir> <port> DATABASE_TYPE=postgres DATABASE_HOST=localhost DATABASE_PORT=5432 DATABASE_USERNAME=postgres DATABASE_NAME=bsm-c12-procurement-request
```
