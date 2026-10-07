import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NeuronBreadcrumb, NeuronButton, NeuronModal } from 'neudela';
import type { NeuronTableColumn } from 'neudela';
import ListTable from '../components/list-table/ListTable';
import { appendFilterParams, toSortParam } from '../components/list-table/filters';
import type { FilterCondition, ListTableMobileCard, ListTableRowAction, SortModel } from '../components/list-table/types';
import { Toast, useToast } from '../components/Toast';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { getErrorMessage } from '../service';
import type { ListParams } from '../service/api';
import ResourceFormDialog from './ResourceFormDialog';
import { at, evaluate, text } from './expr';
import { fillRow, icon, renderCell, tableColumns } from './render';
import type { ResourceConfig } from './types';

type Row = Record<string, any>;

interface ListQuery {
  page: number;
  pageSize: number;
  search: string;
  filters: FilterCondition[];
  sort: SortModel | null;
}

// The list page of a resource: breadcrumb, page header, the list card (ListTable), the create
// dialog and the delete confirmation. Rows keep raw values (ISO dates, numbers) — NeuronTable
// re-sorts the current page client-side even in server mode, so formatting lives in the cells.
export default function ResourceListPage({
  config,
  onViewDetail,
  embedded = false,
}: Readonly<{
  config: ResourceConfig;
  onViewDetail?: (id: string) => void;
  /** Inside another page (a nested resource's tab): the list card only, no breadcrumb or page title. */
  embedded?: boolean;
}>) {
  const { list, service } = config;
  const { card } = list;
  const [rows, setRows] = useState<Row[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { toast, showToast, closeToast } = useToast();

  // The search box updates on every keystroke and is committed (debounced) into `query`;
  // filters are committed by "Apply filters" / chip removal. Only `query` triggers a request.
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState<ListQuery>({ page: 0, pageSize: 10, search: '', filters: [], sort: null });
  const requestSeq = useRef(0);

  const debouncedSearch = useDebouncedValue(searchInput.trim());

  useEffect(() => {
    setQuery((q) => (q.search === debouncedSearch ? q : { ...q, search: debouncedSearch, page: 0 }));
  }, [debouncedSearch]);

  const [openCreate, setOpenCreate] = useState(false);
  /** The record being edited (fetched in full when its row action is used). */
  const [editRecord, setEditRecord] = useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    const { page, pageSize, search, filters, sort } = query;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const params: ListParams = {
        offset: page * pageSize,
        limit: pageSize,
      };
      // the search box is one more "contains" condition, on card.searchParam
      const searched: FilterCondition[] = search ? [{ field: card.searchParam, type: 'text', value: search }] : [];
      appendFilterParams(params, [...searched, ...filters], list.filterFields);
      if (sort) {
        params['sort'] = toSortParam(sort.columnKey, sort.direction);
      }
      const result = await service.list(params);
      if (seq !== requestSeq.current) return; // a newer query is in flight
      setRows(result.data.map((item) => Object.fromEntries(
        Object.entries(list.rowFrom).map(([key, expr]) => [key, evaluate(expr, item)]),
      )));
      setTotalRows(result.total);
      setLoadError(null);
    } catch (err) {
      if (seq === requestSeq.current) setLoadError(getErrorMessage(err));
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [query, card.searchParam, list.filterFields, list.rowFrom, service]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSaved = useCallback(async (message: string) => {
    showToast(message);
    setOpenCreate(false);
    setEditRecord(null);
    await loadData();
  }, [loadData, showToast]);

  const canEdit = !!(config.form?.edit && service.patch && service.get);
  const openEdit = useCallback(async (r: Row) => {
    try {
      setEditRecord(await service.get!(r.id));
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    }
  }, [service, showToast]);

  const handleDelete = async () => {
    if (!deleteTarget || !service.remove || !list.delete) return;
    setDeleting(true);
    try {
      await service.remove(deleteTarget.id);
      showToast(list.delete.toast);
      setDeleteTarget(null);
      if (rows.length === 1 && query.page > 0) {
        setQuery((q) => ({ ...q, page: q.page - 1 })); // emptied the last page: step back
      } else {
        await loadData();
      }
    } catch (err) {
      showToast(getErrorMessage(err), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const open = onViewDetail ? (r: Row) => onViewDetail(r.id) : undefined;

  const columns = useMemo<NeuronTableColumn<Row>[]>(() => tableColumns<Row>(list.columns, open), [list.columns, onViewDetail]);

  const rowActions = useMemo<ListTableRowAction<Row>[]>(() => list.rowActions
    .filter((a) => a.action !== 'open-edit' || canEdit)
    .map((a) => {
      const handlers: Record<typeof a.action, (r: Row) => void> = {
        'open-detail': (r) => onViewDetail?.(r.id),
        'open-edit': (r) => { void openEdit(r); },
        'confirm-delete': (r) => setDeleteTarget(r),
      };
      return {
        key: a.key,
        label: a.label,
        ariaLabel: (r: Row) => fillRow(a.ariaLabel, r),
        icon: icon(a.icon),
        tone: a.tone,
        onClick: handlers[a.action],
      };
    }), [list.rowActions, onViewDetail, canEdit, openEdit]);

  const badgeColumn = list.columns.find((c) => c.key === list.mobileCard.badge);
  const renderMobileCard = useCallback((r: Row): ListTableMobileCard => ({
    id: String(at(r, list.mobileCard.id)),
    title: String(at(r, list.mobileCard.title)),
    ...(badgeColumn ? { badge: renderCell(badgeColumn, r) } : {}),
    ...(list.mobileCard.subtitle ? { subtitle: text(list.mobileCard.subtitle, r) } : {}),
    ...(list.mobileCard.meta ? { meta: text(list.mobileCard.meta, r) } : {}),
  }), [list.mobileCard, badgeColumn]);

  return (
    <div className={embedded ? 'lab-embedded-list' : 'lab-page'}>
      {!embedded && (
        <>
          <NeuronBreadcrumb items={list.breadcrumb.map((label) => ({ label }))} />

          <div className="lab-page__header">
            <div>
              <h1 className="lab-page__title">{list.title}</h1>
              <p className="lab-page__subtitle">{list.subtitle}</p>
            </div>
          </div>
        </>
      )}

      <ListTable<Row>
        title={card.title}
        description={card.description}
        noun={card.noun}
        columns={columns}
        minTableWidth={card.minTableWidth}
        rows={rows}
        rowKey="id"
        total={totalRows}
        loading={loading}
        error={loadError}
        onRetry={loadData}
        onRefresh={card.refresh ? loadData : undefined}
        onRowClick={card.rowClick === 'open-detail' ? open : undefined}
        rowActions={rowActions}
        buttonActionVariant={card.buttonActionVariant}
        rowLabel={(r) => String(at(r, card.rowLabel))}
        renderMobileCard={renderMobileCard}
        search={searchInput}
        onSearchChange={setSearchInput}
        searchPlaceholder={card.searchPlaceholder}
        sortOptions={list.sortOptions}
        sort={query.sort}
        onSortChange={(sort) => setQuery((q) => ({ ...q, sort, page: 0 }))}
        filterFields={list.filterFields}
        filters={query.filters}
        onFiltersChange={(filters) => setQuery((q) => ({ ...q, filters, page: 0 }))}
        primaryAction={card.primaryAction && config.form
          ? { label: card.primaryAction.label, icon: icon(card.primaryAction.icon), onClick: () => setOpenCreate(true) }
          : undefined}
        page={query.page}
        pageSize={query.pageSize}
        onPageChange={(page) => setQuery((q) => ({ ...q, page }))}
        onPageSizeChange={(pageSize) => setQuery((q) => ({ ...q, pageSize, page: 0 }))}
        emptyTitle={card.emptyTitle}
        emptyBody={card.emptyBody}
      />

      {config.form && (
        <ResourceFormDialog
          config={config}
          open={openCreate}
          onClose={() => setOpenCreate(false)}
          onSaved={handleSaved}
          onError={(message) => showToast(message, 'error')}
        />
      )}

      {canEdit && (
        <ResourceFormDialog
          config={config}
          open={!!editRecord}
          record={editRecord}
          onClose={() => setEditRecord(null)}
          onSaved={handleSaved}
          onError={(message) => showToast(message, 'error')}
        />
      )}

      {/* Delete Confirmation — custom footer: NeuronModal's default footer always renders a primary confirm */}
      {list.delete && (
      <NeuronModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        variant="danger"
        size="md"
        icon={icon({ icon: 'Trash2', size: 20 })}
        title={list.delete.title}
        description={<><strong className={list.delete.strongClassName}>{deleteTarget ? String(at(deleteTarget, list.delete.strong) ?? '') : undefined}</strong> {list.delete.text}</>}
        footer={
          <div className="lab-modal-actions">
            <NeuronButton variant="secondary" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancel</NeuronButton>
            <NeuronButton variant="danger" onClick={handleDelete} loading={deleting}>{list.delete.confirmLabel}</NeuronButton>
          </div>
        }
      />
      )}

      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
