import { ReactNode } from 'react';

export interface AppShellProps {
  sidebar: ReactNode;
  topbar: ReactNode;
  children?: ReactNode;
  collapsed?: boolean;
}

/** Ports .app / .main / .content (max-w-1280px, mx-auto, p-6) from
 * example-component-in-dashboard.html. */
export function AppShell({ sidebar, topbar, children, collapsed }: AppShellProps) {
  return (
    <div className="min-h-screen bg-app-bg">
      {sidebar}
      <main className={`min-h-screen ${collapsed ? 'ml-16' : 'ml-60'}`}>
        {topbar}
        <div className="mx-auto max-w-[1280px] p-4">{children}</div>
      </main>
    </div>
  );
}

export default AppShell;
