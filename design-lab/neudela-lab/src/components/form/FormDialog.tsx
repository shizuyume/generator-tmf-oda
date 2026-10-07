import { useEffect, useRef } from 'react';
import type { FormEventHandler, ReactNode } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { NeuronAlert, NeuronButton, NeuronModal } from 'neudela';
import './Form.css';

// Create / edit form in a dialog, after the Neudela Logistics Dashboard "Create shipment"
// form: title + description, a scrolling body, and a footer with Cancel + the primary action
// sharing the width. No ✕ in the corner — Cancel (or Escape) closes it.

interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  formId: string;
  submitLabel: string;
  submitting: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
  /** Fields currently in error after a submit attempt; > 0 shows the summary. */
  errorCount: number;
  /** Bumps on every failed submit so the summary takes focus again. */
  submitAttempt: number;
  /** 'wide' (760px) for forms with repeatable groups; 'narrow' (520px) for a few fields. */
  width?: 'wide' | 'narrow';
  children: ReactNode;
}

export function FormDialog({
  open,
  onClose,
  title,
  description,
  formId,
  submitLabel,
  submitting,
  onSubmit,
  errorCount,
  submitAttempt,
  width = 'wide',
  children,
}: Readonly<FormDialogProps>) {
  const summaryRef = useRef<HTMLDivElement>(null);

  // move focus to the summary after a failed submit (screen readers hear the count)
  useEffect(() => {
    if (submitAttempt > 0 && errorCount > 0) summaryRef.current?.focus();
    // only on a new attempt, not while the user fixes fields
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitAttempt]);

  return (
    <NeuronModal
      open={open}
      onClose={onClose}
      size="lg"
      className={`fm-dialog fm-dialog--${width}`}
      title={title}
      description={description}
      showCloseButton={false}
      closeOnBackdrop={false}
      footer={
        <div className="fm-actions">
          <NeuronButton type="button" variant="secondary" onClick={onClose} disabled={submitting}>Cancel</NeuronButton>
          <NeuronButton type="submit" form={formId} variant="primary" loading={submitting}>{submitLabel}</NeuronButton>
        </div>
      }
    >
      <form id={formId} className="fm-form" noValidate onSubmit={onSubmit}>
        {errorCount > 0 && (
          <div ref={summaryRef} tabIndex={-1} className="fm-summary" role="alert">
            <NeuronAlert
              variant="danger"
              title={`${errorCount} ${errorCount === 1 ? 'field needs' : 'fields need'} attention`}
              description="Fields with errors are outlined in red."
            />
          </div>
        )}
        {children}
      </form>
    </NeuronModal>
  );
}

/** A labelled block of the form; `hint` sits on the right of the label line. */
export function FormSection({
  title,
  required,
  hint,
  children,
}: Readonly<{ title: string; required?: boolean; hint?: ReactNode; children: ReactNode }>) {
  return (
    <section className="fm-section">
      <div className="fm-section__head">
        <h3 className="fm-section__title">
          {title}
          {required && <span className="fm-required" aria-hidden="true"> *</span>}
        </h3>
        {hint && <span className="fm-hint">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function FormGrid({ columns = 2, children }: Readonly<{ columns?: 2 | 3; children: ReactNode }>) {
  return <div className={`fm-grid fm-grid--${columns}`}>{children}</div>;
}

/** One entry of a repeatable group: number badge, title, remove button, fields. */
export function RepeatableItem({
  index,
  title,
  removeLabel,
  canRemove = true,
  onRemove,
  children,
}: Readonly<{ index: number; title: string; removeLabel: string; canRemove?: boolean; onRemove: () => void; children: ReactNode }>) {
  return (
    <div className="fm-item" role="group" aria-label={title}>
      <div className="fm-item__head">
        <span className="fm-item__badge" aria-hidden="true">{index + 1}</span>
        <span className="fm-item__title">{title}</span>
        <NeuronButton
          type="button"
          variant="text"
          size="sm"
          iconOnly
          aria-label={removeLabel}
          title={canRemove ? 'Remove' : 'At least one is required'}
          className="fm-item__remove"
          disabled={!canRemove}
          onClick={onRemove}
        >
          <Trash2 size={16} />
        </NeuronButton>
      </div>
      <div className="fm-item__body">{children}</div>
    </div>
  );
}

/** Full-width dashed "+ Add …" button under a repeatable group. */
export function AddItemButton({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <button type="button" className="fm-add" onClick={onClick}>
      <Plus size={16} aria-hidden="true" />
      {label}
    </button>
  );
}

/** "Optional" marker for a field label's right side (NeuronTextArea labelAction). */
export function OptionalMark() {
  return <span className="fm-hint">Optional</span>;
}

/** Number of leaf errors in a react-hook-form errors object. */
export function countErrors(errors: unknown): number {
  if (!errors || typeof errors !== 'object') return 0;
  const e = errors as Record<string, unknown>;
  if (typeof e.message === 'string' && 'type' in e) return 1;
  return Object.values(e).reduce<number>((n, v) => n + countErrors(v), 0);
}
