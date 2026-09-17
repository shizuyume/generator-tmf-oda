import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  page: number; // 0-based
  pageCount: number;
  rowCount: number;
  onPageChange: (page: number) => void;
  infoLabel?: string;
  pageSize?: number;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
}

/** Ports .pagination / .pages / .page from example-component-in-dashboard.html. Page-size
 * selector (F1) is optional and additive — DataTable.tsx (client-side composite) never
 * passes pageSizeOptions, so its rendering is unchanged. */
export function Pagination({
  page,
  pageCount,
  rowCount,
  onPageChange,
  infoLabel,
  pageSize,
  pageSizeOptions,
  onPageSizeChange,
}: PaginationProps) {
  const windowStart = Math.max(0, Math.min(page - 1, pageCount - 3));
  const pages = Array.from({ length: Math.min(3, pageCount) }, (_, i) => windowStart + i);

  return (
    <div className="flex h-12 items-center justify-between px-3.5 text-[11px] text-text-secondary">
      <div className="flex items-center gap-3">
        <span>{infoLabel ?? `${rowCount} data`}</span>
        {pageSizeOptions && pageSizeOptions.length > 0 && onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span>Baris/halaman</span>
            <select
              value={pageSize ?? pageSizeOptions[0]}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border border-border-strong bg-app-surface px-1.5 py-1 text-[11px] text-text-primary"
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          className="grid h-[30px] w-[30px] place-items-center rounded-md border border-transparent text-text-secondary hover:bg-gray-100 disabled:opacity-40"
          disabled={page <= 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Sebelumnya"
        >
          <ChevronLeft size={16} />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            className={`grid h-[30px] w-[30px] place-items-center rounded-md border border-transparent text-[11px] ${
              p === page ? 'bg-app-brand text-text-on-brand' : 'text-text-secondary hover:bg-gray-100'
            }`}
            onClick={() => onPageChange(p)}
          >
            {p + 1}
          </button>
        ))}
        <button
          type="button"
          className="grid h-[30px] w-[30px] place-items-center rounded-md border border-transparent text-text-secondary hover:bg-gray-100 disabled:opacity-40"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
          aria-label="Berikutnya"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export default Pagination;
