// uiwrappers.tsx — Ui* barrel FE-DEFAULT (template runtime). Emitter page/detail writes
// `import { UiBox, ... } from '../../gen/ui'`; for library fe-default, src/gen/ui.tsx (emit)
// only re-exports from here (same pattern as neudela — see emit/page.mjs UIWRAPPERS_LIBRARIES).
// Wrapper maps the emitter's contract props (including MUI-style `sx`) onto local Tailwind
// components (src/components/*) styled from example-component-in-dashboard.html tokens.
//
// Documented gap (adapter fe-default): `sx` is a small subset, converted to inline style
// (same subset as neudela.adapter's uiwrappers) — arbitrary CSS-in-JS beyond that is dropped.
import { ReactElement, ReactNode, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { Badge } from '../components/Badge';
import { TextInput } from '../components/TextInput';
import { FormField } from '../components/FormField';
import { Card } from '../components/Card';
import { Select as SelectPrimitive } from '../components/Select';

/* ── sx (CSS-in-JS) -> inline style (subset, sama dgn neudela.adapter uiwrappers) ────────── */

const COLOR_MAP: Record<string, string> = {
  'text.primary': 'var(--text-primary)',
  'text.secondary': 'var(--text-secondary)',
  divider: 'var(--border-default)',
  error: 'var(--danger-500)',
  success: 'var(--success-500)',
  warning: 'var(--warning-500)',
  info: 'var(--info-500)',
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

type Sx = Record<string, unknown>;

export function sxToStyle(sx?: Sx): React.CSSProperties {
  if (!sx || typeof sx !== 'object') return {};
  const out: React.CSSProperties = {};
  // Menulis lewat computed key bertipe `keyof React.CSSProperties` memaksa TS
  // menghitung union raksasa -> TS2590 "union type that is too complex to represent"
  // (nyata di typescript 4.9, versi yang dituntut peer react-scripts@5). Menulis lewat
  // satu view Record menghilangkan perhitungan union itu, sekaligus membuang `as never`
  // yang sebelumnya hanya menutupi masalahnya.
  const target = out as Record<string, string | number>;
  const pick = (k: string, cssKey: keyof React.CSSProperties, map?: (v: unknown) => string | number) => {
    if (sx[k] !== undefined && sx[k] !== null) {
      target[cssKey as string] = map ? map(sx[k]) : (sx[k] as string | number);
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

/* ── Ui* components ──────────────────────────────────────────────────── */

export function UiBox({
  sx,
  children,
  style,
  ...rest
}: { sx?: Sx; style?: React.CSSProperties; children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>): ReactElement {
  return (
    <div style={{ ...sxToStyle(sx), ...style }} {...(rest as object)}>
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
  const style = sxToStyle(sx);
  if (variant === 'h5') {
    style.fontSize = style.fontSize ?? '1.5rem';
    style.fontWeight = style.fontWeight ?? 600;
  } else if (variant === 'subtitle2' || variant === 'body2') {
    style.fontSize = style.fontSize ?? '0.8125rem';
  }
  if (noWrap) {
    style.whiteSpace = 'nowrap';
    style.overflow = 'hidden';
    style.textOverflow = 'ellipsis';
    style.display = style.display ?? 'block';
  }
  if (color) style.color = COLOR_MAP[color] ?? color;
  return (
    <span style={style} {...(rest as object)}>
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
  void variant; // fe-default: mapping semantik lewat adapter propsMap `tone` (bukan MUI variant)
  const t = tone === 'primary' || tone === 'tertiary' || tone === 'danger' || tone === 'default' ? tone : 'default';
  return (
    <Button tone={t} size={size === 'small' ? 'sm' : 'md'} startIcon={startIcon} endIcon={endIcon} iconOnly={iconOnly} {...rest}>
      {children}
    </Button>
  );
}

export function UiIconButton({ size, title, children, ...rest }: { size?: string; title?: string; children?: ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>): ReactElement {
  return (
    <IconButton size={size === 'small' ? 'small' : 'medium'} title={title} {...rest}>
      {children}
    </IconButton>
  );
}

export function UiChip({ label, size }: { label?: ReactNode; size?: string }): ReactElement {
  return (
    <Badge size={size === 'small' ? 'sm' : 'md'} tone="neutral">
      {label}
    </Badge>
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
  const input = (
    <TextInput
      size={size === 'small' ? 'small' : 'medium'}
      required={!!required}
      disabled={disabled}
      type={type ? String(type) : 'text'}
      placeholder={placeholder}
      value={value == null ? '' : String(value)}
      onChange={onChange}
      error={!!error}
      multiline={multiline}
      rows={rows}
      {...(rest as object)}
    />
  );
  return (
    <div style={sxToStyle(sx)}>
      {label ? (
        <FormField label={label} required={required} error={error ? helperText : undefined}>
          {input}
        </FormField>
      ) : (
        input
      )}
    </div>
  );
}

// F6: filter list.filters -> satu Select per field. Kontrak SERAGAM di 3 template:
// {label?, value, onChange(value:string), options:{value,label}[], placeholder?, sx?}.
export function UiSelect({
  label, value, onChange, options, placeholder, sx,
}: { label?: string; value?: string; onChange?: (value: string) => void; options: { value: string; label: string }[]; placeholder?: string; sx?: Sx }): ReactElement {
  const el = (
    <SelectPrimitive
      size="small"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      options={options}
      placeholder={placeholder}
    />
  );
  return (
    <div style={sxToStyle(sx)}>
      {label ? <FormField label={label}>{el}</FormField> : el}
    </div>
  );
}

export function UiTooltip({ title, children }: { title: ReactNode; children: ReactNode }): ReactElement {
  return (
    <span title={typeof title === 'string' ? title : undefined} className="inline-flex">
      {children}
    </span>
  );
}

const ALERT_TONE: Record<string, string> = {
  error: 'bg-danger-50 text-danger-700',
  success: 'bg-success-50 text-success-700',
  warning: 'bg-warning-50 text-warning-700',
  info: 'bg-info-50 text-info-700',
};

export function UiAlert({ severity, variant: _variant, children, onClose }: { severity?: string; variant?: string; children?: ReactNode; onClose?: () => void }): ReactElement {
  void _variant;
  const s = severity ?? 'info';
  const icon = s === 'error' ? <XCircle size={16} /> : s === 'success' ? <CheckCircle2 size={16} /> : s === 'warning' ? <AlertTriangle size={16} /> : <Info size={16} />;
  return (
    <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-[13px] ${ALERT_TONE[s] ?? ALERT_TONE.info}`}>
      {icon}
      <span className="flex-1">{children}</span>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Tutup" className="text-current">
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function UiSnackbar({
  open,
  autoHideDuration,
  onClose,
  children,
  anchorOrigin,
}: { open: boolean; autoHideDuration?: number; onClose?: () => void; children?: ReactNode; anchorOrigin?: unknown }): ReactElement | null {
  void anchorOrigin;
  useEffect(() => {
    if (!open || !autoHideDuration || !onClose) return;
    const id = window.setTimeout(onClose, autoHideDuration);
    return () => window.clearTimeout(id);
  }, [open, autoHideDuration, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed bottom-6 left-6 z-[200] rounded-lg border border-border bg-app-surface shadow-lg"
      role="alert"
    >
      {children}
    </div>
  );
}

export interface UiTabsProps {
  value: number;
  onChange: (e: unknown, v: number) => void;
  children?: ReactNode;
  sx?: Sx;
}

export function UiTabs({ value, onChange, children, sx }: UiTabsProps): ReactElement {
  return (
    <div className="flex gap-1 border-b border-border" style={sxToStyle(sx)}>
      {Array.isArray(children)
        ? children.map((child, i) => {
            const active = i === value;
            const label = (child as { props?: { label?: ReactNode } })?.props?.label ?? i;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onChange(null, i)}
                className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-medium ${
                  active ? 'border-app-brand text-text-brand' : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
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
    <Card style={sxToStyle(sx)} {...(rest as object)}>
      {children}
    </Card>
  );
}

export function UiTable({ size, sx, children }: { size?: string; sx?: Sx; children?: ReactNode }): ReactElement {
  void size;
  return (
    <div className="overflow-auto" style={sxToStyle(sx)}>
      <table className="w-full min-w-[480px] border-collapse">{children}</table>
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
  return <tr className="border-b border-border last:border-b-0 hover:bg-app-brand-subtle">{children}</tr>;
}

export function UiTableCell({ children }: { children?: ReactNode }): ReactElement {
  return <td className="px-3 py-2 text-xs text-text-primary">{children}</td>;
}

// ---------------------------------------------------------------------------
// F1: primitif layout/detail-page (frontend-pattern.md §7-§12). Belum dipetakan ke
// semantic vocabulary manapun (BARREL_MEMBERS di emit/page.mjs) - dipakai halaman
// detail/dashboard yang akan digenerate mulai F6/F7. Re-export lurus, bukan wrapper,
// karena komponennya sudah library-neutral (Tailwind + token, tanpa dependency luar).
// ---------------------------------------------------------------------------
export { Breadcrumbs } from '../components/Breadcrumbs';
export { Tabs as UiPillTabs } from '../components/Tabs';
export { Skeleton, SkeletonRows } from '../components/Skeleton';
export { DetailField } from '../components/DetailField';
export { SectionCard } from '../components/SectionCard';
export { StatusChipField } from '../components/StatusChipField';
export { RefEntityCard } from '../components/RefEntityCard';
export { DetailListSection } from '../components/DetailListSection';
export { StatusFilterCard } from '../components/StatusFilterCard';

// ---------------------------------------------------------------------------
// F3: primitif input tipe field baru (date/datetime/checkbox/radio-group). Native HTML,
// nol dependency baru — konsisten dengan seluruh design system fe-default.
// ---------------------------------------------------------------------------
export { DateInput } from '../components/DateInput';
export { Checkbox } from '../components/Checkbox';
export { RadioGroup } from '../components/RadioGroup';

// F7: UiStatCard - alias langsung StatCard.tsx (primitif nyata, sudah ada sejak template
// awal). Ditambahkan ke barrel HANYA saat FEIR punya halaman dashboard (lihat
// barrelMembersFor di emit/page.mjs) - re-export ini sendiri tak berbahaya bila tak dipakai.
export { StatCard as UiStatCard } from '../components/StatCard';
