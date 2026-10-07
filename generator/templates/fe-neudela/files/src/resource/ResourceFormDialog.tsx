import { memo, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { NeuronCheckbox, NeuronDatePicker, NeuronDropdown, NeuronInput, NeuronTextArea } from 'neudela';
import {
  AddItemButton,
  FormDialog,
  FormGrid,
  FormSection,
  OptionalMark,
  RepeatableItem,
  countErrors,
} from '../components/form/FormDialog';
import LookupPicker from '../components/form/LookupPicker';
import { getErrorMessage } from '../service';
import { at, fill } from './expr';
import { buildPatch, buildPayload, guardError, valuesFromRecord } from './payload';
import { fillRow } from './render';
import { useLookups } from './useLookups';
import type { LookupState } from './useLookups';
import type { FieldConfig, ItemFieldConfig, LookupFn, RefFieldConfig, ResourceConfig, ScalarFieldConfig } from './types';

// The create / edit dialog of a resource, from its form config. Create follows the resource's
// FVO, edit (given a record) its MVO: the user never types an id, UUID or href — every reference
// is picked from its lookup (LOV), which fills id + name. @type / @referredType come from the
// payload spec; id and href from the backend. Edit opens prefilled from the record and PATCHes
// only the attributes that changed.

type Values = Record<string, any>;
type FormControl = Control<Values>;
type Lookups = { state: ReturnType<typeof useLookups>; fns: Record<string, LookupFn> };

const emptyRef = () => ({ id: '', name: '' });

function emptyItem(fields: ItemFieldConfig[]): Values {
  return Object.fromEntries(fields.map((f) => {
    if (f.kind === 'ref') return [f.name, emptyRef()];
    if (f.kind === 'list') return [f.name, []];
    if (f.kind === 'boolean') return [f.name, false];
    return [f.name, ''];
  }));
}

function emptyValues(fields: FieldConfig[]): Values {
  return Object.fromEntries(fields.map((f) => {
    if (f.kind === 'repeatable') return [f.name, Array.from({ length: f.initialItems }, () => emptyItem(f.item.fields))];
    if (f.kind === 'group') return [f.name, emptyItem(f.fields)];
    if (f.kind === 'ref') return [f.name, emptyRef()];
    if (f.kind === 'boolean') return [f.name, false];
    return [f.name, ''];
  }));
}

// ─── Relation picker (LOV) — select a reference, id + name filled together ────
// LookupPicker searches the owning API as the user types (NeuronDropdown only filters the
// options it was given); the first page is shared by every picker of the form (useLookups).

function RefPickerField({
  control,
  path,
  label,
  placeholder,
  requiredMessage,
  lookup,
  search,
  onPicked,
  extraError,
  markRequired,
}: Readonly<{
  control: FormControl;
  /** Form path of the {id, name} pair. */
  path: string;
  label: string;
  placeholder: string;
  /** Present = required, with this message. */
  requiredMessage?: string;
  lookup: LookupState;
  search: LookupFn;
  onPicked?: () => void;
  /** An error owned by the parent (e.g. the group-level "select at least one"). */
  extraError?: string;
  /** Show as required while the rule lives elsewhere (the group-level rule). */
  markRequired?: boolean;
}>) {
  const required = !!requiredMessage || !!markRequired;
  return (
    <Controller
      control={control}
      name={`${path}.id`}
      rules={requiredMessage ? { validate: (v) => String(v ?? '').trim() !== '' || requiredMessage } : undefined}
      render={({ field: idField, fieldState }) => (
        <Controller
          control={control}
          name={`${path}.name`}
          render={({ field: nameField }) => (
            <LookupPicker
              label={label}
              placeholder={placeholder}
              required={required}
              value={{ id: String(idField.value ?? ''), name: String(nameField.value ?? '') }}
              onChange={(picked) => {
                idField.onChange(picked.id);
                nameField.onChange(picked.name);
                onPicked?.();
              }}
              onBlur={idField.onBlur}
              search={search}
              initial={lookup}
              error={fieldState.error?.message ?? extraError}
            />
          )}
        />
      )}
    />
  );
}

/** A ref field anywhere in the form (top level, group-free) at `path`. */
function RefField({ control, field, path, lookups }: Readonly<{ control: FormControl; field: RefFieldConfig; path: string; lookups: Lookups }>) {
  return (
    <RefPickerField
      control={control}
      path={path}
      label={field.label}
      placeholder={field.placeholder}
      requiredMessage={field.required?.message}
      lookup={lookups.state.get(field.lookup)}
      search={lookups.fns[field.lookup]}
    />
  );
}

function ValueField({
  control,
  name,
  label,
  ariaLabel,
  placeholder,
  message,
}: Readonly<{ control: FormControl; name: string; label: string; ariaLabel: string; placeholder: string; message: string }>) {
  return (
    <Controller
      control={control}
      name={name}
      rules={{ validate: (v) => String(v ?? '').trim() !== '' || message }}
      render={({ field, fieldState }) => (
        <NeuronInput
          label={label}
          aria-label={ariaLabel}
          required
          aria-required
          aria-invalid={!!fieldState.error}
          placeholder={placeholder}
          value={String(field.value ?? '')}
          onChange={field.onChange}
          onBlur={field.onBlur}
          state={fieldState.error ? 'error' : 'default'}
          helperText={fieldState.error?.message}
        />
      )}
    />
  );
}

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/** ISO 8601 (start of the local day) ⇄ the picker's Date. */
const toIsoDay = (d: Date | null) => (d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString() : '');
const fromIso = (v: unknown) => {
  const d = typeof v === 'string' && v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

const requiredRule = (rule?: { message: string }) => (rule
  ? { validate: (v: unknown) => String(v ?? '').trim() !== '' || rule.message }
  : undefined);

const NUMBER = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;

function numberError(field: Extract<ScalarFieldConfig, { kind: 'number' }>, raw: unknown): string | true {
  const v = String(raw ?? '').trim();
  if (v === '') return field.required ? field.required.message : true;
  if (!NUMBER.test(v)) return 'Enter a number.';
  if (field.integer && !Number.isInteger(Number(v))) return 'Enter a whole number.';
  return true;
}

function jsonError(field: Extract<ScalarFieldConfig, { kind: 'json' }>, raw: unknown): string | true {
  const v = String(raw ?? '').trim();
  if (v === '') return field.required ? field.required.message : true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(v);
  } catch {
    return field.jsonType === 'array' ? 'Enter valid JSON: a list, e.g. ["a", "b"].' : 'Enter valid JSON: an object, e.g. { "key": "value" }.';
  }
  const isArray = Array.isArray(parsed);
  if (field.jsonType === 'array' && !isArray) return 'Enter a JSON list, e.g. ["a", "b"].';
  if (field.jsonType === 'object' && (isArray || parsed === null || typeof parsed !== 'object')) return 'Enter a JSON object, e.g. { "key": "value" }.';
  return true;
}

/** A one-value control at form path `name` (top level, inside a group or inside a list item). */
function ScalarField({ control, field, name, ariaLabel }: Readonly<{ control: FormControl; field: ScalarFieldConfig; name: string; ariaLabel?: string }>) {
  if (field.kind === 'boolean') {
    return (
      <Controller
        control={control}
        name={name}
        render={({ field: f }) => (
          <NeuronCheckbox
            label={field.label}
            description={field.description}
            checked={!!f.value}
            onChange={(checked) => f.onChange(checked)}
          />
        )}
      />
    );
  }
  if (field.kind === 'date') {
    return (
      <Controller
        control={control}
        name={name}
        rules={requiredRule(field.required)}
        render={({ field: f, fieldState }) => (
          // NEUDELA GAP: NeuronDatePicker has no required / aria props — the group names the field
          <div
            role="group"
            aria-label={field.required ? `${ariaLabel ?? field.label} (required)` : ariaLabel ?? field.label}
            className={field.required ? 'fm-date fm-date--required' : 'fm-date'}
          >
            <NeuronDatePicker
              mode="single"
              trigger="popover"
              size="md"
              placement="auto"
              showTodayButton
              label={field.label}
              placeholder={field.placeholder}
              value={fromIso(f.value)}
              onChange={(d) => { f.onChange(toIsoDay(d)); f.onBlur(); }}
              error={!!fieldState.error}
              errorMessage={fieldState.error?.message}
              helperText={field.helperText}
            />
          </div>
        )}
      />
    );
  }
  if (field.kind === 'enum') {
    return (
      <Controller
        control={control}
        name={name}
        rules={requiredRule(field.required)}
        render={({ field: f, fieldState }) => (
          <div role="group" aria-label={field.required ? `${ariaLabel ?? field.label} (required)` : ariaLabel ?? field.label}>
            <NeuronDropdown
              label={field.label}
              placeholder={field.placeholder}
              required={!!field.required}
              options={field.options}
              value={f.value || undefined}
              state={fieldState.error ? 'error' : 'default'}
              helperText={fieldState.error?.message ?? field.helperText}
              onChange={(selected) => f.onChange(Array.isArray(selected) ? selected[0] ?? '' : selected)}
            />
          </div>
        )}
      />
    );
  }
  if (field.kind === 'textarea') {
    return (
      <Controller
        control={control}
        name={name}
        render={({ field: f }) => (
          <NeuronTextArea
            label={field.label}
            labelAction={<OptionalMark />}
            placeholder={field.placeholder}
            value={f.value}
            onChange={f.onChange}
            onBlur={f.onBlur}
            autoResize={field.autoResize}
            minRows={field.minRows}
            maxRows={field.maxRows}
            helperText={field.helperText}
          />
        )}
      />
    );
  }
  if (field.kind === 'json') {
    return (
      <Controller
        control={control}
        name={name}
        rules={{ validate: (v) => jsonError(field, v) }}
        render={({ field: f, fieldState }) => (
          <div className="fm-json">
            <NeuronTextArea
              label={field.label}
              labelAction={field.required ? undefined : <OptionalMark />}
              aria-label={ariaLabel ?? field.label}
              aria-invalid={!!fieldState.error}
              required={!!field.required}
              placeholder={field.placeholder}
              value={f.value}
              onChange={f.onChange}
              onBlur={f.onBlur}
              autoResize
              minRows={3}
              maxRows={10}
              spellCheck={false}
              state={fieldState.error ? 'error' : 'default'}
              helperText={fieldState.error?.message ?? field.helperText}
            />
          </div>
        )}
      />
    );
  }
  if (field.kind === 'number') {
    return (
      <Controller
        control={control}
        name={name}
        rules={{ validate: (v) => numberError(field, v) }}
        render={({ field: f, fieldState }) => (
          <NeuronInput
            label={field.label}
            aria-label={ariaLabel ?? field.label}
            required={!!field.required}
            aria-required={!!field.required}
            aria-invalid={!!fieldState.error}
            type="text"
            inputMode={field.integer ? 'numeric' : 'decimal'}
            placeholder={field.placeholder}
            value={String(f.value ?? '')}
            onChange={f.onChange}
            onBlur={f.onBlur}
            state={fieldState.error ? 'error' : 'default'}
            helperText={fieldState.error?.message ?? field.helperText}
            autoComplete="off"
          />
        )}
      />
    );
  }
  const validate = (v: string) => {
    const value = String(v ?? '').trim();
    if (field.required && value === '') return field.required.message;
    if (field.pattern && value !== '' && !isHttpUrl(value)) return field.pattern.message;
    return true;
  };
  return (
    <Controller
      control={control}
      name={name}
      rules={{ validate }}
      render={({ field: f, fieldState }) => (
        <NeuronInput
          label={field.label}
          aria-label={ariaLabel ?? field.ariaLabel}
          required={!!field.required}
          aria-required={!!field.required}
          aria-invalid={!!fieldState.error}
          type={field.kind === 'url' ? 'url' : undefined}
          placeholder={field.placeholder}
          value={f.value}
          onChange={f.onChange}
          onBlur={f.onBlur}
          state={fieldState.error ? 'error' : 'default'}
          helperText={fieldState.error?.message ?? field.helperText}
          autoComplete={field.manualId ? 'off' : undefined}
          spellCheck={field.manualId ? false : undefined}
        />
      )}
    />
  );
}

/** A value object (TimePeriod, Money…): its attributes side by side, under one heading. */
function GroupField({ control, field }: Readonly<{ control: FormControl; field: Extract<FieldConfig, { kind: 'group' }> }>) {
  const columns = field.fields.length >= 3 ? 3 : 2;
  return (
    <FormSection title={field.label} hint={field.hint}>
      <div role="group" aria-label={field.label}>
        <FormGrid columns={columns}>
          {field.fields.map((f) => (
            <ScalarField key={f.name} control={control} field={f} name={`${field.name}.${f.name}`} ariaLabel={`${field.label} ${f.label.toLowerCase()}`} />
          ))}
        </FormGrid>
      </div>
    </FormSection>
  );
}

type FlatItemField = Exclude<ItemFieldConfig, { kind: 'list' }>;

/** One field of a list item at `base` (e.g. `items.0`), any kind but a nested list. */
function ItemField({
  control,
  f,
  base,
  index,
  lookups,
  firstGroupRule,
}: Readonly<{
  control: FormControl;
  f: FlatItemField;
  base: string;
  index: number;
  lookups: Lookups;
  /** The group-level rule shown on the first item's ref ("select at least one"). */
  firstGroupRule?: { error?: string; revalidate: () => void };
}>) {
  const path = `${base}.${f.name}`;
  if (f.kind === 'value') {
    return (
      <ValueField
        control={control}
        name={path}
        label={f.label ?? 'Value'}
        ariaLabel={fill(f.ariaLabel, index)}
        placeholder={f.placeholder}
        message={f.required.message}
      />
    );
  }
  if (f.kind === 'ref') {
    const first = !!f.groupRuleOnFirst && index === 0;
    return (
      <RefPickerField
        control={control}
        path={path}
        label={f.label}
        placeholder={f.placeholder}
        requiredMessage={first ? undefined : f.required?.message}
        extraError={first ? firstGroupRule?.error : undefined}
        markRequired={first}
        lookup={lookups.state.get(f.lookup)}
        search={lookups.fns[f.lookup]}
        // array-level rules only re-run on submit / append / remove, not on a nested change
        onPicked={f.groupRuleOnFirst ? () => { if (firstGroupRule?.error) firstGroupRule.revalidate(); } : undefined}
      />
    );
  }
  return <ScalarField control={control} field={f} name={path} ariaLabel={`${f.label} ${index + 1}`} />;
}

const itemBody = (grid: 2 | 3 | undefined, children: ReactNode) => (grid ? <FormGrid columns={grid}>{children}</FormGrid> : children);

/** A list inside a list item (an entry's own embedded list), e.g. a characteristic's values. */
function NestedListField({
  control,
  field,
  base,
  lookups,
}: Readonly<{ control: FormControl; field: Extract<ItemFieldConfig, { kind: 'list' }>; base: string; lookups: Lookups }>) {
  const name = `${base}.${field.name}`;
  const { fields: items, append, remove } = useFieldArray({ control, name });
  return (
    <div className="fm-sublist" role="group" aria-label={field.title}>
      <div className="fm-sublist__head">
        <span className="fm-sublist__title">{field.title}</span>
        <span className="fm-hint">Optional</span>
      </div>
      {items.length === 0 && <p className="fm-empty">{field.emptyText}</p>}
      {items.map((it, j) => (
        <RepeatableItem
          key={it.id}
          index={j}
          title={fill(field.item.title, j)}
          removeLabel={fill(field.item.removeLabel, j)}
          onRemove={() => remove(j)}
        >
          {itemBody(field.item.grid, field.item.fields.map((f) => (
            <ItemField key={f.name} control={control} f={f} base={`${name}.${j}`} index={j} lookups={lookups} />
          )))}
        </RepeatableItem>
      ))}
      <AddItemButton label={field.addLabel} onClick={() => append(emptyItem(field.item.fields))} />
    </div>
  );
}

function RepeatableField({
  control,
  field,
  lookups,
  rootError,
  revalidate,
}: Readonly<{
  control: FormControl;
  field: Extract<FieldConfig, { kind: 'repeatable' }>;
  lookups: Lookups;
  rootError?: string;
  revalidate: () => void;
}>) {
  const { fields: items, append, remove } = useFieldArray({
    control,
    name: field.name,
    rules: field.minItems
      ? { validate: (list: unknown[]) => list.some((it) => String(at(it, field.minItems!.path) ?? '').trim() !== '') || field.minItems!.message }
      : undefined,
  });
  const flat = field.item.fields.filter((f): f is FlatItemField => f.kind !== 'list');
  const lists = field.item.fields.filter((f): f is Extract<ItemFieldConfig, { kind: 'list' }> => f.kind === 'list');

  return (
    <FormSection title={field.section.title} required={field.section.required} hint={field.section.hint}>
      {field.emptyText && items.length === 0 && <p className="fm-empty">{field.emptyText}</p>}
      {items.map((it, i) => (
        <RepeatableItem
          key={it.id}
          index={i}
          title={fill(field.item.title, i)}
          removeLabel={fill(field.item.removeLabel, i)}
          {...(field.item.canRemove === 'more-than-one' ? { canRemove: items.length > 1 } : {})}
          onRemove={() => remove(i)}
        >
          {itemBody(field.item.grid, flat.map((f) => (
            <ItemField
              key={f.name}
              control={control}
              f={f}
              base={`${field.name}.${i}`}
              index={i}
              lookups={lookups}
              firstGroupRule={{ error: rootError, revalidate }}
            />
          )))}
          {lists.map((l) => <NestedListField key={l.name} control={control} field={l} base={`${field.name}.${i}`} lookups={lookups} />)}
        </RepeatableItem>
      ))}
      <AddItemButton label={field.addLabel} onClick={() => append(emptyItem(field.item.fields))} />
    </FormSection>
  );
}

type TopFieldConfig = ScalarFieldConfig | RefFieldConfig;
type FieldGroup =
  | { kind: 'single'; field: FieldConfig }
  | { kind: 'grid'; fields: TopFieldConfig[] }
  | { kind: 'checks'; fields: TopFieldConfig[] };

const SHORT = new Set(['text', 'url', 'enum', 'date', 'number', 'ref']);

/**
 * Layout of the dialog body: consecutive short fields (text, url, enum, date, number, ref) share
 * a two-column grid in a wide dialog, consecutive checkboxes share one box; everything else is
 * one row. A lone short field keeps the full width.
 */
function groupFields(fields: FieldConfig[], width: 'wide' | 'narrow'): FieldGroup[] {
  const out: FieldGroup[] = [];
  let run: TopFieldConfig[] = [];
  let runKind: 'grid' | 'checks' | null = null;
  const flush = () => {
    if (run.length >= 2 || (runKind === 'checks' && run.length === 1)) out.push({ kind: runKind!, fields: run });
    else run.forEach((f) => out.push({ kind: 'single', field: f }));
    run = [];
    runKind = null;
  };
  for (const f of fields) {
    const kind = f.kind === 'boolean' ? 'checks' : SHORT.has(f.kind) && width === 'wide' ? 'grid' : null;
    if (kind && kind === runKind) {
      run.push(f as TopFieldConfig);
      continue;
    }
    flush();
    if (kind) {
      runKind = kind;
      run = [f as TopFieldConfig];
    } else {
      out.push({ kind: 'single', field: f });
    }
  }
  flush();
  return out;
}

function TopField({ control, field, lookups }: Readonly<{ control: FormControl; field: TopFieldConfig; lookups: Lookups }>) {
  return field.kind === 'ref'
    ? <RefField control={control} field={field} path={field.name} lookups={lookups} />
    : <ScalarField control={control} field={field} name={field.name} />;
}

function ResourceFormDialog({
  config,
  open,
  record,
  onClose,
  onSaved,
  onError,
}: Readonly<{
  config: ResourceConfig;
  open: boolean;
  /** The record to edit; absent = create. */
  record?: Values | null;
  onClose: () => void;
  /** After a successful save (or an unchanged edit), with the toast to show. */
  onSaved: (toast: string) => Promise<void>;
  onError: (message: string) => void;
}>) {
  // rendered only for configs with a form (and an edit block when editing)
  const form = config.form!;
  const edit = record ? form.edit! : null;
  const fields = useMemo(
    () => (edit ? form.fields.filter((f) => edit.fields.includes(f.name)) : form.fields),
    [edit, form.fields],
  );
  const defaults = useMemo(
    () => ({ ...emptyValues(fields), ...(record ? valuesFromRecord(form, record) : {}) }),
    [fields, form, record],
  );
  const { control, handleSubmit, reset, trigger, formState: { errors } } = useForm<Values>({
    defaultValues: defaults,
    mode: form.validateOn === 'touched' ? 'onTouched' : 'onSubmit',
  });
  const [submitAttempt, setSubmitAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const lookupState = useLookups(config.lookups);
  const lookups: Lookups = { state: lookupState, fns: config.lookups };

  // Start every open from a clean form (also after a successful create), and retry any
  // lookup that failed — reopening the form is the user's way to try again.
  useEffect(() => {
    if (open) {
      reset(defaults);
      setSubmitAttempt(0);
      lookupState.retryFailed();
    }
    // only on open (or a different record)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record, reset]);

  const save = async (values: Values) => {
    const guard = guardError(form, values);
    if (guard) {
      onError(guard);
      return;
    }
    setSaving(true);
    try {
      if (edit && record) {
        const patch = buildPatch(form, defaults, values);
        if (Object.keys(patch).length === 0) {
          await onSaved(edit.noChanges);
          return;
        }
        await config.service.patch!(String(record.id), patch);
        await onSaved(edit.toast);
      } else {
        await config.service.create!(buildPayload(form, values));
        await onSaved(form.toast);
      }
    } catch (err) {
      onError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const submit = handleSubmit(save, () => setSubmitAttempt((n) => n + 1));

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      width={form.width}
      title={edit && record ? fillRow(edit.title, record) : form.title}
      description={edit ? edit.description : form.description}
      formId={edit ? edit.formId : form.formId}
      submitLabel={edit ? edit.submitLabel : form.submitLabel}
      submitting={saving}
      onSubmit={submit}
      errorCount={submitAttempt > 0 ? countErrors(errors) : 0}
      submitAttempt={submitAttempt}
    >
      {groupFields(fields, form.width).map((group) => {
        if (group.kind === 'checks') {
          return (
            <div key={group.fields[0].name} className="fm-checks">
              {group.fields.map((f) => <TopField key={f.name} control={control} field={f} lookups={lookups} />)}
            </div>
          );
        }
        if (group.kind === 'grid') {
          return (
            <FormGrid key={group.fields[0].name} columns={2}>
              {group.fields.map((f) => <TopField key={f.name} control={control} field={f} lookups={lookups} />)}
            </FormGrid>
          );
        }
        const field = group.field;
        if (field.kind === 'repeatable') {
          return (
            <RepeatableField
              key={field.name}
              control={control}
              field={field}
              lookups={lookups}
              rootError={(errors[field.name] as { root?: { message?: string } } | undefined)?.root?.message}
              revalidate={() => { void trigger(field.name); }}
            />
          );
        }
        if (field.kind === 'group') return <GroupField key={field.name} control={control} field={field} />;
        return <TopField key={field.name} control={control} field={field} lookups={lookups} />;
      })}
    </FormDialog>
  );
}

export default memo(ResourceFormDialog);
