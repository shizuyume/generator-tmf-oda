import { ReactNode } from 'react';

export interface FormFieldProps {
  label?: ReactNode;
  required?: boolean;
  helper?: ReactNode;
  error?: ReactNode;
  full?: boolean;
  children?: ReactNode;
}

/** Ports .field / .field.full / .required / .helper from example-component-in-dashboard.html. */
export function FormField({ label, required, helper, error, full, children }: FormFieldProps) {
  return (
    <div className={`grid gap-1.5 ${full ? 'col-span-full' : ''}`}>
      {label && (
        <label className="text-xs font-semibold text-text-primary">
          {label} {required && <span className="text-danger-500">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <span className="text-[11px] text-danger-500">{error}</span>
      ) : helper ? (
        <span className="text-[11px] text-text-secondary">{helper}</span>
      ) : null}
    </div>
  );
}

export default FormField;
