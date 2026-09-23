/**
 * Reads Istanbul-shaped coverage reports and answers, per line, whether a test
 * executed it. Pure: the caller supplies parsed JSON.
 *
 * `coverage-final.json` maps an absolute file path to a `statementMap` of
 * statement id to source range, plus `s`, the hit count per statement id. Two
 * rules turn that into a per-line answer:
 *
 * 1. If any statement *starts* on the line, the line's count is the highest of
 *    those. This is how Istanbul itself computes line coverage
 *    (`FileCoverage.getLineCoverage`), and it is what makes a nested
 *    never-executed statement visible: in `items.forEach(i => doThing(i))`
 *    spread over three lines, the callback body starts on its own line and
 *    keeps its own zero count even though the enclosing call ran.
 * 2. Otherwise the line is a continuation of some enclosing statement - the
 *    middle of a multi-line call, say - and takes the count of the smallest
 *    statement whose range contains it.
 *
 * A line no statement starts on or contains is not executable: a blank line, a
 * comment, a type annotation, a closing brace.
 */

/** One statement's source range and hit count. */
export interface StatementSpan {
  readonly startLine: number;
  readonly endLine: number;
  readonly count: number;
}

/** Every statement recorded for one file by one report. */
export interface FileStatements {
  readonly spans: readonly StatementSpan[];
}

/**
 * Absolute file path to the per-report statement sets that mention it. A file
 * appears more than once when several packages' suites load it.
 */
export type CoverageIndex = ReadonlyMap<string, readonly FileStatements[]>;

/** Whether a test executed a line. */
export type LineStatus = "covered" | "uncovered" | "not-executable";

interface IstanbulPosition {
  readonly line: number;
}

interface IstanbulRange {
  readonly start: IstanbulPosition;
  readonly end: IstanbulPosition;
}

interface IstanbulFileCoverage {
  readonly statementMap: Readonly<Record<string, IstanbulRange>>;
  readonly s: Readonly<Record<string, number>>;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosition(value: unknown): value is IstanbulPosition {
  return isRecord(value) && typeof value.line === "number";
}

function isRange(value: unknown): value is IstanbulRange {
  return isRecord(value) && isPosition(value.start) && isPosition(value.end);
}

/** Type guard for one file's entry in a coverage-final.json document. */
export function isIstanbulFileCoverage(
  value: unknown,
): value is IstanbulFileCoverage {
  if (!isRecord(value)) return false;
  if (!isRecord(value.statementMap) || !isRecord(value.s)) return false;
  return (
    Object.values(value.statementMap).every(isRange) &&
    Object.values(value.s).every((count) => typeof count === "number")
  );
}

/**
 * Converts one parsed coverage-final.json into statement spans per file.
 *
 * Throws on a document that is not shaped like a coverage report: a silently
 * empty index would make the gate pass everything.
 */
export function readCoverageReport(
  document: unknown,
  source: string,
): Map<string, FileStatements> {
  if (!isRecord(document)) {
    throw new Error(`${source} is not a coverage report: expected an object.`);
  }

  const index = new Map<string, FileStatements>();
  for (const [path, entry] of Object.entries(document)) {
    if (!isIstanbulFileCoverage(entry)) {
      throw new Error(`${source} has no Istanbul statement data for ${path}.`);
    }
    const spans: StatementSpan[] = [];
    for (const [id, range] of Object.entries(entry.statementMap)) {
      spans.push({
        startLine: range.start.line,
        endLine: range.end.line,
        count: entry.s[id] ?? 0,
      });
    }
    index.set(path, { spans });
  }
  return index;
}

/** Unions per-package indexes, keeping every report that mentions a file. */
export function mergeCoverageIndexes(
  indexes: readonly Map<string, FileStatements>[],
): CoverageIndex {
  const merged = new Map<string, FileStatements[]>();
  for (const index of indexes) {
    for (const [path, statements] of index) {
      const existing = merged.get(path);
      if (existing) existing.push(statements);
      else merged.set(path, [statements]);
    }
  }
  return merged;
}

/** Status of a line within one report. */
function statusInReport(statements: FileStatements, line: number): LineStatus {
  let startCount: number | undefined;
  let innermost: StatementSpan | undefined;

  for (const span of statements.spans) {
    if (span.startLine === line) {
      startCount =
        startCount === undefined
          ? span.count
          : Math.max(startCount, span.count);
    }
    if (span.startLine <= line && line <= span.endLine) {
      const isSmaller =
        innermost === undefined ||
        span.endLine - span.startLine < innermost.endLine - innermost.startLine;
      if (isSmaller) innermost = span;
    }
  }

  if (startCount !== undefined) return startCount > 0 ? "covered" : "uncovered";
  if (innermost) return innermost.count > 0 ? "covered" : "uncovered";
  return "not-executable";
}

/**
 * Status of a line across every report that mentions the file. Reports are
 * combined at the status level rather than by merging statement maps, because
 * two packages can transform the same file differently and produce statement
 * ids that do not line up.
 */
export function lineStatus(
  reports: readonly FileStatements[],
  line: number,
): LineStatus {
  let sawUncovered = false;
  for (const report of reports) {
    const status = statusInReport(report, line);
    if (status === "covered") return "covered";
    if (status === "uncovered") sawUncovered = true;
  }
  return sawUncovered ? "uncovered" : "not-executable";
}
