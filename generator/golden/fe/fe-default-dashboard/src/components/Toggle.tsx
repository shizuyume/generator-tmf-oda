export interface ToggleProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  name?: string;
}

/** No dedicated primitive in example-component-in-dashboard.html — small track/thumb switch
 * consistent with the design tokens (radius-full, bg-brand). Used by the `toggle` semantic. */
export function Toggle({ checked = false, onChange, disabled, label, name }: ToggleProps) {
  return (
    <label className={`inline-flex items-center gap-2 text-[13px] text-text-primary ${disabled ? 'opacity-50' : ''}`}>
      <span
        role="switch"
        aria-checked={checked}
        aria-disabled={disabled}
        onClick={() => !disabled && onChange?.(!checked)}
        className={`relative inline-block h-5 w-9 cursor-pointer rounded-full transition-colors ${
          checked ? 'bg-app-brand' : 'bg-gray-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
      {label && <span>{label}</span>}
      <input type="checkbox" name={name} checked={checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked)} className="sr-only" />
    </label>
  );
}

export default Toggle;
