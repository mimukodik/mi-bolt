const COMBINING_MARKS_PATTERN = /[̀-ͯ]/g;
const NON_ALPHANUMERIC_RUN_PATTERN = /[^a-zA-Z0-9]+/g;
const LEADING_OR_TRAILING_HYPHENS_PATTERN = /^-+|-+$/g;
const REPEATED_HYPHENS_PATTERN = /-{2,}/g;

/**
 * The backend catalogue import's slug rule (tools/catalog-import/src/import.ts): "+" reads as
 * "plus", accents are dropped, every other run of non-alphanumerics becomes one hyphen. Every
 * seeded product's slug is slugify(name).
 */
export function slugify(text: string): string {
  const plusified = text.replace(/\+/g, ' plus ');
  const ascii = plusified
    .normalize('NFD')
    .replace(COMBINING_MARKS_PATTERN, '')
    .replace(NON_ALPHANUMERIC_RUN_PATTERN, '-')
    .replace(LEADING_OR_TRAILING_HYPHENS_PATTERN, '')
    .toLowerCase();
  return ascii.replace(REPEATED_HYPHENS_PATTERN, '-');
}
