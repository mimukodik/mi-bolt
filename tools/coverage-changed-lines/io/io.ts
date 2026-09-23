/**
 * Everything the gate does outside its own process: run git, walk the
 * workspace, run each package's suite with coverage, read the reports.
 *
 * All of it is synchronous. The gate is a single linear pipeline and the
 * suites have to finish before the reports can be read, so there is nothing to
 * overlap, and staying synchronous keeps the orchestration in cli/run.ts
 * readable.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import picomatch from "picomatch";

import {
  COVERAGE_FINAL_JSON,
  COVERAGE_REPORTS_DIRECTORY,
} from "../../../packages/shared/vitest-coverage-config";
import type { DiffMode } from "../cli/args";

/** The side of the gate that touches the outside world. */
export interface ChangedLineCoverageIo {
  /** Absolute path to the repository root. */
  readonly repoRoot: string;
  /** Unified diff text for the requested comparison. */
  readonly diff: (mode: DiffMode) => string;
  /** Untracked, non-ignored files, as repo-relative paths. */
  readonly untrackedFiles: () => readonly string[];
  /** Line count of a repo-relative file. */
  readonly countLines: (relativePath: string) => number;
  /** Full text of a repo-relative file, or undefined when it cannot be read. */
  readonly readFile: (relativePath: string) => string | undefined;
  /** Absolute directories holding a vitest.config.ts, nearest the root first. */
  readonly findPackages: () => readonly string[];
  /** Runs coverage in each package, returning the ones whose suite failed. */
  readonly runCoverage: (packageDirs: readonly string[]) => readonly string[];
  /** Parsed coverage-final.json for a package, or undefined when absent. */
  readonly readReport: (packageDir: string) => unknown;
  /** Where the command's own output goes. */
  readonly log: (line: string) => void;
}

/** Result of a captured subprocess. */
export interface CommandResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a command and captures its output. */
export function runCommand(
  command: string,
  args: readonly string[],
  cwd: string,
): CommandResult {
  const result = spawnSync(command, [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/** Runs a command with its output attached to this process, returning its status. */
export function runCommandAttached(
  command: string,
  args: readonly string[],
  cwd: string,
): number {
  const result = spawnSync(command, [...args], { cwd, stdio: "inherit" });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/** Runs git, throwing with git's own message when it fails. */
export function git(args: readonly string[], cwd: string): string {
  const result = runCommand("git", args, cwd);
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed:\n${result.stderr.trim()}`);
  }
  return result.stdout;
}

/** Absolute path of the repository containing cwd. */
export function findRepoRoot(cwd: string): string {
  return git(["rev-parse", "--show-toplevel"], cwd).trim();
}

/**
 * The git arguments that produce the diff the gate parses.
 *
 * The prefixes are pinned rather than left to configuration because the parser
 * strips a literal `b/`, and `diff.noprefix` or `diff.mnemonicPrefix` in a
 * developer's global git config would otherwise change the header format.
 */
export function diffArgs(mode: DiffMode): string[] {
  const revisions =
    mode.kind === "worktree"
      ? ["HEAD"]
      : mode.kind === "base"
        ? [`${mode.ref}...HEAD`]
        : [mode.expression];

  return [
    "-c",
    "core.quotePath=false",
    "diff",
    "--no-ext-diff",
    "--no-color",
    "-M",
    "--unified=0",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    ...revisions,
  ];
}

/** Counts the lines in a file, with or without a trailing newline. */
export function countLines(text: string): number {
  const parts = text.split("\n");
  return parts[parts.length - 1] === "" ? parts.length - 1 : parts.length;
}

/**
 * The workspace's package globs, as pnpm-workspace.yaml declares them.
 *
 * Read from that file rather than repeated here, so the gate and pnpm cannot
 * disagree about what a package is. Only the `packages:` block is read, and
 * only its `- <glob>` entries, which is the shape the file has. A checkout
 * without such a block leaves the search with the repository root alone; the
 * gate then finds no report for the other packages and fails closed on their
 * touched lines rather than passing them.
 */
function workspacePackageGlobs(repoRoot: string): string[] {
  const file = path.join(repoRoot, "pnpm-workspace.yaml");
  if (!fs.existsSync(file)) return [];

  const globs: string[] = [];
  let inPackages = false;
  for (const textLine of fs.readFileSync(file, "utf8").split("\n")) {
    if (textLine.trimEnd() === "packages:") {
      inPackages = true;
      continue;
    }
    if (!inPackages) continue;
    const glob = /^\s+-\s+(.+?)\s*$/.exec(textLine)?.[1];
    if (glob === undefined) break;
    globs.push(glob);
  }
  return globs;
}

/**
 * The directories one workspace glob names.
 *
 * Expanded one path segment at a time, so `*` matches a directory name and
 * nothing deeper, which is all the workspace file asks for. picomatch does the
 * matching, so a dot directory is skipped by its `dot: false` default and a
 * quoted entry needs no unquoting here; node_modules is skipped by hand,
 * because a package glob would otherwise reach into an installed dependency
 * tree.
 */
function expandPackageGlob(repoRoot: string, glob: string): string[] {
  let directories = [repoRoot];
  for (const segment of glob.split("/")) {
    const matchesSegment = picomatch(segment);
    directories = directories.flatMap((directory) =>
      fs
        .readdirSync(directory, { withFileTypes: true })
        .filter(
          (entry) =>
            entry.isDirectory() &&
            entry.name !== "node_modules" &&
            matchesSegment(entry.name),
        )
        .map((entry) => path.join(directory, entry.name)),
    );
  }
  return directories;
}

/**
 * Directories holding a vitest.config.ts: the repository root and the
 * workspace's own packages.
 *
 * Discovered by expanding the workspace globs rather than read from a list, so
 * a package added later is gated without anyone remembering to register it.
 * The globs are also what keeps this cheap: the full walk this replaces read
 * every directory in the repository, 233 of them when it was measured, docs
 * and research trees included, to find seven files.
 */
export function findVitestPackages(repoRoot: string): string[] {
  const candidates = new Set<string>([repoRoot]);
  for (const glob of workspacePackageGlobs(repoRoot)) {
    for (const directory of expandPackageGlob(repoRoot, glob))
      candidates.add(directory);
  }

  return [...candidates].filter((directory) =>
    fs.existsSync(path.join(directory, "vitest.config.ts")),
  );
}

/** Absolute path of a package's coverage-final.json. */
export function reportPath(packageDir: string): string {
  return path.join(packageDir, COVERAGE_REPORTS_DIRECTORY, COVERAGE_FINAL_JSON);
}

/**
 * Runs each package's suite with coverage, returning the directories whose run
 * failed.
 *
 * The package's own vitest binary is invoked directly. Going through pnpm
 * would put the gate at the mercy of which package's node_modules/.bin happens
 * to be on PATH.
 */
export function runCoverage(
  packageDirs: readonly string[],
  run: (
    command: string,
    args: readonly string[],
    cwd: string,
  ) => number = runCommandAttached,
): string[] {
  const failed: string[] = [];
  for (const packageDir of packageDirs) {
    const binary = path.join(packageDir, "node_modules", ".bin", "vitest");
    if (!fs.existsSync(binary)) {
      throw new Error(
        `${packageDir} has a vitest.config.ts but no vitest installed at ${binary}.`,
      );
    }
    if (run(binary, ["run", "--coverage"], packageDir) !== 0)
      failed.push(packageDir);
  }
  return failed;
}

/** Reads and parses a package's coverage report, or undefined when it has none. */
export function readReport(packageDir: string): unknown {
  const file = reportPath(packageDir);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Wires the real git, filesystem and subprocesses together. */
export function createIo(cwd: string): ChangedLineCoverageIo {
  const repoRoot = findRepoRoot(cwd);
  return {
    repoRoot,
    diff: (mode) => git(diffArgs(mode), repoRoot),
    untrackedFiles: () =>
      git(["ls-files", "--others", "--exclude-standard", "-z"], repoRoot)
        .split("\0")
        .filter((entry) => entry !== ""),
    countLines: (relativePath) =>
      countLines(fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8")),
    readFile: (relativePath) => {
      try {
        return fs.readFileSync(path.resolve(repoRoot, relativePath), "utf8");
      } catch {
        return undefined;
      }
    },
    findPackages: () => findVitestPackages(repoRoot),
    runCoverage: (packageDirs) => runCoverage(packageDirs),
    readReport,
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
  };
}
