# CI and CD

Every path is relative to the repository root. Which local command reproduces
which CI job, and which checks a change needs, are not here:
`mibolt-verification` owns that mapping.

## Contents

- [The pull-request pipeline](#the-pull-request-pipeline)
- [The reusable workflows](#the-reusable-workflows)
- [The candidate and deployment chain](#the-candidate-and-deployment-chain)
- [Changing a path filter or adding a component](#changing-a-path-filter-or-adding-a-component)
- [Adding a job or a step](#adding-a-job-or-a-step)
- [Current state worth knowing](#current-state-worth-knowing)
- [When a workflow does not run](#when-a-workflow-does-not-run)

## The pull-request pipeline

**`.github/workflows/ci.yml` is the one entry point.** It runs on every pull
request, whatever its base, and on every push to `main`
(`.github/workflows/ci.yml`, "branches: [main]"), and cancels an older run of the same pull
request (`.github/workflows/ci.yml`, "cancel-in-progress"). Its `changes` job runs
`dorny/paths-filter`, pinned by commit SHA, with
`filters: .github/components.yml` (`.github/workflows/ci.yml`, "filters: .github/components.yml"). The
action matches paths with picomatch, compares a pull request against its base
branch, and sets one `'true'` or `'false'` output per filter
(https://github.com/dorny/paths-filter). One job per component calls that
component's reusable workflow when its output is `'true'`
(`.github/workflows/ci.yml`, "if: needs.changes.outputs"), and `ci-ok` fails unless every needed job's
result is `success` or `skipped` (`.github/workflows/ci.yml`, "Every needed branch passed or was skipped").

**`.github/components.yml` has five components.**

| Component | Paths | Workflow |
|---|---|---|
| `frontend` | `.github/components.yml` ("frontend:") | `.github/workflows/frontend.yml` |
| `backend` | `.github/components.yml` ("backend:") | `.github/workflows/backend.yml` |
| `contracts` | `.github/components.yml` ("contracts:") | `.github/workflows/contracts.yml` |
| `tools` | `.github/components.yml` ("tools:") | `.github/workflows/tools.yml` |
| `smoke` | `.github/components.yml` ("smoke:") | `.github/workflows/smoke.yml` |

`docs/monorepo.md` ("Which CI branch runs for which change") transcribes the same table for readers; a change that
matches no component runs only `changes` and `ci-ok`, which is green
(`docs/monorepo.md`, "A change that matches no component").

## The reusable workflows

Each starts with `on: workflow_call`, which is what makes a workflow callable,
and the caller names it as `uses: ./.github/workflows/<file>`
(https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows).

- **`.github/workflows/frontend.yml`** runs in `frontend/` on Node 26 from
  `actions/setup-node`: `lint` (ESLint, Prettier), `unit-tests`
  (`npm run test`, `npm run test:contract`, one coverage summary per project,
  one `coverage-unit` artifact), `build` (the build, dist and boot checks,
  `.github/workflows/frontend.yml`, "Production build"), `api-drift` (`npm run api:drift`),
  `e2e` (a matrix of three cells, `.github/workflows/frontend.yml`, "E2E ${{ matrix.project }}") and
  `e2e-report`, which merges the cells' blob reports.
- **`.github/workflows/backend.yml`** runs in `backend/` on Java 21 from
  `actions/setup-java` with `gradle/actions/setup-gradle`: `unit-tests` and
  `integration-tests` each upload their JaCoCo data, `lint` runs PMD,
  `coverage-gate` needs both test jobs and runs the build and the coverage
  verification on the downloaded data, and `postgres-smoke` needs the two test
  jobs and `lint`, boots the jar on a PostgreSQL 16 service container and runs
  `backend/services/commerce/scripts/smoke.sh`
  (`.github/workflows/backend.yml`, "PostgreSQL boot and smoke").
- **`.github/workflows/contracts.yml`** is the only workflow that runs through
  mise: `jdx/mise-action` (pinned by SHA, its mise version set in the workflow), then
  `mise -C contracts install` and `mise -C contracts run check`
  (`.github/workflows/contracts.yml`, "Contract checks").
- **`.github/workflows/tools.yml`** runs `npm ci`, `npm run typecheck` and
  `npm test` in `tools/` (`.github/workflows/tools.yml`, "Tools typecheck and tests").
- **`.github/workflows/smoke.yml`** builds and starts the whole Compose stack
  from the commit under a project and volume of its own, with the payment
  origins on the web port (`.github/workflows/smoke.yml`, "MIBOLT_PAYMENT_ORIGIN"), checks backend
  readiness through the web container, runs `npm run e2e:smoke` against it,
  prints the stack logs on failure and ends with `deploy/compose.sh down -v` on
  its own project (`.github/workflows/smoke.yml`, "name: Smoke on the real stack").

**CI does not call the root mise tasks.** Apart from
`.github/workflows/contracts.yml`, every job runs its tools directly, npm and
Gradle in the component workflows and `deploy/compose.sh` as well in
`.github/workflows/smoke.yml`, so a mise task and the CI step that does the
same thing are two edits.
`frontend/mise.toml` ("[tasks.build]") and `.github/workflows/frontend.yml` ("Production build") list
the same eight build steps, for example, and `frontend/mise.toml` ("[tasks.test]") passes
`-- --watch=false` to the unit run where `.github/workflows/frontend.yml`
("Vitest with coverage") does not.

## The candidate and deployment chain

`deploy/candidate/README.md` owns how candidates are built, published and
promoted; this is only the wiring.

| Workflow | Trigger | What it does |
|---|---|---|
| `.github/workflows/candidate.yml` ("Candidate Build") | pull request, push to `main` | installs uv and Helm, computes the image input hashes (`deploy/candidate/inputs.py`), runs the four `deploy/tests/*.py` checks, builds both images with `docker buildx bake -f compose.yaml`, keeps a `candidate-build` artifact for 7 days (`.github/workflows/candidate.yml`, "Build both images from the Compose definition") |
| `.github/workflows/publish-candidate.yml` ("Publish Candidate") | `workflow_run` of `CI` and `Candidate Build`, completed | checks out the default branch as `trusted`, runs `deploy/candidate/publish.py` from there against the tested source, pushes images and the chart to GHCR, uploads `candidate-receipt` or `stable-release-receipt` (`.github/workflows/publish-candidate.yml`, "Verify inputs, publish immutable images and chart, write receipt") |
| `.github/workflows/stable-smoke.yml` ("Stable Smoke") | `workflow_run` of `Publish Candidate`, `workflow_dispatch` | waits for the stable demo and runs both purchase flows against it (`.github/workflows/stable-smoke.yml`, "Existing smoke tests against the stable demo") |

**Everything after `.github/workflows/candidate.yml` runs the default branch's
copy.** A `workflow_run` workflow triggers only when its file exists on the
default branch and runs in that branch's context
(https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).
These workflows also check out `ref: ${{ github.sha }}` for the code they run
(`.github/workflows/publish-candidate.yml`, "Checkout trusted publisher and chart";
`.github/workflows/stable-smoke.yml`, "Trusted receipt and fencing wrapper"). An edit to any of them, or to the
`deploy/candidate/*.py` scripts they call, takes effect only once it is on
`main`.

## Changing a path filter or adding a component

**A path added to or removed from the `frontend` or `backend` list fails the
candidate build unless the hash contract changes with it.**
`deploy/candidate/inputs.py` ("EXPECTED_FILTERS = {") pins those two lists exactly and raises
`path filter diverged from candidate hash contract` on any difference
(`deploy/candidate/inputs.py`, "path filter diverged from candidate hash contract"), and
`deploy/tests/test-candidate.py` ("setUp") writes the same lists into its fixture.
`Publish Candidate` hashes with the default branch's `inputs.py`
(`deploy/candidate/publish.py`, "from inputs import file_digest, hashes, tracked_files";
`deploy/candidate/publish.py`, "expected = hashes(source)"), so it
fails for such a pull request until the change is on `main`. Edit, in one
change:

1. `.github/components.yml`;
2. `deploy/candidate/inputs.py` ("EXPECTED_FILTERS = {") and
   `deploy/tests/test-candidate.py` ("setUp") when the `frontend` or `backend` list
   changed;
3. the component table at `docs/monorepo.md` ("Workflow it runs");
4. `frontend/README.md` ("finds a changed path under"), which spells out the `frontend` list in prose.

**A new component also needs** its list in `.github/components.yml`, an output
in the `changes` job (`.github/workflows/ci.yml`, "steps.filter.outputs"), a job calling its
workflow (`.github/workflows/ci.yml`, "if: needs.changes.outputs" shows the shape), that job's name in
`ci-ok`'s `needs` (`.github/workflows/ci.yml`, "needs: [changes, frontend, backend, contracts, tools, smoke]"), the new workflow file with
`on: workflow_call`, and a row in `docs/monorepo.md` ("Workflow it runs").

## Adding a job or a step

**Follow the shape the five reusable workflows share.**

- `runs-on: blacksmith-2vcpu-ubuntu-2404`, the label every job in
  `.github/workflows/` uses.
- `actions/checkout@v7` with
  `ref: ${{ github.event.pull_request.head.sha || github.sha }}` and
  `persist-credentials: false`, as in `.github/workflows/frontend.yml` ("persist-credentials: false").
- `defaults.run.working-directory` set to the workspace in
  `.github/workflows/frontend.yml`, `.github/workflows/backend.yml` and
  `.github/workflows/tools.yml`, so commands read as that area's own npm or
  Gradle commands.
- `timeout-minutes` on the job and on each slow step, as
  `.github/workflows/frontend.yml`, `.github/workflows/backend.yml`,
  `.github/workflows/tools.yml` and `.github/workflows/smoke.yml` set them;
  `.github/workflows/contracts.yml` sets none.
- For Node, `actions/setup-node@v7` with `node-version: 26`, `cache: npm` and
  the workspace's lockfile as `cache-dependency-path`, then `npm ci`
  (`.github/workflows/frontend.yml`, "cache-dependency-path: frontend/package-lock.json").
- An artifact another job needs goes through `actions/upload-artifact` and
  `actions/download-artifact`, as `.github/workflows/backend.yml` ("Upload coverage data") and
  `.github/workflows/backend.yml` ("Download coverage data") pass the JaCoCo data to
  `coverage-gate`.

`dorny/paths-filter` and `jdx/mise-action` are pinned by commit SHA
(`.github/workflows/ci.yml`, "dorny/paths-filter@";
`.github/workflows/contracts.yml`, "jdx/mise-action@"); every
other action is pinned by a version tag. `.gitattributes` ("*.yml text eol=lf") keeps every
`*.yml` and `*.yaml` file on LF line endings. No mise task lints workflow
files; `deploy/candidate/README.md` ("Run local checks with:") runs `actionlint` by hand, and no
`mise.toml` pins it.

## Current state worth knowing

- `'tools/ci/**'` is listed in the `frontend` and `backend` filters
  (`.github/components.yml`, "tools/ci/**") and in the pinned
  copies (`deploy/candidate/inputs.py`, "tools/ci/**";
  `deploy/tests/test-candidate.py`, "tools/ci/**"),
  and `git ls-files tools/ci` lists no file: the pattern matches no tracked
  path today.
- CI takes Node 26 and Java 21 from the setup actions, while mise pins exact
  versions for local runs (`mise.toml`, "[tools]").
- `README.md` ("What CI runs") names four reusable workflows; `.github/components.yml`
  has five, the fifth being `smoke`.
- `frontend/README.md` ("one job per browser and viewport") describes a ten-cell `e2e` matrix;
  `.github/workflows/frontend.yml` ("To save CI minutes only the desktop (fullhd) cell of each browser runs") runs three cells and keeps the
  others commented out.

## When a workflow does not run

| Symptom | Cause | Where |
|---|---|---|
| only `changes` and `ci-ok` ran | the change matched no component | `.github/components.yml`, `docs/monorepo.md` ("A change that matches no component") |
| a component's workflow was skipped on a pull request touching it | the path is missing from that component's list | `.github/components.yml` |
| `Candidate Build` failed at "Compute tracked build inputs" | `.github/components.yml` and `deploy/candidate/inputs.py` disagree | "Changing a path filter" above |
| an edited `workflow_run`, `schedule` or `pull_request_target` workflow behaves as before | the default branch's copy ran | "The candidate and deployment chain" above |
| `Publish Candidate` is green but published nothing | an eligibility check did not match, which is a deliberate no-op; the receipt artifact is the evidence of publication | `deploy/candidate/README.md` ("deliberate no-op") |
| no preview deployment for a pull request | the pull request lacks the `bolt-preview` label, or comes from a fork | `deploy/candidate/README.md` ("label on the PR to enable its preview"), `deploy/candidate/README.md` ("fork PRs have no automatic candidate receipt") |

PR previews are available at `https://bolt-pr-<PR-number>.mimukodik.hu` once
the `bolt-preview` label is on and the published candidate is ready. Optional
manual purchase checks and their retry command are in `deploy/candidate/README.md`.
