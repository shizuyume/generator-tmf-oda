import { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** Ports .card from example-component-in-dashboard.html (radius-xl, shadow-xs, border-default). */
export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div className={`rounded-xl border border-border bg-app-surface shadow-xs ${className}`} {...rest}>
      {children}
    </div>
  );
}

export default Card;
