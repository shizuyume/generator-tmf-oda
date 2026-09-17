import fs from 'node:fs';

/**
 * Optional enrichment from a USER-AUTHORED .md (userguide / conformance notes).
 * No AI is involved: the .md must follow the fixed section schema below, and the
 * parser is a plain markdown table reader.
 *
 *   ## Resource: PartyRevSharingAlgorithm
 *   ### Fields
 *   | Field | Type | Mandatory | Description |
 *   |-------|------|-----------|-------------|
 *   | name  | string | Y       | The name of ... |
 *   ### Business Rules
 *   - Some rule sentence.
 *
 * Anything the .md says about a field is recorded with provenance 'markdown' so it
 * can never be mistaken for a spec-derived fact. Business rules are attached as
 * notes only - they are NOT turned into code (that stays in the .hooks.ts file).
 */

function parseTableRows(block) {
  const rows = [];
  for (const line of block.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.split('|').slice(1, -1).map(c => c.trim());
    if (!cells.length) continue;
    if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue; // separator row
    if (/^field$/i.test(cells[0])) continue;               // header row
    rows.push(cells);
  }
  return rows;
}

export function parseMarkdown(mdPath) {
  const text = fs.readFileSync(mdPath, 'utf8');
  const resources = {};
  const sections = text.split(/^##\s+Resource:\s*/mi).slice(1);

  for (const section of sections) {
    const [headLine, ...rest] = section.split('\n');
    const resourceName = headLine.trim();
    const body = rest.join('\n');

    const fieldsBlock = (body.split(/^###\s+Fields\s*$/mi)[1] || '').split(/^###\s+/m)[0] || '';
    const rulesBlock = (body.split(/^###\s+Business Rules\s*$/mi)[1] || '').split(/^###\s+/m)[0] || '';

    const fields = {};
    for (const cells of parseTableRows(fieldsBlock)) {
      const [field, type, mandatory, description] = cells;
      if (!field) continue;
      fields[field] = {
        type: type || null,
        mandatory: /^(y|yes|true|m|mandatory)$/i.test(mandatory || ''),
        description: description || '',
      };
    }

    const rules = rulesBlock
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.startsWith('-') || l.startsWith('*'))
      .map(l => l.replace(/^[-*]\s*/, ''))
      .filter(Boolean);

    resources[resourceName] = { fields, rules };
  }
  return resources;
}

/** Mutates `ir` in place; returns the list of applied enrichments. */
export function mergeMarkdown(ir, mdPath) {
  if (!mdPath) return { applied: [], skipped: 'no markdown supplied' };
  if (!fs.existsSync(mdPath)) {
    ir.warnings.push(`Markdown supplement not found, ignored: ${mdPath}`);
    return { applied: [], skipped: 'file not found' };
  }

  const parsed = parseMarkdown(mdPath);
  const applied = [];

  for (const resource of ir.resources) {
    const entry = parsed[resource.name];
    if (!entry) continue;

    for (const field of resource.fields) {
      const md = entry.fields[field.name];
      if (!md) continue;
      if (md.description && !field.description) {
        field.description = md.description;
        field.provenance = 'markdown';
        applied.push(`${resource.name}.${field.name}: description`);
      }
      // The .md may tighten optionality, never loosen what the spec declares required.
      if (md.mandatory && field.nullable) {
        field.nullable = false;
        field.provenance = 'markdown';
        applied.push(`${resource.name}.${field.name}: mandatory`);
      }
    }

    if (entry.rules.length) {
      resource.businessRules = entry.rules.map(text => ({ text, provenance: 'markdown' }));
      applied.push(`${resource.name}: ${entry.rules.length} business rule note(s)`);
    }
  }

  const unmatched = Object.keys(parsed).filter(n => !ir.resources.some(r => r.name === n));
  if (unmatched.length) {
    ir.warnings.push(`Markdown described resources not present in the spec: ${unmatched.join(', ')}`);
  }

  ir.meta.markdownSupplement = mdPath.replace(/\\/g, '/');
  return { applied, skipped: null };
}
