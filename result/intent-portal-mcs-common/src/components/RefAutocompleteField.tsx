import { Controller, Control } from 'react-hook-form';
import TextField from '@mui/material/TextField';
import Autocomplete from '@mui/material/Autocomplete';
import CircularProgress from '@mui/material/CircularProgress';

export interface RefOption {
  id: string;
  name: string;
  href?: string;
}

/**
 * Reusable relation picker — search by name, select, id (+ optional paired name field)
 * filled together. Never lets the user type an id by hand: ids here are relations into
 * another domain's data, resolved by searching a lookup service (see
 * service/<resource>LookupService.ts, generated per distinct relation source).
 */
export function RefAutocompleteField({
  control,
  idName,
  nameName,
  label,
  placeholder,
  options,
  loading,
  onSearch,
}: Readonly<{
  control: Control<any>;
  idName: string;
  /** Sibling field that also receives the selected option's label — optional (single-field relations omit it). */
  nameName?: string;
  label: string;
  placeholder?: string;
  options: RefOption[];
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
          name={(nameName ?? idName) as any}
          render={({ field: nameField }) => (
            <Autocomplete
              size="small"
              fullWidth
              loading={loading}
              options={options}
              getOptionLabel={(opt: RefOption) => (opt.name ? `${opt.name} (${opt.id})` : opt.id)}
              isOptionEqualToValue={(opt: RefOption, val: RefOption) => opt.id === val.id}
              value={
                options.find((o) => o.id === idField.value) ??
                (idField.value ? { id: idField.value as string, name: (nameName ? nameField.value : '') as string } : null)
              }
              onInputChange={(_, value) => onSearch(value)}
              onChange={(_, selected) => {
                idField.onChange(selected?.id ?? '');
                if (nameName) nameField.onChange(selected?.name ?? '');
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
