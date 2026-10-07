import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { NeuronButton } from 'neudela';
import type { ListTableRowAction } from './types';

interface Props<T> {
  row: T;
  actions: ListTableRowAction<T>[];
  /** Accessible name of the trigger, e.g. "Actions for Standard 70/30 Split". */
  label: string;
}

const MENU_WIDTH = 188;
const GAP = 4;

// Row actions behind a "⋯" button (ListTable buttonActionVariant="menu").
// Portalled to <body> with fixed positioning: NeuronTable's wrapper scrolls horizontally
// (overflow-x:auto ⇒ clips vertically too) and NeuronDropdownMenu renders inline, so an
// in-table menu would be cut off on the last rows. Opens upward when there is no room below.
export default function ListTableRowMenu<T>({ row, actions, label }: Readonly<Props<T>>) {
  const id = useId();
  const menuId = `${id}-menu`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [style, setStyle] = useState<CSSProperties>({ visibility: 'hidden' });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  // position next to the trigger (right-aligned), flip up near the bottom of the viewport
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = triggerRef.current?.getBoundingClientRect();
      const m = menuRef.current;
      if (!t || !m) return;
      const h = m.offsetHeight;
      const below = window.innerHeight - t.bottom;
      const top = below < h + GAP && t.top > h + GAP ? t.top - h - GAP : t.bottom + GAP;
      const left = Math.max(8, Math.min(t.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8));
      setStyle({ top, left, width: MENU_WIDTH, visibility: 'visible' });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  // focus the active item once the menu is visible (a visibility:hidden node can't take focus)
  const visible = open && style.visibility === 'visible';
  useEffect(() => {
    if (visible) itemRefs.current[active]?.focus();
    // only when the menu becomes visible; later moves are handled in onMenuKeyDown
  }, [visible]);

  // close on outside pointer-down or any scroll (the anchor would drift)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const onScroll = (e: Event) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const focusItem = (i: number) => {
    const next = (i + actions.length) % actions.length;
    setActive(next);
    itemRefs.current[next]?.focus();
  };

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); focusItem(active + 1); break;
      case 'ArrowUp': e.preventDefault(); focusItem(active - 1); break;
      case 'Home': e.preventDefault(); focusItem(0); break;
      case 'End': e.preventDefault(); focusItem(actions.length - 1); break;
      case 'Escape': e.preventDefault(); close(); break;
      case 'Tab': close(false); break;
      default: break;
    }
  };

  const openMenu = (first: 'first' | 'last' = 'first') => {
    setActive(first === 'first' ? 0 : actions.length - 1);
    setStyle({ visibility: 'hidden' });
    setOpen(true);
  };

  return (
    <>
      <NeuronButton
        type="button"
        variant="text"
        size="sm"
        iconOnly
        className={`lt-action lt-action--menu${open ? ' is-open' : ''}`}
        aria-label={label}
        title="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        // NeuronButton forwards no ref; grab the DOM node through the event target instead
        onMouseDown={(e) => { triggerRef.current = e.currentTarget; }}
        onFocus={(e) => { triggerRef.current = e.currentTarget; }}
        onClick={(e) => {
          e.stopPropagation(); // the row itself opens the detail
          if (open) close(false);
          else openMenu();
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            openMenu(e.key === 'ArrowDown' ? 'first' : 'last');
          }
        }}
      >
        <MoreHorizontal size={16} />
      </NeuronButton>

      {open && createPortal(
        // React events bubble through portals to the <tr>: stop them here
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className="lt-rowmenu"
          style={style}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={onMenuKeyDown}
        >
          {actions.map((a, i) => (
            <button
              key={a.key}
              ref={(el) => { itemRefs.current[i] = el; }}
              type="button"
              role="menuitem"
              tabIndex={i === active ? 0 : -1}
              className={`lt-rowmenu__item lt-rowmenu__item--${a.tone ?? 'neutral'}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => {
                close();
                a.onClick(row);
              }}
            >
              <span className="lt-rowmenu__icon" aria-hidden="true">{a.icon}</span>
              {a.label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
