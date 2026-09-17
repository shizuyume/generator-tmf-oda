import { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children?: ReactNode;
}

/** Ports table/th/td from example-component-in-dashboard.html (.table-wrap { overflow: auto }). */
export function Table({ className = '', children, ...rest }: TableProps) {
  return (
    <div className="overflow-auto">
      <table className={`w-full min-w-[800px] border-collapse ${className}`} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function TableHead({ children }: { children?: ReactNode }) {
  return <thead>{children}</thead>;
}

export function TableBody({ children }: { children?: ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TableRow({ children, className = '', ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`border-b border-border last:border-b-0 hover:[&>td]:bg-app-brand-subtle ${className}`} {...rest}>
      {children}
    </tr>
  );
}

export function TableCell({
  children,
  header,
  className = '',
  ...rest
}: (TdHTMLAttributes<HTMLTableCellElement> | ThHTMLAttributes<HTMLTableCellElement>) & { header?: boolean }) {
  if (header) {
    return (
      <th
        className={`h-9 border-b border-border bg-app-surface-secondary px-3 text-left text-[11px] font-semibold text-text-secondary ${className}`}
        {...(rest as ThHTMLAttributes<HTMLTableCellElement>)}
      >
        {children}
      </th>
    );
  }
  return (
    <td className={`h-11 border-b border-border px-3 text-xs text-text-primary ${className}`} {...(rest as TdHTMLAttributes<HTMLTableCellElement>)}>
      {children}
    </td>
  );
}

export default Table;
