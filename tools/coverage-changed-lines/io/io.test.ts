import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import { parseUnifiedDiff } from "../analysis/diff";
import {
  countLines,
  createIo,
  diffArgs,
  findRepoRoot,
  findVitestPackages,
  git,
  readReport,
  reportPath,
  runCommand,
  runCommandAttached,
  runCoverage,
} from "./io";

const temporaryDirectories: string[] = [];

afterAll(() => {
  for (const directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

/** A temporary directory, realpath-resolved so it matches what git reports. */
function temporaryDirectory(): string {
  const directory = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "coverage-changed-lines-")),
  );
  temporaryDirectories.push(directory);
  return directory;
}

/** Runs git with an identity of its own, so the test never reads global config. */
function repoGit(cwd: string, args: readonly string[]): string {
  return git(
    [
      "-c",
      "user.name=Coverage Changed Lines Test",
      "-c",
      "user.email=coverage-changed-lines@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    cwd,
  );
}

/** An initialised repository with one commit. */
function repositoryWith(files: Record<string, string>): string {
  const directory = temporaryDirectory();
  repoGit(directory, ["init", "-b", "main"]);
  writeAll(directory, files);
  repoGit(directory, ["add", "."]);
  repoGit(directory, ["commit", "--no-verify", "-m", "initial"]);
  return directory;
}

function writeAll(directory: string, files: Record<string, string>): void {
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = path.join(directory, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
}

/** Ten numbered lines, so a one-line edit stays above git's rename threshold. */
function numberedLines(marker: string): string {
  return (
    Array.from(
      { length: 10 },
      (_unused, index) => `const line${index} = "${marker}";`,
    ).join("\n") + "\n"
  );
}

describe("runCommand", () => {
  it("captures stdout and the exit status", () => {
    const result = runCommand(
      "node",
      ["-e", "console.log('hello'); process.exit(4)"],
      process.cwd(),
    );

    expect(result.status).toBe(4);
    expect(result.stdout.trim()).toBe("hello");
    expect(result.stderr).toBe("");
  });

  it("throws when the command does not exist", () => {
    expect(() =>
      runCommand("coverage-changed-lines-no-such-binary", [], process.cwd()),
    ).toThrow();
  });
});

describe("runCommandAttached", () => {
  it("returns the child's exit status", () => {
    expect(
      runCommandAttached("node", ["-e", "process.exit(5)"], process.cwd()),
    ).toBe(5);
  });

  it("throws when the command does not exist", () => {
    expect(() =>
      runCommandAttached(
        "coverage-changed-lines-no-such-binary",
        [],
        process.cwd(),
      ),
    ).toThrow();
  });
});

describe("git", () => {
  it("returns stdout on success", () => {
    const directory = repositoryWith({ "a.txt": "a\n" });

    expect(git(["rev-parse", "--abbrev-ref", "HEAD"], directory).trim()).toBe(
      "main",
    );
  });

  it("throws with git's own message on failure", () => {
    const directory = repositoryWith({ "a.txt": "a\n" });

    expect(() =>
      git(["rev-parse", "--verify", "no-such-ref"], directory),
    ).toThrow(/git rev-parse --verify no-such-ref failed/);
  });
});

describe("findRepoRoot", () => {
  it("resolves the root from a subdirectory", () => {
    const directory = repositoryWith({ "nested/deep/a.txt": "a\n" });

    expect(findRepoRoot(path.join(directory, "nested", "deep"))).toBe(
      directory,
    );
  });
});

describe("diffArgs", () => {
  it("compares the working tree against HEAD by default", () => {
    expect(diffArgs({ kind: "worktree" })).toContain("HEAD");
  });

  it("uses a three-dot comparison for a base ref", () => {
    expect(diffArgs({ kind: "base", ref: "main" })).toContain("main...HEAD");
  });

  it("passes a range through unchanged", () => {
    expect(diffArgs({ kind: "range", expression: "a..b" })).toContain("a..b");
  });

  it("pins the prefixes the diff parser depends on", () => {
    const args = diffArgs({ kind: "worktree" });

    expect(args).toContain("--src-prefix=a/");
    expect(args).toContain("--dst-prefix=b/");
    expect(args).toContain("--unified=0");
    expect(args).toContain("-M");
  });
});

describe("countLines", () => {
  it.each([
    ["a\nb\n", 2],
    ["a\nb", 2],
    ["", 0],
    ["\n", 1],
  ])("counts %j as %i lines", (text, expected) => {
    expect(countLines(text)).toBe(expected);
  });
});

describe("findVitestPackages", () => {
  it("finds every workspace package holding a vitest.config.ts", () => {
    const directory = temporaryDirectory();
    writeAll(directory, {
      "pnpm-workspace.yaml": [
        "onlyBuiltDependencies:",
        "  - esbuild",
        "",
        "packages:",
        "  - packages/*",
        '  - "verify"',
        "  - apps/*",
        "  - apps/*/desktop",
        "",
        "allowBuilds:",
        "  esbuild: true",
        "",
      ].join("\n"),
      "vitest.config.ts": "",
      "packages/shared/vitest.config.ts": "",
      "packages/shared/src/index.ts": "",
      "packages/.hidden/vitest.config.ts": "",
      "packages/node_modules/vitest.config.ts": "",
      "verify/vitest.config.ts": "",
      "apps/plan/vitest.config.ts": "",
      "apps/plan/node_modules/thing/vitest.config.ts": "",
      "apps/clips/desktop/vitest.config.ts": "",
      "docs/research/deep/vitest.config.ts": "",
    });

    const found = findVitestPackages(directory).map((entry) =>
      path.relative(directory, entry),
    );

    expect(found.sort()).toEqual([
      "",
      "apps/clips/desktop",
      "apps/plan",
      "packages/shared",
      "verify",
    ]);
  });

  it("reads the packages block only, not the lists after it", () => {
    const directory = temporaryDirectory();
    writeAll(directory, {
      "pnpm-workspace.yaml": [
        "packages:",
        "  - packages/*",
        "",
        "ignoredBuiltDependencies:",
        "  - some-package",
        "",
      ].join("\n"),
      "vitest.config.ts": "",
      "packages/shared/vitest.config.ts": "",
      "some-package/vitest.config.ts": "",
    });

    const found = findVitestPackages(directory).map((entry) =>
      path.relative(directory, entry),
    );

    expect(found.sort()).toEqual(["", "packages/shared"]);
  });

  it("finds the root alone when there is no workspace file", () => {
    const directory = temporaryDirectory();
    writeAll(directory, {
      "vitest.config.ts": "",
      "packages/shared/vitest.config.ts": "",
    });

    expect(findVitestPackages(directory)).toEqual([directory]);
  });
});

describe("reportPath", () => {
  it("points at the package's coverage-final.json", () => {
    expect(reportPath("/repo/apps/plan")).toBe(
      "/repo/apps/plan/coverage/coverage-final.json",
    );
  });
});

describe("runCoverage", () => {
  function packageWithVitest(): string {
    const directory = temporaryDirectory();
    const binary = path.join(directory, "node_modules", ".bin");
    fs.mkdirSync(binary, { recursive: true });
    fs.writeFileSync(path.join(binary, "vitest"), "");
    return directory;
  }

  it("runs the package's own vitest binary with coverage on", () => {
    const directory = packageWithVitest();
    const calls: { command: string; args: readonly string[]; cwd: string }[] =
      [];

    const failed = runCoverage([directory], (command, args, cwd) => {
      calls.push({ command, args, cwd });
      return 0;
    });

    expect(failed).toEqual([]);
    expect(calls).toEqual([
      {
        command: path.join(directory, "node_modules", ".bin", "vitest"),
        args: ["run", "--coverage"],
        cwd: directory,
      },
    ]);
  });

  it("returns the packages whose suite failed", () => {
    const passing = packageWithVitest();
    const failing = packageWithVitest();

    const failed = runCoverage([passing, failing], (_command, _args, cwd) =>
      cwd === failing ? 1 : 0,
    );

    expect(failed).toEqual([failing]);
  });

  it("refuses a package that has a config but no vitest installed", () => {
    const directory = temporaryDirectory();

    expect(() => runCoverage([directory], () => 0)).toThrow(
      /no vitest installed/,
    );
  });
});

describe("readReport", () => {
  it("returns undefined when the package produced no report", () => {
    expect(readReport(temporaryDirectory())).toBeUndefined();
  });

  it("parses the report when it exists", () => {
    const directory = temporaryDirectory();
    writeAll(directory, {
      "coverage/coverage-final.json": JSON.stringify({ "/a.ts": {} }),
    });

    expect(readReport(directory)).toEqual({ "/a.ts": {} });
  });
});

describe("createIo", () => {
  it("reports the repository root from any directory inside it", () => {
    const directory = repositoryWith({ "nested/a.txt": "a\n" });

    expect(createIo(path.join(directory, "nested")).repoRoot).toBe(directory);
  });

  it("sees an uncommitted edit and an untracked file", () => {
    const directory = repositoryWith({ "src/a.ts": numberedLines("first") });
    writeAll(directory, {
      "src/a.ts": numberedLines("first").replace(
        `const line2 = "first";`,
        `const line2 = "edited";`,
      ),
      "src/new.ts": "const added = 1;\nconst also = 2;\n",
    });
    const io = createIo(directory);

    expect(parseUnifiedDiff(io.diff({ kind: "worktree" }))).toEqual([
      { path: "src/a.ts", lines: [3] },
    ]);
    expect(io.untrackedFiles()).toEqual(["src/new.ts"]);
    expect(io.countLines("src/new.ts")).toBe(2);
    expect(io.readFile("src/new.ts")).toBe(
      "const added = 1;\nconst also = 2;\n",
    );
    expect(io.readFile("src/no-such-file.ts")).toBeUndefined();
  });

  it("counts only the edited line of a renamed file, not the whole move", () => {
    const directory = repositoryWith({ "src/old.ts": numberedLines("first") });
    const base = repoGit(directory, ["rev-parse", "HEAD"]).trim();

    repoGit(directory, ["mv", "src/old.ts", "src/new.ts"]);
    writeAll(directory, {
      "src/new.ts": numberedLines("first").replace(
        `const line7 = "first";`,
        `const line7 = "moved";`,
      ),
    });
    repoGit(directory, ["add", "."]);
    repoGit(directory, ["commit", "--no-verify", "-m", "move and edit"]);

    const diffText = createIo(directory).diff({ kind: "base", ref: base });

    expect(diffText).toContain("rename to src/new.ts");
    expect(parseUnifiedDiff(diffText)).toEqual([
      { path: "src/new.ts", lines: [8] },
    ]);
  });

  it("supports a raw range", () => {
    const directory = repositoryWith({ "src/a.ts": "const a = 1;\n" });
    writeAll(directory, { "src/a.ts": "const a = 1;\nconst b = 2;\n" });
    repoGit(directory, ["add", "."]);
    repoGit(directory, ["commit", "--no-verify", "-m", "second"]);

    const parsed = parseUnifiedDiff(
      createIo(directory).diff({
        kind: "range",
        expression: "HEAD~1..HEAD",
      }),
    );

    expect(parsed).toEqual([{ path: "src/a.ts", lines: [2] }]);
  });

  it("finds packages, reads reports, and runs nothing when given no packages", () => {
    const directory = repositoryWith({
      "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
      "apps/plan/vitest.config.ts": "",
      "apps/plan/coverage/coverage-final.json": JSON.stringify({
        "/a.ts": { statementMap: {}, s: {} },
      }),
    });
    const io = createIo(directory);

    expect(io.findPackages()).toEqual([path.join(directory, "apps", "plan")]);
    expect(io.readReport(path.join(directory, "apps", "plan"))).toEqual({
      "/a.ts": { statementMap: {}, s: {} },
    });
    expect(io.runCoverage([])).toEqual([]);
  });

  it("writes its output to stdout", () => {
    const directory = repositoryWith({ "a.txt": "a\n" });
    const written: string[] = [];
    const write = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown): boolean => {
        written.push(String(chunk));
        return true;
      });

    try {
      createIo(directory).log("measured");
    } finally {
      write.mockRestore();
    }

    expect(written).toEqual(["measured\n"]);
  });
});
