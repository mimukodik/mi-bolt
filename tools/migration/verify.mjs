#!/usr/bin/env node
// Post-move verification for the mi-bolt monorepo migration (MIM-411).
//
// Every check prints exactly one line starting with "PASS " or "FAIL "; a FAIL
// line may be followed by up to twenty indented detail lines. The process exits
// 1 when at least one FAIL was printed, 0 otherwise, and 2 on a usage error.
//
//   verify.mjs move      --manifest <file> --commit <sha> [--repo <path>]
//   verify.mjs old-paths --config <file> --classes <a,b,...> [--commit <sha>] [--repo <path>]
//   verify.mjs counts    --baseline <file> --log <name>=<file> [--log <name>=<file> ...]
//
// `--repo` names the repository the git commands run in, through `git -C`; it
// defaults to the current working directory. Git is always called with an
// argument array, never through a shell.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const MAX_DETAILS = 20;

const USAGE = [
  'usage: verify.mjs move --manifest <file> --commit <sha> [--repo <path>]',
  '       verify.mjs old-paths --config <file> --classes <a,b,...> [--commit <sha>] [--repo <path>]',
  '       verify.mjs counts --baseline <file> --log <name>=<file> [--log <name>=<file> ...]',
].join('\n');

// A tree path that the move must not have carried over from the backend
// repository: its Claude/Codex/Gemini tooling directories, and the migration
// tooling's own excluded directory.
const EXCLUDED_TREE_PATH = /^backend\/(.*\/)?(\.claude\/|\.agents\/|\.codex\/|\.gemini\/|\.mcp\.json$|AGENTS\.md$)/;
const EXCLUDED_PREFIX = 'tools/.claude/';

const COVERAGE_METRICS = ['Statements', 'Branches', 'Functions', 'Lines'];
const COVERAGE_LINE = /^(Statements|Branches|Functions|Lines)\s*:\s*([0-9.]+)%/;

const KNOWN_FLAGS = new Set(['manifest', 'commit', 'repo', 'config', 'classes', 'baseline', 'log']);

let failed = false;

function pass(message) {
  process.stdout.write(`PASS ${message}\n`);
}

function fail(message, details = []) {
  failed = true;
  process.stdout.write(`FAIL ${message}\n`);
  for (const detail of details.slice(0, MAX_DETAILS)) {
    process.stdout.write(`  ${detail}\n`);
  }
}

function usage() {
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

function readText(file) {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    process.stderr.write(`verify.mjs: cannot read ${file}: ${error.message}\n`);
    process.exit(2);
  }
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    process.stderr.write(`verify.mjs: cannot parse ${file}: ${error.message}\n`);
    process.exit(2);
  }
}

function git(repo, args) {
  const argv = repo === null ? args : ['-C', repo, ...args];
  return execFileSync('git', argv, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

// Git's own exit status is what says "no hits" for `git grep`, so the status has
// to survive the call rather than be turned into an exception. A failure that
// carries no numeric status (git is not installed, the output overflowed
// maxBuffer, the process was killed) arrives as -1, which is neither "matched"
// nor "no hits" and must not be read as either.
function gitStatus(repo, args) {
  try {
    return { status: 0, stdout: git(repo, args), stderr: '' };
  } catch (error) {
    const stderr = error.stderr === undefined || error.stderr === '' ? error.message : error.stderr;
    return {
      status: Number.isInteger(error.status) ? error.status : -1,
      stdout: error.stdout === undefined ? '' : String(error.stdout),
      stderr: String(stderr),
    };
  }
}

// `git ls-tree -r -z` gives `<mode> blob <sha>\t<path>\0` per record; the record
// path is unquoted under `-z`.
function lsTree(repo, commit) {
  const tree = new Map();
  for (const record of git(repo, ['ls-tree', '-r', '-z', commit]).split('\0')) {
    if (record === '') continue;
    const tab = record.indexOf('\t');
    const [mode, , blob] = record.slice(0, tab).split(' ');
    tree.set(record.slice(tab + 1), { mode, blob });
  }
  return tree;
}

function commandMove(options) {
  const manifest = readJson(options.manifest);
  const repo = options.repo === undefined ? null : options.repo;
  const commit = options.commit;

  const parentResult = gitStatus(repo, ['rev-parse', `${commit}^1`]);
  const parent = parentResult.status === 0 ? parentResult.stdout.trim() : null;
  if (parent === manifest.frontendSha) {
    pass(`move-parent: ${commit}^1 is ${manifest.frontendSha}`);
  } else {
    fail(
      `move-parent: ${commit}^1 is ${parent}, expected ${manifest.frontendSha}`,
      parentResult.stderr.split('\n').filter((line) => line !== ''),
    );
  }

  const tree = lsTree(repo, commit);
  const targets = manifest.entries.filter((entry) => entry.op !== 'exclude');

  const mismatches = [];
  for (const entry of targets) {
    const found = tree.get(entry.dst);
    if (found === undefined) mismatches.push(`missing ${entry.dst}`);
    else if (found.blob !== entry.blob) mismatches.push(`blob ${entry.dst}: expected ${entry.blob}, got ${found.blob}`);
    else if (found.mode !== entry.mode) mismatches.push(`mode ${entry.dst}: expected ${entry.mode}, got ${found.mode}`);
  }
  const atTarget = targets.length - mismatches.length;
  if (mismatches.length === 0) {
    pass(`move-targets: ${atTarget} of ${targets.length} entries at target with identical blob and mode`);
  } else {
    fail(`move-targets: ${atTarget} of ${targets.length} entries at target with identical blob and mode`, mismatches);
  }

  const expected = new Set(targets.map((entry) => entry.dst));
  const extra = [...tree.keys()].filter((path) => !expected.has(path)).sort();
  const missing = [...expected].filter((path) => !tree.has(path)).sort();
  if (extra.length === 0 && missing.length === 0) {
    pass(`move-nothing-else: tree holds exactly the ${targets.length} manifest targets`);
  } else {
    fail(`move-nothing-else: ${extra.length} extra, ${missing.length} missing`, [
      ...extra.map((path) => `extra ${path}`),
      ...missing.map((path) => `missing ${path}`),
    ]);
  }

  const imported = [...tree.keys()]
    .filter((path) => EXCLUDED_TREE_PATH.test(path) || path.startsWith(EXCLUDED_PREFIX))
    .sort();
  const excluded = manifest.entries.filter((entry) => entry.op === 'exclude').length;
  if (imported.length === 0) {
    pass(`move-excluded-absent: none of the ${excluded} excluded entries was imported`);
  } else {
    fail(`move-excluded-absent: ${imported.length} excluded path(s) in the tree`, imported.map((path) => `excluded ${path}`));
  }
}

// A hit from `git grep <pattern> <tree>` reads `<tree>:<path>:<lineno>:<text>`,
// so the path the hit belongs to is the field after the tree prefix.
function hitPath(line, commit) {
  const prefix = `${commit}:`;
  const body = line.startsWith(prefix) ? line.slice(prefix.length) : line;
  const colon = body.indexOf(':');
  return colon === -1 ? body : body.slice(0, colon);
}

function commandOldPaths(options) {
  const config = readJson(options.config);
  const repo = options.repo === undefined ? null : options.repo;
  const commit = options.commit === undefined ? 'HEAD' : options.commit;

  for (const name of options.classes) {
    const rules = config[name];
    if (rules === undefined) {
      fail(`old-paths ${name}: unknown class`);
      continue;
    }
    rules.forEach((rule, index) => {
      const label = `old-paths ${name}#${index + 1}`;
      // `--full-name` prints repo-root-relative paths and `:(top)` resolves the
      // pathspecs from the repo root, so the rule means the same thing from any
      // working directory, and a hit can be matched against the config's
      // root-relative `allow` entries.
      const pathspecs = rule.paths.map((path) => `:(top)${path}`);
      const result = gitStatus(repo, ['grep', '-n', '--full-name', '-E', rule.pattern, commit, '--', ...pathspecs]);
      if (result.status !== 0 && result.status !== 1) {
        const details = result.stderr.split('\n').filter((line) => line !== '');
        fail(`${label}: git grep failed (exit ${result.status})`, details);
        return;
      }
      const allow = new Set(rule.allow === undefined ? [] : rule.allow);
      const hits = result.stdout
        .split('\n')
        .filter((line) => line !== '')
        .filter((line) => !allow.has(hitPath(line, commit)));
      if (hits.length === 0) {
        pass(`${label}: 0 hits`);
      } else {
        fail(`${label}: ${hits.length} hits`, hits);
      }
    });
  }
}

function stripAnsi(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// The numbers before a token are summed over the lines a suite prints per run, so
// that a log holding several suite runs adds up to the whole.
function sumToken(lines, token) {
  let total = 0;
  const tokenPattern = new RegExp(`(\\d+)\\s+${token}\\b`);
  for (const line of lines) {
    const match = tokenPattern.exec(line);
    if (match !== null) total += Number(match[1]);
  }
  return total;
}

function countsFrontendUnit(lines, baseline) {
  const unit = baseline.frontendUnit;
  const testLines = lines.filter((line) => /^\s*Tests\s/.test(line));
  const fileLines = lines.filter((line) => /^\s*Test Files\s/.test(line));

  if (testLines.length === 0) {
    fail('counts frontend-unit: no summary line');
  } else {
    const passed = sumToken(testLines, 'passed');
    const failedTests = sumToken(testLines, 'failed');
    const skipped = sumToken(testLines, 'skipped');
    const message = `counts frontend-unit tests: ${passed} passed (baseline ${unit.tests}), ${failedTests} failed, ${skipped} skipped`;
    if (passed >= unit.tests && failedTests === 0 && skipped <= baseline.skipped) pass(message);
    else fail(message);
  }

  if (fileLines.length === 0) {
    fail('counts frontend-unit: no summary line');
  } else {
    const files = sumToken(fileLines, 'passed');
    const message = `counts frontend-unit files: ${files} (baseline ${unit.testFiles})`;
    if (files >= unit.testFiles) pass(message);
    else fail(message);
  }

  const coverage = [];
  for (const line of lines) {
    const match = COVERAGE_LINE.exec(line);
    if (match !== null) coverage.push({ metric: match[1], value: Number(match[2]) });
  }
  if (coverage.length === 0) {
    fail('counts frontend-coverage: no summary line');
    return;
  }

  // A block is four consecutive summary lines carrying the four metrics once each.
  let blocks = 0;
  for (let index = 0; index + 4 <= coverage.length; index += 4) {
    const metrics = new Set(coverage.slice(index, index + 4).map((entry) => entry.metric));
    if (metrics.size === 4) blocks += 1;
  }
  const lowest = {};
  for (const metric of COVERAGE_METRICS) {
    const values = coverage.filter((entry) => entry.metric === metric).map((entry) => entry.value);
    lowest[metric] = values.length === 0 ? 0 : Math.min(...values);
  }
  const message = `counts frontend-coverage: ${blocks} blocks, lowest ${COVERAGE_METRICS.map((metric) => `${metric} ${lowest[metric]}`).join(' ')}`;
  const under = COVERAGE_METRICS.filter((metric) => lowest[metric] < baseline.coverageThresholds[metric]);
  if (blocks >= unit.coverageBlocks && under.length === 0) pass(message);
  else fail(message);
}

function countsFrontendContract(lines, baseline) {
  const testLines = lines.filter((line) => /^\s*Tests\s/.test(line));
  if (testLines.length === 0) {
    fail('counts frontend-contract: no summary line');
    return;
  }
  const passed = sumToken(testLines, 'passed');
  const failedTests = sumToken(testLines, 'failed');
  const message = `counts frontend-contract tests: ${passed} passed (baseline ${baseline.frontendContract.tests}), ${failedTests} failed`;
  if (passed >= baseline.frontendContract.tests && failedTests === 0) pass(message);
  else fail(message);
}

function countsPlaywright(lines, baseline) {
  const passedLines = lines.filter((line) => /^\s*(\d+) passed/.test(line));
  if (passedLines.length === 0) {
    fail('counts playwright: no summary line');
    return;
  }
  const passed = Number(/^\s*(\d+) passed/.exec(passedLines[passedLines.length - 1])[1]);
  const failedTests = lines
    .filter((line) => /^\s*(\d+) failed/.test(line))
    .reduce((total, line) => total + Number(/^\s*(\d+) failed/.exec(line)[1]), 0);
  const message = `counts playwright passed: ${passed} passed (baseline ${baseline.playwright.passed}), ${failedTests} failed`;
  if (passed >= baseline.playwright.passed && failedTests === 0) pass(message);
  else fail(message);
}

function countsBackend(lines, prefix, name, baseline, tests) {
  const summary = new RegExp(`^${prefix}: (\\d+) tests, (\\d+) passed, (\\d+) failed, (\\d+) skipped`);
  const match = lines.map((line) => summary.exec(line)).find((found) => found !== null);
  if (match === undefined) {
    fail(`counts ${name}: no summary line`);
    return;
  }
  const passed = Number(match[2]);
  const failedTests = Number(match[3]);
  const skipped = Number(match[4]);
  const message = `counts ${name} tests: ${passed} passed (baseline ${tests}), ${failedTests} failed, ${skipped} skipped`;
  if (passed >= tests && failedTests === 0 && skipped <= baseline.skipped) pass(message);
  else fail(message);
}

function commandCounts(options) {
  const baseline = readJson(options.baseline);
  for (const [name, file] of Object.entries(options.logs)) {
    const lines = stripAnsi(readText(file)).split('\n');
    if (name === 'frontend-unit') countsFrontendUnit(lines, baseline);
    else if (name === 'frontend-contract') countsFrontendContract(lines, baseline);
    else if (name === 'playwright') countsPlaywright(lines, baseline);
    else if (name === 'backend-test') countsBackend(lines, 'test', name, baseline, baseline.backendTest.tests);
    else if (name === 'backend-integration') countsBackend(lines, 'integrationTest', name, baseline, baseline.backendIntegration.tests);
    else fail(`counts ${name}: unknown log name`);
  }
}

function parseOptions(argv) {
  const options = { logs: {} };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag.startsWith('--') || value === undefined || value.startsWith('--')) usage();
    const name = flag.slice(2);
    if (!KNOWN_FLAGS.has(name)) usage();
    if (name === 'log') {
      const separator = value.indexOf('=');
      if (separator <= 0) usage();
      options.logs[value.slice(0, separator)] = value.slice(separator + 1);
    } else {
      options[name] = value;
    }
  }
  return options;
}

function requireArguments(options, names) {
  for (const name of names) {
    if (options[name] === undefined) usage();
  }
}

const [subcommand, ...rest] = process.argv.slice(2);

if (subcommand === 'move') {
  const options = parseOptions(rest);
  requireArguments(options, ['manifest', 'commit']);
  commandMove(options);
} else if (subcommand === 'old-paths') {
  const options = parseOptions(rest);
  requireArguments(options, ['config', 'classes']);
  options.classes = options.classes.split(',');
  commandOldPaths(options);
} else if (subcommand === 'counts') {
  const options = parseOptions(rest);
  requireArguments(options, ['baseline']);
  if (Object.keys(options.logs).length === 0) usage();
  commandCounts(options);
} else {
  usage();
}

// The exit status is set rather than exited on, so a report larger than the pipe
// buffer is flushed whole instead of being cut off mid-line by process.exit().
process.exitCode = failed ? 1 : 0;
