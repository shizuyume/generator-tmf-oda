import { ReactElement, useEffect, useMemo } from 'react';
import {
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  Radio,
  RadioGroup,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import { Controller, SubmitHandler, useFieldArray, useForm, useWatch } from 'react-hook-form';
import type { Control, FieldValues, Resolver, UseFormSetValue } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

/* ── types ─────────────────────────────────────────────────────────── */

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
  /** Rekonstruksi root payload (bentuk `api.payload` YAML: `name: fields.name` dst). */
  payloadSpec?: Record<string, unknown>;
}

/* ── zod schema (dari fields.*.zodRules — runtime generic; emitter boleh lewati) ── */

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

/* ── itemPayload / payloadSpec reconstruction ───────────────────────── */

function resolvePayloadToken(token: string, values: Record<string, unknown>, item?: Record<string, unknown>): unknown {
  const m = /^(fields|item)\.(.+)$/.exec(token);
  if (m) {
    const src = m[1] === 'item' ? (item ?? values) : values;
    return src[m[2]];
  }
  return token; // literal
}

/** Rekonstruksi payload dari mapping spec (itemPayload item repeatable / api.payload form). */
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

/* ── field render ───────────────────────────────────────────────────── */

interface FieldRenderProps {
  field: FieldSpec;
  control: Control<FieldValues>;
  setValue: UseFormSetValue<FieldValues>;
  name?: string;
  errors?: Record<string, unknown>;
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
        const common = {
          label: `${field.label ?? field.name}${field.required ? ' *' : ''}`,
          disabled,
          error: !!errMsg,
          helperText: errMsg,
          placeholder: field.placeholder,
          fullWidth: true,
          size: 'small' as const,
          margin: 'dense' as const,
        };
        if (field.type === 'toggle') {
          return (
            <FormControlLabel
              control={
                <Switch
                  checked={!!rhf.value}
                  disabled={disabled}
                  onChange={(e) => rhf.onChange(e.target.checked)}
                  name={path}
                />
              }
              label={field.label ?? field.name}
            />
          );
        }
        if (field.type === 'checkbox') {
          return (
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!rhf.value}
                  disabled={disabled}
                  onChange={(e) => rhf.onChange(e.target.checked)}
                  name={path}
                />
              }
              label={field.label ?? field.name}
            />
          );
        }
        if (field.type === 'radio') {
          return (
            <RadioGroup
              row={(field.layout ?? 'inline') === 'inline'}
              value={rhf.value ?? ''}
              onChange={(e) => rhf.onChange(e.target.value)}
              name={path}
            >
              {Object.entries(field.options ?? {}).map(([value, label]) => (
                <FormControlLabel key={value} value={value} disabled={disabled} control={<Radio />} label={label} />
              ))}
            </RadioGroup>
          );
        }
        if (field.type === 'date' || field.type === 'datetime') {
          return (
            <TextField
              {...common}
              type={field.type === 'datetime' ? 'datetime-local' : 'date'}
              InputLabelProps={{ shrink: true }}
              inputProps={{ min: field.min, max: field.max }}
              value={rhf.value ?? ''}
              onChange={(e) => rhf.onChange(e.target.value)}
              name={path}
            />
          );
        }
        if (field.type === 'autocomplete') {
          const opts = Object.keys(field.options ?? {});
          return (
            <Autocomplete
              disabled={disabled}
              options={opts}
              getOptionLabel={(v) => (field.options ?? {})[v as string] ?? String(v)}
              value={(rhf.value as string) ?? null}
              onChange={(_e, v) => rhf.onChange(v ?? '')}
              renderInput={(params) => <TextField {...params} {...common} name={path} />}
            />
          );
        }
        if (field.type === 'select') {
          return (
            <TextField select {...common} value={rhf.value ?? ''} onChange={rhf.onChange} name={path}>
              {Object.entries(field.options ?? {}).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          );
        }
        if (field.type === 'number') {
          return (
            <TextField
              type="number"
              {...common}
              value={rhf.value ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                rhf.onChange(v === '' ? undefined : Number(v));
              }}
              name={path}
            />
          );
        }
        const inputType =
          field.type === 'email' ? 'email' : field.type === 'password' ? 'password' : field.type === 'text' ? 'text' : undefined;
        return (
          <TextField
            {...common}
            type={inputType}
            multiline={field.type === 'textarea'}
            rows={field.rows ?? 4}
            value={rhf.value ?? ''}
            onChange={rhf.onChange}
            name={path}
          />
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
    <Box sx={{ mt: 1 }}>
      <Typography variant="subtitle2">
        {field.label ?? field.name}
        {field.required ? ' *' : ''}
      </Typography>
      {fields.map((item, index) => (
        <Box
          key={item.id}
          sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1.5, mb: 1 }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {field.itemLabel ? field.itemLabel.replace(/\{\{\s*index\s*\}\}/g, String(index + 1)) : `Item ${index + 1}`}
            </Typography>
            <IconButton
              size="small"
              onClick={() => remove(index)}
              disabled={fields.length <= min}
              aria-label={`Hapus item ${index + 1}`}
            >
              <Trash2 size={14} />
            </IconButton>
          </Box>
          {(field.itemFields ?? []).map((sub) => (
            <FieldControl key={sub.name} field={sub} control={control} setValue={setValue} name={`${field.name}.${index}.${sub.name}`} />
          ))}
        </Box>
      ))}
      <Button size="small" startIcon={<Plus size={16} />} onClick={() => append(empty)}>
        {field.addButton ?? '+ Tambah'}
      </Button>
    </Box>
  );
}

/* ── modal ──────────────────────────────────────────────────────────── */

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
    formState: { errors, isSubmitting },
  } = useForm<Record<string, unknown>>({
    mode: props.mode ?? 'onChange',
    reValidateMode: props.reValidateMode ?? 'onChange',
    resolver: zodResolver(schema) as Resolver<Record<string, unknown>>,
    defaultValues: defaultValues ?? {},
  });

  useEffect(() => {
    if (open) reset(defaultValues ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit: SubmitHandler<Record<string, unknown>> = async (values) => {
    const out: Record<string, unknown> = { ...values };
    // rekonstruksi itemPayload per repeatable (flat fields → bentuk API nested)
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
    <Dialog open={open} onClose={onClose} fullWidth maxWidth={width}>
      <DialogTitle>{title}</DialogTitle>
      <form onSubmit={handleSubmit(submit)} noValidate>
        <DialogContent dividers>
          {fields.map((f) =>
            f.type === 'repeatable' ? (
              <RepeatableField key={f.name} field={f} control={control} setValue={setValue} errors={errors} />
            ) : (
              <FieldControl key={f.name} field={f} control={control} setValue={setValue} errors={errors} />
            ),
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="text">
            {cancelLabel}
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting || props.submitting}>
            {isSubmitting || props.submitting ? 'Menyimpan...' : submitLabel}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}