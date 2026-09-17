import { ReactNode } from 'react';
import { Card } from './Card';

export interface SectionCardProps {
  title?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

/** frontend-pattern.md §11.4 SectionCard: grid repeat(auto-fill, minmax(220px,1fr)) of fields. */
export function SectionCard({ title, actions, children }: SectionCardProps) {
  return (
    <Card className="p-3">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h3 className="text-sm font-semibold text-text-primary">{title}</h3>}
          {actions}
        </div>
      )}
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        {children}
      </div>
    </Card>
  );
}

export default SectionCard;
