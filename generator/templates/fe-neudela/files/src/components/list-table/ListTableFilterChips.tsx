import { useId } from 'react';
import { X } from 'lucide-react';
import { NeuronButton } from 'neudela';
import { describeFilter } from './filters';
import type { FilterCondition, ListTableFilterField } from './types';

interface Props {
  fields: ListTableFilterField[];
  filters: FilterCondition[];
  onRemove: (field: string) => void;
  onClearAll: () => void;
}

// Applied filters as removable chips inside the card, plus "Clear all".
// Own markup rather than NeuronBadge onClose: that close button is a span[role=button]
// labelled "Remove badge" on every chip, so a screen reader cannot tell them apart.
export default function ListTableFilterChips({ fields, filters, onRemove, onClearAll }: Readonly<Props>) {
  const labelId = useId();
  if (filters.length === 0) return null;
  return (
    <div className="lt-fchips">
      <span className="lt-fchips__label" id={labelId}>Filtered by</span>
      <ul className="lt-fchips__list" aria-labelledby={labelId}>
        {filters.map((c) => {
          const { label, value } = describeFilter(c, fields.find((f) => f.key === c.field));
          return (
            <li key={c.field} className="lt-fchip">
              <span className="lt-fchip__label">{label}</span>
              <span className="lt-fchip__value">{value}</span>
              <button
                type="button"
                className="lt-fchip__remove"
                aria-label={`Remove filter: ${label} ${value}`}
                onClick={() => onRemove(c.field)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      <NeuronButton type="button" variant="text" size="sm" className="lt-fchips__clear" onClick={onClearAll}>
        Clear all
      </NeuronButton>
    </div>
  );
}
