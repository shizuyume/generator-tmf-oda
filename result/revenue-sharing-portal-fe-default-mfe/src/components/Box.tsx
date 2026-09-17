import { HTMLAttributes, ReactNode } from 'react';

/** Generic layout div — used as the fallback primitive for semantics without a 1:1 component
 * (tabs segmented control, description-list, repeatable-group). Mirrors neudela's NeuronBox. */
export interface BoxProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function Box({ className = '', children, ...rest }: BoxProps) {
  return (
    <div className={className} {...rest}>
      {children}
    </div>
  );
}

export default Box;
