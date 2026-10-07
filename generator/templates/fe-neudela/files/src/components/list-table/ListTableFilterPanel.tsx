import { useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, X } from 'lucide-react';
import { NeuronButton, NeuronDatePicker, NeuronDropdown, NeuronInput } from 'neudela';
import { emptyCondition, fromYmd, isComplete, toYmd } from './filters';
import type { FilterCondition, ListTableFilterField } from './types';

interface Props {
  fields: ListTableFilterField[];
  applied: FilterCondition[];
  onApply: (filters: FilterCondition[]) => void;
  onCancel: () => void;
}

// Advanced filter builder: one row per condition (field → operator → value), any number
// of rows, one condition per field. Edits stay in a draft until "Apply filters" (or Enter),
// so several conditions go out as one request and the chips always mean "applied".
export default function ListTableFilterPanel({ fields, applied, onApply, onCancel }: Readonly<Props>) {
  const [drafts, setDrafts] = useState<FilterCondition[]>(() =>
    applied.length > 0 ? applied.map((c) => ({ ...c })) : [emptyCondition(fields[0])],
  );

  const fieldOf = (key: string) => fields.find((f) => f.key === key) ?? fields[0];
  const unused = fields.filter((f) => !drafts.some((d) => d.field === f.key));

  const update = (index: number, next: FilterCondition) =>
    setDrafts((ds) => ds.map((d, i) => (i === index ? next : d)));

  const changeField = (index: number, key: string) => {
    if (drafts[index].field === key) return;
    update(index, emptyCondition(fieldOf(key)));
  };

  const addRow = () => {
    if (unused.length > 0) setDrafts((ds) => [...ds, emptyCondition(unused[0])]);
  };

  const removeRow = (index: number) => setDrafts((ds) => ds.filter((_, i) => i !== index));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onApply(drafts.filter(isComplete));
  };

  return (
    <form className="lt-filters" aria-label="Filters" onSubmit={submit} noValidate>
      <div className="lt-filters__rows">
        {drafts.map((d, i) => {
          const field = fieldOf(d.field);
          const options = fields
            .filter((f) => f.key === d.field || !drafts.some((o) => o.field === f.key))
            .map((f) => ({ value: f.key, label: f.label }));
          return (
            <div key={`${d.field}-${i}`} className="lt-filters__row">
              <span className="lt-filters__conj" aria-hidden="true">{i === 0 ? 'Where' : 'and'}</span>
              <div className="lt-filters__field" role="group" aria-label={`Filter ${i + 1} field`}>
                <NeuronDropdown
                  size="sm"
                  options={options}
                  value={d.field}
                  onChange={(v) => changeField(i, String(Array.isArray(v) ? v[0] : v))}
                />
              </div>
              <span className="lt-filters__op">{field.type === 'date' ? 'is between' : 'contains'}</span>
              <div className="lt-filters__value">
                {d.type === 'text' ? (
                  <NeuronInput
                    aria-label={`${field.label} contains`}
                    placeholder={field.placeholder ?? `Type ${field.label.toLowerCase()}`}
                    value={d.value}
                    onChange={(e) => update(i, { ...d, value: e.target.value })}
                  />
                ) : (
                  <div role="group" aria-label={`${field.label} between`}>
                    <NeuronDatePicker
                      mode="range"
                      trigger="popover"
                      size="sm"
                      placement="auto"
                      showPresets
                      placeholder="Select a date range"
                      rangeValue={{ startDate: fromYmd(d.from), endDate: fromYmd(d.to) }}
                      onRangeChange={(r) => update(i, { ...d, from: toYmd(r.startDate), to: toYmd(r.endDate) })}
                    />
                  </div>
                )}
              </div>
              <NeuronButton
                type="button"
                variant="text"
                size="sm"
                iconOnly
                aria-label={`Remove ${field.label} filter`}
                title="Remove condition"
                className="lt-filters__remove"
                onClick={() => removeRow(i)}
              >
                <X size={16} />
              </NeuronButton>
            </div>
          );
        })}
        {drafts.length === 0 && <p className="lt-filters__empty">No conditions — Apply shows every record.</p>}
      </div>

      <div className="lt-filters__footer">
        <NeuronButton type="button" variant="text" size="sm" leadingIcon={<Plus size={14} />} disabled={unused.length === 0} onClick={addRow}>
          Add filter
        </NeuronButton>
        <div className="lt-filters__actions">
          <NeuronButton type="button" variant="secondary" size="sm" onClick={onCancel}>Cancel</NeuronButton>
          {/* outline, not primary: the toolbar's create button stays the one primary action */}
          <NeuronButton type="submit" variant="outline" size="sm">Apply filters</NeuronButton>
        </div>
      </div>
    </form>
  );
}
