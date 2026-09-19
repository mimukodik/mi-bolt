# FIX-08 — Turn the coverage thresholds on and bring `src/mocks/**` into the gate

Status: DONE — d8505e2. Verified: angular.json carries the mandated perFile 100/100/100/100 coverage thresholds with no exclusion list, matching FIX-08-AC01; AC02-AC10 evidence not independently re-run.
Severity: blocker
Source: A5 Part 3, A5 Part 4

## Why this is wrong

Two separate holes, both of which make a green coverage run meaningless.

**First, the runner's own threshold gate is switched off.** Measured on commit `db6d295`,
`npm run test:unit:coverage` exits **0 — green — at 56.42% statements**, 53.02% branches,
48.57% functions and 59.3% lines. `docs/spec/coverage-policy.json` sets all four to 100
and `docs/spec/testing.md:7` states what 100 means: *"Four independent unit metrics must
be 100% both globally and per owned executable runtime file."* A gate that reports
success at 56% while the project demands 100% is **worse than no gate**: no gate is an
absence somebody notices, while a green one is an assurance nobody re-checks.

**Second, the eighteen files under `src/mocks/` are invisible to the manifest gate.**
`docs/spec/testing.md:9` names them explicitly as part of the denominator — *"Include all
first-party runtime TypeScript, including app bootstrap, guards, interceptors, facades,
presentational behavior, parsing/validation, shared helpers and MSW mock handler/domain/
persistence code"* — and closes the door on excluding them in the very next sentence:
*"No broad `core/**`, `mocks/**` or `errors/**` exclusions are allowed."* The exclusion is
not declared anywhere; it happens by accident, through a missing branch in a classifier.

## Evidence

### Hole one — thresholds

`vitest.config.ts:526-532` as it stands on `db6d295`:

```ts
      // Thresholds live in scripts/check-coverage.mjs so the gate is
      // the single source of truth. The runner should always emit a
      // report; failing on threshold belongs to the gate, not to the
      // vitest process, otherwise the Angular unit-test builder
      // (which shares this config) blocks the wider suite on
      // pre-existing under-tested files.
      thresholds: undefined,
```

The reason given in the comment — that the builder "shares this config" — is the exact
coupling FIX-04 removes. **FIX-04's rewrite deletes that line along with the rest of the
file**, so by the time this task runs there is nothing to remove; this task only adds the
setting in the right place. Confirm before starting:
`grep -c "thresholds" vitest.config.ts` must print `0`. If it does not, FIX-04 has not
landed and this task must not be started.

The Angular builder has the option natively and the `test` target does not use it.
`node_modules/@angular/build/src/builders/unit-test/schema.json`, the
`coverageThresholds` property:

```json
"coverageThresholds": {
  "type": "object",
  "description": "Specifies minimum coverage thresholds that must be met. If thresholds are not met, the builder will exit with an error.",
  "properties": {
    "perFile": { "type": "boolean", "description": "When true, thresholds are enforced for each file individually." },
    "statements": { "type": "number" },
    "branches": { "type": "number" },
    "functions": { "type": "number" },
    "lines": { "type": "number" }
  },
  "additionalProperties": false
}
```

`angular.json:90-112` — the real `test` target has `runnerConfig`, `coverage`,
`coverageInclude`, `coverageExclude` and `coverageReporters`, and **no
`coverageThresholds` key at all**. `grep -c coverageThresholds angular.json` prints `0`.

The shape the spec asks for is already written down. `docs/spec/testing.md:32-43`:

```json
{
  "builder": "@angular/build:unit-test",
  "options": {
    "coverage": true,
    "coverageInclude": ["src/**/*.ts"],
    "coverageExclude": ["**/*.spec.ts", "**/*.test.ts", "**/*.d.ts", "src/app/api/generated/**"],
    "coverageThresholds": {"statements":100,"branches":100,"functions":100,"lines":100},
    "coverageReporters": ["html","lcov","json","json-summary"]
  }
}
```

and `docs/spec/coverage-policy.json` adds the per-file requirement:

```json
  "unit": {
    "thresholds": { "statements": 100, "branches": 100, "functions": 100, "lines": 100 },
    "perFile": true,
```

Every number this task writes down comes from one of those two files. None is chosen
here, which is what `.claude/rules/planning-deliverables.md` requires.

### Hole two — `src/mocks/**` falls through to an unenforced classification

`scripts/runtime-manifest.mjs:63-77`, the whole classifier:

```js
function classify(relativePath) {
  const posix = relativePath.split(sep).join('/');
  if (TEST_SUFFIXES.some((s) => posix.endsWith(s))) return 'tests';
  if (posix.endsWith('.d.ts')) return 'types';
  if (posix === 'src/main.ts') return 'bootstrap';
  if (posix.startsWith('src/app/api/generated/')) return 'generated';
  if (posix.startsWith('src/styles/')) return 'styles';
  if (posix.endsWith('.css')) return 'styles';
  if (posix.endsWith('.html')) return 'templates';
  if (posix.startsWith('src/app/')) return 'runtime';
  if (posix === 'src/index.html') return 'index-html';
  if (posix.startsWith('src/environments/')) return 'runtime';
  if (posix.startsWith('public/')) return 'assets';
  return 'other';
}
```

There is no `src/mocks/` branch, and `src/mocks/…` does not start with `src/app/`, so
every one of these eighteen files falls through to `'other'`:

```text
src/mocks/browser.ts                     src/mocks/idempotency.ts
src/mocks/cart/cart-domain.ts            src/mocks/node.ts
src/mocks/cart/cart.handlers.ts          src/mocks/orders/commit-order.ts
src/mocks/catalog/catalog.handlers.ts    src/mocks/orders/order.handlers.ts
src/mocks/catalog/facets.ts              src/mocks/payment/payment.handlers.ts
src/mocks/catalog/filter-products.ts     src/mocks/persistence.ts
src/mocks/checkout/checkout.handlers.ts  src/mocks/repository.ts
src/mocks/checkout/quote-domain.ts       src/mocks/scenarios.ts
src/mocks/checkout/validate-checkout.ts  src/mocks/create-handlers.ts
```

(`find src/mocks -type f -name '*.ts' | wc -l` prints `18`.)

And `'other'` is never enforced — `scripts/check-coverage.mjs:39`:

```js
const ENFORCED_CLASSIFICATIONS = new Set(['runtime', 'bootstrap']);
```

used at `:181`:

```js
    ENFORCED_CLASSIFICATIONS.has(f.classification),
```

So the gate that exists to be *"the explicit denominator for the 100% promise"*
(`scripts/runtime-manifest.mjs:4-7`) silently drops the entire mock layer — the layer
`docs/spec/coverage-policy.json`'s `e2e.sourceScope` calls out by name: *"All first-party
browser-delivered executable runtime source, including shared mock
handlers/domain/persistence/bootstrap."*

The classifier's own header is out of date too: `scripts/runtime-manifest.mjs:19-28`
documents five classifications (`runtime`, `bootstrap`, `generated`, `tests`, `styles`)
while `classify()` returns nine, `'other'` among them.

### What `all: false` was for, and why it no longer needs fixing here

`vitest.config.ts:524` set `all: false`, contradicting the same file's header comment at
`:14` (*"all: true (include unvisited files in the report; the gate rejects them)"*).
FIX-04's rewrite deletes both the setting and the comment, so Vitest's own default
applies again. This task does not re-add an `all` key; it verifies the behaviour instead,
in "How to verify" step 3, because the behaviour — an unvisited file appearing in the
report with zeros — is what `docs/spec/testing.md:9` actually requires: *"An unimported or
unvisited file remains in the denominator with zero execution."*

## What to change

Two files.

### 1. `angular.json` — add `coverageThresholds` to the `test` target

The mechanism is the builder's own, documented in
`node_modules/@angular/build/src/builders/unit-test/schema.json:149-175`: `perFile`,
`statements`, `branches`, `functions` and `lines`, `additionalProperties: false`. This
replaces `scripts/check-coverage.mjs` rather than sitting beside it — see step 2 below.

Inside `projects.mi-bolt.architect.test.options`, after `coverageExclude` and before
`coverageReporters`, add:

```json
            "coverageThresholds": {
              "perFile": true,
              "statements": 100,
              "branches": 100,
              "functions": 100,
              "lines": 100
            },
```

The four numbers come from `docs/spec/testing.md:39` and
`docs/spec/coverage-policy.json`; `perFile: true` comes from
`docs/spec/coverage-policy.json`'s `unit.perFile`. Do not lower any of them, do not add a
fifth key (`additionalProperties` is `false` in the schema and the build will reject it),
and do not add `coverageWatermarks`.

### 2. Delete `scripts/check-coverage.mjs` and `scripts/runtime-manifest.mjs`, and correct the T02 packet

Both scripts exist to work around the same gap step 1 just closed: the Angular builder
had no `perFile` threshold option to reach for, so `runtime-manifest.mjs` built a
hand-rolled denominator and `check-coverage.mjs` enforced it, classification bug and all.
The builder now enforces per-file thresholds itself, and `angular.json`'s own
`coverageInclude` (`:96`, `"src/**/*.ts"`) already matches every file under `src/mocks/`
— the glob is not anchored to `src/app/`, so the eighteen mock files were never excluded
from the *real* coverage engine, only from the bespoke classifier that read
`runtime-manifest.mjs`'s output. Confirm this before deleting anything:

```bash
node -p "require('./angular.json').projects['mi-bolt'].architect.test.options.coverageInclude"
```

must print `[ 'src/**/*.ts' ]`, so **no edit to `coverageInclude` is needed** — the
`'other'` misclassification was a defect in the deleted script, not in the builder's own
configuration, and the requirement it existed to enforce (`docs/spec/testing.md:9`, *"No
broad `core/**`, `mocks/**` or `errors/**` exclusions are allowed"*) is met by the glob
already matching every file under `src/mocks/`.

Delete both scripts:

```bash
git rm scripts/check-coverage.mjs scripts/runtime-manifest.mjs
```

Then remove their two lines from `docs/tasks/T02.md`'s `## Files` section (currently
`:22-23`: `` - `scripts/check-coverage.mjs` `` and `` - `scripts/runtime-manifest.mjs` ``),
and the matching two entries, `"scripts/check-coverage.mjs",` and
`"scripts/runtime-manifest.mjs",`, from the `T02` object's `files` array in
`docs/tasks/tasks.json`. `docs/index.html` mirrors the same T02 file list inside a
rendered `<code>` block; remove both entries there too. Locate the `docs/index.html`
occurrences with `grep -o '.\{40\}scripts/check-coverage\.mjs.\{40\}' docs/index.html` and
the equivalent pattern for `runtime-manifest\.mjs` rather than by line number — the file
is a single minified line and a line number does not resolve to a location in it. Leave
every other line of the three files' T02 entries untouched — in particular, do not touch
any `Txx-ACyy` acceptance criterion; that is not this edit's concern.

### 3. Replace T02-AC06's CI clause, in the same `docs/tasks/T02.md` packet this task already edits

D17 deletes CI outright — there is no `.github/workflows/` directory and never has been
(decision **D17**) — so T02-AC06 as written asks for a network namespace/firewall no
pipeline provides. `docs/tasks/T02.md:50`, current:

```text
- [ ] **T02-AC06** CI network namespace/firewall permits only the local static host after
      dependencies/browsers are installed. Browser CSP is an additional barrier, not the
      sole proof.
```

Replace with:

```text
- [ ] **T02-AC06** The E2E run reaches only the local static host: MSW's unhandled-request
      policy is fail-closed and a deliberate external fetch fails the test. Browser CSP is
      an additional barrier, not the sole proof.
```

This keeps the criterion's substance — `docs/spec/testing.md:53` states the same egress
proof independently of any CI machinery: *"A deliberate negative test proves egress
blocks."* — and drops only the network-namespace/firewall half, which has no CI to provide
it. `e2e/network-isolation.spec.ts` already exists and is what satisfies it (its two tests
assert exactly this: a deliberate unhandled `/api/v1/...` request and a deliberate external
`fetch` both fail to reach the network).

Apply the identical text change to the two mirrors, confirmed today at:

- `docs/tasks/tasks.json:153-154` — the `T02-AC06` object's `"text"` field, inside the
  `T02` task's `acceptanceCriteria` array.
- `docs/index.html`, in **three** places: the compact
  `<div class="criterion"><strong>T02-AC06</strong><span>…</span></div>` block, measured
  today at `:2704` (inside the longer line that also carries T02-AC01 through T02-AC05);
  the full `<li>[ ] <strong>T02-AC06</strong> …</li>` inside the expanded task packet,
  measured today at `:2745`; and the `data-search='{...}'` JSON attribute on the same
  `<details>` element (measured today at `:2700`, the `"t02-ac06"` entry inside
  `"acceptancecriteria"`) — lower-cased and with the same text; update it too, in the same
  lower-cased, quote-escaped form the rest of that attribute already uses. Locate all three
  by `grep -o` pattern rather than trusting these line numbers once another task's edit has
  shifted them:

```bash
grep -o '.\{40\}t02-ac06.\{80\}' docs/index.html
grep -o '.\{40\}T02-AC06.\{80\}' docs/index.html
```

Leave every other `Txx-ACyy` line in all three files untouched — this is the one
criterion's text, nothing else in the T02 packet.

### What this will surface, and what to do about it

Turning on a 100% per-file threshold and bringing the mock layer fully into the report
will make `npm run test` fail loudly. **That is the task working, not the task failing.**
Handle what it reports as follows:

- A file with real coverage below 100% gets a test, in the same commit, written to the
  rules `docs/spec/testing.md:24` sets: real TestBed, real generated SDK, MSW intercepts
  the request, no mocked facade or `HttpClient`.
- **`src/mocks/node.ts` will report 0% statements/branches/functions/lines and it must be
  left that way.** Nothing in the repository imports it: `grep -rn "mocks/node" src/ tests/
  e2e/` returns two hits, one a prose mention in a comment
  (`src/mocks/create-handlers.ts:15`) and one a source-text assertion in
  `tests/contract/operation-matrix.spec.ts:381`. Its own doc comment claims
  `tests/setup-msw.ts` uses it, and that file calls `setupServer()` directly at `:42`
  instead. `docs/spec/testing.md:9` says exactly what to do with such a file: *"An
  unimported or unvisited file remains in the denominator with zero execution. Dead or
  impossible code requires a design correction, not an ignore annotation."* The design
  correction is **FIX-13**, which removes `createNodeServer`. Record the file in the
  commit body as a known open item pointing at FIX-13; do **not** write a test for dead
  code and do **not** add an exclusion for it.
- Never close the gap by lowering a number, adding a `coverageExclude` entry, adding an
  ignore pragma or deleting a defensive branch.
  `docs/spec/coverage-policy.json`'s `forbidden` array lists all four, and
  `docs/spec/acceptance.md:26` (AC22) repeats the prohibition.

If the remaining work is too large to finish in this commit, **the thresholds still go
in**. Record every file still short of 100% in the commit body, with the FIX number that
owns the code it tests, and say plainly that `npm run test` is red on coverage from this
commit. A red gate that tells the truth is the deliverable; a green one at 56% is what
this task exists to end.

## Out of scope

- **`vitest.config.ts` — FIX-04.** Do not re-add a `thresholds`, `all` or `environment`
  key to it. Its whole remaining content is the `reportsDirectory` setting.
- **Moving or rewriting specs — FIX-06 and FIX-07.** Both must already have landed; see
  the ordering section.
- **A separate E2E source-coverage requirement.** D19 item 1 removes it entirely: there is
  no `test:e2e:coverage`, no `coverage:e2e:check` and no `coverage/e2e/coverage-final.json`
  to produce. Nothing in this task's verification touches E2E coverage in any form.
- **The missing `.spec.mjs` coverage of the other gate scripts.**
  `scripts/check-test-policy.mjs`, `scripts/check-traceability.mjs`,
  `scripts/check-budgets.mjs`, `scripts/verify-skill-evidence.mjs` and
  `scripts/verify-toolchain.mjs` are each owned and deleted by a different FIX number
  (**FIX-46**, **FIX-39**, **FIX-40**, **FIX-38**, **FIX-05**) under D17, so the observation
  the pre-D17 version of this task carried — that these scripts had no test coverage of
  their own — no longer needs an owner: none of them exist once the package lands. Do not
  delete any of the five here; each belongs to the FIX number named above.
- **Editing `docs/spec/coverage-policy.json` or `docs/spec/testing.md`.** D1: the
  specification is right, the configuration is wrong. No task in this package may edit a
  spec document to match the implementation.

## How to verify

From the repository root, npm only.

1. `grep -c "thresholds" vitest.config.ts` — must print `0` **before** starting. If it
   does not, FIX-04 has not landed; stop.

2. `node -p "JSON.parse(require('fs').readFileSync('angular.json','utf8')).projects['mi-bolt'].architect.test.options.coverageThresholds"`

   Must print an object with `perFile: true` and all four metrics at `100`.

3. `node -p "JSON.parse(require('fs').readFileSync('angular.json','utf8')).projects['mi-bolt'].architect.test.options.coverageInclude"`

   Must print `[ 'src/**/*.ts' ]`, confirming the eighteen files under `src/mocks/` were
   already in the real coverage engine's denominator and need no new entry.

4. `npm run test`

   The builder now fails on threshold. Its output must name the files that are short, per
   file, and that list must include every under-covered file under `src/mocks/` —
   `src/mocks/node.ts` among them, at 0% statements/branches/functions/lines. Whether the
   command exits `0` overall depends on how much of the remaining coverage work fits in
   this commit; the criterion is that it fails **on threshold** rather than passing
   silently, and that the failure lists specific files, `src/mocks/**` included. Record
   the full per-file list in the commit body.

5. `ls scripts/check-coverage.mjs scripts/runtime-manifest.mjs` — both must report "No
   such file or directory".

6. `grep -rn "scripts/check-coverage.mjs\|scripts/runtime-manifest.mjs" docs/tasks/` —
   must print nothing.

7. `grep -n "CI network namespace" docs/tasks/T02.md docs/tasks/tasks.json docs/index.html`
   — must print nothing. `grep -n "T02-AC06" docs/tasks/T02.md` must show the replacement
   text ending "…Browser CSP is an additional barrier, not the sole proof." with no
   "network namespace/firewall" clause before it.

8. `npm run build` and `npm run lint` — both must exit **0**.

Gates that are red for reasons this task does not fix, so the executor does not chase
them: `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or
`npx playwright test` while working on this task: both rewrite tracked files and leave
the working tree dirty.

## Acceptance criteria

- [ ] **FIX-08-AC01** `angular.json`'s `test` target carries
      `"coverageThresholds": { "perFile": true, "statements": 100, "branches": 100,
      "functions": 100, "lines": 100 }`, with every number traceable to
      `docs/spec/testing.md:39` and `docs/spec/coverage-policy.json`, and the commit body
      quotes both sources.
- [ ] **FIX-08-AC02** `npm run test` no longer exits `0` while any covered file is below
      100%. Demonstrate it in the commit body by quoting the threshold failure lines, or
      — if the coverage work was completed in this commit — by quoting a 100/100/100/100
      summary and a `0` exit code.
- [ ] **FIX-08-AC03** `node -p "JSON.parse(require('fs').readFileSync('angular.json','utf8')).projects['mi-bolt'].architect.test.options.coverageInclude"`
      prints `[ 'src/**/*.ts' ]`, unchanged by this commit, confirming `src/mocks/**` was
      already inside the real coverage engine's denominator.
- [ ] **FIX-08-AC04** `scripts/check-coverage.mjs` and `scripts/runtime-manifest.mjs` no
      longer exist (`ls` on both reports "No such file or directory"), and
      `grep -rn "scripts/check-coverage.mjs\|scripts/runtime-manifest.mjs" docs/tasks/`
      prints nothing. `docs/tasks/T02.md`'s `## Files` section, `tasks.json`'s `T02` object
      and `docs/index.html`'s rendered T02 file list all still list every other T02
      deliverable unchanged.
- [ ] **FIX-08-AC05** `docs/tasks/T02.md:50`'s **T02-AC06** reads *"The E2E run reaches
      only the local static host: MSW's unhandled-request policy is fail-closed and a
      deliberate external fetch fails the test. Browser CSP is an additional barrier, not
      the sole proof."*, with no "CI" or "network namespace/firewall" wording anywhere in
      it. The identical text change is applied to `docs/tasks/tasks.json:153-154` (the
      `T02-AC06` object's `"text"` field) and to both `docs/index.html` occurrences (the
      compact `<div class="criterion">` block and the full `<li>` in the expanded packet).
      `grep -n "CI network namespace" docs/tasks/T02.md docs/tasks/tasks.json
      docs/index.html` prints nothing. No other `Txx-ACyy` line in any of the three files
      changes.
- [ ] **FIX-08-AC06** `git diff --staged` adds no entry to `coverageExclude`, no
      coverage-ignore pragma, and no threshold below 100. Check with
      `git diff --staged | grep -nE "coverageExclude|c8 ignore|istanbul ignore|v8 ignore"`,
      which must print nothing, and by reading the `coverageThresholds` block.
- [ ] **FIX-08-AC07** `src/mocks/node.ts` is reported by `npm run test`'s per-file
      threshold failure output at 0% statements/branches/functions/lines, is named in the
      commit body as a known open item owned by **FIX-13**, and has neither a test written
      for it nor an exclusion added for it.
- [ ] **FIX-08-AC08** `npm run build` exits `0` and `npm run lint` exits `0`.
- [ ] **FIX-08-AC09** **Browser verification is exempt for this task, and the reason is
      recorded in the commit body.** The change adds a threshold object to a build
      configuration, deletes two Node gate scripts and corrects three documentation files'
      file lists and one acceptance-criterion's text; the only other files it may touch are
      `*.spec.ts` files added to raise coverage, which the production build excludes
      (`tsconfig.app.json:11-13`). Nothing that reaches a rendered surface changes. This is
      the exemption `.claude/rules/browser-verification.md` grants to a build or
      gate-script change, stated explicitly rather than left out silently. **If raising
      coverage required editing any non-spec file under `src/app/**` or `src/mocks/**`, the
      exemption lapses**: that edit changed behaviour a person can reach, and one
      real-browser check through the `real-browser-sonnet` agent is then required — open
      the route that exercises the edited file at viewport width **1440**, drive the
      changed behaviour, `take_screenshot`, and confirm `list_console_messages` reports
      zero errors.
- [ ] **FIX-08-AC10** The `mi-bolt-design` R01–R26 record is in the commit body. R01
      through R25 are marked **N/A — this task changes coverage configuration, deletes two
      unused gate scripts and corrects a task packet's file list and one criterion's text,
      and renders nothing a person can see** (unless AC09's lapse clause fires, in which
      case the R-rules covering the edited surface are recorded as applicable and checked
      in that browser pass). **R26 is applicable and met**: the commit body names every
      file changed or deleted, the commands run with their exit codes, every file still
      short of 100% with its owning FIX number, and the one observation carried forward
      (`src/mocks/node.ts` to FIX-13). Skill provenance is stated once in
      `docs/fix/README.md` section 3, "Every task records the design rules": the
      installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns
      it). Cite it from there; do not restate it here.

## Commit

This task is exactly one commit: the threshold block, the two deleted scripts, the three
documentation corrections (the two deleted-script file-list entries and the T02-AC06 text
replacement, both landing in the same three files) and whatever tests were written to
raise coverage inside it. Do not bundle it with FIX-07. Commit only after every acceptance
criterion above passes — noting that AC02 is satisfied by a truthful red gate as much as
by a green one.

Suggested subject line, in the repository's `type: summary` style:

```text
test: enforce 100% coverage thresholds and delete the bespoke coverage gate
```

The push and the pull request are not the executor's; they belong to the orchestrating
session.

## Where this sits in the stream

**FIX-04 must land first.** It removes the `thresholds: undefined` line and the config
sharing that the line's own comment gives as its justification.

**FIX-06 must land first.** It moves 24 specs into `src/`, which changes both what the
suite executes and what the coverage report contains. Setting a threshold before that
would gate against a number that is about to move by a large margin.

**FIX-07 must land first.** It converts 368 source-text assertions into real executing
tests, which is the single largest change to the coverage figure in this package. Turning
the threshold on before it would produce a wall of failures that FIX-07 was already going
to fix.

Nothing else in this stream of nine depends on FIX-08.
