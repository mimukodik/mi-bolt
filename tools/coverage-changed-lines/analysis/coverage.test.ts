import { describe, expect, it } from "vitest";

import {
  type FileStatements,
  isIstanbulFileCoverage,
  lineStatus,
  mergeCoverageIndexes,
  readCoverageReport,
} from "./coverage";

/** Shorthand for a statement span. */
function span(startLine: number, endLine: number, count: number) {
  return { startLine, endLine, count };
}

/** Shorthand for one file's entry in a coverage-final.json document. */
function entry(statements: readonly (readonly [number, number, number])[]) {
  const statementMap: Record<string, unknown> = {};
  const s: Record<string, number> = {};
  statements.forEach(([start, end, count], index) => {
    statementMap[String(index)] = {
      start: { line: start },
      end: { line: end },
    };
    s[String(index)] = count;
  });
  return { statementMap, s };
}

describe("isIstanbulFileCoverage", () => {
  it("accepts a well formed entry", () => {
    expect(isIstanbulFileCoverage(entry([[1, 1, 2]]))).toBe(true);
  });

  it.each([
    ["a primitive", 7],
    ["null", null],
    ["an array", []],
    ["a missing statementMap", { s: {} }],
    ["a missing hit map", { statementMap: {} }],
    [
      "a range without positions",
      { statementMap: { 0: { start: 1, end: 2 } }, s: { 0: 1 } },
    ],
    [
      "a range without a line",
      { statementMap: { 0: { start: {}, end: {} } }, s: { 0: 1 } },
    ],
    ["a non-numeric hit count", { statementMap: {}, s: { 0: "many" } }],
  ])("rejects %s", (_label, value) => {
    expect(isIstanbulFileCoverage(value)).toBe(false);
  });
});

describe("readCoverageReport", () => {
  it("turns statement ranges and hit counts into spans", () => {
    const index = readCoverageReport(
      {
        "/repo/a.ts": entry([
          [1, 3, 4],
          [2, 2, 0],
        ]),
      },
      "report",
    );

    expect(index.get("/repo/a.ts")).toEqual({
      spans: [span(1, 3, 4), span(2, 2, 0)],
    });
  });

  it("treats a statement with no recorded hit count as unexecuted", () => {
    const index = readCoverageReport(
      {
        "/repo/a.ts": {
          statementMap: { 0: { start: { line: 5 }, end: { line: 5 } } },
          s: {},
        },
      },
      "report",
    );

    expect(index.get("/repo/a.ts")).toEqual({ spans: [span(5, 5, 0)] });
  });

  it("refuses a document that is not an object", () => {
    expect(() => readCoverageReport([], "apps/plan coverage report")).toThrow(
      /apps\/plan coverage report is not a coverage report/,
    );
  });

  it("refuses an entry without Istanbul statement data", () => {
    expect(() =>
      readCoverageReport({ "/repo/a.ts": { s: {} } }, "report"),
    ).toThrow(/no Istanbul statement data for \/repo\/a\.ts/);
  });
});

describe("mergeCoverageIndexes", () => {
  it("keeps every report that mentions the same file", () => {
    const first = readCoverageReport(
      { "/repo/a.ts": entry([[1, 1, 0]]) },
      "first",
    );
    const second = readCoverageReport(
      { "/repo/a.ts": entry([[1, 1, 3]]) },
      "second",
    );

    const merged = mergeCoverageIndexes([first, second]);

    expect(merged.get("/repo/a.ts")).toHaveLength(2);
  });

  it("keeps files that only one report mentions", () => {
    const first = readCoverageReport(
      { "/repo/a.ts": entry([[1, 1, 1]]) },
      "first",
    );
    const second = readCoverageReport(
      { "/repo/b.ts": entry([[1, 1, 1]]) },
      "second",
    );

    const merged = mergeCoverageIndexes([first, second]);

    expect([...merged.keys()].sort()).toEqual(["/repo/a.ts", "/repo/b.ts"]);
  });
});

describe("lineStatus", () => {
  const nested: FileStatements = {
    // `items.forEach((item) => {` on 10, the callback body on 11, the close on 12.
    spans: [span(10, 12, 1), span(11, 11, 0)],
  };

  it("reports a line a statement started and ran on as covered", () => {
    expect(lineStatus([nested], 10)).toBe("covered");
  });

  it("reports a nested statement that never ran as uncovered, despite its enclosing call", () => {
    expect(lineStatus([nested], 11)).toBe("uncovered");
  });

  it("takes the highest count when several statements start on one line", () => {
    const inlined: FileStatements = { spans: [span(4, 4, 0), span(4, 4, 6)] };

    expect(lineStatus([inlined], 4)).toBe("covered");
  });

  it("falls back to the smallest statement containing a continuation line", () => {
    // A call argument list spread over 20 to 24, with the whole thing unrun.
    const wrapped: FileStatements = {
      spans: [span(1, 40, 1), span(20, 24, 0)],
    };

    expect(lineStatus([wrapped], 22)).toBe("uncovered");
  });

  it("reports a continuation of an executed statement as covered", () => {
    expect(lineStatus([{ spans: [span(20, 24, 3)] }], 22)).toBe("covered");
  });

  it("reports a line no statement starts on or contains as not executable", () => {
    expect(lineStatus([{ spans: [span(1, 2, 1)] }], 9)).toBe("not-executable");
  });

  it("reports a file with no statements at all as not executable", () => {
    expect(lineStatus([{ spans: [] }], 1)).toBe("not-executable");
  });

  it("counts a line covered when any package's suite executed it", () => {
    const missed: FileStatements = { spans: [span(3, 3, 0)] };
    const hit: FileStatements = { spans: [span(3, 3, 2)] };

    expect(lineStatus([missed, hit], 3)).toBe("covered");
    expect(lineStatus([hit, missed], 3)).toBe("covered");
  });

  it("stays uncovered when every package that loaded the file missed the line", () => {
    expect(
      lineStatus([{ spans: [span(3, 3, 0)] }, { spans: [span(9, 9, 1)] }], 3),
    ).toBe("uncovered");
  });

  it("is not executable when no report has any statement on the line", () => {
    expect(
      lineStatus([{ spans: [span(1, 1, 1)] }, { spans: [span(2, 2, 1)] }], 8),
    ).toBe("not-executable");
  });
});
