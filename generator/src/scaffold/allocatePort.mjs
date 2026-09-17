import fs from 'node:fs';
import path from 'node:path';

/**
 * Ports must be allocated, not guessed: the repo already contains a collision
 * (partnership_management and process-orchestration-service both default to 3020).
 * Every source that can pin a port is scanned, so a new service cannot land on a
 * port any existing service might claim.
 */

const PORT_RE = /\b(3[0-9]{3}|4[0-9]{3})\b/g;

function portsFromEnvFile(file) {
  const found = new Set();
  if (!fs.existsSync(file)) return found;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*#?\s*(?:PORT|APP_PORT|SERVER_PORT)\s*=\s*(\d{2,5})\s*$/i);
    if (m) found.add(Number(m[1]));
  }
  return found;
}

function portsFromMain(file) {
  const found = new Set();
  if (!fs.existsSync(file)) return found;
  const text = fs.readFileSync(file, 'utf8');
  // only look at the listen() call, so unrelated 4-digit literals are ignored
  const listen = text.match(/\.listen\(([^)]*)\)/s);
  const scope = listen ? listen[1] : '';
  for (const m of scope.matchAll(PORT_RE)) found.add(Number(m[1]));
  return found;
}

/** @returns {{used:number[], byService:Record<string,number[]>}} */
export function scanUsedPorts(targetRoot) {
  const byService = {};
  const used = new Set();
  if (!fs.existsSync(targetRoot)) return { used: [], byService };

  for (const entry of fs.readdirSync(targetRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const backend = path.join(targetRoot, entry.name, 'backend');
    if (!fs.existsSync(backend)) continue;

    const found = new Set([
      ...portsFromEnvFile(path.join(backend, '.env')),
      ...portsFromEnvFile(path.join(backend, '.env.example')),
      ...portsFromMain(path.join(backend, 'src', 'main.ts')),
    ]);
    if (found.size) {
      byService[entry.name] = [...found].sort((a, b) => a - b);
      for (const p of found) used.add(p);
    }
  }
  return { used: [...used].sort((a, b) => a - b), byService };
}

/**
 * Derives the "identity port" for a TMF component: '3' + the TMF number, e.g.
 * TMF736 -> 3736. The leading 3 has no other meaning than "this is a tmfgen
 * backend"; it just keeps the door open for a future non-3xxx allocator (a
 * frontend, a gateway) without colliding with today's backends.
 *
 * @param {string|number|null} tmfNumber
 * @returns {number|null}
 */
export function identityPort(tmfNumber) {
  const digits = String(tmfNumber ?? '').replace(/\D/g, '');
  return digits ? Number(`3${digits}`) : null;
}

/**
 * @param {string} targetRoot
 * @param {[number, number]} range
 * @param {number|null} preferred explicit --port, validated against the scan
 * @param {string|number|null} tmfNumber used to derive the default identity port
 */
export function allocatePort(targetRoot, range = [3026, 3099], preferred = null, tmfNumber = null) {
  const { used, byService } = scanUsedPorts(targetRoot);
  const usedSet = new Set(used);

  if (preferred != null) {
    const owner = Object.entries(byService).find(([, ports]) => ports.includes(preferred));
    if (owner) {
      throw new Error(`port ${preferred} is already used by ${owner[0]}; pick another or omit --port`);
    }
    return { port: preferred, source: 'explicit --port', used, byService };
  }

  const identity = identityPort(tmfNumber);
  if (identity != null) {
    const owner = Object.entries(byService).find(([, ports]) => ports.includes(identity));
    if (!owner) {
      return { port: identity, source: `TMF${tmfNumber} identity port (3${tmfNumber})`, used, byService };
    }
    // identity port already claimed by another service: fall through to a
    // scanned free port instead of silently colliding with it.
  }

  const [lo, hi] = range;
  for (let p = lo; p <= hi; p++) {
    if (!usedSet.has(p)) return { port: p, source: `first free in ${lo}-${hi}`, used, byService };
  }
  throw new Error(`no free port in range ${lo}-${hi} (${used.length} ports already in use)`);
}
