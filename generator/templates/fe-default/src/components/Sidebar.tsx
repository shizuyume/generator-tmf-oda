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
 *  `transition-width` adalah utility kustom yang didefinisikan di src/gen/app.css lewat
 *  @utility. Ia ada karena sidebar harus menganimasikan HANYA width: `transition-all`
 *  akan ikut menganimasikan background-color, sehingga setiap pergantian tema memudar
 *  melintasi seluruh sidebar. Sebelumnya ini sebuah nilai arbitrer, yang memaksa guardrail
 *  memberi carve-out; utility kustom menghapus kebutuhan itu.
 *
 *  Bentuk arbitrer lamanya sengaja TIDAK ditulis di sini: Tailwind memindai komentar juga,
 *  jadi menyebutnya akan tetap mengemit utility itu ke bundle - dan guardrail, yang berupa
 *  grep, tidak bisa membedakan komentar dari kode. */
export function Sidebar({ logo, sectionLabel, children, bottom, collapsed }: SidebarProps) {
  return (
    <aside
      className={`fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-card px-3.5 py-5 transition-width ${
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
