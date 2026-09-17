import { ReactElement, ReactNode, useMemo } from 'react';
import { NeuronBadge } from 'neudela';
import type { FilterModel, SortModel } from './useCrudPage';
export interface NeudelaCol<T = Record<string, unknown>> {
  field: string;
  headerName?: string;
  sortable?: boolean;
  filterable?: boolean;
  renderCell?: (params: { row: T; value?: unknown }) => ReactNode;
  valueFormatter?: (value: unknown) => string;
  flex?: number;
  minWidth?: number;
  width?: number | string;
}

export interface StandardListProps<T extends Record<string, unknown> = Record<string, unknown>> {
  columns: NeudelaCol<T>[];
  rows: T[];
  rowCount: number;
  pageModel: { page: number; pageSize: number };
  sortModel: SortModel;
  filterModel: FilterModel;
  onPaginationModelChange: (model: { page: number; pageSize: number }) => void;
  onSortModelChange: (model: SortModel) => void;
  onFilterModelChange: (model: FilterModel) => void;
  loading?: boolean;
  searchField?: ReactNode;
  toolbarActions?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  emptyText?: string;
  getRowId?: (row: T) => string | number;
  pageSizeOptions?: number[];
  addActionColumn?: boolean;
}

export function StandardList<T extends Record<string, unknown> = Record<string, unknown>>(
  props: StandardListProps<T>,
): ReactElement {
  const {
    columns,
    rows,
    rowCount,
    pageModel,
    sortModel,
    filterModel,
    onPaginationModelChange,
    onSortModelChange,
    loading = false,
    searchField,
    toolbarActions,
    rowActions,
    getRowId,
    emptyText,
  } = props;

  const { page = 0, pageSize = 10 } = pageModel;
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  void filterModel;

  // slice client-side halaman aktif (kehilangan besar: filter tak diterapkan — warning adapter neudela)
  const pageRows = useMemo(() => {
    const start = page * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

  const sorted = useMemo(() => {
    const s = sortModel?.[0];
    if (!s) return pageRows;
    const sign = s.sort === 'desc' ? -1 : 1;
    return [...pageRows].sort((a, b) => {
      const av = a[s.field];
      const bv = b[s.field];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return String(av) < String(bv) ? -1 * sign : String(av) > String(bv) ? 1 * sign : 0;
    });
  }, [pageRows, sortModel]);

  const headerSort = (field: string, sortable?: boolean): void => {
    if (!sortable) return;
    const current = sortModel?.[0];
    const next: SortModel =
      current?.field === field ? (current.sort === 'asc' ? [{ field, sort: 'desc' }] : []) : [{ field, sort: 'asc' }];
    onSortModelChange(next);
  };

  const visible = rowActions ? [...columns, { field: '__actions', headerName: '', width: 140 } as NeudelaCol<T>] : columns;

  return (
    <div className="neudela-standard-list">
      {(searchField || toolbarActions) && (
        <div className="neudela-standard-list__toolbar">
          <div className="neudela-standard-list__toolbar-left">{searchField}</div>
          <div className="neudela-standard-list__toolbar-right">{toolbarActions}</div>
        </div>
      )}
      <div className="neudela-standard-list__table-wrap">
        <table className="neudela-table">
          <thead>
            <tr>
              {visible.map((col) => (
                <th
                  key={col.field}
                  onClick={() => headerSort(col.field, col.sortable)}
                  style={{ cursor: col.sortable ? 'pointer' : 'default' }}
                >
                  <span>{col.headerName ?? col.field}</span>
                  {sortModel?.[0]?.field === col.field && (
                    <NeuronBadge size="sm" variant="brand">
                      {sortModel[0].sort === 'asc' ? '▲' : '▼'}
                    </NeuronBadge>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={visible.length} className="neudela-table__empty">
                  {emptyText ?? 'Tidak ada data'}
                  {loading ? ' (memuat...)' : ''}
                </td>
              </tr>
            ) : (
              sorted.map((row) => {
                const rid = getRowId ? getRowId(row) : (row.id as string | number) ?? '';
                return (
                  <tr key={String(rid)}>
                    {visible.map((col) => {
                      if (col.field === '__actions') {
                        return (
                          <td key="__actions" className="neudela-table__actions">
                            {rowActions?.(row)}
                          </td>
                        );
                      }
                      const value = row[col.field];
                      const rendered = col.renderCell ? col.renderCell({ row, value }) : col.valueFormatter ? col.valueFormatter(value) : String(value ?? '');
                      return <td key={col.field}>{rendered}</td>;
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {rowCount > 0 && (
        <div className="neudela-standard-list__pager">
          <span className="neudela-standard-list__pager-info">
            Halaman {page + 1} / {pageCount} · {rowCount} data
          </span>
          <div className="neudela-standard-list__pager-actions">
            <button type="button" className="neudela-btn neudela-btn--secondary neudela-btn--sm" disabled={page <= 0} onClick={() => onPaginationModelChange({ page: page - 1, pageSize })}>
              ← Sebelumnya
            </button>
            <button
              type="button"
              className="neudela-btn neudela-btn--secondary neudela-btn--sm"
              disabled={page >= pageCount - 1}
              onClick={() => onPaginationModelChange({ page: page + 1, pageSize })}
            >
              Berikutnya →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}