import { ReactNode } from 'react';
import { Search } from 'lucide-react';

export interface TopbarProps {
  searchPlaceholder?: string;
  right?: ReactNode;
}

/** Ports .topbar / .global-search / .top-right from example-component-in-dashboard.html. */
export function Topbar({ searchPlaceholder, right }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-app-surface px-4">
      <div className="flex items-center gap-2.5">
        {searchPlaceholder !== undefined && (
          <div className="flex h-9 w-[260px] items-center gap-2 rounded-md border border-border bg-app-surface-secondary px-2.5 text-text-disabled">
            <Search size={16} />
            <input
              placeholder={searchPlaceholder}
              className="w-full border-0 bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-disabled"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2.5">{right}</div>
    </header>
  );
}

export default Topbar;
