import { ButtonHTMLAttributes, ReactNode } from 'react';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  size?: 'small' | 'medium';
  title?: string;
  children?: ReactNode;
}

/** Ports .icon-button / .row-actions button from example-component-in-dashboard.html. */
export function IconButton({ size = 'medium', title, className = '', children, ...rest }: IconButtonProps) {
  const dim = size === 'small' ? 'w-7 h-7' : 'w-[34px] h-[34px]';
  return (
    <button
      type="button"
      title={title}
      className={`inline-flex items-center justify-center rounded-md border border-transparent bg-transparent text-text-secondary hover:bg-app-surface-secondary hover:text-text-primary ${dim} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export default IconButton;
