/**
 * Orchestration: argv in, printed report and exit code out.
 *
 * The I/O it needs arrives as a `ChangedLineCoverageIo`, so the pipeline can be
 * driven end to end by a test without running vitest inside vitest.
 */
import path from "node:path";

import {
  type FileStatements,
  mergeCoverageIndexes,
  readCoverageReport,
} from "../analysis/coverage";
import {
  parseUnifiedDiff,
  type TouchedFile,
  wholeFile,
} from "../analysis/diff";
import {
  createExclusionMatcher,
  evaluate,
  formatReport,
} from "../analysis/gate";
import type { ChangedLineCoverageIo } from "../io/io";
import { type DiffMode, HELP, type Options, parseArgs } from "./args";

/** Exit codes, so the caller and the help text cannot drift apart. */
export const EXIT_COVERED = 0;
export const EXIT_UNCOVERED = 1;
export const EXIT_CANNOT_MEASURE = 2;

/**
 * Untracked files count as wholly added.
 *
 * `git diff` cannot see them, so without this a new file would pass the gate
 * until the moment someone staged it - exactly backwards for a check whose job
 * is to run before the commit. Excluded paths are filtered first so the gate
 * never reads a new screenshot looking for lines.
 */
function untrackedTouchedFiles(
  io: ChangedLineCoverageIo,
  isExcluded: (relativePath: string) => boolean,
): TouchedFile[] {
  return io
    .untrackedFiles()
    .filter((relativePath) => !isExcluded(relativePath))
    .map((relativePath) =>
      wholeFile(relativePath, io.countLines(relativePath)),
    );
}

/** Reads every package's report, warning about the ones that produced none. */
function collectCoverage(
  io: ChangedLineCoverageIo,
  packageDirs: readonly string[],
): Map<string, FileStatements>[] {
  const indexes: Map<string, FileStatements>[] = [];
  for (const packageDir of packageDirs) {
    const relativeDir = path.relative(io.repoRoot, packageDir) || ".";
    const document = io.readReport(packageDir);
    if (document === undefined) {
      io.log(`Warning: ${relativeDir} produced no coverage report.`);
      continue;
    }
    indexes.push(
      readCoverageReport(document, `${relativeDir} coverage report`),
    );
  }
  return indexes;
}

/** Describes the comparison in the summary line. */
function describeMode(mode: DiffMode): string {
  if (mode.kind === "worktree")
    return "working tree against HEAD, including untracked files";
  if (mode.kind === "base") return `${mode.ref}...HEAD`;
  return mode.expression;
}

/**
 * Everything the gate does once the arguments are known.
 *
 * The exclusion matcher is built here, once, and handed to both the untracked
 * file filter and the gate: compiling it is picomatch's work over the whole
 * exclusion list, and the two used to compile one each.
 */
function measure(options: Options, io: ChangedLineCoverageIo): number {
  const { mode, skipRun } = options;
  const packageDirs = io.findPackages();

  if (!skipRun) {
    const failed = io.runCoverage(packageDirs);
    if (failed.length > 0) {
      const names = failed
        .map((dir) => path.relative(io.repoRoot, dir) || ".")
        .join(", ");
      io.log(
        `Cannot measure changed-line coverage: the suite failed in ${names}.`,
      );
      return EXIT_CANNOT_MEASURE;
    }
  }

  const isExcluded = createExclusionMatcher(io.repoRoot);
  const index = mergeCoverageIndexes(collectCoverage(io, packageDirs));
  const touched = [...parseUnifiedDiff(io.diff(mode))];
  if (mode.kind === "worktree") {
    touched.push(...untrackedTouchedFiles(io, isExcluded));
  }

  const result = evaluate(touched, index, io.repoRoot, io.readFile, isExcluded);
  io.log(`Comparing ${describeMode(mode)}.`);
  io.log(formatReport(result));

  return result.findings.length > 0 ? EXIT_UNCOVERED : EXIT_COVERED;
}

/**
 * Runs the gate. Returns the process exit code.
 *
 * The catch is what keeps the two failing exit codes apart: a bad `--range`
 * expression, a truncated report, or a missing vitest is something the gate
 * could not measure, not a run that found uncovered lines.
 */
export function run(
  argv: readonly string[],
  io: ChangedLineCoverageIo,
): number {
  const parsed = parseArgs(argv);
  if (parsed.kind === "help") {
    io.log(HELP);
    return EXIT_COVERED;
  }
  if (parsed.kind === "error") {
    io.log(`${parsed.message}\n\n${HELP}`);
    return EXIT_CANNOT_MEASURE;
  }

  try {
    return measure(parsed.options, io);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    io.log(`Cannot measure changed-line coverage: ${detail}`);
    return EXIT_CANNOT_MEASURE;
  }
}
