import { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  children?: ReactNode;
}

/** Ports table/th/td from example-component-in-dashboard.html (.table-wrap { overflow: auto }). */
export function Table({ className = '', children, ...rest }: TableProps) {
  return (
    <div className="overflow-auto">
      <table className={`w-full min-w-200 border-collapse ${className}`} {...rest}>
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
    <tr className={`border-b border-border last:border-b-0 hover:[&>td]:bg-primary/10 ${className}`} {...rest}>
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
        className={`h-10.5 border-b border-border bg-muted px-4.5 text-left text-xs font-semibold text-muted-foreground ${className}`}
        {...(rest as ThHTMLAttributes<HTMLTableCellElement>)}
      >
        {children}
      </th>
    );
  }
  return (
    <td className={`h-14.5 border-b border-border px-4.5 text-xs text-foreground ${className}`} {...(rest as TdHTMLAttributes<HTMLTableCellElement>)}>
      {children}
    </td>
  );
}

export default Table;
