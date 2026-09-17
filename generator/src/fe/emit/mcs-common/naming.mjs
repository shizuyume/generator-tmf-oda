// naming.mjs — shared case-conversion + resource-name derivation for emit/mcs-common/*.
// Resource identity is derived from the list endpoint's REST path (the TMF wire
// resource name, e.g. "partyRevSharingAlgorithm"), NOT from page.id/path/title (which
// are UI concerns and may be kebab-case/plural/localized) — this matches the actual TMF
// resource segment used by types/service/exposes naming in the hand-built reference.

export function resourceNameFromApiPath(apiPath) {
  const segs = String(apiPath)
    .split('/')
    .filter((s) => s && !s.includes('{{') && !s.includes('{') && !s.startsWith(':'));
  const last = segs.pop();
  if (!last) throw new Error(`naming: cannot derive resource name from api path "${apiPath}"`);
  return last;
}

export function toPascalCase(s) {
  return String(s)
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/(^|\s)([a-zA-Z0-9])/g, (_, __, c) => c.toUpperCase())
    .replace(/\s+/g, '');
}

export function toCamelCase(s) {
  const p = toPascalCase(s);
  return p ? p.charAt(0).toLowerCase() + p.slice(1) : p;
}

export function toKebabCase(s) {
  return String(s)
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
