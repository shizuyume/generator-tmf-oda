import { HTMLAttributes, ReactNode } from 'react';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

/** Ports .card from example-component-in-dashboard.html (radius-xl, elevasi terendah, border semantik). */
export function Card({ className = '', children, ...rest }: CardProps) {
  return (
    <div className={`rounded-xl border border-border bg-card shadow-1 ${className}`} {...rest}>
      {children}
    </div>
  );
}

export default Card;
