// libs/adapter.mjs — loader adapter lib FE oleh nama (ui.library dari FE spec).
// Daftar adapter: mui (M2-M5), fe-default. Emitter/scaffold TIDAK boleh hardcode
// adapter — selalu loadAdapter(ui.library) lalu pakai resolve/coverage/theme/deps/gate.
import * as mui from './mui.adapter.js';
import * as feDefault from './fe-default.adapter.js';

// neudela TIDAK lagi di sini: adapter neudela (Vite) membaca spec neudela-fe/v1 sendiri
// lewat src/fe/neudela/ — bukan fe-spec v1 / FEIR, jadi tidak lewat registry ini.
const REGISTRY = { mui, 'fe-default': feDefault };

export function adapterNames() {
  return Object.keys(REGISTRY);
}

export function loadAdapter(library = 'mui') {
  const mod = REGISTRY[library];
  if (!mod) {
    throw new Error(`adapter library "${library}" tidak terdaftar (resmi: ${adapterNames().join(' | ')})`);
  }
  return mod;
}