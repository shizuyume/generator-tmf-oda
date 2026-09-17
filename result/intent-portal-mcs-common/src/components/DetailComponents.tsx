import React from 'react';
import Box from '@mui/material/Box';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import ToggleButton from '@mui/material/ToggleButton';
import ViewModuleIcon from '@mui/icons-material/ViewModule';
import ViewListIcon from '@mui/icons-material/ViewList';
import CustomTypography from 'common_remote/Typography';
import CustomChip from 'common_remote/Chip';

// Brand blue (#2563eb) — matches common_remote's own button/accent color (mcs/general/common/src/config/styleConfig.ts PALETTE.brand).
const LABEL_SX = { fontSize: '0.7rem', color: '#2563eb', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: 0.8, mb: 0.5 };
const VALUE_SX = { fontSize: '1rem', color: 'text.primary', fontWeight: 500, lineHeight: 1.5 };

export function DetailField({ label, value }: Readonly<{ label: string; value?: React.ReactNode }>) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={LABEL_SX}>{label}</Box>
      {typeof value === 'string' || typeof value === 'number'
        ? <Box sx={VALUE_SX}>{value}</Box>
        : value}
    </Box>
  );
}

export function StatusChipField({ label, value }: Readonly<{ label: string; value?: string }>) {
  if (!value) return null;
  return (
    <Box sx={{ mb: 2.5 }}>
      <Box sx={LABEL_SX}>{label}</Box>
      <Box sx={{ mt: 0.5 }}>
        <CustomChip label={value} statusKey={value} size="small" />
      </Box>
    </Box>
  );
}

export function SectionCard({ title, action, children }: Readonly<{ title?: string; action?: React.ReactNode; children: React.ReactNode }>) {
  return (
    <Box sx={{ p: 2.5, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#fff', mb: 2 }}>
      {(title || action) && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            {title && <CustomTypography variant="subtitle1" sx={{ fontWeight: 700 }}>{title}</CustomTypography>}
            {action}
          </Box>
          <Box sx={{ mt: 0.5, borderBottom: '1px solid #e2e8f0' }} />
        </Box>
      )}
      {children}
    </Box>
  );
}

export type RefEntity = {
  id?: string;
  href?: string;
  name?: string;
  role?: string;
  version?: string;
  '@type'?: string;
  '@referredType'?: string;
};

export function RefEntityCard({ label, entity, onClick }: Readonly<{ label: string; entity?: RefEntity | null; onClick?: () => void }>) {
  if (!entity) return null;
  const hasContent = entity.name || entity.id || entity.role;
  if (!hasContent) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={LABEL_SX}>{label}</Box>
      <Box
        onClick={onClick}
        sx={{
          p: 2, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#f8fafc',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2,
          cursor: onClick ? 'pointer' : 'default',
          '&:hover': onClick ? { borderColor: 'primary.main', bgcolor: '#f1f5f9' } : {},
        }}
      >
        {entity.name && <Box><Box sx={{ ...LABEL_SX, mb: 0.3 }}>Name</Box><Box sx={VALUE_SX}>{entity.name}</Box></Box>}
        {entity.role && <Box><Box sx={{ ...LABEL_SX, mb: 0.3 }}>Role</Box><Box sx={VALUE_SX}>{entity.role}</Box></Box>}
        {entity['@type'] && <Box><Box sx={{ ...LABEL_SX, mb: 0.3 }}>Type</Box><Box sx={VALUE_SX}>{entity['@type']}</Box></Box>}
        {entity.id && <Box><Box sx={{ ...LABEL_SX, mb: 0.3 }}>ID</Box><Box sx={{ ...VALUE_SX, fontSize: '0.75rem', fontFamily: 'monospace' }}>{entity.id}</Box></Box>}
      </Box>
    </Box>
  );
}

export function RefEntityList({ label, items, onClickItem }: Readonly<{ label: string; items?: RefEntity[]; onClickItem?: (item: RefEntity) => void }>) {
  if (!items || items.length === 0) return null;
  return (
    <Box sx={{ mb: 2 }}>
      <Box sx={LABEL_SX}>{label}</Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 1, mt: 0.5 }}>
        {items.map((item, idx) => (
          <Box
            key={item.id ?? idx}
            onClick={onClickItem ? () => onClickItem(item) : undefined}
            sx={{
              p: 1.5, border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: '#f8fafc',
              cursor: onClickItem ? 'pointer' : 'default',
              '&:hover': onClickItem ? { borderColor: 'primary.main', bgcolor: '#f1f5f9' } : {},
            }}
          >
            {item.name && <Box sx={{ fontSize: '0.875rem', fontWeight: 500 }}>{item.name}</Box>}
            {item.role && <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Role: {item.role}</Box>}
            {item['@type'] && <Box sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>Type: {item['@type']}</Box>}
            {item.id && <Box sx={{ fontSize: '0.7rem', color: 'text.disabled', fontFamily: 'monospace', wordBreak: 'break-all' }}>{item.id}</Box>}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

export const DETAIL_GRID_SX = { display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 2 };

// ─── Card/Table view switch — reusable across any repeatable-list detail tab ────

export type ViewMode = 'card' | 'table';

export function ViewToggle({ value, onChange }: Readonly<{ value: ViewMode; onChange: (v: ViewMode) => void }>) {
  return (
    <ToggleButtonGroup
      size="small"
      value={value}
      exclusive
      onChange={(_: unknown, v: ViewMode | null) => v && onChange(v)}
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
