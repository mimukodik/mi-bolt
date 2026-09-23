import { describe, expect, it } from "vitest";

import { SKIPPED_MARKER_SUFFIX } from "../../../.claude/hooks/common/pending-sessions.ts";
import {
  isRetrospectiveReport,
  matchesSince,
  newestFirst,
  retrospectiveDate,
  retrospectivePath,
  RETROSPECTIVE_FILES_DEFAULT,
  RETROSPECTIVE_LINES_DEFAULT,
  RETROSPECTIVES_DIRECTORY,
} from "./retrospective";

describe("retrospectivePath", () => {
  it("puts a report beside the other retrospective files", () => {
    expect(retrospectivePath("2026-01-10-abcd1234.md")).toBe(
      `${RETROSPECTIVES_DIRECTORY}/2026-01-10-abcd1234.md`,
    );
  });
});

describe("isRetrospectiveReport", () => {
  it("accepts a dated report file name", () => {
    expect(isRetrospectiveReport("2026-01-10-abcd1234.md")).toBe(true);
  });

  it("rejects a skip marker", () => {
    expect(isRetrospectiveReport("2026-01-10-abcd1234.skipped.md")).toBe(false);
  });

  it("rejects the exact suffix the SessionStart hook writes a decline as", () => {
    expect(
      isRetrospectiveReport(`2026-01-10-abcd1234${SKIPPED_MARKER_SUFFIX}`),
    ).toBe(false);
  });

  it("rejects the directory's own README", () => {
    expect(isRetrospectiveReport("README.md")).toBe(false);
  });

  it("rejects a non-markdown file", () => {
    expect(isRetrospectiveReport("notes.txt")).toBe(false);
  });

  it.each([["../../.env.md"], ["../../../etc/hosts.md"], ["a/../../x.md"]])(
    "rejects a name that could escape the directory: %s",
    (fileName) => {
      expect(isRetrospectiveReport(fileName)).toBe(false);
    },
  );
});

describe("retrospectiveDate", () => {
  it("reads the date a report's file name opens with", () => {
    expect(retrospectiveDate("2026-01-10-abcd1234.md")).toBe("2026-01-10");
  });

  it("is undefined for a file name with no date prefix", () => {
    expect(retrospectiveDate("notes.md")).toBeUndefined();
  });

  it("is undefined when the date is not at the start of the name", () => {
    expect(retrospectiveDate("notes-2026-01-10-x.md")).toBeUndefined();
  });
});

describe("retrospective search defaults", () => {
  it("pins the literal defaults the owner chose", () => {
    expect(RETROSPECTIVE_FILES_DEFAULT).toBe(5);
    expect(RETROSPECTIVE_LINES_DEFAULT).toBe(2);
  });
});

describe("matchesSince", () => {
  it("matches everything when there is no since filter", () => {
    expect(matchesSince("2026-01-01", undefined)).toBe(true);
    expect(matchesSince(undefined, undefined)).toBe(true);
  });

  it("never filters out a report with no date", () => {
    expect(matchesSince(undefined, "2026-06-01")).toBe(true);
  });

  it("keeps a report dated on or after the since date", () => {
    expect(matchesSince("2026-06-01", "2026-06-01")).toBe(true);
    expect(matchesSince("2026-06-02", "2026-06-01")).toBe(true);
  });

  it("drops a report dated before the since date", () => {
    expect(matchesSince("2026-05-31", "2026-06-01")).toBe(false);
  });
});

describe("newestFirst", () => {
  it("ranks the newer report first", () => {
    const dates = new Map([
      ["a.md", "2026-01-01"],
      ["b.md", "2026-02-01"],
    ]);

    expect(newestFirst(dates)("a.md", "b.md")).toBeGreaterThan(0);
    expect(newestFirst(dates)("b.md", "a.md")).toBeLessThan(0);
  });

  it("puts a dated report ahead of one with no date", () => {
    const dates = new Map([
      ["a.md", undefined],
      ["b.md", "2026-02-01"],
    ]);

    expect(newestFirst(dates)("a.md", "b.md")).toBeGreaterThan(0);
    expect(newestFirst(dates)("b.md", "a.md")).toBeLessThan(0);
  });

  it("falls back to the path, descending, when dates tie", () => {
    const dates = new Map([
      ["2026-01-01-aaaa.md", "2026-01-01"],
      ["2026-01-01-bbbb.md", "2026-01-01"],
    ]);

    expect(
      newestFirst(dates)("2026-01-01-aaaa.md", "2026-01-01-bbbb.md"),
    ).toBeGreaterThan(0);
    expect(
      newestFirst(dates)("2026-01-01-bbbb.md", "2026-01-01-aaaa.md"),
    ).toBeLessThan(0);
  });

  it("treats two undated paths as tied on date, breaking on the path", () => {
    const dates = new Map([
      ["a.md", undefined],
      ["b.md", undefined],
    ]);

    expect(newestFirst(dates)("a.md", "a.md")).toBe(0);
    expect(newestFirst(dates)("b.md", "a.md")).toBeLessThan(0);
  });
});
