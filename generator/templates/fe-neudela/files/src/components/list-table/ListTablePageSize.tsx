import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronDown } from 'lucide-react';

interface Props {
  value: number;
  options: number[];
  onChange: (size: number) => void;
}

// "Rows per page" picker from the design (Work queue footer): a compact trigger and a
// listbox that opens upward with a small caption and a check on the current size.
// Replaces the native <select>, whose option list the OS draws unstyled. neudela has no
// fitting primitive: NeuronDropdown opens downward with a full form-field frame, and
// NeuronDropdownMenu's radio items expose no selected state.
export default function ListTablePageSize({ value, options, onChange }: Readonly<Props>) {
  const id = useId();
  const labelId = `${id}-label`;
  const buttonId = `${id}-button`;
  const listId = `${id}-list`;
  const optionId = (n: number) => `${id}-opt-${n}`;

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const openList = (focusValue = value) => {
    setActive(focusValue);
    setOpen(true);
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const pick = (n: number) => {
    close();
    if (n !== value) onChange(n);
  };

  // focus the listbox when it opens; close on outside pointer-down
  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const move = (delta: number) => {
    const i = options.indexOf(active);
    setActive(options[Math.min(options.length - 1, Math.max(0, i + delta))]);
  };

  const onButtonKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList();
    }
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); move(1); break;
      case 'ArrowUp': e.preventDefault(); move(-1); break;
      case 'Home': e.preventDefault(); setActive(options[0]); break;
      case 'End': e.preventDefault(); setActive(options[options.length - 1]); break;
      case 'Enter':
      case ' ': e.preventDefault(); pick(active); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(false); break;
      default: break;
    }
  };

  return (
    <span ref={rootRef} className="lt-psize">
      <span id={labelId} className="lt-footer__label">Rows per page</span>
      <span className="lt-psize__anchor">
        <button
          ref={buttonRef}
          id={buttonId}
          type="button"
          className={`lt-psize__trigger${open ? ' is-open' : ''}`}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-labelledby={`${labelId} ${buttonId}`}
          onClick={() => (open ? close() : openList())}
          onKeyDown={onButtonKeyDown}
        >
          <span className="lt-psize__value">{value}</span>
          <ChevronDown size={14} aria-hidden="true" className="lt-psize__chevron" />
        </button>

        {open && (
          <div className="lt-psize__popover">
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              tabIndex={-1}
              aria-labelledby={labelId}
              aria-activedescendant={optionId(active)}
              className="lt-psize__list"
              onKeyDown={onListKeyDown}
            >
              {options.map((n) => (
                <li
                  key={n}
                  id={optionId(n)}
                  role="option"
                  aria-selected={n === value}
                  className={`lt-psize__option${n === value ? ' is-selected' : ''}${n === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(n)}
                  onClick={() => pick(n)}
                >
                  <span>{n}</span>
                  {n === value && <Check size={14} aria-hidden="true" className="lt-psize__check" />}
                </li>
              ))}
            </ul>
          </div>
        )}
      </span>
    </span>
  );
}
