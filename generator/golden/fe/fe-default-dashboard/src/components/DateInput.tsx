import { InputHTMLAttributes } from 'react';

export interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  size?: 'small' | 'medium';
  error?: boolean;
  datetime?: boolean;
}

/** Native `<input type="date">` / `type="datetime-local">`. frontend-pattern.md §16.4:
 * date fields render `type="date"` — NOT `datetime-local` for the semantic `date` type;
 * `datetime` field type is the one exception that needs local time-of-day, so it alone
 * uses `datetime-local` (guardrail grep only forbids `datetime-local` on the PLAIN date
 * case, not on a field whose own type says datetime). */
export function DateInput({ size = 'medium', error, datetime, className = '', ...rest }: DateInputProps) {
  // `small` = tinggi TETAP di luar sistem densitas; rasionalisasinya di TextInput.tsx.
  const h = size === 'small' ? 'h-8 text-xs' : 'h-(--control-h) text-sm';
  const border = error ? 'border-destructive' : 'border-input';
  return (
    <input
      type={datetime ? 'datetime-local' : 'date'}
      className={`w-full rounded-md border bg-card px-2.5 text-foreground ${h} ${border} ${className}`}
      {...rest}
    />
  );
}

export default DateInput;
