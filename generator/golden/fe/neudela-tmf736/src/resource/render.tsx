import type { ReactNode } from 'react';
import { NeuronBadge } from 'neudela';
import type { NeuronTableColumn } from 'neudela';
import { ICONS } from '../app/icons';
import { formatDateTime, formatRelativeTime } from '../components/list-table/format';
import { at, evaluate, plural } from './expr';
import type { ColumnConfig, IconRef, IconName } from './types';

export function icon(ref: IconRef): ReactNode {
  const Icon = ICONS[ref.icon];
  return <Icon size={ref.size} />;
}

export function iconNamed(name: IconName, size: number): ReactNode {
  const Icon = ICONS[name];
  return <Icon size={size} />;
}

const emDash = <span className="lt-cell-empty">—</span>;

/** Name over a mono id — for reference cells. */
function RefCell({ refValue }: Readonly<{ refValue?: { id?: string; name?: string } }>) {
  if (!refValue?.id && !refValue?.name) return emDash;
  return (
    <div className="lt-cell-stack">
      <span className="lt-cell-ellipsis" title={refValue.name ?? refValue.id}>{refValue.name ?? refValue.id}</span>
      {refValue.name && refValue.id && <span className="lt-cell-stack__sub lab-mono" title={refValue.id}>{refValue.id}</span>}
    </div>
  );
}

export function CountBadge({ count, badge }: Readonly<{ count: number; badge: NonNullable<ColumnConfig['badge']> }>) {
  return (
    <NeuronBadge variant="gray" size="sm" pill leadingIcon={iconNamed(badge.icon, 12)}>
      {plural(count, badge.one, badge.many)}
    </NeuronBadge>
  );
}

/** The cell of one column for one row. */
export function renderCell(col: ColumnConfig, row: Record<string, any>): ReactNode {
  const raw = col.value ? evaluate(col.value, row) : at(row, col.key);
  const value = raw === undefined || raw === null ? undefined : (raw as any);
  const empty = () => (col.empty && col.empty !== 'em-dash' ? <span className="lt-cell-empty">{col.empty.text}</span> : emDash);
  switch (col.render) {
    case 'id-link':
      return <span className="lt-cell-ellipsis lt-cell-id" title={value}>{value}</span>;
    case 'primary':
      if (col.empty && !value) return empty();
      return <span className="lt-cell-primary" title={value}>{value}</span>;
    case 'primary-plain':
      return value ? <span className="lt-cell-primary">{value}</span> : empty();
    case 'ellipsis':
      return value ? <span className="lt-cell-ellipsis" title={value}>{value}</span> : empty();
    case 'mono':
      return value ? <span className="lt-cell-ellipsis lt-cell-mono" title={value}>{value}</span> : empty();
    case 'mono-muted':
      return <span className="lt-cell-ellipsis lt-cell-mono lt-cell-muted" title={value}>{value}</span>;
    case 'mono-plain':
      return value ? <span className="lt-cell-mono">{value}</span> : empty();
    case 'count-badge':
      return <CountBadge count={Number(value ?? 0)} badge={col.badge!} />;
    case 'datetime-stack':
      return (
        <div className="lt-cell-stack">
          <span className="lt-cell-stack__main">{formatDateTime(value)}</span>
          <span className="lt-cell-stack__sub">{formatRelativeTime(value)}</span>
        </div>
      );
    case 'ref-stack':
      return <RefCell refValue={value} />;
    default:
      return null;
  }
}

/** NeuronTable columns from a column config (the id link opens the record). */
export function tableColumns<T extends Record<string, any>>(cols: ColumnConfig[], onOpen?: (row: T) => void): NeuronTableColumn<T>[] {
  return cols.map((col) => ({
    key: col.key,
    label: col.label,
    ...(col.sortable ? { sortable: true } : {}),
    ...(col.width !== undefined ? { width: col.width } : {}),
    ...(col.render === 'id-link' && onOpen ? { clickable: true, onClick: (_v: unknown, record: T) => onOpen(record) } : {}),
    render: (_v: unknown, row: T) => renderCell(col, row),
  }));
}

/** "Delete {name}" → "Delete Standard 70/30 Split". */
export const fillRow = (template: string, row: Record<string, any>) =>
  template.replace(/\{([\w.@]+)\}/g, (_m, p) => String(at(row, p) ?? ''));
