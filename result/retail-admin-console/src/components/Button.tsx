import { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonTone = 'default' | 'primary' | 'tertiary' | 'danger';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  tone?: ButtonTone;
  size?: 'sm' | 'md';
  startIcon?: ReactNode;
  endIcon?: ReactNode;
  iconOnly?: boolean;
  children?: ReactNode;
}

// Ports .button / .button.primary / .button.tertiary / .button.danger from
// example-component-in-dashboard.html (height 36px, radius-md, border-strong).
const TONE_CLASS: Record<ButtonTone, string> = {
  default: 'bg-app-surface border border-border-strong text-text-primary hover:bg-app-surface-secondary',
  primary: 'bg-app-brand border border-app-brand text-text-on-brand hover:bg-primary-700 hover:border-primary-700',
  tertiary: 'border border-transparent bg-transparent text-text-secondary hover:bg-app-surface-secondary',
  danger: 'bg-danger-500 border border-danger-500 text-white hover:brightness-95',
};

export function Button({
  tone = 'default',
  size = 'md',
  startIcon,
  endIcon,
  iconOnly,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  const h = size === 'sm' ? 'h-8 text-xs px-2.5' : 'h-9 text-[13px] px-3.5';
  const iconOnlyCls = iconOnly ? 'w-9 px-0 justify-center' : '';
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-2 rounded-md font-medium transition-colors ${h} ${iconOnlyCls} ${TONE_CLASS[tone]} ${className}`}
      {...rest}
    >
      {startIcon}
      {children}
      {endIcon}
    </button>
  );
}

export default Button;
