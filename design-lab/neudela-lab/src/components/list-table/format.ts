// Cell formatters shared by list pages. Rows keep raw ISO strings (NeuronTable re-sorts
// the current page client-side by the raw value); these only format for display.

const DATE_TIME = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const TIME = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });

const DAY = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

function toDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateTime(value?: string): string {
  const d = toDate(value);
  return d ? DATE_TIME.format(d) : '—';
}

export function formatTime(date: Date): string {
  return TIME.format(date);
}

/** "Sep 1, 2026 – Sep 15, 2026", "Sep 1, 2026", "from Sep 1, 2026", "until Sep 15, 2026". */
export function formatDateRangeLabel(from: Date | null, to: Date | null): string {
  if (from && to) {
    return from.getTime() === to.getTime() ? DAY.format(from) : DAY.formatRange(from, to);
  }
  if (from) return `from ${DAY.format(from)}`;
  if (to) return `until ${DAY.format(to)}`;
  return 'any date';
}

/** "3 days ago", "in 2 hours", "now". */
export function formatRelativeTime(value?: string, now = Date.now()): string {
  const d = toDate(value);
  if (!d) return '';
  const seconds = Math.round((d.getTime() - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return RELATIVE.format(0, 'minute');
}
