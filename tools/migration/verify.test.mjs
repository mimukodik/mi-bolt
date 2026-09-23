// Tests for tools/migration/verify.mjs. Every case builds its fixture in its own
// temporary directory and removes that directory when the case ends; the log
// fixtures are string literals copied from the baseline logs the migration was
// surveyed against, the frontend-unit one ANSI coloured as the real log is.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const VERIFY = fileURLToPath(new URL('./verify.mjs', import.meta.url));
const BASELINE = fileURLToPath(new URL('./baseline.json', import.meta.url));

const ESCAPE = '\u001b';

function tempDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), 'mim411-verify-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(repository, args) {
  return execFileSync('git', args, { cwd: repository, encoding: 'utf8' });
}

function initRepository(repository) {
  mkdirSync(repository, { recursive: true });
  git(repository, ['init', '-q', '-b', 'main']);
  git(repository, ['config', 'user.name', 'mim411 test']);
  git(repository, ['config', 'user.email', 'mim411@example.invalid']);
  git(repository, ['config', 'commit.gpgsign', 'false']);
}

function writeAt(repository, path, content) {
  mkdirSync(dirname(join(repository, path)), { recursive: true });
  writeFileSync(join(repository, path), content);
}

function commitAll(repository, message) {
  git(repository, ['add', '-A']);
  git(repository, ['commit', '-q', '-m', message]);
  return git(repository, ['rev-parse', 'HEAD']).trim();
}

// `<mode> blob <sha>\t<path>`, one record per file, as `git ls-tree -r -z` prints it.
function treeBlobs(repository, commit) {
  const blobs = new Map();
  for (const record of git(repository, ['ls-tree', '-r', '-z', commit]).split('\0')) {
    if (record === '') continue;
    const tab = record.indexOf('\t');
    const [mode, , blob] = record.slice(0, tab).split(' ');
    blobs.set(record.slice(tab + 1), { mode, blob });
  }
  return blobs;
}

// The script is always run from the fixture root, never from the repository under
// test, so `--repo` is what points it at the right tree.
function runVerify(args, cwd) {
  try {
    const stdout = execFileSync(process.execPath, [VERIFY, ...args], { cwd, encoding: 'utf8' });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: typeof error.status === 'number' ? error.status : 1,
      stdout: error.stdout === undefined ? '' : String(error.stdout),
      stderr: error.stderr === undefined ? '' : String(error.stderr),
    };
  }
}

function writeLog(directory, name, content) {
  const file = join(directory, `${name}.log`);
  writeFileSync(file, content);
  return file;
}

// A source "frontend" repository holding a.txt, src/b.txt and .claude/c.md at S,
// a source "backend" repository holding x.txt and .claude/y.md at B, and a move
// commit on top of S carrying the monorepo layout. `mutate` runs after the moves
// and before the commit, so a case can bend the tree out of shape.
function buildMoveFixture(directory, mutate) {
  const frontend = join(directory, 'frontend-repo');
  const backend = join(directory, 'backend-repo');
  initRepository(frontend);
  initRepository(backend);

  writeAt(frontend, 'a.txt', 'A\n');
  writeAt(frontend, 'src/b.txt', 'B\n');
  writeAt(frontend, '.claude/c.md', 'C\n');
  const frontendSha = commitAll(frontend, 'S');
  const frontendBlobs = treeBlobs(frontend, frontendSha);

  writeAt(backend, 'x.txt', 'X\n');
  writeAt(backend, '.claude/y.md', 'Y\n');
  const backendSha = commitAll(backend, 'B');
  const backendBlobs = treeBlobs(backend, backendSha);

  mkdirSync(join(frontend, 'frontend', 'projects', 'storefront', 'src'), { recursive: true });
  git(frontend, ['mv', 'a.txt', 'frontend/a.txt']);
  git(frontend, ['mv', 'src/b.txt', 'frontend/projects/storefront/src/b.txt']);
  writeAt(frontend, 'backend/x.txt', readFileSync(join(backend, 'x.txt'), 'utf8'));

  if (mutate !== undefined) mutate({ frontend, backend });

  const commit = commitAll(frontend, 'move');
  const movedBlobs = treeBlobs(frontend, commit);

  const entry = (repo, rule, op, src, dst, blobs, blobPath) => ({
    repo,
    rule,
    op,
    src,
    dst,
    mode: blobs.get(blobPath).mode,
    blob: blobs.get(blobPath).blob,
  });
  const manifest = {
    frontendSha,
    backendSha,
    entries: [
      entry('frontend', 'r-stay', 'stay', '.claude/c.md', '.claude/c.md', frontendBlobs, '.claude/c.md'),
      entry('frontend', 'r-move-a', 'move', 'a.txt', 'frontend/a.txt', frontendBlobs, 'a.txt'),
      entry('frontend', 'r-move-b', 'move', 'src/b.txt', 'frontend/projects/storefront/src/b.txt', frontendBlobs, 'src/b.txt'),
      entry('backend', 'r-import-x', 'import', 'x.txt', 'backend/x.txt', backendBlobs, 'x.txt'),
      entry('backend', 'r-exclude-y', 'exclude', '.claude/y.md', null, backendBlobs, '.claude/y.md'),
    ],
  };
  const manifestFile = join(directory, 'manifest.json');
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  return { frontend, commit, frontendSha, manifestFile, frontendBlobs, movedBlobs };
}

function runMove(fixture) {
  return runVerify(
    ['move', '--manifest', fixture.manifestFile, '--commit', fixture.commit, '--repo', fixture.frontend],
    dirname(fixture.frontend),
  );
}

test('move: a correct move commit passes every check', (t) => {
  const directory = tempDirectory(t);
  const fixture = buildMoveFixture(directory);

  const result = runMove(fixture);

  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    [
      `PASS move-parent: ${fixture.commit}^1 is ${fixture.frontendSha}`,
      'PASS move-targets: 4 of 4 entries at target with identical blob and mode',
      'PASS move-nothing-else: tree holds exactly the 4 manifest targets',
      'PASS move-excluded-absent: none of the 1 excluded entries was imported',
      '',
    ].join('\n'),
  );
});

test('move: an extra path in the tree fails move-nothing-else', (t) => {
  const directory = tempDirectory(t);
  const fixture = buildMoveFixture(directory, ({ frontend }) => writeAt(frontend, 'extra/added.txt', 'extra\n'));

  const result = runMove(fixture);

  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    [
      `PASS move-parent: ${fixture.commit}^1 is ${fixture.frontendSha}`,
      'PASS move-targets: 4 of 4 entries at target with identical blob and mode',
      'FAIL move-nothing-else: 1 extra, 0 missing',
      '  extra extra/added.txt',
      'PASS move-excluded-absent: none of the 1 excluded entries was imported',
      '',
    ].join('\n'),
  );
});

test('move: a target whose content changed fails move-targets', (t) => {
  const directory = tempDirectory(t);
  const fixture = buildMoveFixture(directory, ({ frontend }) => writeAt(frontend, 'frontend/a.txt', 'A changed\n'));

  const result = runMove(fixture);

  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    [
      `PASS move-parent: ${fixture.commit}^1 is ${fixture.frontendSha}`,
      'FAIL move-targets: 3 of 4 entries at target with identical blob and mode',
      `  blob frontend/a.txt: expected ${fixture.frontendBlobs.get('a.txt').blob}, got ${fixture.movedBlobs.get('frontend/a.txt').blob}`,
      'PASS move-nothing-else: tree holds exactly the 4 manifest targets',
      'PASS move-excluded-absent: none of the 1 excluded entries was imported',
      '',
    ].join('\n'),
  );
});

test('move: a target whose file mode changed fails move-targets', (t) => {
  const directory = tempDirectory(t);
  const fixture = buildMoveFixture(directory, ({ frontend }) => chmodSync(join(frontend, 'frontend/a.txt'), 0o755));

  const result = runMove(fixture);

  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    [
      `PASS move-parent: ${fixture.commit}^1 is ${fixture.frontendSha}`,
      'FAIL move-targets: 3 of 4 entries at target with identical blob and mode',
      `  mode frontend/a.txt: expected 100644, got ${fixture.movedBlobs.get('frontend/a.txt').mode}`,
      'PASS move-nothing-else: tree holds exactly the 4 manifest targets',
      'PASS move-excluded-absent: none of the 1 excluded entries was imported',
      '',
    ].join('\n'),
  );
});

test('move: a backend tooling directory carried over fails move-excluded-absent', (t) => {
  const directory = tempDirectory(t);
  const fixture = buildMoveFixture(directory, ({ frontend }) => writeAt(frontend, 'backend/.claude/y.md', 'Y\n'));

  const result = runMove(fixture);

  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    [
      `PASS move-parent: ${fixture.commit}^1 is ${fixture.frontendSha}`,
      'PASS move-targets: 4 of 4 entries at target with identical blob and mode',
      'FAIL move-nothing-else: 1 extra, 0 missing',
      '  extra backend/.claude/y.md',
      'FAIL move-excluded-absent: 1 excluded path(s) in the tree',
      '  excluded backend/.claude/y.md',
      '',
    ].join('\n'),
  );
});

const FRONTEND_CONFIG_PATTERN = '"mi-bolt"|mi-bolt:(build|serve|test)|"sourceRoot": "src"|"(src|public)/|"input": "public"|dist/mi-bolt';

function buildOldPathsFixture(directory, angularJson, allow) {
  const repository = join(directory, 'repo');
  initRepository(repository);
  writeAt(repository, 'frontend/angular.json', angularJson);
  commitAll(repository, 'baseline');

  const rule = { paths: ['frontend/angular.json'], pattern: FRONTEND_CONFIG_PATTERN };
  if (allow !== undefined) rule.allow = allow;

  const configFile = join(directory, 'old-paths.json');
  writeFileSync(configFile, JSON.stringify({ 'frontend-config': [rule] }, null, 2));

  return { repository, configFile };
}

function runOldPaths(fixture, classes) {
  return runVerify(
    ['old-paths', '--config', fixture.configFile, '--classes', classes, '--commit', 'HEAD', '--repo', fixture.repository],
    dirname(fixture.repository),
  );
}

test('old-paths: a hit on the old project name is a failure', (t) => {
  const directory = tempDirectory(t);
  const fixture = buildOldPathsFixture(directory, '{ "mi-bolt": { "x": 1 } }\n');

  const result = runOldPaths(fixture, 'frontend-config');

  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'FAIL old-paths frontend-config#1: 1 hits\n  HEAD:frontend/angular.json:1:{ "mi-bolt": { "x": 1 } }\n');
});

test('old-paths: a hit in an allowed file is dropped', (t) => {
  const directory = tempDirectory(t);
  const fixture = buildOldPathsFixture(directory, '{ "mi-bolt": { "x": 1 } }\n', ['frontend/angular.json']);

  const result = runOldPaths(fixture, 'frontend-config');

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'PASS old-paths frontend-config#1: 0 hits\n');
});

test('old-paths: a tree without the string passes', (t) => {
  const directory = tempDirectory(t);
  const fixture = buildOldPathsFixture(directory, '{ "projects": {} }\n');

  const result = runOldPaths(fixture, 'frontend-config');

  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'PASS old-paths frontend-config#1: 0 hits\n');
});

test('old-paths: a class the config does not carry is a failure', (t) => {
  const directory = tempDirectory(t);
  const fixture = buildOldPathsFixture(directory, '{ "projects": {} }\n');

  const result = runOldPaths(fixture, 'no-such-class');

  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'FAIL old-paths no-such-class: unknown class\n');
});

// One suite run in the frontend unit log, ANSI coloured as vitest prints it.
function coveredSuite({ files, tests, statements, branches, functions, lines }) {
  const bold = `${ESCAPE}[1m${ESCAPE}[32m`;
  const dim = `${ESCAPE}[2m`;
  const reset = `${ESCAPE}[22m`;
  const grey = `${ESCAPE}[90m`;
  return [
    `${dim} Test Files ${reset} ${bold}${files} passed${ESCAPE}[39m${reset}${grey} (${files})${ESCAPE}[39m`,
    `${dim}      Tests ${reset} ${bold}${tests} passed${ESCAPE}[39m${reset}${grey} (${tests})${ESCAPE}[39m`,
    '=============================== Coverage summary ===============================',
    `Statements   : ${statements}% ( 5420/6020 )`,
    `Branches     : ${branches}% ( 3279/3847 )`,
    `Functions    : ${functions}% ( 1103/1209 )`,
    `Lines        : ${lines}% ( 4598/4926 )`,
    '================================================================================',
  ].join('\n');
}

const FRONTEND_UNIT_LOG = [
  coveredSuite({ files: 75, tests: 1278, statements: '90.03', branches: '85.23', functions: '91.23', lines: '93.34' }),
  coveredSuite({ files: 2, tests: 19, statements: '95.37', branches: '91.78', functions: '91.66', lines: '97.75' }),
  coveredSuite({ files: 59, tests: 767, statements: '96.18', branches: '92.35', functions: '98.4', lines: '97.61' }),
].join('\n');

const FRONTEND_CONTRACT_LOG = ['', ' Test Files  6 passed (6)', '      Tests  82 passed (82)'].join('\n');

const PLAYWRIGHT_LOG = [
  'Running 1 test using 1 worker',
  '',
  '  ✓  1 [seed] › e2e/seed.spec.ts:49:7 › Seed › the shop serves its home page on MSW (950ms)',
  '',
  '  1 passed (4.7s)',
].join('\n');

const BACKEND_TEST_LOG = '> Task :test\ntest: 332 tests, 332 passed, 0 failed, 0 skipped\n';

const BACKEND_INTEGRATION_LOG = '> Task :integrationTest\nintegrationTest: 382 tests, 382 passed, 0 failed, 0 skipped\n';

function runCounts(directory, logs) {
  const args = ['counts', '--baseline', BASELINE];
  for (const [name, content] of Object.entries(logs)) {
    args.push('--log', `${name}=${writeLog(directory, name, content)}`);
  }
  return runVerify(args, directory);
}

test('counts: the baseline logs pass with their recorded figures', (t) => {
  const directory = tempDirectory(t);

  const result = runCounts(directory, {
    'frontend-unit': FRONTEND_UNIT_LOG,
    'frontend-contract': FRONTEND_CONTRACT_LOG,
    playwright: PLAYWRIGHT_LOG,
    'backend-test': BACKEND_TEST_LOG,
    'backend-integration': BACKEND_INTEGRATION_LOG,
  });

  assert.equal(result.status, 0);
  assert.equal(
    result.stdout,
    [
      'PASS counts frontend-unit tests: 2064 passed (baseline 2064), 0 failed, 0 skipped',
      'PASS counts frontend-unit files: 136 (baseline 136)',
      'PASS counts frontend-coverage: 3 blocks, lowest Statements 90.03 Branches 85.23 Functions 91.23 Lines 93.34',
      'PASS counts frontend-contract tests: 82 passed (baseline 82), 0 failed',
      'PASS counts playwright passed: 1 passed (baseline 1), 0 failed',
      'PASS counts backend-test tests: 332 passed (baseline 332), 0 failed, 0 skipped',
      'PASS counts backend-integration tests: 382 passed (baseline 382), 0 failed, 0 skipped',
      '',
    ].join('\n'),
  );
});

test('counts: a suite that lost a test fails against the baseline', (t) => {
  const directory = tempDirectory(t);

  const result = runCounts(directory, {
    'frontend-contract': ['', ' Test Files  6 passed (6)', '      Tests  81 passed (81)'].join('\n'),
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'FAIL counts frontend-contract tests: 81 passed (baseline 82), 0 failed\n');
});

test('counts: a failing test fails the run', (t) => {
  const directory = tempDirectory(t);

  const result = runCounts(directory, {
    'frontend-contract': ['', ' Test Files  6 passed (6)', '      Tests  82 passed (82), 1 failed'].join('\n'),
  });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'FAIL counts frontend-contract tests: 82 passed (baseline 82), 1 failed\n');
});

test('counts: coverage under a threshold fails', (t) => {
  const directory = tempDirectory(t);

  const result = runCounts(directory, {
    'frontend-unit': FRONTEND_UNIT_LOG.replace('Branches     : 85.23%', 'Branches     : 74.99%'),
  });

  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    [
      'PASS counts frontend-unit tests: 2064 passed (baseline 2064), 0 failed, 0 skipped',
      'PASS counts frontend-unit files: 136 (baseline 136)',
      'FAIL counts frontend-coverage: 3 blocks, lowest Statements 90.03 Branches 74.99 Functions 91.23 Lines 93.34',
      '',
    ].join('\n'),
  );
});

test('counts: a log without a summary line fails', (t) => {
  const directory = tempDirectory(t);

  const result = runCounts(directory, { 'frontend-contract': '' });

  assert.equal(result.status, 1);
  assert.equal(result.stdout, 'FAIL counts frontend-contract: no summary line\n');
});

test('counts: a frontend unit log without coverage lines fails', (t) => {
  const directory = tempDirectory(t);
  const withoutCoverage = FRONTEND_UNIT_LOG.split('\n')
    .filter((line) => !/^(Statements|Branches|Functions|Lines)/.test(line))
    .join('\n');

  const result = runCounts(directory, { 'frontend-unit': withoutCoverage });

  assert.equal(result.status, 1);
  assert.equal(
    result.stdout,
    [
      'PASS counts frontend-unit tests: 2064 passed (baseline 2064), 0 failed, 0 skipped',
      'PASS counts frontend-unit files: 136 (baseline 136)',
      'FAIL counts frontend-coverage: no summary line',
      '',
    ].join('\n'),
  );
});

test('an unknown subcommand exits 2 with the usage on stderr', (t) => {
  const directory = tempDirectory(t);

  const result = runVerify(['nonsense'], directory);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.split('\n')[0], 'usage: verify.mjs move --manifest <file> --commit <sha> [--repo <path>]');
});
