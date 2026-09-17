import { useCallback, useEffect, useState } from 'react';
import CustomBreadcrumbs from 'common_remote/Breadcrumbs';
import CustomButton from 'common_remote/Button';
import CustomSnackbar from 'common_remote/Snackbar';
import CustomTypography from 'common_remote/Typography';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import PillTabs from 'common_remote/PillTabs';
import {
  DetailField,
  SectionCard,
  RefEntityList,
  DETAIL_GRID_SX,
} from '../../components/DetailComponents';
import { getPartyRevSharingAlgorithm, getErrorMessage } from '../../service';
import type {
  PartyRevSharingAlgorithm,
  PolicyRef,
  PartyRevSharingPolicyConditionVariable,
  PartyRevSharingPolicyActionVariable,
} from '../../types';

type SnackState = { open: boolean; message: string; severity: 'success' | 'error' };
type ViewMode = 'card' | 'table';

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

// ─── Card/Table view switch — reusable across any repeatable-list tab ──────────

function ViewToggle({ value, onChange }: Readonly<{ value: ViewMode; onChange: (v: ViewMode) => void }>) {
  return (
    <ToggleButtonGroup
      size="small"
      value={value}
      exclusive
      onChange={(_, v: ViewMode | null) => v && onChange(v)}
    >
      <ToggleButton value="card" aria-label="Card view">
        <ViewModuleIcon fontSize="small" />
      </ToggleButton>
      <ToggleButton value="table" aria-label="Table view">
        <ViewListIcon fontSize="small" />
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

function PolicyTable({ items }: Readonly<{ items: PolicyRef[] }>) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Version</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((p, idx) => (
            <TableRow key={p.id ?? idx}>
              <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.id}</TableCell>
              <TableCell>{p.name ?? '-'}</TableCell>
              <TableCell>{p.version ?? '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ConditionVariableTable({ items }: Readonly<{ items: PartyRevSharingPolicyConditionVariable[] }>) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Value</TableCell>
            <TableCell>Policy Condition</TableCell>
            <TableCell>Condition Variable</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((cv, idx) => (
            <TableRow key={idx}>
              <TableCell>{cv.value ?? '-'}</TableCell>
              <TableCell>{cv.policyCondition?.name ?? cv.policyCondition?.id ?? '-'}</TableCell>
              <TableCell>{cv.policyConditionVariable?.name ?? cv.policyConditionVariable?.id ?? '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function ActionVariableTable({ items }: Readonly<{ items: PartyRevSharingPolicyActionVariable[] }>) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Value</TableCell>
            <TableCell>Policy Action</TableCell>
            <TableCell>Action Variable</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((av, idx) => (
            <TableRow key={idx}>
              <TableCell>{av.value ?? '-'}</TableCell>
              <TableCell>{av.policyAction?.name ?? av.policyAction?.id ?? '-'}</TableCell>
              <TableCell>{av.policyActionVariable?.name ?? av.policyActionVariable?.id ?? '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

interface Props {
  id: string;
  onBack: () => void;
}

export default function PartyRevSharingAlgorithmDetailPage({ id, onBack }: Readonly<Props>) {
  const [data, setData] = useState<PartyRevSharingAlgorithm | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  const [snackbar, setSnackbar] = useState<SnackState>({ open: false, message: '', severity: 'success' });

  // TODO: CUSTOMIZE — one view-mode state per repeatable-list tab.
  const [policyView, setPolicyView] = useState<ViewMode>('card');
  const [conditionView, setConditionView] = useState<ViewMode>('card');
  const [actionView, setActionView] = useState<ViewMode>('card');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getPartyRevSharingAlgorithm(id);
      setData(result);
    } catch (err) {
      setSnackbar({ open: true, message: getErrorMessage(err), severity: 'error' });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  if (loading) {
    return <Box sx={{ p: 3 }}><CustomTypography>Loading...</CustomTypography></Box>;
  }

  if (!data) {
    return (
      <Box sx={{ p: 3 }}>
        <CustomButton label="← Back" variant="text" onClick={onBack} />
        <CustomTypography color="error">Revenue sharing algorithm not found</CustomTypography>
      </Box>
    );
  }

  // --- TAB: Overview ---
  const overviewTab = (
    <SectionCard title="General Information">
      <Box sx={DETAIL_GRID_SX}>
        <DetailField label="ID" value={data.id} />
        <DetailField label="Name" value={data.name} />
        <DetailField label="Description" value={data.description} />
        <DetailField label="Created Date" value={formatDateTime(data.createdDate)} />
        <DetailField label="Last Update" value={formatDateTime(data.lastUpdate)} />
      </Box>
    </SectionCard>
  );

  // --- TAB: Policies ---
  const policies = data.policy ?? [];
  const policyTab = (
    <SectionCard title="Policies" action={<ViewToggle value={policyView} onChange={setPolicyView} />}>
      {policies.length === 0 ? (
        <CustomTypography variant="body2" color="text.secondary">No policies.</CustomTypography>
      ) : policyView === 'card' ? (
        <RefEntityList label={`Policy (${policies.length})`} items={policies} />
      ) : (
        <PolicyTable items={policies} />
      )}
    </SectionCard>
  );

  // --- TAB: Condition Variables ---
  const conditionVariables = data.conditionVariable ?? [];
  const conditionTab = (
    <SectionCard title="Condition Variables" action={<ViewToggle value={conditionView} onChange={setConditionView} />}>
      {conditionVariables.length === 0 ? (
        <CustomTypography variant="body2" color="text.secondary">No condition variables.</CustomTypography>
      ) : conditionView === 'card' ? (
        <Stack spacing={1.5}>
          {conditionVariables.map((cv, idx) => (
            <Box key={idx} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#f8fafc' }}>
              <Box sx={DETAIL_GRID_SX}>
                <DetailField label="Value" value={cv.value} />
                <DetailField label="Policy Condition" value={cv.policyCondition?.name ?? cv.policyCondition?.id} />
                <DetailField label="Condition Variable" value={cv.policyConditionVariable?.name ?? cv.policyConditionVariable?.id} />
              </Box>
            </Box>
          ))}
        </Stack>
      ) : (
        <ConditionVariableTable items={conditionVariables} />
      )}
    </SectionCard>
  );

  // --- TAB: Action Variables ---
  const actionVariables = data.actionVariable ?? [];
  const actionTab = (
    <SectionCard title="Action Variables" action={<ViewToggle value={actionView} onChange={setActionView} />}>
      {actionVariables.length === 0 ? (
        <CustomTypography variant="body2" color="text.secondary">No action variables.</CustomTypography>
      ) : actionView === 'card' ? (
        <Stack spacing={1.5}>
          {actionVariables.map((av, idx) => (
            <Box key={idx} sx={{ p: 2, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#f8fafc' }}>
              <Box sx={DETAIL_GRID_SX}>
                <DetailField label="Value" value={av.value} />
                <DetailField label="Policy Action" value={av.policyAction?.name ?? av.policyAction?.id} />
                <DetailField label="Action Variable" value={av.policyActionVariable?.name ?? av.policyActionVariable?.id} />
              </Box>
            </Box>
          ))}
        </Stack>
      ) : (
        <ActionVariableTable items={actionVariables} />
      )}
    </SectionCard>
  );

  const tabs = [
    { label: 'Overview', icon: '📋', content: overviewTab },
    { label: `Policies (${policies.length})`, icon: '📜', content: policyTab },
    { label: `Condition Variables (${conditionVariables.length})`, icon: '🔀', content: conditionTab },
    { label: `Action Variables (${actionVariables.length})`, icon: '⚙️', content: actionTab },
  ];

  return (
    <Box sx={{ p: 3 }}>
      <CustomBreadcrumbs
        items={[
          { label: 'Revenue Sharing Algorithm', onClick: onBack },
          { label: data.name },
        ]}
      />

      <Stack direction="row" spacing={1.25} sx={{ mt: 2 }}>
        <CustomButton label="← Back to List" onClick={onBack} variant="outlined" />
      </Stack>

      <Box sx={{ mt: 2, mb: 1 }}>
        <CustomTypography variant="h5">{data.name}</CustomTypography>
      </Box>

      <Box sx={{ mt: 2 }}>
        <PillTabs tabs={tabs} value={activeTab} onChange={setActiveTab} />
      </Box>

      <CustomSnackbar
        open={snackbar.open}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        message={snackbar.message}
        severity={snackbar.severity}
      />
    </Box>
  );
}
