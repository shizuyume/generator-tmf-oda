import type { ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortModel {
  columnKey: string;
  direction: SortDirection;
}

export type FilterFieldType = 'text' | 'date';

/** A filterable column. `text` → "contains", `date` → "is between" (date range picker). */
export interface ListTableFilterField {
  /** Column key; also identifies the filter (one condition per field). */
  key: string;
  label: string;
  type: FilterFieldType;
  /** Attribute when it differs from `key`; relative to `list` when set (e.g. 'name'). */
  param?: string;
  /** Embedded list the attribute belongs to (e.g. 'policy'): matches when one element does. */
  list?: string;
  placeholder?: string;
}

/** One applied (or draft) condition. Dates are local calendar days, 'YYYY-MM-DD'. */
export type FilterCondition =
  | { field: string; type: 'text'; value: string }
  | { field: string; type: 'date'; from: string | null; to: string | null };

export interface ListTableOption {
  key: string;
  label: string;
}

export type RowActionTone = 'brand' | 'neutral' | 'danger';

export interface ListTableRowAction<T> {
  key: string;
  /** Tooltip on desktop, button text on mobile. */
  label: string;
  /** Accessible name of the icon button, per row (e.g. "Delete Standard 70/30 Split"). */
  ariaLabel: (row: T) => string;
  icon: ReactNode;
  tone?: RowActionTone;
  onClick: (row: T) => void;
}

/** What a row shows when the table collapses into cards on narrow screens. */
export interface ListTableMobileCard {
  id: string;
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
}

export interface ListTableBulkAction {
  label: string;
  icon?: ReactNode;
  onRun: (keys: string[]) => void;
}

export interface ListTablePrimaryAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}
