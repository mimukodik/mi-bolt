import { describe, expect, it } from "vitest";

import type { ChangedLineCoverageIo } from "../io/io";
import { EXIT_CANNOT_MEASURE, EXIT_COVERED, EXIT_UNCOVERED, run } from "./run";

const REPO_ROOT = "/repo";
const PACKAGE_DIR = "/repo/apps/plan";

/** A coverage-final.json document with one statement per listed line. */
function report(lines: Record<string, Record<number, number>>): unknown {
  const document: Record<string, unknown> = {};
  for (const [relativePath, hits] of Object.entries(lines)) {
    const statementMap: Record<string, unknown> = {};
    const s: Record<string, number> = {};
    Object.entries(hits).forEach(([line, count], index) => {
      statementMap[String(index)] = {
        start: { line: Number(line) },
        end: { line: Number(line) },
      };
      s[String(index)] = count;
    });
    document[`${REPO_ROOT}/${relativePath}`] = { statementMap, s };
  }
  return document;
}

/** A diff that adds the given lines to one file. */
function diffAdding(
  relativePath: string,
  start: number,
  count: number,
): string {
  return [
    `diff --git a/${relativePath} b/${relativePath}`,
    `--- a/${relativePath}`,
    `+++ b/${relativePath}`,
    `@@ -${start},0 +${start},${count} @@`,
    ...Array.from({ length: count }, () => "+line"),
    "",
  ].join("\n");
}

interface FakeIoOverrides {
  readonly diff?: string;
  readonly untrackedFiles?: readonly string[];
  readonly countLines?: number;
  readonly packages?: readonly string[];
  readonly failedPackages?: readonly string[];
  readonly report?: unknown;
}

function fakeIo(overrides: FakeIoOverrides = {}): ChangedLineCoverageIo & {
  readonly lines: string[];
  readonly ran: string[][];
  readonly counted: string[];
} {
  const lines: string[] = [];
  const ran: string[][] = [];
  const counted: string[] = [];
  return {
    repoRoot: REPO_ROOT,
    diff: () => overrides.diff ?? "",
    untrackedFiles: () => overrides.untrackedFiles ?? [],
    countLines: (relativePath) => {
      counted.push(relativePath);
      return overrides.countLines ?? 0;
    },
    readFile: () => undefined,
    findPackages: () => overrides.packages ?? [PACKAGE_DIR],
    runCoverage: (packageDirs) => {
      ran.push([...packageDirs]);
      return overrides.failedPackages ?? [];
    },
    readReport: () => overrides.report,
    log: (line) => lines.push(line),
    lines,
    ran,
    counted,
  };
}

describe("run", () => {
  it("prints the help and succeeds", () => {
    const io = fakeIo();

    expect(run(["--help"], io)).toBe(EXIT_COVERED);
    expect(io.lines.join("\n")).toContain("Usage:");
    expect(io.ran).toEqual([]);
  });

  it("prints the parse error with the help and refuses to measure", () => {
    const io = fakeIo();

    expect(run(["--nope"], io)).toBe(EXIT_CANNOT_MEASURE);
    expect(io.lines.join("\n")).toContain("Unknown argument: --nope");
    expect(io.lines.join("\n")).toContain("Usage:");
  });

  it("runs coverage in every discovered package", () => {
    const io = fakeIo({
      packages: [PACKAGE_DIR, "/repo/packages/shared"],
      report: report({}),
    });

    run([], io);

    expect(io.ran).toEqual([[PACKAGE_DIR, "/repo/packages/shared"]]);
  });

  it("refuses to measure when a suite failed", () => {
    const io = fakeIo({ failedPackages: [PACKAGE_DIR] });

    expect(run([], io)).toBe(EXIT_CANNOT_MEASURE);
    expect(io.lines.join("\n")).toContain("the suite failed in apps/plan");
  });

  it("names the workspace root as . when its own suite failed", () => {
    const io = fakeIo({ packages: [REPO_ROOT], failedPackages: [REPO_ROOT] });

    expect(run([], io)).toBe(EXIT_CANNOT_MEASURE);
    expect(io.lines.join("\n")).toContain("the suite failed in .");
  });

  it("skips the suites with --skip-run", () => {
    const io = fakeIo({ report: report({}) });

    run(["--skip-run"], io);

    expect(io.ran).toEqual([]);
  });

  it("warns about a package that produced no report", () => {
    const io = fakeIo({ report: undefined });

    run(["--skip-run"], io);

    expect(io.lines.join("\n")).toContain(
      "apps/plan produced no coverage report",
    );
  });

  it("succeeds when every touched line was executed", () => {
    const io = fakeIo({
      diff: diffAdding("src/a.ts", 3, 2),
      report: report({ "src/a.ts": { 3: 1, 4: 2 } }),
    });

    expect(run(["--skip-run"], io)).toBe(EXIT_COVERED);
    expect(io.lines.join("\n")).toContain("2/2 touched lines covered");
  });

  it("fails and lists the uncovered lines as file:line", () => {
    const io = fakeIo({
      diff: diffAdding("src/a.ts", 3, 2),
      report: report({ "src/a.ts": { 3: 1, 4: 0 } }),
    });

    expect(run(["--skip-run"], io)).toBe(EXIT_UNCOVERED);
    expect(io.lines.join("\n")).toContain("src/a.ts:4");
  });

  it("fails on a touched file that no report mentions", () => {
    const io = fakeIo({
      diff: diffAdding("src/lonely.ts", 1, 1),
      report: report({}),
    });

    expect(run(["--skip-run"], io)).toBe(EXIT_UNCOVERED);
    expect(io.lines.join("\n")).toContain("src/lonely.ts:1");
  });

  it("treats an untracked file as wholly added in working tree mode", () => {
    const io = fakeIo({
      untrackedFiles: ["src/new.ts", "shot.png"],
      countLines: 2,
      report: report({}),
    });

    expect(run(["--skip-run"], io)).toBe(EXIT_UNCOVERED);
    expect(io.counted).toEqual(["src/new.ts"]);
    expect(io.lines.join("\n")).toContain("src/new.ts:1");
    expect(io.lines.join("\n")).toContain("src/new.ts:2");
  });

  it("ignores untracked files when comparing against a base ref", () => {
    const io = fakeIo({
      untrackedFiles: ["src/new.ts"],
      countLines: 2,
      report: report({}),
    });

    expect(run(["--skip-run", "--base", "main"], io)).toBe(EXIT_COVERED);
    expect(io.counted).toEqual([]);
    expect(io.lines.join("\n")).toContain("Comparing main...HEAD.");
  });

  it("names the comparison it measured", () => {
    const worktree = fakeIo({ report: report({}) });
    run(["--skip-run"], worktree);
    expect(worktree.lines.join("\n")).toContain("working tree against HEAD");

    const range = fakeIo({ report: report({}) });
    run(["--skip-run", "--range", "HEAD~2..HEAD"], range);
    expect(range.lines.join("\n")).toContain("Comparing HEAD~2..HEAD.");
  });

  it("refuses to measure a malformed coverage report instead of passing everything", () => {
    const io = fakeIo({ report: { "/repo/src/a.ts": { statementMap: {} } } });

    expect(run(["--skip-run"], io)).toBe(EXIT_CANNOT_MEASURE);
    expect(io.lines.join("\n")).toContain("no Istanbul statement data");
  });

  it("refuses to measure when something throws what is not an Error", () => {
    const io = {
      ...fakeIo({ report: report({}) }),
      diff: (): string => {
        throw "git went missing";
      },
    };

    expect(run(["--skip-run"], io)).toBe(EXIT_CANNOT_MEASURE);
    expect(io.lines.join("\n")).toContain(
      "Cannot measure changed-line coverage: git went missing",
    );
  });
});

describe("exit codes", () => {
  it("are the values the help text documents", () => {
    expect([EXIT_COVERED, EXIT_UNCOVERED, EXIT_CANNOT_MEASURE]).toEqual([
      0, 1, 2,
    ]);
  });
});

describe("the CLI shim", () => {
  it("runs end to end and prints the help", async () => {
    const { execFileSync } = await import("node:child_process");
    const url = await import("node:url");
    const nodePath = await import("node:path");
    const here = nodePath.dirname(url.fileURLToPath(import.meta.url));
    const repoRoot = nodePath.resolve(here, "..", "..", "..");

    const output = execFileSync(
      nodePath.join(repoRoot, "node_modules", ".bin", "tsx"),
      [
        nodePath.join(repoRoot, "scripts", "coverage-changed-lines.ts"),
        "--help",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(output).toContain("Usage:");
    expect(output).toContain("--skip-run");
  });
});
