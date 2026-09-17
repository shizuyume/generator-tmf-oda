import { Fragment, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  trailing?: ReactNode;
}

/** frontend-pattern.md §7.2/§9: baris pertama tiap list/detail page. Item terakhir = current
 * page (tidak clickable, warna text-primary); item sebelumnya clickable (text-secondary). */
export function Breadcrumbs({ items, trailing }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center justify-between text-xs text-text-secondary" aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 && <ChevronRight size={12} className="text-text-disabled" />}
              <li>
                {isLast || (!item.href && !item.onClick) ? (
                  <span className={isLast ? 'font-medium text-text-primary' : ''}>{item.label}</span>
                ) : (
                  <a
                    href={item.href ?? '#'}
                    onClick={item.onClick ? (e) => { e.preventDefault(); item.onClick?.(); } : undefined}
                    className="hover:text-app-brand hover:underline"
                  >
                    {item.label}
                  </a>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
      {trailing}
    </nav>
  );
}

export default Breadcrumbs;
