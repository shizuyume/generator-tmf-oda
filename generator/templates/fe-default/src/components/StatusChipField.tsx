import { Badge, BadgeTone } from './Badge';

export interface StatusChipFieldProps {
  label?: string;
  status?: string;
  colorMap?: Record<string, BadgeTone>;
}

// Fallback netral (bukan TMF lifecycleStatus) — pemetaan sebenarnya datang dari
// dashboard.mjs/detail.mjs (colorMap per spec YAML). Default hanya menebak status generik.
const DEFAULT_MAP: Record<string, BadgeTone> = {
  active: 'success', approved: 'success', done: 'success', completed: 'success',
  pending: 'warning', in_progress: 'warning', held: 'warning',
  rejected: 'danger', failed: 'danger', cancelled: 'danger', error: 'danger',
};

/** frontend-pattern.md §11.3/§24: status chip color system dari status ternormalisasi. */
export function StatusChipField({ label, status, colorMap }: StatusChipFieldProps) {
  if (!status) return null;
  const key = status.toLowerCase().replace(/\s+/g, '_');
  const tone = (colorMap ?? DEFAULT_MAP)[key] ?? 'neutral';
  return (
    <div>
      {label && <div className="text-[0.7rem] font-bold uppercase tracking-wide text-app-brand">{label}</div>}
      <div className="mt-0.5">
        <Badge tone={tone}>{status}</Badge>
      </div>
    </div>
  );
}

export default StatusChipField;
