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

// Ports .button / .button.primary / .button.tertiary / .button.danger onto the
// semantic token layer (height 36px, radius-md, border-input).
const TONE_CLASS: Record<ButtonTone, string> = {
  default: 'bg-card border border-input text-foreground hover:bg-muted',
  primary: 'bg-primary border border-primary text-primary-foreground hover:bg-primary-hover hover:border-primary-hover',
  tertiary: 'border border-transparent bg-transparent text-muted-foreground hover:bg-muted',
  danger: 'bg-destructive border border-destructive text-destructive-foreground hover:bg-destructive/90',
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
