import { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export interface NavItemProps {
  to: string;
  icon?: ReactNode;
  label: ReactNode;
  active?: boolean;
  collapsed?: boolean;
}

/** Ports .nav-item / .nav-item.active / .nav-icon / .nav-label. */
export function NavItem({ to, icon, label, active, collapsed }: NavItemProps) {
  return (
    <Link
      to={to}
      className={`flex h-10 items-center gap-2.5 rounded-md px-2.5 text-[13px] transition-colors ${
        collapsed ? 'justify-center px-0' : ''
      } ${active ? 'bg-app-brand text-text-on-brand' : 'text-text-secondary hover:bg-app-surface-secondary hover:text-text-primary'}`}
    >
      {icon && <span className="w-5 text-center opacity-90">{icon}</span>}
      {!collapsed && <span>{label}</span>}
    </Link>
  );
}

export default NavItem;
