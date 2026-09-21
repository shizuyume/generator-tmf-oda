import { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'small' | 'medium';
  error?: boolean;
  multiline?: boolean;
  rows?: number;
}

/** Field teks. Tinggi default mengikuti --control-h (densitas); `size="small"` adalah
 *  escape hatch dengan tinggi TETAP h-8, sengaja di luar sistem densitas dan disetel sama
 *  dengan `sm` milik Button supaya keduanya sejajar dalam satu toolbar. Konsekuensinya:
 *  pada densitas comfortable kontrol default tumbuh ke 44px sementara `small` tetap 32px.
 *  `multiline` merender <textarea> (adapter fe-default: semantic textarea). */
export function TextInput({ size = 'medium', error, className = '', multiline, rows, ...rest }: TextInputProps) {
  const h = size === 'small' ? 'h-8 text-xs' : 'h-(--control-h) text-sm';
  const border = error ? 'border-destructive' : 'border-input';
  if (multiline) {
    const { value, onChange, ...textareaRest } = rest as unknown as TextareaHTMLAttributes<HTMLTextAreaElement>;
    return (
      <textarea
        rows={rows ?? 4}
        value={value as string | undefined}
        onChange={onChange as never}
        className={`w-full rounded-md border bg-card px-2.5 py-2 text-foreground placeholder:text-neutral-400 ${border} ${className}`}
        {...(textareaRest as object)}
      />
    );
  }
  return (
    <input
      className={`w-full rounded-md border bg-card px-2.5 text-foreground placeholder:text-neutral-400 ${h} ${border} ${className}`}
      {...rest}
    />
  );
}

export default TextInput;
