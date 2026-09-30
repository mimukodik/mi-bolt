---
name: mibolt-verification
description: "Choosing and running MiBolt checks: which local checks and CI jobs a changed path triggers, commands and prerequisites, focused test runs, what each check writes or starts, coverage floors, when a browser pass is due. Load it before committing, answering how to test something, or diagnosing a failing test run, coverage floor or CI job. Not for Playwright specs."
---

# MiBolt verification

Find out which checks a change needs, run them, and read each one's exit
status. Invoke every command from the repository root, with two exceptions.
An `npx` command such as `npx eslint` or `npx prettier --check` runs from
`frontend/` (`mibolt-workspace-ops`, "Where commands run") and so takes its
file arguments relative to `frontend/`: `projects/storefront/src/main.ts`, not
`frontend/projects/storefront/src/main.ts`. The changed-paths script in step 1
prints them in that form. A path that starts with `scripts/` or `references/`,
and `SKILL.md`, is relative to this skill's directory, and one that starts with
a MiBolt skill name is relative to the directory that holds the MiBolt skills.
A command that names such a path is the other exception: it runs, as written,
from the directory that path is relative to, since from the repository root
the path finds nothing or, for `scripts/`, the repository's own top-level
directory of that name. Every other path is repository-relative, except
directories that exist only after an install or a run (`node_modules/`,
`coverage/`, `dist/`, Gradle's `build/`), which are named relative to the area
directory that holds them.

## Scope and hand-offs

This skill covers which CI jobs a set of changed paths triggers and which local
commands mirror them; every check command with where it runs, what it needs and
what it writes or starts; focused runs of one spec or one test class; the
coverage floors and the checks nothing runs automatically; and reproducing a
failed CI job locally.

Everything else goes elsewhere:

- An end-to-end spec to write, repair or plan, or a red `e2e*` run: outside
  this skill. The suite is configured in `frontend/playwright.config.ts`, its
  conventions are in `frontend/e2e/seed.spec.ts`, its fixtures are under
  `frontend/e2e/fixtures/`, and its test plans are under `frontend/specs/`.
- A workflow, path filter or `mise` task to change, or a check to wire in:
  `mibolt-workspace-ops`.
- What an ESLint, Prettier, tsconfig or PMD rule demands and how to satisfy
  it: `mibolt-frontend-code-standards` or `mibolt-backend-code-standards`.
- How tests are written inside an area: `mibolt-shop-frontend`,
  `mibolt-admin-frontend` or `mibolt-commerce-backend`.
- Regenerating the API clients or the catalogue fixture as a step of a change:
  `mibolt-cross-package-changes`. Here `api:drift` is only a check.

## The checks

### Frontend (`frontend/`)

- **Unit suite.** Vitest through the `@angular/build:unit-test` builder, for
  the five projects with a `test` target: storefront, demo-payment, admin,
  core-api and shop-mocks (`frontend/angular.json:110-127`,
  `frontend/angular.json:209-225`, `frontend/angular.json:359-383`,
  `frontend/angular.json:411-428`, `frontend/angular.json:471-490`). The
  generated `shop-api` library has none. Every target sets `coverage: true`
  and the same aggregate floor: statements 80, branches 75, functions 80,
  lines 80, `perFile: false`. Each project writes its own report inside
  `frontend/`: `coverage/unit/` for the storefront
  (`frontend/projects/storefront/vitest.config.ts:6`), `coverage/<project>/`
  for the other four. Each target's `coverageInclude` names every `.ts` file
  under the project's `src/`, and its `coverageExclude` takes some back out
  (`frontend/angular.json:116-117` for the storefront); no project's
  `vitest.config.ts` sets either. The builder hands both to Vitest's
  `coverage.include` and `coverage.exclude`
  (`src/builders/unit-test/runners/vitest/plugins.js` of `@angular/build`),
  and Vitest then reports every file they select, loaded by a test or not
  (https://v4.vitest.dev/guide/coverage). So a source file no test loads,
  such as a new file with no spec that no tested file imports, lowers its
  project's aggregate.
- **Contract suite.** `test:contract` runs Vitest in Node over
  `tests/**/*.spec.ts` (`frontend/vitest.contract.config.ts:16-22`) and
  collects no coverage. `ng test` discovers no spec under `frontend/tests/`
  (`frontend/vitest.contract.config.ts:8-9`), so a spec there runs under this
  suite alone. Two helpers there run under `ng test` as well:
  `frontend/tests/setup-msw.ts` is a setup file of the storefront and
  shop-mocks targets (`frontend/angular.json:114`, `frontend/angular.json:477`),
  and `frontend/tests/msw-server.ts` is imported by storefront, demo-payment
  and shop-mocks specs (for one,
  `frontend/projects/storefront/src/app/features/cart/cart.facade.spec.ts:21`),
  so a change to either needs the unit suite too.
- **Lint and format.** `lint` is `ng lint`, which runs each project's
  `lintFilePatterns`; the storefront's also take in `tests/**/*.ts`,
  `e2e/**/*.ts` and `playwright.config.ts` (`frontend/angular.json:132-138`).
  `format:check` is `prettier --check .`. Both check every file their
  configuration reaches in `frontend/`, not only the changed ones, and are
  what CI's `lint` job runs (`.github/workflows/frontend.yml:34`,
  `.github/workflows/frontend.yml:37`), as `npm --prefix frontend run lint`
  and `npm --prefix frontend run format:check` locally. Before a commit the
  gate ("Gates before a commit" below) checks only the changed files, with
  `npx eslint` and `npx prettier --check` run from `frontend/` on the lists
  step 1 prints.
- **Builds.** `build` builds the storefront alone (`frontend/package.json:12`);
  `build:payment` and `build:admin` build the other two apps. `build:check`
  builds the storefront for production and exits 1 on any output line
  matching `WARNING`, `▲ [WARNING]` or an `NGnnnn` code
  (`frontend/scripts/build-check.mjs:28`, `frontend/scripts/build-check.mjs:41`).
- **Dist and boot checks.** The three `check:*-dist` scripts fail when a
  production `dist` holds `setupWorker` or `mockServiceWorker`, which proves no
  MSW code ships. `check:payment-boot` and `check:admin-boot` serve the app with
  `ng serve` on port 4299 and assert that the MSW worker is served at the app's
  base path (`frontend/scripts/check-app-boot.mjs:49`).
- **API client drift.** `api:drift` regenerates both generated clients, then
  fails on any difference or untracked file in their directories
  (`frontend/package.json:32`).
- **End-to-end.** Playwright, with its own floor in
  `frontend/e2e/coverage-thresholds.json` (statements 80, branches 68,
  functions 80, lines 80), armed only when `E2E_COVERAGE_GATE=1`
  (`frontend/playwright.config.ts:90-94`). Its specs are outside this skill
  (see "Scope and hand-offs").

### Backend (`backend/`)

One Gradle project, `:services:commerce`. `backend/README.md` ("Tests and
quality gates") says why each gate exists.

- `test` excludes the JUnit tag `integration`, and `integrationTest` runs only
  that tag (`backend/services/commerce/build.gradle:141-158`). A class
  annotated `@IntegrationTest` carries the tag
  (`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/IntegrationTest.java:25`).
  The integration tests run on H2 in PostgreSQL mode
  (`backend/services/commerce/src/test/resources/application-test.properties:4`)
  and the unit tests start no Spring context, so no test needs the database.
- `check` depends on `integrationTest` and `jacocoTestCoverageVerification`
  (`backend/services/commerce/build.gradle:160-162`,
  `backend/services/commerce/build.gradle:216-218`); the verification joins
  `check` only because it is wired there
  (https://docs.gradle.org/9.7.1/userguide/jacoco_plugin.html). The PMD
  plugin makes `check` depend on `pmdMain` and `pmdTest`
  (https://docs.gradle.org/9.7.1/userguide/pmd_plugin.html), and `build`
  depends on `check` (https://docs.gradle.org/9.7.1/userguide/java_plugin.html).
  So `build` runs the unit and integration tests, PMD and the coverage gate,
  then assembles the jar.
- The coverage floor is a JaCoCo line ratio of 0.90 over the bundle and 0.80
  per class, with the generated `com/example/mi_bolt_backend/api/**` package
  and `MiBoltBackendApplication` excluded
  (`backend/services/commerce/build.gradle:167-170`,
  `backend/services/commerce/build.gradle:186-205`).
- PMD 7.24.0 runs `backend/config/pmd/ruleset.xml`; a missing ruleset fails
  the task instead of passing silently
  (`backend/services/commerce/build.gradle:220-238`).
- `backend/services/commerce/scripts/smoke.sh` is a curl pass against a
  running backend, not a Gradle test.

### Not wired to anything

These exist and work by hand; nothing runs them automatically.

- `fixtures:catalog:check` (`frontend/package.json:34`) exits 1 when
  `frontend/docs/api/fixtures/catalog.json` no longer matches
  `data/catalog/catalog.json`. No workflow and no `mise` task runs it, while
  `frontend/README.md:63` and `frontend/scripts/build-catalog-fixture.mjs:13-16`
  describe it as what CI runs. It is manual-only.
- `frontend/scripts/check-budgets.mjs` checks gzip budgets of 300 KiB initial
  JS, 1 MiB total and 150 KiB per lazy chunk
  (`frontend/scripts/check-budgets.mjs:6-14`) against a production storefront
  build. No npm script, workflow or `mise` task runs it. The budgets every
  production build does enforce are the different ones in
  `frontend/angular.json:37-48` (initial: 500kB warning, 1MB error). It is
  manual-only.

## Where to start

Start from the changed-paths script in step 1 below; it reads
`.github/components.yml`, `.github/workflows/ci.yml` and the triggered
workflows live. `mise tasks --all` lists every root and area task, and
`frontend/README.md` ("npm scripts") describes every frontend script. The
canonical examples are the gate list under "Gates before a commit" below,
`frontend/mise.toml:8-21` (exactly what `//frontend:test` and
`//frontend:build` run), and `backend/services/commerce/build.gradle:141-245`
(every backend gate).

## From a diff to green checks

1. **List the changed paths and the CI jobs they trigger.**

   ```bash
   uv run --no-project --python 3.12 --with PyYAML==6.0.2 python scripts/checks-for-changed-paths.py
   ```

   As written it runs from this skill's directory. The script finds the
   repository root through git, so it runs from any other directory inside
   the checkout too, once its path is given as seen from there.
   Without `--paths` the changed paths are the union of
   `git diff --name-only <base>...HEAD`, `git diff --name-only HEAD` and the
   untracked files, where `--base` defaults to `origin/main`; that ref is only
   as current as the last fetch, and the output says so. `--paths <p> ...`
   checks a hypothetical change instead, each path written as git prints it.

   Per triggered component it prints the workflow, each job with its working
   directory and `needs`, each `run:` line, and the body of every `npm run`
   script those lines call; `[CI-only expression]` marks a line that fails
   when pasted into a local shell. The changed files under `frontend/` come
   last, re-rooted to `frontend/` and split by the `npx` gate command that
   takes them, with the files neither command takes listed apart, because
   `npx prettier --check` exits 2 on a file it has no parser for. Its options,
   exit codes, `--json` fields and an excerpt of a real run are in
   `references/commands.md` ("The changed-paths script").

   It shows only what `.github/workflows/ci.yml` selects: not Candidate Build,
   which runs on every pull request, and not the checks under "Not wired to
   anything". The CI mirror reference covers both.

2. **Pick the local checks.** Look the changed paths up in
   [references/command-matrix.md](references/command-matrix.md). The floor is
   the gate list under "Gates before a commit" below; in a terminal its unit
   run takes `-- --no-watch`, as step 4 says.
   Its frontend build is `build`, which builds the storefront alone, so an
   admin or demo-payment change also needs that app's build, dist check and
   boot check, which CI's `build` job runs. What each command needs and what
   it writes or starts is in
   [references/commands.md](references/commands.md).

3. **Iterate with focused runs.** They are faster, and the frontend ones write
   no coverage report.
   - One frontend spec, a directory of specs, or a glob:

     ```bash
     npm --prefix frontend run test -- storefront --include projects/storefront/src/app/features/cart/cart.facade.spec.ts --no-coverage --no-watch
     ```

     The project name comes first (`ng test [project]`). Give `--include`
     the spec's path as seen from `frontend/`, its directory, or a quoted
     `'**/<name>.spec.ts'` glob, and add `--list-tests` to the first run: it
     prints the files the pattern selects without building or running
     anything, and exits 0 even when it prints none, so read the list rather
     than the exit status. angular.dev calls `include` relative to the
     project root (https://angular.dev/cli/test), but the installed builder
     (22.1.8) resolves it against the project's source root after stripping a
     leading `projects/<name>/src/`, so the project-root-relative form
     (`src/app/…`) selects nothing. A directory takes every spec inside it. A
     source file `<name>.ts` takes the `<name>.spec.ts` or `<name>.test.ts`
     beside it; where neither exists, the builder takes the source file
     itself as the test file (`resolveStaticPattern` in
     `src/builders/unit-test/test-discovery.js` of `@angular/build`). So
     point at the spec or its directory when the names differ, as they do for
     `checkout.facade.ts` and `checkout-facade.spec.ts`. `--filter <regex>`
     narrows by suite and test name (`npx ng test --help`, from `frontend/`).
     Pass `--no-coverage` because the target turns coverage on for the whole
     project: one spec's run would be measured against the project-wide floor
     and would overwrite that project's report. Pass `--no-watch` because
     watch mode is the default in a terminal (https://angular.dev/cli/test).
     `--no-<option>` sets a boolean to false, so
     `--coverage=false --watch=false` does the same
     (https://angular.dev/tools/cli#boolean-options).
   - One contract spec: `npm --prefix frontend run test:contract -- sdk-split`
     runs only the files whose path contains `sdk-split`
     (https://v4.vitest.dev/guide/filtering).
   - One backend class:
     `backend/gradlew -p backend :services:commerce:test --tests CartServiceTest`.
     A class annotated `@IntegrationTest` runs only under `integrationTest`:
     `backend/gradlew -p backend :services:commerce:integrationTest --tests CartApiTest`
     (https://docs.gradle.org/9.7.1/userguide/java_testing.html). A focused
     Gradle run does not check the coverage floor; only `check` does.

4. **Run the gates before the commit.** Run each command under "Gates before
   a commit" as a command of its own and read its exit status. By hand in a
   terminal, run the unit suite as
   `npm --prefix frontend run test -- --no-watch` or through
   `mise run //frontend:test`, which passes `--watch=false`
   (`frontend/mise.toml:9`).

5. **A check is red.** Settle whether the failure is this branch's before
   fixing or dismissing it ("Pre-existing failures"), and give a bug fix a
   test seen failing first ("Tests and coverage").

6. **User-visible change.** Run the browser pass before calling it done
   ("Browser pass").

7. **A CI job failed.** Read [references/ci-mirror.md](references/ci-mirror.md)
   for the local command that reproduces it.

## Rules that apply here

How Vitest, Playwright and the other tools that
`mibolt-frontend-code-standards` ("Framework questions") names behave is read
from their documentation, with the URL beside the claim, and not found out by
a throwaway experiment. The backend's build tools are read the same way:
Gradle and its JaCoCo and PMD plugins at
https://docs.gradle.org/9.7.1/userguide/, the release the Gradle wrapper pins;
PMD at https://docs.pmd-code.org/pmd-doc-7.24.0/, the release the build pins;
and JaCoCo at https://www.jacoco.org/jacoco/trunk/doc/, which documents
JaCoCo's development build rather than the version Gradle applies here. An
experiment answers one narrow question at the cost of a build and leaves a
belief with no source behind it; running this repository's own checks, a
Gradle task among them, and reading its build files is measurement, not an
experiment.

### Browser pass

A change a person can see or click is not done, working or fixed until it has
been exercised in a real browser: components and pages, routes and
navigation, backend code whose result a screen shows, sign-in and session
gating, and styling. A green typecheck, a green test run and a read of the
diff are necessary and never enough, because the unit suite runs in jsdom
rather than in a browser (https://angular.dev/cli/test, option `browsers`).

1. Serve the app the change reaches: `mise run storefront` (port 4200),
   `mise run admin` (4220) or `mise run payment` (4210). Each is `ng serve`
   with the MSW mock running in the browser, so no backend has to be up. A
   flow that crosses from the storefront into the payment page needs the
   payment app as well, because the storefront's dev server proxies
   `/demo-fizetes` to 4210 (`frontend/proxy.conf.json`); `mise run frontend`
   serves all three apps. When the result comes from the backend, use
   `mise run dev` instead: the three apps on their `local-backend`
   configuration, against the backend on 8080 and PostgreSQL in its container.
   That container needs a Docker daemon. Where `docker info` reaches none, as
   in a Pixi sandbox, which has the Docker CLI but no daemon and no PostgreSQL
   server, `mise run dev` cannot start: exercise the change on the mock
   there, and make the backend-backed pass on the pull request's preview
   (`deploy/candidate/README.md:108-118`; the `bolt-preview` label enables
   it).
2. Open the affected screen and drive the changed flow as a user would:
   click, type, submit. Looking at the page is not a pass.
3. Capture the page structure and a screenshot, before and after the
   interaction when the change alters state.
4. Read the browser console and the network log: zero console errors, and no
   failed call behind the change.
5. Exercise the states the change creates, the negative ones included:
   signed out, an empty list, the error path.
6. Keep a screenshot of any failure.
7. Stop every server the pass started.

**What does not count**, for any change: a file's existence or size on disk,
or reading the diff back; a green typecheck, unit or Vitest run; an HTTP 200
from `curl` or any other request made outside the browser; a grep of a
stylesheet for a `frontend/docs/design/yettel.md` token or recipe value; a
statement that the change should work, unless the structure capture and
screenshot of step 3 and the console reading of step 4 all stand behind it.

**A change is exempt only when it cannot reach a browser at all**, such as a
build script, a CI setting or a document with no rendered output.

### One memory limit

Where everything a session starts runs under one memory limit, as in a Pixi
sandbox (`cat /sys/fs/cgroup/memory.max`), reaching it kills every process
there, the agent included, and the turn in flight is lost. Four such kills
at 8 GiB on 2026-09-30 (BER-739) had no leak behind them, only too much
running at once. From the kernel's reports of them: one `ng serve` held 0.4
to 1.3 GiB, `ng lint` 1.2 to 1.5 GiB, one `ng test` run 0.3 to 0.6 GiB itself
and 1.2 to 1.5 GiB with the three worker processes beside it, a JVM up to
0.9 GiB with three to six of them alive, and one browser about 0.5 GiB
across its processes, with two open in three of the four. Under such a
limit:

- Serve only the apps the pass needs, and never start a second instance of a
  server or a browser that is already up.
- Stop every server and close the browser before a gate or
  `mise run verify`.
- Run the gates one after another, and `mise run verify` as
  `MISE_JOBS=1 mise run verify`: mise otherwise runs up to eight of its
  eleven checks at once (`references/commands.md`, "What a check writes or
  starts").

### Tests and coverage

- **Every bug gets a test in the same commit as its fix**, seen failing before
  the fix because of the bug, and passing after it. A test never seen
  failing is evidence of nothing. When a fix changes a branch condition, every
  arm of that condition gets a case.
- **Covered means executed and asserted on.** A line a test runs through on
  its way somewhere else is not covered, and neither is one whose only
  assertion is a snapshot.
- **Coverage is an aggregate floor, not a per-line gate.** Every frontend
  project with a `test` target sets one in its `coverageThresholds` in
  `frontend/angular.json`, measured over the whole project (`perFile: false`)
  and enforced by `npm --prefix frontend run test` locally and in CI; the
  generated `shop-api` library has no `test` target and so no floor. The
  backend floor is the JaCoCo verification in
  `backend/services/commerce/build.gradle`, which `build` runs. A floor fails
  a run only once the project's coverage falls below it; the numbers of every
  floor are under "Frontend (`frontend/`)" and "Backend (`backend/`)" above.
  MiBolt is a demo MVP that will never go live, so coverage is held to a floor
  rather than to every changed line, and the browser pass is what catches a
  defect the unit suite cannot see.
- **Only a layer a unit test cannot reach is excluded from coverage**, and
  only in the coverage configuration, never by an ignore comment in the
  source: shell scripts, compose files, docs, generated code, and the spec
  files themselves. That configuration is the `coverageInclude` and
  `coverageExclude` of each `test` target in `frontend/angular.json` and
  `coverageExclusions` in `backend/services/commerce/build.gradle`, where it
  can be read and argued with. For an excluded layer the evidence is a
  command that was run and its verbatim output.
- **A failing suite inside the diff is fixed, never skipped.**

### Gates before a commit

Before every commit, run each of these and read its exit code:

- `npm --prefix frontend run test`; in a terminal, add `-- --no-watch`
  (step 4).
- `npm --prefix frontend run build`.
- From `frontend/`, `npx eslint <files>` and `npx prettier --check <files>`
  on the changed files, as step 1 lists them for each.
- For a change under `backend/`,
  `backend/gradlew -p backend :services:commerce:build`, which runs the unit
  and integration tests, PMD and the coverage verification.

`build` builds the storefront alone, so step 2 adds the other apps' builds
and checks when they changed.

**A gate can also run through `scripts/summarize-gate-output.mjs`**, which
prints the command, one line per error or warning, a count line per project
or task, and last the gate's exit code with the path of a log holding the
whole output. It runs the gate in the checkout it is started in, so it runs
from the repository root; from this skill's directory it exits 2. Replace the
placeholder with the path, absolute or from the root, of the directory that
holds the MiBolt skills, the parent of this skill's own directory:

```text
node <directory that holds the MiBolt skills>/mibolt-verification/scripts/summarize-gate-output.mjs frontend-test
node <directory that holds the MiBolt skills>/mibolt-verification/scripts/summarize-gate-output.mjs frontend-lint <files relative to frontend/>
node <directory that holds the MiBolt skills>/mibolt-verification/scripts/summarize-gate-output.mjs frontend-build
node <directory that holds the MiBolt skills>/mibolt-verification/scripts/summarize-gate-output.mjs backend-build
```

The commands in the list stay the gates, and either form of one may be run,
since each subcommand runs its gate with only the output format changed and
exits with the gate's own exit code. What each subcommand runs and takes, its
output, its exit codes and the Prettier check it leaves out are in
`references/commands.md` ("The gate-output summarizer").

### Pre-existing failures

A red test or lint result is pre-existing only when
`git diff --name-status <base>...HEAD` does not list the failing file.
`<base>` is the branch the work was cut from, `origin/main` for work cut from
`main`, and the three dots start the comparison at the merge base
(https://git-scm.com/docs/git-diff). Who added a file does not matter: a file
added to the branch minutes ago is on the branch, so its failures are the
branch's. That diff reads committed history while the gates run before the
commit, so a file `git status --short` shows as modified or untracked is the
change's own, whatever the branch diff says.

## What a check writes or starts

`references/commands.md` ("What a check writes or starts") lists what each
check overwrites, binds or leaves behind; read it before running two checks
in one checkout, and when a report or `git status` looks like another run's.

## Detailed material

- [references/command-matrix.md](references/command-matrix.md): read when
  choosing the checks for a concrete diff. It maps each kind of changed path
  to the local commands and to the CI components it triggers.
- [references/commands.md](references/commands.md): read before running a
  command you have not run in this checkout. It gives each command with where
  it is defined, what it needs and its side-effect class: read-only, writes
  local artefacts, rewrites tracked files, starts processes or ports, or needs
  a missing tool.
- [references/ci-mirror.md](references/ci-mirror.md): read when a CI job has
  failed, or when a local run has to reproduce one. It maps each job to its
  local mirror, says how closely it mirrors it, and names what CI keeps when
  the job fails.
- In the repository: `frontend/README.md` ("npm scripts"),
  `frontend/README.md` ("Tests") and `frontend/README.md` ("CI");
  `backend/README.md` ("Tests and quality gates"); and the decisions behind
  the backend gates:
  `backend/docs/decisions/0003-h2-postgresql-mode-for-tests.md`,
  `backend/docs/decisions/0004-contract-validator-jacoco-gate-context-path-and-json-inclusion.md`,
  `backend/docs/decisions/0009-pmd-quickstart-lint-gate.md`,
  `backend/docs/decisions/0013-postgres-smoke-job-in-ci.md`.

## Keep this skill current

Edit this skill in the same change as any change that alters a command, a
side-effect class, a floor, a port, or a line this skill or its references
cite by `path:line`. The files most often behind one are: the scripts block of
`frontend/package.json` or `tools/package.json`; any of the five `mise.toml`
files; the `test` targets of `frontend/angular.json`, a project's
`vitest.config.ts` or `frontend/vitest.contract.config.ts`;
`frontend/playwright.config.ts` and `frontend/e2e/coverage-thresholds.json`; `frontend/eslint.config.mjs` and
`frontend/README.md`; the test, JaCoCo and PMD blocks of
`backend/services/commerce/build.gradle`, the Gradle version in
`backend/gradle/wrapper/gradle-wrapper.properties`,
`backend/services/commerce/src/test/java/com/example/mi_bolt_backend/test/IntegrationTest.java`,
`backend/services/commerce/src/test/resources/application-test.properties`
and `backend/services/commerce/scripts/smoke.sh`; `.github/workflows/*.yml` or
`.github/components.yml`; the headers of the scripts in `frontend/scripts/`
cited in this skill, with the logs in `frontend/scripts/fixtures/`; and the
test file cited for side effects, `tools/dev-server/dev-server.test.ts`. A
workflow or `mise` task that starts running `fixtures:catalog:check` or
`check-budgets.mjs` ends their "Not wired to anything" entry.

A line added or removed above a cited line alters that citation too, because
it moves the anchor, and the checker below fails a moved anchor only once it
falls past the end of its file. So after an edit to any file this skill or its
references cite by `path:line`, whether or not the list above names it, run
the checker below with `--show-anchors` and read each line it prints against
the claim beside it; a range longer than ten lines ends in
`... (+N more lines)`, so read its rest in the file. Whether a file you edited
is cited by line is one search, run from this skill's directory:

```bash
grep -rn '<path>:[0-9]' SKILL.md references
```

The changed-paths script reads the CI files live and needs no edit when a
component or job changes, unless `.github/components.yml` gains a pattern
beyond `**`, `*`, `?` and literals: it then exits 2 with
`unsupported pattern <p> in .github/components.yml` and has to be extended.

After an upgrade of Vitest, `@angular/build`, `@angular-eslint/builder`, ESLint
or Gradle, or an edit to a file the gate-output summarizer reads, re-check it
as `references/commands.md` ("Keeping the summarizer current") says.

An edit to a file this skill cites a section of by name (today
`frontend/README.md`, `backend/README.md`, the skills
`mibolt-frontend-code-standards` and `mibolt-workspace-ops`, and this skill's
own `SKILL.md`, which its references cite) means re-running the checker below
and rereading each section cited in that file, since check (e) confirms only
that a quoted name still occurs somewhere in its target
(`mibolt-project-map/references/citation-check.md`).

Check every path, anchor and command cited here, from the directory that
holds the MiBolt skills, with:

```bash
node mibolt-project-map/scripts/check-skill-references.mjs mibolt-verification
```

Add `--show-anchors` to print the current text of each cited line, up to ten
per range; whether that text still says what this skill claims is for you to
judge, since the script cannot.
