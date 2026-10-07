import { useCallback, useEffect, useRef, useState } from 'react';
import { NeuronAlert } from 'neudela';

// NEUDELA GAP: there is no Snackbar/Toast primitive. This stands in for the MUI-style
// Snackbar of the craco prototype: a NeuronAlert pinned bottom-right that auto-hides.

export type ToastSeverity = 'success' | 'error';

export interface ToastMessage {
  id: number;
  message: string;
  severity: ToastSeverity;
}

export function useToast() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const seq = useRef(0);

  const showToast = useCallback((message: string, severity: ToastSeverity = 'success') => {
    seq.current += 1;
    setToast({ id: seq.current, message, severity });
  }, []);

  const closeToast = useCallback(() => setToast(null), []);

  return { toast, showToast, closeToast };
}

export function Toast({
  toast,
  onClose,
  autoHideMs = 4000,
}: Readonly<{ toast: ToastMessage | null; onClose: () => void; autoHideMs?: number }>) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(onClose, autoHideMs);
    return () => clearTimeout(timer);
  }, [toast, onClose, autoHideMs]);

  if (!toast) return null;

  return (
    <div className="lab-toast" aria-live="polite">
      {/* key remounts the alert so a new message is never stuck in its dismissed state */}
      <NeuronAlert
        key={toast.id}
        variant={toast.severity === 'error' ? 'danger' : 'success'}
        title={toast.severity === 'error' ? 'Something went wrong' : toast.message}
        description={toast.severity === 'error' ? toast.message : undefined}
        dismissible
        onDismiss={onClose}
      />
    </div>
  );
}
