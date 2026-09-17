import { ReactNode } from 'react';

export interface FormGridProps {
  children?: ReactNode;
}

/** Ports .form-grid (2-column grid, collapses to 1 column on small screens). */
export function FormGrid({ children }: FormGridProps) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

export default FormGrid;
