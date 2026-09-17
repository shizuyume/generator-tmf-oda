import { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface RefEntityCardProps {
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  onClick?: () => void;
}

/** frontend-pattern.md §11.5 RefEntityCard: compact reference-entity tile (e.g. a related
 * party/order shown inline, without navigating away). */
export function RefEntityCard({ title, subtitle, meta, onClick }: RefEntityCardProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-app-surface px-3 py-2.5 text-left text-xs ${
        onClick ? 'hover:border-border-strong hover:bg-gray-50' : ''
      }`}
    >
      <div className="min-w-0">
        <div className="truncate font-medium text-text-primary">{title}</div>
        {subtitle && <div className="truncate text-text-secondary">{subtitle}</div>}
      </div>
      <div className="flex shrink-0 items-center gap-2 text-text-secondary">
        {meta}
        {onClick && <ChevronRight size={14} />}
      </div>
    </Comp>
  );
}

export default RefEntityCard;
