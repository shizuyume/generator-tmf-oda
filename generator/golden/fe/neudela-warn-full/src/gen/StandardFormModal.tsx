import { ReactElement, useEffect, useMemo, useState } from 'react';
import { NeuronButton, NeuronCheckbox, NeuronInput, NeuronToggle } from 'neudela';
import { Plus, Trash2 } from 'lucide-react';
import { Controller, SubmitHandler, useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { Control, FieldValues, Resolver, UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';

/* ── types (kontrak SAMA dengan versi MUI — emitter form netral) ── */

export interface FieldZodRule {
  rule: string;
  value?: unknown;
  message?: string;
}

export interface FieldSpec {
  name: string;
  label?: string;
  type: string; // text | textarea | number | email | password | select | toggle | repeatable
  required?: boolean;
  readOnly?: boolean;
  defaultValue?: unknown;
  placeholder?: string;
  computedFrom?: string;
  rows?: number;
  options?: Record<string, string>;
  minItems?: number;
  itemLabel?: string;
  addButton?: string;
  itemFields?: FieldSpec[];
  itemPayload?: Record<string, unknown>;
  zodRules?: FieldZodRule[];
  min?: number | string; // F3: date/datetime/number
  max?: number | string; // F3: date/datetime/number
  layout?: 'inline' | 'stacked'; // F3: checkbox/radio-group (radio-group UNSUPPORTED neudela)
}

export interface StandardFormModalProps<T extends Record<string, unknown> = Record<string, unknown>> {
  open: boolean;
  title: string;
  fields: FieldSpec[];
  defaultValues?: Record<string, unknown>;
  onClose: () => void;
  onSubmit: (values: T) => Promise<void> | void;
  mode?: 'onBlur' | 'onChange' | 'onSubmit' | 'onTouched' | 'all';
  reValidateMode?: 'onBlur' | 'onChange' | 'onSubmit';
  submitLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  width?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  payloadSpec?: Record<string, unknown>;
}

/* ── zod schema (dari fields.*.zodRules — runtime generic) ── */

function zodField(f: FieldSpec): z.ZodTypeAny {
  const rules = f.zodRules ?? [];
  if (f.type === 'repeatable') {
    const itemSchema = f.itemFields?.length ? z.object(zObjectShape(f.itemFields)) : z.record(z.unknown());
    const arr = z.array(itemSchema);
    const minItems = rules.find((r) => r.rule === 'minItems');
    return minItems ? arr.min(Number(minItems.value), minItems.message) : arr;
  }
  if (f.type === 'toggle' || f.type === 'checkbox') return z.boolean().optional();
  if (f.type === 'number') {
    let s = z.number();
    const min = rules.find((r) => r.rule === 'min');
    if (min) s = s.min(Number(min.value), min.message);
    const max = rules.find((r) => r.rule === 'max');
    if (max) s = s.max(Number(max.value), max.message);
    return s.optional();
  }
  let s = z.string();
  if (f.required) s = s.min(1, rules.find((r) => r.rule === 'required')?.message ?? 'Wajib diisi');
  const ml = rules.find((r) => r.rule === 'minLength');
  if (ml) s = s.min(Number(ml.value), ml.message);
  const xl = rules.find((r) => r.rule === 'maxLength');
  if (xl) s = s.max(Number(xl.value), xl.message);
  if (rules.some((r) => r.rule === 'email')) s = s.email();
  const pat = rules.find((r) => r.rule === 'pattern');
  if (pat) s = s.regex(new RegExp(String(pat.value)), pat.message);
  return f.required ? s : s.optional();
}

function zObjectShape(fields: FieldSpec[]): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) shape[f.name] = zodField(f);
  return shape;
}

/* ── itemPayload / payloadSpec reconstruction ── */

function resolvePayloadToken(token: string, values: Record<string, unknown>, item?: Record<string, unknown>): unknown {
  const m = /^(fields|item)\.(.+)$/.exec(token);
  if (m) {
    const src = m[1] === 'item' ? (item ?? values) : values;
    return src[m[2]];
  }
  return token;
}

// F3: 10 verb tertutup (schema $defs.transformVerb) - TANPA argumen, jadi tak ada cabang
// per-spesifikasi yang bisa membusuk diam-diam. buildFEIR (normalizePayload) sudah menolak
// verb di luar daftar ini SEBELUM emit, jadi `default` di sini seharusnya tak pernah kena -
// tetap ditulis sebagai identity, bukan throw, supaya satu verb baru yang lolos validasi
// tapi belum dipetakan runtime tidak meledakkan form pengguna.
function applyTransform(value: unknown, verb?: string): unknown {
  switch (verb) {
    case 'id': return (value as Record<string, unknown> | null | undefined)?.['id'];
    case 'name': return (value as Record<string, unknown> | null | undefined)?.['name'];
    case 'value': return (value as Record<string, unknown> | null | undefined)?.['value'];
    case 'string': return value == null ? value : String(value);
    case 'number': return value == null || value === '' ? value : Number(value);
    case 'boolean': return Boolean(value);
    case 'trim': return typeof value === 'string' ? value.trim() : value;
    case 'iso-date': return value ? new Date(value as string | number | Date).toISOString() : value;
    case 'array-ids': return Array.isArray(value) ? value.map((v) => (v as Record<string, unknown> | null)?.['id']) : value;
    case 'json': return value;
    default: return value;
  }
}

export function toPayload(
  values: Record<string, unknown>,
  spec: Record<string, unknown>,
  item?: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(spec)) {
    if (typeof value === 'string') {
      out[key] = resolvePayloadToken(value, values, item);
    } else if (value && typeof value === 'object' && '$src' in (value as Record<string, unknown>)) {
      // Node transform (F3): {$src, $tx} - ditulis buildFEIR.normalizePayload dari YAML
      // {source, transform}. $tx opsional (source tanpa transform = passthrough identity).
      const node = value as { $src: string; $tx?: string };
      out[key] = applyTransform(resolvePayloadToken(node.$src, values, item), node.$tx);
    } else if (value && typeof value === 'object') {
      out[key] = toPayload(values, value as Record<string, unknown>, item);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/* ── field render (neudela: NeuronInput / NeuronToggle / <select> fallback) ── */

interface FieldRenderProps {
  field: FieldSpec;
  control: Control<FieldValues>;
  setValue: UseFormSetValue<FieldValues>;
  name?: string;
}

function FieldControl({ field, control, setValue, name }: FieldRenderProps): ReactElement {
  const path = name ?? field.name;
  const computed = field.computedFrom;
  const watched = useWatch({ control, name: computed ?? '' });
  useEffect(() => {
    if (computed && watched !== undefined) {
      setValue(path, watched, { shouldValidate: false });
    }
  }, [computed, watched, setValue, path]);

  return (
    <Controller
      name={path}
      control={control}
      render={({ field: rhf, fieldState }) => {
        const errMsg = fieldState?.error?.message;
        const disabled = !!field.readOnly;
        const label = `${field.label ?? field.name}${field.required ? ' *' : ''}`;
        if (field.type === 'toggle') {
          return (
            <div className="neudela-form-field">
              <NeuronToggle
                checked={!!rhf.value}
                disabled={disabled}
                onChange={(checked) => rhf.onChange(checked)}
                label={label}
                name={path}
                aria-label={label}
              />
            </div>
          );
        }
        if (field.type === 'checkbox') {
          return (
            <div className="neudela-form-field">
              <NeuronCheckbox
                checked={!!rhf.value}
                disabled={disabled}
                onChange={(checked) => rhf.onChange(checked)}
                label={label}
                name={path}
              />
            </div>
          );
        }
        if (field.type === 'date' || field.type === 'datetime') {
          // NEUDELA GAP: NeuronInput dipakai type=date - bukan date-picker khusus (adapter: fallback)
          return (
            <div className="neudela-form-field">
              <label className="neuron-label">{label}</label>
              <NeuronInput
                type={field.type === 'datetime' ? 'datetime-local' : 'date'}
                disabled={disabled}
                value={(rhf.value as string) ?? ''}
                onChange={(e) => rhf.onChange(e.target.value)}
                name={path}
                aria-label={label}
              />
            </div>
          );
        }
        if (field.type === 'select') {
          // NEUDELA GAP: tak ada NeuronSelect — fallback <select> HTML + class neuron (adapter neudela: select FALLBACK)
          return (
            <div className="neudela-form-field">
              <label className="neuron-label">{label}</label>
              <select
                className="neuron-select"
                value={(rhf.value as string) ?? ''}
                onChange={(e) => rhf.onChange(e.target.value)}
                disabled={disabled}
                name={path}
              >
                <option value="">— pilih —</option>
                {Object.entries(field.options ?? {}).map(([value, optionLabel]) => (
                  <option key={value} value={value}>
                    {optionLabel}
                  </option>
                ))}
              </select>
              {errMsg && <span className="neuron-helper-text neuron-helper-text--error">{errMsg}</span>}
            </div>
          );
        }
        const inputType =
          field.type === 'number' ? 'number'
          : field.type === 'email' ? 'email'
          : field.type === 'password' ? 'password'
          : 'text';
        return (
          <div className="neudela-form-field">
            <NeuronInput
              label={label}
              required={!!field.required}
              disabled={disabled}
              type={inputType}
              placeholder={field.placeholder}
              value={rhf.value == null ? '' : String(rhf.value)}
              onChange={(e) => {
                if (field.type === 'number') {
                  const v = e.target.value;
                  rhf.onChange(v === '' ? undefined : Number(v));
                } else {
                  rhf.onChange(e.target.value);
                }
              }}
              helperText={errMsg}
              state={errMsg ? 'error' : 'default'}
              name={path}
            />
          </div>
        );
      }}
    />
  );
}

function RepeatableField({ field, control, setValue }: FieldRenderProps): ReactElement {
  const { fields, append, remove } = useFieldArray({ control, name: field.name });
  const empty: Record<string, unknown> = {};
  for (const sub of field.itemFields ?? []) {
    if (sub.defaultValue !== undefined) empty[sub.name] = sub.defaultValue;
  }
  const min = field.minItems ?? (field.required ? 1 : 0);
  return (
    <div className="neudela-form-repeatable">
      <div className="neuron-label">
        {field.label ?? field.name}
        {field.required ? ' *' : ''}
      </div>
      {fields.map((item, index) => (
        <div key={item.id} className="neudela-form-repeatable__item">
          <div className="neudela-form-repeatable__item-head">
            <span className="neudela-form-repeatable__item-label">
              {field.itemLabel ? field.itemLabel.replace(/\{\{\s*index\s*\}\}/g, String(index + 1)) : `Item ${index + 1}`}
            </span>
            <NeuronButton variant="outline" size="sm" onClick={() => remove(index)} disabled={fields.length <= min} aria-label={`Hapus item ${index + 1}`}>
              <Trash2 size={14} />
            </NeuronButton>
          </div>
          {(field.itemFields ?? []).map((sub) => (
            <FieldControl key={sub.name} field={sub} control={control} setValue={setValue} name={`${field.name}.${index}.${sub.name}`} />
          ))}
        </div>
      ))}
      <NeuronButton variant="outline" size="sm" leadingIcon={<Plus size={16} />} onClick={() => append(empty)}>
        {field.addButton ?? '+ Tambah'}
      </NeuronButton>
    </div>
  );
}

/* ── modal (neudela: overlay div + card — adapter neudela: modal FALLBACK) ── */

export function StandardFormModal<T extends Record<string, unknown> = Record<string, unknown>>(
  props: StandardFormModalProps<T>,
): ReactElement {
  const {
    open,
    title,
    fields,
    defaultValues,
    onClose,
    onSubmit,
    submitLabel = 'Simpan',
    cancelLabel = 'Batal',
  } = props;

  const schema = useMemo(() => z.object(zObjectShape(fields)), [fields]);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isSubmitting },
  } = useForm<Record<string, unknown>>({
    mode: props.mode ?? 'onChange',
    reValidateMode: props.reValidateMode ?? 'onChange',
    resolver: undefined as unknown as Resolver<Record<string, unknown>>,
    defaultValues: defaultValues ?? {},
  });
  const [submitError, setSubmitError] = useState<string | null>(null);

  // zodResolver dipakai PADA SUBMIT (manual) — menghindari dep @hookform/resolvers
  // di template neudela; error ditampilkan inline sebagai alert box di modal.
  const validate = (values: Record<string, unknown>): string | null => {
    const res = schema.safeParse(values);
    if (res.success) return null;
    const first = res.error.issues[0];
    return first ? `${first.path.join('.')}: ${first.message}` : 'Validasi gagal';
  };

  useEffect(() => {
    if (open) {
      reset(defaultValues ?? {});
      setSubmitError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit: SubmitHandler<Record<string, unknown>> = async (values) => {
    const invalid = validate(values);
    if (invalid) {
      setSubmitError(invalid);
      return;
    }
    const out: Record<string, unknown> = { ...values };
    for (const f of fields) {
      if (f.type === 'repeatable' && f.itemPayload && Array.isArray(out[f.name])) {
        out[f.name] = (out[f.name] as unknown[]).map((item) =>
          toPayload(item as Record<string, unknown>, f.itemPayload as Record<string, unknown>),
        );
      }
    }
    const finalValues = props.payloadSpec ? toPayload(out, props.payloadSpec) : out;
    await onSubmit(finalValues as T);
  };

  if (!open) return <div />;

  return (
    <div className="neudela-modal-overlay" onClick={onClose}>
      <div className="neudela-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className="neudela-modal__title">{title}</div>
        {submitError && (
          <div className="neudela-alert neudela-alert--error" data-testid="form-submit-error">
            <span>{submitError}</span>
          </div>
        )}
        <form onSubmit={handleSubmit(submit)} noValidate>
          <div className="neudela-modal__body">
            {fields.map((f) =>
              f.type === 'repeatable' ? (
                <RepeatableField key={f.name} field={f} control={control} setValue={setValue} />
              ) : (
                <FieldControl key={f.name} field={f} control={control} setValue={setValue} />
              ),
            )}
          </div>
          <div className="neudela-modal__actions">
            <NeuronButton variant="outline" onClick={onClose} type="button">
              {cancelLabel}
            </NeuronButton>
            <NeuronButton variant="primary" type="submit" disabled={isSubmitting || props.submitting}>
              {isSubmitting || props.submitting ? 'Menyimpan...' : submitLabel}
            </NeuronButton>
          </div>
        </form>
      </div>
    </div>
  );
}