import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import type { LookupOption } from '../../service/lookupService';
import './Form.css';

// A relation picker (LOV) that searches the owning API as the user types — the typed text goes
// to the lookup (TMF630 query param), so every entity is reachable, not just the first page.
// NEUDELA GAP: NeuronDropdown only filters the options it was given (no async search, no
// loading slot, label not tied to the trigger). This combobox reuses its classes, so it looks
// the same, and follows the WAI-ARIA combobox pattern (input + listbox, aria-activedescendant).

export interface PickedRef {
  id: string;
  name: string;
}

interface Props {
  label: string;
  placeholder: string;
  required?: boolean;
  value: PickedRef;
  onChange: (value: PickedRef) => void;
  onBlur?: () => void;
  /** Server search; '' = the first page. */
  search: (query: string) => Promise<LookupOption[]>;
  /** The first page, loaded once for the whole form (shared with the other pickers). */
  initial: { options: LookupOption[]; loading: boolean; error: string | null };
  /** Validation message (wins over the lookup's own message). */
  error?: string;
  /** Results per request: a full page means there may be more — the list says to type. */
  pageSize?: number;
  debounceMs?: number;
}

type Status = { options: LookupOption[]; loading: boolean; error: string | null };

/** neudela styles the dropdown under both class families (neuron-dropdown__x neuron-select__x). */
const nd = (part: string) => `neuron-dropdown__${part} neuron-select__${part}`;

export default function LookupPicker({
  label,
  placeholder,
  required,
  value,
  onChange,
  onBlur,
  search,
  initial,
  error,
  pageSize = 20,
  debounceMs = 300,
}: Readonly<Props>) {
  const uid = useId();
  const listId = `${uid}-list`;
  const helperId = `${uid}-help`;
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const seq = useRef(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [found, setFound] = useState<Status | null>(null);

  const q = query.trim();
  // the empty query shows the shared first page; a typed query its own server results
  const status: Status = q ? (found ?? { options: [], loading: true, error: null }) : initial;
  const options = status.options;

  useEffect(() => {
    if (!q) {
      setFound(null);
      return undefined;
    }
    const mine = ++seq.current;
    setFound((f) => ({ options: f?.options ?? [], loading: true, error: null }));
    const timer = setTimeout(() => {
      search(q)
        .then((opts) => { if (mine === seq.current) setFound({ options: opts, loading: false, error: null }); })
        .catch((err: unknown) => {
          if (mine === seq.current) setFound({ options: [], loading: false, error: err instanceof Error ? err.message : 'Options could not be loaded.' });
        });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [q, search, debounceMs]);

  useEffect(() => { setActive(0); }, [q, open]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
  }, []);

  // a click anywhere else closes the list (the popover renders inline, no portal)
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, close]);

  const pick = (o: LookupOption) => {
    onChange({ id: o.id, name: o.name });
    close();
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (options.length) setActive((i) => (i + (e.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length);
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (options[active]) pick(options[active]);
    } else if (e.key === 'Escape' && open) {
      // closes the list only — the dialog around it must not see this Escape
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  // a failed lookup explains itself first: it is why the field cannot be filled
  let helper: string | undefined = initial.error ?? error;
  if (!helper && !open && initial.loading && !value.id) helper = 'Loading options…';
  else if (!helper && !open && !initial.loading && !initial.error && initial.options.length === 0 && !value.id) helper = 'No options available from the lookup service.';

  const selectedLabel = value.id ? value.name || value.id : '';
  const rootClass = [
    'neuron-dropdown neuron-select',
    'neuron-dropdown--md neuron-select--md',
    'lp',
    open && 'neuron-dropdown--open neuron-select--open neuron-dropdown--focused neuron-select--focused',
    error && 'neuron-dropdown--error neuron-select--error',
  ].filter(Boolean).join(' ');

  let listStatus: string | null = null;
  if (status.loading) listStatus = q ? `Searching “${q}”…` : 'Loading options…';
  else if (status.error) listStatus = status.error;
  else if (options.length === 0) listStatus = q ? `No matches for “${q}”.` : 'No options available from the lookup service.';

  return (
    <div className="neuron-dropdown-group neuron-select-group lp-group" ref={rootRef} role="group" aria-label={required ? `${label} (required)` : label}>
      <label className="neuron-label" htmlFor={`${uid}-input`}>
        {label}
        {required && <span className="neuron-label__required"> *</span>}
      </label>
      <div className={rootClass}>
        {/* the trigger is the box; the input inside it is the combobox */}
        <div
          className={`${nd('trigger')} lp-trigger`}
          onMouseDown={(e) => {
            if (e.target !== inputRef.current) e.preventDefault();
            setOpen(true);
            inputRef.current?.focus();
          }}
        >
          <input
            ref={inputRef}
            id={`${uid}-input`}
            className={`${nd('search-inline')} lp-input`}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={helper ? helperId : undefined}
            aria-activedescendant={open && options[active] ? `${uid}-opt-${active}` : undefined}
            autoComplete="off"
            spellCheck={false}
            placeholder={open ? selectedLabel || placeholder : placeholder}
            value={open ? query : selectedLabel}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => onBlur?.()}
            onKeyDown={onKeyDown}
          />
          {status.loading && open && <Loader2 className="lp-spinner" size={16} aria-hidden="true" />}
          {!required && value.id && !open && (
            <button
              type="button"
              className="lp-clear"
              aria-label={`Clear ${label}`}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onChange({ id: '', name: '' })}
            >
              <X size={14} aria-hidden="true" />
            </button>
          )}
          <svg className={`${nd('chevron')}${open ? ' neuron-dropdown__chevron--open neuron-select__chevron--open' : ''}`} width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
          </svg>
        </div>
        {open && (
          <div className={`neuron-dropdown__menu ${nd('dropdown')} lp-menu`} role="listbox" id={listId} aria-label={label}>
            {options.map((o, i) => {
              const selected = o.id === value.id;
              return (
                <div
                  key={o.id}
                  id={`${uid}-opt-${i}`}
                  role="option"
                  aria-selected={selected}
                  className={[
                    nd('option'),
                    selected && 'neuron-dropdown__option--selected neuron-select__option--selected',
                    i === active && 'neuron-dropdown__option--focused neuron-select__option--focused',
                  ].filter(Boolean).join(' ')}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                >
                  <div className={nd('option-text')}>
                    <div className={nd('option-header')}>
                      <span className={nd('option-label')}>{o.name || o.id}</span>
                    </div>
                    <span className={nd('option-desc')}>{o.id}</span>
                  </div>
                </div>
              );
            })}
            {listStatus && <div className={`${nd('empty')} lp-status${status.error ? ' lp-status--error' : ''}`} role="status">{listStatus}</div>}
            {!listStatus && options.length >= pageSize && (
              <div className="lp-more" role="status">Showing the first {pageSize} — type to search for more.</div>
            )}
          </div>
        )}
      </div>
      {helper && (
        <span id={helperId} className={`neuron-helper-text${error ? ' neuron-helper-text--error' : ''}`}>{helper}</span>
      )}
    </div>
  );
}
