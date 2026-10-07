import { ArrowDown, ArrowUp, ArrowUpDown, Filter, RefreshCw, Search, X } from 'lucide-react';
import { NeuronButton, NeuronDropdownMenu, NeuronInput } from 'neudela';
import type { DropdownMenuItem } from 'neudela';
import type { ListTableBulkAction, ListTableOption, ListTablePrimaryAction, SortModel } from './types';

interface Props {
  selectedCount: number;
  bulkAction?: ListTableBulkAction;
  onBulk: () => void;
  onClearSelection: () => void;
  showFilter: boolean;
  filterCount: number;
  filterOpen: boolean;
  onToggleFilter: () => void;
  sortOptions: ListTableOption[];
  sort: SortModel | null;
  sortMenuOpen: boolean;
  onSortMenuOpenChange: (open: boolean) => void;
  onSortPick: (key: string) => void;
  onRefresh?: () => void;
  refreshing: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  primaryAction?: ListTablePrimaryAction;
}

// Toolbar of the list card (Neudela Logistics Dashboard › Work queue): filter, sort and
// refresh on the left — swapped for "N selected · bulk action · Clear" while rows are selected —
// and search + the primary action on the right. Built outside NeuronTable because its
// own toolbar re-filters the current page client-side and has no slot for a filter panel.
export default function ListTableToolbar({
  selectedCount,
  bulkAction,
  onBulk,
  onClearSelection,
  showFilter,
  filterCount,
  filterOpen,
  onToggleFilter,
  sortOptions,
  sort,
  sortMenuOpen,
  onSortMenuOpenChange,
  onSortPick,
  onRefresh,
  refreshing,
  search,
  onSearchChange,
  searchPlaceholder,
  primaryAction,
}: Readonly<Props>) {
  const sortLabel = sortOptions.find((o) => o.key === sort?.columnKey)?.label;
  const DirIcon = sort?.direction === 'desc' ? ArrowDown : ArrowUp;
  const sortItems: DropdownMenuItem[] = sortOptions.map((o) => ({
    id: o.key,
    label: o.label,
    type: 'radio',
    checked: sort?.columnKey === o.key,
    trailingIcon: sort?.columnKey === o.key ? <DirIcon size={15} aria-hidden="true" /> : undefined,
    onClick: () => onSortPick(o.key),
  }));

  return (
    <div className="lt-toolbar">
      <div className="lt-toolbar__left">
        {selectedCount > 0 && bulkAction ? (
          <>
            <span className="lt-toolbar__selected" aria-live="polite">{selectedCount} selected</span>
            <NeuronButton type="button" variant="danger" leadingIcon={bulkAction.icon} onClick={onBulk}>
              {bulkAction.label}
            </NeuronButton>
            <NeuronButton type="button" variant="text" onClick={onClearSelection}>Clear</NeuronButton>
          </>
        ) : (
          <>
            {showFilter && (
              <NeuronButton
                type="button"
                variant="secondary"
                className={`lt-toolbar__btn${filterCount > 0 ? ' is-active' : ''}`}
                leadingIcon={<Filter size={15} />}
                aria-expanded={filterOpen}
                onClick={onToggleFilter}
              >
                {filterCount > 0 ? `Filter · ${filterCount}` : 'Filter'}
              </NeuronButton>
            )}
            {sortOptions.length > 0 && (
              <NeuronDropdownMenu
                className="lt-toolbar__sort"
                align="start"
                width={220}
                showHeader={false}
                header={false}
                isOpen={sortMenuOpen}
                onOpenChange={onSortMenuOpenChange}
                items={sortItems}
                // The menu's trigger slot is a plain <div> (no role, no tabindex), so the
                // trigger itself must be the focusable button. Its radio items carry no
                // aria-checked either — the label states the active sort instead.
                trigger={
                  <NeuronButton
                    type="button"
                    variant="secondary"
                    className="lt-toolbar__sort-trigger"
                    leadingIcon={<ArrowUpDown size={15} />}
                    trailingIcon={sortLabel ? <DirIcon size={14} aria-hidden="true" /> : undefined}
                    aria-haspopup="menu"
                    aria-expanded={sortMenuOpen}
                    aria-label={sortLabel ? `Sort By: ${sortLabel}, ${sort?.direction === 'desc' ? 'descending' : 'ascending'}` : undefined}
                  >
                    {sortLabel ? `Sort By: ${sortLabel}` : 'Sort By'}
                  </NeuronButton>
                }
              />
            )}
            {onRefresh && (
              <NeuronButton
                type="button"
                variant="secondary"
                className={`lt-toolbar__refresh${refreshing ? ' is-spinning' : ''}`}
                leadingIcon={<RefreshCw size={15} />}
                disabled={refreshing}
                aria-busy={refreshing}
                onClick={onRefresh}
              >
                Refresh
              </NeuronButton>
            )}
          </>
        )}
      </div>

      <div className="lt-toolbar__right">
        <div className="lt-toolbar__search">
          <NeuronInput
            aria-label="Search records in table"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            leadingIcon={<Search size={16} />}
            trailingIcon={search ? (
              <button type="button" className="lt-toolbar__clear" aria-label="Clear search" onClick={() => onSearchChange('')}>
                <X size={14} />
              </button>
            ) : undefined}
          />
        </div>
        {primaryAction && (
          <NeuronButton type="button" variant="primary" leadingIcon={primaryAction.icon} onClick={primaryAction.onClick}>
            {primaryAction.label}
          </NeuronButton>
        )}
      </div>
    </div>
  );
}
