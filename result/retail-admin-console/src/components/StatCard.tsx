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
  down: 'text-danger-700',
  warn: 'text-warning-700',
};

/** Ports .stat-card from example-component-in-dashboard.html. */
export function StatCard({ label, value, icon, trend, meta }: StatCardProps) {
  return (
    <Card className="p-[18px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-text-secondary">{label}</span>
        {icon && (
          <span className="grid h-[34px] w-[34px] place-items-center rounded-md bg-app-brand-subtle text-text-brand">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-2.5 text-[28px] font-semibold leading-9 tracking-tight text-text-primary">{value}</div>
      {(trend || meta) && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-text-secondary">
          {trend && <span className={TREND_CLASS[trend.direction]}>{trend.label}</span>}
          {meta && <span>{meta}</span>}
        </div>
      )}
    </Card>
  );
}

export default StatCard;
