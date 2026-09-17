import { useMemo, ReactElement, ReactNode } from 'react';
import { Box } from '@mui/material';
import {
  DataGrid,
  GridColDef,
  GridFilterModel,
  GridPaginationModel,
  GridRowIdGetter,
  GridSortModel,
  GridValidRowModel,
} from '@mui/x-data-grid';

/**
 * StandardList — wrapper DataGrid COMMUNITY server-mode (verifikasi empiris M3:
 * pagination/sort/filter server GRATIS di @mui/x-data-grid community, MIT).
 * Kontrak server-mode: pagination via rowCount + onPaginationModelChange,
 * sort via onSortModelChange, filter via onFilterModelChange.
 */
export interface StandardListProps<T extends GridValidRowModel = GridValidRowModel & Record<string, unknown>> {
  columns: GridColDef<T>[];
  rows: T[];
  rowCount: number;
  pageModel: GridPaginationModel;
  sortModel: GridSortModel;
  filterModel: GridFilterModel;
  onPaginationModelChange: (model: GridPaginationModel) => void;
  onSortModelChange: (model: GridSortModel) => void;
  onFilterModelChange: (model: GridFilterModel) => void;
  loading?: boolean;
  searchField?: ReactNode;
  toolbarActions?: ReactNode;
  rowActions?: (row: T) => ReactNode;
  emptyText?: string;
  getRowId?: GridRowIdGetter<T>;
  pageSizeOptions?: number[];
  addActionColumn?: boolean;
}

export function StandardList<T extends GridValidRowModel = GridValidRowModel & Record<string, unknown>>(props: StandardListProps<T>): ReactElement {
  const {
    columns,
    rows,
    rowCount,
    pageModel,
    sortModel,
    filterModel,
    onPaginationModelChange,
    onSortModelChange,
    onFilterModelChange,
    loading = false,
    searchField,
    toolbarActions,
    rowActions,
    getRowId,
    emptyText,
  } = props;

  const cols = useMemo<GridColDef<T>[]>(() => {
    const base: GridColDef<T>[] = columns.map((col) => ({ flex: 1, minWidth: 140, ...col }));
    if (rowActions) {
      base.push({
        field: '__actions',
        headerName: '',
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        width: 140,
        renderCell: (params) => rowActions(params.row),
      });
    }
    return base;
  }, [columns, rowActions]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
      {(searchField || toolbarActions) && (
        <Box
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1,
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>{searchField}</Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>{toolbarActions}</Box>
        </Box>
      )}
      <Box sx={{ flex: 1, minHeight: 320 }}>
        <DataGrid<T>
          rows={rows}
          columns={cols}
          rowCount={rowCount}
          getRowId={getRowId}
          loading={loading}
          paginationMode="server"
          sortingMode="server"
          filterMode="server"
          paginationModel={pageModel}
          onPaginationModelChange={onPaginationModelChange}
          sortModel={sortModel}
          onSortModelChange={onSortModelChange}
          filterModel={filterModel}
          onFilterModelChange={onFilterModelChange}
          pageSizeOptions={props.pageSizeOptions ?? [10, 25, 50]}
          disableColumnMenu
          localeText={{
            noRowsLabel: emptyText ?? 'Tidak ada data',
            footerRowSelected: () => '',
          }}
          sx={{ border: 0 }}
        />
      </Box>
    </Box>
  );
}