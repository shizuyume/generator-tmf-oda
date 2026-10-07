import { useId } from 'react';
import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { NeuronInput } from 'neudela';
import '../list-table/ListTable.css'; // .lt-chip
import './Detail.css';

// Building blocks of the record page (Neudela Logistics Dashboard › shipment detail).

/** Section card: title + count chip + right-hand actions, then the body (flush for tables). */
export function DetailCard({
  title,
  count,
  actions,
  flush,
  children,
}: Readonly<{ title: string; count?: ReactNode; actions?: ReactNode; flush?: boolean; children: ReactNode }>) {
  const headingId = useId();
  return (
    <section className="dt-card" aria-labelledby={headingId}>
      <header className="dt-card__head">
        <div className="dt-card__title-row">
          <h2 id={headingId} className="dt-card__title">{title}</h2>
          {count !== undefined && <span className="lt-chip">{count}</span>}
        </div>
        {actions && <div className="dt-card__actions">{actions}</div>}
      </header>
      <div className={flush ? 'dt-card__body dt-card__body--flush' : 'dt-card__body'}>{children}</div>
    </section>
  );
}

/** "View all" text button in a card header (jumps to the full tab). */
export function ViewAllButton({ onClick, label }: Readonly<{ onClick: () => void; label: string }>) {
  return (
    <button type="button" className="dt-link" aria-label={label} onClick={onClick}>View all</button>
  );
}

export interface KeyValueItem {
  label: string;
  value: ReactNode;
  /** Mono, brand-coloured value (ids, references) — the design's "Related records" style. */
  mono?: boolean;
  /** Muted second line under the value. */
  sub?: ReactNode;
}

/** Label ⟷ value rows ("Key dates", "Related records"). Rows without a value are skipped. */
export function KeyValueList({ items }: Readonly<{ items: KeyValueItem[] }>) {
  const shown = items.filter((i) => i.value !== undefined && i.value !== null && i.value !== '');
  return (
    <dl className="dt-kv">
      {shown.map((i) => (
        <div key={i.label} className="dt-kv__row">
          <dt>{i.label}</dt>
          <dd className={i.mono ? 'is-mono' : undefined}>
            {i.value}
            {i.sub && <span className="dt-kv__sub">{i.sub}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export interface EntityField {
  label: string;
  value?: ReactNode;
  mono?: boolean;
}

/** Referenced entity card (design: "Parties" tab): icon tile, name, role, key/value lines. */
export function EntityCard({
  icon,
  title,
  subtitle,
  fields,
}: Readonly<{ icon: ReactNode; title: string; subtitle?: string; fields: EntityField[] }>) {
  const shown = fields.filter((f) => f.value !== undefined && f.value !== null && f.value !== '');
  return (
    <article className="dt-entity">
      <div className="dt-entity__head">
        <span className="dt-entity__icon" aria-hidden="true">{icon}</span>
        <div className="dt-entity__heading">
          <h3 className="dt-entity__title">{title}</h3>
          {subtitle && <p className="dt-entity__sub">{subtitle}</p>}
        </div>
      </div>
      <dl className="dt-entity__fields">
        {shown.map((f) => (
          <div key={f.label} className="dt-entity__field">
            <dt>{f.label}</dt>
            <dd className={f.mono ? 'is-mono' : undefined}>{f.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

export function EntityGrid({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="dt-entity-grid">{children}</div>;
}

/** Client-side search box for a card header. */
export function DetailSearch({
  value,
  onChange,
  placeholder,
  label,
}: Readonly<{ value: string; onChange: (v: string) => void; placeholder: string; label: string }>) {
  return (
    <div className="dt-search lt-toolbar__search">
      <NeuronInput
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        leadingIcon={<Search size={16} />}
        trailingIcon={value ? (
          <button type="button" className="lt-toolbar__clear" aria-label="Clear search" onClick={() => onChange('')}>
            <X size={14} />
          </button>
        ) : undefined}
      />
    </div>
  );
}

/** Every string/number value inside `value`, lower-cased — for client-side search. */
export function searchableText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value).toLowerCase();
  if (Array.isArray(value)) return value.map(searchableText).join(' ');
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).map(searchableText).join(' ');
  return '';
}
