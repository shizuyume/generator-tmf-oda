/** Naming derivations. Deterministic - no per-case special-casing. */

/** Split an identifier or phrase into lowercase word parts. */
export function words(input) {
  return String(input)
    .replace(/^@/, '')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.toLowerCase());
}

export const pascal = s => words(s).map(w => w[0].toUpperCase() + w.slice(1)).join('');
export const camel = s => {
  const p = pascal(s);
  return p ? p[0].toLowerCase() + p.slice(1) : '';
};
export const kebab = s => words(s).join('-');
export const snake = s => words(s).join('_');

/** 'Revenue Sharing Algorithm Management' -> 'revenueSharingAlgorithmManagement' */
export const apiName = title => camel(title);

/** Event exchange base: title minus a trailing 'Management' -> 'revenueSharingAlgorithm' */
export function exchangeBase(title) {
  const w = words(title);
  if (w.length > 1 && w[w.length - 1] === 'management') w.pop();
  return camel(w.join(' '));
}

/** 'TMF736-Revenue_Sharing...' or a path containing 'tmf736' -> '736' */
export function tmfNumber(specPath) {
  const m = String(specPath).match(/tmf[-_ ]?(\d{3,4})/i);
  return m ? m[1] : null;
}

export const majorVersion = v => String(v || '').split('.')[0] || '1';
