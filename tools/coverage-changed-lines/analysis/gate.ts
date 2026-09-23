/**
 * The gate itself: which touched lines are in scope, which of those a test
 * executed, and how the answer is printed. Pure.
 *
 * Exclusions come from packages/shared/vitest-coverage-config.ts, the same
 * module every vitest.config.ts merges, and are applied here the same way
 * vitest applies them. If the two ever diverged, a file vitest declined to
 * instrument would be reported here as having no coverage, which is a failure
 * nobody can act on.
 */
import path from "node:path";

import picomatch from "picomatch";

import {
  COVERABLE_EXTENSIONS,
  COVERAGE_EXCLUDE,
  COVERAGE_GATE_EXCLUDED_PATHS,
} from "../../../packages/shared/vitest-coverage-config";
import { type CoverageIndex, lineStatus } from "./coverage";
import type { TouchedFile } from "./diff";
import { linesWithCode } from "./source";

/** Why a touched line is not covered. */
export type FindingReason = "uncovered" | "no-coverage-data";

/** One touched line that fails the gate. */
export interface Finding {
  readonly path: string;
  readonly line: number;
  readonly reason: FindingReason;
}

/** What the gate measured. */
export interface GateResult {
  readonly checkedFiles: number;
  readonly checkedLines: number;
  readonly coveredLines: number;
  readonly findings: readonly Finding[];
}

/**
 * Builds the predicate that decides whether a repo-relative path is out of
 * scope.
 *
 * Three tests, in the order they are cheapest to explain:
 * the file type cannot hold an executed line; the path is a tree the gate
 * does not own; or vitest was told not to instrument it.
 *
 * The vitest test is a deliberate copy of `BaseCoverageProvider.isIncluded`:
 * the absolute path, matched with picomatch's `contains` and `dot` options,
 * with the exclusion list passed as `ignore`. This depends on the root
 * picomatch dependency staying on the version vitest resolves.
 */
export function createExclusionMatcher(
  repoRoot: string,
): (relativePath: string) => boolean {
  const isInstrumented = picomatch(["**"], {
    contains: true,
    dot: true,
    ignore: [...COVERAGE_EXCLUDE],
  });

  return (relativePath: string): boolean => {
    if (!COVERABLE_EXTENSIONS.includes(path.extname(relativePath))) return true;
    for (const excluded of COVERAGE_GATE_EXCLUDED_PATHS) {
      const matches = excluded.endsWith("/")
        ? relativePath.startsWith(excluded)
        : relativePath === excluded;
      if (matches) return true;
    }
    return !isInstrumented(path.resolve(repoRoot, relativePath));
  };
}

/**
 * Checks every touched line against the coverage reports.
 *
 * A file that survives the exclusions but appears in no report is reported as
 * `no-coverage-data`: with `coverage.include` unset, the v8 provider only
 * reports files a test actually loaded, so absence means no test reached it.
 * Failing closed there is the point of the gate, and it applies to every
 * touched line of that file, blank or comment lines included: with no report
 * at all there is nothing to read a statement span from, so there is nothing
 * to tell a blank line apart from a real one.
 *
 * When a report does exist, a touched line that carries no code - blank, or
 * entirely a comment - is skipped before it reaches `lineStatus`: it is not a
 * line any test could execute, so it belongs in neither the denominator nor
 * the findings. `readSource` supplies the line's own text for that check;
 * when it returns undefined (the file could not be read) the check is
 * skipped and the line falls back to whatever `lineStatus` says, which is the
 * gate's original, fail-closed behaviour.
 *
 * `isExcluded` is passed in rather than built here so that one matcher, and
 * therefore one compiled picomatch, serves the whole run.
 */
export function evaluate(
  touchedFiles: readonly TouchedFile[],
  index: CoverageIndex,
  repoRoot: string,
  readSource: (relativePath: string) => string | undefined,
  isExcluded: (relativePath: string) => boolean,
): GateResult {
  const findings: Finding[] = [];
  let checkedFiles = 0;
  let checkedLines = 0;
  let coveredLines = 0;

  for (const file of touchedFiles) {
    if (isExcluded(file.path)) continue;
    checkedFiles++;

    const reports = index.get(path.resolve(repoRoot, file.path));
    if (!reports) {
      for (const line of file.lines) {
        checkedLines++;
        findings.push({ path: file.path, line, reason: "no-coverage-data" });
      }
      continue;
    }

    const sourceText = readSource(file.path);
    const codeLines =
      sourceText === undefined ? undefined : linesWithCode(sourceText);

    for (const line of file.lines) {
      if (codeLines !== undefined && codeLines[line] === false) continue;

      const status = lineStatus(reports, line);
      if (status === "not-executable") continue;
      checkedLines++;
      if (status === "covered") coveredLines++;
      else findings.push({ path: file.path, line, reason: "uncovered" });
    }
  }

  return { checkedFiles, checkedLines, coveredLines, findings };
}

/** Renders the result as the text the command prints. */
export function formatReport(result: GateResult): string {
  const { checkedFiles, checkedLines, coveredLines, findings } = result;
  const headline =
    `Changed-line coverage: ${coveredLines}/${checkedLines} touched lines ` +
    `covered across ${checkedFiles} ${checkedFiles === 1 ? "file" : "files"}.`;

  if (findings.length === 0) return headline;

  const sections: string[] = [headline];
  const groups: readonly (readonly [FindingReason, string])[] = [
    [
      "uncovered",
      "Executed by no test (add a case that asserts on these lines):",
    ],
    ["no-coverage-data", "No test loads this file at all:"],
  ];

  for (const [reason, title] of groups) {
    const lines = findings.filter((finding) => finding.reason === reason);
    if (lines.length === 0) continue;
    sections.push(
      `\n${title}\n` +
        lines.map(({ path: file, line }) => `  ${file}:${line}`).join("\n"),
    );
  }

  return sections.join("\n");
}
