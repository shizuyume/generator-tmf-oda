import { ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
}

/** Pill tab navigation (frontend-pattern.md §10: PillTabs). Netral — tanpa emoji/icon lib
 * wajib; `icon` opsional (mis. lucide icon dari caller). Label memuat count bila `count` diisi
 * (pola derivasi tab: tiap array-of-object di API = satu tab, label "Label (n)"). */
export function Tabs({ items, value, onChange }: TabsProps) {
  return (
    <div role="tablist" className="flex flex-wrap gap-1 rounded-lg border border-border bg-gray-50 p-1">
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? 'bg-app-surface text-app-brand shadow-xs' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {item.icon}
            {item.label}
            {typeof item.count === 'number' && (
              <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-app-brand-subtle text-app-brand' : 'bg-gray-200 text-text-secondary'}`}>
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Tabs;
