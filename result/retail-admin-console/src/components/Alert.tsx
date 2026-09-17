import { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

export type AlertSeverity = 'success' | 'error' | 'warning' | 'info';

export interface AlertProps {
  severity?: AlertSeverity;
  children?: ReactNode;
  onClose?: () => void;
}

const ICON: Record<AlertSeverity, typeof Info> = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TONE_CLASS: Record<AlertSeverity, string> = {
  success: 'bg-success-50 text-success-700 border-success-500/20',
  error: 'bg-danger-50 text-danger-700 border-danger-500/20',
  warning: 'bg-warning-50 text-warning-700 border-warning-500/20',
  info: 'bg-info-50 text-info-700 border-info-500/20',
};

/** Inline banner alert (frontend-pattern.md §7.2 error state, §20 getErrorMessage). */
export function Alert({ severity = 'info', children, onClose }: AlertProps) {
  const Icon = ICON[severity];
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-xs ${TONE_CLASS[severity]}`} role="alert">
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="flex-1">{children}</div>
      {onClose && (
        <button type="button" onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100" aria-label="Tutup">
          <XCircle size={14} />
        </button>
      )}
    </div>
  );
}

export default Alert;
