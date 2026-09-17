import { ReactNode, useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  width?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

const WIDTH_CLASS: Record<string, string> = {
  xs: 'max-w-[360px]',
  sm: 'max-w-[480px]',
  md: 'max-w-[600px]',
  lg: 'max-w-[760px]',
  xl: 'max-w-[960px]',
};

/** Ports .modal-backdrop/.modal/.modal-header/.modal-body/.modal-footer. ESC + backdrop-click
 * to close (matches document.getElementById('modal').addEventListener('click', ...) in the HTML). */
export function Modal({ open, title, onClose, children, footer, width = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(16,24,40,0.42)] p-4 backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[85vh] w-full ${WIDTH_CLASS[width]} flex-col rounded-lg border border-border bg-app-surface shadow-md`}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <div className="text-lg font-semibold text-text-primary">{title}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="grid h-8 w-8 place-items-center rounded-md text-text-secondary hover:bg-gray-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-border p-3">{footer}</div>}
      </div>
    </div>
  );
}

export default Modal;
