import { useCallback, useEffect, useState, useRef } from 'react';
import CustomBreadcrumbs from 'common_remote/Breadcrumbs';
import CustomButton from 'common_remote/Button';
import CustomDataGrid from 'common_remote/DataGrid';
import CustomDialog from 'common_remote/Dialog';
import CustomSnackbar from 'common_remote/Snackbar';
import CustomTypography from 'common_remote/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import PartyRevSharingAlgorithmDetailPage from './PartyRevSharingAlgorithmDetailPage';
import CreatePartyRevSharingAlgorithmDialog from './CreatePartyRevSharingAlgorithmDialog';
import type { PartyRevSharingAlgorithmFormValues } from './CreatePartyRevSharingAlgorithmDialog';
import {
  listPartyRevSharingAlgorithms,
  createPartyRevSharingAlgorithm,
  deletePartyRevSharingAlgorithm,
  getErrorMessage,
} from '../../service';
import type {
  PartyRevSharingAlgorithm_FVO,
  ListParams,
} from '../../types';

type SnackState = { open: boolean; message: string; severity: 'success' | 'error' };

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString();
}

const GRID_COLUMNS = [
  { key: 'id', label: 'ID', sortable: true, searchable: true },
  { key: 'name', label: 'Name', sortable: true, searchable: true },
  { key: 'description', label: 'Description', sortable: true, searchable: true },
  { key: 'policyCount', label: 'Policies', sortable: false },
  { key: 'lastUpdate', label: 'Last Update', sortable: true },
];

// ─── Validation helper ────────────────────────────────────────────────────────

function validatePartyRevSharingAlgorithmForm(values: PartyRevSharingAlgorithmFormValues): string | null {
  if (!values.name.trim()) return 'Name is required';
  const validPolicies = values.policies.filter((p) => p.id.trim());
  if (validPolicies.length === 0) return 'At least one policy with an ID is required';
  return null;
}

// ─── Payload builder ────────────────────────────────────────────────────────

function buildPartyRevSharingAlgorithmPayload(values: PartyRevSharingAlgorithmFormValues): PartyRevSharingAlgorithm_FVO {
  const payload: PartyRevSharingAlgorithm_FVO = {
    '@type': 'PartyRevSharingAlgorithm',
    name: values.name.trim(),
    policy: values.policies
      .filter((p) => p.id.trim())
      .map((p) => ({
        id: p.id.trim(),
        ...(p.name.trim() ? { name: p.name.trim() } : {}),
        '@type': 'PolicyRef',
      })),
  };
  if (values.description.trim()) {
    payload.description = values.description.trim();
  }
  const conditionVariable = values.conditionVariables
    .filter((cv) => cv.value.trim() || cv.policyConditionId.trim() || cv.policyConditionVariableId.trim())
    .map((cv) => ({
      ...(cv.value.trim() ? { value: cv.value.trim() } : {}),
      ...(cv.policyConditionId.trim()
        ? { policyCondition: { id: cv.policyConditionId.trim(), ...(cv.policyConditionName.trim() ? { name: cv.policyConditionName.trim() } : {}), '@type': 'PolicyConditionRef' } }
        : {}),
      ...(cv.policyConditionVariableId.trim()
        ? { policyConditionVariable: { id: cv.policyConditionVariableId.trim(), ...(cv.policyConditionVariableName.trim() ? { name: cv.policyConditionVariableName.trim() } : {}), '@type': 'PolicyVariableRef' } }
        : {}),
    }));
  if (conditionVariable.length > 0) {
    payload.conditionVariable = conditionVariable;
  }
  const actionVariable = values.actionVariables
    .filter((av) => av.value.trim() || av.policyActionId.trim() || av.policyActionVariableId.trim())
    .map((av) => ({
      ...(av.value.trim() ? { value: av.value.trim() } : {}),
      ...(av.policyActionId.trim()
        ? { policyAction: { id: av.policyActionId.trim(), ...(av.policyActionName.trim() ? { name: av.policyActionName.trim() } : {}), '@type': 'PolicyActionRef' } }
        : {}),
      ...(av.policyActionVariableId.trim()
        ? { policyActionVariable: { id: av.policyActionVariableId.trim(), ...(av.policyActionVariableName.trim() ? { name: av.policyActionVariableName.trim() } : {}), '@type': 'PolicyVariableRef' } }
        : {}),
    }));
  if (actionVariable.length > 0) {
    payload.actionVariable = actionVariable;
  }
  return payload;
}

export default function PartyRevSharingAlgorithmPage() {
  const [detailId, setDetailId] = useState<string | null>(null);

  if (detailId) {
    return <PartyRevSharingAlgorithmDetailPage id={detailId} onBack={() => setDetailId(null)} />;
  }

  return <PartyRevSharingAlgorithmListPage onViewDetail={setDetailId} />;
}

function PartyRevSharingAlgorithmListPage({ onViewDetail }: Readonly<{ onViewDetail: (id: string) => void }>) {
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
        params['name'] = searchText;
      }
      if (filterModel.value && filterModel.columnKey) {
        params[filterModel.columnKey] = filterModel.value;
      }
      if (sortModels.length > 0) {
        params['sort'] = `${sortModels[0].columnKey}:${sortModels[0].direction.toUpperCase()}`;
      }
      const result = await listPartyRevSharingAlgorithms(params);
      const mapped = result.data.map((item) => ({
        id: item.id,
        name: item.name,
        description: item.description ?? '-',
        policyCount: item.policy?.length ?? 0,
        lastUpdate: formatDate(item.lastUpdate),
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

  const handleCreate = useCallback(async (values: PartyRevSharingAlgorithmFormValues) => {
    setSaving(true);
    try {
      const validationError = validatePartyRevSharingAlgorithmForm(values);
      if (validationError) {
        setSnackbar({ open: true, message: validationError, severity: 'error' });
        return;
      }
      const payload = buildPartyRevSharingAlgorithmPayload(values);
      await createPartyRevSharingAlgorithm(payload);
      setSnackbar({ open: true, message: 'Revenue sharing algorithm created successfully', severity: 'success' });
      setOpenCreate(false);
      await loadData();
    } catch (err) {
      setSnackbar({ open: true, message: getErrorMessage(err), severity: 'error' });
    } finally {
      setSaving(false);
    }
  }, [loadData]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePartyRevSharingAlgorithm(deleteTarget);
      setSnackbar({ open: true, message: 'Deleted successfully', severity: 'success' });
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
        ]}
      />

      <Stack direction="row" sx={{ mt: 2, mb: 2, justifyContent: 'space-between', alignItems: 'center' }}>
        <CustomTypography variant="h5">
          Party Revenue Sharing Algorithms
        </CustomTypography>
        <CustomButton
          label="New Algorithm"
          variant="contained"
          onClick={() => setOpenCreate(true)}
        />
      </Stack>

      <CustomDataGrid
        title="Revenue Sharing Algorithms"
        columns={GRID_COLUMNS}
        rows={rows}
        mode="server"
        totalRows={totalRows}
        page={queryFilter.page}
        rowsPerPage={rowsPerPage}
        onPageChange={handlePageChange}
        onRowsPerPageChange={setRowsPerPage}
        onSearchTextChange={handleSearchChange}
        onView={(row: any) => onViewDetail(row.id)}
        onDelete={(row: any) => setDeleteTarget(row.id)}
        actionVariant="inline"
        onRefresh={loadData}
        onFilterModelChange={handleFilterChange}
        onSortModelsChange={handleSortChange}
      />

      <CreatePartyRevSharingAlgorithmDialog
        open={openCreate}
        onClose={() => setOpenCreate(false)}
        onSave={handleCreate}
        saving={saving}
      />

      {/* Delete Confirmation */}
      <CustomDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Revenue Sharing Algorithm"
        content={
          <CustomTypography>
            Are you sure you want to delete this revenue sharing algorithm? This action cannot be undone.
          </CustomTypography>
        }
        actions={
          <Stack direction="row" spacing={1}>
            <CustomButton label="Cancel" variant="outlined" onClick={() => setDeleteTarget(null)} />
            <CustomButton label="Delete" variant="contained" color="error" onClick={handleDelete} />
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
