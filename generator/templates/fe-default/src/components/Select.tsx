import { SelectHTMLAttributes } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'small' | 'medium';
  options?: SelectOption[];
  placeholder?: string;
}

/** Ports .select from example-component-in-dashboard.html. */
export function Select({ size = 'medium', options = [], placeholder, className = '', children, ...rest }: SelectProps) {
  // `small` = tinggi TETAP di luar sistem densitas; rasionalisasinya di TextInput.tsx.
  const h = size === 'small' ? 'h-8 text-xs' : 'h-(--control-h) text-sm';
  return (
    <select
      className={`rounded-md border border-input bg-card px-2.5 text-muted-foreground ${h} ${className}`}
      {...rest}
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
      {children}
    </select>
  );
}

export default Select;
