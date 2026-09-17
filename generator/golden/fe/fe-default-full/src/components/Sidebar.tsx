import { ReactNode } from 'react';

export interface SidebarProps {
  logo?: ReactNode;
  sectionLabel?: string;
  children?: ReactNode;
  bottom?: ReactNode;
  collapsed?: boolean;
}

/** Ports .sidebar / .logo-slot / .door-logo / .sidebar-section / .nav / .sidebar-bottom. */
export function Sidebar({ logo, sectionLabel, children, bottom, collapsed }: SidebarProps) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-app-surface px-3.5 py-5 transition-[width] ${
        collapsed ? 'w-16 px-2' : 'w-60'
      }`}
    >
      <div className="mb-6 flex h-10 items-center px-2.5">{logo}</div>
      {sectionLabel && !collapsed && (
        <div className="mb-1.5 mt-2.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-text-disabled">
          {sectionLabel}
        </div>
      )}
      <nav className="grid gap-0.5">{children}</nav>
      <div className="mt-auto border-t border-border pt-3">{bottom}</div>
    </aside>
  );
}

export default Sidebar;
