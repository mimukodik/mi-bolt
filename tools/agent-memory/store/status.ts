/**
 * The review-due decision: whether `.claude/shared-memory/MEMORY.md` should
 * be reviewed, and why. Pure: every input is a count, a size, or a plain
 * `YYYY-MM-DD` date string, so the ladder is tested one rung at a time
 * without a clock or a file.
 */
import { INDEX_MAX_BYTES, INDEX_MAX_LINES, type ReviewedStamp } from "./index";

/** The counts, sizes and dates the ladder is evaluated against. */
export interface ReviewDueInput {
  readonly entries: number;
  readonly indexLines: number;
  readonly indexBytes: number;
  readonly reviewed: ReviewedStamp | undefined;
  readonly today: string;
}

/** Whether a review is due, and the reason when it is. */
export type ReviewDueDecision =
  | { readonly due: true; readonly reason: string }
  | { readonly due: false };

/** The fraction of either cap that already counts as close enough to review. */
const CAP_WARNING_FRACTION = 0.8;

/** New entries since the last review before a review is due on count alone. */
const ENTRIES_SINCE_REVIEW_THRESHOLD = 10;

/** Entries an unreviewed store needs before it is due on size alone. */
const NEVER_REVIEWED_ENTRIES_THRESHOLD = 5;

/** Days since the last review before elapsed time alone calls for one. */
const DAYS_SINCE_REVIEW_THRESHOLD = 90;

/** Splits a plain `YYYY-MM-DD` string into its numeric year, month and day. */
function dateParts(date: string): readonly [number, number, number] {
  const [year, month, day] = date.split("-");
  return [Number(year), Number(month), Number(day)];
}

/**
 * Whole days between two plain local `YYYY-MM-DD` dates, computed through UTC
 * so a daylight-saving shift in the host's local timezone cannot round a
 * count of whole days incorrectly.
 */
function daysBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = dateParts(from);
  const [toYear, toMonth, toDay] = dateParts(to);
  const millisecondsPerDay = 24 * 60 * 60 * 1000;
  return Math.round(
    (Date.UTC(toYear, toMonth - 1, toDay) -
      Date.UTC(fromYear, fromMonth - 1, fromDay)) /
      millisecondsPerDay,
  );
}

/**
 * Evaluates the due ladder in order and returns the first rung that fires.
 * The order is deliberate: a silently-truncated index outranks a store
 * nobody has looked at in a while.
 */
export function reviewDue(input: ReviewDueInput): ReviewDueDecision {
  if (
    input.indexLines >= INDEX_MAX_LINES * CAP_WARNING_FRACTION ||
    input.indexBytes >= INDEX_MAX_BYTES * CAP_WARNING_FRACTION
  ) {
    return {
      due: true,
      reason:
        "the index is at 80 percent of its injection cap; anything past the cap is silently dropped from every session.",
    };
  }

  if (
    input.reviewed !== undefined &&
    input.entries - input.reviewed.entries >= ENTRIES_SINCE_REVIEW_THRESHOLD
  ) {
    return {
      due: true,
      reason: "10 or more entries have been added since the last review.",
    };
  }

  if (
    input.reviewed === undefined &&
    input.entries >= NEVER_REVIEWED_ENTRIES_THRESHOLD
  ) {
    return {
      due: true,
      reason:
        "the store has never been reviewed and now holds 5 or more entries.",
    };
  }

  if (
    input.reviewed !== undefined &&
    daysBetween(input.reviewed.date, input.today) >= DAYS_SINCE_REVIEW_THRESHOLD
  ) {
    return {
      due: true,
      reason:
        "90 days have passed since the last review. Elapsed time is the weakest of these signals, so treat it as a prompt to look, not as evidence that anything is wrong.",
    };
  }

  return { due: false };
}
