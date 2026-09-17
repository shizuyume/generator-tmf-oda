import { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'small' | 'medium';
  error?: boolean;
  multiline?: boolean;
  rows?: number;
}

/** Ports .field input/select from example-component-in-dashboard.html (h-10, radius-md,
 * border-strong). `multiline` renders a <textarea> instead (adapter fe-default: textarea semantic). */
export function TextInput({ size = 'medium', error, className = '', multiline, rows, ...rest }: TextInputProps) {
  const h = size === 'small' ? 'h-9 text-xs' : 'h-10 text-[13px]';
  const border = error ? 'border-danger-500' : 'border-border-strong';
  if (multiline) {
    const { value, onChange, ...textareaRest } = rest as unknown as TextareaHTMLAttributes<HTMLTextAreaElement>;
    return (
      <textarea
        rows={rows ?? 4}
        value={value as string | undefined}
        onChange={onChange as never}
        className={`w-full rounded-md border bg-app-surface px-2.5 py-2 text-text-primary placeholder:text-text-disabled ${border} ${className}`}
        {...(textareaRest as object)}
      />
    );
  }
  return (
    <input
      className={`w-full rounded-md border bg-app-surface px-2.5 text-text-primary placeholder:text-text-disabled ${h} ${border} ${className}`}
      {...rest}
    />
  );
}

export default TextInput;
