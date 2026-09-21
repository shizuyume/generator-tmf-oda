import { ReactNode } from 'react';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

export interface EmptyStateProps {
  title?: string;
  colSpan?: number;
  action?: EmptyStateAction;
  children?: ReactNode;
}

/** Ports the "No employees found." empty table row. `action` (F1) renders an inline button
 * below the message — e.g. "+ Add New" when a list is empty because nothing was created yet. */
export function EmptyState({ title = 'Tidak ada data', colSpan = 1, action, children }: EmptyStateProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-8 text-center text-xs text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <span>{children ?? title}</span>
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="rounded-md border border-input px-3 py-1.5 text-[11px] font-medium text-foreground hover:bg-neutral-50"
            >
              {action.label}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export default EmptyState;
