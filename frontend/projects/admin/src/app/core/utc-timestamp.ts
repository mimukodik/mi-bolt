/** Offset timestamps become UTC fields while retaining fractional-second precision. */
export function toUtcInput(value: string): string {
  const fraction = /\.[0-9]{1,9}/.exec(value)?.[0] ?? '';
  return new Date(value).toISOString().slice(0, 19) + fraction;
}

/** A sortable nanosecond key for the explicitly UTC admin input; null rejects malformed calendar values. */
export function utcTimestampKey(value: string): string | null {
  const parts = value.split('.');
  const seconds = parts[0];
  const fraction = parts[1] ?? '';
  if (
    (parts.length === 2 && fraction === '') ||
    parts.length > 2 ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(seconds)
  )
    return null;
  if (fraction !== '' && !/^[0-9]{1,9}$/.test(fraction)) return null;
  const date = new Date(`${value}Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 19) !== seconds) return null;
  return seconds + '.' + fraction.padEnd(9, '0');
}
