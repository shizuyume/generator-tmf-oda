// emit/index.mjs — emitAll(feir, appDir): memanggil emitter per jenis halaman yang ADA.
//
// Convention by design: emitter per jenis = file `./<kind>.mjs` yang mengekspor
// `emit<Kinds>(feir, appDir)`, DIDAFTARKAN di EMITTER_KINDS di bawah:
//   - page.mjs      -> emitPages      (list)
//   - form.mjs      -> emitForms      (modal add/edit dalam list page)
//   - detail.mjs    -> emitDetails    (halaman detail, view: detail)
//   - mfe.mjs       -> emitMfes       (aktif saat output.type: mfe)
// Menambah jenis emitter = taruh file `<kind>.mjs` DAN tambahkan namanya ke
// EMITTER_KINDS — file yang ada tapi tidak terdaftar tidak pernah dipanggil.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const here = path.dirname(url.fileURLToPath(import.meta.url));

const EMITTER_KINDS = ['apitype', 'page', 'form', 'detail', 'dashboard', 'mfe']; // apitype PERTAMA - page/form mengimpor types.generated.ts (F5); dashboard SETELAH page (F7, butuh routablePages dari page.mjs sudah menulis routes)

/**
 * Emit semua jenis halaman dari FEIR ke app CRA5 di appDir.
 * @param {object} feir FE IR JSON (buildFEIR / .feir cache)
 * @param {string} appDir direktori app target (berisi package.json — diverifikasi CLI)
 * @returns {{ written: string[], summaries: string[] }}
 */
export async function emitAll(feir, appDir) {
  const written = [];
  const summaries = [];
  const warnings = [];
  for (const kind of EMITTER_KINDS) {
    const file = path.join(here, `${kind}.mjs`);
    if (!fs.existsSync(file)) continue; // file belum ditulis untuk kind ini (mis. dashboard.mjs sebelum F7)
    const fnName = `emit${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`;
    const mod = await import(url.pathToFileURL(file).href);
    if (typeof mod[fnName] !== 'function') {
      throw new Error(`emit/index: ${file} tidak mengekspor ${fnName}()`);
    }
    const result = await mod[fnName](feir, appDir);
    written.push(...(result.written ?? []));
    if (result.summary) summaries.push(result.summary);
    if (result.warnings?.length) warnings.push(...result.warnings);
  }
  return {
    written: [...new Set(written)].sort(),
    summaries,
    warnings,
  };
}