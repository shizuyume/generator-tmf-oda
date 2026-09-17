import { ReactNode } from 'react';

export interface DetailFieldProps {
  label: string;
  value?: ReactNode;
  mono?: boolean;
}

/** frontend-pattern.md §11.2 DetailField: renders nothing when empty (no "N/A" clutter). */
export function DetailField({ label, value, mono }: DetailFieldProps) {
  if (value === undefined || value === null || value === '') return null;
  return (
    <div>
      <div className="text-[0.7rem] font-bold uppercase tracking-wide text-app-brand">{label}</div>
      <div className={`mt-0.5 text-sm font-medium text-text-primary ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

export default DetailField;
