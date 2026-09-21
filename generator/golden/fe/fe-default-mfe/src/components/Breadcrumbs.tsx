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
 * page (tidak clickable, memakai warna foreground); item sebelumnya clickable dan memakai
 * warna muted. Nama kelasnya sengaja tidak ditulis harfiah: Tailwind memindai komentar,
 * jadi menyebut sebuah kelas di sini mengemit aturannya ke setiap bundle. */
export function Breadcrumbs({ items, trailing }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center justify-between text-xs text-muted-foreground" aria-label="Breadcrumb">
      <ol className="flex items-center gap-1.5">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 && <ChevronRight size={12} className="text-neutral-400" />}
              <li>
                {isLast || (!item.href && !item.onClick) ? (
                  <span className={isLast ? 'font-medium text-foreground' : ''}>{item.label}</span>
                ) : (
                  <a
                    href={item.href ?? '#'}
                    onClick={item.onClick ? (e) => { e.preventDefault(); item.onClick?.(); } : undefined}
                    className="hover:text-primary hover:underline"
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
