const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Budapest',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function budapestLocal(instant: string): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) return '';
  return formatter.format(date).replace(' ', 'T');
}

/** UTC offset candidates must round-trip: DST gaps and folds are not guessed. */
export function budapestInstant(local: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return null;
  const utc = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(utc)) return null;
  const matches = [1, 2]
    .map((hours) => new Date(utc - hours * 3_600_000).toISOString())
    .filter((instant) => budapestLocal(instant) === local);
  return matches.length === 1 ? matches[0] : null;
}
