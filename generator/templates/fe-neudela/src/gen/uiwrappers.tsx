// uiwrappers.tsx — Ui* barrel NEUDELA (template runtime). Emitter page/detail menulis
// `import { UiBox, ... } from '../../gen/ui'`; untuk library neudela, src/gen/ui.tsx
// (emit) hanya re-export dari sini. Wrapper memetakan contract props emitter
// (termasuk `sx` MUI-style) ke Neuron*/HTML + class neuron.
//
// Gap terdokumentasi (adapter neudela): sx adalah subset kecil; dibuat inline style.
// Ukuran/typografi MUI (variant, size small) dipetakan best-effort ke class neuron.
import { ReactElement, ReactNode } from 'react';
import {
  NeuronBadge,
  NeuronButton,
  NeuronCard,
  NeuronInput,
  NeuronTooltip,
} from 'neudela';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';

/* ── sx (CSS-in-JS) -> inline style (subset neudela) ─────────────────── */

const COLOR_MAP: Record<string, string> = {
  'text.primary': 'var(--color-text-primary)',
  'text.secondary': 'var(--color-text-secondary)',
  'text.tertiary': 'var(--color-text-tertiary)',
  divider: 'var(--color-border)',
  error: 'var(--color-danger)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  info: 'var(--color-info)',
};

function px(n: unknown): string {
  const v = Number(n);
  return Number.isFinite(v) && /^\d+$/.test(String(n)) ? `${v * 8}px` : String(n);
}

function unit(v: unknown): string | number {
  if (typeof v === 'number') return `${v * 8}px`;
  if (typeof v === 'string' && /^\d+$/.test(v)) return `${Number(v) * 8}px`;
  return v as string;
}

// Konversi angka spacing MUI (gap:1 -> 8px) dan warna semantic. Subset ketat —
// sx di luar subset dibuang (warning terpusat di adapter neudela, bukan runtime).
export function sxToStyle(sx?: Record<string, unknown>): React.CSSProperties {
  if (!sx || typeof sx !== 'object') return {};
  const out: React.CSSProperties = {};
  const pick = (k: string, cssKey: keyof React.CSSProperties, map?: (v: unknown) => string | number) => {
    if (sx[k] !== undefined && sx[k] !== null) {
      out[cssKey] = (map ? map(sx[k]) : (sx[k] as string | number)) as never;
    }
  };
  pick('display', 'display');
  pick('flexDirection', 'flexDirection');
  pick('alignItems', 'alignItems');
  pick('justifyContent', 'justifyContent');
  pick('flexWrap', 'flexWrap');
  pick('flexGrow', 'flexGrow');
  pick('flexShrink', 'flexShrink');
  pick('gap', 'gap', unit);
  pick('rowGap', 'rowGap', unit);
  pick('columnGap', 'columnGap', unit);
  pick('width', 'width');
  pick('minWidth', 'minWidth');
  pick('maxWidth', 'maxWidth');
  pick('height', 'height');
  pick('minHeight', 'minHeight');
  pick('maxHeight', 'maxHeight');
  pick('wordBreak', 'wordBreak');
  pick('fontFamily', 'fontFamily');
  pick('fontSize', 'fontSize');
  pick('whiteSpace', 'whiteSpace');
  pick('textOverflow', 'textOverflow');
  pick('overflow', 'overflow');
  pick('padding', 'padding', px);
  pick('p', 'padding', px);
  pick('px', 'paddingLeft', px);
  pick('px', 'paddingRight', px);
  pick('py', 'paddingTop', px);
  pick('py', 'paddingBottom', px);
  pick('pt', 'paddingTop', px);
  pick('pb', 'paddingBottom', px);
  pick('pl', 'paddingLeft', px);
  pick('pr', 'paddingRight', px);
  pick('margin', 'margin', px);
  pick('m', 'margin', px);
  pick('mt', 'marginTop', px);
  pick('mb', 'marginBottom', px);
  pick('ml', 'marginLeft', px);
  pick('mr', 'marginRight', px);
  pick('border', 'border');
  pick('borderRadius', 'borderRadius');
  if (sx.color !== undefined) out.color = (COLOR_MAP[String(sx.color)] ?? sx.color) as string;
  if (sx.borderColor !== undefined) out.borderColor = (COLOR_MAP[String(sx.borderColor)] ?? sx.borderColor) as string;
  if (sx.bgcolor !== undefined) out.backgroundColor = (COLOR_MAP[String(sx.bgcolor)] ?? sx.bgcolor) as string;
  return out;
}

type Sx = Record<string, unknown>;

/* ── Ui* components ──────────────────────────────────────────────────── */

export function UiBox({ sx, children, style, ...rest }: { sx?: Sx; style?: React.CSSProperties; children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div className="neuron-box" style={{ ...sxToStyle(sx), ...style }} {...(rest as object)}>
      {children}
    </div>
  );
}

export function UiTypography({
  sx,
  variant,
  noWrap,
  color,
  children,
  ...rest
}: { sx?: Sx; variant?: string; noWrap?: boolean; color?: string; children?: ReactNode } & React.HTMLAttributes<HTMLSpanElement>): ReactElement {
  const cls = ['neuron-text', variant === 'h5' ? 'neuron-text--h5' : variant === 'subtitle2' || variant === 'body2' ? 'neuron-text--body2' : '']
    .filter(Boolean)
    .join(' ');
  const style = sxToStyle(sx);
  if (noWrap) {
    style.whiteSpace = 'nowrap';
    style.overflow = 'hidden';
    style.textOverflow = 'ellipsis';
  }
  if (color) style.color = COLOR_MAP[color] ?? color;
  return (
    <span className={cls} style={style} {...(rest as object)}>
      {children}
    </span>
  );
}

export function UiButton({
  variant,
  size,
  tone,
  startIcon,
  endIcon,
  iconOnly,
  children,
  ...rest
}: { variant?: string; size?: string; tone?: string; startIcon?: ReactNode; endIcon?: ReactNode; iconOnly?: boolean; children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>): ReactElement {
  const v = variant === 'primary' || variant === 'outline' || variant === 'text' || variant === 'secondary' ? variant : 'primary';
  return (
    <NeuronButton variant={v} size={size === 'small' ? 'sm' : 'md'} leadingIcon={startIcon} trailingIcon={endIcon} iconOnly={iconOnly} {...rest as Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>}>
      {children}
    </NeuronButton>
  );
}

export function UiIconButton({ size, title, children, ...rest }: { size?: string; title?: string; children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>): ReactElement {
  return (
    <NeuronButton variant="outline" size={size === 'small' ? 'sm' : 'md'} iconOnly title={title} {...(rest as Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'>)}>
      {children}
    </NeuronButton>
  );
}

export function UiChip({ label, size }: { label?: ReactNode; size?: string }): ReactElement {
  return (
    <NeuronBadge size={size === 'small' ? 'sm' : 'md'} variant="brand">
      {label}
    </NeuronBadge>
  );
}

export function UiTextField({
  label,
  size,
  value,
  onChange,
  type,
  placeholder,
  disabled,
  required,
  error,
  helperText,
  sx,
  multiline,
  rows,
  ...rest
}: {
  label?: string; size?: string; value?: unknown; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; type?: string;
  placeholder?: string; disabled?: boolean; required?: boolean; error?: boolean; helperText?: ReactNode; sx?: Sx;
  multiline?: boolean; rows?: number; name?: string;
}): ReactElement {
  void size; void multiline; void rows; // NeuronInput tidak punya multiline (adapter neudela: textarea FALLBACK)
  return (
    <div style={sxToStyle(sx)} className="neudela-form-field">
      <NeuronInput
        label={label ?? ''}
        required={!!required}
        disabled={disabled}
        type={type ? String(type) : 'text'}
        placeholder={placeholder}
        value={value == null ? '' : String(value)}
        onChange={onChange}
        state={error ? 'error' : 'default'}
        helperText={error && helperText ? String(helperText) : ''}
        {...(rest as object)}
      />
    </div>
  );
}

// F6: filter list.filters -> satu Select per field. NEUDELA GAP: tak ada NeuronSelect,
// fallback <select> HTML + class neuron (SAMA pola dengan FieldControl form select).
export function UiSelect({
  label, value, onChange, options, placeholder, sx,
}: { label?: string; value?: string; onChange?: (value: string) => void; options: { value: string; label: string }[]; placeholder?: string; sx?: Sx }): ReactElement {
  return (
    <div style={sxToStyle(sx)} className="neudela-form-field">
      {label && <label className="neuron-label">{label}</label>}
      <select className="neuron-select" value={value ?? ''} onChange={(e) => onChange?.(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

export function UiTooltip({ title, children }: { title: ReactNode; children: ReactNode }): ReactElement {
  return <NeuronTooltip content={title}>{children}</NeuronTooltip>;
}

export function UiAlert({ severity, variant: _variant, children, onClose }: { severity?: string; variant?: string; children?: ReactNode; onClose?: () => void }): ReactElement {
  const icon = severity === 'error' ? <XCircle size={16} /> : severity === 'success' ? <CheckCircle2 size={16} /> : severity === 'warning' ? <AlertTriangle size={16} /> : <Info size={16} />;
  const severityVariant = severity === 'error' ? 'error' : severity === 'success' ? 'success' : severity === 'warning' ? 'warning' : 'blue';
  void _variant;
  return (
    <div className={`neudela-alert neudela-alert--${severity ?? 'info'}`}>
      {icon}
      <span className="neudela-alert__text">{children}</span>
      {onClose && (
        <button type="button" className="neudela-alert__close" onClick={onClose} aria-label="Tutup">
          <X size={14} />
        </button>
      )}
      <span style={{ display: 'none' }}>{severityVariant}</span>
    </div>
  );
}

export function UiSnackbar({
  open,
  autoHideDuration,
  onClose,
  children,
  anchorOrigin,
}: { open: boolean; autoHideDuration?: number; onClose?: () => void; children?: ReactNode; anchorOrigin?: unknown }): ReactElement {
  void anchorOrigin;
  return (
    <div className={`neudela-snackbar${open ? ' is-open' : ''}`} role="alert">
      {children}
      {open && autoHideDuration ? <AutoClose key={String(autoHideDuration)} onClose={onClose} /> : null}
    </div>
  );
}

function AutoClose({ onClose }: { onClose?: () => void }): null {
  return null; // auto-dismiss di-handle halaman (emitter) via state snack
}

export interface UiTabsProps {
  value: number;
  onChange: (e: unknown, v: number) => void;
  children?: ReactNode;
  sx?: Sx;
}

export function UiTabs({ value, onChange, children, sx }: UiTabsProps): ReactElement {
  return (
    <div className="neudela-tabs" style={sxToStyle(sx)}>
      {Array.isArray(children)
        ? children.map((child, i) => {
            const active = i === value;
            const label = (child as { props?: { label?: ReactNode } })?.props?.label ?? i;
            return (
              <button
                key={i}
                type="button"
                className={`neudela-tabs__tab${active ? ' is-active' : ''}`}
                onClick={() => onChange(null, i)}
              >
                {label}
              </button>
            );
          })
        : children}
    </div>
  );
}

export function UiTab({ label }: { label: ReactNode }): ReactElement {
  return <span>{label}</span>;
}

export function UiCard({ sx, children, ...rest }: { sx?: Sx; children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div className="neuron-card neuron-card--default neuron-card--pad-md neuron-card--radius-lg" style={sxToStyle(sx)} {...(rest as object)}>
      <div className="neuron-card-body">{children}</div>
    </div>
  );
}

export function UiTable({ size, sx, children }: { size?: string; sx?: Sx; children?: ReactNode }): ReactElement {
  void size;
  return (
    <div className="neudela-table-wrap" style={sxToStyle(sx)}>
      <table className="neudela-table">{children}</table>
    </div>
  );
}

export function UiTableHead({ children }: { children?: ReactNode }): ReactElement {
  return <thead>{children}</thead>;
}

export function UiTableBody({ children }: { children?: ReactNode }): ReactElement {
  return <tbody>{children}</tbody>;
}

export function UiTableRow({ children }: { children?: ReactNode }): ReactElement {
  return <tr>{children}</tr>;
}

export function UiTableCell({ children }: { children?: ReactNode }): ReactElement {
  return <td className="neudela-table__cell">{children}</td>;
}