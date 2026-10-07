import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

// Copies a value (e.g. the record id) and confirms with a check + a live-region message.
export default function CopyButton({ value, label = 'Copy ID' }: Readonly<{ value: string; label?: string }>) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // clipboard blocked (permissions / insecure context) — nothing to confirm
    }
  };

  return (
    <button type="button" className="dt-copy" aria-label={label} title={copied ? 'Copied' : label} onClick={copy}>
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span className="dt-sr-only" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
    </button>
  );
}
