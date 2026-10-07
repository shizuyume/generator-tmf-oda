import { useId, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { FileSpreadsheet, SearchX } from 'lucide-react';
import { NeuronAlert, NeuronButton, NeuronTable } from 'neudela';
import type { NeuronTableColumn } from 'neudela';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import ListTableToolbar from './ListTableToolbar';
import ListTablePagination from './ListTablePagination';
import ListTableMobileList from './ListTableMobileList';
import ListTableFilterPanel from './ListTableFilterPanel';
import ListTableFilterChips from './ListTableFilterChips';
import ListTableRowMenu from './ListTableRowMenu';
import type {
  FilterCondition,
  ListTableBulkAction,
  ListTableFilterField,
  ListTableMobileCard,
  ListTableOption,
  ListTablePrimaryAction,
  ListTableRowAction,
  SortModel,
} from './types';
import './ListTable.css';

export interface ListTableProps<T extends Record<string, any>> {
  // ── card header ──
  title: string;
  description?: string;
  /** e.g. ['algorithm', 'algorithms'] — used in the count chip and empty-state copy. */
  noun: [singular: string, plural: string];

  // ── data (one server page) ──
  /** Give every column a `width` except one flexible text column (fixed table layout). */
  columns: NeuronTableColumn<T>[];
  /** Below this the table scrolls horizontally (sticky Actions stays). Default 960. */
  minTableWidth?: number;
  rows: T[];
  rowKey: Extract<keyof T, string>;
  total: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  /** Shows a Refresh button in the toolbar, next to Filter and Sort By. */
  onRefresh?: () => void;
  onRowClick?: (row: T) => void;
  rowActions?: ListTableRowAction<T>[];
  /**
   * How row actions render in the table: 'inline' = every action as an icon button (default),
   * 'menu' = one "⋯" button opening the actions as a menu. Mobile cards always show buttons.
   */
  buttonActionVariant?: 'inline' | 'menu';
  /** Names the row for the "⋯" trigger ("Actions for <label>"). Defaults to the row key. */
  rowLabel?: (row: T) => string;
  renderMobileCard: (row: T) => ListTableMobileCard;

  // ── toolbar (values are immediate; the page debounces what it sends to the API) ──
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  sortOptions: ListTableOption[];
  sort: SortModel | null;
  onSortChange: (sort: SortModel | null) => void;
  /** Filterable columns. Applied conditions show as chips; edits apply on "Apply filters". */
  filterFields?: ListTableFilterField[];
  filters: FilterCondition[];
  onFiltersChange: (filters: FilterCondition[]) => void;
  primaryAction?: ListTablePrimaryAction;

  // ── row numbers / selection ──
  /** Leading "No" column (1., 2., … continuing across pages). Default true. */
  showRowNumbers?: boolean;
  /** Selection (checkbox column + bulk toolbar) only renders when a bulkAction is given. */
  selectedKeys?: string[];
  onSelectedKeysChange?: (keys: string[]) => void;
  bulkAction?: ListTableBulkAction;

  // ── paging (0-based page) ──
  page: number;
  pageSize: number;
  pageSizeOptions?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;

  // ── empty state ──
  emptyTitle: string;
  emptyBody: string;
}

// The list card of the Neudela Logistics Dashboard ("Work queue") rebuilt on neudela:
// header with a count chip, toolbar, advanced filter panel + applied-filter chips, NeuronTable (selection,
// sortable headers, sticky actions, skeleton), footer pagination, empty / error states,
// and a card list below 768px. Data stays the page's — this component only lays it out.
const NO_KEYS: string[] = [];
const noop = () => {};

export default function ListTable<T extends Record<string, any>>({
  title,
  description,
  noun,
  columns,
  minTableWidth = 960,
  rows,
  rowKey,
  total,
  loading,
  error,
  onRetry,
  onRefresh,
  onRowClick,
  rowActions = [],
  buttonActionVariant = 'inline',
  rowLabel,
  renderMobileCard,
  search,
  onSearchChange,
  searchPlaceholder,
  sortOptions,
  sort,
  onSortChange,
  filterFields,
  filters,
  onFiltersChange,
  primaryAction,
  showRowNumbers = true,
  selectedKeys = NO_KEYS,
  onSelectedKeysChange = noop,
  bulkAction,
  page,
  pageSize,
  pageSizeOptions = [5, 10, 25, 50],
  onPageChange,
  onPageSizeChange,
  emptyTitle,
  emptyBody,
}: Readonly<ListTableProps<T>>) {
  const headingId = useId();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const filterActive = filters.length > 0;
  const [filterOpen, setFilterOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const hasRows = rows.length > 0;
  const searching = search.trim() !== '';
  const narrowed = searching || filterActive;
  const getKey = (row: T) => String(row[rowKey]);

  const rowNumberOffset = page * pageSize;

  const tableColumns = useMemo<NeuronTableColumn<T>[]>(() => {
    const numberColumn: NeuronTableColumn<T>[] = showRowNumbers
      ? [{
          key: '__no',
          label: 'No',
          width: 64,
          // NeuronTable passes the index within the current page
          render: (_value, _row: T, index: number) => <span className="lt-cell-no">{rowNumberOffset + index + 1}.</span>,
        }]
      : [];
    if (rowActions.length === 0) return [...numberColumn, ...columns];
    return [
      ...numberColumn,
      ...columns,
      {
        key: '__actions',
        label: 'Actions',
        align: 'right',
        sticky: 'right',
        // 32px buttons + 4px gap + cell padding
        width: buttonActionVariant === 'menu' ? 80 : 40 + rowActions.length * 36,
        render: (_value, row: T) => (buttonActionVariant === 'menu' ? (
          <div className="lt-actions">
            <ListTableRowMenu
              row={row}
              actions={rowActions}
              label={`Actions for ${rowLabel ? rowLabel(row) : String(row[rowKey])}`}
            />
          </div>
        ) : (
          <div className="lt-actions">
            {rowActions.map((a) => (
              <NeuronButton
                key={a.key}
                type="button"
                variant="text"
                size="sm"
                iconOnly
                aria-label={a.ariaLabel(row)}
                title={a.label}
                className={`lt-action lt-action--${a.tone ?? 'neutral'}`}
                onClick={(e) => {
                  e.stopPropagation(); // the row itself opens the detail
                  a.onClick(row);
                }}
              >
                {a.icon}
              </NeuronButton>
            ))}
          </div>
        )),
      },
    ];
  }, [columns, rowActions, showRowNumbers, rowNumberOffset, buttonActionVariant, rowLabel, rowKey]);

  const pickSort = (key: string) => {
    onSortChange({
      columnKey: key,
      direction: sort?.columnKey === key && sort.direction === 'asc' ? 'desc' : 'asc',
    });
    setSortMenuOpen(false);
  };

  const clearSearchAndFilters = () => {
    onSearchChange('');
    onFiltersChange([]);
  };

  const pagination = (
    <ListTablePagination
      page={page}
      pageSize={pageSize}
      pageSizeOptions={pageSizeOptions}
      total={total}
      compact={isMobile}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  );

  let body: ReactNode;
  if (error && !hasRows) {
    body = (
      <div className="lt-state">
        <NeuronAlert
          variant="danger"
          title={`${noun[1][0].toUpperCase()}${noun[1].slice(1)} could not be loaded`}
          description={error}
          actions={[{ label: 'Try again', onClick: onRetry }]}
        />
      </div>
    );
  } else if (!loading && !hasRows) {
    let emptyHeading = emptyTitle;
    let emptyText = emptyBody;
    if (searching) {
      emptyHeading = `No ${noun[1]} match “${search.trim()}”`;
      emptyText = 'Try adjusting your keywords.';
    } else if (filterActive) {
      emptyHeading = `No ${noun[1]} match ${filters.length === 1 ? 'this filter' : 'these filters'}`;
      emptyText = 'Remove a filter chip or clear them all to see the full list.';
    }
    body = (
      <div className="lt-empty">
        <span className="lt-empty__icon" aria-hidden="true">
          {narrowed ? <SearchX size={26} /> : <FileSpreadsheet size={26} />}
        </span>
        <p className="lt-empty__title">{emptyHeading}</p>
        <p className="lt-empty__body">{emptyText}</p>
        {narrowed && (
          <NeuronButton type="button" variant="secondary" onClick={clearSearchAndFilters}>
            Clear search and filters
          </NeuronButton>
        )}
      </div>
    );
  } else {
    body = (
      <>
        {error && (
          <div className="lt-state lt-state--inline">
            <NeuronAlert variant="danger" size="sm" title="Refresh failed" description={error} actions={[{ label: 'Try again', onClick: onRetry }]} />
          </div>
        )}
        {isMobile ? (
          <div className={loading ? 'is-refreshing' : undefined} aria-busy={loading}>
            <ListTableMobileList
              rows={rows}
              getKey={getKey}
              renderCard={renderMobileCard}
              rowActions={rowActions}
              selectable={!!bulkAction}
              rowNumberOffset={showRowNumbers ? rowNumberOffset : undefined}
              selectedKeys={selectedKeys}
              onToggle={(key, checked) => onSelectedKeysChange(
                checked ? [...selectedKeys, key] : selectedKeys.filter((k) => k !== key),
              )}
              onRowClick={onRowClick}
              ariaLabel={title}
            />
          </div>
        ) : (
          <div
            className={`lt-table${loading && hasRows ? ' is-refreshing' : ''}`}
            style={{ '--lt-min-width': `${minTableWidth}px` } as CSSProperties}
            aria-busy={loading}
          >
            <NeuronTable<T>
              columns={tableColumns}
              data={rows}
              rowKey={rowKey}
              // skeleton only on the first load; a refresh keeps the rows (dimmed)
              loading={loading && !hasRows}
              selectable={!!bulkAction}
              selectedRowKeys={selectedKeys}
              onSelectChange={(keys) => onSelectedKeysChange(keys.map(String))}
              onRowClick={onRowClick ? (row) => onRowClick(row) : undefined}
              sortColumn={sort?.columnKey}
              sortDirection={sort?.direction ?? null}
              onSort={(columnKey, direction) => onSortChange(direction ? { columnKey, direction } : null)}
            />
          </div>
        )}
        {pagination}
      </>
    );
  }

  return (
    <section className="lt" aria-labelledby={headingId}>
      <header className="lt-head">
        <div className="lt-head__title-row">
          <h2 id={headingId} className="lt-head__title">{title}</h2>
          {!(error && !hasRows) && <span className="lt-chip">{total} {total === 1 ? noun[0] : noun[1]}</span>}
        </div>
        {description && <p className="lt-head__desc">{description}</p>}
      </header>

      <ListTableToolbar
        selectedCount={selectedKeys.length}
        bulkAction={bulkAction}
        onBulk={() => bulkAction?.onRun(selectedKeys)}
        onClearSelection={() => onSelectedKeysChange([])}
        showFilter={!!filterFields?.length}
        filterCount={filters.length}
        filterOpen={filterOpen}
        onToggleFilter={() => setFilterOpen((o) => !o)}
        sortOptions={sortOptions}
        sort={sort}
        sortMenuOpen={sortMenuOpen}
        onSortMenuOpenChange={setSortMenuOpen}
        onSortPick={pickSort}
        onRefresh={onRefresh}
        refreshing={loading}
        search={search}
        onSearchChange={onSearchChange}
        searchPlaceholder={searchPlaceholder}
        primaryAction={primaryAction}
      />

      {filterOpen && filterFields && filterFields.length > 0 && (
        <ListTableFilterPanel
          fields={filterFields}
          applied={filters}
          onApply={(next) => {
            onFiltersChange(next);
            setFilterOpen(false);
          }}
          onCancel={() => setFilterOpen(false)}
        />
      )}

      {filterFields && (
        <ListTableFilterChips
          fields={filterFields}
          filters={filters}
          onRemove={(field) => onFiltersChange(filters.filter((f) => f.field !== field))}
          onClearAll={() => onFiltersChange([])}
        />
      )}

      {body}
    </section>
  );
}
