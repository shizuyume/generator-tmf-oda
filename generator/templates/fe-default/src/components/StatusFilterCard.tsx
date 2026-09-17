import { Card } from './Card';

export interface StatusFilterPhase {
  value: string;
  label: string;
  count?: number;
}

export interface StatusFilterCardProps {
  phases: StatusFilterPhase[];
  activeFilter?: string;
  onFilterChange: (value: string) => void;
}

/** Generalization of frontend-pattern.md §12 LifecycleJourneyCard — status/phase filter strip
 * for a list page, WITHOUT TMF lifecycle vocabulary (doc §23: keep the generator core
 * domain-neutral). Toggle semantics preserved: clicking the active phase clears it. */
export function StatusFilterCard({ phases, activeFilter, onFilterChange }: StatusFilterCardProps) {
  return (
    <Card className="flex flex-wrap gap-2 p-3">
      {phases.map((phase) => {
        const active = phase.value === activeFilter;
        return (
          <button
            key={phase.value}
            type="button"
            onClick={() => onFilterChange(active ? '' : phase.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              active
                ? 'border-app-brand bg-app-brand-subtle text-app-brand'
                : 'border-border text-text-secondary hover:border-border-strong hover:text-text-primary'
            }`}
          >
            {phase.label}
            {typeof phase.count === 'number' && (
              <span className={`rounded-full px-1.5 text-[10px] ${active ? 'bg-app-brand/20' : 'bg-gray-200'}`}>{phase.count}</span>
            )}
          </button>
        );
      })}
    </Card>
  );
}

export default StatusFilterCard;
