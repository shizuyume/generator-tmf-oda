// libs/adapter.mjs — loader adapter lib FE oleh nama (ui.library dari FE spec).
// Daftar adapter: mui (M2-M5), neudela (M6). Emitter/scaffold TIDAK boleh hardcode
// adapter — selalu loadAdapter(ui.library) lalu pakai resolve/coverage/theme/deps/gate.
import * as mui from './mui.adapter.js';
import * as neudela from './neudela.adapter.js';
import * as feDefault from './fe-default.adapter.js';

const REGISTRY = { mui, neudela, 'fe-default': feDefault };

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