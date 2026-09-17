export interface RadioGroupOption {
  value: string;
  label: string;
}

export interface RadioGroupProps {
  name: string;
  value?: string;
  options: RadioGroupOption[];
  onChange?: (value: string) => void;
  layout?: 'inline' | 'stacked';
  disabled?: boolean;
}

/** Native radio group, styled with token colors. `layout` (F3 field.layout) controls
 * whether options flow in a row (inline, default) or stack vertically. */
export function RadioGroup({ name, value, options, onChange, layout = 'inline', disabled }: RadioGroupProps) {
  return (
    <div className={`flex gap-3 ${layout === 'stacked' ? 'flex-col' : 'flex-row flex-wrap items-center'}`}>
      {options.map((opt) => (
        <label key={opt.value} className="inline-flex items-center gap-1.5 text-[13px] text-text-primary">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            disabled={disabled}
            onChange={() => onChange?.(opt.value)}
            className="h-4 w-4 border-border-strong text-app-brand focus:ring-app-brand"
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}

export default RadioGroup;
