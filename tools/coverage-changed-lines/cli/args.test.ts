import { describe, expect, it } from "vitest";

import { HELP, parseArgs } from "./args";

describe("parseArgs", () => {
  it("defaults to the working tree with the suites enabled", () => {
    expect(parseArgs([])).toEqual({
      kind: "options",
      options: { mode: { kind: "worktree" }, skipRun: false },
    });
  });

  it("reads --base as a three-dot comparison against HEAD", () => {
    expect(parseArgs(["--base", "main"])).toEqual({
      kind: "options",
      options: { mode: { kind: "base", ref: "main" }, skipRun: false },
    });
  });

  it("accepts an inline value", () => {
    expect(parseArgs(["--base=origin/main"])).toEqual({
      kind: "options",
      options: { mode: { kind: "base", ref: "origin/main" }, skipRun: false },
    });
  });

  it("reads --range verbatim", () => {
    expect(parseArgs(["--range", "HEAD~3..HEAD"])).toEqual({
      kind: "options",
      options: {
        mode: { kind: "range", expression: "HEAD~3..HEAD" },
        skipRun: false,
      },
    });
  });

  it("reads --skip-run alongside a comparison", () => {
    expect(parseArgs(["--skip-run", "--base", "main"])).toEqual({
      kind: "options",
      options: { mode: { kind: "base", ref: "main" }, skipRun: true },
    });
  });

  it.each(["-h", "--help"])("treats %s as a help request", (flag) => {
    expect(parseArgs([flag])).toEqual({ kind: "help" });
  });

  it("rejects two comparisons", () => {
    expect(parseArgs(["--base", "main", "--range", "a..b"])).toEqual({
      kind: "error",
      message: "Pass at most one of --base and --range.",
    });
  });

  it("rejects a comparison flag with no value", () => {
    expect(parseArgs(["--base"])).toEqual({
      kind: "error",
      message: "Missing value for --base.",
    });
  });

  it("does not read the next flag as the value for --base", () => {
    expect(parseArgs(["--base", "--skip-run"])).toEqual({
      kind: "error",
      message: "Missing value for --base.",
    });
  });

  it("does not read the next flag as the value for --range", () => {
    expect(parseArgs(["--range", "--base", "main"])).toEqual({
      kind: "error",
      message: "Missing value for --range.",
    });
  });

  it("keeps an inline value that starts with --", () => {
    expect(parseArgs(["--range=--cached"])).toEqual({
      kind: "options",
      options: {
        mode: { kind: "range", expression: "--cached" },
        skipRun: false,
      },
    });
  });

  it("rejects an empty inline value", () => {
    expect(parseArgs(["--range="])).toEqual({
      kind: "error",
      message: "Missing value for --range.",
    });
  });

  it("rejects anything it does not know", () => {
    expect(parseArgs(["--coverage"])).toEqual({
      kind: "error",
      message: "Unknown argument: --coverage",
    });
  });

  it("rejects a bare positional argument", () => {
    expect(parseArgs(["main"])).toEqual({
      kind: "error",
      message: "Unknown argument: main",
    });
  });
});

describe("HELP", () => {
  it("documents every flag the parser accepts", () => {
    for (const flag of ["--base", "--range", "--skip-run", "--help"]) {
      expect(HELP).toContain(flag);
    }
  });
});
