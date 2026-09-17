import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

export type ToastSeverity = 'success' | 'error' | 'info' | 'warning';

interface ToastState {
  message: string;
  severity: ToastSeverity;
}

interface ToastContextValue {
  show: (message: string, severity?: ToastSeverity) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICON: Record<ToastSeverity, ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error: <XCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info: <Info size={16} />,
};

/** Ports .toast/.toast-icon from example-component-in-dashboard.html (bottom-right, 2.5s
 * auto-hide, `.show` opacity/translate transition). Provider-based (like MUI Snackbar). */
export function ToastProvider({ children }: { children?: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, severity: ToastSeverity = 'info') => {
    setToast({ message, severity });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className={`fixed bottom-6 right-6 z-[200] flex items-center gap-2.5 rounded-lg border border-border bg-app-surface px-3.5 py-3 shadow-lg transition-all ${
          toast ? 'pointer-events-auto translate-y-0 opacity-100' : 'pointer-events-none translate-y-2.5 opacity-0'
        }`}
        role="alert"
      >
        {toast && (
          <>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-success-50 text-success-700">
              {ICON[toast.severity]}
            </span>
            <span className="text-[13px] text-text-primary">{toast.message}</span>
            <button type="button" onClick={() => setToast(null)} aria-label="Tutup" className="text-text-secondary">
              <X size={14} />
            </button>
          </>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam <ToastProvider>');
  return ctx;
}

export default ToastProvider;
