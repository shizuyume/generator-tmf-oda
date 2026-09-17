import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './apiClient';

// Neudela adalah library tanpa DataGrid — sort/filter model memakai tipe lokal
// (bukan @mui/x-data-grid). Emitter page memakainya lewat StandardList neudela.
export interface SortItem {
  field: string;
  sort: 'asc' | 'desc';
}
export type SortModel = SortItem[];

export interface FilterItem {
  field: string;
  operator: string;
  value?: unknown;
}
export interface FilterModel {
  items: FilterItem[];
}

export interface ListParams {
  offset?: number;
  limit?: number;
  page?: number;
  perPage?: number;
  q?: string;
  sort?: SortModel;
  filter?: FilterModel;
  extra?: Record<string, string | number | boolean | undefined>;
}

export interface ListResult<T> {
  rows: T[];
  total: number;
}

export type Severity = 'success' | 'error' | 'info' | 'warning';

export interface CrudHooks<T> {
  list: (params: ListParams) => Promise<ListResult<T>>;
  create?: (payload: Record<string, unknown>) => Promise<unknown>;
  update?: (id: string | number, payload: Record<string, unknown>) => Promise<unknown>;
  remove?: (id: string | number) => Promise<unknown>;
  getRowId?: (row: T) => string | number;
}

export interface UseCrudPageOptions {
  scheme?: 'offset-limit' | 'page-per-page';
  searchDebounceMs?: number;
  defaultPageSize?: number;
  notify?: (message: string, severity: Severity) => void;
}

/**
 * List state server-mode: fetch list (pagination/search/filter/sort dari params),
 * loading/error, create/edit/delete + snackbar callback. Versi neudela — tanpa
 * dependensi @mui/x-data-grid; contract props sama (emitter page netral).
 */
export function useCrudPage<T>(hooks: CrudHooks<T>, options: UseCrudPageOptions = {}) {
  const scheme = options.scheme ?? 'offset-limit';
  const debounceMs = options.searchDebounceMs ?? 300;

  const [pagination, setPagination] = useState({ page: 0, pageSize: options.defaultPageSize ?? 10 });
  const [sort, setSort] = useState<SortModel>([]);
  const [filter, setFilter] = useState<FilterModel>({ items: [] });
  const [searchQ, setSearchQ] = useState('');
  const [extra, setExtra] = useState<Record<string, string | undefined>>({});
  const [rows, setRows] = useState<T[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const notifyRef = useRef(options.notify);
  notifyRef.current = options.notify;

  const debouncedQ = useDebounced(searchQ, debounceMs);

  const buildParams = useCallback((): ListParams => {
    const { page, pageSize } = pagination;
    const params: ListParams = { q: debouncedQ || undefined, sort, filter, extra };
    if (scheme === 'offset-limit') {
      params.offset = page * pageSize;
      params.limit = pageSize;
    } else {
      params.page = page + 1;
      params.perPage = pageSize;
    }
    return params;
  }, [pagination, debouncedQ, sort, filter, extra, scheme]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await hooksRef.current.list(buildParams());
      setRows(result.rows);
      setRowCount(result.total);
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : new ApiError(0, err instanceof Error ? err.message : String(err));
      setError(apiErr);
      notifyRef.current?.(apiErr.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (payload: Record<string, unknown>) => {
      if (!hooksRef.current.create) throw new Error('useCrudPage: hooks.create tidak disediakan');
      await hooksRef.current.create(payload);
      await reload();
      notifyRef.current?.('Data berhasil dibuat', 'success');
    },
    [reload],
  );

  const update = useCallback(
    async (id: string | number, payload: Record<string, unknown>) => {
      if (!hooksRef.current.update) throw new Error('useCrudPage: hooks.update tidak disediakan');
      await hooksRef.current.update(id, payload);
      await reload();
      notifyRef.current?.('Data berhasil diperbarui', 'success');
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string | number) => {
      if (!hooksRef.current.remove) throw new Error('useCrudPage: hooks.remove tidak disediakan');
      await hooksRef.current.remove(id);
      await reload();
      notifyRef.current?.('Data berhasil dihapus', 'success');
    },
    [reload],
  );

  return {
    rows,
    rowCount,
    loading,
    error,
    pagination,
    setPagination,
    sort,
    setSort,
    filter,
    setFilter,
    searchQ,
    setSearchQ,
    extra,
    setExtra,
    reload,
    create,
    update,
    remove,
  };
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return debounced;
}