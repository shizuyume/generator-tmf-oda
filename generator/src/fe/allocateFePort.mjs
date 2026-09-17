import fs from 'node:fs';
import path from 'node:path';

/**
 * Port FE (CRA dev, range 5012-5099) dialokasikan, bukan ditebak: scan `set PORT=`
 * di package.json app lain di feTargetRoot, tabrakan → port berikutnya, habis →
 * throw (cli peta ke exit 4, pola allocatePort BE).
 */

// cocok utk kedua bentuk skrip start: legacy cmd.exe "set PORT=5015" dan bentuk
// cross-shell (cross-env) "cross-env PORT=5015" — g: matchAll butuh flag global (tanpa g -> throw)
const PORT_SCRIPT_RE = /(?:set|cross-env)\s+PORT=(\d{2,5})/gi;

export function scanFePorts(feTargetRoot) {
  const used = new Set();
  if (!feTargetRoot || !fs.existsSync(feTargetRoot)) return [];
  for (const entry of fs.readdirSync(feTargetRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    for (const sub of ['', 'fe', 'frontend']) {
      const pkg = path.join(feTargetRoot, entry.name, sub, 'package.json');
      if (!fs.existsSync(pkg)) continue;
      try {
        const text = fs.readFileSync(pkg, 'utf8');
        for (const m of text.matchAll(PORT_SCRIPT_RE)) used.add(Number(m[1]));
      } catch {
        /* package.json yang korup tidak ikut mengunci port */
      }
    }
  }
  return [...used].sort((a, b) => a - b);
}

export function allocateFePort(feTargetRoot, range = [5012, 5099]) {
  const used = scanFePorts(feTargetRoot);
  const usedSet = new Set(used);
  const [lo, hi] = range;
  for (let p = lo; p <= hi; p++) {
    if (!usedSet.has(p)) return { port: p, used };
  }
  throw new Error(`no free FE port in range ${lo}-${hi} (${used.length} ports already in use)`);
}