import { ReactNode } from 'react';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface BadgeProps {
  tone?: BadgeTone;
  size?: 'sm' | 'md';
  dot?: boolean;
  children?: ReactNode;
}

// Ports .badge / .badge.success|warning|danger|neutral.
const TONE_CLASS: Record<BadgeTone, string> = {
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  danger: 'bg-destructive/10 text-destructive',
  neutral: 'bg-neutral-100 text-muted-foreground',
};

export function Badge({ tone = 'neutral', size = 'md', dot = false, children }: BadgeProps) {
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-xs';
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad} ${TONE_CLASS[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export default Badge;
