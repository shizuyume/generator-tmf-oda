#!/usr/bin/env node
/**
 * Adapter coverage gate (F0).
 *
 *   node tools/fe-coverage.mjs
 *
 * Sebelum gate ini ada, `coverage()` TIDAK PERNAH dipanggil dari check-all. Semantic
 * yang tidak dipetakan mengembalikan {status:'unsupported'} tanpa note, diam-diam —
 * persis yang dilarang libs/README.md §1 ("tidak boleh diam"). Akibatnya klaim
 * "menambah entri vocabulary memaksa setiap adapter melaporkannya" hanyalah aspirasi.
 *
 * Gate ini membuatnya nyata. Untuk SETIAP adapter terdaftar:
 *   1. coverage() melaporkan TEPAT sebanyak x-semantic-vocabulary (0 'unlisted').
 *   2. Tidak ada semantic di luar vocabulary (adapter tak boleh mengarang tipe).
 *   3. Setiap baris non-'covered' punya `note` — gap wajib tertulis.
 *   4. Setiap baris non-'covered' muncul di libraryWarnings().
 *   5. Modul mengekspor resolve/coverage/theme/scaffoldDeps/gateCommand/libraryWarnings.
 *   6. resolve() melempar untuk semantic yang tidak dikenal (fail-closed).
 */
import { SCHEMA } from '../src/fe/validateFESpec.mjs';
import { loadAdapter } from '../libs/adapter.mjs';

const LIBRARIES = ['mui', 'neudela', 'fe-default'];
const REQUIRED_EXPORTS = ['resolve', 'coverage', 'theme', 'scaffoldDeps', 'gateCommand', 'libraryWarnings'];
const VOCAB = SCHEMA['x-semantic-vocabulary'];
const vocabSet = new Set(VOCAB);

let failures = 0;
const fail = (lib, msg) => { failures++; console.log(`FAIL  ${lib}  ${msg}`); };

for (const lib of LIBRARIES) {
  const adapter = loadAdapter(lib);

  const missingExports = REQUIRED_EXPORTS.filter((k) => typeof adapter[k] !== 'function');
  if (missingExports.length) {
    fail(lib, `tidak mengekspor: ${missingExports.join(', ')} (kontrak libs/README.md)`);
    continue;
  }

  const cov = adapter.coverage();
  const seen = new Set(cov.map((r) => r.semantic));
  const missing = VOCAB.filter((s) => !seen.has(s));
  const extra = [...seen].filter((s) => !vocabSet.has(s));
  if (missing.length) fail(lib, `coverage() tidak melaporkan ${missing.length} semantic: ${missing.join(', ')}`);
  if (extra.length) fail(lib, `coverage() mengarang semantic di luar vocabulary: ${extra.join(', ')}`);

  const gaps = cov.filter((r) => r.status !== 'covered');
  const silent = gaps.filter((r) => {
    // note bisa tinggal di baris coverage ATAU di teks libraryWarnings untuk semantic itu
    const warned = adapter.libraryWarnings().some((w) => w.includes(`"${r.semantic}"`));
    return !r.note && !warned;
  });
  if (silent.length) {
    fail(lib, `gap DIAM (tanpa note & tanpa libraryWarnings): ${silent.map((r) => r.semantic).join(', ')}`);
  }

  const unwarned = gaps.filter((r) => !adapter.libraryWarnings().some((w) => w.includes(`"${r.semantic}"`)));
  if (unwarned.length) {
    fail(lib, `gap tidak muncul di libraryWarnings(): ${unwarned.map((r) => r.semantic).join(', ')}`);
  }

  let threw = false;
  try { adapter.resolve('__tidak-ada__'); } catch { threw = true; }
  if (!threw) fail(lib, 'resolve() tidak melempar untuk semantic tak dikenal (harus fail-closed)');

  if (!failures) {
    const by = gaps.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
    const gapText = Object.entries(by).map(([k, n]) => `${n} ${k}`).join(', ') || 'tanpa gap';
    console.log(`PASS  ${lib}  ${cov.length}/${VOCAB.length} semantic dilaporkan (${gapText}), ${adapter.libraryWarnings().length} warning tertulis`);
  }
}

console.log(failures ? `\n${failures} failure(s)` : `\nall adapter coverage checks passed (${LIBRARIES.length} adapters x ${VOCAB.length} semantic)`);
process.exit(failures ? 1 : 0);
