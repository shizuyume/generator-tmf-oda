import { ReactNode } from 'react';
import { Card } from './Card';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  trend?: { direction: 'up' | 'down' | 'warn'; label: string };
  meta?: string;
}

const TREND_CLASS: Record<string, string> = {
  up: 'text-success-700',
  down: 'text-destructive',
  warn: 'text-warning-700',
};

/** Ports .stat-card from example-component-in-dashboard.html. */
export function StatCard({ label, value, icon, trend, meta }: StatCardProps) {
  return (
    <Card className="p-4.5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        {icon && (
          <span className="grid h-8.5 w-8.5 place-items-center rounded-md bg-primary/10 text-primary">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2.5 text-3xl font-semibold leading-9 tracking-tight tabular text-foreground">{value}</div>
      {(trend || meta) && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          {trend && <span className={TREND_CLASS[trend.direction]}>{trend.label}</span>}
          {meta && <span>{meta}</span>}
        </div>
      )}
    </Card>
  );
}

export default StatCard;
