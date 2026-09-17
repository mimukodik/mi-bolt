# FIX-04 — Delete the hand-rolled vitest plugin and make `ng test` pass

Status: PLANNED — not executed.
Severity: blocker
Source: A1 A1, A1 A2, A5 Part 0

## Why this is wrong

`docs/spec/architecture.md:25` requires the **official Angular CLI application and
unit-test builders**, and `docs/spec/testing.md:22` names the pipeline exactly: *"Use the
Angular official `@angular/build:unit-test` builder with Vitest and coverage-v8."*
`vitest.config.ts` is 534 lines, of which roughly 480 are a hand-written TypeScript
decorator transpiler, a JIT signal-input shim and a raw-resource loader, written to make
a **second**, unofficial test entry point work. That second entry point is what broke the
official one: one line of the same file, `environment: 'node'`, is fed to the Angular
builder through `runnerConfig`, and it is why all 14 co-located component specs fail.

This is the file the user was pointing at: *"vitest config fájlba is olyanokat látok
aminek szerintem nincs értelme"* ("in the vitest config too I see things that in my view
make no sense"), and more generally: *"mindent saját ötletekkel oldott meg a standard
létező megoldások helyett"* ("solved everything with his own ideas instead of the
existing standard solutions"). This task is the one that answers that complaint, so
**the argument for deleting the code is made from the installed package's own behaviour,
quoted below, not from taste.**

## Evidence

### The failure, measured

Measured by the orchestrator on commit `db6d295`: `npm run test` (which is `ng test`,
`package.json:9`) exits **1** with **14 of 14 files failing**, **76 failed / 5 passed /
36 skipped**, and every single failure is the same error:

```text
ReferenceError: document is not defined
```

### The one line that causes it

`vitest.config.ts:503-509`:

```ts
export default defineConfig({
  plugins: [tsLegacyDecoratorsPlugin(), rawResourcePlugin()],
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    globals: true,
```

`angular.json:90-94` hands that file to the builder:

```json
        "test": {
          "builder": "@angular/build:unit-test",
          "options": {
            "runnerConfig": "vitest.config.ts",
```

The builder respects an environment the user set and only supplies its own when the user
did not —
`node_modules/@angular/build/src/builders/unit-test/runners/vitest/plugins.js:205-209`:

```js
                    // If the user has not specified an environment, use a smart default.
                    ...(!testConfig?.environment
                        ? { environment: await findTestEnvironment(projectResolver) }
                        : {}),
```

and that smart default is a DOM, same file `:56-64`:

```js
async function findTestEnvironment(projectResolver) {
    try {
        projectResolver('happy-dom');
        return 'happy-dom';
    }
    catch {
        // happy-dom is not installed, fallback to jsdom
        return 'jsdom';
    }
}
```

`happy-dom` is not a dependency; `jsdom` is (`package.json:48`, `"jsdom": "^28.0.0"`).
So removing the `environment` line gives every spec a `document`, from the installed
packages, with no new dependency.

### The per-file escape hatch was already tried and does not work here

Two of the 14 files carry the official docblock and still failed:
`src/app/features/catalog/catalog-page.spec.ts:20` and
`src/app/features/catalog/product-card.spec.ts:24`, both

```ts
// @vitest-environment jsdom
```

In each file that comment is **not in the file's first comment block** — a 19-line and a
23-line JSDoc header precede it — and in each case the builder bundles the spec into a
`spec-*.js` entry point before Vitest sees it. Either reason alone defeats the docblock,
and the fix is the same: the environment override comes out of the shared config
entirely. This also rules out the alternative A5 Part 0 floats (keep
`environment: 'node'` and mark files with `// @vitest-environment node`) — the repository
has already run that experiment twice and it did not take.

### The builder already does everything the 480 lines do

`node_modules/@angular/build/src/builders/unit-test/runners/vitest/build-options.js:24-32`
— the builder generates its own TestBed bootstrap:

```js
 * Creates the virtual file contents to initialize the Angular testing environment (TestBed).
```

and the generated file calls it, same file `:119`:

```js
      getTestBed().initTestEnvironment([BrowserTestingModule, TestModule], platformBrowserTesting(), {
```

The specs run through `@angular/build:application`, that is the real Angular compiler with
AOT, so `@Component`, `input()`, `output()` and view queries are compiled rather than
transpiled. The hand-rolled plugin's own doc comment
(`vitest.config.ts:21-48`) states that its workaround is needed because *"Vite 8 /
Rolldown switched the SSR transform pipeline to oxc"* and *"esbuild… does NOT emit
`__metadata(...)`"* — both true **only for a bare `vitest run` that bypasses the Angular
builder**, which is the second entry point this task removes.

Worse than redundant: the builder does not discard user plugins, it **merges them into
its own pipeline** — `plugins.js:160-171`:

```js
            // Merge user-defined plugins from the Vitest config with the CLI's internal plugins.
            if (config.plugins) {
                const userPlugins = config.plugins.filter((plugin) =>
```

So the hand-rolled TypeScript transpiler is currently running inside Angular's own AOT
build.

### Two more lines of the same config are already dead

`vitest.config.ts:506`, `include: ['tests/**/*.spec.ts']`, is deleted by the builder with
a warning — `plugins.js:145-149`:

```js
            if (testConfig?.include) {
                this.warn('The "test.include" option in the Vitest configuration file is not supported. ' +
                    'The Angular CLI Test system will manage test file discovery.');
                delete testConfig.include;
            }
```

`vitest.config.ts:508`, `globals: true`, is the builder's own default —
`plugins.js:179-184`:

```js
            const projectDefaults = {
                test: {
                    setupFiles,
                    globals: true,
```

which matters, because 12 of the 14 co-located specs import nothing from `'vitest'` and
rely on those globals. Confirmed by running
`grep -c "from 'vitest'" src/app/shared/ui/accessible-dialog/accessible-dialog.spec.ts`,
which prints `0`.

### The one setting that must stay, and why

`reportsDirectory` is **not** a builder option. The builder's schema
(`node_modules/@angular/build/src/builders/unit-test/schema.json`) exposes `coverage`,
`coverageInclude`, `coverageExclude`, `coverageReporters`, `coverageThresholds` and
`coverageWatermarks` — and no report directory. The only source for it is the runner
config, `plugins.js:416`:

```js
        reportsDirectory: configCoverage?.reportsDirectory ?? (0, path_1.toPosixPath)(node_path_1.default.join('coverage', projectName)),
```

So with no runner config the report would land in `coverage/mi-bolt/`, and this task keeps
it at the explicit, predictable path `coverage/unit/` instead, so whoever records the
coverage evidence under `docs/mi-bolt/execution/` knows where to find it. That is the
single reason `vitest.config.ts` survives this task at all, reduced to that one setting.

### Two specs bootstrap TestBed a second time

`src/app/features/catalog/product-card.spec.ts:25-31` and `:48-55`:

```ts
import 'reflect-metadata';
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
```

```ts
beforeAll(async () => {
  TestBed.initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
    { teardown: { destroyAfterEach: true } },
  );
  await TestBed.compileComponents();
});
```

and the same pattern in `src/app/features/catalog/catalog-page.spec.ts:21-27` and
`:116` onward. The builder has already called `initTestEnvironment` (`build-options.js:119`,
quoted above); a second call with no `resetTestEnvironment()` in front of it throws.
`grep -rn "resetTestEnvironment" src/ tests/` returns **nothing** in the whole
repository, so nothing guards it. These two files are the only two under `src/` that do
this: `grep -rln "initTestEnvironment" src/` returns exactly those two paths.

### Why the `tests/**` suite cannot simply come along

The builder resolves every `include` glob relative to the project's source root, not the
workspace root — `node_modules/@angular/build/src/builders/unit-test/test-discovery.js:42-72`:

```js
        const globMatches = await (0, tinyglobby_1.glob)(dynamicPatterns, {
            cwd: projectSourceRoot,
```

`angular.json:14` sets `"sourceRoot": "src"`. **A spec outside `src/` is therefore
unreachable by `ng test`, whatever the `include` option says.** That is not a preference,
it is the discovery implementation, and it is the reason FIX-06 exists and why this task
hands the `tests/**` tree to it explicitly below.

## What to change

Four files.

### 1. `vitest.config.ts` — replace the entire file

Delete all 534 lines and write exactly this in their place:

```ts
// vitest.config.ts — runner configuration for `ng test`.
//
// The `@angular/build:unit-test` builder owns test discovery, the
// TestBed bootstrap, the DOM environment, the `globals` default and the
// coverage include / exclude / reporter set. Those are declared in
// angular.json. This file exists for exactly one setting the builder's
// schema does not expose: the directory the coverage report is written
// to. Coverage evidence for this workspace is recorded at
// coverage/unit/coverage-final.json, while the builder's own default is
// coverage/<projectName>; see
// node_modules/@angular/build/src/builders/unit-test/runners/vitest/plugins.js:416.
//
// Do not add a plugin, an `environment`, an `include`, `globals` or
// `setupFiles` here. The builder deletes `test.include` outright, merges
// user plugins into its own AOT pipeline, and supplies the rest itself.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      reportsDirectory: 'coverage/unit',
    },
  },
});
```

That removes `tsLegacyDecoratorsPlugin` and its JIT signal-input shim
(`:18-466`), `rawResourcePlugin` (`:468-501`), `environment: 'node'`, `include`,
`globals`, `setupFiles`, `reportsFilename`, `all`, `skipFull` and the `provider` /
`include` / `exclude` / `reporter` block that duplicates `angular.json:92-108`.
`thresholds: undefined` goes with them — **FIX-08 owns turning thresholds on, and it
will do it through `angular.json`'s `coverageThresholds`, so nothing is lost by removing
the line here.**

### 2. `angular.json` — leave the `test` target as it is

No edit. `"runnerConfig": "vitest.config.ts"` stays, for the one reason quoted in the
evidence. Do not delete the key on the grounds that the file "no longer does anything";
it does exactly one thing — it is the only place the coverage report's directory can be
set, and the workspace's coverage evidence is recorded against that fixed path.

### 3. `src/app/features/catalog/product-card.spec.ts` and `catalog-page.spec.ts`

In each of the two files, delete:

- the `// @vitest-environment jsdom` line (`product-card.spec.ts:24`,
  `catalog-page.spec.ts:20`);
- `import 'reflect-metadata';` and `import '@angular/compiler';`;
- the `import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from
  '@angular/platform-browser-dynamic/testing';` statement;
- the `beforeAll` block containing `TestBed.initTestEnvironment(...)`. In
  `product-card.spec.ts` that block also calls `await TestBed.compileComponents();`;
  **keep a `beforeAll` that calls only `await TestBed.compileComponents();`** if removing
  the whole block would remove that call too.

Keep `import { TestBed } from '@angular/core/testing';`, keep every
`TestBed.configureTestingModule` call, keep `afterEach(() => TestBed.resetTestingModule())`,
and keep every assertion. Nothing about what these two suites test changes.

After the edit, `grep -rn "platform-browser-dynamic" src/` must return nothing.

### 4. `package.json` — remove the redundant script; add nothing in its place

Remove `"test:unit:coverage": "vitest run --coverage"` (`package.json:20`). That bare
`vitest run` is the second entry point, and it is the reason all 480 deleted lines
existed. With `vitest.config.ts` reduced, it would no longer find any test, no longer
have a Node environment and no longer have its MSW setup file — it must go, not be
repaired.

**Add nothing in its place.** `ng test` is already `npm run test` (`package.json:9`), and
`angular.json`'s `test` target already sets `"coverage": true`, so a second script naming
the same invocation is exactly the kind of duplicate name D17 (`docs/fix/FIX-47.md`)
removes. Do not create `test:unit`. Leave `"test": "ng test"` at `:9` exactly as it is.

### What this task deliberately leaves broken, and who owns it

**Say this in the commit body; do not let it be discovered later.**

From this commit until FIX-06 lands, the 30 spec files under `tests/` are collected by
**no runner at all**. That is a direct consequence of the discovery rule quoted above:
`ng test` cannot see outside `src/`, and the command that used to run them
(`vitest run --coverage`) was the thing that forced the deleted plugin into existence.
Repairing it by keeping a second Angular-aware vitest config would re-create the exact
problem this task removes.

**FIX-06 owns relocating them**, and it also owns the one part that cannot simply move:
`tests/contract/**`, which `docs/spec/architecture.md:101` says belongs at the top level
(*"top-level tests owns shared/contract fixtures"*) and which FIX-06 runs directly with
`npx vitest run --config vitest.contract.config.ts` — no npm script name of its own,
under D17.

A second, smaller consequence: the coverage report `npm run test` writes will cover
**fewer** lines after this commit than before, because the report is now produced only by
the 14 `src/**` specs. FIX-08 has not yet turned coverage thresholds on, so nothing fails
because of this; it is a number that goes down and then back up as FIX-06, FIX-07 and
FIX-08 land, not a gate this task must satisfy.

## Out of scope

- **Moving or rewriting anything under `tests/` — FIX-06 and FIX-07.** Do not move one
  file in this task. Do not delete one either.
- **Turning coverage thresholds on, and `src/mocks/**` in the gate — FIX-08.**
- **The 41 Playwright failures — FIX-09.** `npx playwright test` is not run here.
- **`eslint.config.js` — FIX-02.** The `src/app/shared/ui/**` override and the
  `@ViewChild` migration are that task's; note that FIX-02 depends on this one.
- **Any assertion inside any spec.** This task changes how the suite is *started*, never
  what it *asserts*. If a spec now fails on its own assertions, that is a real result and
  it goes in the list this task hands on — see the next section.

## How to verify

From the repository root, npm only.

1. `npm run test`

   Collects **14** files, all under `src/`. Two things must be true:

   - `npm run test 2>&1 | grep -c "document is not defined"` prints **`0`**.
   - No file is reported as `skipped` because of a failing `beforeAll`. The 36 "skipped"
     tests in the baseline were not `.skip()` calls — `grep -rn "\.skip\|\.todo\|\.only"
     src/app/features/catalog/` returns nothing — they were Vitest's cascade from a
     throwing module-scope hook. All 36 must now report a real pass or a real fail.

2. `npm run test`

   Must produce `coverage/unit/coverage-final.json` — `angular.json`'s `test` target
   already sets `"coverage": true`, so the coverage report is a side effect of the same
   command checked in step 1, not a second script. Check with
   `ls -l coverage/unit/coverage-final.json`. If it lands in `coverage/mi-bolt/` instead,
   the `reportsDirectory` setting in the rewritten `vitest.config.ts` did not take and the
   task is not done.

3. `npm run build` — must exit **0**, unchanged from the `db6d295` baseline.

4. `wc -l vitest.config.ts` — must print a number under **30**.

5. `grep -rn "platform-browser-dynamic\|reflect-metadata" src/` — must print nothing.

**On step 1's exit code, read this carefully.** `npm run test` exiting `0` is the best
outcome but it is **not** this task's acceptance bar, and the reason is in the baseline:
the suite has never executed. Not one of the 76 failing assertions has ever been
evaluated against a real DOM, so nobody — not this task file, not the audit reports, not
the orchestrator — knows how many of them are correct. **This task's acceptance cannot be
checked against a suite that has never run.** What it can be checked against is whether
the *runner* is fixed: zero `document is not defined`, zero cascade-skips, 14 files
collected, coverage written to the right directory. Any assertion failure that survives
is a defect in the test or in the code it tests, not in the runner, and it is recorded
rather than repaired here:

- List every remaining failure in the commit body as
  `file:line — test name — one-line symptom`.
- Attribute each to the FIX number that owns it. A source-text assertion belongs to
  FIX-07; a coverage complaint to FIX-08; a real product defect to whichever of FIX-10
  through FIX-35 owns that screen or layer, named by number only.
- Do not add `.skip`, `.todo` or `.only` to make the run green.
  `docs/spec/acceptance.md:26` (AC22) forbids it: *"No .skip/.todo/.only,
  coverage-ignore pragmas, lowered threshold, hidden unreachable-code exclusion or
  silent retry masks incomplete work."* (Note for anyone cross-reading the audit: A5
  Part 5 cites this sentence as "AC26"; the sentence is real and it is **AC22**. AC26 is
  the static-build criterion.)

Gates that are red for reasons this task does not fix, so the executor does not chase
them: `npm run lint` (**FIX-01**, which must have landed) and `npx playwright test`
(**FIX-09**). `npm run test` is this task's own subject, not a gate deferred elsewhere;
its remaining failures are recorded per the procedure above, and its coverage thresholds
are **FIX-08**'s to turn on. Do not run `npm run api:drift` or `npx playwright test` while
working on this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-04-AC01** `npm run test 2>&1 | grep -c "document is not defined"` prints `0`,
      and the run reports 14 collected spec files, every one of them under `src/`.
- [ ] **FIX-04-AC02** Every test in the run reports a real pass or a real fail. The
      "skipped" count in the summary line is `0`, and no `.skip`, `.todo` or `.only` was
      added by this commit — check with `git diff --staged | grep -cE "\.(skip|todo|only)\("`,
      which must print `0`.
- [ ] **FIX-04-AC03** `wc -l vitest.config.ts` prints a number under `30`, and
      `grep -cE "transpileModule|propDecorators|raw-html|raw-scss" vitest.config.ts`
      prints `0`. `environment` is deliberately not in this alternation: the mandated
      replacement text's own comments use the word twice (describing what the builder
      supplies and what not to add back), and the other four tokens already prove the
      deleted plugins are gone.
- [ ] **FIX-04-AC04** `npm run test` writes `coverage/unit/coverage-final.json`;
      `ls coverage/unit/coverage-final.json` succeeds.
- [ ] **FIX-04-AC05** `grep -rn "platform-browser-dynamic" src/` and
      `grep -rn "reflect-metadata" src/` both print nothing, and
      `grep -rln "initTestEnvironment" src/` prints nothing.
- [ ] **FIX-04-AC06** `package.json` has no `test:unit:coverage` script and no
      `test:unit` script. `"test": "ng test"` is unchanged.
- [ ] **FIX-04-AC07** `npm run build` exits `0`.
- [ ] **FIX-04-AC08** The commit body carries three things: the full `npm run test`
      summary line; the list of every remaining failure with its owning FIX number; and
      the sentence *"The `tests/` tree has no runner from this commit until FIX-06
      lands."*
- [ ] **FIX-04-AC09** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** The change edits a test-runner configuration, two
      spec files' bootstrap and one npm script; no file that ships to the browser is
      touched (`git diff --staged --name-only` lists no file under `src/app/**` other
      than the two `*.spec.ts` files, which the production build excludes via
      `tsconfig.app.json:11-13`). This is the exemption
      `.claude/rules/browser-verification.md` grants to a build or configuration change,
      stated explicitly rather than left out silently.
- [ ] **FIX-04-AC10** The `mi-bolt-design` R01–R26 record is in the commit body. R01
      through R25 are marked **N/A — this task changes the test runner's configuration
      and two specs' bootstrap, and renders nothing a person can see**; that one sentence
      covers all of them and is written out per task rather than omitted. **R26 is
      applicable and met**: the commit body names every file changed, every command run
      with its exit code, the deliberate deviation (the `tests/` tree left without a
      runner) and the remaining limitation (the assertion failures handed to FIX-06,
      FIX-07 and FIX-08). Skill provenance is stated once in `docs/fix/README.md`
      section 3, "Every task records the design rules": the installed path, the version,
      and the fact that `docs/mi-bolt/execution/skill-location.json` does not exist yet
      (**FIX-38** owns it). Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with FIX-06 even though the two are
tightly coupled, and do not bundle it with FIX-02, which depends on it. Commit only after
every acceptance criterion above passes.

Suggested subject line, in the repository's `type: summary` style:

```text
fix: run ng test on the official builder, delete the vitest plugin
```

The push and the pull request are not the executor's; they belong to the orchestrating
session.

## Where this sits in the stream

**Nothing in this stream has to land before FIX-04**, and it can be done in parallel with
FIX-01. It is the second foundation of the package, beside FIX-01.

What depends on it, inside this stream of nine:

- **FIX-02** — it migrates `@ViewChild` to `viewChild()`, and that migration's own
  justification in the source comment is the JIT transformer this task deletes.
- **FIX-06** — it moves the `tests/**` specs into `src/`, which is the only place the
  builder's discovery can reach; it also restores the runner this task removes from that
  tree.
- **FIX-07** — it rewrites the source-text specs as real TestBed tests, which is only
  possible once TestBed works.
- **FIX-08** — it turns coverage thresholds on, which is meaningless until a suite
  produces a coverage report worth gating.
