import { ReactNode } from 'react';

export interface SidebarProps {
  logo?: ReactNode;
  sectionLabel?: string;
  children?: ReactNode;
  bottom?: ReactNode;
  collapsed?: boolean;
}

/** Ports .sidebar / .logo-slot / .door-logo / .sidebar-section / .nav / .sidebar-bottom.
 *
 *  `transition-[width]` adalah SATU-SATUNYA nilai arbitrer yang sengaja dipertahankan di
 *  adapter ini, dan guardrail nilai-arbitrer mengecualikan `transition-[`. Alasannya:
 *  transition-property menerima NAMA PROPERTI CSS, bukan token desain, jadi tidak ada
 *  langkah skala yang bisa menggantikannya - aturan itu tidak berlaku di sini.
 *  `transition-all` bukan penggantinya: ia ikut menganimasikan background-color, sehingga
 *  setiap pergantian tema terang/gelap memudar melintasi seluruh sidebar. Menukar regresi
 *  perilaku demi menyenangkan grep bukan pertukaran yang sepadan. */
export function Sidebar({ logo, sectionLabel, children, bottom, collapsed }: SidebarProps) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-card px-3.5 py-5 transition-[width] ${
        collapsed ? 'w-16 px-2' : 'w-60'
      }`}
    >
      <div className="mb-6 flex h-10 items-center px-2.5">{logo}</div>
      {sectionLabel && !collapsed && (
        <div className="mb-1.5 mt-2.5 px-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
          {sectionLabel}
        </div>
      )}
      <nav className="grid gap-0.5">{children}</nav>
      <div className="mt-auto border-t border-border pt-3">{bottom}</div>
    </aside>
  );
}

export default Sidebar;
