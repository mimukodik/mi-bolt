import { describe, expect, it } from "vitest";

import { INDEX_MAX_BYTES, INDEX_MAX_LINES } from "./index";
import { reviewDue, type ReviewDueInput } from "./status";

const BASE: ReviewDueInput = {
  entries: 1,
  indexLines: 10,
  indexBytes: 100,
  reviewed: { date: "2026-01-01", entries: 1 },
  today: "2026-01-15",
};

describe("reviewDue", () => {
  it("rung 1: fires at 80 percent of the line cap", () => {
    const decision = reviewDue({
      ...BASE,
      indexLines: INDEX_MAX_LINES * 0.8,
    });

    expect(decision).toEqual({
      due: true,
      reason:
        "the index is at 80 percent of its injection cap; anything past the cap is silently dropped from every session.",
    });
  });

  it("rung 1: fires at 80 percent of the byte cap", () => {
    const decision = reviewDue({
      ...BASE,
      indexBytes: INDEX_MAX_BYTES * 0.8,
    });

    expect(decision).toEqual({
      due: true,
      reason:
        "the index is at 80 percent of its injection cap; anything past the cap is silently dropped from every session.",
    });
  });

  it("rung 1 outranks every other rung", () => {
    const decision = reviewDue({
      entries: 100,
      indexLines: INDEX_MAX_LINES * 0.8,
      indexBytes: INDEX_MAX_BYTES * 0.8,
      reviewed: undefined,
      today: "2026-01-15",
    });

    expect(decision.due).toBe(true);
    expect(decision).toMatchObject({
      reason: expect.stringContaining("80 percent"),
    });
  });

  it("rung 2: fires when 10 or more entries were added since the last review", () => {
    const decision = reviewDue({
      ...BASE,
      entries: 11,
      reviewed: { date: "2026-01-01", entries: 1 },
    });

    expect(decision).toEqual({
      due: true,
      reason: "10 or more entries have been added since the last review.",
    });
  });

  it("rung 2 does not fire under 10 new entries", () => {
    const decision = reviewDue({
      ...BASE,
      entries: 10,
      reviewed: { date: "2026-01-01", entries: 1 },
    });

    expect(decision).toEqual({ due: false });
  });

  it("rung 3: fires when never reviewed and 5 or more entries exist", () => {
    const decision = reviewDue({
      ...BASE,
      entries: 5,
      reviewed: undefined,
    });

    expect(decision).toEqual({
      due: true,
      reason:
        "the store has never been reviewed and now holds 5 or more entries.",
    });
  });

  it("rung 3 does not fire under 5 entries when never reviewed", () => {
    const decision = reviewDue({
      ...BASE,
      entries: 4,
      reviewed: undefined,
    });

    expect(decision).toEqual({ due: false });
  });

  it("rung 4: fires 90 days after the last review", () => {
    const decision = reviewDue({
      ...BASE,
      reviewed: { date: "2025-10-04", entries: 1 },
      today: "2026-01-02",
    });

    expect(decision).toEqual({
      due: true,
      reason:
        "90 days have passed since the last review. Elapsed time is the weakest of these signals, so treat it as a prompt to look, not as evidence that anything is wrong.",
    });
  });

  it("rung 4 does not fire before 90 days have passed", () => {
    const decision = reviewDue({
      ...BASE,
      reviewed: { date: "2025-10-05", entries: 1 },
      today: "2026-01-02",
    });

    expect(decision).toEqual({ due: false });
  });

  it("never fires rung 4 from elapsed time alone when there has never been a review", () => {
    const decision = reviewDue({
      ...BASE,
      entries: 1,
      reviewed: undefined,
      today: "2099-01-01",
    });

    expect(decision).toEqual({ due: false });
  });

  it("reports not due when nothing on the ladder fires", () => {
    expect(reviewDue(BASE)).toEqual({ due: false });
  });
});
