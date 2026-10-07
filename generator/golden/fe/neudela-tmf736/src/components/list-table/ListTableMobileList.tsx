import { NeuronButton, NeuronCheckbox } from 'neudela';
import type { ListTableMobileCard, ListTableRowAction } from './types';

interface Props<T> {
  rows: T[];
  getKey: (row: T) => string;
  renderCard: (row: T) => ListTableMobileCard;
  rowActions: ListTableRowAction<T>[];
  selectable: boolean;
  /** When set (and not selectable), each card leads with its row number. */
  rowNumberOffset?: number;
  selectedKeys: string[];
  onToggle: (key: string, checked: boolean) => void;
  onRowClick?: (row: T) => void;
  ariaLabel: string;
}

// Below 768px the table becomes a card list (as in the design): id + badge, title,
// secondary lines, and the row actions as full-size labelled buttons.
export default function ListTableMobileList<T>({
  rows,
  getKey,
  renderCard,
  rowActions,
  selectable,
  rowNumberOffset,
  selectedKeys,
  onToggle,
  onRowClick,
  ariaLabel,
}: Readonly<Props<T>>) {
  return (
    <ul className="lt-cards" aria-label={ariaLabel}>
      {rows.map((row, index) => {
        const key = getKey(row);
        const card = renderCard(row);
        const selected = selectedKeys.includes(key);
        return (
          <li key={key} className={`lt-card${selected ? ' is-selected' : ''}`}>
            {!selectable && rowNumberOffset !== undefined && (
              <span className="lt-card__no">{rowNumberOffset + index + 1}.</span>
            )}
            {selectable && (
              <span className="lt-card__check">
                <NeuronCheckbox
                  checked={selected}
                  onChange={(checked) => onToggle(key, checked)}
                  aria-label={`Select ${card.title}`}
                />
              </span>
            )}
            <div className="lt-card__body">
              <button type="button" className="lt-card__main" onClick={() => onRowClick?.(row)}>
                <span className="lt-card__top">
                  <span className="lt-card__id" title={card.id}>{card.id}</span>
                  {card.badge}
                </span>
                <span className="lt-card__title">{card.title}</span>
                {card.subtitle && <span className="lt-card__sub">{card.subtitle}</span>}
                {card.meta && <span className="lt-card__meta">{card.meta}</span>}
              </button>
              {rowActions.length > 0 && (
                <div className="lt-card__actions">
                  {rowActions.map((a) => (
                    <NeuronButton
                      key={a.key}
                      type="button"
                      variant="secondary"
                      leadingIcon={a.icon}
                      className={`lt-card__action lt-card__action--${a.tone ?? 'neutral'}`}
                      aria-label={a.ariaLabel(row)}
                      onClick={() => a.onClick(row)}
                    >
                      {a.label}
                    </NeuronButton>
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
