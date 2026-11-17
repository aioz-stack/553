export function points(value: string | number | null | undefined, currency?: string): string {
  const n = Number(value ?? 0);
  const formatted = n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return currency ? `${formatted} ${currency}` : formatted;
}

/**
 * Timestamps are stored in UTC and shown in the viewer's local time zone.
 */
export function dateTime(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function titleCase(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function percentFromBps(bps: number): string {
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 2)}%`;
}
