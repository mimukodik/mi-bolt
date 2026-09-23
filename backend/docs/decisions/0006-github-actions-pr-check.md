# 0006 — GitHub Actions PR check

## Situation

The backend needs an automated check on every pull request to `main` that
builds and runs every test in a few minutes. There is no deployment target
for this check: it exists to gate merges, not to ship anything. The
repository also carries a root `package.json`/pnpm setup for the coding
agents' own tooling; that tooling is not part of the product and must not
run in CI. This record is numbered 0006 because 0002–0005 are reserved by
the T2 and T3 records in flight on parallel branches.

## Options

1. **`actions/setup-java` with `cache: gradle` and a build step.** Use the
   built-in dependency cache of `actions/setup-java`, then run
   `./gradlew build` directly.
2. **`gradle/actions/setup-gradle` for caching plus a separate `./gradlew
   build` step.** This is the pattern the Gradle team documents for
   `setup-gradle` v6: it owns the Gradle User Home cache, validates the
   wrapper JAR against Gradle's checksum list by default
   (`validate-wrappers` defaults to `true`), and defaults to a read-only
   cache on non-default branches (its `cache-read-only` default expression
   compares `github.ref_name` with the default branch). The old `arguments`
   input on this action is deprecated and removed, so the build itself runs
   as its own step.
3. **A matrix over several JDKs or OSes.** Run the build across more than
   one Java version and/or operating system.

Option 3 is rejected: the project pins a single toolchain, Java 21, in
`build.gradle`, so a matrix would multiply CI runtime without adding any
coverage the single toolchain does not already have. Option 1 is rejected in
favour of option 2 because the Gradle team's own documentation points to
`setup-gradle` for Gradle User Home caching, wrapper validation, and the
read-only-cache-on-non-default-branch behaviour, none of which
`actions/setup-java`'s `cache: gradle` provides.

## Decision

One job, `build`, on `ubuntu-24.04` — pinned rather than `ubuntu-latest`,
because GitHub announced on 2026-09-17 that the `ubuntu-latest` label
migrates from Ubuntu 24.04 to Ubuntu 26.04 between 2026-10-19 and
2026-11-19, and pinning keeps this job on a known image until that move is
deliberately picked up. Superseded by Revision 2 below: three jobs and a
push trigger on `main`. The steps are `actions/checkout@v7`,
`actions/setup-java@v6` with the Temurin distribution and Java 21,
`gradle/actions/setup-gradle@v6`, then `./gradlew build` as its own step.
The checkout step sets `persist-credentials: false`, so the job token is not
left in `.git/config` while `./gradlew build` executes build logic taken
from the pull request head. Test and JaCoCo reports are uploaded with
`actions/upload-artifact@v7`, but only `if: failure()`, so a green run
carries no report artifact.

The trigger is `pull_request` targeting `main` only; there is no push
trigger and no deploy step. Superseded by Revision 2 below: three jobs, a
push trigger on `main`, and the conditional `cancel-in-progress` described
in the "Concurrency on `main`" paragraph there. `permissions` is set to
`contents: read`, the minimum the checkout needs. A `concurrency` group
keyed on `${{ github.workflow }}-${{ github.ref }}` with
`cancel-in-progress: true` meant a new push to the same PR cancelled the
run still in flight for the previous push, rather than letting both finish;
see "Concurrency on `main`" under Revision 2 for how that changed.
`timeout-minutes: 15` was
proposed by the orchestrator and confirmed by the task owner on 2026-09-19,
well under GitHub's own default of 360 minutes for a job with no
`timeout-minutes` set;
the 3–5 minute target run time comes from the task owner and is something to
measure on the first real runs, not a number this file enforces.

## Consequences

- No Node or pnpm job exists in this workflow, and none should be added: the
  pnpm tooling under the repository root is for the coding agents, not for
  the product, and the yettel.hu import script that T3 adds under
  `scripts/catalog-import/` is a helper and is never run in CI.
- With `pull_request` as the original only trigger no run ever executed on
  `main`, and a `pull_request` run has `github.ref_name` set to
  `<n>/merge`, so `setup-gradle` runs read-only and nothing ever wrote the
  Gradle User Home cache: every PR run was cold. Measured on the first run
  (35457552977): the build step took 80 s wall clock, about 45 s of it
  before the first Gradle task (daemon start, plugin and dependency
  resolution), most of which a warm cache would remove, against a 3–5
  minute target, so nothing was bought back at the time. The action's
  default `cache-provider: enhanced` loads Gradle's proprietary
  `gradle-actions-caching` component on every run and performs the restore
  lookup; only the save was skipped on a `pull_request` run.
  Gradle's DISTRIBUTION.md lists enhanced caching for private repositories
  as a free preview with usage-based pricing planned. Revision 2 below adds
  a `push` trigger on `main`, so a push run now has `github.ref_name` set
  to `main` and writes the Gradle User Home cache that PR runs restore
  read-only; `cache-provider: basic` (or `cache-disabled: true`) remains
  the opt-out from enhanced caching if that pricing becomes a concern.
- Pinning `runs-on` to `ubuntu-24.04` is a dependency on that image staying
  available; when GitHub retires it this line has to be revisited, most
  likely by moving to whatever image `ubuntu-latest` has migrated to by
  then.
- `./gradlew build` ran OpenAPI generation, compilation and every test in one
  invocation in the single-job design above. The JaCoCo gate (LINE ≥ 0.90) is
  configured in `build.gradle` since T2. Revision 2 below moves test
  execution into its own two jobs, so the `coverage-gate` job now runs
  `./gradlew build jacocoTestReport -x test -x integrationTest`: the `-x`
  flags skip the two `Test` tasks (their coverage data already came in as
  artifacts from the other two jobs), and `jacocoTestReport` is named
  explicitly because it would otherwise only run as a finalizer of `test` or
  `integrationTest`, neither of which runs here, so without it the merged
  HTML report in `build/reports/jacoco/` would not exist for the `if:
  failure()` upload step to find. The `build/reports/jacoco/` artifact path
  is already listed for that; a missing path does not fail
  `actions/upload-artifact@v7` (`if-no-files-found` defaults to `warn` and is
  evaluated over the whole path set).

## Date and status

2026-09-19 — Valid (revision 2).

## Revision 2 (2026-09-19)

The issue owner decided to split the single `build` job into two parallel
test jobs plus a third job that merges their coverage data and runs the
coverage gate and jar build, and to add a `push` trigger on `main` so the
default-branch run writes the Gradle cache that PR runs restore. This
relaxes the "pull requests only" rule in the original Decision above:
the added trigger is build-only, with no deploy step, so it does not change
the "no deployment target for this check" situation this record opens with.

**The split.** `IntegrationTest.java`'s `@IntegrationTest` meta-annotation
now also carries JUnit 5's `@Tag("integration")`, so every class annotated
`@IntegrationTest` (the classes with a Spring context) inherits the tag; no
other test class uses `@SpringBootTest` directly. `build.gradle`'s `test`
task now excludes that tag (`useJUnitPlatform { excludeTags 'integration' }`)
and a new `integrationTest` task (`Test` type, reusing the test source set
and classpath) includes it. `check` depends on both `test` and
`integrationTest`. `jacocoTestReport` and `jacocoTestCoverageVerification`
are ordered after `test` and `integrationTest` with `mustRunAfter` rather
than `dependsOn` (they only `dependsOn classes`, the compiled-output task
they actually read), so neither Test task drags the other one in through
the `finalizedBy jacocoTestReport` on each, and `test` or `integrationTest`
each stays independently runnable. The `unit-tests` job runs `./gradlew
test` and the `integration-tests` job runs `./gradlew integrationTest`,
each in parallel, each uploading its JaCoCo exec file
(`build/jacoco/test.exec` / `build/jacoco/integrationTest.exec`, JaCoCo's
default per-`Test`-task exec file layout) as an artifact.

**Why the gate is a third job.** `jacocoTestReport` and
`jacocoTestCoverageVerification` need to see both exec files to report and
gate on the true combined coverage, not just one job's share of it; a job
that only ran `test` or only `integrationTest` would gate on partial data.
The `coverage-gate` job downloads both `jacoco-*` artifacts with
`actions/download-artifact@v7` (`pattern: jacoco-*`, `merge-multiple: true`)
into `build/jacoco/`, then runs
`./gradlew build jacocoTestReport -x test -x integrationTest` so the two
Test tasks do not re-run against already-collected coverage data.
A dedicated `test -s build/jacoco/test.exec && test -s
build/jacoco/integrationTest.exec` step precedes the build, because JaCoCo's
coverage verification silently passes (rather than failing) when no exec
file is present for a task it depends on; without that guard a broken
artifact download would pass the gate instead of failing it.

**The test summary line.** Both `Test` tasks now carry a `doLast` action
(`tasks.withType(Test).configureEach { ... }`) that reads the task's own
JUnit XML results directory with `groovy.xml.XmlSlurper`, sums the `tests`,
`failures`, `errors` and `skipped` attributes of every `<testsuite>` it
finds, and logs one lifecycle line per task: total/passed/failed/skipped
counts. This makes the CI log show how many tests ran in each job without
opening the HTML report, which is the issue owner's stated reason for it.
The first implementation used an anonymous `TestListener` added with
`addTestListener(new TestListener() { ... })`; that inner class implicitly
captures its enclosing script object, which broke the configuration cache
(`./gradlew test --rerun --configuration-cache` failed with
`ClosureCodec$BrokenScript cannot be cast`), so it was replaced with the
`doLast` form above, which captures only a task-local `Provider` and a local
`String` rather than the script itself. A `doLast` action only runs when the
task's own work succeeds, so the summary line itself only ever prints with
`failed: 0`; on a red run the `Test` task fails before its `doLast` runs,
and Gradle's own `N tests completed, M failed` line, plus the per-test
`FAILED` entries `testLogging { events = ['failed'] }` already prints, carry
the failure counts instead.

**Concurrency on `main`.** `cancel-in-progress` changed from unconditionally
`true` to `${{ github.event_name == 'pull_request' }}`. No `push` run has
ever executed in this repository yet (`gh run list --event push` returns
none), so this is a precaution rather than a fix for an observed failure:
the unconditional form would also cancel an in-flight push run on `main`
when a second merge landed within the run's duration, so the Gradle cache
save could be lost.

**Artifact overwrite.** Both exec-file upload steps (`jacoco-unit`,
`jacoco-integration`) now set `overwrite: true`, so GitHub's "Re-run all
jobs" cannot fail on a 409 name conflict against the previous run's
artifact.

**Continuing past a gate failure.** The `coverage-gate` step now runs
`./gradlew build jacocoTestReport -x test -x integrationTest --continue`,
because without `--continue` a failed `jacocoTestCoverageVerification` can
stop Gradle before the independent `jacocoTestReport` task has run, so the
merged HTML report the `if: failure()` upload step needs would not exist,
while `--continue` still leaves the build exiting non-zero on the same
failure.

**Report-upload artifacts.** The three `if: failure()` report upload steps
(`unit-test-reports`, `integration-test-reports`, `coverage-report`) now set
`overwrite: true` for the same re-run reason as the exec-file uploads, and
`coverage-report` also sets `if-no-files-found: error`, because with
`--continue` the merged report must exist on a gate failure, so an empty
upload there is a defect that should fail the step rather than only warn.

**Baseline (single job, before this revision).** 1m43s–2m06s wall clock,
cold Gradle cache on every run (no `push` trigger existed, so nothing ever
warmed it; see the Consequences bullet above). After: measured on the first
three-job run, 35465424123, on f166016, with a cold read-only cache (no
`push` run had landed yet): `unit-tests` 19:47:28–19:49:04 (1m36s, 26
tests), `integration-tests` 19:47:27–19:49:33 (2m06s, 36 tests),
`coverage-gate` 19:49:36–19:51:18 (1m42s), 3m54s total versus the
1m43s–2m06s single-job baseline. The warm-cache case — the first `push` run
on `main` and the PR runs that restore from it — is still to be measured.

## Sources

- https://github.blog/changelog/2026-09-17-ubuntu-26-generally-available-and-latest-migration/
  — `ubuntu-latest` migration window.
- https://github.com/actions/runner-images/issues/14748 — the same rollout,
  2026-10-19 to 2026-11-19.
- https://github.com/gradle/actions/blob/v6/setup-gradle/action.yml —
  `cache-read-only` default expression, `validate-wrappers` default,
  deprecated `arguments`, `cache-provider` default.
- https://github.com/gradle/actions/blob/v6/DISTRIBUTION.md — the
  `gradle-actions-caching` component is loaded whenever enhanced caching is
  enabled; free preview with planned usage-based pricing for private
  repositories.
- https://github.com/gradle/actions/blob/v6/docs/setup-gradle.md — setup
  step plus separate `./gradlew build`.
- https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
  — `timeout-minutes` default 360, `permissions`, `concurrency`.
- https://github.com/actions/upload-artifact/blob/v7/action.yml —
  `if-no-files-found` default `warn`.
- https://github.com/actions/checkout/blob/v7/action.yml —
  `persist-credentials` default `true`.
- https://github.com/actions/download-artifact/blob/v7/action.yml —
  `pattern`, `path` and `merge-multiple` inputs, verified for revision 2.

## Note: CI after the monorepo move (MIM-411, MIM-415)

- The workflow this record describes is `.github/workflows/backend.yml` in the monorepo. It is a reusable workflow (`on: workflow_call`): `.github/workflows/ci.yml` calls it on a pull request to `main` or a push to `main` when the change touches a backend input path listed in `.github/components.yml`.
- Its jobs run on Blacksmith runners (`blacksmith-2vcpu-ubuntu-2404`) instead of the pinned `ubuntu-24.04` above, and run their steps in `backend/` (the smoke job in `backend/services/commerce/`).
- It has five jobs: `Unit tests`, `Integration tests`, `Lint (PMD)` (decision 0009), `Coverage gate and build`, and `PostgreSQL boot and smoke` (decision 0013).
- The monorepo's Node jobs run in `.github/workflows/frontend.yml`; `backend.yml` still has none. The import script is at `tools/catalog-import/` (decision 0005) and is still never run in CI.
