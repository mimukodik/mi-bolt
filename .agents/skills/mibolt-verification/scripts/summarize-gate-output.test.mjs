/**
 * Tests for summarize-gate-output.mjs. Run from this skill's directory (from
 * elsewhere, give the directory as seen from there):
 *   node --test scripts/
 *
 * No real gate runs here. Each gate goes through runGate with an injected
 * command runner that replays a fixture log and an exit code, and writes the
 * report files the real command would write, inside a throwaway repository
 * under the system temp directory.
 *
 * Fixtures (fixtures/). `@REPO@` stands for the repository root and `@TMP@`
 * for the log directory; a test swaps in its throwaway repository.
 *   Real output, trimmed:
 *     frontend-test-red.txt            frontend-test core-api, one failing assertion
 *     frontend-test-red-colored.txt    a full frontend test run with the default reporter
 *                                      and colours, two admin tests timed out; cut after
 *                                      the admin project, per-file coverage rows dropped
 *     frontend-test-build-error.txt    frontend-test core-api, a spec with an Angular
 *                                      template error and a type error
 *     frontend-test-unhandled.txt      frontend-test core-api --no-coverage, a spec that
 *                                      leaves a rejected promise unhandled
 *     frontend-test-green.txt          a full green frontend-test run
 *     eslint-files-red.json            frontend-lint with two files: one error, one warning
 *     frontend-lint-projects-red.txt   frontend-lint with no files, the same finding
 *     eslint-core-api-red.json         that run's core-api report, cut to three files
 *     eslint-shop-api.json             that run's shop-api report
 *     frontend-build-green.txt         a green frontend-build run
 *     backend-build-green.txt          a full green backend-build run
 *     backend-build-red-test-filter.txt  the backend test task run with a filter
 *                                      matching no test
 *   Assembled from real pieces:
 *     frontend-build-red.txt           the build banner around the real message blocks
 *                                      of frontend-test-build-error.txt and of
 *                                      frontend-test-red-colored.txt
 *     backend-build-red-tests.txt, junit-red.xml, junit-red-nested.xml
 *                                      Gradle's red test task and JUnit XML files built
 *                                      on a real green result file
 *     backend-build-red-pmd.txt        the PMD lines quoted in
 *                                      backend/docs/decisions/0009-pmd-quickstart-lint-gate.md
 *     backend-build-red-compile.txt    javac's `path:line: error:` lines
 *     backend-build-red-coverage.txt   the JaCoCo line quoted in
 *                                      backend/docs/decisions/0004-contract-validator-jacoco-gate-context-path-and-json-inclusion.md
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';

import {
  TAIL_LINE_COUNT,
  exitCodeOf,
  runGate,
  spawnCommand,
  stripAnsi,
  toLines,
  toRepoPath,
} from './summarize-gate-output.mjs';

const SCRIPT = path.join(import.meta.dirname, 'summarize-gate-output.mjs');
const FIXTURES = path.join(import.meta.dirname, 'fixtures');
const FLOORS = { perFile: false, statements: 80, branches: 75, functions: 80, lines: 80 };
const TEST_PROJECTS = ['storefront', 'demo-payment', 'admin', 'core-api', 'shop-mocks'];
const LINT_PROJECTS = ['storefront', 'demo-payment', 'admin', 'core-api', 'shop-api', 'shop-mocks'];
const REPORT_DIRS = {
  storefront: 'coverage/unit',
  'demo-payment': 'coverage/demo-payment',
  admin: 'coverage/admin',
  'core-api': 'coverage/core-api',
  'shop-mocks': 'coverage/shop-mocks',
};
const TEST_RESULTS = 'backend/services/commerce/build/test-results';
const FULL_COVERAGE = { statements: 100, branches: 100, functions: 100, lines: 100 };

// A throwaway repository holding what the script reads besides the log: the
// test targets of frontend/angular.json, each project's runner config, and
// the backend source files a failure is mapped to.
function makeRepo(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'summarize-gate-output-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, '.git'));
  const projects = {};
  for (const name of TEST_PROJECTS) {
    const runnerConfig = `projects/${name}/vitest.config.ts`;
    projects[name] = { architect: { test: { options: { runnerConfig, coverageThresholds: FLOORS } } } };
    writeFile(
      root,
      `frontend/${runnerConfig}`,
      `export default defineConfig({ test: { coverage: { reportsDirectory: '${REPORT_DIRS[name]}', reportOnFailure: true } } });\n`,
    );
  }
  writeFile(root, 'frontend/angular.json', JSON.stringify({ projects }));
  for (const file of [
    'backend/services/commerce/src/test/java/com/example/mi_bolt_backend/admin/catalog/AdminMediaServiceTest.java',
    'backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartServiceTest.java',
    'backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java',
  ]) {
    writeFile(root, file, '');
  }
  return root;
}

function writeFile(root, relative, content) {
  const file = path.join(root, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
  return file;
}

function fixture(name, root) {
  return readFileSync(path.join(FIXTURES, name), 'utf8').replaceAll('@REPO@', root);
}

function coverageSummary(pcts) {
  const total = {};
  for (const [metric, pct] of Object.entries(pcts)) total[metric] = { total: 100, covered: pct, skipped: 0, pct };
  return JSON.stringify({ total });
}

// A command runner that writes `files(plan)` the way the real command would,
// then replays `output` and returns the given exit code and signal.
function replay(output, { code = 0, signal = null, files = () => ({}) } = {}) {
  const plans = [];
  const runCommand = async (plan, write) => {
    plans.push(plan);
    for (const [file, content] of Object.entries(files(plan))) {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    write(Buffer.from(output));
    return { code, signal };
  };
  return { runCommand, plans };
}

async function run(t, gate, args, output, options = {}) {
  const root = options.root ?? makeRepo(t);
  const { runCommand, plans } = replay(typeof output === 'function' ? output(root) : output, {
    ...options,
    files: options.files ? (plan) => options.files(plan, root) : undefined,
  });
  const result = await runGate(gate, args, { repoRoot: root, runCommand, tmpRoot: root });
  return { ...result, plan: plans[0], root };
}

function coverageFiles(root, pctsByProject) {
  return Object.fromEntries(
    Object.entries(pctsByProject).map(([name, pcts]) => [
      path.join(root, 'frontend', REPORT_DIRS[name], 'coverage-summary.json'),
      coverageSummary(pcts),
    ]),
  );
}

describe('frontend-test', () => {
  test('prints a failed test as path:line:col, test name and message, and a count line', async (t) => {
    const outcome = await run(t, 'frontend-test', ['core-api'], (root) => fixture('frontend-test-red.txt', root), {
      code: 1,
      files: (plan, root) => coverageFiles(root, { 'core-api': FULL_COVERAGE }),
    });
    assert.deepEqual(outcome.plan.args, [
      '--prefix',
      'frontend',
      'run',
      'test',
      '--',
      'core-api',
      '--reporters',
      'minimal',
      '--no-watch',
    ]);
    assert.equal(outcome.exitCode, 1);
    assert.deepEqual(outcome.lines.slice(0, -1), [
      '$ npm --prefix frontend run test -- core-api --reporters minimal --no-watch',
      'frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:6:19 temporary red run > compares two different numbers — AssertionError: expected 2 to be 3 // Object.is equality',
      'core-api: tests 1 failed | 21 passed (22); coverage (value/floor) statements 100/80, branches 100/75, functions 100/80, lines 100/80',
    ]);
    assert.match(outcome.lines.at(-1), /^exit 1; full log: .*frontend-test\.log \(55 lines\)$/);
  });

  test('reads coloured default-reporter output, one count line per project', async (t) => {
    const outcome = await run(t, 'frontend-test', [], (root) => fixture('frontend-test-red-colored.txt', root), {
      code: 1,
    });
    const failures = outcome.lines.filter((line) => line.startsWith('frontend/'));
    assert.deepEqual(failures, [
      'frontend/projects/admin/src/app/app.routes.spec.ts:169:3 admin route loaders > the shell loader returns ShellComponent — Error: Test timed out in 5000ms.',
      'frontend/projects/admin/src/app/features/products/edit/product-edit-page.spec.ts:177:3 ProductEditPage > 1: edit mode renders product 1, no spinner, Mentés enabled, slug read-only — Error: Test timed out in 5000ms.',
    ]);
    assert.ok(
      outcome.lines.includes(
        "storefront build (warning) — File 'tests/setup-msw.ts' not found in TypeScript compilation. [plugin angular-compiler]",
      ),
    );
    assert.deepEqual(
      outcome.lines.filter((line) => /^[\w-]+: tests/.test(line)),
      [
        'storefront: tests 1219 passed (1219); coverage: no report from this run',
        'demo-payment: tests 23 passed (23); coverage: no report from this run',
        'admin: tests 2 failed | 833 passed (835); coverage: no report from this run',
      ],
    );
    assert.ok(!outcome.lines.some((line) => line.includes('\u001b')));
  });

  test('prints an unhandled error although every test passed', async (t) => {
    const outcome = await run(
      t,
      'frontend-test',
      ['core-api', '--no-coverage'],
      (root) => fixture('frontend-test-unhandled.txt', root),
      { code: 1 },
    );
    assert.equal(outcome.exitCode, 1);
    assert.deepEqual(outcome.lines.slice(1, -1), [
      'frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:3:25 Unhandled Rejection — Error: rejected outside the test',
      'core-api: tests 22 passed (22); errors 1 error; coverage: no report from this run',
    ]);
  });

  test('prints the build errors of the test build with their code and a 1-based column', async (t) => {
    const outcome = await run(t, 'frontend-test', ['core-api'], (root) => fixture('frontend-test-build-error.txt', root), {
      code: 1,
    });
    assert.deepEqual(outcome.lines.slice(1, -1), [
      "frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:5:19 NG8002 — Can't bind to 'notAProperty' since it isn't a known property of 'div'. Find more at https://next.angular.dev/errors/NG8002 [plugin angular-compiler]",
      "frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:11:11 TS2322 — Type 'string' is not assignable to type 'number'. [plugin angular-compiler]",
      'core-api: tests: no summary in the output; coverage: no report from this run',
    ]);
  });

  test('flags a coverage figure below the project floor from frontend/angular.json', async (t) => {
    const outcome = await run(t, 'frontend-test', [], (root) => fixture('frontend-test-green.txt', root), {
      code: 1,
      files: (plan, root) =>
        coverageFiles(root, {
          storefront: { statements: 91.6, branches: 88.38, functions: 90.83, lines: 93.95 },
          'demo-payment': FULL_COVERAGE,
          admin: { statements: 81, branches: 74.99, functions: 98.25, lines: 70.5 },
          'core-api': FULL_COVERAGE,
          'shop-mocks': FULL_COVERAGE,
        }),
    });
    const errors = outcome.lines.filter((line) => line.startsWith('admin coverage'));
    assert.deepEqual(errors, [
      'admin coverage — branches 74.99% is below the floor of 75%',
      'admin coverage — lines 70.5% is below the floor of 80%',
    ]);
    assert.ok(
      outcome.lines.includes(
        'admin: tests 835 passed (835); coverage (value/floor) statements 81/80, branches 74.99/75, functions 98.25/80, lines 70.5/80',
      ),
    );
    assert.ok(!outcome.lines.some((line) => line.startsWith('no failure recognised')));
  });

  test('ignores a coverage summary an earlier run left behind', async (t) => {
    const root = makeRepo(t);
    const stale = writeFile(
      root,
      'frontend/coverage/core-api/coverage-summary.json',
      coverageSummary({ statements: 10, branches: 10, functions: 10, lines: 10 }),
    );
    const anHourAgo = new Date(Date.now() - 3_600_000);
    utimesSync(stale, anHourAgo, anHourAgo);
    const outcome = await run(t, 'frontend-test', ['core-api'], fixture('frontend-test-red.txt', root), {
      root,
      code: 1,
    });
    assert.ok(outcome.lines.includes('core-api: tests 1 failed | 21 passed (22); coverage: no report from this run'));
    assert.ok(!outcome.lines.some((line) => line.includes('below the floor')));
  });
});

describe('frontend-lint', () => {
  test('with files, lints them from frontend/ and prints errors before warnings', async (t) => {
    const files = ['projects/core-api/src/zz-temporary-red-run.spec.ts', 'projects/core-api/src/splash.ts'];
    const outcome = await run(t, 'frontend-lint', files, '', {
      code: 1,
      files: (plan, root) => ({ [plan.args[plan.args.indexOf('-o') + 1]]: fixture('eslint-files-red.json', root) }),
    });
    assert.equal(outcome.plan.command, 'npx');
    assert.equal(outcome.plan.cwd, path.join(outcome.root, 'frontend'));
    assert.deepEqual(outcome.plan.args.slice(0, 4), ['eslint', '--format', 'json', '-o']);
    assert.deepEqual(outcome.plan.args.slice(5), files);
    assert.equal(outcome.exitCode, 1);
    assert.deepEqual(outcome.lines.slice(1, -1), [
      "frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:3:11 @typescript-eslint/no-unused-vars — 'unusedValue' is assigned a value but never used. Allowed unused vars must match /^_/u.",
      'frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:4:21 security/detect-unsafe-regex (warning) — Unsafe Regular Expression',
      'eslint: 1 error, 1 warning in 2 files',
    ]);
  });

  test('with no files, reads one report per project through the {projectName} placeholder', async (t) => {
    const outcome = await run(t, 'frontend-lint', [], (root) => fixture('frontend-lint-projects-red.txt', root), {
      code: 1,
      files: (plan, root) => {
        const template = plan.args[plan.args.indexOf('--output-file') + 1];
        const reportPath = (name) => path.join(root, 'frontend', template.replace('{projectName}', name));
        return Object.fromEntries(
          LINT_PROJECTS.map((name) => [
            reportPath(name),
            name === 'core-api' ? fixture('eslint-core-api-red.json', root) : fixture('eslint-shop-api.json', root),
          ]),
        );
      },
    });
    const template = outcome.plan.args.at(-1);
    assert.ok(!path.isAbsolute(template), 'the lint builder strips a leading slash, so the path is relative');
    assert.equal(path.dirname(path.join(outcome.root, 'frontend', template)), path.dirname(outcome.logPath));
    assert.deepEqual(outcome.lines.slice(1, -1), [
      "frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:3:11 @typescript-eslint/no-unused-vars — 'unusedValue' is assigned a value but never used. Allowed unused vars must match /^_/u.",
      'frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:4:21 security/detect-unsafe-regex (warning) — Unsafe Regular Expression',
      'storefront: 0 errors, 0 warnings in 1 file',
      'demo-payment: 0 errors, 0 warnings in 1 file',
      'admin: 0 errors, 0 warnings in 1 file',
      'core-api: 1 error, 1 warning in 3 files',
      'shop-api: 0 errors, 0 warnings in 1 file',
      'shop-mocks: 0 errors, 0 warnings in 1 file',
    ]);
  });

  test('says when no report was written and shows the end of the log', async (t) => {
    const output = '\nOops! Something went wrong! :(\n\nESLint: 10.10.0\n\nNo files matching the pattern "projects/nope.ts" were found.\n';
    const outcome = await run(t, 'frontend-lint', ['projects/nope.ts'], output, { code: 2 });
    assert.equal(outcome.exitCode, 2);
    assert.ok(outcome.lines.includes('eslint: no report written'));
    assert.ok(outcome.lines.includes('No files matching the pattern "projects/nope.ts" were found.'));
  });
});

describe('frontend-build', () => {
  test('prints build errors and warnings, each with its location or the project', async (t) => {
    const outcome = await run(t, 'frontend-build', [], fixture('frontend-build-red.txt', ''), { code: 1 });
    assert.equal(outcome.exitCode, 1);
    assert.deepEqual(outcome.lines.slice(0, -1), [
      '$ npm --prefix frontend run build',
      "frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:5:19 NG8002 — Can't bind to 'notAProperty' since it isn't a known property of 'div'. Find more at https://next.angular.dev/errors/NG8002 [plugin angular-compiler]",
      "frontend/projects/core-api/src/zz-temporary-red-run.spec.ts:11:11 TS2322 — Type 'string' is not assignable to type 'number'. [plugin angular-compiler]",
      "storefront build (warning) — File 'tests/setup-msw.ts' not found in TypeScript compilation. [plugin angular-compiler]",
      'storefront: 2 errors, 1 warning',
    ]);
  });

  test('prints one count line for a green build', async (t) => {
    const outcome = await run(t, 'frontend-build', [], (root) => fixture('frontend-build-green.txt', root));
    assert.deepEqual(outcome.lines.slice(1, -1), ['storefront: 0 errors, 0 warnings']);
    assert.match(outcome.lines.at(-1), /^exit 0; full log: .*\(37 lines\)$/);
  });
});

describe('backend-build', () => {
  test('prints a count line per gate task for a green build', async (t) => {
    const outcome = await run(t, 'backend-build', [], (root) => fixture('backend-build-green.txt', root));
    assert.equal(outcome.plan.display, 'backend/gradlew');
    assert.deepEqual(outcome.plan.args, ['-p', 'backend', ':services:commerce:build']);
    assert.deepEqual(outcome.lines.slice(0, -1), [
      '$ backend/gradlew -p backend :services:commerce:build',
      'compileJava: 0 errors',
      'compileTestJava: 0 errors',
      'test: 360 tests, 360 passed, 0 failed, 0 skipped',
      'integrationTest: 415 tests, 415 passed, 0 failed, 0 skipped',
      'jacocoTestCoverageVerification: passed',
      'pmdMain: 0 violations',
      'pmdTest: 0 violations',
    ]);
  });

  test('maps failing tests from this run\'s JUnit XML to the test source line', async (t) => {
    const outcome = await run(t, 'backend-build', [], (root) => fixture('backend-build-red-tests.txt', root), {
      code: 1,
      files: (plan, root) => ({
        [path.join(root, TEST_RESULTS, 'test', 'TEST-com.example.mi_bolt_backend.admin.catalog.AdminMediaServiceTest.xml')]:
          fixture('junit-red.xml', root),
        [path.join(root, TEST_RESULTS, 'test', 'TEST-com.example.mi_bolt_backend.cart.CartServiceTest$WhenEmpty.xml')]:
          fixture('junit-red-nested.xml', root),
      }),
    });
    assert.equal(outcome.exitCode, 1);
    const root = outcome.root;
    assert.deepEqual(outcome.lines.slice(1, -1), [
      'backend/services/commerce/src/test/java/com/example/mi_bolt_backend/admin/catalog/AdminMediaServiceTest.java:57 AdminMediaServiceTest > aViolationWithoutAStoredRowIsRethrown() — org.opentest4j.AssertionFailedError: expected: <1> but was: <2>',
      'backend/services/commerce/src/test/java/com/example/mi_bolt_backend/cart/CartServiceTest.java:88 CartServiceTest$WhenEmpty > rejectsCheckout() — java.lang.IllegalStateException: no cart for the session',
      '* What went wrong:',
      "Execution failed for task ':services:commerce:test'.",
      `> There were failing tests. See the report at: file://${root}/backend/services/commerce/build/reports/tests/test/index.html`,
      'compileJava: up to date',
      'compileTestJava: up to date',
      'test: 5 tests, 2 passed, 2 failed, 1 skipped',
      'integrationTest: not run',
      'jacocoTestCoverageVerification: not run',
      'pmdMain: not run',
      'pmdTest: not run',
    ]);
  });

  test('ignores JUnit XML an earlier run left and falls back to the log', async (t) => {
    const root = makeRepo(t);
    const stale = writeFile(root, `${TEST_RESULTS}/test/TEST-old.xml`, fixture('junit-red.xml', root));
    const anHourAgo = new Date(Date.now() - 3_600_000);
    utimesSync(stale, anHourAgo, anHourAgo);
    const outcome = await run(t, 'backend-build', [], fixture('backend-build-red-tests.txt', root), { root, code: 1 });
    assert.ok(outcome.lines.includes('test: 360 tests completed, 2 failed'));
    assert.ok(!outcome.lines.some((line) => line.includes('AdminMediaServiceTest.java')));
    assert.ok(outcome.lines.includes('* What went wrong:'));
    assert.ok(!outcome.lines.some((line) => line.startsWith('no failure recognised')));
  });

  test('prints PMD violations with their rule, relative to the repository root', async (t) => {
    const outcome = await run(t, 'backend-build', [], (root) => fixture('backend-build-red-pmd.txt', root), { code: 1 });
    const violations = outcome.lines.filter((line) => line.includes('UnnecessaryFullyQualifiedName —'));
    assert.deepEqual(violations, [
      "backend/services/commerce/src/test/java/com/example/mi_bolt_backend/session/SessionTokenServiceTest.java:52 UnnecessaryFullyQualifiedName — Unnecessary qualifier 'java.util': 'List' is already in scope because it is imported in this file",
      "backend/services/commerce/src/test/java/com/example/mi_bolt_backend/session/SessionTokenServiceTest.java:52 UnnecessaryFullyQualifiedName — Unnecessary qualifier 'java.util': 'ArrayList' is already in scope because it is imported in this file",
    ]);
    assert.ok(outcome.lines.includes('pmdMain: 0 violations'));
    assert.ok(outcome.lines.includes('pmdTest: 2 violations'));
    assert.ok(outcome.lines.includes('test: 360 tests, 360 passed, 0 failed, 0 skipped'));
  });

  test('prints a compiler error once, although the failure report repeats it', async (t) => {
    const outcome = await run(t, 'backend-build', [], (root) => fixture('backend-build-red-compile.txt', root), {
      code: 1,
    });
    const errors = outcome.lines.filter((line) => line.includes(' javac — '));
    assert.deepEqual(errors, [
      'backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java:42 javac — cannot find symbol',
    ]);
    assert.ok(outcome.lines.includes('compileJava: 1 error'));
    assert.ok(outcome.lines.includes('test: not run'));
    // Were the failure report to repeat the error unindented, the task's
    // count still holds only the error the task itself printed.
    const repeated = await run(
      t,
      'backend-build',
      [],
      (root) =>
        fixture('backend-build-red-compile.txt', root).replace(
          `  ${root}/backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java:42: error:`,
          `${root}/backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java:42: error:`,
        ),
      { code: 1 },
    );
    assert.ok(repeated.lines.includes('compileJava: 1 error'));
    assert.equal(repeated.lines.filter((line) => line.includes(' javac — ')).length, 1);
  });

  test('prints a coverage rule violation, a class one against its source file', async (t) => {
    const outcome = await run(t, 'backend-build', [], (root) => fixture('backend-build-red-coverage.txt', root), {
      code: 1,
    });
    assert.ok(
      outcome.lines.includes(
        'mi-bolt-backend coverage — bundle: lines covered ratio is 0.9, but expected minimum is 1.0',
      ),
    );
    assert.ok(outcome.lines.includes('jacocoTestCoverageVerification: failed'));
    const classRule = await run(
      t,
      'backend-build',
      [],
      '   > Rule violated for class com.example.mi_bolt_backend.cart.CartService: lines covered ratio is 0.75, but expected minimum is 0.80\n',
      { code: 1 },
    );
    assert.ok(
      classRule.lines.includes(
        'backend/services/commerce/src/main/java/com/example/mi_bolt_backend/cart/CartService.java coverage — lines covered ratio is 0.75, but expected minimum is 0.80',
      ),
    );
  });

  test("prints Gradle's failure report when no single failure can be itemised", async (t) => {
    const outcome = await run(t, 'backend-build', [], (root) => fixture('backend-build-red-test-filter.txt', root), {
      code: 1,
    });
    assert.deepEqual(outcome.lines.slice(1, 4), [
      '* What went wrong:',
      "Execution failed for task ':services:commerce:test'.",
      '> No tests found for given includes: [com.example.mi_bolt_backend.NoSuchTest](--tests filter)',
    ]);
    assert.ok(outcome.lines.includes('test: failed, no test results written by this run'));
    assert.ok(!outcome.lines.some((line) => line.startsWith('no failure recognised')));
  });
});

describe('fallback and exit codes', () => {
  const noise = `${Array.from({ length: 60 }, (_, index) => `line ${index + 1}`).join('\n')}\n\n`;

  test('prints the last log lines when the gate fails and nothing was recognised', async (t) => {
    const outcome = await run(t, 'frontend-build', [], noise, { code: 1 });
    const marker = outcome.lines.indexOf(`no failure recognised in the output; the last ${TAIL_LINE_COUNT} log lines:`);
    assert.notEqual(marker, -1);
    assert.deepEqual(
      outcome.lines.slice(marker + 1, -1),
      Array.from({ length: TAIL_LINE_COUNT }, (_, index) => `line ${index + 21}`),
    );
  });

  test('prints no log lines when the gate passes', async (t) => {
    const outcome = await run(t, 'frontend-build', [], noise, { code: 0 });
    assert.ok(!outcome.lines.some((line) => line.startsWith('no failure recognised')));
  });

  test('passes the exit code through unchanged', async (t) => {
    const outcome = await run(t, 'frontend-build', [], noise, { code: 3 });
    assert.equal(outcome.exitCode, 3);
    assert.match(outcome.lines.at(-1), /^exit 3; full log: /);
  });

  test('exits 1 for a gate killed by a signal', async (t) => {
    const outcome = await run(t, 'backend-build', [], noise, { code: null, signal: 'SIGTERM' });
    assert.equal(outcome.exitCode, 1);
    assert.match(outcome.lines.at(-1), /^exit 1 \(killed by SIGTERM\); full log: /);
  });

  test('never derives the exit code from what was found', async (t) => {
    const outcome = await run(t, 'frontend-test', ['core-api'], (root) => fixture('frontend-test-red.txt', root), {
      code: 0,
    });
    assert.equal(outcome.exitCode, 0);
    assert.ok(outcome.lines.some((line) => line.includes('AssertionError')));
  });

  test('keeps the whole output in the log file named on the last line', async (t) => {
    const outcome = await run(t, 'frontend-build', [], noise, { code: 1 });
    assert.equal(readFileSync(outcome.logPath, 'utf8'), noise);
    assert.ok(outcome.lines.at(-1).includes(`${outcome.logPath} (61 lines)`));
    assert.deepEqual(readdirSync(path.dirname(outcome.logPath)), ['frontend-build.log']);
  });

  test('the real runner returns the exit code and the signal of the command', async () => {
    const chunks = [];
    const write = (chunk) => chunks.push(chunk);
    const exited = await spawnCommand(
      { command: process.execPath, args: ['-e', 'process.stdout.write("out"); process.stderr.write("err"); process.exit(7)'] },
      write,
    );
    assert.deepEqual(exited, { code: 7, signal: null });
    assert.equal(exitCodeOf(exited), 7);
    const output = Buffer.concat(chunks).toString('utf8');
    assert.ok(output.includes('out') && output.includes('err'), output);
    const killed = await spawnCommand(
      { command: process.execPath, args: ['-e', 'process.kill(process.pid, "SIGTERM")'] },
      write,
    );
    assert.deepEqual(killed, { code: null, signal: 'SIGTERM' });
    assert.equal(exitCodeOf(killed), 1);
  });

  test('the real runner rejects when the command cannot start', async () => {
    await assert.rejects(spawnCommand({ command: 'summarize-gate-output-no-such-command', args: [] }, () => {}));
  });
});

describe('command line', () => {
  const cli = (args, cwd) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

  test('exits 2 with the usage for a missing or unknown gate, or arguments a gate does not take', () => {
    for (const args of [[], ['lint'], ['frontend-build', 'extra']]) {
      const result = cli(args, process.cwd());
      assert.equal(result.status, 2, args.join(' '));
      assert.match(result.stderr, /usage: summarize-gate-output\.mjs/);
      assert.equal(result.stdout, '');
    }
  });

  test('exits 2 outside a repository root', (t) => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'summarize-gate-output-test-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const result = cli(['frontend-build'], dir);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /has no \.git; run this from the repository root/);
  });
});

describe('text helpers', () => {
  test('strip escape sequences and keep what a carriage return drew last', () => {
    assert.equal(stripAnsi('\u001b[31mred\u001b[39m \u001b]8;;https://example.test\u0007link\u001b]8;;\u0007'), 'red link');
    assert.deepEqual(toLines('❯ Building...\r✔ Building...\r\nnext\n'), ['✔ Building...', 'next', '']);
  });

  test('print paths relative to the repository root', () => {
    assert.equal(toRepoPath('projects/a.ts', 'frontend', '/repo'), 'frontend/projects/a.ts');
    assert.equal(toRepoPath('/repo/backend/B.java', 'backend/services/commerce', '/repo'), 'backend/B.java');
    assert.equal(toRepoPath('/elsewhere/C.java', 'backend', '/repo'), '/elsewhere/C.java');
  });

  test('fixtures hold no absolute or machine-specific path', () => {
    for (const name of readdirSync(FIXTURES)) {
      const text = readFileSync(path.join(FIXTURES, name), 'utf8');
      assert.doesNotMatch(text, /\/Users\/|\/home\/|\/var\/folders\/|[A-Z]:\\\\/, name);
    }
  });
});
