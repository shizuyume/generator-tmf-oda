import { useCallback, useEffect, useState, useRef } from 'react';
import CustomBreadcrumbs from 'common_remote/Breadcrumbs';
import CustomButton from 'common_remote/Button';
import CustomDataGrid from 'common_remote/DataGrid';
import CustomDialog from 'common_remote/Dialog';
import CustomSnackbar from 'common_remote/Snackbar';
import CustomTextField from 'common_remote/TextField';
import CustomTypography from 'common_remote/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import { listHubs, createHub, deleteHub, getErrorMessage } from '../../service';
import type { Hub_FVO, ListParams } from '../../types';

type SnackState = { open: boolean; message: string; severity: 'success' | 'error' };

const GRID_COLUMNS = [
  { key: 'id', label: 'ID', sortable: true, searchable: true },
  { key: 'callback', label: 'Callback URL', sortable: true, searchable: true },
  { key: 'query', label: 'Query Filter', sortable: false },
];

export default function HubPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [snackbar, setSnackbar] = useState<SnackState>({ open: false, message: '', severity: 'success' });

  const [queryFilter, setQueryFilter] = useState({
    page: 0,
    searchText: '',
    filterModel: { columnKey: 'id', operator: 'contains', value: '' } as { columnKey: string; operator: string; value: string },
    sortModels: [] as Array<{ columnKey: string; direction: 'asc' | 'desc' }>,
  });

  const [openCreate, setOpenCreate] = useState(false);
  const [formCallback, setFormCallback] = useState('');
  const [formQuery, setFormQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Ref to prevent DataGrid's onPageChange from overriding page reset
  const skipNextPageChange = useRef(false);

  const loadData = useCallback(async () => {
    const { page, searchText, filterModel, sortModels } = queryFilter;
    try {
      const params: ListParams = {
        offset: page * rowsPerPage,
        limit: rowsPerPage,
      };
      if (searchText) {
        params.callback = searchText;
      }
      if (filterModel.value && filterModel.columnKey) {
        params[filterModel.columnKey] = filterModel.value;
      }
      if (sortModels.length > 0) {
        params['sort'] = `${sortModels[0].columnKey}:${sortModels[0].direction.toUpperCase()}`;
      }
      const result = await listHubs(params);
      const mapped = result.data.map((item) => ({
        id: item.id,
        callback: item.callback,
        query: item.query || '-',
      }));
      setRows(mapped);
      setTotalRows(result.total);
    } catch (err) {
      setSnackbar({ open: true, message: getErrorMessage(err), severity: 'error' });
    }
  }, [queryFilter, rowsPerPage]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSearchChange = useCallback((text: string) => {
    skipNextPageChange.current = true;
    setQueryFilter(prev => ({ ...prev, searchText: text, page: 0 }));
  }, []);

  const handleFilterChange = useCallback((model: { columnKey: string; operator: string; value: string }) => {
    skipNextPageChange.current = true;
    setQueryFilter(prev => ({ ...prev, filterModel: model, page: 0 }));
  }, []);

  const handleSortChange = useCallback((models: Array<{ columnKey: string; direction: 'asc' | 'desc' }>) => {
    skipNextPageChange.current = true;
    setQueryFilter(prev => ({ ...prev, sortModels: models, page: 0 }));
  }, []);

  const handlePageChange = useCallback((newPage: number) => {
    if (skipNextPageChange.current) {
      skipNextPageChange.current = false;
      return;
    }
    setQueryFilter(prev => ({ ...prev, page: newPage }));
  }, []);

  const handleCreate = async () => {
    if (!formCallback.trim()) return;
    setSaving(true);
    try {
      const body: Hub_FVO = { callback: formCallback.trim() };
      if (formQuery.trim()) {
        body.query = formQuery.trim();
      }
      await createHub(body);
      setSnackbar({ open: true, message: 'Subscription created', severity: 'success' });
      setOpenCreate(false);
      setFormCallback('');
      setFormQuery('');
      await loadData();
    } catch (err) {
      setSnackbar({ open: true, message: getErrorMessage(err), severity: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteHub(deleteTarget);
      setSnackbar({ open: true, message: 'Subscription removed', severity: 'success' });
      setDeleteTarget(null);
      await loadData();
    } catch (err) {
      setSnackbar({ open: true, message: getErrorMessage(err), severity: 'error' });
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <CustomBreadcrumbs
        items={[
          { label: 'Revenue Sharing Algorithm' },
          { label: 'Event Hub' },
        ]}
      />

      <Stack direction="row" sx={{ mt: 2, mb: 2, justifyContent: 'space-between', alignItems: 'center' }}>
        <CustomTypography variant="h5">
          Event Hub Subscriptions
        </CustomTypography>
        <CustomButton
          label="New Subscription"
          variant="contained"
          onClick={() => setOpenCreate(true)}
        />
      </Stack>

      <CustomDataGrid
        title="Subscriptions"
        columns={GRID_COLUMNS}
        rows={rows}
        mode="server"
        totalRows={totalRows}
        page={queryFilter.page}
        rowsPerPage={rowsPerPage}
        onPageChange={handlePageChange}
        onRowsPerPageChange={setRowsPerPage}
        onSearchTextChange={handleSearchChange}
        onDelete={(row: any) => setDeleteTarget(row.id)}
        actionVariant="inline"
        onRefresh={loadData}
        onFilterModelChange={handleFilterChange}
        onSortModelsChange={handleSortChange}
      />

      {/* Create Dialog */}
      <CustomDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        title="Create Event Subscription"
        maxWidth="sm"
        fullWidth
        content={
          <Stack spacing={2} sx={{ pt: 1 }}>
            <CustomTextField
              label="Callback URL"
              value={formCallback}
              onChange={setFormCallback}
              required
              placeholder="https://your-server.com/webhook"
            />
            <CustomTextField
              label="Query Filter (optional)"
              value={formQuery}
              onChange={setFormQuery}
              multiline
              rows={3}
              placeholder="eventType=partyRevSharingAlgorithmStateChangeEvent"
              helperText="Filter events by type or criteria"
            />
          </Stack>
        }
        actions={
          <Stack direction="row" spacing={1}>
            <CustomButton label="Cancel" variant="outlined" onClick={() => setOpenCreate(false)} />
            <CustomButton label="Subscribe" variant="contained" onClick={handleCreate} disabled={saving || !formCallback.trim()} />
          </Stack>
        }
      />

      {/* Delete Confirmation */}
      <CustomDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove Subscription"
        content={
          <CustomTypography>
            Are you sure you want to remove this event subscription?
          </CustomTypography>
        }
        actions={
          <Stack direction="row" spacing={1}>
            <CustomButton label="Cancel" variant="outlined" onClick={() => setDeleteTarget(null)} />
            <CustomButton label="Remove" variant="contained" color="error" onClick={handleDelete} />
          </Stack>
        }
      />

      <CustomSnackbar
        open={snackbar.open}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        message={snackbar.message}
        severity={snackbar.severity}
      />
    </Box>
  );
}
