import { InputHTMLAttributes } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: string;
}

/** Native checkbox, styled with token colors (no external dependency). */
export function Checkbox({ label, className = '', id, ...rest }: CheckboxProps) {
  return (
    <label htmlFor={id} className="inline-flex items-center gap-2 text-sm text-foreground">
      <input
        id={id}
        type="checkbox"
        className={`h-4 w-4 rounded border-input text-primary focus:ring-ring ${className}`}
        {...rest}
      />
      {label && <span>{label}</span>}
    </label>
  );
}

export default Checkbox;
