import { describe, expect, it } from "vitest";

import {
  type CoverageIndex,
  type FileStatements,
  mergeCoverageIndexes,
} from "./coverage";
import type { TouchedFile } from "./diff";
import {
  createExclusionMatcher,
  evaluate,
  formatReport,
  type GateResult,
} from "./gate";

const REPO_ROOT = "/repo";

/** Builds an index straight from statement spans, keyed by repo-relative path. */
function indexOf(files: Record<string, FileStatements>): CoverageIndex {
  const single = new Map<string, FileStatements>();
  for (const [relativePath, statements] of Object.entries(files)) {
    single.set(`${REPO_ROOT}/${relativePath}`, statements);
  }
  return mergeCoverageIndexes([single]);
}

/** A `readSource` that never finds a file, so no line is ever skipped as code-free. */
const noSource = (): string | undefined => undefined;

/** The one matcher the run shares, built here the way `run` builds it. */
const isExcluded = createExclusionMatcher(REPO_ROOT);

/** Builds a `readSource` from repo-relative path to file text. */
function sourceOf(
  files: Record<string, string>,
): (relativePath: string) => string | undefined {
  return (relativePath) => files[relativePath];
}

describe("createExclusionMatcher", () => {
  it.each([
    "apps/plan/actions/list-visual-plans.ts",
    "apps/plan/app/i18n/index.ts",
    "apps/clips/app/routes/_app.shared.tsx",
    "packages/shared/src/server/local-auth-fallback.ts",
    "packages/shared/vitest-coverage-config.ts",
    "scripts/coverage-changed-lines/analysis/gate.ts",
  ])("gates %s", (relativePath) => {
    expect(isExcluded(relativePath)).toBe(false);
  });

  it.each([
    ["a spec", "apps/plan/actions/view-screen.spec.ts"],
    ["a test", "packages/shared/tests/local-auth-fallback.test.ts"],
    ["a build output tree", "packages/shared/dist/index.js"],
    ["a generated type", "apps/plan/.generated/action-types.d.ts"],
    ["a tool config", "apps/plan/vite.config.ts"],
    ["a browser suite", "apps/plan/e2e/auth-first-paint.guest.spec.ts"],
    ["a docs asset", "apps/plan/docs/architecture/assets/app.js"],
    ["a locale catalog", "apps/plan/app/i18n/en-US.ts"],
  ])("excludes %s", (_label, relativePath) => {
    expect(isExcluded(relativePath)).toBe(true);
  });

  it.each([
    ["a shell script", "apps/plan/scripts/dev.sh"],
    ["a compose file", "apps/plan/docker-compose.local-database.yml"],
    ["prose", "README.md"],
    ["a report page", "apps/plan/docs/architecture/index.html"],
    ["a screenshot", "apps/plan/docs/research/validation/poc-desktop.png"],
    ["configuration data", "package.json"],
  ])("excludes %s by file type", (_label, relativePath) => {
    expect(isExcluded(relativePath)).toBe(true);
  });

  it("excludes a tree that another test runner owns", () => {
    expect(isExcluded(".claude/hooks/common/typeguards.ts")).toBe(true);
    expect(isExcluded("verify/src/cli.ts")).toBe(true);
    expect(isExcluded("services/auth/src/server.ts")).toBe(true);
  });

  it("excludes the CLI shim by exact path, not by prefix", () => {
    expect(isExcluded("scripts/coverage-changed-lines.ts")).toBe(true);
    expect(isExcluded("scripts/coverage-changed-lines/cli/run.ts")).toBe(false);
  });
});

describe("evaluate", () => {
  it("counts a covered line and reports nothing", () => {
    const touched: TouchedFile[] = [{ path: "src/a.ts", lines: [3] }];
    const index = indexOf({
      "src/a.ts": { spans: [{ startLine: 3, endLine: 3, count: 2 }] },
    });

    expect(evaluate(touched, index, REPO_ROOT, noSource, isExcluded)).toEqual({
      checkedFiles: 1,
      checkedLines: 1,
      coveredLines: 1,
      findings: [],
    } satisfies GateResult);
  });

  it("reports a line no test executed", () => {
    const touched: TouchedFile[] = [{ path: "src/a.ts", lines: [3, 4] }];
    const index = indexOf({
      "src/a.ts": {
        spans: [
          { startLine: 3, endLine: 3, count: 1 },
          { startLine: 4, endLine: 4, count: 0 },
        ],
      },
    });

    expect(evaluate(touched, index, REPO_ROOT, noSource, isExcluded)).toEqual({
      checkedFiles: 1,
      checkedLines: 2,
      coveredLines: 1,
      findings: [{ path: "src/a.ts", line: 4, reason: "uncovered" }],
    } satisfies GateResult);
  });

  it("does not count a line no statement occupies", () => {
    const touched: TouchedFile[] = [{ path: "src/a.ts", lines: [1, 3] }];
    const index = indexOf({
      "src/a.ts": { spans: [{ startLine: 3, endLine: 3, count: 1 }] },
    });

    expect(
      evaluate(touched, index, REPO_ROOT, noSource, isExcluded),
    ).toMatchObject({
      checkedLines: 1,
      findings: [],
    });
  });

  it("fails closed when no report mentions the file", () => {
    const touched: TouchedFile[] = [{ path: "src/untested.ts", lines: [1, 2] }];

    expect(
      evaluate(touched, indexOf({}), REPO_ROOT, noSource, isExcluded),
    ).toEqual({
      checkedFiles: 1,
      checkedLines: 2,
      coveredLines: 0,
      findings: [
        { path: "src/untested.ts", line: 1, reason: "no-coverage-data" },
        { path: "src/untested.ts", line: 2, reason: "no-coverage-data" },
      ],
    } satisfies GateResult);
  });

  it("skips excluded files entirely", () => {
    const touched: TouchedFile[] = [
      { path: "README.md", lines: [1] },
      { path: "apps/plan/app/i18n/en-US.ts", lines: [4] },
      { path: "apps/plan/e2e/smoke.spec.ts", lines: [4] },
    ];

    expect(
      evaluate(touched, indexOf({}), REPO_ROOT, noSource, isExcluded),
    ).toEqual({
      checkedFiles: 0,
      checkedLines: 0,
      coveredLines: 0,
      findings: [],
    } satisfies GateResult);
  });

  it("skips a blank line inside an untested block", () => {
    const source = ["if (flag) {", "", "  doThing();", "}", ""].join("\n");
    // The whole if-block is one unexecuted statement, so a naive line status
    // would inherit its zero count for the blank line too.
    const index = indexOf({
      "src/a.ts": {
        spans: [
          { startLine: 1, endLine: 4, count: 0 },
          { startLine: 3, endLine: 3, count: 0 },
        ],
      },
    });
    const touched: TouchedFile[] = [{ path: "src/a.ts", lines: [2] }];

    expect(
      evaluate(
        touched,
        index,
        REPO_ROOT,
        sourceOf({ "src/a.ts": source }),
        isExcluded,
      ),
    ).toEqual({
      checkedFiles: 1,
      checkedLines: 0,
      coveredLines: 0,
      findings: [],
    } satisfies GateResult);
  });

  it("skips a // line inside an untested block", () => {
    const source = [
      "if (flag) {",
      "  // explains doThing",
      "  doThing();",
      "}",
      "",
    ].join("\n");
    const index = indexOf({
      "src/a.ts": {
        spans: [
          { startLine: 1, endLine: 4, count: 0 },
          { startLine: 3, endLine: 3, count: 0 },
        ],
      },
    });
    const touched: TouchedFile[] = [{ path: "src/a.ts", lines: [2] }];

    expect(
      evaluate(
        touched,
        index,
        REPO_ROOT,
        sourceOf({ "src/a.ts": source }),
        isExcluded,
      ),
    ).toEqual({
      checkedFiles: 1,
      checkedLines: 0,
      coveredLines: 0,
      findings: [],
    } satisfies GateResult);
  });

  it("skips a /* */ block and a JSDoc /** */ block inside an untested block", () => {
    const source = [
      "if (flag) {",
      "  /* plain block",
      "   * comment */",
      "  /**",
      "   * JSDoc block.",
      "   */",
      "  doThing();",
      "}",
      "",
    ].join("\n");
    const index = indexOf({
      "src/a.ts": {
        spans: [
          { startLine: 1, endLine: 8, count: 0 },
          { startLine: 7, endLine: 7, count: 0 },
        ],
      },
    });
    const touched: TouchedFile[] = [
      { path: "src/a.ts", lines: [2, 3, 4, 5, 6] },
    ];

    expect(
      evaluate(
        touched,
        index,
        REPO_ROOT,
        sourceOf({ "src/a.ts": source }),
        isExcluded,
      ),
    ).toEqual({
      checkedFiles: 1,
      checkedLines: 0,
      coveredLines: 0,
      findings: [],
    } satisfies GateResult);
  });

  it("still reports a real statement inside an untested block as uncovered", () => {
    const source = ["if (flag) {", "  doThing();", "}", ""].join("\n");
    const index = indexOf({
      "src/a.ts": {
        spans: [
          { startLine: 1, endLine: 3, count: 0 },
          { startLine: 2, endLine: 2, count: 0 },
        ],
      },
    });
    const touched: TouchedFile[] = [{ path: "src/a.ts", lines: [2] }];

    expect(
      evaluate(
        touched,
        index,
        REPO_ROOT,
        sourceOf({ "src/a.ts": source }),
        isExcluded,
      ),
    ).toEqual({
      checkedFiles: 1,
      checkedLines: 1,
      coveredLines: 0,
      findings: [{ path: "src/a.ts", line: 2, reason: "uncovered" }],
    } satisfies GateResult);
  });

  it("still reports code with a trailing comment when uncovered", () => {
    const source = ["if (flag) {", "  const x = 1; // note", "}", ""].join(
      "\n",
    );
    const index = indexOf({
      "src/a.ts": {
        spans: [
          { startLine: 1, endLine: 3, count: 0 },
          { startLine: 2, endLine: 2, count: 0 },
        ],
      },
    });
    const touched: TouchedFile[] = [{ path: "src/a.ts", lines: [2] }];

    expect(
      evaluate(
        touched,
        index,
        REPO_ROOT,
        sourceOf({ "src/a.ts": source }),
        isExcluded,
      ),
    ).toEqual({
      checkedFiles: 1,
      checkedLines: 1,
      coveredLines: 0,
      findings: [{ path: "src/a.ts", line: 2, reason: "uncovered" }],
    } satisfies GateResult);
  });

  it("still reports a * continuation of arithmetic, not a comment, when uncovered", () => {
    const source = [
      "if (flag) {",
      "  const area =",
      "    width",
      "    * height;",
      "}",
      "",
    ].join("\n");
    const index = indexOf({
      "src/a.ts": {
        spans: [
          { startLine: 1, endLine: 5, count: 0 },
          { startLine: 2, endLine: 4, count: 0 },
        ],
      },
    });
    const touched: TouchedFile[] = [{ path: "src/a.ts", lines: [4] }];

    expect(
      evaluate(
        touched,
        index,
        REPO_ROOT,
        sourceOf({ "src/a.ts": source }),
        isExcluded,
      ),
    ).toEqual({
      checkedFiles: 1,
      checkedLines: 1,
      coveredLines: 0,
      findings: [{ path: "src/a.ts", line: 4, reason: "uncovered" }],
    } satisfies GateResult);
  });

  it("still reports code after a string that contains /*, not a real comment", () => {
    const source = [
      "if (flag) {",
      '  const note = "here is /* unterminated";',
      "  doThing();",
      "}",
      "",
    ].join("\n");
    const index = indexOf({
      "src/a.ts": {
        spans: [
          { startLine: 1, endLine: 4, count: 0 },
          { startLine: 3, endLine: 3, count: 0 },
        ],
      },
    });
    const touched: TouchedFile[] = [{ path: "src/a.ts", lines: [3] }];

    expect(
      evaluate(
        touched,
        index,
        REPO_ROOT,
        sourceOf({ "src/a.ts": source }),
        isExcluded,
      ),
    ).toEqual({
      checkedFiles: 1,
      checkedLines: 1,
      coveredLines: 0,
      findings: [{ path: "src/a.ts", line: 3, reason: "uncovered" }],
    } satisfies GateResult);
  });

  it("reports no-coverage-data unchanged, comment lines included, when a file has no report", () => {
    const source = [
      "if (flag) {",
      "  // a comment",
      "  doThing();",
      "}",
      "",
    ].join("\n");
    const touched: TouchedFile[] = [{ path: "src/untested.ts", lines: [1, 2] }];

    expect(
      evaluate(
        touched,
        indexOf({}),
        REPO_ROOT,
        sourceOf({ "src/untested.ts": source }),
        isExcluded,
      ),
    ).toEqual({
      checkedFiles: 1,
      checkedLines: 2,
      coveredLines: 0,
      findings: [
        { path: "src/untested.ts", line: 1, reason: "no-coverage-data" },
        { path: "src/untested.ts", line: 2, reason: "no-coverage-data" },
      ],
    } satisfies GateResult);
  });
});

describe("formatReport", () => {
  it("reports a clean run on one line", () => {
    const result: GateResult = {
      checkedFiles: 1,
      checkedLines: 4,
      coveredLines: 4,
      findings: [],
    };

    expect(formatReport(result)).toBe(
      "Changed-line coverage: 4/4 touched lines covered across 1 file.",
    );
  });

  it("pluralises the file count", () => {
    const result: GateResult = {
      checkedFiles: 2,
      checkedLines: 4,
      coveredLines: 4,
      findings: [],
    };

    expect(formatReport(result)).toContain("across 2 files.");
  });

  it("lists every uncovered line as file:line under its own heading", () => {
    const report = formatReport({
      checkedFiles: 2,
      checkedLines: 3,
      coveredLines: 0,
      findings: [
        { path: "src/a.ts", line: 4, reason: "uncovered" },
        { path: "src/a.ts", line: 5, reason: "uncovered" },
        { path: "src/b.ts", line: 1, reason: "no-coverage-data" },
      ],
    });

    expect(report).toContain("Executed by no test");
    expect(report).toContain("  src/a.ts:4\n  src/a.ts:5");
    expect(report).toContain("No test loads this file at all:");
    expect(report).toContain("  src/b.ts:1");
  });

  it("omits a heading with nothing under it", () => {
    const report = formatReport({
      checkedFiles: 1,
      checkedLines: 1,
      coveredLines: 0,
      findings: [{ path: "src/b.ts", line: 1, reason: "no-coverage-data" }],
    });

    expect(report).not.toContain("Executed by no test");
    expect(report).toContain("No test loads this file at all:");
  });
});
