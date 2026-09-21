import { ReactNode } from 'react';
import { Search } from 'lucide-react';

export interface TopbarProps {
  searchPlaceholder?: string;
  right?: ReactNode;
}

/** Ports .topbar / .global-search / .top-right from example-component-in-dashboard.html. */
export function Topbar({ searchPlaceholder, right }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-(--header-h) items-center justify-between border-b border-border bg-card px-6">
      <div className="flex items-center gap-2.5">
        {searchPlaceholder !== undefined && (
          <div className="flex h-(--control-h) w-65 items-center gap-2 rounded-md border border-border bg-muted px-2.5 text-neutral-400">
            <Search size={16} />
            <input
              placeholder={searchPlaceholder}
              className="w-full border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-neutral-400"
            />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2.5">{right}</div>
    </header>
  );
}

export default Topbar;
