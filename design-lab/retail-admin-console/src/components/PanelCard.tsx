import { ReactNode } from 'react';
import { Card } from './Card';

export interface PanelCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  toolbar?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** Ports .panel + .panel-header + .panel-title/.panel-subtitle. */
export function PanelCard({ title, subtitle, toolbar, children, className = '' }: PanelCardProps) {
  return (
    <Card className={`p-4 ${className}`}>
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold leading-6 text-text-primary">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs text-text-secondary">{subtitle}</div>}
        </div>
        {toolbar}
      </div>
      {children}
    </Card>
  );
}

export default PanelCard;
