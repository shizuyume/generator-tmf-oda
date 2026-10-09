# BSM C12 · Procurement Request Management — enrichment (userguide)

Komponen baru BSM (TIF) **C12 "Permintaan pengadaan & SOW"** — Proses 2 Permintaan Pengadaan & PR, sub-menu 1.2.1, 1.2.2, 1.2.3, 1.2.4 (checklist), 1.2.8.
Draf diskusi 7 Oktober 2026.

Acuan, berurutan dari yang paling berwenang:
1. BSM Solution Design **v1.5** (skill `bsm-solution-design`, artifact 5v6Db2ZCSvtYsvahBtocwd) — HLD Proses 2, LLD 2.2/2.4, user story US-2.01–US-2.14, Flow & Deck slide 10–12, Capability Tree 1.2.x.
2. Analisis Programmer BSM (skill `bsm-programmer-spec`, artifact 5yTjrbvUZESoXpecMrzJyL) — C12, tabel `proc.*`, gap 1.2.x. Hal bertanda *(usulan)* belum menjadi keputusan.
3. RBAC Keycloak (skill `bsm-rbac`, artifact 8Tk2xuKrdhKMUqZHo3DErR) — permission `menu.bsm-*` / `action.bsm-*`.
4. BRD `tif-bsm/docs/brd/BRD-1.2-permintaan-pengadaan.md`.

Cara generator memakai file ini (tmfgen `src/ir/mergeMarkdown.mjs`):
- Hanya bagian `## Resource: <Nama>` → `### Fields` (tabel) dan `### Business Rules` (butir) yang dibaca. Teks lain di file ini diabaikan generator dan hanya untuk manusia.
- Deskripsi field mengisi field yang deskripsinya kosong di spec. `Mandatory = Y` hanya mengetatkan field yang di spec opsional.
- Business rules disimpan di IR sebagai catatan (provenance `markdown`). Aturan ini **tidak** menjadi kode; implementasinya ditaruh di `src/<resource>/<resource>.hooks.ts` atau `<resource>.controller.extra.ts`.

Endpoint aksi/turunan (tidak di-generate, ditulis tangan di `*.controller.extra.ts`; kontraknya di `1.0.0/contract/*-contract.oas.yaml`):
- `GET /sow/{id}/documentChecklist`
- `POST /procurementRequest/{id}/sow`, `/cancel`, `/merge`, `/requestToCheck`, `/documentCheck` (+ GET)
- `PUT /sow/{id}/incidentQuestionnaire`, `POST .../submit`, `POST .../delegate`
- `POST /externalOrderCandidate/{id}/convert`

Di luar spec ini (sengaja):
- BOQ (1.2.5) = C13, ODA penyesuaian di atas TMF620.
- PR (1.2.7) = C14, ODA penyesuaian di atas TMF663.
- Berkas dokumen = C06 / TIRTA.
- 1.2.6 NDE dihapus (A04).

---

## Resource: ProcurementRequest

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| requestNumber | string | N | Nomor permintaan dari penomoran BSM (C20); diisi sistem saat create, read-only. |
| name | string | Y | Nama proyek / judul permintaan; boleh berbeda dari judul program DRP (R05). |
| description | string | N | Uraian kebutuhan pengadaan. |
| programScope | string | Y | Lingkup program: IBL atau OBL (R09). |
| sourceType | string | Y | Sumber: DRP, NON_DRP, atau EXTERNAL_ORDER (hasil konversi kandidat MyCarrier, A06). |
| fiscalYear | integer | Y | Tahun anggaran. |
| budgetType | string | Y | CAPEX atau OPEX. |
| contractType | string | Y | KHS, LUMSUM, atau SP (R09). SP wajib khsAgreement. |
| state | string | N | State permintaan; diisi sistem (default draft/preparing), lihat business rules. |
| docCheckStatus | string | N | Centang pemeriksaan dokumen (R67); diubah Proses 3. |
| planStatus | string | N | Centang procurement plan (R67); diubah Proses 3. |
| sourcingStatus | string | N | Centang sourcing (R67); SP = auto. |
| requestToCheckCount | integer | N | Jumlah putaran Request to Check. |
| cancellationReason | string | N | Alasan pembatalan; wajib bila state = cancelled. |

### Business Rules

- [R09 R24] contractType = SP wajib khsAgreement yang menunjuk kontrak KHS aktif; KHS induk terbawa ke BOQ sampai dokumen kontrak. Tolak 422 bila kosong.
- [R67] contractType = SP: procurementMethod otomatis Surat Pesanan dan sourcingStatus = auto.
- [R05 R07 R60] Program DRP opsional. sourceType = DRP wajib >= 1 programAllocation dengan program berstatus determined. Satu program boleh dipakai banyak permintaan; allocatedAmount dicatat per program.
- [R09] procurementCategory wajib kategori level 2 (ProcurementCategory.level = 2).
- [R11] totalReleaseValue = jumlah totalReleaseValueIdr seluruh SOW, dihitung sistem (read-only), dan tidak boleh melebihi projectValue. Di bawah projectValue masih boleh (perlu konfirmasi TIF).
- [C12-state] State: draft -> preparing (submit) -> requestToCheck (Request to Check pertama) -> checking -> readyToSourcing -> sentToProcurement -> completed. cancelled bisa dari draft, preparing, requestToCheck, atau checking. Proses 2 hanya sampai requestToCheck; transisi lain milik Proses 3-4.
- [Analisis Programmer] Pembatalan = PATCH state = cancelled dengan cancellationReason wajib. Gabungkan pengadaan (mergedInto) hanya antar permintaan dengan contractType, unit pemroses, KHS induk, dan tahun yang sama (temuan demo, perlu konfirmasi).
- [A06] sourceType = EXTERNAL_ORDER hanya dibuat lewat POST /externalOrderCandidate/{id}/convert (kandidat harus waitingUserAction); programScope dipaksa OBL. POST /procurementRequest langsung dengan EXTERNAL_ORDER ditolak 422. Tautan disimpan satu arah di ExternalOrderCandidate.procurementRequest (ERD C12); arah balik tidak dipakai karena menimbulkan siklus eager+cascade di tmfgen (create berputar sampai kehabisan memori).
- [AD-08] Setiap perubahan state menerbitkan procurementRequestStateChangeEvent (payload id, requestNumber, state, sowIds, docCheckStatus, planStatus, sourcingStatus, roundNumber). Konsumen: C15 procurement plan, C09 notifikasi, C34 audit.
- [AD-06 RBAC] create/update = action.bsm-procurement-request.create/update (Pemilik Program). Pihak lain hanya read. Scope unit/PIC dicek BFF lewat TMF672 checkPermission.
- [NFR] PATCH memakai If-Match / row version; versi basi -> 412.

## Resource: Sow

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| sowNumber | integer | N | Nomor urut SOW dalam permintaan; diisi sistem bila kosong. |
| name | string | Y | Nama SOW. |
| description | string | N | Uraian SOW. |
| weightPercentage | number | Y | Bobot SOW (%), 0 < x <= 100. |
| exchangeRate | number | N | Kurs ke IDR yang dibekukan saat transaksi (usulan); perubahan master kurs tidak mengubah SOW lama. currency (CurrencyRef) dan exchangeRateSource (ExchangeRateRef) menjadi FK ke resource Currency / ExchangeRate. |
| documentState | string | N | Status kelengkapan dokumen SOW; diisi sistem. |

### Business Rules

- [R10] Satu permintaan bisa dipecah menjadi beberapa SOW. Masing-masing punya deliverable, PIC, bobot, nilai release, dokumen, BOQ, dan PR sendiri.
- [R10 R11] deliverable minimal 1; releaseValue > 0. totalReleaseValue dan totalReleaseValueIdr dihitung sistem (read-only).
- [R11] Create/patch ditolak 409 RELEASE_EXCEEDS_PROJECT_VALUE bila jumlah totalReleaseValueIdr seluruh SOW > ProcurementRequest.projectValue. Pesan galat menyebut selisihnya.
- [Usulan] Total weightPercentage seluruh SOW = 100% divalidasi saat permintaan di-submit (perlu konfirmasi).
- [Analisis Programmer] DELETE ditolak 409 SOW_HAS_DOCUMENTS bila SOW sudah punya dokumen, BOQ, atau PR.
- [Analisis Programmer] SOW hanya bisa ditambah/diubah selama ProcurementRequest.state in (draft, preparing) atau saat revisi dari Proses 3.
- [R12 A04] documentState dihitung dari checklist dokumen wajib per SOW: Jaskeb (= Juskeb), BOQ, Ketersediaan Anggaran/PR, dan Surat Pernyataan UPP. ToR dan dokumen pendukung opsional, tidak ikut diperiksa. NDE tidak dipakai (A04).
- [Analisis Programmer] Daftar dokumen wajib dibaca dari konfigurasi document requirement (konteks SOW + tipe kontrak), tidak di-hardcode. Endpoint tambahan GET /sow/{id}/documentChecklist (requirements, canRequestToCheck, blockers) ditaruh di sow.controller.extra.ts.
- [R12] Ketersediaan Anggaran terpenuhi otomatis bila PR SOW issued (event shoppingCartStateChangeEvent dari C14), atau dengan dokumen unggahan.
- [R14 R56 A03] Berkas SOW disimpan dan ditandatangani di TIRTA lewat C06; BSM hanya menyimpan ID dokumen. PDF maks 10 MB. Tanggal dokumen boleh mundur, tidak boleh maju.
- [R54] Bila ada beberapa versi complete, user menandai versi yang dipakai sebelum Request to Check.
- [AD-06 RBAC] action.bsm-sow.* dan action.bsm-sow-document.* = Pemilik Program (rcu); pihak lain read.
- [ERD C12 / tmfgen] procurement_request_id NOT NULL di ERD, tetapi FK hasil generate nullable (required sibling di tmfgen = upsert target, tidak dipakai). beforeCreate wajib menolak 422/404 bila ProcurementRequest yang dirujuk tidak ada; jangan biarkan key dibuang diam-diam. Aturan yang sama berlaku untuk RequestToCheck, RequestDocumentCheck, dan IncidentQuestionnaire.

## Resource: RequestToCheck

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| roundNumber | integer | N | Putaran ke-n; diisi sistem, naik setiap pengajuan ulang setelah revisi. |
| notifyInitiator | boolean | N | Kirim notifikasi ke user inisiator (teks popup demo ambigu, perlu konfirmasi). |
| state | string | N | State putaran: submitted, checking, returned, approved, superseded; diisi sistem. |
| missingRequirement | array | N | Kode dokumen wajib yang belum complete (usulan). |

### Business Rules

- [R38 R12 R54] Create hanya bila setiap SOW terpilih punya semua dokumen wajib complete dan versi yang dipakai sudah ditandai, dan BOQ SOW sudah signed (boqStateChangeEvent dari C13). Bila tidak, tolak 422 REQUEST_TO_CHECK_BLOCKED dengan daftar missingRequirement.
- [Gap Analisis Programmer] Kuesioner Dampak Insiden sebagai syarat tambahan TIDAK ada di v1.5; hanya aktif bila diputuskan (konfigurasi incidentQuestionnaireRequired).
- [ERD C12] Satu baris RequestToCheck per SOW yang diajukan (kolom sow); sow kosong = semua SOW (sesuai proc.request_to_check.sow_id NULL). POST /procurementRequest/{id}/requestToCheck (controller.extra) membuat satu baris per SOW siap. ProcurementRequest masuk state requestToCheck saat SOW pertama diajukan (perlu konfirmasi). requestToCheckCount dan lastRequestToCheckDate diperbarui.
- [R23] C09 mengirim notifikasi email, WhatsApp, dan in-app ke peran procurement terkait.
- [R38] Putaran ulang setelah revisi menaikkan roundNumber; putaran lama menjadi superseded. Dokumen yang sudah accepted dibawa (recheckAccepted = false).
- [Proses 3] PATCH state (checking, returned, approved) dilakukan Proses 3, bukan Pemilik Program.
- [AD-06 RBAC] create = action.bsm-request-to-check.create (Pemilik Program); pihak lain read.

## Resource: ExternalOrderCandidate

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| sourceSystem | string | Y | Sistem sumber: MYCARRIER (pengganti MyTens, A06) atau MYDX. |
| externalOrderId | string | Y | ID order di sistem sumber; unik bersama sourceSystem. |
| name | string | Y | Nama proyek dari sistem sumber. |
| state | string | N | waitingUserAction, converted, rejected, cancelled; diisi sistem. |
| payload | object | N | Payload asli sistem sumber, disimpan utuh (format TBD). |

### Business Rules

- [A06 K-15] API INBOUND: sistem eksternal (MyCarrier) melakukan POST /externalOrderCandidate. Isi data, kapan order dianggap cocok, dan relasi KL–KB masih TBD; kontrak ini sementara.
- [Keputusan 2026-10-07] Idempoten per (sourceSystem, externalOrderId): kiriman ulang mengembalikan 200 dengan data yang sudah ada, bukan duplikat. Perlu unique constraint di DB.
- [Keamanan] Dipanggil service account (client credentials, permission khusus), bukan sesi user. Opsi tanda tangan HMAC (401 INVALID_SIGNATURE) perlu dipilih.
- [R55] Pola lama: data dianggap valid, koreksi di sistem sumber. Perlu konfirmasi ulang untuk TIF.
- [A06] Konversi = POST /externalOrderCandidate/{id}/convert (external-order-candidate.controller.extra.ts): membuat ProcurementRequest (OBL, EXTERNAL_ORDER), lalu mengisi procurementRequest dan state converted. Kandidat converted tidak bisa dikonversi lagi (409 ALREADY_CONVERTED).
- [Desain] Tidak ada DELETE. Penolakan oleh user = PATCH state = rejected.
- [AD-11] Kegagalan pemrosesan tidak menghapus payload; status gagal tercatat agar bisa diproses ulang.

## Resource: ProcurementCategory

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| code | string | Y | Kode kategori, unik. |
| name | string | Y | Nama kategori. |
| level | integer | Y | 1 atau 2. |
| pathName | string | N | Nama lengkap "L1 \| L2" untuk tampilan; diisi sistem. |
| isActive | boolean | N | Kategori aktif dan bisa dipilih. |

### Business Rules

- [R09] Pohon 2 level: level 1 tanpa parentCategory; level 2 wajib parentCategory level 1. Nama unik per parent.
- [R09] Hanya kategori level 2 yang aktif yang boleh dipilih di ProcurementRequest.
- [Desain] Tidak ada DELETE; kategori dinonaktifkan dengan isActive = false.
- [RBAC] Pengelolaan oleh Administrator (master 4.3.x); pengguna lain read.

## Resource: RequestDocumentCheck

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| decision | string | Y | pending, accepted, atau rejected (R38). |
| comment | string | N | Alasan; wajib bila decision = rejected (R17 R47). |
| checkedDate | date-time | N | Waktu diputuskan; wajib bila decision != pending; diisi sistem. |

### Business Rules

- [1.3.1 Proses 3] Hanya peran procurement (bukan PIC, R41) yang memutuskan; RBAC action.bsm-document-check.approve.
- [R38 R17] decision = rejected wajib comment; tolak 422 REASON_REQUIRED.
- [R54] Keputusan diambil atas documentVersion yang ditandai dipakai saat Request to Check.
- [DDL] Unik per (requestToCheck, documentRequirement, document); kiriman ganda -> 409.
- [C12] Semua dokumen wajib accepted -> ProcurementRequest.docCheckStatus = approved (centang pemeriksaan). Ada rejected -> docCheckStatus = revision, RequestToCheck.state = returned, user merevisi lalu mengajukan ulang (roundNumber naik).
- [Konfigurasi] Putaran ulang hanya memuat dokumen yang direvisi; yang accepted dibawa (recheckAccepted = false).

## Resource: IncidentQuestion

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| questionnaireVersion | string | Y | Versi bank pertanyaan. |
| questionCode | string | Y | Kode pertanyaan; unik bersama questionnaireVersion. |
| questionText | string | Y | Teks pertanyaan. |
| answerType | string | Y | SINGLE_CHOICE, MULTI_CHOICE, SCALE, TEXT. |

### Business Rules

- [Gap Analisis Programmer] TEMUAN DEMO, TIDAK ADA DI v1.5. Dipakai hanya bila TIF memutuskan Kuesioner Dampak Insiden aktif (BRD 10.5).
- [DDL] Unik per (questionnaireVersion, questionCode); weight >= 0.
- [Desain] Tidak ada DELETE; nonaktifkan dengan isActive = false.

## Resource: IncidentQuestionnaire

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| questionnaireVersion | string | Y | Versi bank pertanyaan yang dipakai. |
| state | string | N | draft, submitted, superseded; diisi sistem. |
| impactScore | number | N | Skor dampak; dihitung sistem saat submit. |
| impactLevel | string | N | LOW, MEDIUM, HIGH, CRITICAL; dihitung sistem. |
| fillerBandLevel | integer | N | Band pengisi 1-7; diisi sistem dari data pegawai. |
| scoreInJuskebVerified | boolean | N | Skor sudah tercantum di JusKeb/PKDF. |

### Business Rules

- [Gap Analisis Programmer] TEMUAN DEMO, TIDAK ADA DI v1.5. Bila konfigurasi incidentQuestionnaireRequired = true, submit menjadi syarat Request to Check.
- [Demo] Hanya pegawai BP3 ke atas di divisi pemilik (ownerDivision) atau delegasinya yang boleh mengisi; selain itu 403 NOT_AUTHORIZED_BAND.
- [Demo] Delegasi hanya oleh BP3+ divisi pemilik (403 DELEGATOR_NOT_BP3); delegate wajib bersama delegatedBy.
- [DDL] state = submitted wajib impactScore, submissionDate, dan filledBy; jawaban tidak lengkap -> 422 ANSWERS_INCOMPLETE.
- [Kontrak] Simpan / submit / delegasi lewat PUT /sow/{id}/incidentQuestionnaire, POST .../submit, POST .../delegate (sow.controller.extra.ts).

## Resource: Currency

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| code | string | Y | Kode ISO 4217, 3 huruf kapital, unik. |
| name | string | Y | Nama mata uang. |
| minorUnit | integer | N | Digit desimal 0-4, default 2. |

### Business Rules

- [Usulan Analisis Programmer] Valas per SOW belum disebut v1.5 (terkait Surat Persetujuan DIRKUG penggunaan VALAS); master ini dipakai bila valas masuk cakupan (BRD 10.11).
- [Desain] Tidak ada DELETE; nonaktifkan dengan isActive = false.

## Resource: ExchangeRate

### Fields

| Field | Type | Mandatory | Description |
|-------|------|-----------|-------------|
| rateDate | date | Y | Tanggal kurs. |
| rate | number | Y | Nilai kurs, > 0. |
| rateType | string | N | MIDDLE (default), BUY, SELL, TAX. |
| source | string | N | SYSTEM (default), MANUAL, SAP, BI. |

### Business Rules

- [DDL] currency != quoteCurrency; unik per (currency, quoteCurrency, rateType, rateDate).
- [Usulan] Kurs berlaku untuk transaksi = rateDate <= tanggal transaksi yang terbaru, rateType MIDDLE; tidak ada -> 404 EXCHANGE_RATE_NOT_FOUND.
- [Usulan] SOW menyalin nilai kurs (snapshot) dan menyimpan exchangeRateSource; perubahan kurs master tidak mengubah SOW lama.
