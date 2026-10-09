// Membangun OAS 3.0.1 bergaya TMF v5 untuk komponen baru BSM C12 "Permintaan pengadaan & SOW".
// Sumber isi: skill bsm-solution-design (v1.5), bsm-programmer-spec (C12), bsm-rbac.
// Pemakaian: node build-spec.mjs
//   menulis 1.0.0/openapi/...oas.yaml          (input tmfgen, hanya resource tersimpan)
//   dan     1.0.0/contract/...-contract.oas.yaml (kontrak API lengkap, tidak dibaca tmfgen)
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../generator/package.json', import.meta.url));
const yaml = require('js-yaml');

const here = path.dirname(url.fileURLToPath(import.meta.url));
const out = process.argv[2] ? path.resolve(process.argv[2]) : path.join(here, '1.0.0', 'openapi', 'BSM-C12-Procurement_Request_Management-v1.0.0.oas.yaml');
const R = n => ({ $ref: `#/components/schemas/${n}` });
const arr = (n, description, extra = {}) => ({ type: 'array', items: R(n), description, ...extra });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const num = (description, extra = {}) => ({ type: 'number', description, ...extra });
const bool = description => ({ type: 'boolean', description });
const dt = description => ({ type: 'string', format: 'date-time', description });
const date = description => ({ type: 'string', format: 'date', description });
const en = (values, description) => ({ type: 'string', enum: values, description });

/* ───────────────────────── base TMF schemas ───────────────────────── */
const schemas = {
  Addressable: { type: 'object', description: 'Base schema for adressable entities', properties: { href: str('Hyperlink reference'), id: str('unique identifier') } },
  Addressable_FVO: { type: 'object', description: 'Base schema for adressable entities', properties: { id: str('unique identifier') } },
  Extensible: {
    type: 'object',
    description: 'Base Extensible schema for use in TMForum Open-APIs - When used for in a schema it means that the Entity described by the schema MUST be extended with the @type',
    properties: {
      '@type': str('When sub-classing, this defines the sub-class Extensible name'),
      '@baseType': str('When sub-classing, this defines the super-class'),
      '@schemaLocation': str('A URI to a JSON-Schema file that defines additional attributes and relationships'),
    },
    required: ['@type'],
  },
  Extensible_FVO: {
    type: 'object',
    description: 'Base Extensible schema for use in TMForum Open-APIs (create variant)',
    properties: {
      '@type': str('When sub-classing, this defines the sub-class Extensible name'),
      '@baseType': str('When sub-classing, this defines the super-class'),
      '@schemaLocation': str('A URI to a JSON-Schema file that defines additional attributes and relationships'),
    },
    required: ['@type'],
  },
  Entity: { type: 'object', description: 'Base entity schema for use in TMForum Open-APIs. Property.', allOf: [R('Extensible'), R('Addressable')] },
  Entity_FVO: { type: 'object', description: 'Base entity schema for use in TMForum Open-APIs (create variant).', allOf: [R('Extensible_FVO'), R('Addressable_FVO')] },
  Entity_MVO: { type: 'object', description: 'Base entity schema for use in TMForum Open-APIs (update variant).', allOf: [R('Extensible_FVO'), R('Addressable_FVO')] },
  EntityRef: {
    type: 'object',
    description: 'Entity reference schema to be use for all entityRef class.',
    allOf: [R('Extensible'), {
      type: 'object',
      properties: {
        id: str('The identifier of the referred entity.'),
        href: str('The URI of the referred entity.'),
        name: str('Name of the referred entity.'),
        '@referredType': str('The actual type of the target instance when needed for disambiguation.'),
      },
      required: ['id'],
    }],
  },
  Money: {
    type: 'object',
    description: 'A base / value business entity used to represent money',
    properties: { unit: str('Currency (ISO4217 norm uses 3 letters to define the currency, e.g. IDR)'), value: num('Nilai uang, desimal pasti numeric(18,2) - bukan float (DDL C12).', { format: 'decimal', 'x-db-precision': 18, 'x-db-scale': 2 }) },
  },
  Characteristic: {
    type: 'object',
    description: 'Describes a given characteristic of an object or entity through a name/value pair. Dipakai sebagai titik ekstensi TMF (AD-07).',
    allOf: [R('Extensible'), {
      type: 'object',
      properties: { id: str('Unique identifier of the characteristic'), name: str('Name of the characteristic'), valueType: str('Data type of the value of the characteristic'), value: str('Value of the characteristic (serialised)') },
      required: ['name'],
    }],
  },
  Error: {
    discriminator: { propertyName: '@type', mapping: { Error: '#/components/schemas/Error' } },
    allOf: [R('Extensible'), {
      type: 'object',
      required: ['code', 'reason'],
      properties: {
        code: str('Application relevant detail, defined in the API or a common list. Contoh BSM: RELEASE_EXCEEDS_PROJECT_VALUE, SOW_HAS_DOCUMENTS, ALREADY_CONVERTED, REQUEST_TO_CHECK_BLOCKED, INVALID_STATE, REASON_REQUIRED.'),
        reason: str('Explanation of the reason for the error which can be shown to a client user.'),
        message: str('More details and corrective actions related to the error which can be shown to a client user.'),
        status: str('HTTP Error code extension'),
        referenceError: str('URI of documentation describing the error.'),
      },
    }],
    description: 'Used when an API throws an Error, typically with a HTTP error response-code (3xx, 4xx, 5xx)',
  },
  Hub_FVO: {
    type: 'object',
    description: 'Sets the communication endpoint address the service instance must use to deliver notification information',
    required: ['callback'],
    allOf: [R('Extensible'), { properties: { callback: str('The callback being registered.'), query: str('additional data to be passed') } }],
  },
  Hub: {
    type: 'object',
    description: 'Sets the communication endpoint address the service instance must use to deliver notification information',
    allOf: [R('Entity'), { properties: { id: str('Id of the listener'), callback: str('The callback being registered.'), query: str('additional data to be passed') }, required: ['callback'] }],
  },
  JsonPatch: {
    type: 'object', description: 'A JSONPatch document as defined by RFC 6902', required: ['op', 'path'],
    properties: { op: en(['add', 'remove', 'replace', 'move', 'copy', 'test'], 'The operation to be performed'), path: str('A JSON-Pointer'), value: { description: 'The value to be used within the operations.' }, from: str('A string containing a JSON Pointer value.') },
  },
  JsonPatchOperations: { description: 'JSONPatch Operations document as defined by RFC 6902', type: 'array', items: R('JsonPatch') },
  Event: {
    allOf: [R('Extensible'), {
      type: 'object',
      description: 'event with common attributes.',
      properties: {
        href: str('Hyperlink reference'), id: str('unique identifier'),
        correlationId: str('The correlation id for this event.'), domain: str('The domain of the event.'),
        title: str('The title of the event.'), description: str('An explnatory of the event.'), priority: str('A priority.'),
        timeOccurred: dt('The time the event occurred.'),
        source: R('EntityRef'), reportingSystem: R('EntityRef'),
        eventId: str('The identifier of the notification.'), eventTime: dt('Time of the event occurrence.'), eventType: str('The type of the notification.'),
        event: { type: 'object', description: 'The event linked to the involved resource object' },
      },
    }],
  },
};

/* ───────────────────────── enums (state machines) ───────────────────────── */
Object.assign(schemas, {
  ProcurementRequestStateType: en(['draft', 'preparing', 'requestToCheck', 'checking', 'readyToSourcing', 'sentToProcurement', 'completed', 'cancelled'],
    'State permintaan pengadaan (C12-state). Tugas Proses 2 mencakup draft -> preparing -> requestToCheck; checking dst. diubah Proses 3-4. Nama tampilan v1.5 (Preparing dokumen / Already dokumen / Request to Check / Checking on progress) perlu konfirmasi.'),
  DocCheckStatusType: en(['notStarted', 'onProgress', 'revision', 'approved'], 'Centang pemeriksaan dokumen di daftar permintaan (R67).'),
  PlanStatusType: en(['notStarted', 'draft', 'saved'], 'Centang procurement plan di daftar permintaan (R67).'),
  SourcingStatusType: en(['notStarted', 'auto', 'done'], 'Centang sourcing; SP = auto (R67).'),
  SowDocumentStateType: en(['preparing', 'documentReady', 'requestToCheck', 'checking', 'revision', 'approved'], 'Status kelengkapan dokumen per SOW.'),
  RequestToCheckStateType: en(['submitted', 'checking', 'returned', 'approved', 'superseded'], 'State Request to Check per putaran.'),
  ExternalOrderCandidateStateType: en(['waitingUserAction', 'converted', 'rejected', 'cancelled'], 'State kandidat order eksternal (badge Menunggu Action User / Selesai).'),
});

/* ───────────────────────── reference schemas ───────────────────────── */
const ref = (name, description, referred) => ({
  type: 'object',
  description,
  allOf: [R('EntityRef')],
  discriminator: { propertyName: '@type', mapping: { [name]: `#/components/schemas/${name}` } },
  ...(referred ? { 'x-bsm-referredType': referred } : {}),
});
Object.assign(schemas, {
  OrganizationUnitRef: ref('OrganizationUnitRef', 'Referensi unit organisasi (C03, TMF632 organization). Dipakai untuk unit peminta dan unit pemroses.', 'Organization'),
  EmployeeRef: ref('EmployeeRef', 'Referensi pegawai (C03, data pegawai dari SAP INT-09). Dipakai untuk PIC SOW dan manager procurement.', 'Individual'),
  AgreementRef: ref('AgreementRef', 'Referensi kontrak (C18, TMF651). Untuk SP: KHS induk yang aktif (R09 R24).', 'Agreement'),
  ProcurementMethodRef: ref('ProcurementMethodRef', 'Referensi metode pengadaan (master C15). SP otomatis SURAT_PESANAN (R67).', 'ProcurementMethod'),
  ProcurementProgramEntityRef: ref('ProcurementProgramEntityRef', 'Referensi program DRP berstatus determined (C11).', 'ProcurementProgram'),
  ProcurementCategoryRef: ref('ProcurementCategoryRef', 'Referensi kategori pengadaan level 2 (R09).', 'ProcurementCategory'),
  ProcurementRequestRef: ref('ProcurementRequestRef', 'Referensi permintaan pengadaan.', 'ProcurementRequest'),
  SowRef: ref('SowRef', 'Referensi SOW.', 'Sow'),
  ExternalOrderCandidateRef: ref('ExternalOrderCandidateRef', 'Referensi kandidat order eksternal (MyCarrier, TBD).', 'ExternalOrderCandidate'),
  CompanyCodeRef: ref('CompanyCodeRef', 'Referensi tenant / company code SAP (mst.company_code). Terkait K-01 (SAP TIF vs Telkom).', 'CompanyCode'),
  CurrencyRef: ref('CurrencyRef', 'Referensi mata uang (resource Currency).', 'Currency'),
  ExchangeRateRef: ref('ExchangeRateRef', 'Referensi baris kurs sumber (resource ExchangeRate).', 'ExchangeRate'),
  RequestToCheckRef: ref('RequestToCheckRef', 'Referensi putaran Request to Check.', 'RequestToCheck'),
  DocumentRequirementRef: ref('DocumentRequirementRef', 'Referensi jenis dokumen wajib (C06, doc.document_requirement): JUSKEB, BOQ_TKDN, KETERSEDIAAN_ANGGARAN, UPP.', 'DocumentRequirement'),
  DocumentRef: ref('DocumentRef', 'Referensi dokumen (C06, TMF667; berkas di TIRTA).', 'Document'),
  DocumentVersionRef: ref('DocumentVersionRef', 'Referensi versi dokumen yang ditandai dipakai (R54).', 'DocumentVersion'),
});

/* ───────────────────────── sub-entities ───────────────────────── */
Object.assign(schemas, {
  ProcurementProgramAllocation: {
    type: 'object',
    description: 'Program DRP yang dirujuk permintaan beserta nilai yang diambil (R05 R60). Satu permintaan bisa merujuk banyak program; satu program bisa dipakai banyak permintaan.',
    allOf: [R('Extensible'), {
      type: 'object',
      properties: {
        procurementProgram: R('ProcurementProgramEntityRef'),
        allocatedAmount: R('Money'),
        allocationNote: str('Catatan alokasi (usulan Analisis Programmer).'),
      },
      required: ['procurementProgram'],
    }],
  },
  RelatedPartyAssignment: {
    type: 'object',
    description: 'Pihak terkait permintaan, mis. PIC Assistant (temuan demo; v1.5 menunjuk PIC lewat permissionSet di Proses 4, R41).',
    allOf: [R('Extensible'), { type: 'object', properties: { role: str('Peran pihak, mis. picAssistant'), party: R('EmployeeRef') }, required: ['role', 'party'] }],
  },
  Deliverable: {
    type: 'object',
    description: 'Deliverable dalam SOW dengan nilai release (R10). Nilai release > 0.',
    allOf: [R('Extensible'), {
      type: 'object',
      properties: {
        lineNumber: int('Nomor baris deliverable dalam SOW (> 0).', { minimum: 1 }),
        name: str('Nama deliverable.'),
        releaseValue: R('Money'),
        releaseValueIdr: R('Money'),
      },
      required: ['lineNumber', 'name', 'releaseValue'],
    }],
  },
});

/* ───────────────────────── resources ───────────────────────── */
const resource = (name, description, properties, required, fvoExclude = [], mvoExclude = []) => {
  const pick = ex => Object.fromEntries(Object.entries(properties).filter(([k]) => !ex.includes(k)));
  schemas[name] = { allOf: [R('Entity'), { type: 'object', description, properties }], discriminator: { propertyName: '@type', mapping: { [name]: `#/components/schemas/${name}` } } };
  schemas[`${name}_FVO`] = { allOf: [R('Entity_FVO'), { type: 'object', description, properties: pick(fvoExclude), required }], discriminator: { propertyName: '@type', mapping: { [name]: `#/components/schemas/${name}_FVO` } } };
  schemas[`${name}_MVO`] = { allOf: [R('Entity_MVO'), { type: 'object', description, properties: pick(mvoExclude) }], discriminator: { propertyName: '@type', mapping: { [name]: `#/components/schemas/${name}_MVO` } } };
};

resource('ProcurementRequest',
  'Permintaan pengadaan (C12, 1.2.1/1.2.3/1.2.8). Mengubah kebutuhan (program DRP determined, non-program, atau order MyCarrier TBD) menjadi permintaan IBL/OBL per SOW. Hasil akhir Proses 2: Request to Check ke procurement.',
  {
    requestNumber: str('Nomor permintaan, dibangkitkan sistem (C20 penomoran). Read-only.'),
    companyCode: R('CompanyCodeRef'),
    name: str('Nama proyek / judul permintaan (boleh berbeda dari judul program DRP, R05).'),
    description: str('Uraian kebutuhan.'),
    programScope: en(['IBL', 'OBL'], 'Lingkup program IBL/OBL (R09).'),
    sourceType: en(['DRP', 'NON_DRP', 'EXTERNAL_ORDER'], 'Sumber permintaan (R05 R07 A06). EXTERNAL_ORDER = hasil konversi kandidat MyCarrier.'),
    requesterUnit: R('OrganizationUnitRef'),
    processorUnit: R('OrganizationUnitRef'),
    fiscalYear: int('Tahun anggaran.', { minimum: 2000 }),
    projectValue: R('Money'),
    budgetType: en(['CAPEX', 'OPEX'], 'Jenis anggaran.'),
    procurementCategory: R('ProcurementCategoryRef'),
    contractType: en(['KHS', 'LUMSUM', 'SP'], 'Tipe kontrak (R09). SP wajib khsAgreement.'),
    khsAgreement: R('AgreementRef'),
    procurementMethod: R('ProcurementMethodRef'),
    managerProcurement: R('EmployeeRef'),
    programAllocation: arr('ProcurementProgramAllocation', 'Program DRP yang dirujuk (opsional; wajib >= 1 bila sourceType = DRP) beserta alokasi nilai (R05 R07 R60).'),
    relatedParty: arr('RelatedPartyAssignment', 'Pihak terkait, mis. PIC Assistant.'),
    totalReleaseValue: R('Money'),
    state: R('ProcurementRequestStateType'),
    docCheckStatus: R('DocCheckStatusType'),
    planStatus: R('PlanStatusType'),
    sourcingStatus: R('SourcingStatusType'),
    requestToCheckCount: int('Jumlah putaran Request to Check.', { minimum: 0 }),
    lastRequestToCheckDate: dt('Waktu Request to Check terakhir.'),
    sentToProcurementDate: dt('Waktu diserahkan ke procurement (Proses 4).'),
    cancellationReason: str('Alasan pembatalan; wajib bila state = cancelled.'),
    cancellationDate: dt('Waktu pembatalan.'),
    mergedInto: R('ProcurementRequestRef'),
    creationDate: dt('Waktu permintaan dibuat.'),
    lastUpdate: dt('Waktu perubahan terakhir.'),
    characteristic: arr('Characteristic', 'Ekstensi TMF (AD-07), mis. kuesioner dampak insiden bila diputuskan dipakai.'),
  },
  ['name', 'programScope', 'sourceType', 'requesterUnit', 'processorUnit', 'fiscalYear', 'projectValue', 'budgetType', 'procurementCategory', 'contractType'],
  ['requestNumber', 'totalReleaseValue', 'docCheckStatus', 'planStatus', 'sourcingStatus', 'requestToCheckCount', 'lastRequestToCheckDate', 'sentToProcurementDate', 'cancellationDate', 'mergedInto', 'creationDate', 'lastUpdate'],
  ['requestNumber', 'sourceType', 'totalReleaseValue', 'docCheckStatus', 'planStatus', 'sourcingStatus', 'requestToCheckCount', 'lastRequestToCheckDate', 'sentToProcurementDate', 'cancellationDate', 'creationDate', 'lastUpdate'],
);

resource('Sow',
  'SOW (statement of work) dalam permintaan pengadaan (C12, 1.2.3/1.2.4). Tiap SOW punya deliverable, PIC, bobot, nilai release, dokumen, BOQ, dan PR sendiri (R10).',
  {
    procurementRequest: R('ProcurementRequestRef'),
    sowNumber: int('Nomor urut SOW dalam permintaan (> 0).', { minimum: 1 }),
    name: str('Nama SOW.'),
    description: str('Uraian SOW.'),
    weightPercentage: num('Bobot SOW (%) 0 < x <= 100; total seluruh SOW = 100% (usulan, konfirmasi).', { minimum: 0, maximum: 100, format: 'decimal', 'x-db-precision': 5, 'x-db-scale': 2 }),
    pic: R('EmployeeRef'),
    currency: R('CurrencyRef'),
    exchangeRate: num('Kurs ke IDR yang dibekukan (snapshot) saat transaksi; perubahan master kurs tidak mengubah SOW lama (usulan).', { minimum: 0, format: 'decimal', 'x-db-precision': 18, 'x-db-scale': 6 }),
    exchangeRateSource: R('ExchangeRateRef'),
    deliverable: arr('Deliverable', 'Deliverable SOW dengan nilai release (R10 R11).', { minItems: 1 }),
    totalReleaseValue: R('Money'),
    totalReleaseValueIdr: R('Money'),
    documentState: R('SowDocumentStateType'),
    readyToPrDate: dt('Waktu SOW siap dibuatkan PR.'),
  },
  ['procurementRequest', 'name', 'weightPercentage', 'pic', 'deliverable'],
  ['totalReleaseValue', 'totalReleaseValueIdr', 'documentState', 'readyToPrDate'],
  ['procurementRequest', 'totalReleaseValue', 'totalReleaseValueIdr', 'documentState', 'readyToPrDate'],
);

resource('RequestToCheck',
  'Task Request to Check (C12, 1.2.8): mengajukan SOW yang dokumen wajibnya complete ke procurement (R38 R12 R54). Membuat event procurementRequestStateChangeEvent dan notifikasi C09 (email, WhatsApp, in-app, R23).',
  {
    procurementRequest: R('ProcurementRequestRef'),
    sow: R('SowRef'),
    roundNumber: int('Putaran ke-n; naik setiap pengajuan ulang setelah revisi.', { minimum: 1 }),
    notifyInitiator: bool('Kirim notifikasi ke user inisiator (teks popup demo ambigu, perlu konfirmasi).'),
    state: R('RequestToCheckStateType'),
    submissionDate: dt('Waktu diajukan.'),
    completionDate: dt('Waktu selesai diperiksa (Proses 3).'),
    missingRequirement: { type: 'array', items: { type: 'string' }, description: 'Kode dokumen wajib yang belum complete saat pengecekan (usulan).' },
  },
  ['procurementRequest'],
  ['roundNumber', 'state', 'submissionDate', 'completionDate', 'missingRequirement'],
  ['procurementRequest', 'sow', 'roundNumber', 'notifyInitiator', 'submissionDate', 'missingRequirement'],
);

resource('RequestDocumentCheck',
  'Keputusan procurement atas satu dokumen wajib pada satu putaran Request to Check (C12, capability 1.3.1 Proses 3; tabel proc.request_document_check). Semua accepted -> docCheckStatus approved; ada rejected -> revision.',
  {
    procurementRequest: R('ProcurementRequestRef'),
    sow: R('SowRef'),
    requestToCheck: R('RequestToCheckRef'),
    documentRequirement: R('DocumentRequirementRef'),
    document: R('DocumentRef'),
    documentVersion: R('DocumentVersionRef'),
    decision: en(['pending', 'accepted', 'rejected'], 'Keputusan pemeriksaan (R38). rejected wajib comment.'),
    comment: str('Alasan / catatan; wajib bila decision = rejected (R17 R47).'),
    checkedBy: R('EmployeeRef'),
    checkedDate: dt('Waktu diputuskan; wajib bila decision != pending.'),
  },
  ['procurementRequest', 'requestToCheck', 'documentRequirement', 'document', 'documentVersion', 'decision'],
  ['checkedDate'],
  ['procurementRequest', 'sow', 'requestToCheck', 'documentRequirement', 'document', 'documentVersion', 'checkedDate'],
);

resource('IncidentQuestion',
  'Bank pertanyaan Kuesioner Dampak Insiden (tabel proc.incident_question). TEMUAN DEMO, TIDAK ADA DI v1.5 - hanya dipakai bila TIF memutuskan kuesioner aktif (BRD 10.5).',
  {
    questionnaireVersion: str('Versi kuesioner; unik bersama questionCode.'),
    questionCode: str('Kode pertanyaan.'),
    questionText: str('Teks pertanyaan.'),
    answerType: en(['SINGLE_CHOICE', 'MULTI_CHOICE', 'SCALE', 'TEXT'], 'Jenis jawaban.'),
    options: { type: 'array', items: { type: 'string' }, description: 'Pilihan jawaban.' },
    weight: num('Bobot skor (>= 0).', { minimum: 0, format: 'decimal', 'x-db-precision': 5, 'x-db-scale': 2 }),
    sortOrder: int('Urutan tampil.'),
    isActive: bool('Pertanyaan aktif.'),
  },
  ['questionnaireVersion', 'questionCode', 'questionText', 'answerType'],
  [],
  ['questionnaireVersion', 'questionCode'],
);

resource('IncidentQuestionnaire',
  'Kuesioner Dampak Insiden per SOW (tabel proc.incident_questionnaire). TEMUAN DEMO, TIDAK ADA DI v1.5 - bila aktif, submit menjadi syarat Request to Check. Diisi pegawai BP3+ divisi pemilik atau delegasinya.',
  {
    sow: R('SowRef'),
    procurementRequest: R('ProcurementRequestRef'),
    questionnaireVersion: str('Versi bank pertanyaan yang dipakai.'),
    answers: { type: 'object', description: 'Jawaban {questionCode: value}.' },
    impactScore: num('Skor dampak (>= 0); dihitung sistem saat submit.', { minimum: 0, format: 'decimal', 'x-db-precision': 7, 'x-db-scale': 2 }),
    impactLevel: en(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], 'Level dampak hasil skor.'),
    state: en(['draft', 'submitted', 'superseded'], 'State kuesioner.'),
    ownerDivision: R('OrganizationUnitRef'),
    filledBy: R('EmployeeRef'),
    fillerBandLevel: int('Band pengisi (1-7); BP3+ yang berwenang.', { minimum: 1, maximum: 7 }),
    delegate: R('EmployeeRef'),
    delegatedBy: R('EmployeeRef'),
    delegationDate: dt('Waktu delegasi.'),
    submissionDate: dt('Waktu submit.'),
    scoreInJuskebVerified: bool('Skor sudah tercantum di JusKeb/PKDF.'),
  },
  ['sow', 'procurementRequest', 'questionnaireVersion', 'ownerDivision'],
  ['impactScore', 'impactLevel', 'state', 'fillerBandLevel', 'submissionDate', 'delegationDate'],
  ['sow', 'procurementRequest', 'questionnaireVersion', 'ownerDivision', 'impactScore', 'impactLevel', 'fillerBandLevel', 'submissionDate', 'delegationDate'],
);

resource('Currency',
  'Master mata uang ISO 4217 (tabel mst.currency). Dipakai SOW (usulan valas).',
  {
    code: str('Kode ISO 4217, 3 huruf kapital (IDR, USD).', { pattern: '^[A-Z]{3}$' }),
    name: str('Nama mata uang.'),
    symbol: str('Simbol.'),
    minorUnit: int('Jumlah digit desimal (0-4).', { minimum: 0, maximum: 4 }),
    isActive: bool('Aktif.'),
  },
  ['code', 'name'],
  [],
  ['code'],
);

resource('ExchangeRate',
  'Master kurs per tanggal (tabel mst.exchange_rate). SOW menyalin kurs dengan rateDate <= tanggal transaksi yang terbaru (usulan).',
  {
    currency: R('CurrencyRef'),
    quoteCurrency: R('CurrencyRef'),
    rateDate: date('Tanggal kurs.'),
    rate: num('Nilai kurs (> 0).', { exclusiveMinimum: true, minimum: 0, format: 'decimal', 'x-db-precision': 18, 'x-db-scale': 6 }),
    rateType: en(['MIDDLE', 'BUY', 'SELL', 'TAX'], 'Jenis kurs; default MIDDLE.'),
    source: en(['SYSTEM', 'MANUAL', 'SAP', 'BI'], 'Sumber kurs.'),
    sourceReference: str('Referensi sumber.'),
  },
  ['currency', 'quoteCurrency', 'rateDate', 'rate'],
  [],
  ['currency', 'quoteCurrency', 'rateDate', 'rateType'],
);

resource('ExternalOrderCandidate',
  'Kandidat order dari sistem eksternal (1.2.2, INT-12). BSM menyediakan API inbound: sistem eksternal (MyCarrier) melakukan POST; user lalu mengonversi menjadi permintaan OBL. Kontrak data masih TBD (A06, K-15) - payload asli disimpan utuh.',
  {
    sourceSystem: en(['MYCARRIER', 'MYDX'], 'Sistem sumber. MyTens sudah diganti MyCarrier (A06).'),
    externalOrderId: str('ID order di sistem sumber; unik bersama sourceSystem (idempotensi).'),
    lopId: str('ID LOP (bila ada).'),
    name: str('Nama proyek dari sistem sumber.'),
    customerNipnas: str('NIPNAS customer.'),
    customerName: str('Nama customer.'),
    segment: str('Segmen customer.'),
    projectType: en(['NEW', 'MODIFY'], 'Jenis proyek.'),
    projectValue: R('Money'),
    p1Date: date('Tanggal P1.'),
    oblNumber: str('Nomor OBL.'),
    oblIdentifier: str('Identifier OBL.'),
    oblStatus: str('Status OBL di sistem sumber.'),
    partnerName: str('Nama mitra hasil matching.'),
    klStatus: str('Status relasi KL (TBD).'),
    spkNumber: str('Nomor SPK.'),
    state: R('ExternalOrderCandidateStateType'),
    receivedDate: dt('Waktu diterima BSM.'),
    procurementRequest: R('ProcurementRequestRef'),
    payload: { type: 'object', description: 'Payload asli dari sistem sumber, disimpan utuh agar perubahan format (TBD) tidak memutus integrasi.' },
  },
  ['sourceSystem', 'externalOrderId', 'name'],
  ['state', 'receivedDate', 'procurementRequest'],
  ['sourceSystem', 'externalOrderId', 'receivedDate', 'payload'],
);

resource('ProcurementCategory',
  'Master kategori pengadaan 2 level (R09). Permintaan wajib memakai kategori level 2.',
  {
    code: str('Kode kategori, unik.'),
    name: str('Nama kategori.'),
    level: int('Level kategori: 1 atau 2.', { minimum: 1, maximum: 2 }),
    parentCategory: R('ProcurementCategoryRef'),
    pathName: str('Nama lengkap "L1 | L2" untuk tampilan.'),
    sortOrder: int('Urutan tampil.'),
    isActive: bool('Kategori aktif dan bisa dipilih.'),
  },
  ['code', 'name', 'level'],
  ['pathName'],
  ['code', 'pathName'],
);

/* ───────────────────────── events ───────────────────────── */
const RES = [
  { name: 'ProcurementRequest', path: 'procurementRequest', tag: 'procurementRequest', del: false, events: ['Create', 'AttributeValueChange', 'StateChange'] },
  { name: 'Sow', path: 'sow', tag: 'sow', del: true, events: ['Create', 'AttributeValueChange', 'StateChange', 'Delete'] },
  { name: 'RequestToCheck', path: 'requestToCheck', tag: 'requestToCheck', del: false, events: ['Create', 'StateChange'] },
  { name: 'ExternalOrderCandidate', path: 'externalOrderCandidate', tag: 'externalOrderCandidate', del: false, events: ['Create', 'StateChange'] },
  { name: 'ProcurementCategory', path: 'procurementCategory', tag: 'procurementCategory', del: false, events: ['Create', 'AttributeValueChange'] },
  { name: 'RequestDocumentCheck', path: 'requestDocumentCheck', tag: 'requestDocumentCheck', del: false, events: ['Create', 'AttributeValueChange'] },
  { name: 'IncidentQuestion', path: 'incidentQuestion', tag: 'incidentQuestion', del: false, events: ['Create', 'AttributeValueChange'] },
  { name: 'IncidentQuestionnaire', path: 'incidentQuestionnaire', tag: 'incidentQuestionnaire', del: false, events: ['Create', 'StateChange'] },
  { name: 'Currency', path: 'currency', tag: 'currency', del: false, events: ['Create', 'AttributeValueChange'] },
  { name: 'ExchangeRate', path: 'exchangeRate', tag: 'exchangeRate', del: false, events: ['Create', 'AttributeValueChange'] },
];
for (const r of RES) for (const e of r.events) {
  const ev = `${r.name}${e}Event`;
  schemas[ev] = {
    allOf: [R('Event'), { type: 'object', description: `${ev} generic structure`, properties: { event: R(`${ev}Payload`) } }],
    discriminator: { propertyName: '@type', mapping: { [ev]: `#/components/schemas/${ev}` } },
  };
  schemas[`${ev}Payload`] = { type: 'object', description: `${ev}Payload generic structure`, properties: { [r.name[0].toLowerCase() + r.name.slice(1)]: R(r.name) } };
}

/* ───────────────────────── components: params, responses, bodies ───────────────────────── */
const errorContent = { 'application/json': { schema: R('Error') } };
const responses = {
  200: { description: 'OK' }, 202: { description: 'Accepted' }, 204: { description: 'Deleted' },
  400: { description: 'Bad Request', content: errorContent }, 401: { description: 'Unauthorized', content: errorContent },
  403: { description: 'Forbidden', content: errorContent }, 404: { description: 'Not Found', content: errorContent },
  405: { description: 'Method Not allowed', content: errorContent }, 409: { description: 'Conflict', content: errorContent },
  412: { description: 'Precondition Failed (If-Match / row version basi)', content: errorContent },
  422: { description: 'Unprocessable Entity (aturan bisnis dilanggar)', content: errorContent },
  500: { description: 'Internal Server Error', content: errorContent }, 501: { description: 'Not Implemented', content: errorContent },
  503: { description: 'Service Unavailable', content: errorContent },
  Hub: { description: 'Notified', content: { 'application/json': { schema: R('Hub') } } },
  Hub_Get: { description: 'Success', content: { 'application/json': { schema: R('Hub') } } },
  '200HubArray': { description: 'Success', headers: { 'X-Total-Count': { $ref: '#/components/headers/X-Total-Count' }, 'X-Result-Count': { $ref: '#/components/headers/X-Result-Count' } }, content: { 'application/json': { schema: { type: 'array', items: R('Hub') } } } },
  Error: { description: 'Error', content: errorContent },
};
const requestBodies = { Hub_FVO: { description: 'Data containing the callback endpoint to deliver the information', content: { 'application/json': { schema: R('Hub_FVO') } }, required: true } };
const examples = {};
const parameters = {
  Id: { name: 'id', required: true, schema: { type: 'string' }, in: 'path', description: 'Identifier of the Resource' },
  Fields: { name: 'fields', in: 'query', description: 'Comma-separated properties to be provided in response', schema: { type: 'string' } },
  Offset: { name: 'offset', in: 'query', description: 'Requested index for start of resources to be provided in response', schema: { type: 'integer' } },
  Limit: { name: 'limit', in: 'query', description: 'Requested number of resources to be provided in response', schema: { type: 'integer' } },
};
const headers = {
  'X-Total-Count': { description: 'Total number of items matching criteria', schema: { type: 'integer' } },
  'X-Result-Count': { description: 'Actual number of items returned in the response body', schema: { type: 'integer' } },
};

/* ───────────────────────── examples (seed + docs) ───────────────────────── */
const EX = {
  ProcurementCategory: { '@type': 'ProcurementCategory', code: 'JAS-KONS-FO', name: 'Jasa konstruksi fiber optik', level: 2, parentCategory: { '@type': 'ProcurementCategoryRef', id: 'cat-jasa-konstruksi', name: 'Jasa konstruksi' }, sortOrder: 10, isActive: true },
  ProcurementRequest: {
    '@type': 'ProcurementRequest', name: 'Pengadaan jasa konstruksi FO Jabodetabek 2027', programScope: 'IBL', sourceType: 'DRP',
    requesterUnit: { '@type': 'OrganizationUnitRef', id: 'unit-scm', name: 'Divisi SCM' },
    processorUnit: { '@type': 'OrganizationUnitRef', id: 'unit-gpc', name: 'GPC' },
    fiscalYear: 2027, projectValue: { unit: 'IDR', value: 1500000000 }, budgetType: 'CAPEX',
    procurementCategory: { '@type': 'ProcurementCategoryRef', id: 'cat-jas-kons-fo', name: 'Jasa konstruksi | Fiber optik' },
    contractType: 'SP', khsAgreement: { '@type': 'AgreementRef', id: 'agr-khs-2026-001', name: 'KHS Jasa Konstruksi FO 2026' },
    programAllocation: [{ '@type': 'ProcurementProgramAllocation', procurementProgram: { '@type': 'ProcurementProgramEntityRef', id: 'prg-2027-0012', name: 'Perluasan FO Jabodetabek' }, allocatedAmount: { unit: 'IDR', value: 1500000000 } }],
    state: 'preparing',
  },
  Sow: {
    '@type': 'Sow', procurementRequest: { '@type': 'ProcurementRequestRef', id: 'req-0001' }, sowNumber: 1, name: 'SOW 1 - Penarikan kabel FO',
    weightPercentage: 100, pic: { '@type': 'EmployeeRef', id: 'emp-880011', name: 'PIC SCM' }, currency: { '@type': 'CurrencyRef', id: 'cur-idr', name: 'IDR' }, exchangeRate: 1,
    deliverable: [
      { '@type': 'Deliverable', lineNumber: 1, name: 'Penarikan kabel 24 core', releaseValue: { unit: 'IDR', value: 1000000000 } },
      { '@type': 'Deliverable', lineNumber: 2, name: 'Terminasi dan uji', releaseValue: { unit: 'IDR', value: 500000000 } },
    ],
  },
  RequestToCheck: { '@type': 'RequestToCheck', procurementRequest: { '@type': 'ProcurementRequestRef', id: 'req-0001' }, sow: { '@type': 'SowRef', id: 'sow-0001' }, notifyInitiator: true },
  RequestDocumentCheck: {
    '@type': 'RequestDocumentCheck', procurementRequest: { '@type': 'ProcurementRequestRef', id: 'req-0001' }, sow: { '@type': 'SowRef', id: 'sow-0001' },
    requestToCheck: { '@type': 'RequestToCheckRef', id: 'rtc-0001' }, documentRequirement: { '@type': 'DocumentRequirementRef', id: 'dr-juskeb', name: 'JUSKEB' },
    document: { '@type': 'DocumentRef', id: 'doc-0001', name: 'Justifikasi Kebutuhan SOW 1' }, documentVersion: { '@type': 'DocumentVersionRef', id: 'docv-0001' },
    decision: 'rejected', comment: 'Nilai di Jaskeb tidak sama dengan nilai release SOW', checkedBy: { '@type': 'EmployeeRef', id: 'emp-770001', name: 'Staf Procurement' }, checkedDate: '2026-10-07T09:00:00Z',
  },
  IncidentQuestion: { '@type': 'IncidentQuestion', questionnaireVersion: 'v1', questionCode: 'Q01', questionText: 'Apakah gangguan layanan berdampak ke pelanggan korporat?', answerType: 'SINGLE_CHOICE', options: ['Ya', 'Tidak'], weight: 2, sortOrder: 1, isActive: true },
  IncidentQuestionnaire: {
    '@type': 'IncidentQuestionnaire', sow: { '@type': 'SowRef', id: 'sow-0001' }, procurementRequest: { '@type': 'ProcurementRequestRef', id: 'req-0001' },
    questionnaireVersion: 'v1', answers: { Q01: 'Ya' }, ownerDivision: { '@type': 'OrganizationUnitRef', id: 'unit-scm', name: 'Divisi SCM' },
  },
  Currency: { '@type': 'Currency', code: 'USD', name: 'US Dollar', symbol: '$', minorUnit: 2, isActive: true },
  ExchangeRate: {
    '@type': 'ExchangeRate', currency: { '@type': 'CurrencyRef', id: 'cur-usd', name: 'USD' }, quoteCurrency: { '@type': 'CurrencyRef', id: 'cur-idr', name: 'IDR' },
    rateDate: '2026-10-07', rate: 16250, rateType: 'MIDDLE', source: 'MANUAL',
  },
  ExternalOrderCandidate: {
    '@type': 'ExternalOrderCandidate', sourceSystem: 'MYCARRIER', externalOrderId: 'MC-2026-000123', name: 'Order konektivitas PT Contoh',
    customerNipnas: '1234567', customerName: 'PT Contoh', segment: 'ENTERPRISE', projectType: 'NEW', projectValue: { unit: 'IDR', value: 250000000 },
    partnerName: 'PT Mitra Contoh', payload: { note: 'payload asli MyCarrier (format TBD)' },
  },
};

/* ───────────────────────── paths ───────────────────────── */
const std = codes => Object.fromEntries(codes.map(c => [String(c), { $ref: `#/components/responses/${c}` }]));
const paths = {
  '/hub': {
    get: { operationId: 'listHub', summary: 'List registered subscriptions (hub)', description: 'Daftar subscription event yang terdaftar (callback + query), agar konsumen event (C09, C15, C34, BFF) bisa memeriksa langganannya.', tags: ['events subscription'], parameters: [{ $ref: '#/components/parameters/Offset' }, { $ref: '#/components/parameters/Limit' }], responses: { 200: { $ref: '#/components/responses/200HubArray' }, default: { $ref: '#/components/responses/Error' } } },
    post: { operationId: 'createHub', summary: 'Create a subscription (hub) to receive Events', description: 'Sets the communication endpoint to receive Events.', tags: ['events subscription'], requestBody: { $ref: '#/components/requestBodies/Hub_FVO' }, responses: { 201: { $ref: '#/components/responses/Hub' }, default: { $ref: '#/components/responses/Error' } } },
  },
  '/hub/{id}': {
    get: { operationId: 'retrieveHub', summary: 'Retrieves a subscription (hub) by ID', description: 'Detail satu subscription event.', tags: ['events subscription'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { 200: { $ref: '#/components/responses/Hub_Get' }, default: { $ref: '#/components/responses/Error' } } },
    delete: { operationId: 'hubDelete', summary: 'Remove a subscription (hub) to receive Events', description: '', tags: ['events subscription'], parameters: [{ $ref: '#/components/parameters/Id' }], responses: { 204: { description: 'Deleted' }, default: { $ref: '#/components/responses/Error' } } },
  },
};
for (const r of RES) for (const e of r.events) {
  const ev = `${r.name}${e}Event`;
  const p = `${r.path}${e}Event`;
  requestBodies[ev] = { description: `${r.name} ${e[0].toLowerCase() + e.slice(1)} Event payload`, content: { 'application/json': { schema: R(ev) } }, required: true };
  paths[`/listener/${p}`] = { post: { tags: ['notification listener'], summary: `Client listener for entity ${ev}`, description: `Example of a client listener for receiving the notification ${ev}`, operationId: p, requestBody: { $ref: `#/components/requestBodies/${ev}` }, responses: { 204: { description: 'Notified' }, default: { $ref: '#/components/responses/Error' } } } };
}

const OPS = {
  ProcurementRequest: { list: 'List or find ProcurementRequest objects (daftar permintaan: kartu + stepper; tiga centang pemeriksaan/plan/sourcing, R67).', create: 'Buat permintaan pengadaan (1.2.1). Permintaan dari order MyCarrier (1.2.2) dibuat lewat POST /externalOrderCandidate/{id}/convert (kontrak), yang mengisi sourceType EXTERNAL_ORDER dan ExternalOrderCandidate.procurementRequest. Relasi hanya satu arah (ERD C12) - arah balik menimbulkan siklus eager di tmfgen.', patch: 'Ubah permintaan; pembatalan = PATCH state=cancelled dengan cancellationReason (wajib).' },
  Sow: { list: 'List SOW; filter procurementRequest.id untuk SOW milik satu permintaan.', create: 'Tambah SOW + deliverable (1.2.3). Ditolak 409 RELEASE_EXCEEDS_PROJECT_VALUE bila total release semua SOW > nilai proyek (R11).', patch: 'Ubah SOW / deliverable (upsert).', del: 'Hapus SOW; ditolak 409 SOW_HAS_DOCUMENTS bila sudah ada dokumen/BOQ/PR.' },
  RequestToCheck: { list: 'Riwayat Request to Check per permintaan / putaran.', create: 'Ajukan Request to Check (1.2.8). Ditolak 422 REQUEST_TO_CHECK_BLOCKED bila dokumen wajib SOW belum complete atau BOQ belum signed (R38 R12 R54).', patch: 'Dipakai Proses 3 untuk mengubah state putaran (checking/returned/approved).' },
  ExternalOrderCandidate: { list: 'Daftar kandidat order eksternal (badge Menunggu Action User / Selesai).', create: 'API INBOUND untuk sistem eksternal (MyCarrier, TBD A06). Idempoten per (sourceSystem, externalOrderId): kiriman ulang mengembalikan data yang ada. Dipanggil service account, bukan user.', patch: 'Ubah state kandidat (mis. rejected dengan alasan di payload/characteristic).' },
  ProcurementCategory: { list: 'Pohon kategori 2 level (dropdown Kategori); filter level, parentCategory.id, isActive.', create: 'Admin: tambah kategori.', patch: 'Admin: ubah / nonaktifkan kategori.' },
  RequestDocumentCheck: { list: 'Riwayat ceklis dokumen; filter procurementRequest.id, requestToCheck.id, sow.id.', create: 'Procurement menerima / menolak satu dokumen wajib (1.3.1, Proses 3). rejected wajib comment (422 REASON_REQUIRED).', patch: 'Koreksi keputusan selama putaran belum ditutup.' },
  IncidentQuestion: { list: 'Bank pertanyaan aktif; filter questionnaireVersion, isActive. (Temuan demo, tidak ada di v1.5.)', create: 'Admin: tambah pertanyaan.', patch: 'Admin: ubah / nonaktifkan pertanyaan.' },
  IncidentQuestionnaire: { list: 'Kuesioner per SOW; filter sow.id.', create: 'Simpan draft kuesioner (PUT /sow/{id}/incidentQuestionnaire di kontrak). 403 NOT_AUTHORIZED_BAND bila bukan BP3+ divisi pemilik atau delegasi.', patch: 'Ubah jawaban / submit (state=submitted, 422 ANSWERS_INCOMPLETE) / delegasi (delegate + delegatedBy).' },
  Currency: { list: 'Daftar mata uang aktif.', create: 'Admin: tambah mata uang.', patch: 'Admin: ubah / nonaktifkan.' },
  ExchangeRate: { list: 'Kurs; filter currency.id, rateDate, rateType. Kurs berlaku = rateDate <= tanggal transaksi yang terbaru (404 EXCHANGE_RATE_NOT_FOUND).', create: 'Admin / sinkron: tambah kurs.', patch: 'Admin: koreksi kurs.' },
};

for (const r of RES) {
  const N = r.name;
  const o = OPS[N];
  schemas; // keep linter quiet
  responses[`200${N}Array`] = { description: 'Success', headers: { 'X-Total-Count': { $ref: '#/components/headers/X-Total-Count' }, 'X-Result-Count': { $ref: '#/components/headers/X-Result-Count' } }, content: { 'application/json': { schema: { type: 'array', items: R(N) } } } };
  responses[`200${N}_Get`] = { description: 'Success', content: { 'application/json': { schema: R(N) } } };
  responses[`200${N}_Patch`] = { description: 'Success', content: { 'application/json': { schema: R(N) }, 'application/merge-patch+json': { schema: R(N) } } };
  responses[`201${N}`] = { description: 'OK/Created', content: { 'application/json': { schema: R(N) } } };
  examples[`Create${N}_request`] = { description: `Contoh membuat ${N}`, value: EX[N] };
  requestBodies[`${N}_FVO`] = { description: `The ${N} to be created`, content: { 'application/json': { schema: R(`${N}_FVO`), examples: { [`Create${N}`]: { $ref: `#/components/examples/Create${N}_request` } } } }, required: true };
  requestBodies[`${N}_MVO`] = { description: `The ${N} to be patched`, content: { 'application/json': { schema: R(`${N}_MVO`) }, 'application/merge-patch+json': { schema: R(`${N}_MVO`) }, 'application/json-patch+json': { schema: R('JsonPatchOperations') } }, required: true };

  paths[`/${r.path}`] = {
    get: { tags: [r.tag], summary: `List or find ${N} objects`, description: o.list, operationId: `list${N}`, parameters: [{ $ref: '#/components/parameters/Fields' }, { $ref: '#/components/parameters/Offset' }, { $ref: '#/components/parameters/Limit' }], responses: { 200: { $ref: `#/components/responses/200${N}Array` }, ...std([400, 401, 403, 404, 405, 500, 501, 503]) } },
    post: { tags: [r.tag], summary: `Creates a ${N}`, description: o.create, operationId: `create${N}`, parameters: [{ $ref: '#/components/parameters/Fields' }], requestBody: { $ref: `#/components/requestBodies/${N}_FVO` }, responses: { 201: { $ref: `#/components/responses/201${N}` }, 202: { description: 'Accepted' }, ...std([400, 401, 403, 404, 405, 409, 422, 500, 501, 503]) } },
  };
  const item = {
    get: { tags: [r.tag], summary: `Retrieves a ${N} by ID`, description: `This operation retrieves a ${N} entity. Attribute selection enabled for all first level attributes.`, operationId: `retrieve${N}`, parameters: [{ $ref: '#/components/parameters/Id' }, { $ref: '#/components/parameters/Fields' }], responses: { 200: { $ref: `#/components/responses/200${N}_Get` }, ...std([400, 401, 403, 404, 405, 500, 501, 503]) } },
    patch: { tags: [r.tag], summary: `Updates partially a ${N}`, description: o.patch, operationId: `patch${N}`, parameters: [{ $ref: '#/components/parameters/Id' }, { $ref: '#/components/parameters/Fields' }], requestBody: { $ref: `#/components/requestBodies/${N}_MVO` }, responses: { 200: { $ref: `#/components/responses/200${N}_Patch` }, 202: { description: 'Accepted' }, ...std([400, 401, 403, 404, 405, 409, 412, 422, 500, 501, 503]) } },
  };
  if (r.del) item.delete = { tags: [r.tag], summary: `Deletes a ${N}`, description: o.del, operationId: `delete${N}`, parameters: [{ $ref: '#/components/parameters/Id' }], responses: { 202: { $ref: '#/components/responses/202' }, 204: { $ref: '#/components/responses/204' }, ...std([400, 401, 403, 404, 405, 409, 500, 501, 503]) } };
  paths[`/${r.path}/{id}`] = item;
}

const doc = {
  openapi: '3.0.1',
  info: {
    title: 'Procurement Request Management',
    description: [
      'BSM (TIF) komponen baru C12 "Permintaan pengadaan & SOW" - Proses 2 Permintaan Pengadaan & PR, sub-menu 1.2.1, 1.2.2, 1.2.3, 1.2.4 (checklist; berkas lewat C06/TIRTA), 1.2.8.',
      'Bukan TMF Open API resmi: API custom yang MENGIKUTI pola TMF v5 (Entity/Extensible, _FVO/_MVO, hub + listener TMF688, paging X-Total-Count) sesuai AD-07 Solution Design BSM v1.5.',
      'Resource tersimpan (di-generate tmfgen): ProcurementRequest, Sow (+Deliverable), RequestToCheck, RequestDocumentCheck, ExternalOrderCandidate (API inbound MyCarrier, TBD), ProcurementCategory, Currency, ExchangeRate, IncidentQuestion + IncidentQuestionnaire (temuan demo, tidak ada di v1.5).',
      'Endpoint aksi/turunan Analisis Programmer (documentChecklist, cancel, merge, requestToCheck per permintaan, documentCheck, incidentQuestionnaire submit/delegate, convert) TIDAK ada di file ini karena tmfgen akan menjadikannya tabel. Semuanya ada di kontrak lengkap 1.0.0/contract/*-contract.oas.yaml dan diimplementasikan di *.controller.extra.ts.',
      'BOQ (1.2.5, C13) dan PR (1.2.7, C14) TIDAK ada di spec ini: keduanya ODA penyesuaian di atas TMF620 dan TMF663.',
      'Acuan: BSM Solution Design v1.5 (artifact 5v6Db2ZCSvtYsvahBtocwd), Analisis Programmer BSM (artifact 5yTjrbvUZESoXpecMrzJyL), RBAC Keycloak (artifact 8Tk2xuKrdhKMUqZHo3DErR). Draf diskusi 7 Okt 2026.',
    ].join('\n\n'),
    version: '1.0.0',
  },
  servers: [{ url: 'https://serverRoot' }],
  tags: [
    ...RES.map(r => ({ name: r.tag, description: `Operations for ${r.name} Resource` })),
    { name: 'notification listener', description: 'Notifications for Resource Lifecycle and event notifications' },
    { name: 'events subscription', description: 'Endpoints to register and terminate an Event Listener' },
  ],
  paths,
  components: { schemas, parameters, requestBodies, responses, headers, securitySchemes: {}, examples },
};

const dump = d => yaml.dump(d, { lineWidth: 100, noRefs: true, quotingType: "'" });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, dump(doc), 'utf8');
console.log('written', out, Object.keys(paths).length, 'paths', Object.keys(schemas).length, 'schemas');

/* ───────────────────────── kontrak lengkap (tidak dibaca tmfgen) ─────────────────────────
 * = spec generator + endpoint aksi/turunan dari Analisis Programmer C12.
 * tmfgen menjadikan setiap path non-hub/listener sebuah resource (path GET bersarang dengan
 * schema baru -> tabel), jadi endpoint ini hanya hidup di kontrak dan diimplementasikan
 * tangan di <resource>.controller.extra.ts. Semua ditandai x-bsm-implementation.
 */
const contract = JSON.parse(JSON.stringify(doc));
contract.info.title = 'Procurement Request Management (contract)';
contract.info.description = 'KONTRAK API LENGKAP C12 = spec generator (1.0.0/openapi) + endpoint aksi/turunan yang ditulis tangan (x-bsm-implementation). Jangan dijadikan input tmfgen.\n\n' + doc.info.description;
const cs = contract.components.schemas;
const cmd = (name, description, properties, required = []) => { cs[name] = { type: 'object', description, properties, required }; };
cmd('DocumentRequirementStatus', 'Status satu jenis dokumen pada checklist SOW.', {
  code: str('Kode requirement: JUSKEB, BOQ_TKDN, KETERSEDIAAN_ANGGARAN, UPP, TOR, PENDUKUNG.'),
  name: str('Nama dokumen.'),
  mandatory: bool('Dokumen wajib (R12).'),
  complete: bool('Ada dokumen completed dan versi dipakai sudah ditandai (R54).'),
  documents: { type: 'array', items: { type: 'object', properties: { id: str('ID dokumen (C06)'), title: str('Judul'), status: str('Status dokumen C06'), inUse: bool('Versi dipakai'), tirtaDocumentId: str('ID dokumen di TIRTA (A03)') } } },
});
cmd('DocumentChecklist', 'Kelengkapan dokumen per SOW (1.2.4), dihitung dari konfigurasi document requirement + dokumen C06; tidak disimpan.', {
  sow: R('SowRef'),
  requirement: { type: 'array', items: R('DocumentRequirementStatus') },
  boqSigned: bool('BOQ SOW sudah ditandatangani (C13).'),
  questionnaire: { type: 'object', properties: { required: bool('Kuesioner aktif (konfigurasi)'), state: str('draft/submitted'), impactScore: num('Skor') } },
  canRequestToCheck: bool('Semua syarat Request to Check terpenuhi.'),
  blocker: { type: 'array', items: { type: 'string' }, description: 'Alasan Request to Check terkunci.' },
}, ['sow', 'requirement', 'canRequestToCheck']);
cmd('CancelProcurementRequestCommand', 'Batalkan permintaan (temuan demo).', { reason: str('Alasan, wajib (422 REASON_REQUIRED).') }, ['reason']);
cmd('MergeProcurementRequestCommand', 'Gabungkan permintaan sumber ke permintaan ini (temuan demo, TBD).', { sourceRequestId: { type: 'array', items: { type: 'string' }, minItems: 1 } }, ['sourceRequestId']);
cmd('RequestToCheckCommand', 'Ajukan Request to Check untuk satu atau lebih SOW (1.2.8).', { sowId: { type: 'array', items: { type: 'string' }, description: 'Kosong = semua SOW yang siap.' }, notifyInitiator: bool('Popup "Notifikasi user inisiator?"') });
cmd('DocumentDecisionCommand', 'Keputusan procurement atas satu dokumen wajib (1.3.1).', { documentRequirementId: str('Jenis dokumen'), documentId: str('Dokumen'), decision: en(['accepted', 'rejected'], 'Keputusan'), comment: str('Wajib bila rejected') }, ['documentRequirementId', 'documentId', 'decision']);
cmd('IncidentAnswersCommand', 'Simpan jawaban kuesioner (draft).', { answers: { type: 'object', description: '{questionCode: value}' } }, ['answers']);
cmd('DelegateQuestionnaireCommand', 'Delegasi pengisian kuesioner ke PIC.', { delegateEmployeeId: str('Pegawai delegasi') }, ['delegateEmployeeId']);
cmd('ConvertExternalOrderCommand', 'Jadikan kandidat order eksternal permintaan OBL (1.2.2).', {
  processorUnit: R('OrganizationUnitRef'), contractType: en(['KHS', 'LUMSUM', 'SP'], 'Tipe kontrak'), procurementCategory: R('ProcurementCategoryRef'),
  khsAgreement: R('AgreementRef'), sow: { type: 'array', items: R('Sow_FVO') },
}, ['processorUnit', 'contractType', 'procurementCategory']);

const body = (schema, description) => ({ description, required: true, content: { 'application/json': { schema: R(schema) } } });
const ok = (schema, code = 200, array = false) => ({ [code]: { description: 'Success', content: { 'application/json': { schema: array ? { type: 'array', items: R(schema) } : R(schema) } } }, ...std([400, 401, 403, 404, 409, 422, 500]) });
const idParam = [{ $ref: '#/components/parameters/Id' }];
const extra = (tag, operationId, summary, description, source, impl, op) => ({ tags: [tag], operationId, summary, description, parameters: idParam, 'x-bsm-implementation': impl, 'x-bsm-source': source, ...op });
Object.assign(contract.paths, {
  '/sow/{id}/documentChecklist': { get: extra('sow', 'retrieveSowDocumentChecklist', 'Checklist dokumen per SOW', 'Kelengkapan dokumen wajib, status BOQ, kuesioner, canRequestToCheck, blockers (1.2.4).', 'Analisis Programmer C12 · GET /bsm/v1/sow/{id}/documentChecklist · US-2.04 R12 R54', 'sow.controller.extra.ts', { responses: ok('DocumentChecklist') }) },
  '/procurementRequest/{id}/sow': { post: extra('sow', 'createSowForProcurementRequest', 'Tambah SOW ke permintaan', 'Alias POST /sow dengan procurementRequest dari path (409 RELEASE_EXCEEDS_PROJECT_VALUE, 409 INVALID_STATE).', 'Analisis Programmer C12 · POST /bsm/v1/procurementRequest/{id}/sow · US-2.03', 'procurement-request.controller.extra.ts', { requestBody: body('Sow_FVO', 'SOW + deliverable'), responses: ok('Sow', 201) }) },
  '/procurementRequest/{id}/cancel': { post: extra('procurementRequest', 'cancelProcurementRequest', 'Batalkan permintaan', 'state -> cancelled + cancellationReason; ledger budget dibalik (C17). 409 INVALID_STATE bila sudah sentToProcurement.', 'Analisis Programmer C12 · POST /bsm/v1/procurementRequest/{id}/cancel · temuan demo', 'procurement-request.controller.extra.ts', { requestBody: body('CancelProcurementRequestCommand', 'Alasan pembatalan'), responses: ok('ProcurementRequest') }) },
  '/procurementRequest/{id}/merge': { post: extra('procurementRequest', 'mergeProcurementRequest', 'Gabungkan permintaan (TBD)', 'Sumber -> cancelled + mergedInto. 409 MERGE_INCOMPATIBLE bila beda tipe kontrak / UFL / KHS induk / tahun.', 'Analisis Programmer C12 · POST /bsm/v1/procurementRequest/{id}/merge · temuan demo, TBD', 'procurement-request.controller.extra.ts', { requestBody: body('MergeProcurementRequestCommand', 'Permintaan sumber'), responses: ok('ProcurementRequest') }) },
  '/procurementRequest/{id}/requestToCheck': { post: extra('requestToCheck', 'submitRequestToCheck', 'Ajukan Request to Check', 'Membuat satu RequestToCheck per SOW siap; permintaan -> requestToCheck; event + notifikasi C09. 422 REQUEST_TO_CHECK_BLOCKED.', 'Analisis Programmer C12 · POST /bsm/v1/procurementRequest/{id}/requestToCheck · US-2.14 R38', 'procurement-request.controller.extra.ts', { requestBody: body('RequestToCheckCommand', 'SOW yang diajukan'), responses: ok('RequestToCheck', 202, true) }) },
  '/procurementRequest/{id}/documentCheck': {
    post: extra('requestDocumentCheck', 'decideDocumentCheck', 'Terima / tolak dokumen wajib (Proses 3)', 'Semua accepted -> docCheckStatus approved; rejected -> revision (komentar wajib).', 'Analisis Programmer C12 · POST /bsm/v1/procurementRequest/{id}/documentCheck · 1.3.1', 'procurement-request.controller.extra.ts', { requestBody: body('DocumentDecisionCommand', 'Keputusan'), responses: ok('RequestDocumentCheck') }),
    get: extra('requestDocumentCheck', 'listDocumentCheckOfProcurementRequest', 'Riwayat ceklis dokumen', 'Alias GET /requestDocumentCheck?procurementRequest.id=.', 'Analisis Programmer C12 · GET /bsm/v1/procurementRequest/{id}/documentCheck', 'procurement-request.controller.extra.ts', { responses: ok('RequestDocumentCheck', 200, true) }),
  },
  '/sow/{id}/incidentQuestionnaire': { put: extra('incidentQuestionnaire', 'saveIncidentQuestionnaire', 'Simpan draft kuesioner (temuan demo)', '403 NOT_AUTHORIZED_BAND; 409 INVALID_STATE bila sudah submitted.', 'Analisis Programmer C12 · PUT /bsm/v1/sow/{id}/incidentQuestionnaire', 'sow.controller.extra.ts', { requestBody: body('IncidentAnswersCommand', 'Jawaban'), responses: ok('IncidentQuestionnaire') }) },
  '/sow/{id}/incidentQuestionnaire/submit': { post: extra('incidentQuestionnaire', 'submitIncidentQuestionnaire', 'Submit kuesioner (temuan demo)', 'Hitung skor; membuka kunci Request to Check bila kuesioner aktif. 422 ANSWERS_INCOMPLETE.', 'Analisis Programmer C12 · POST /bsm/v1/sow/{id}/incidentQuestionnaire/submit', 'sow.controller.extra.ts', { responses: ok('IncidentQuestionnaire') }) },
  '/sow/{id}/incidentQuestionnaire/delegate': { post: extra('incidentQuestionnaire', 'delegateIncidentQuestionnaire', 'Delegasi kuesioner (temuan demo)', '403 DELEGATOR_NOT_BP3.', 'Analisis Programmer C12 · POST /bsm/v1/sow/{id}/incidentQuestionnaire/delegate', 'sow.controller.extra.ts', { requestBody: body('DelegateQuestionnaireCommand', 'Delegasi'), responses: ok('IncidentQuestionnaire') }) },
  '/externalOrderCandidate/{id}/convert': { post: extra('externalOrderCandidate', 'convertExternalOrderCandidate', 'Jadikan permintaan OBL (1.2.2)', 'Membuat ProcurementRequest (programScope OBL, sourceType EXTERNAL_ORDER); kandidat -> converted. 409 ALREADY_CONVERTED.', 'Analisis Programmer C12 · POST /bsm/v1/externalOrderCandidate/{id}/convert · A06 TBD', 'external-order-candidate.controller.extra.ts', { requestBody: body('ConvertExternalOrderCommand', 'Data permintaan'), responses: ok('ProcurementRequest', 201) }) },
});
const contractOut = path.join(here, '1.0.0', 'contract', 'BSM-C12-Procurement_Request_Management-v1.0.0-contract.oas.yaml');
fs.mkdirSync(path.dirname(contractOut), { recursive: true });
fs.writeFileSync(contractOut, dump(contract), 'utf8');
console.log('written', contractOut, Object.keys(contract.paths).length, 'paths');
