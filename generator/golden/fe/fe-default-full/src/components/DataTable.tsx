import { ReactNode } from 'react';
import { Table, TableBody, TableCell, TableHead, TableRow } from './Table';
import { Pagination } from './Pagination';
import { EmptyState } from './EmptyState';

export interface DataTableColumn<T> {
  field: string;
  headerName?: string;
  renderCell?: (row: T) => ReactNode;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowCount: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  getRowId?: (row: T) => string | number;
  toolbar?: ReactNode;
  emptyText?: string;
  rowActions?: (row: T) => ReactNode;
}

/** Table + toolbar (search/filter slot) + Pagination composite — the `data-grid` semantic
 * primitive (client-side; no server DataGrid). StandardList (src/gen/) uses Table/Pagination
 * directly for the emitter contract; this composite is the standalone reusable version. */
export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowCount,
  page,
  pageSize,
  onPageChange,
  getRowId,
  toolbar,
  emptyText,
  rowActions,
}: DataTableProps<T>) {
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  const cols = rowActions ? [...columns, { field: '__actions', headerName: '' }] : columns;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-app-surface shadow-xs">
      {toolbar && <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4.5">{toolbar}</div>}
      <Table>
        <TableHead>
          <TableRow>
            {cols.map((c) => (
              <TableCell key={c.field} header>
                {c.headerName ?? c.field}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <EmptyState title={emptyText} colSpan={cols.length} />
          ) : (
            rows.map((row) => {
              const rid = getRowId ? getRowId(row) : String((row as Record<string, unknown>).id ?? '');
              return (
                <TableRow key={String(rid)}>
                  {columns.map((c) => (
                    <TableCell key={c.field}>{c.renderCell ? c.renderCell(row) : String(row[c.field] ?? '')}</TableCell>
                  ))}
                  {rowActions && <TableCell>{rowActions(row)}</TableCell>}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
      {rowCount > 0 && (
        <Pagination page={page} pageCount={pageCount} rowCount={rowCount} onPageChange={onPageChange} />
      )}
    </div>
  );
}

export default DataTable;
