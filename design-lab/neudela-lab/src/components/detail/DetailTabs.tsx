import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

export interface DetailTab {
  key: string;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface TabsProps {
  idPrefix: string;
  ariaLabel: string;
  tabs: DetailTab[];
  value: string;
  onChange: (key: string) => void;
}

// Underlined record tabs with icon + count pill (design: "Record sections").
// NEUDELA GAP: no Tabs primitive — this is a real WAI-ARIA tablist (roving tabindex,
// ←/→/Home/End with automatic activation), replacing the NeuronButtonGroup stand-in.
export function DetailTabs({ idPrefix, ariaLabel, tabs, value, onChange }: Readonly<TabsProps>) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    const key = tabs[next].key;
    onChange(key);
    refs.current[key]?.focus();
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className="dt-tabs">
      {tabs.map((t, i) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => { refs.current[t.key] = el; }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${t.key}`}
            tabIndex={active ? 0 : -1}
            className={`dt-tab${active ? ' is-active' : ''}`}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.icon && <span className="dt-tab__icon" aria-hidden="true">{t.icon}</span>}
            {t.label}
            {t.count !== undefined && <span className="dt-tab__count">{t.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function DetailTabPanel({ idPrefix, tabKey, children }: Readonly<{ idPrefix: string; tabKey: string; children: ReactNode }>) {
  return (
    <div
      role="tabpanel"
      id={`${idPrefix}-panel-${tabKey}`}
      aria-labelledby={`${idPrefix}-tab-${tabKey}`}
      tabIndex={0}
      className="dt-panel"
    >
      {children}
    </div>
  );
}
