/**
 * Retrospective report files under .claude/retrospectives: which file names
 * are searchable reports, the date a report's own file name carries, the
 * defaults and ranking `search` uses to page over them, and the
 * `--retrospective-since` filter. Pure: the caller supplies file names and
 * text.
 */

/** Repo-relative directory holding retrospective report files. */
export const RETROSPECTIVES_DIRECTORY = ".claude/retrospectives";

/** Repo-relative path of one retrospective report, as output prints it. */
export function retrospectivePath(fileName: string): string {
  return `${RETROSPECTIVES_DIRECTORY}/${fileName}`;
}

/**
 * Reports given snippets on one page of `search`'s retrospective block, the
 * default for `--retrospective-files`. Owner-chosen, dated 2026-09-03, not a
 * measurement: record it here rather than presenting it as one, per
 * .claude/rules/planning-deliverables.md.
 */
export const RETROSPECTIVE_FILES_DEFAULT = 5;

/**
 * Snippet lines printed per retrospective report, the default for
 * `--retrospective-lines`. Owner-chosen, dated 2026-09-03, not a
 * measurement: record it here rather than presenting it as one, per
 * .claude/rules/planning-deliverables.md.
 */
export const RETROSPECTIVE_LINES_DEFAULT = 2;

/**
 * Suffix on a marker file recording only that the user declined a
 * retrospective offer; it carries no session evidence to search.
 */
const SKIPPED_SUFFIX = ".skipped.md";

/** The directory's own index file: documentation, not a report. */
const README_NAME = "README.md";

/**
 * Whether a file name in the retrospectives directory is a report worth
 * searching, as opposed to a skip marker or the directory's own README.
 *
 * A name carrying a path separator is rejected outright: this predicate is
 * what every caller uses to decide a name is safe to join with
 * RETROSPECTIVES_DIRECTORY, and `readdirSync` never returns one, but the
 * method is public and reads as the validator, so it closes the door itself
 * rather than trusting every future caller to have come from `readdirSync`.
 */
export function isRetrospectiveReport(fileName: string): boolean {
  return (
    fileName.endsWith(".md") &&
    !fileName.endsWith(SKIPPED_SUFFIX) &&
    fileName !== README_NAME &&
    !fileName.includes("/") &&
    !fileName.includes("\\")
  );
}

/**
 * A report is named `<YYYY-MM-DD>-<id8>.md`
 * (`.claude/retrospectives/README.md`); the date in that name is the closest
 * thing a report has to a topic file's `Recorded:` line, so search prints it
 * in the same place.
 */
const REPORT_DATE = /^(\d{4}-\d{2}-\d{2})-/;

/** The date embedded in a retrospective report's file name, if it has one. */
export function retrospectiveDate(fileName: string): string | undefined {
  return REPORT_DATE.exec(fileName)?.[1];
}

/** The shape a `--retrospective-since` value has to match. */
export const SINCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Whether a report dated `date` (its file name's date, or undefined when the
 * name carries none) belongs in a `--retrospective-since since` search. A
 * report with no date is never filtered out: there is nothing to compare, and
 * dropping it silently would hide a report `search` can otherwise still find.
 */
export function matchesSince(
  date: string | undefined,
  since: string | undefined,
): boolean {
  if (since === undefined || date === undefined) return true;
  return date >= since;
}

/**
 * Tie-break for ranking retrospective reports that matched the same number of
 * lines: the newer report first, by the date its own file name carries. A
 * dated report always outranks an undated one, whichever path it has. Only
 * when both share the same date, including both carrying none, does the
 * comparison fall back to the path itself, descending, so the order stays
 * deterministic without pretending to know which of two same-day (or two
 * dateless) reports is newer.
 */
export function newestFirst(
  dates: ReadonlyMap<string, string | undefined>,
): (leftPath: string, rightPath: string) => number {
  return (leftPath, rightPath) => {
    const leftDate = dates.get(leftPath);
    const rightDate = dates.get(rightPath);
    if (leftDate !== rightDate) {
      if (leftDate === undefined) return 1;
      if (rightDate === undefined) return -1;
      return leftDate < rightDate ? 1 : -1;
    }
    return leftPath < rightPath ? 1 : leftPath > rightPath ? -1 : 0;
  };
}
