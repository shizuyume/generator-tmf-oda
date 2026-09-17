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
  const h = size === 'small' ? 'h-9 text-xs' : 'h-10 text-[13px]';
  return (
    <select
      className={`rounded-md border border-border-strong bg-app-surface px-2.5 text-text-secondary ${h} ${className}`}
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
