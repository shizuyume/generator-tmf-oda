import { memo } from 'react';
import { useForm, useFieldArray, Controller, Control } from 'react-hook-form';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';
import CustomButton from 'common_remote/Button';
import CustomDialog from 'common_remote/Dialog';
import CustomTextField from 'common_remote/TextField';
import CustomTypography from 'common_remote/Typography';
import { useDebouncedSearch } from '../../hooks/useDebouncedSearch';
import {
  searchPolicies,
  searchPolicyConditions,
  searchPolicyActions,
  searchPolicyVariables,
} from '../../service/policyLookupService';
import type { PolicyOption } from '../../service/policyLookupService';

// Brand blue (#2563eb) — matches common_remote's own button/accent color.
const SECTION_SX = {
  fontWeight: 700,
  color: '#2563eb',
  textTransform: 'uppercase' as const,
  fontSize: '0.72rem',
  letterSpacing: 0.8,
};

const ITEM_BOX_SX = {
  p: 1.5,
  border: '1px solid #e2e8f0',
  borderRadius: 1.5,
  bgcolor: '#f8fafc',
};

// TODO: CUSTOMIZE — form value shape mirrors the resource's array fields
// (policy is required, min 1 item; conditionVariable/actionVariable optional).
// id/name pairs are populated by RefAutocompleteField (search-and-select),
// never typed by hand — these ids are references into another domain's data.
export interface PartyRevSharingAlgorithmFormValues {
  name: string;
  description: string;
  policies: { id: string; name: string }[];
  conditionVariables: {
    value: string;
    policyConditionId: string;
    policyConditionName: string;
    policyConditionVariableId: string;
    policyConditionVariableName: string;
  }[];
  actionVariables: {
    value: string;
    policyActionId: string;
    policyActionName: string;
    policyActionVariableId: string;
    policyActionVariableName: string;
  }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (values: PartyRevSharingAlgorithmFormValues) => Promise<void>;
  saving: boolean;
}

// ─── Reusable relation picker — search by name, select, id+name filled together ──

function RefAutocompleteField({
  control,
  idName,
  nameName,
  label,
  placeholder,
  options,
  loading,
  onSearch,
}: Readonly<{
  control: Control<PartyRevSharingAlgorithmFormValues>;
  idName: string;
  nameName: string;
  label: string;
  placeholder?: string;
  options: PolicyOption[];
  loading: boolean;
  onSearch: (query: string) => void;
}>) {
  return (
    <Controller
      control={control}
      name={idName as any}
      render={({ field: idField }) => (
        <Controller
          control={control}
          name={nameName as any}
          render={({ field: nameField }) => (
            <Autocomplete
              size="small"
              fullWidth
              loading={loading}
              options={options}
              getOptionLabel={(opt: PolicyOption) => (opt.name ? `${opt.name} (${opt.id})` : opt.id)}
              isOptionEqualToValue={(opt: PolicyOption, val: PolicyOption) => opt.id === val.id}
              value={
                options.find((o) => o.id === idField.value) ??
                (idField.value ? { id: idField.value as string, name: (nameField.value as string) ?? '' } : null)
              }
              onInputChange={(_, value) => onSearch(value)}
              onChange={(_, selected) => {
                idField.onChange(selected?.id ?? '');
                nameField.onChange(selected?.name ?? '');
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={label}
                  size="small"
                  placeholder={placeholder}
                  slotProps={{
                    ...params.slotProps,
                    input: {
                      ...params.slotProps.input,
                      endAdornment: (
                        <>
                          {loading ? <CircularProgress size={16} /> : null}
                          {params.slotProps.input.endAdornment}
                        </>
                      ),
                    },
                  }}
                />
              )}
            />
          )}
        />
      )}
    />
  );
}

function CreatePartyRevSharingAlgorithmDialog({ open, onClose, onSave, saving }: Readonly<Props>) {
  const { control, handleSubmit, reset } = useForm<PartyRevSharingAlgorithmFormValues>({
    defaultValues: {
      name: '',
      description: '',
      policies: [{ id: '', name: '' }],
      conditionVariables: [],
      actionVariables: [],
    },
  });

  const { fields: policyFields, append: addPolicy, remove: removePolicy } = useFieldArray({ control, name: 'policies' });
  const { fields: conditionFields, append: addCondition, remove: removeCondition } = useFieldArray({ control, name: 'conditionVariables' });
  const { fields: actionFields, append: addAction, remove: removeAction } = useFieldArray({ control, name: 'actionVariables' });

  // ── Relation lookups — TODO: CUSTOMIZE once a real Policy Management service exists ──
  const policySearch = useDebouncedSearch(searchPolicies);
  const conditionSearch = useDebouncedSearch(searchPolicyConditions);
  const conditionVariableSearch = useDebouncedSearch(searchPolicyVariables);
  const actionSearch = useDebouncedSearch(searchPolicyActions);
  const actionVariableSearch = useDebouncedSearch(searchPolicyVariables);

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <CustomDialog
      open={open}
      onClose={handleClose}
      title="Create Revenue Sharing Algorithm"
      maxWidth="md"
      fullWidth
      content={
        <Box sx={{ pt: 1 }}>
          {/* ── Basic Information ── */}
          <CustomTypography variant="subtitle2" sx={SECTION_SX}>Basic Information</CustomTypography>
          <Stack spacing={2} sx={{ mt: 1.5 }}>
            <Controller
              control={control}
              name="name"
              render={({ field }) => (
                <CustomTextField label="Name *" value={field.value} onChange={field.onChange} placeholder="e.g. Standard 70/30 Split" />
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field }) => (
                <CustomTextField label="Description" value={field.value} onChange={field.onChange} multiline rows={2} />
              )}
            />
          </Stack>

          <Divider sx={{ my: 2.5 }} />

          {/* ── Policies (required, min 1) — relation, search by name ── */}
          <Stack direction="row" sx={{ mb: 1, justifyContent: 'space-between', alignItems: 'center' }}>
            <CustomTypography variant="subtitle2" sx={SECTION_SX}>
              Policies ({policyFields.length}) *
            </CustomTypography>
            <CustomButton label="+ Add Policy" variant="outlined" onClick={() => addPolicy({ id: '', name: '' })} />
          </Stack>
          <Stack spacing={1.5}>
            {policyFields.map((f, i) => (
              <Box key={f.id} sx={ITEM_BOX_SX}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1 }}>
                    <RefAutocompleteField
                      control={control}
                      idName={`policies.${i}.id`}
                      nameName={`policies.${i}.name`}
                      label="Policy *"
                      placeholder="Search policies by name..."
                      options={policySearch.options}
                      loading={policySearch.loading}
                      onSearch={policySearch.search}
                    />
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => removePolicy(i)}
                    disabled={policyFields.length <= 1}
                    sx={{ mt: 0.5, color: '#ef4444', flexShrink: 0 }}
                  >
                    ✕
                  </IconButton>
                </Stack>
              </Box>
            ))}
          </Stack>

          <Divider sx={{ my: 2.5 }} />

          {/* ── Condition Variables (optional) ── */}
          <Stack direction="row" sx={{ mb: 1, justifyContent: 'space-between', alignItems: 'center' }}>
            <CustomTypography variant="subtitle2" sx={SECTION_SX}>
              Condition Variables ({conditionFields.length})
            </CustomTypography>
            <CustomButton
              label="+ Add Condition Variable"
              variant="outlined"
              onClick={() => addCondition({
                value: '',
                policyConditionId: '',
                policyConditionName: '',
                policyConditionVariableId: '',
                policyConditionVariableName: '',
              })}
            />
          </Stack>
          <Stack spacing={1.5}>
            {conditionFields.map((f, i) => (
              <Box key={f.id} sx={{ ...ITEM_BOX_SX, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1 }}>
                    <Controller
                      control={control}
                      name={`conditionVariables.${i}.value`}
                      render={({ field }) => (
                        <CustomTextField label="Value" value={field.value} placeholder="e.g. 100" onChange={field.onChange} />
                      )}
                    />
                  </Box>
                  <IconButton size="small" onClick={() => removeCondition(i)} sx={{ mt: 0.5, color: '#ef4444', flexShrink: 0 }}>✕</IconButton>
                </Stack>
                <Stack direction="row" spacing={1.5}>
                  <Box sx={{ flex: 1 }}>
                    <RefAutocompleteField
                      control={control}
                      idName={`conditionVariables.${i}.policyConditionId`}
                      nameName={`conditionVariables.${i}.policyConditionName`}
                      label="Policy Condition"
                      placeholder="Search conditions by name..."
                      options={conditionSearch.options}
                      loading={conditionSearch.loading}
                      onSearch={conditionSearch.search}
                    />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <RefAutocompleteField
                      control={control}
                      idName={`conditionVariables.${i}.policyConditionVariableId`}
                      nameName={`conditionVariables.${i}.policyConditionVariableName`}
                      label="Condition Variable"
                      placeholder="Search variables by name..."
                      options={conditionVariableSearch.options}
                      loading={conditionVariableSearch.loading}
                      onSearch={conditionVariableSearch.search}
                    />
                  </Box>
                </Stack>
              </Box>
            ))}
            {conditionFields.length === 0 && (
              <CustomTypography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 0.5 }}>
                No condition variables.
              </CustomTypography>
            )}
          </Stack>

          <Divider sx={{ my: 2.5 }} />

          {/* ── Action Variables (optional) ── */}
          <Stack direction="row" sx={{ mb: 1, justifyContent: 'space-between', alignItems: 'center' }}>
            <CustomTypography variant="subtitle2" sx={SECTION_SX}>
              Action Variables ({actionFields.length})
            </CustomTypography>
            <CustomButton
              label="+ Add Action Variable"
              variant="outlined"
              onClick={() => addAction({
                value: '',
                policyActionId: '',
                policyActionName: '',
                policyActionVariableId: '',
                policyActionVariableName: '',
              })}
            />
          </Stack>
          <Stack spacing={1.5}>
            {actionFields.map((f, i) => (
              <Box key={f.id} sx={{ ...ITEM_BOX_SX, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                  <Box sx={{ flex: 1 }}>
                    <Controller
                      control={control}
                      name={`actionVariables.${i}.value`}
                      render={({ field }) => (
                        <CustomTextField label="Value" value={field.value} placeholder="e.g. 30" onChange={field.onChange} />
                      )}
                    />
                  </Box>
                  <IconButton size="small" onClick={() => removeAction(i)} sx={{ mt: 0.5, color: '#ef4444', flexShrink: 0 }}>✕</IconButton>
                </Stack>
                <Stack direction="row" spacing={1.5}>
                  <Box sx={{ flex: 1 }}>
                    <RefAutocompleteField
                      control={control}
                      idName={`actionVariables.${i}.policyActionId`}
                      nameName={`actionVariables.${i}.policyActionName`}
                      label="Policy Action"
                      placeholder="Search actions by name..."
                      options={actionSearch.options}
                      loading={actionSearch.loading}
                      onSearch={actionSearch.search}
                    />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <RefAutocompleteField
                      control={control}
                      idName={`actionVariables.${i}.policyActionVariableId`}
                      nameName={`actionVariables.${i}.policyActionVariableName`}
                      label="Action Variable"
                      placeholder="Search variables by name..."
                      options={actionVariableSearch.options}
                      loading={actionVariableSearch.loading}
                      onSearch={actionVariableSearch.search}
                    />
                  </Box>
                </Stack>
              </Box>
            ))}
            {actionFields.length === 0 && (
              <CustomTypography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', pl: 0.5 }}>
                No action variables.
              </CustomTypography>
            )}
          </Stack>
        </Box>
      }
      actions={
        <Stack direction="row" spacing={1}>
          <CustomButton label="Cancel" variant="outlined" onClick={handleClose} />
          <CustomButton label="Create" variant="contained" onClick={handleSubmit(onSave)} disabled={saving} />
        </Stack>
      }
    />
  );
}

export default memo(CreatePartyRevSharingAlgorithmDialog);
