import { ReactNode } from 'react';

export interface DetailListSectionProps<T> {
  title?: string;
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  emptyText?: string;
}

/** frontend-pattern.md §11.7 DetailListSection: renders one array-of-object field of a
 * detail resource as a list of cards/rows — the counterpart of RefEntityCard for a whole
 * collection (used inside a detail tab body). Empty markup is a bare div, not the table-row
 * EmptyState (nesting a <tr> outside a <table> would be invalid HTML). */
export function DetailListSection<T>({ title, items, renderItem, emptyText }: DetailListSectionProps<T>) {
  return (
    <div>
      {title && <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</h4>}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-6 text-center text-xs text-text-secondary">
          {emptyText ?? 'Tidak ada data'}
        </div>
      ) : (
        <div className="flex flex-col gap-2">{items.map((item, i) => renderItem(item, i))}</div>
      )}
    </div>
  );
}

export default DetailListSection;
