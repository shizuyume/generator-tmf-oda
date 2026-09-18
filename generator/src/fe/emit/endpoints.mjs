// emit/endpoints.mjs — resolusi endpoint PER HALAMAN, bukan per app.
//
// `api.endpoints` adalah peta datar. fe-spec menamai kuncinya per resource
// (`individual.create`) karena harus: komponen dengan dua resource akan
// bertabrakan pada `create` telanjang - keduanya menunjuk endpoint yang sama dan
// satu resource diam-diam memanggil API milik resource lain.
//
// Emitter ditulis ketika setiap spec punya tepat satu resource, jadi mereka
// membaca kunci telanjang. Akibatnya spec keluaran fe-spec ditolak oleh
// fe-gen emit ("FEIR tidak punya endpoint create") - dua paruh pipeline yang
// sama tidak sepakat, dan app multi-resource tidak pernah bisa dihasilkan.
//
// Resolusi di sini menerima keduanya: kunci milik halaman itu sendiri lebih
// dulu, lalu kunci telanjang. Fallback itu BUKAN kerapian - tujuh spec golden
// ditulis tangan dengan kunci telanjang, dan tanpa fallback semuanya langsung
// merah: kita akan merusak yang sedang bekerja demi memperbaiki yang belum
// pernah jalan.

/** Operasi CRUD yang dibaca emitter. Bukan daftar bebas - page.mjs/form.mjs/
 *  detail.mjs hanya menanyakan kelimanya. */
const OPS = ['list', 'create', 'retrieve', 'update', 'delete'];

/**
 * Endpoint yang berlaku untuk satu halaman.
 *
 * fe-spec menulis `page.id` dan namespace endpoint dari sumber yang sama
 * (`resource.camelName`), jadi keduanya selalu cocok untuk spec bangkitan.
 * Spec tulisan tangan yang memakai kunci telanjang jatuh ke cabang kedua.
 *
 * @param {object} feir FEIR hasil buildFEIR (dipakai `feir.api.endpoints`).
 * @param {object} page satu entri `feir.pages`.
 * @returns {Record<string,string>} hanya operasi yang BENAR-BENAR ada; operasi
 *   yang tidak dideklarasikan sengaja absen, supaya emitter tetap melempar
 *   "no invented endpoints" alih-alih mengarang path.
 */
export function endpointsFor(feir, page) {
  const all = feir?.api?.endpoints ?? {};
  const scope = page?.id;
  const out = {};
  for (const op of OPS) {
    const scoped = scope ? all[`${scope}.${op}`] : undefined;
    const value = scoped ?? all[op];
    if (value !== undefined) out[op] = value;
  }
  return out;
}
