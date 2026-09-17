import { ReactElement, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Controller, SubmitHandler, useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { Control, FieldValues, Resolver, UseFormSetValue } from 'react-hook-form';
import { z } from 'zod';
import { Modal } from '../components/Modal';
import { FormGrid } from '../components/FormGrid';
import { FormField } from '../components/FormField';
import { TextInput } from '../components/TextInput';
import { Select } from '../components/Select';
import { Toggle } from '../components/Toggle';
import { DateInput } from '../components/DateInput';
import { Checkbox } from '../components/Checkbox';
import { RadioGroup } from '../components/RadioGroup';
import { Button } from '../components/Button';
import { UiAlert } from './uiwrappers';

/* ── types (kontrak SAMA dengan versi MUI/neudela — emitter form netral) ── */

export interface FieldZodRule {
  rule: string;
  value?: unknown;
  message?: string;
}

export interface FieldSpec {
  name: string;
  label?: string;
  type: string; // text|textarea|number|email|password|select|toggle|repeatable|date|datetime|checkbox|radio|autocomplete (F3)
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
  layout?: 'inline' | 'stacked'; // F3: checkbox/radio-group
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
  if (f.type === 'toggle') return z.boolean().optional();
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

/* ── field render (fe-default: TextInput / Select / Toggle local components) ── */

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
        if (field.type === 'toggle') {
          return (
            <FormField>
              <Toggle checked={!!rhf.value} disabled={disabled} onChange={(checked) => rhf.onChange(checked)} label={field.label ?? field.name} name={path} />
            </FormField>
          );
        }
        if (field.type === 'checkbox') {
          return (
            <FormField error={errMsg}>
              <Checkbox checked={!!rhf.value} disabled={disabled} onChange={(e) => rhf.onChange(e.target.checked)} label={field.label ?? field.name} name={path} />
            </FormField>
          );
        }
        if (field.type === 'radio') {
          return (
            <FormField label={field.label ?? field.name} required={field.required} error={errMsg}>
              <RadioGroup
                name={path}
                value={(rhf.value as string) ?? ''}
                disabled={disabled}
                layout={field.layout ?? 'inline'}
                options={Object.entries(field.options ?? {}).map(([value, label]) => ({ value, label }))}
                onChange={(value) => rhf.onChange(value)}
              />
            </FormField>
          );
        }
        if (field.type === 'date' || field.type === 'datetime') {
          return (
            <FormField label={field.label ?? field.name} required={field.required} error={errMsg}>
              <DateInput
                datetime={field.type === 'datetime'}
                disabled={disabled}
                min={field.min as string | number | undefined}
                max={field.max as string | number | undefined}
                value={(rhf.value as string) ?? ''}
                error={!!errMsg}
                onChange={(e) => rhf.onChange(e.target.value)}
                name={path}
              />
            </FormField>
          );
        }
        if (field.type === 'autocomplete') {
          // fe-default: typeahead TIDAK didukung (§3 rencana - tak ada primitif combobox
          // sungguhan di v1). emit/form.mjs sudah menolak field ini SEBELUM generate lewat
          // adapter.resolve('typeahead') (THROW_SET) - cabang ini tidak akan pernah dipakai
          // untuk fe-default, disiapkan untuk adapter yang MEMANG mendukungnya (mui).
          return (
            <FormField label={field.label ?? field.name} required={field.required} error={errMsg}>
              <Select
                value={(rhf.value as string) ?? ''}
                onChange={(e) => rhf.onChange(e.target.value)}
                disabled={disabled}
                name={path}
                placeholder="— pilih —"
                options={Object.entries(field.options ?? {}).map(([value, label]) => ({ value, label }))}
              />
            </FormField>
          );
        }
        if (field.type === 'select') {
          return (
            <FormField label={field.label ?? field.name} required={field.required} error={errMsg}>
              <Select
                value={(rhf.value as string) ?? ''}
                onChange={(e) => rhf.onChange(e.target.value)}
                disabled={disabled}
                name={path}
                placeholder="— pilih —"
                options={Object.entries(field.options ?? {}).map(([value, label]) => ({ value, label }))}
              />
            </FormField>
          );
        }
        const inputType =
          field.type === 'number' ? 'number'
          : field.type === 'email' ? 'email'
          : field.type === 'password' ? 'password'
          : 'text';
        return (
          <FormField label={field.label ?? field.name} required={field.required} error={errMsg} helper={field.type === 'textarea' ? undefined : undefined}>
            <TextInput
              required={!!field.required}
              disabled={disabled}
              type={inputType}
              multiline={field.type === 'textarea'}
              rows={field.rows}
              placeholder={field.placeholder}
              value={rhf.value == null ? '' : String(rhf.value)}
              error={!!errMsg}
              onChange={(e) => {
                if (field.type === 'number') {
                  const v = e.target.value;
                  rhf.onChange(v === '' ? undefined : Number(v));
                } else {
                  rhf.onChange(e.target.value);
                }
              }}
              name={path}
            />
          </FormField>
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
    <div className="col-span-full grid gap-3">
      <div className="text-xs font-semibold text-text-primary">
        {field.label ?? field.name}
        {field.required ? ' *' : ''}
      </div>
      {fields.map((item, index) => (
        <div key={item.id} className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">
              {field.itemLabel ? field.itemLabel.replace(/\{\{\s*index\s*\}\}/g, String(index + 1)) : `Item ${index + 1}`}
            </span>
            <Button tone="tertiary" size="sm" iconOnly onClick={() => remove(index)} disabled={fields.length <= min} aria-label={`Hapus item ${index + 1}`}>
              <Trash2 size={14} />
            </Button>
          </div>
          <FormGrid>
            {(field.itemFields ?? []).map((sub) => (
              <FieldControl key={sub.name} field={sub} control={control} setValue={setValue} name={`${field.name}.${index}.${sub.name}`} />
            ))}
          </FormGrid>
        </div>
      ))}
      <Button tone="tertiary" size="sm" startIcon={<Plus size={16} />} onClick={() => append(empty)}>
        {field.addButton ?? '+ Tambah'}
      </Button>
    </div>
  );
}

/* ── modal (fe-default: local Modal component) ── */

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
    width = 'md',
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

  // zodResolver dipakai PADA SUBMIT (manual) — konsisten dgn versi neudela (tanpa dep
  // @hookform/resolvers di runtime path ini); error ditampilkan inline via UiAlert di modal.
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

  return (
    <Modal
      open={open}
      title={title}
      width={width}
      onClose={onClose}
      footer={
        <>
          <Button tone="default" type="button" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button tone="primary" type="submit" form="standard-form-modal" disabled={isSubmitting || props.submitting}>
            {isSubmitting || props.submitting ? 'Menyimpan...' : submitLabel}
          </Button>
        </>
      }
    >
      {submitError && (
        <div className="mb-3" data-testid="form-submit-error">
          <UiAlert severity="error">{submitError}</UiAlert>
        </div>
      )}
      <form id="standard-form-modal" onSubmit={handleSubmit(submit)} noValidate>
        <FormGrid>
          {fields.map((f) =>
            f.type === 'repeatable' ? (
              <RepeatableField key={f.name} field={f} control={control} setValue={setValue} />
            ) : (
              <FieldControl key={f.name} field={f} control={control} setValue={setValue} />
            ),
          )}
        </FormGrid>
      </form>
    </Modal>
  );
}
