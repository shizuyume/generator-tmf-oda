// fieldCodegen.mjs — shared field-tree helpers for pages.mjs: default values, filtering
// (readOnly / paired-name fields aren't rendered as their own input), and per-field JSX.
import { toPascalCase } from './naming.mjs';

/** Fields that are the `pairedNameField` target of some sibling relation field in the
 * same list are driven by that relation field's selection — never rendered on their own. */
export function pairedNameFieldNames(fields) {
  const names = new Set();
  for (const f of fields) {
    if (f.relation?.pairedNameField) names.add(f.relation.pairedNameField);
  }
  return names;
}

/** Fields actually rendered as inputs: not readOnly, not a relation's paired-name target. */
export function renderableFields(fields) {
  const paired = pairedNameFieldNames(fields);
  return fields.filter((f) => !f.readOnly && !paired.has(f.name));
}

export function defaultValueFor(field) {
  if (field.type === 'repeatable-group') {
    const seedOne = field.required || (field.minItems ?? 0) >= 1;
    const oneRow = () => Object.fromEntries((field.itemFields ?? []).map((f) => [f.name, defaultValueFor(f)]));
    return seedOne ? [oneRow()] : [];
  }
  if (field.defaultValue !== undefined) return field.defaultValue;
  switch (field.type) {
    case 'toggle':
    case 'checkbox':
      return false;
    default:
      return '';
  }
}

export function defaultValuesLiteral(fields) {
  const obj = Object.fromEntries(fields.map((f) => [f.name, defaultValueFor(f)]));
  return JSON.stringify(obj, null, 2);
}

/** relation fields collected recursively (used by relations.mjs's cross-page dedup pass
 * AND by pages.mjs to know which useDebouncedSearch hooks a dialog needs). */
export function collectRelations(fields) {
  const out = [];
  for (const f of fields) {
    if (f.relation) out.push(f);
    if (f.type === 'repeatable-group') out.push(...collectRelations(f.itemFields ?? []));
  }
  return out;
}

const SIMPLE_TEXT_TYPES = new Set(['text-input', 'number-input', 'email-input', 'textarea']);

/** One <Controller> block for a non-repeatable, non-relation field. `namePath` is the
 * RHF field path (e.g. `policies.${i}.name`). `hookVar` names the useDebouncedSearch
 * result variable when field is a relation (assigned by the caller). */
export function fieldControlJsx(field, namePath, { relationHookVar } = {}) {
  const label = JSON.stringify(field.label ?? field.name);
  if (field.relation) {
    const pairedPath = field.relation.pairedNameField
      ? namePath.replace(/\.[^.]+$/, `.${field.relation.pairedNameField}`)
      : undefined;
    return `<RefAutocompleteField control={control} idName={${JSON.stringify(namePath)}} ${pairedPath ? `nameName={${JSON.stringify(pairedPath)}} ` : ''}label=${label} options={${relationHookVar}.options} loading={${relationHookVar}.loading} onSearch={${relationHookVar}.search} />`;
  }
  if (field.type === 'select') {
    const options = Object.entries(field.options ?? {}).map(([value, lbl]) => `{ value: ${JSON.stringify(value)}, label: ${JSON.stringify(lbl)} }`);
    return `<Controller control={control} name={${JSON.stringify(namePath)} as any} render={({ field: rhf }) => (
        <CustomSelect label=${label} value={rhf.value} onChange={rhf.onChange} options={[${options.join(', ')}]} />
      )} />`;
  }
  if (field.type === 'toggle' || field.type === 'checkbox') {
    return `<Controller control={control} name={${JSON.stringify(namePath)} as any} render={({ field: rhf }) => (
        <FormControlLabel control={<Switch checked={!!rhf.value} onChange={(e) => rhf.onChange(e.target.checked)} size="small" />} label=${label} />
      )} />`;
  }
  if (field.type === 'radio-group') {
    const options = Object.entries(field.options ?? {}).map(([value, lbl]) => `<FormControlLabel key=${JSON.stringify(value)} value=${JSON.stringify(value)} control={<Radio size="small" />} label=${JSON.stringify(lbl)} />`);
    return `<Controller control={control} name={${JSON.stringify(namePath)} as any} render={({ field: rhf }) => (
        <RadioGroup row value={rhf.value} onChange={rhf.onChange}>${options.join('')}</RadioGroup>
      )} />`;
  }
  if (field.type === 'date-input' || field.type === 'datetime-input') {
    const htmlType = field.type === 'date-input' ? 'date' : 'datetime-local';
    return `<Controller control={control} name={${JSON.stringify(namePath)} as any} render={({ field: rhf }) => (
        <TextField {...rhf} label=${label} type=${JSON.stringify(htmlType)} size="small" fullWidth slotProps={{ inputLabel: { shrink: true } }} />
      )} />`;
  }
  if (SIMPLE_TEXT_TYPES.has(field.type)) {
    const extra = field.type === 'textarea' ? ` multiline rows={${field.rows ?? 3}}` : field.type === 'number-input' ? ' type="number"' : '';
    return `<Controller control={control} name={${JSON.stringify(namePath)} as any} render={({ field: rhf }) => (
        <CustomTextField label=${label} value={rhf.value} onChange={rhf.onChange}${extra} />
      )} />`;
  }
  // fallback: plain text
  return `<Controller control={control} name={${JSON.stringify(namePath)} as any} render={({ field: rhf }) => (
      <CustomTextField label=${label} value={rhf.value} onChange={rhf.onChange} />
    )} />`;
}

export { toPascalCase };
