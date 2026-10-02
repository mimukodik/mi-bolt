#!/usr/bin/env node
/**
 * summarize-gate-output.mjs
 *
 * Purpose: run one of the four pre-commit gate commands and print only the
 * part of its output a reader acts on: each failure as
 * `path[:line[:col]] <rule or test name> — <message>`, one count line per
 * project or task, and a last line with the gate's exit code and the path of
 * the full log. A gate's raw output runs to hundreds of lines (coverage
 * tables, bundle tables, task banners, runtime warnings); the failures in it
 * are a handful. Nothing is discarded: the whole combined stdout and stderr
 * go to the log file, and only the printed summary is shorter.
 *
 * Prerequisites: Node 26; run from the repository root; frontend
 * dependencies installed in frontend/node_modules; a JDK for backend-build.
 *
 * Command (run from the repository root; the script path below is relative
 *   to this skill's directory, so give it as seen from the root):
 *   node scripts/summarize-gate-output.mjs frontend-test [extra ng test args]
 *   node scripts/summarize-gate-output.mjs frontend-lint [files...]
 *   node scripts/summarize-gate-output.mjs frontend-build
 *   node scripts/summarize-gate-output.mjs backend-build
 *
 * What each subcommand runs, from the repository root unless noted:
 *   frontend-test   npm --prefix frontend run test -- [extra] --reporters minimal --no-watch
 *                   Vitest's minimal reporter prints failed tests only. The
 *                   coverage figures come from each project's
 *                   coverage-summary.json, compared with that project's
 *                   coverageThresholds in frontend/angular.json.
 *   frontend-lint   With files, from frontend/, each file given relative to
 *                   frontend/: npx eslint --format json -o <log dir>/eslint.json <files>
 *                   With none: npm --prefix frontend run lint -- --format json
 *                   --output-file <log dir>/eslint-{projectName}.json
 *                   (the lint builder fills in {projectName}, so each
 *                   project writes its own report).
 *   frontend-build  npm --prefix frontend run build
 *   backend-build   backend/gradlew -p backend :services:commerce:build
 *                   Never with -q: it drops the per-task test count line
 *                   while PMD's lines still print. Failing tests are read
 *                   from the JUnit XML files this run wrote under
 *                   backend/services/commerce/build/test-results/<task>/.
 *
 * Exit codes:
 *   The gate's own exit code, unchanged; a gate killed by a signal exits 1.
 *   The code is never derived from what the parsers found.
 *   2 - also when the gate cannot be run at all: a usage error, a working
 *       directory with no .git, or a command that fails to start. Those
 *       print a message to stderr and no summary.
 *
 * Guarantees:
 *   - When the gate exits non-zero and no failure was recognised, the last
 *     40 lines of the log are printed, so a failure is never hidden behind
 *     an empty summary.
 *   - A report file (coverage summary, JUnit XML) is read only when its
 *     modification time says this run wrote it, so a report left by an
 *     earlier run is never taken for this one.
 *   - Paths are printed relative to the repository root; columns are
 *     1-based.
 *
 * Writes: a fresh directory under the system temp directory holding the log
 * (and the lint reports). The gate runs with NO_COLOR=1 and without
 * FORCE_COLOR, so the log is plain text; every command is started with an
 * argument array, never a shell string.
 */

import { spawn } from 'node:child_process';
import {
  createWriteStream,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TAIL_LINE_COUNT = 40;
// A report counts as written by this run when its modification time is no
// earlier than the gate's start less this slack, which covers file systems
// that store modification times with a coarse resolution.
const FRESHNESS_SLACK_MS = 2000;
const MAX_MESSAGE_LENGTH = 500;
const MAX_WENT_WRONG_LINES = 40;

const FRONTEND_DIR = 'frontend';
const BACKEND_PROJECT_DIR = 'backend/services/commerce';
const TEST_RESULTS_DIR = `${BACKEND_PROJECT_DIR}/build/test-results`;
const TEST_SOURCE_DIR = `${BACKEND_PROJECT_DIR}/src/test/java`;
const MAIN_SOURCE_DIR = `${BACKEND_PROJECT_DIR}/src/main/java`;

// The tasks `:services:commerce:build` runs that can fail the gate, in the
// order they run, each with the kind of count line it gets.
const BACKEND_TASKS = [
  ['compileJava', 'compile'],
  ['compileTestJava', 'compile'],
  ['test', 'tests'],
  ['integrationTest', 'tests'],
  ['jacocoTestCoverageVerification', 'coverage'],
  ['pmdMain', 'pmd'],
  ['pmdTest', 'pmd'],
];

const USAGE = `usage: summarize-gate-output.mjs <gate> [args]
  frontend-test [extra ng test args]
  frontend-lint [files relative to frontend/]
  frontend-build
  backend-build`;

// ---------------------------------------------------------------------------
// Text helpers

const ANSI_PATTERN = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;

export function stripAnsi(text) {
  return text.replace(ANSI_PATTERN, '');
}

// Plain lines as a terminal would show them: escape sequences removed, and a
// carriage return inside a line (a spinner redrawing itself) keeps only what
// was drawn last.
export function toLines(text) {
  return stripAnsi(text)
    .split(/\r?\n/)
    .map((line) => line.split('\r').filter((part) => part !== '').at(-1) ?? '');
}

function truncate(text) {
  const trimmed = text.trim();
  return trimmed.length > MAX_MESSAGE_LENGTH ? `${trimmed.slice(0, MAX_MESSAGE_LENGTH)}…` : trimmed;
}

function firstLine(text) {
  return (text ?? '').split(/\r?\n/).find((line) => line.trim() !== '')?.trim() ?? '';
}

function plural(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

// A tool prints a path either absolute or relative to its own working
// directory (`baseDir`, repository-relative); both come out
// repository-relative. An absolute path outside the repository is kept.
export function toRepoPath(file, baseDir, repoRoot) {
  if (path.isAbsolute(file)) {
    const relative = path.relative(repoRoot, file);
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return file;
    return toPosix(relative);
  }
  return toPosix(path.normalize(path.join(baseDir, file)));
}

function position(file, line, column) {
  return [file, line, column].filter((part) => part !== undefined && part !== null && part !== '').join(':');
}

function finding(severity, location, name, message) {
  return { severity, location, name, message: truncate(message) };
}

export function formatItem(item) {
  const marker = item.severity === 'warning' ? ' (warning)' : '';
  return `${item.location} ${item.name}${marker} — ${item.message}`;
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function isFresh(file, startedAt) {
  try {
    return statSync(file).mtimeMs >= startedAt - FRESHNESS_SLACK_MS;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Build messages, printed by @angular/build through esbuild's formatMessages
// (node_modules/@angular/build/src/tools/esbuild/utils.js, logMessages), in
// both `ng build` and the build step of `ng test`. The shape, per
// https://esbuild.github.io/api/:
//
//   ✘ [ERROR] TS2322: Type 'string' is not assignable to type 'number'. [plugin angular-compiler]
//
//       projects/app/src/file.ts:3:8:
//         3 │ ...
//
// The text of a TypeScript or Angular compiler diagnostic starts with its
// code, `TS####:` or `NG####:`
// (node_modules/@angular/build/src/tools/esbuild/angular/diagnostics.js).
// esbuild's column is 0-based (node_modules/esbuild/lib/main.d.ts, Location);
// it is printed 1-based here.

const BUILD_MESSAGE_HEADER = /^\s*[✘▲]\s+\[(ERROR|WARNING)\]\s+(.*)$/;
const BUILD_MESSAGE_LOCATION = /^\s+(\S.*?):(\d+):(\d+):\s*$/;
const DIAGNOSTIC_CODE = /^((?:TS|NG)\d+):\s*(.*)$/;
// The patterns `npm --prefix frontend run build:check` fails on
// (frontend/scripts/build-check.mjs, "WARNING_PATTERNS"), applied to lines outside a message block.
const BUILD_WARNING_PATTERNS = [/\bWARNING\b/, /▲ \[WARNING\]/, /\bNG[0-9]{4}\b/];

export function parseBuildMessages(lines, { label, repoRoot }) {
  const items = [];
  const blockLines = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i].match(BUILD_MESSAGE_HEADER);
    if (!header) continue;
    blockLines.add(i);
    let j = i + 1;
    // A multi-line message text continues directly under the header.
    while (j < lines.length && lines[j].trim() !== '' && !BUILD_MESSAGE_HEADER.test(lines[j])) {
      blockLines.add(j);
      j += 1;
    }
    let k = j;
    while (k < lines.length && lines[k].trim() === '') k += 1;
    const at = k < lines.length ? lines[k].match(BUILD_MESSAGE_LOCATION) : null;
    // The rest of the block (location, code frame, notes) is indented by at
    // least two spaces.
    while (j < lines.length && (lines[j].trim() === '' || /^\s{2}/.test(lines[j])) && !BUILD_MESSAGE_HEADER.test(lines[j])) {
      blockLines.add(j);
      j += 1;
    }
    const location = at
      ? position(toRepoPath(at[1], FRONTEND_DIR, repoRoot), at[2], String(Number(at[3]) + 1))
      : label;
    const coded = header[2].match(DIAGNOSTIC_CODE);
    items.push(
      finding(
        header[1] === 'ERROR' ? 'error' : 'warning',
        location,
        coded ? coded[1] : 'build',
        coded ? coded[2] : header[2],
      ),
    );
    i = j - 1;
  }
  return { items, blockLines };
}

// ---------------------------------------------------------------------------
// frontend-test

// @angular/build prints this line before each project's run
// (node_modules/@angular/build/src/builders/unit-test/runners/vitest/index.js).
const VITEST_CONFIG_BANNER = /Using Vitest configuration file: (.+)$/;
// Vitest's failure summary (BaseReporter.printErrorsSummary in
// node_modules/vitest/dist/chunks/index.*.js): a ` FAIL ` line per failed
// test or suite, the error message, stack frames as `❯ path:line:col`, and a
// divider before the next one.
const FAIL_LINE = /^\s*FAIL\s+(.*\S)\s*$/;
const FRAME_LINE = /^\s*❯\s+(?:.*\s)?(\S+?):(\d+):(\d+)\s*$/;
const DIVIDER_LINE = /^\s*⎯+(?:\[\d+\/\d+\])?⎯*\s*$/;
const BANNER_LINE = /^\s*⎯+\s+(.+?)\s+⎯+\s*$/;
const ORIGIN_LINE = /This error originated in "([^"]+)" test file/;
const TESTS_SUMMARY = /^\s*Tests\s+(\S.*?)\s*$/;
const FILES_SUMMARY = /^\s*Test Files\s+(\S.*?)\s*$/;
const ERRORS_SUMMARY = /^\s*Errors\s+(\S.*?)\s*$/;
const COVERAGE_METRICS = ['statements', 'branches', 'functions', 'lines'];

function isBlockEnd(line) {
  return (
    DIVIDER_LINE.test(line) ||
    BANNER_LINE.test(line) ||
    FAIL_LINE.test(line) ||
    TESTS_SUMMARY.test(line) ||
    FILES_SUMMARY.test(line)
  );
}

function collectBlock(lines, start) {
  const block = [];
  for (let i = start; i < lines.length && !isBlockEnd(lines[i]); i += 1) block.push(lines[i]);
  return block;
}

function framesOf(block) {
  return block
    .map((line) => line.match(FRAME_LINE))
    .filter((match) => match !== null)
    .map((match) => ({ file: match[1], line: match[2], column: match[3] }));
}

// `FAIL  <project badge>  <file>[:line:col] > <suite> > <test>`, or for a
// failed file or suite `FAIL  <badge>  <file> [ <file> ]`.
function parseFailTarget(rest) {
  const [head, ...names] = rest.replace(/\s+\[ [^\]]+ \]$/, '').split(' > ');
  const tokens = head.trim().split(/\s+/);
  return {
    file: (tokens.at(-1) ?? '').replace(/:\d+:\d+$/, ''),
    name: names.join(' > ') || '(test file)',
  };
}

export function parseVitestOutput(lines, { label, repoRoot }) {
  const items = [];
  const summary = {};
  const where = (file, line, column) => position(toRepoPath(file, FRONTEND_DIR, repoRoot), line, column);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const fail = line.match(FAIL_LINE);
    if (fail) {
      const targets = [parseFailTarget(fail[1])];
      let j = i + 1;
      for (let next = lines[j]?.match(FAIL_LINE); next; next = lines[j]?.match(FAIL_LINE)) {
        targets.push(parseFailTarget(next[1]));
        j += 1;
      }
      const block = collectBlock(lines, j);
      const message = block.find((text) => text.trim() !== '') ?? '(no message)';
      const frames = framesOf(block);
      for (const target of targets) {
        const frame = frames.find((candidate) => candidate.file === target.file) ?? frames[0];
        const location = frame ? where(frame.file, frame.line, frame.column) : where(target.file);
        const name = !frame || frame.file === target.file ? target.name : `${target.file} > ${target.name}`;
        items.push(finding('error', location, name, message));
      }
      i = j + block.length - 1;
      continue;
    }
    const banner = line.match(BANNER_LINE);
    if (banner && banner[1].startsWith('Unhandled') && banner[1] !== 'Unhandled Errors') {
      const block = collectBlock(lines, i + 1);
      const message = block.find((text) => text.trim() !== '') ?? '(no message)';
      const origin = block.map((text) => text.match(ORIGIN_LINE)).find((match) => match !== null)?.[1];
      const frames = framesOf(block);
      const frame = frames.find((candidate) => candidate.file === origin) ?? frames[0];
      const location = frame ? where(frame.file, frame.line, frame.column) : origin ? where(origin) : label;
      items.push(finding('error', location, banner[1], message));
      i += block.length;
      continue;
    }
    const tests = line.match(TESTS_SUMMARY);
    if (tests) summary.tests = tests[1];
    const files = line.match(FILES_SUMMARY);
    if (files) summary.files = files[1];
    const errors = line.match(ERRORS_SUMMARY);
    if (errors) summary.errors = errors[1];
  }
  return { items, summary };
}

function readAngularProjects(repoRoot) {
  const workspace = readJson(path.join(repoRoot, FRONTEND_DIR, 'angular.json'));
  return isRecord(workspace) && isRecord(workspace.projects) ? workspace.projects : {};
}

function testTargetOptions(projects, name) {
  const project = projects[name];
  const architect = isRecord(project) ? project.architect : undefined;
  const test = isRecord(architect) ? architect.test : undefined;
  return isRecord(test) && isRecord(test.options) ? test.options : {};
}

function projectForRunnerConfig(configPath, projects) {
  const normalized = toPosix(configPath.trim());
  for (const name of Object.keys(projects)) {
    const runnerConfig = testTargetOptions(projects, name).runnerConfig;
    if (typeof runnerConfig !== 'string') continue;
    const wanted = toPosix(path.normalize(runnerConfig));
    if (normalized === wanted || normalized.endsWith(`/${wanted}`)) return name;
  }
  return normalized.match(/projects\/([^/]+)\//)?.[1] ?? normalized;
}

// Where Vitest writes a project's coverage, as @angular/build decides it: the
// runner config's coverage.reportsDirectory, else coverage/<project>
// (node_modules/@angular/build/src/builders/unit-test/runners/vitest/plugins.js,
// generateCoverageOption). Relative to frontend/.
export function coverageReportDir(repoRoot, projectName, runnerConfig) {
  if (typeof runnerConfig === 'string') {
    try {
      const text = readFileSync(path.join(repoRoot, FRONTEND_DIR, runnerConfig), 'utf8');
      const match = text.match(/reportsDirectory:\s*['"]([^'"]+)['"]/);
      if (match) return match[1];
    } catch {
      // No readable runner config: fall back to the builder's default.
    }
  }
  return `coverage/${projectName}`;
}

export function compareCoverage(projectName, summary, thresholds) {
  const parts = [];
  const items = [];
  const total = isRecord(summary) && isRecord(summary.total) ? summary.total : {};
  for (const metric of COVERAGE_METRICS) {
    const entry = total[metric];
    const pct = isRecord(entry) ? entry.pct : undefined;
    if (typeof pct !== 'number') continue;
    const floor = isRecord(thresholds) ? thresholds[metric] : undefined;
    if (typeof floor !== 'number') {
      parts.push(`${metric} ${pct}`);
      continue;
    }
    parts.push(`${metric} ${pct}/${floor}`);
    if (pct < floor) {
      items.push(finding('error', projectName, 'coverage', `${metric} ${pct}% is below the floor of ${floor}%`));
    }
  }
  return { parts, items };
}

function splitByProject(lines, projects) {
  const sections = [{ name: undefined, lines: [] }];
  for (const line of lines) {
    const banner = line.match(VITEST_CONFIG_BANNER);
    if (banner) {
      sections.push({ name: projectForRunnerConfig(banner[1], projects), lines: [] });
      continue;
    }
    sections.at(-1).lines.push(line);
  }
  return sections;
}

export function summarizeFrontendTest({ log, repoRoot, startedAt }) {
  const projects = readAngularProjects(repoRoot);
  const items = [];
  const counts = [];
  for (const section of splitByProject(toLines(log), projects)) {
    const label = section.name ?? 'frontend';
    items.push(...parseBuildMessages(section.lines, { label, repoRoot }).items);
    const { items: testItems, summary } = parseVitestOutput(section.lines, { label, repoRoot });
    items.push(...testItems);
    if (section.name === undefined) continue;
    const options = testTargetOptions(projects, section.name);
    const reportDir = coverageReportDir(repoRoot, section.name, options.runnerConfig);
    const summaryFile = path.join(repoRoot, FRONTEND_DIR, reportDir, 'coverage-summary.json');
    let coverage = 'coverage: no report from this run';
    if (isFresh(summaryFile, startedAt)) {
      const compared = compareCoverage(section.name, readJson(summaryFile), options.coverageThresholds);
      items.push(...compared.items);
      coverage = `coverage (value/floor) ${compared.parts.join(', ') || 'unreadable'}`;
    }
    const tests = summary.tests ? `tests ${summary.tests}` : 'tests: no summary in the output';
    const errors = summary.errors ? `; errors ${summary.errors}` : '';
    counts.push(`${section.name}: ${tests}${errors}; ${coverage}`);
  }
  if (counts.length === 0) counts.push('frontend: no project run found in the output');
  return { items, counts };
}

// ---------------------------------------------------------------------------
// frontend-lint

// A report from ESLint's json formatter: an array of per-file results
// (https://eslint.org/docs/latest/use/formatters/#json).
function isEslintReport(value) {
  return (
    Array.isArray(value) &&
    value.every(
      (result) =>
        isRecord(result) &&
        typeof result.filePath === 'string' &&
        Array.isArray(result.messages) &&
        typeof result.errorCount === 'number' &&
        typeof result.warningCount === 'number',
    )
  );
}

export function eslintFindings(report, repoRoot) {
  const items = [];
  let errors = 0;
  let warnings = 0;
  for (const result of report) {
    errors += result.errorCount;
    warnings += result.warningCount;
    const file = toRepoPath(result.filePath, FRONTEND_DIR, repoRoot);
    for (const message of result.messages) {
      if (!isRecord(message)) continue;
      items.push(
        finding(
          message.severity === 2 ? 'error' : 'warning',
          position(file, message.line, message.column),
          typeof message.ruleId === 'string' ? message.ruleId : message.fatal === true ? 'parse-error' : '(no rule)',
          String(message.message ?? ''),
        ),
      );
    }
  }
  return { items, count: `${plural(errors, 'error')}, ${plural(warnings, 'warning')} in ${plural(report.length, 'file')}` };
}

function readEslintReport(file, repoRoot) {
  if (!existsSync(file)) return { items: [], count: 'no report written' };
  const report = readJson(file);
  if (!isEslintReport(report)) return { items: [], count: 'report unreadable' };
  return eslintFindings(report, repoRoot);
}

const LINT_PROJECT_LINE = /^Linting "([^"]+)"\.\.\.$/;

export function summarizeFrontendLint({ log, repoRoot, tmpDir, gateArgs }) {
  if (gateArgs.length > 0) {
    const { items, count } = readEslintReport(path.join(tmpDir, 'eslint.json'), repoRoot);
    return { items, counts: [`eslint: ${count}`] };
  }
  const names = toLines(log)
    .map((line) => line.trim().match(LINT_PROJECT_LINE)?.[1])
    .filter((name) => name !== undefined);
  for (const file of readdirSync(tmpDir)) {
    const name = file.match(/^eslint-(.+)\.json$/)?.[1];
    if (name !== undefined && !names.includes(name)) names.push(name);
  }
  const items = [];
  const counts = [];
  for (const name of names) {
    const { items: found, count } = readEslintReport(path.join(tmpDir, `eslint-${name}.json`), repoRoot);
    items.push(...found);
    counts.push(`${name}: ${count}`);
  }
  return { items, counts };
}

// ---------------------------------------------------------------------------
// frontend-build

export function summarizeFrontendBuild({ log, repoRoot }) {
  const lines = toLines(log);
  const label = lines.map((line) => line.match(/^> ng build (\S+)/)?.[1]).find((name) => name !== undefined) ?? 'build';
  const { items, blockLines } = parseBuildMessages(lines, { label, repoRoot });
  lines.forEach((line, index) => {
    if (!blockLines.has(index) && BUILD_WARNING_PATTERNS.some((pattern) => pattern.test(line))) {
      items.push(finding('warning', label, 'build', line));
    }
  });
  const errors = items.filter((item) => item.severity === 'error').length;
  return { items, counts: [`${label}: ${plural(errors, 'error')}, ${plural(items.length - errors, 'warning')}`] };
}

// ---------------------------------------------------------------------------
// backend-build

const GRADLE_TASK = /^> Task (:\S+?)(?:\s+(FAILED|UP-TO-DATE|SKIPPED|NO-SOURCE|FROM-CACHE))?\s*$/;
const JAVAC_ERROR = /^(\S+\.java):(\d+): error: (.*)$/;
// PMD with consoleOutput = true (backend/services/commerce/build.gradle, pmd
// block): `path/File.java:LINE: RuleName: message`.
const PMD_VIOLATION = /^(\S+\.java):(\d+):\s+([A-Z]\w*):\s+(.*)$/;
// The line build.gradle's Test doLast logs; it prints only when the task passed.
const TEST_COUNT_LINE = /^(\w+): \d+ tests, \d+ passed, \d+ failed, \d+ skipped$/;
// Gradle's own line on a red test task.
const TESTS_COMPLETED = /^(\d+) tests completed, (\d+) failed(?:, (\d+) skipped)?\s*$/;
const JACOCO_VIOLATION = /Rule violated for (\w+) (\S+): (.+)$/;
const OUTCOME_TEXT = {
  'UP-TO-DATE': 'up to date',
  'FROM-CACHE': 'from cache',
  SKIPPED: 'skipped',
  'NO-SOURCE': 'no source',
};

function unescapeXml(text) {
  return text.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|quot|apos|amp);/g, (whole, entity) => {
    if (entity === 'lt') return '<';
    if (entity === 'gt') return '>';
    if (entity === 'quot') return '"';
    if (entity === 'apos') return "'";
    if (entity === 'amp') return '&';
    const code = entity.startsWith('#x') ? Number.parseInt(entity.slice(2), 16) : Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

function xmlAttributes(text) {
  const attributes = {};
  for (const match of text.matchAll(/([\w:.-]+)="([^"]*)"/g)) attributes[match[1]] = unescapeXml(match[2]);
  return attributes;
}

const XML_ATTRIBUTES = '((?:\\s+[\\w:.-]+="[^"]*")*)\\s*';

// A JUnit XML file as Gradle writes it: one <testsuite> with counts, and a
// <testcase> per test holding a <failure> or <error> when it failed.
export function parseJunitXml(xml) {
  const body = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const suite = xmlAttributes(body.match(new RegExp(`<testsuite${XML_ATTRIBUTES}>`))?.[1] ?? '');
  const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
  const counts = {
    tests: number(suite.tests),
    failures: number(suite.failures),
    errors: number(suite.errors),
    skipped: number(suite.skipped),
  };
  const failures = [];
  const testcase = new RegExp(`<testcase${XML_ATTRIBUTES}(?:/>|>([\\s\\S]*?)</testcase>)`, 'g');
  const problem = new RegExp(`<(failure|error)${XML_ATTRIBUTES}(?:/>|>([\\s\\S]*?)</\\1>)`);
  for (const match of body.matchAll(testcase)) {
    const found = (match[2] ?? '').match(problem);
    if (!found) continue;
    const test = xmlAttributes(match[1]);
    const details = xmlAttributes(found[2]);
    const stack = unescapeXml(found[3] ?? '');
    failures.push({
      classname: test.classname ?? '',
      name: test.name ?? '',
      message: firstLine(details.message) || firstLine(stack) || details.type || found[1],
      stack,
    });
  }
  return { counts, failures };
}

function junitFailureItem(failure, repoRoot) {
  const topLevel = failure.classname.split('$')[0];
  const simpleName = failure.classname.split('.').at(-1) ?? failure.classname;
  const candidate = `${TEST_SOURCE_DIR}/${topLevel.replace(/\./g, '/')}.java`;
  const name = `${simpleName} > ${failure.name}`;
  if (topLevel === '' || !existsSync(path.join(repoRoot, candidate))) {
    return finding('error', failure.classname || 'test', name, failure.message);
  }
  // The first stack frame inside the test class gives the line.
  const frame = failure.stack.match(
    new RegExp(`\\bat (?:\\S*/)?${escapeRegExp(topLevel)}(?:\\$[\\w$]+)?\\.[^\\s(]+\\([\\w$]+\\.java:(\\d+)\\)`),
  );
  return finding('error', position(candidate, frame?.[1]), name, failure.message);
}

// Totals and failing tests from the JUnit XML files this run wrote, per test
// task (the directory name under build/test-results).
export function readJunitResults(repoRoot, startedAt) {
  const root = path.join(repoRoot, TEST_RESULTS_DIR);
  const byTask = new Map();
  const items = [];
  let taskDirs = [];
  try {
    taskDirs = readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return { byTask, items };
  }
  for (const task of taskDirs) {
    const dir = path.join(root, task);
    const files = readdirSync(dir)
      .filter((file) => /^TEST-.*\.xml$/.test(file))
      .sort()
      .map((file) => path.join(dir, file))
      .filter((file) => isFresh(file, startedAt));
    if (files.length === 0) continue;
    const totals = { tests: 0, failures: 0, errors: 0, skipped: 0 };
    for (const file of files) {
      const { counts, failures } = parseJunitXml(readFileSync(file, 'utf8'));
      for (const key of Object.keys(totals)) totals[key] += counts[key];
      items.push(...failures.map((failure) => junitFailureItem(failure, repoRoot)));
    }
    byTask.set(task, totals);
  }
  return { byTask, items };
}

function jacocoItem(match, repoRoot) {
  const [, element, subject, message] = match;
  if (element === 'class') {
    const className = subject.replace(/\//g, '.').split('$')[0];
    const candidate = `${MAIN_SOURCE_DIR}/${className.replace(/\./g, '/')}.java`;
    if (existsSync(path.join(repoRoot, candidate))) return finding('error', candidate, 'coverage', message);
  }
  return finding('error', subject, 'coverage', `${element}: ${message}`);
}

// Every `* What went wrong:` block Gradle printed, up to the next `* ` heading.
export function wentWrongBlocks(lines) {
  const blocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() !== '* What went wrong:') continue;
    const block = [lines[i]];
    for (let j = i + 1; j < lines.length && !/^\* \S/.test(lines[j]) && !/^BUILD FAILED/.test(lines[j]); j += 1) {
      block.push(lines[j]);
    }
    while (block.length > 1 && block.at(-1).trim() === '') block.pop();
    blocks.push(block);
  }
  return blocks;
}

function testCountLine(task, entry, totals) {
  if (totals) {
    const failed = totals.failures + totals.errors;
    const passed = totals.tests - failed - totals.skipped;
    return `${task}: ${totals.tests} tests, ${passed} passed, ${failed} failed, ${totals.skipped} skipped`;
  }
  if (entry.countLine) return entry.countLine;
  if (entry.completed) return `${task}: ${entry.completed}`;
  if (entry.outcome === 'FAILED') return `${task}: failed, no test results written by this run`;
  return `${task}: ${OUTCOME_TEXT[entry.outcome] ?? (entry.outcome ? 'ran, no test results written by this run' : 'not run')}`;
}

function backendCountLine(task, kind, entry, totals) {
  if (kind === 'tests') return testCountLine(task, entry, totals);
  if (entry.outcome === undefined) return `${task}: not run`;
  if (OUTCOME_TEXT[entry.outcome]) return `${task}: ${OUTCOME_TEXT[entry.outcome]}`;
  if (kind === 'compile') return `${task}: ${plural(entry.compileErrors, 'error')}`;
  if (kind === 'pmd') return `${task}: ${plural(entry.violations, 'violation')}`;
  return `${task}: ${entry.outcome === 'FAILED' ? 'failed' : 'passed'}`;
}

export function summarizeBackendBuild({ log, repoRoot, startedAt }) {
  const lines = toLines(log);
  const items = [];
  const tasks = new Map();
  const entryFor = (task) => {
    if (!tasks.has(task)) tasks.set(task, { outcome: undefined, compileErrors: 0, violations: 0 });
    return tasks.get(task);
  };
  const baseDir = BACKEND_PROJECT_DIR;
  let current = entryFor('(no task)');
  for (const line of lines) {
    // Gradle's closing failure report repeats task output; nothing in it is
    // counted against a task.
    if (/^FAILURE: /.test(line) || line.trim() === '* What went wrong:') current = entryFor('(failure report)');
    const task = line.match(GRADLE_TASK);
    if (task) {
      current = entryFor(task[1].split(':').at(-1));
      // A task's header can print twice; a failure is never overwritten.
      if (current.outcome !== 'FAILED') current.outcome = task[2] ?? current.outcome ?? 'ran';
      continue;
    }
    const javac = line.match(JAVAC_ERROR);
    if (javac) {
      current.compileErrors += 1;
      items.push(finding('error', position(toRepoPath(javac[1], baseDir, repoRoot), javac[2]), 'javac', javac[3]));
      continue;
    }
    const pmd = line.match(PMD_VIOLATION);
    if (pmd) {
      current.violations += 1;
      items.push(finding('error', position(toRepoPath(pmd[1], baseDir, repoRoot), pmd[2]), pmd[3], pmd[4]));
      continue;
    }
    const countLine = line.trim().match(TEST_COUNT_LINE);
    if (countLine) entryFor(countLine[1]).countLine = line.trim();
    const completed = line.trim().match(TESTS_COMPLETED);
    if (completed) current.completed = line.trim();
    const jacoco = line.match(JACOCO_VIOLATION);
    if (jacoco) items.push(jacocoItem(jacoco, repoRoot));
  }
  const junit = readJunitResults(repoRoot, startedAt);
  items.push(...junit.items);
  const blocks = wentWrongBlocks(lines);
  const details = blocks.flat();
  const shown = details.slice(0, MAX_WENT_WRONG_LINES);
  if (details.length > shown.length) shown.push(`(${details.length - shown.length} more lines of it in the log)`);
  const counts = BACKEND_TASKS.map(([task, kind]) => backendCountLine(task, kind, entryFor(task), junit.byTask.get(task)));
  return { items, counts, details: shown, recognized: blocks.length > 0 };
}

// ---------------------------------------------------------------------------
// Gates

const GATES = {
  'frontend-test': {
    takesArgs: true,
    plan: (args, { repoRoot }) => ({
      command: 'npm',
      args: ['--prefix', FRONTEND_DIR, 'run', 'test', '--', ...args, '--reporters', 'minimal', '--no-watch'],
      cwd: repoRoot,
    }),
    summarize: summarizeFrontendTest,
  },
  'frontend-lint': {
    takesArgs: true,
    plan: (files, { repoRoot, tmpDir }) => {
      const frontendRoot = path.join(repoRoot, FRONTEND_DIR);
      if (files.length > 0) {
        return {
          command: 'npx',
          args: ['eslint', '--format', 'json', '-o', path.join(tmpDir, 'eslint.json'), ...files],
          cwd: frontendRoot,
        };
      }
      // The lint builder joins outputFile onto the workspace root after
      // stripping a leading slash (node_modules/@angular-eslint/builder/dist/lint.impl.js),
      // so the report path is given relative to frontend/.
      const reportTemplate = `${toPosix(path.relative(frontendRoot, tmpDir))}/eslint-{projectName}.json`;
      return {
        command: 'npm',
        args: ['--prefix', FRONTEND_DIR, 'run', 'lint', '--', '--format', 'json', '--output-file', reportTemplate],
        cwd: repoRoot,
      };
    },
    summarize: summarizeFrontendLint,
  },
  'frontend-build': {
    takesArgs: false,
    plan: (args, { repoRoot }) => ({ command: 'npm', args: ['--prefix', FRONTEND_DIR, 'run', 'build'], cwd: repoRoot }),
    summarize: summarizeFrontendBuild,
  },
  'backend-build': {
    takesArgs: false,
    plan: (args, { repoRoot }) => ({
      command: path.join(repoRoot, 'backend', 'gradlew'),
      display: 'backend/gradlew',
      args: ['-p', 'backend', ':services:commerce:build'],
      cwd: repoRoot,
    }),
    summarize: summarizeBackendBuild,
  },
};

export const GATE_NAMES = Object.keys(GATES);

export function exitCodeOf({ code, signal }) {
  if (signal) return 1;
  return typeof code === 'number' ? code : 1;
}

function gateEnvironment() {
  const env = { ...process.env, NO_COLOR: '1' };
  delete env.FORCE_COLOR;
  return env;
}

// Runs the command, handing every stdout and stderr chunk to `write` in the
// order it arrives. Resolves with the exit code and signal; rejects when the
// command cannot be started.
export function spawnCommand(plan, write) {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.command, plan.args, {
      cwd: plan.cwd,
      env: plan.env ?? gateEnvironment(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', write);
    child.stderr.on('data', write);
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
}

function lastLines(lines, count) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === '') end -= 1;
  return lines.slice(Math.max(0, end - count), end);
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.severity}|${item.location}|${item.name}|${item.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function renderSummary({ commandLine, summary, exitCode, signal, logText, logPath }) {
  const items = dedupe(summary.items);
  const errors = items.filter((item) => item.severity === 'error');
  const warnings = items.filter((item) => item.severity === 'warning');
  const logLines = toLines(logText);
  const lines = [`$ ${commandLine}`];
  lines.push(...errors.map(formatItem), ...warnings.map(formatItem));
  lines.push(...(summary.details ?? []));
  lines.push(...summary.counts);
  if (exitCode !== 0 && errors.length === 0 && summary.recognized !== true) {
    const tail = lastLines(logLines, TAIL_LINE_COUNT);
    lines.push(`no failure recognised in the output; the last ${tail.length} log lines:`, ...tail);
  }
  const killed = signal ? ` (killed by ${signal})` : '';
  const logLineCount = logText === '' ? 0 : logText.split('\n').length - (logText.endsWith('\n') ? 1 : 0);
  lines.push(`exit ${exitCode}${killed}; full log: ${logPath} (${plural(logLineCount, 'line')})`);
  return lines;
}

// Runs one gate and returns its exit code and the summary lines. `runCommand`
// is injectable so a test can feed a recorded log and exit code.
export async function runGate(gateName, gateArgs, { repoRoot, runCommand = spawnCommand, tmpRoot = os.tmpdir() }) {
  const gate = GATES[gateName];
  const startedAt = Date.now();
  const tmpDir = mkdtempSync(path.join(tmpRoot, 'gate-output-'));
  const logPath = path.join(tmpDir, `${gateName}.log`);
  const plan = gate.plan(gateArgs, { repoRoot, tmpDir });
  const commandLine = [plan.display ?? plan.command, ...plan.args].join(' ');
  const log = createWriteStream(logPath);
  const chunks = [];
  const write = (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    chunks.push(buffer);
    log.write(buffer);
  };
  let result;
  try {
    result = await runCommand(plan, write);
  } finally {
    await new Promise((resolve) => log.end(resolve));
  }
  const logText = Buffer.concat(chunks).toString('utf8');
  const exitCode = exitCodeOf(result);
  const summary = gate.summarize({ log: logText, repoRoot, tmpDir, startedAt, gateArgs });
  const lines = renderSummary({ commandLine, summary, exitCode, signal: result.signal, logText, logPath });
  return { exitCode, lines, logPath };
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

async function main(argv) {
  const [gateName, ...gateArgs] = argv;
  if (gateName === undefined || !GATE_NAMES.includes(gateName)) fail(USAGE);
  if (!GATES[gateName].takesArgs && gateArgs.length > 0) fail(`${gateName} takes no arguments\n${USAGE}`);
  // Run from the repository root (prerequisite): every gate path is resolved
  // against it, as find-contract-consumers.mjs does.
  const repoRoot = process.cwd();
  if (!existsSync(path.join(repoRoot, '.git'))) {
    fail(`not a git checkout: ${repoRoot} has no .git; run this from the repository root`);
  }
  let outcome;
  try {
    outcome = await runGate(gateName, gateArgs, { repoRoot });
  } catch (error) {
    fail(`could not run ${gateName}: ${error instanceof Error ? error.message : String(error)}`);
  }
  process.stdout.write(`${outcome.lines.join('\n')}\n`);
  process.exitCode = outcome.exitCode;
}

function isEntryPoint() {
  try {
    return realpathSync(process.argv[1] ?? '') === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  await main(process.argv.slice(2));
}
