import { NeuronButton } from 'neudela';
import ListTablePageSize from './ListTablePageSize';

interface Props {
  /** 0-based */
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  total: number;
  /** Narrow screens: rows-per-page + Previous/Next only. */
  compact?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

type PageItem = number | 'gap-start' | 'gap-end';

/** 1-based page numbers with ellipses once there are more than 7 pages. */
function pageItems(current: number, count: number): PageItem[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, 'gap-end', count];
  if (current >= count - 3) return [1, 'gap-start', count - 4, count - 3, count - 2, count - 1, count];
  return [1, 'gap-start', current - 1, current, current + 1, 'gap-end', count];
}

// Footer of the list card. NeuronTable's built-in pagination has no "1–10 of 12" range
// text, so the footer is composed here (rows-per-page is a styled listbox, ListTablePageSize).
export default function ListTablePagination({
  page,
  pageSize,
  pageSizeOptions,
  total,
  compact,
  onPageChange,
  onPageSizeChange,
}: Readonly<Props>) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page + 1, pageCount);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  return (
    <div className="lt-footer">
      <div className="lt-footer__size">
        <ListTablePageSize value={pageSize} options={pageSizeOptions} onChange={onPageSizeChange} />
        {!compact && <span className="lt-footer__range">{from}–{to} of {total}</span>}
      </div>

      {!compact && (
        <nav className="lt-footer__pages" aria-label="Table pagination">
          {pageItems(current, pageCount).map((item) => (
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                className={`lt-page${item === current ? ' is-active' : ''}`}
                aria-current={item === current ? 'page' : undefined}
                aria-label={`Page ${item}`}
                onClick={() => onPageChange(item - 1)}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="lt-page lt-page--gap" aria-hidden="true">…</span>
            )
          ))}
        </nav>
      )}

      <div className="lt-footer__nav">
        <NeuronButton type="button" variant="secondary" size="sm" aria-label="Previous page" disabled={current <= 1} onClick={() => onPageChange(current - 2)}>
          Previous
        </NeuronButton>
        <NeuronButton type="button" variant="secondary" size="sm" aria-label="Next page" disabled={current >= pageCount} onClick={() => onPageChange(current)}>
          Next
        </NeuronButton>
      </div>
    </div>
  );
}
