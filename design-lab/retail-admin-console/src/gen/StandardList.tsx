import { ReactElement, ReactNode } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableRow } from '../components/Table';
import { Pagination } from '../components/Pagination';
import { EmptyState, EmptyStateAction } from '../components/EmptyState';
import { SkeletonRows } from '../components/Skeleton';
import type { FilterModel, SortModel } from './useCrudPage';

// Kontrak kolom SAMA dgn versi mui/neudela (emit/page.mjs columnCode() lib-agnostic):
// field/headerName/sortable/filterable + renderCell({row,value}) | valueFormatter(value).
export interface DefaultCol<T = Record<string, unknown>> {
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
  columns: DefaultCol<T>[];
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
  emptyAction?: EmptyStateAction;
  getRowId?: (row: T) => string | number;
  pageSizeOptions?: number[];
  addActionColumn?: boolean;
}

/** Ports .table-card/.table-toolbar/.table-wrap/.pagination from
 * example-component-in-dashboard.html. Server-mode murni (F1): `rows` SUDAH tepat satu
 * halaman (useCrudPage mem-fetch persis offset/limit dari server) — komponen ini TIDAK
 * boleh mengiris atau mengurutkan ulang secara client, karena itu akan menunjukkan
 * halaman ke-1 berulang alih-alih data halaman sesungguhnya (bug F0/§1.8: sebelumnya
 * `rows.slice(page*pageSize, ...)` mengiris ulang satu halaman yang sudah diiris server,
 * membuat halaman ke-2+ tampil kosong). Sort/filter naik ke useCrudPage -> query param;
 * header sort di sini hanya MEMICU onSortModelChange, tidak mengurutkan sendiri. */
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
    onFilterModelChange,
    loading = false,
    searchField,
    toolbarActions,
    rowActions,
    getRowId,
    emptyText,
    emptyAction,
    pageSizeOptions,
  } = props;

  const { page = 0, pageSize = 10 } = pageModel;
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  const activeFilterCount = filterModel?.items?.length ?? 0;

  const headerSort = (field: string, sortable?: boolean): void => {
    if (!sortable) return;
    const current = sortModel?.[0];
    const next: SortModel =
      current?.field === field ? (current.sort === 'asc' ? [{ field, sort: 'desc' }] : []) : [{ field, sort: 'asc' }];
    onSortModelChange(next);
  };

  const visible = rowActions ? [...columns, { field: '__actions', headerName: '', width: 140 } as DefaultCol<T>] : columns;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-app-surface shadow-xs">
      {(searchField || toolbarActions || activeFilterCount > 0) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {searchField}
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => onFilterModelChange({ items: [] })}
                className="inline-flex items-center gap-1 rounded-full border border-border-strong px-2.5 py-1 text-[11px] text-text-secondary hover:text-text-primary"
              >
                {activeFilterCount} filter aktif
                <X size={11} />
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">{toolbarActions}</div>
        </div>
      )}
      <Table>
        <TableHead>
          <TableRow>
            {visible.map((col) => (
              <TableCell
                key={col.field}
                header
                onClick={() => headerSort(col.field, col.sortable)}
                style={{ cursor: col.sortable ? 'pointer' : 'default' }}
              >
                <span className="inline-flex items-center gap-1">
                  {col.headerName ?? col.field}
                  {sortModel?.[0]?.field === col.field &&
                    (sortModel[0].sort === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </span>
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {loading && rows.length === 0 ? (
            <SkeletonRows rows={Math.min(pageSize, 5)} columns={visible.length} />
          ) : rows.length === 0 ? (
            <EmptyState colSpan={visible.length} title={emptyText ?? 'Tidak ada data'} action={emptyAction}>
              {emptyText ?? 'Tidak ada data'}
            </EmptyState>
          ) : (
            rows.map((row) => {
              const rid = getRowId ? getRowId(row) : (row.id as string | number) ?? '';
              return (
                <TableRow key={String(rid)}>
                  {visible.map((col) => {
                    if (col.field === '__actions') {
                      return (
                        <TableCell key="__actions">
                          <div className="flex gap-0.5">{rowActions?.(row)}</div>
                        </TableCell>
                      );
                    }
                    const value = row[col.field];
                    const rendered = col.renderCell ? col.renderCell({ row, value }) : col.valueFormatter ? col.valueFormatter(value) : String(value ?? '');
                    return <TableCell key={col.field}>{rendered}</TableCell>;
                  })}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {rowCount > 0 && (
        <Pagination
          page={page}
          pageCount={pageCount}
          rowCount={rowCount}
          infoLabel={`Halaman ${page + 1} / ${pageCount} · ${rowCount} data`}
          onPageChange={(p) => onPaginationModelChange({ page: p, pageSize })}
          pageSize={pageSize}
          pageSizeOptions={pageSizeOptions}
          onPageSizeChange={pageSizeOptions ? (n) => onPaginationModelChange({ page: 0, pageSize: n }) : undefined}
        />
      )}
    </div>
  );
}
