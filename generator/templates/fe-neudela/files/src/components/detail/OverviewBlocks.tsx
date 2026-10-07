import type { ReactNode } from 'react';
import './Detail.css';
import './Overview.css';

// Overview building blocks after the design's shipment detail: the stat strip ("Shipment
// flow"), rule rows (a readable When/Then instead of a table), entity rows ("Parties"
// preview) and a date timeline ("Tracking").

// ─── Stat strip ──────────────────────────────────────────────────────────────

export interface StatItem {
  key: string;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: ReactNode;
  /** Makes the cell a button (e.g. jump to the matching tab). */
  onClick?: () => void;
  ariaLabel?: string;
}

export function StatStrip({ items, label }: Readonly<{ items: StatItem[]; label: string }>) {
  return (
    <section className="dt-stats" aria-label={label}>
      {items.map((s) => {
        const body = (
          <>
            <span className="dt-stat__label"><span aria-hidden="true">{s.icon}</span>{s.label}</span>
            <span className="dt-stat__value">{s.value}</span>
            {s.hint && <span className="dt-stat__hint">{s.hint}</span>}
          </>
        );
        return s.onClick ? (
          <button key={s.key} type="button" className="dt-stat dt-stat--link" onClick={s.onClick} aria-label={s.ariaLabel}>{body}</button>
        ) : (
          <div key={s.key} className="dt-stat">{body}</div>
        );
      })}
    </section>
  );
}

// ─── Rule rows ───────────────────────────────────────────────────────────────

export interface RuleItem {
  key: string;
  /** e.g. the policy condition / action name */
  title: string;
  /** variable name, rendered as `variable = value` */
  variable?: string;
  value?: string;
  /** mono ids on the right (entry, ref, variable) */
  ids: { label: string; value?: string }[];
}

export function RuleSection({
  kind,
  label,
  icon,
  items,
  emptyText,
}: Readonly<{ kind: 'when' | 'then'; label: string; icon: ReactNode; items: RuleItem[]; emptyText: string }>) {
  return (
    <div className={`dt-rule dt-rule--${kind}`}>
      <div className="dt-rule__rail" aria-hidden="true">
        <span className="dt-rule__dot">{icon}</span>
        {kind === 'when' && <span className="dt-rule__line" />}
      </div>
      <div className="dt-rule__body">
        <h3 className="dt-rule__label">{label}</h3>
        {items.length === 0 ? (
          <p className="dt-rule__empty">{emptyText}</p>
        ) : (
          <ul className="dt-rule__list">
            {items.map((r) => (
              <li key={r.key} className="dt-rule__item">
                <div className="dt-rule__main">
                  <span className="dt-rule__title">{r.title}</span>
                  <span className="dt-rule__expr">
                    {r.variable && <code className="dt-rule__var">{r.variable}</code>}
                    <span className="dt-rule__eq" aria-hidden="true">=</span>
                    <span className="dt-rule__value">{r.value ?? '—'}</span>
                  </span>
                </div>
                <dl className="dt-rule__ids">
                  {r.ids.filter((i) => i.value).map((i) => (
                    <div key={i.label}><dt>{i.label}</dt><dd>{i.value}</dd></div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Entity rows ─────────────────────────────────────────────────────────────

export interface EntityRowItem {
  key: string;
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  meta?: string;
}

export function EntityRows({ items, emptyText }: Readonly<{ items: EntityRowItem[]; emptyText: string }>) {
  if (items.length === 0) return <p className="dt-empty">{emptyText}</p>;
  return (
    <ul className="dt-erows">
      {items.map((e) => (
        <li key={e.key} className="dt-erow">
          <span className="dt-erow__icon" aria-hidden="true">{e.icon}</span>
          <span className="dt-erow__text">
            <span className="dt-erow__title">{e.title}</span>
            {e.subtitle && <span className="dt-erow__sub">{e.subtitle}</span>}
          </span>
          {e.meta && <span className="dt-erow__meta" title={e.meta}>{e.meta}</span>}
        </li>
      ))}
    </ul>
  );
}

// ─── Timeline ────────────────────────────────────────────────────────────────

export interface TimelineItem {
  key: string;
  icon: ReactNode;
  title: string;
  time: string;
  sub?: string;
}

export function Timeline({ items }: Readonly<{ items: TimelineItem[] }>) {
  return (
    <ol className="dt-timeline">
      {items.map((t, i) => (
        <li key={t.key} className="dt-timeline__item">
          <div className="dt-timeline__rail" aria-hidden="true">
            <span className="dt-timeline__dot">{t.icon}</span>
            {i < items.length - 1 && <span className="dt-timeline__line" />}
          </div>
          <div className="dt-timeline__body">
            <span className="dt-timeline__title">{t.title}</span>
            <span className="dt-timeline__time">{t.time}</span>
            {t.sub && <span className="dt-timeline__sub">{t.sub}</span>}
          </div>
        </li>
      ))}
    </ol>
  );
}
