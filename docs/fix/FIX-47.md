# FIX-47 — Prune the npm scripts to the standard commands of the stack

Status: PLANNED — not executed.
Severity: major
Source: **D17** and **D19** (`docs/fix/README.md` section 6) — user decisions to prune the npm scripts
and commands declared in `docs/spec/testing.md` down to the standard commands of the stack, and to
delete the CI text from the specification because no CI implementation exists or is wanted. **D17**
(`docs/fix/README.md` section 6, an `architect-opus-xhigh` design) works out which of the 24 distinct
script names in play are standard and which were invented; **D19** closes the five points that design
left open. This task
replaces its own pre-D17 subject — "the missing npm scripts, the uninvoked ones, and the
traceability gate's name" — which the user's instruction reverses rather than extends: nothing is
added back under its old name, and eleven scripts survive where eighteen were declared.

## Why this is wrong

`docs/spec/testing.md:107-131` (current file, re-measured 2026-09-17) declares an eighteen-command
pipeline under a heading that still reads "Planned project commands **and CI order**", and
`package.json` today has sixteen scripts. The two lists overlap in six names (`lint`, `api:generate`,
`api:drift`, `api:validate`, `coverage:unit:check`, `coverage:e2e:check`), so their union is **28
distinct names**, re-measured 2026-09-17 against `docs/spec/testing.md:113-130` and
`package.json:4-20`. The user's own words, after reading the whole `docs/fix` package a second
time: *"nem kell ennyi script es npm parancs sem, standardek kellenek lint, test, coverage stb, plan
tul lett tervezve javitasd"* ("this many scripts and npm commands are not needed either; standards
are what is needed — lint, test, coverage and so on; the plan was over-engineered, fix it") (**D17**).
It is the same complaint the original audit opened with — *"mindent saját ötletekkel oldott meg a
standard létező megoldások helyett"* ("solved everything with its own ideas instead of the standard
existing solutions") — now aimed at the specification and at this package rather than at the code.

Of those 28 names, **nine** survive, and `package.json` ends with **eleven** scripts because two of
the survivors — Prettier's `format` and `format:check` — appear in neither list and are added by
**FIX-03** (`D19` item 3 keeps both, correcting the design's own count of ten). The eleven are: the
six the Angular CLI writes into every new workspace (`ng`, `start`, `build`, `watch`, `test`,
`lint`), Prettier's own documented pair (`format`, `format:check` — **D19** keeps both, overruling
the design's recommendation to drop the second), and three project-specific standard invocations
with no first-party equivalent (`build:e2e`, `api:generate`, `api:drift`). Every other declared or
existing name is a bespoke gate this project invented in place of a standard tool: a hand-rolled
coverage denominator where the `@angular/build:unit-test` builder already has
`coverageThresholds.perFile`; a hand-rolled contract validator duplicating a vitest suite that
already exists; a hand-rolled traceability regex that only proves a string appears in a `describe`
title, never that the requirement is met; and a hand-rolled aggregate pipeline, `verify:release`,
that this task's own prior text conceded "is expected to exit non-zero today" (recorded in
`docs/fix/README.md` section 6) — "the clearest single artefact of the over-engineering the user
named" (`docs/fix/README.md` section 6).

The specification also still describes a CI pipeline that has never existed anywhere but in its own
prose. `.github/` does not exist and never has. The user ruled it out entirely and separately from
the script pruning: *"semmilyen ci nem kell azokat torold"* ("no CI of any kind is needed, delete
those") (**D17**). This task deletes that text from `docs/spec/testing.md` and its `docs/index.html`
mirror; it creates no CI implementation, because none was ever asked for and this decision forecloses
one.

**This is a change to a specification document, and that needs saying plainly, because the next
reviewer will otherwise read it as a D1 violation and revert it.** These are the user's own edits,
decided under **D17** and **D19**, in the class **D11**, **D14** and **D16** already established: a
task carrying out the user's own decision on spec text, not a task deciding on its own that the
specification is wrong. **D1 is not weakened by this edit; no task in this package, and no task
outside it, may cite this passage as a precedent** for editing `docs/spec/testing.md` — or any other
specification document — to match what an implementation happens to do.

## Evidence

### The verdict for the 24 names these two removal tables judge (survivor count corrected to eleven by `D19` item 3)

These tables judge 19 specification entries (`npm ci` plus the eighteen `npm run` names) and the 5
`package.json` entries no specification line declares. Four of the 24 rows carry a KEEP verdict; the
seven remaining survivors — `ng`, `start`, `build`, `watch`, `test`, `format`, `format:check` — are in
the survivors table above and are not judged here, because nothing in either document proposed
removing them.

**Survivors — eleven entries:**

| Script | Command | Why it survives |
|---|---|---|
| `ng` | `ng` | Written by `ng new`. The CLI passthrough. |
| `start` | `ng serve` | Standard (`ng serve`). |
| `build` | `ng build` | Standard (`ng build`). `angular.json` sets `defaultConfiguration: production`, so this *is* the optimized build. |
| `watch` | `ng build --watch --configuration development` | Written by `ng new`. Zero maintenance. |
| `test` | `ng test` | Standard (`ng test`). `angular.json`'s `test` target already sets `"coverage": true`, and the builder exits non-zero on an unmet coverage threshold (verified in `node_modules/@angular/build/src/builders/unit-test/runners/vitest/executor.js:172-186`, which flips `success = false` with reason `'Test run failed due to unmet coverage thresholds.'`). |
| `lint` | `ng lint` | Standard (`ng lint`). `testing.md:118` already folds test-policy rules into it. |
| `format` | `prettier --write .` | Prettier's own documented invocation. **FIX-03** adds it. |
| `format:check` | `prettier --check .` | **Kept by D19 item 3**, which overrules the design's own recommendation (`docs/fix/README.md` section 6) to cut it as "the CI half of Prettier's documented pair". Prettier documents `--write` for a developer and `--check` for a pass/fail gate; the user chose to keep both. **FIX-03** adds it. |
| `build:e2e` | `ng build --configuration e2e` | `angular.json` already declares an `e2e` build configuration and it is what `playwright.config.ts`'s `webServer` serves out of `dist/mi-bolt/browser`. Not an alias of anything else that survives. **This task adds the entry**; no other task does. |
| `api:generate` | `ng-openapi-gen --config ng-openapi-gen.json` | Standard. The `--config` form is the generator's own documented invocation. |
| `api:drift` | `node scripts/api-drift.mjs` today. | **Keeps the check, loses the script — but this task does not make that change.** The **D17** design (`docs/fix/README.md` section 6) rewrites the command to `npm run api:generate && git diff --exit-code -- src/app/api/generated` because there is no first-party Angular drift check and because the bespoke script's own guard — `scripts/api-drift.mjs:125`'s `if (git.status !== 0 && git.stderr && !/Not a git repository/i.test(git.stderr))` (re-measured 2026-09-17; the pre-D17 design cited this line as `:44`, which is a different guard in the same file and not this one) — can never fire on genuine drift, because `git diff --exit-code` with no `--quiet` flag writes its diff to stdout, not stderr, so `git.stderr` stays empty and the condition is never true. **`FIX-11` owns that rewrite and the deletion of `scripts/api-drift.mjs`, in its own commit.** This task's job is the key set, not this value: see "What to change" item 1. |

**Removed, with the standard that covers each (`docs/fix/README.md` section 6):**

| Script | Spec line (`testing.md`, current numbering) | Verdict | The standard, or the rule, that covers it |
|---|---|---|---|
| `npm ci` | `:112` | not a package script | npm's own install; stays as the install step, nothing to implement |
| `verify:toolchain` | `:113` | REMOVE | `scripts/verify-toolchain.mjs` shells out to `npm view` per dependency; `npm ci` already fails on an unsatisfiable `engines` range once `engines` is set (**FIX-05**); the network call per dependency also argues against `testing.md:53`'s own closed-world rule |
| `verify:skill` | `:114` | REMOVE | `scripts/verify-skill-evidence.mjs` re-hashes the installed skill against `skill-location.json`, which `.claude/CLAUDE.md` ("Design skill mandate") already makes the only source of truth; **FIX-38** still creates that JSON file |
| `api:validate` | `:115` | REMOVE | literally `contract:validate && api:drift`, a composite adding nothing but `&&` |
| `api:generate` | `:116` | KEEP | see survivors table |
| `api:drift` | `:117` | KEEP, rewritten by FIX-11 | see survivors table |
| `lint` | `:118` | KEEP | see survivors table |
| `test:unit` | `:119` | REMOVE the name | `ng test` is already the `test` script; `--watch=false` is unneeded (the builder's `watch` option defaults to `false` outside a TTY) and `--coverage` is already on |
| `coverage:unit:check` | `:120` | REMOVE | the builder ships `coverageThresholds.perFile` (`node_modules/@angular/build/src/builders/unit-test/schema.json:149-175`) and Vitest 4 documents `thresholds.perFile`; **FIX-08** wires it |
| `test:contract` | `:121` | REMOVE the name | once **FIX-06** co-locates the contract specs, `ng test` collects them like everything else |
| `build:e2e` | `:122` | KEEP | see survivors table |
| `test:e2e:coverage` | `:123` | REMOVE | settled by **D19** item 1, see "the two verdicts" below |
| `coverage:e2e:check` | `:124` | REMOVE | settled by **D19** item 1, see below |
| `test:e2e:browsers` | `:125` | REMOVE the name; the requirement survives in full | plain `playwright test` with three configured projects **is** the three-browser run once **FIX-58** adds the Firefox and WebKit projects; `--project=<name>` and `npx playwright install firefox webkit` are Playwright's own documented forms |
| `test:design` | `:126` | REMOVE the name; the suite survives | `playwright test e2e/design e2e/a11y` is a path selection of the standard command |
| `verify:traceability` | `:127` | REMOVE | see "Why `verify:traceability` does not survive" below |
| `build:demo` | `:128` | REMOVE | `ng build --configuration production` **is** `npm run build` (`angular.json` sets `defaultConfiguration: production`) — a literal alias |
| `verify:budgets` | `:129` | REMOVE | Angular's own `budgets` array is already in `angular.json:36-47` (`initial` 500kB/1MB, `anyComponentStyle` 4kB/8kB under `production`, re-measured 2026-09-17); a `maximumError` breach already fails `ng build` |
| `verify:release` | `:130` | REMOVE | an `&&` chain of every gate is a CI pipeline written as an npm script, and there is no CI |

**The `package.json` entries in no spec line at all (`docs/fix/README.md` section 6):**

| Script | Verdict | Reason |
|---|---|---|
| `contract:validate` | REMOVE | `tests/contract/schema.spec.ts` already re-validates the same OpenAPI document independently, in the vitest suite; two implementations of one check. **FIX-13** moves the four project-specific assertions into `tests/contract/` as vitest cases. |
| `coverage:manifest` | REMOVE | `scripts/runtime-manifest.mjs` builds a second, hand-rolled denominator beside `angular.json`'s own `coverageInclude`/`coverageExclude` |
| `check:traceability` | REMOVE | the current-repository spelling of the same gate that `verify:traceability` names in the specification; both are removed, see below |
| `check:test-policy` | REMOVE | `testing.md:118` already folds test-policy rules into `npm run lint`; **FIX-46** moves the check into ESLint's `no-restricted-syntax` |
| `test:unit:coverage` | REMOVE | the second, disjoint unit runner — `vitest run --coverage` runs the 30 specs under `tests/` with thresholds off while `ng test` runs the 14 under `src/`, and the sets do not overlap; it "exits GREEN while reporting Statements 56.42%" (`docs/fix/README.md` section 6) although the spec requires 100%. **This is the only currently-green unit command**, which is why this task must not land before `ng test` itself works — see "Ordering" below. |

**The two verdicts that carry a real requirement, and how each is preserved (`docs/fix/README.md` section 6, `D19`):**

- **`verify:budgets` → T28-AC04 is untouched.** Angular's `budgets` array measures raw output bytes and already lives in `angular.json:36-47`; that is the build-time gate. T28-AC04's gzip figures are measured and recorded separately in `docs/mi-bolt/execution/deployment.md`, which **FIX-40** item 2 already commissions. No spec line changes for this.
- **`coverage:e2e:check` and `test:e2e:coverage` are removed — settled, not left open.** The design flagged this as the one verdict to put to the user before landing (§4.4), and **D19 item 1 answered it**: *"Menjen, a funkcionális suite marad"* ("let it go, the functional suite stays"). Removed with the two commands: `e2e/fixtures/coverage.ts`, `e2e/fixtures/test.ts`, `e2e/coverage-canary.spec.ts`, `e2e/coverage-canary-negative.spec.ts`, `tests/coverage-canary.spec.ts`, `tests/coverage-canary-negative.spec.ts`, the `--e2e` half of `scripts/check-coverage.mjs`, the five files under `src/app/coverage-canary/` and the `/canary` route they serve, and `docs/spec/testing.md:55-57`. None of those files or that route is this task's to delete — see "Out of scope" — but the two `package.json` names and the two `testing.md` paragraphs are. **The three-browser functional E2E suite is untouched and D12 stands.**

### Why `verify:traceability` does not survive, and what happens to D10 (`docs/fix/README.md` section 6)

**D17 narrows D10; it does not reverse it.** `scripts/check-traceability.mjs` proves that every
`RQxx`, every `E001…E127` scenario and every `Txx-ACyy` token appears as a **citation** in a spec
file, matched by regex against `describe(...)` titles. It does not check that the test asserts
anything about the requirement — the package says so itself, `FIX-40` item 4: "the gate proves a
citation exists, and this document is where a human records whether the requirement is met." And it
cannot pass: **D7** had to teach it about `optional: true` and the `O01` id because
`taskRegex = /\b(T\d{2})\b/` can never match `O01`. A gate whose pass condition is "a string appears
in a title" restates a bookkeeping convention rather than catching a defect
(`.claude/rules/planning-deliverables.md`).

**The requirement survives, in the place the specification already puts it.** `testing.md:137` (§8,
Required evidence) asks for "requirement traceability" per release, and `FIX-40` item 4 already
commissions `docs/mi-bolt/execution/traceability.md` as the human record. That document is the
deliverable; the regex was never it.

**So `verify:traceability` is removed, and D10 keeps binding every survivor.** A command D17 removes
has no name left to argue about. `api:generate`, `api:drift`, `lint` and `build:e2e` all survive
under exactly the spelling `testing.md:112-130` gives them, so D10 is satisfied without a single
rename. **This is why this task no longer carries the "run this task first" ordering its pre-D17 text
had**: that ordering existed only so a `check:traceability` → `verify:traceability` rename would land
before every other file's boilerplate started naming `npm run verify:traceability`. The rename it was
protecting no longer happens — the gate is deleted, not renamed — so the constraint it existed for is
gone. This task returns to Phase A, where its pre-D10 ordering already put it (recorded in
`docs/fix/README.md` section 6); see "Ordering" below for where it actually lands and why.

**Two more user decisions interact, and neither is reversed:**

- **D7 ("Gate tanulja meg") is satisfied by D17, not contradicted.** D7's substance was that the ten
  optional-3D criteria must not count as failures. With the gate gone entirely, nothing counts them.
  The 3D viewer remains unapproved and unbuilt.
- **D12 ("Kapjon saját taskot") stands untouched.** Only the `test:e2e:browsers` script *name* goes;
  the Firefox and WebKit projects, the browser install and **FIX-58** all stay.

### Where the Playwright browser install goes (`docs/fix/README.md` section 6)

With no CI, `npx playwright install firefox webkit` is a **local prerequisite of FIX-58**, run once
by whoever executes that task and recorded with its exit code. It is not a pipeline stage and it is
not a package script — Playwright documents the bare command, and wrapping it would be another alias
this task exists to remove. This task adds no install step anywhere; `FIX-58` is the sole owner, per
its own file.

### The CI deletions — every citation re-confirmed by this task's own read, 2026-09-17

`.github/` does not exist: `ls -la .github` → `ls: .github: No such file or directory`. Six
case-sensitive occurrences of the word `CI` exist in `docs/index.html` today, confirmed with
`grep -c '\bCI\b' docs/index.html` → `6` and `grep -n '\bCI\b' docs/index.html` returning exactly the
six lines below. All six trace back to `docs/spec/testing.md` or `docs/tasks/T02.md` / `T26.md`.

| Location | Confirmed text (re-measured, not trusted from the design) | Action |
|---|---|---|
| `docs/spec/testing.md:107` | `## 7. Planned project commands and CI order` | heading becomes `## 7. Project commands` — this task |
| `docs/spec/testing.md:133` | the paragraph opening `Pipeline: install→version+skill→…` | deleted; replaced by the paragraph in "What to change" item 2 — this task |
| `docs/spec/testing.md:18` | `…CI fails for absent reports, empty source maps, missing manifest entries, NaN/undefined metrics, unknown exclusions or an unreviewed exemption…` | rewritten — this task |
| `docs/tasks/T02.md:50` (T02-AC06) and every mirror of it — `docs/tasks/tasks.json:153-154`, `docs/index.html:2700`, `:2704`, `:2745` | `CI network namespace/firewall permits only the local static host…` | rewritten — **not this task**: **FIX-08** owns that criterion's packet and all four of its mirrors (`FIX-08.md:266-284`), because a mirror is never rewritten by a different commit from its source |
| `docs/tasks/T26.md:41` (T26-AC01) and every mirror of it — `docs/tasks/tasks.json:1478`, `docs/index.html:4002`, `:4006`, `:4038` | `…missing/extra business routes fail CI.` | `fail CI` → `fail the contract suite` — **not this task**: **FIX-13** owns that criterion's packet and all four of its mirrors, on the same rule |
| `docs/index.html:4002` and `:2700` | the lower-cased `data-search` mirrors of T26-AC01 and T02-AC06, which the case-sensitive `grep -c '\bCI\b'` sweep does not see | **FIX-13** and **FIX-08** respectively; they are named here so this task's sweep is not mistaken for complete |
| `docs/index.html:5224` | the `testing.md:18` mirror, re-measured at this exact line 2026-09-17 | same rewrite as `testing.md:18` — **this task** |
| `docs/index.html:5279-5301` | the whole mirror of section 7, re-measured at this exact range 2026-09-17 | replaced — **this task** |

**One CI reference outside `docs/` is named here as a defect, not acted on.**
`playwright.config.ts:23` states that "the CI workflow sets both so the network namespace sees only
the local origin" — no such workflow exists or ever has. **D19 item 5 settles it: FIX-58 deletes the
clause**, because that file already owns `playwright.config.ts` for the Firefox and WebKit projects.
This task touches nothing outside `docs/`.

**The prohibition on creating a `.github/` directory carries forward, reworded.** The pre-D17 text of
this file forbade creating `.github/` "because `testing.md:133` describes a pipeline order, not a CI
provider, and no task in this package is titled for CI" (recorded in `docs/fix/README.md` section 6). Under D17 the
reason is no longer a deferral — it is the user's own decision: *"semmilyen ci nem kell azokat
torold"* ("no CI of any kind is needed, delete those") (**D17**). No task in this package, this one
included, creates `.github/` or any CI workflow file.

### `verify:release` was specified as a gate expected to fail — quoted as the clearest evidence for D17

This task's own pre-D17 text specified the aggregate gate this way, and it is worth keeping as the
single artefact `docs/fix/README.md` section 6 singles out:

> **This command is expected to exit non-zero today, and that is correct.** Six of the gates it
> chains are red at baseline for reasons other tasks own… An aggregate gate that passes while its
> members fail would be the defect, not the fix.

*(this task's own pre-D17 text, recorded in `docs/fix/README.md` section 6)*. A gate that is
specified to be red is not a gate; it is the shape of the over-engineering the user named.
`verify:release` is not recreated under D17.

## What to change

### 1. `package.json` — prune the `scripts` block to exactly the eleven survivors

The block must contain exactly these eleven keys when this task's commit lands, **in this
order**, with no other key present. The order is not cosmetic: the ten survivors already
sit in it, and `build:e2e` is the one key this task adds, so appending it **last** leaves
every surviving line byte-identical and makes the commit's `scripts` diff exactly eight
removed lines and one added line — which is what **FIX-47-AC02** checks. Put `build:e2e`
anywhere earlier and `api:drift` stops being the last entry, loses its trailing comma,
and appears in the diff as a changed line, failing AC02 on an otherwise correct
execution:

```json
    "ng": "ng",
    "start": "ng serve",
    "build": "ng build",
    "watch": "ng build --watch --configuration development",
    "test": "ng test",
    "lint": "ng lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "api:generate": "ng-openapi-gen --config ng-openapi-gen.json",
    "api:drift": "npm run api:generate && git diff --exit-code -- src/app/api/generated && test -z \"$(git ls-files --others --exclude-standard -- src/app/api/generated)\"",
    "build:e2e": "ng build --configuration e2e"
```

`api:drift`'s value is **FIX-11**'s, not this task's: FIX-11 replaces
`node scripts/api-drift.mjs` with the two-git-command chain decision **D20 item 1**
settled, and lands before this task. Copy whatever is in `package.json` when this task
runs rather than the string above, and record which of the two it was.

Concretely:

- **Remove** these keys if present at the time this task lands: `contract:validate`, `api:validate`,
  `coverage:manifest`, `coverage:unit:check`, `coverage:e2e:check`, `check:traceability`,
  `check:test-policy`, `test:unit:coverage`. All eight exist in `package.json` today
  (re-measured 2026-09-17, see `package.json:4-20`).
- **Do not add** any of the following, even though `docs/spec/testing.md` names them today: `npm ci`
  (not a script), `verify:toolchain`, `verify:skill`, `api:validate`, `test:unit`, `test:contract`,
  `test:e2e:coverage`, `coverage:e2e:check`, `test:e2e:browsers`, `test:design`,
  `verify:traceability`, `build:demo`, `verify:budgets`, `verify:release`. None of these fourteen
  names may appear in `package.json` after this commit, under this or any other spelling.
- **Add** `build:e2e` with the exact command `ng build --configuration e2e`. No other task adds this
  entry.
- **Do not touch `format` or `format:check`.** If `FIX-03` has already landed, both keys already
  exist with the commands shown above; leave their text exactly as `FIX-03` wrote it. If `FIX-03` has
  not landed, this task does not add them either — see "Ordering" below for why that should not
  happen. **If `FIX-03` has not landed when this task is picked up, stop and report; do not commit.**
  `FIX-47-AC01` requires exactly eleven names including `format` and `format:check`, and this task
  has no way to produce that state on its own.
- **Do not touch `api:drift`'s command value.** Leave it exactly as it is at the moment this task
  lands, whether that is still `node scripts/api-drift.mjs` or already
  `npm run api:generate && git diff --exit-code -- src/app/api/generated` because `FIX-11` landed
  first. This task's job is only that the **key** `api:drift` exists; the **value** is `FIX-11`'s to
  set, in its own commit, never this one.
- Do not reorder or otherwise edit `ng`, `start`, `build`, `watch`, `test`, `lint`, `api:generate` —
  their keys and values are untouched.
- Do not touch `engines`, `dependencies`, `devDependencies`, `name`, `version`, `private` or
  `packageManager`. This commit's diff is the `scripts` block only.

### 2. `docs/spec/testing.md` — the exact replacement text (`docs/fix/README.md` section 6)

Four edits, all inside `docs/spec/testing.md`. Line numbers below were re-measured against the
current file on 2026-09-17 and must be re-confirmed by content immediately before editing, since a
sibling task's edit could shift them.

**Edit A — `:9`, first sentence of the paragraph only; the rest of the paragraph is untouched.**

Current:

> The denominator is explicit and version-controlled in docs/mi-bolt/spec/coverage-policy.json and a generated source inventory.

Replace with, verbatim:

> The denominator is explicit and version-controlled in the `coverageInclude` and `coverageExclude` options of the `test` target in `angular.json`.

This line also carries a `docs/mi-bolt/spec/` path prefix that a different task's sweep would
otherwise touch; that sweep must skip this specific line, because this edit removes the wrong prefix
along with the whole sentence it sits in. State this in the commit body so the two edits do not
collide if they land close together.

**Edit B — `:18`, the whole paragraph.**

Current:

> Any new file or changed coverage boundary needs an explicit classification. CI fails for absent reports, empty source maps, missing manifest entries, NaN/undefined metrics, unknown exclusions or an unreviewed exemption. No coverage-ignore pragmas or arbitrary green thresholds.

Replace with, verbatim:

> Any new file or changed coverage boundary needs an explicit classification. A coverage run with an absent report, an empty source map, a NaN or undefined metric, an unknown exclusion or an unreviewed exemption is not evidence, and the task that produced it records that rather than a percentage. No coverage-ignore pragmas or arbitrary green thresholds.

**Edit C — `:45`, the whole paragraph.**

Current:

> The additional source-manifest checker enforces per-file/unvisited-file coverage; do not assume a globally passing runner does that automatically. This is planned configuration to validate in T02 against the selected CLI schema, not a claim it was run here.

Replace with, verbatim:

> Set `coverageThresholds.perFile` to `true` beside the four 100 values, so each file is measured against the threshold rather than the project aggregate, and leave the runner's `coverage.all` on so an unimported file appears in the report with zero execution instead of being absent from it. The builder exits non-zero when a threshold is unmet. This is planned configuration to validate in T02 against the selected CLI schema, not a claim it was run here.

**Edit D — `:53`, first sentence of the paragraph only; the rest of the paragraph is untouched.**

Current:

> Closed-world network checks combine MSW's unhandled/response events, expected operation ownership, browser CSP and isolated runner network namespace/firewall (dependencies and browser executables provisioned earlier).

Replace with, verbatim:

> Closed-world network checks combine MSW's unhandled/response events, expected operation ownership and browser CSP.

**Edit E — `:55-57`, delete these two paragraphs in full (a blank line separates them).** This is ON,
settled by `D19` item 1: the user removed the separate E2E source-coverage requirement, so this is a
deletion, not a conditional. The two paragraphs open "E2E code coverage uses Chromium native JS
coverage…" and "T02 is a HARD prerequisite: if V8 source mapping…"; delete both, leaving no
replacement text and no blank-paragraph gap wider than the rest of the document's spacing.

**Edit F — `:107-133`, replace the whole of section 7 with, verbatim.** The replacement text itself
contains a nested fenced code block, so the outer fence below uses **four** back-ticks
(`` ```` ``) precisely so a Markdown renderer does not close it early at the inner three-back-tick
fence; when applying this edit to `docs/spec/testing.md`, write only the inner content, with the
inner fence as plain triple back-ticks exactly as shown:

````
## 7. Project commands

Implement these exact package scripts in their owning tasks; they are not commands claimed executed for an absent app:

```text
npm ci
npm run lint              ng lint — TS, templates, and the test-policy rules
npm run test              ng test — Vitest through @angular/build:unit-test, with coverage and per-file 100% thresholds
npm run build              ng build — the optimized production artifact
npm start                 ng serve — the local development server
npm run build:e2e         ng build --configuration e2e — the artifact the Playwright static host serves
npm run api:generate      ng-openapi-gen --config ng-openapi-gen.json
npm run api:drift         api:generate, then git diff --exit-code on the generated SDK
npm run format            prettier --write .
npm run format:check      prettier --check .
npx playwright test       the E2E suite: the Chromium, Firefox and WebKit projects
```

There is no CI pipeline and no aggregate release gate. Each command is run directly by whoever does the work, and its exit code is recorded in that task's evidence under docs/mi-bolt/execution/. Two of the checks are configuration rather than commands of their own: bundle budgets are the Angular CLI's own `budgets` array in the `production` build configuration of angular.json, so `ng build` enforces them, and unit coverage thresholds are the `@angular/build:unit-test` builder's own `coverageThresholds`, so `ng test` enforces them. Browser tests use a local STATIC host, not a business backend. Unexpected console/schema/network errors fail immediately; scenario-expected failures are explicitly asserted.
````

Two sentences from the deleted `:133` are deliberately not carried over into the replacement, and the
commit body must say why: *"Parallelize only independent jobs after their prerequisites"* is a
CI-scheduler instruction with no pipeline left to schedule, and *"Final suite repeats 3 times with
retries disabled and reordered scenarios"* is an invented repeat count
(`.claude/rules/planning-deliverables.md`: an agent-chosen number is a proposal and never a gate)
describing a CI flake hunt. Playwright's own `--repeat-each` flag remains available to anyone who
wants a repeat run.

**Edit G — `:137` (inside §8, Required evidence), one phrase only.** Replace `unit/E2E coverage
source manifests` with `the unit coverage report`, leaving the rest of the sentence and paragraph
untouched.

### 3. `docs/index.html` — the mirror edits (`docs/fix/README.md` section 6)

Line numbers below were re-measured against the current file on 2026-09-17 with
`grep -n 'T02-AC06\|T26-AC01\|Planned project commands and CI order\|…'`; re-confirm by content
before editing, since a sibling task's edit shifts everything after it.

**Edit A — `:5279-5301`, replace the whole mirror of section 7 with the HTML form of item 2 Edit F,**
in the same `<h2>` / `<p>` / `<pre><code class="language-text">` / `<p>` shape the document already
uses:

```html
<h2>7. Project commands</h2>
<p>Implement these exact package scripts in their owning tasks; they are not commands claimed executed for an absent app:</p>
<pre><code class="language-text">npm ci
npm run lint              ng lint — TS, templates, and the test-policy rules
npm run test              ng test — Vitest through @angular/build:unit-test, with coverage and per-file 100% thresholds
npm run build              ng build — the optimized production artifact
npm start                 ng serve — the local development server
npm run build:e2e         ng build --configuration e2e — the artifact the Playwright static host serves
npm run api:generate      ng-openapi-gen --config ng-openapi-gen.json
npm run api:drift         api:generate, then git diff --exit-code on the generated SDK
npm run format            prettier --write .
npm run format:check      prettier --check .
npx playwright test       the E2E suite: the Chromium, Firefox and WebKit projects
</code></pre>
<p>There is no CI pipeline and no aggregate release gate. Each command is run directly by whoever does the work, and its exit code is recorded in that task's evidence under docs/mi-bolt/execution/. Two of the checks are configuration rather than commands of their own: bundle budgets are the Angular CLI's own <code>budgets</code> array in the <code>production</code> build configuration of angular.json, so <code>ng build</code> enforces them, and unit coverage thresholds are the <code>@angular/build:unit-test</code> builder's own <code>coverageThresholds</code>, so <code>ng test</code> enforces them. Browser tests use a local STATIC host, not a business backend. Unexpected console/schema/network errors fail immediately; scenario-expected failures are explicitly asserted.</p>
```

**Edit B — `:5224`, replace the `<p>` with:**

```html
<p>Any new file or changed coverage boundary needs an explicit classification. A coverage run with an absent report, an empty source map, a NaN or undefined metric, an unknown exclusion or an unreviewed exemption is not evidence, and the task that produced it records that rather than a percentage. No coverage-ignore pragmas or arbitrary green thresholds.</p>
```

**This task edits no acceptance-criterion text in `docs/index.html`.** The T02-AC06
mirrors (`:2700`, `:2704`, `:2745`) belong to **FIX-08** and the T26-AC01 mirrors
(`:4002`, `:4006`, `:4038`) to **FIX-13**, in each case in the same commit as the
`docs/tasks/Txx.md` line they mirror, because a mirror rewritten by a different commit
from its source leaves the document contradicting itself for however long the two commits
are apart. This task's only `docs/index.html` edits are Edit A (`:5279-5301`, the mirror
of `docs/spec/testing.md` section 7) and Edit B (`:5224`, the coverage-exemption
paragraph). It does not open, read for editing, or wait on `docs/tasks/T02.md`,
`docs/tasks/T26.md` or `docs/tasks/tasks.json`.

## Out of scope

- **Deleting any `scripts/*.mjs` file.** `scripts/` holds fourteen files — eleven `.mjs` and three
  `.spec.mjs` siblings. Ten of the eleven are gates and each goes with the task that owns its subject
  (`docs/fix/README.md` section 6), so no commit bundles a wiring change with a behaviour change:

  | File | Owner |
  |---|---|
  | `api-drift.mjs` | **FIX-11** |
  | `check-budgets.mjs` | **FIX-40** |
  | `check-coverage.mjs` | **FIX-08** |
  | `check-operation-parity.mjs` | **FIX-13** |
  | `check-test-policy.mjs` | **FIX-46** |
  | `check-traceability.mjs` | **FIX-39** |
  | `runtime-manifest.mjs` | **FIX-08** |
  | `serve-static.mjs` | kept — it is `playwright.config.ts`'s `webServer` command, not a gate |
  | `validate-contract.mjs` + `.spec.mjs` | **FIX-13** |
  | `verify-skill-evidence.mjs` + `.spec.mjs` | **FIX-38** |
  | `verify-toolchain.mjs` + `.spec.mjs` | **FIX-05** |

  This task's `git diff --staged --name-only` must not list any path under `scripts/`.
- **`docs/tasks/T02.md` and `docs/tasks/T26.md`, and every mirror of either, `docs/index.html`
  included.** These packet files, the matching `docs/tasks/tasks.json` entries, and the
  `docs/index.html` spans that mirror them (`:2700`, `:2704`, `:2745` for T02-AC06; `:4002`,
  `:4006`, `:4038` for T26-AC01) all belong to whichever task edits that packet for its own
  reason — **FIX-08** for T02, **FIX-13** for T26 (`docs/fix/README.md` section 6) — because a
  mirror is never rewritten by a different commit from its source. This task edits no criterion
  text anywhere in `docs/index.html`; its only edits to that file are Edit A and Edit B (item 3).
- **`angular.json`.** The `coverageThresholds` addition (`perFile: true` beside the four `100`
  values) is entirely **FIX-08**'s, in its own commit against its own file. This task never opens
  `angular.json`.
- **The `api:drift` command's value.** `FIX-11` rewrites it and deletes `scripts/api-drift.mjs` in one
  commit. This task only guarantees the key exists; see "What to change" item 1.
- **The Playwright browser install.** `npx playwright install firefox webkit` is **FIX-58**'s local
  prerequisite, recorded in its own evidence with its own exit code. This task adds no install step.
- **`playwright.config.ts`.** The false CI-workflow clause at `:23` is **FIX-58**'s to delete, per
  **D19** item 5, because that file already owns the Firefox/WebKit project work in the same file.
  This task touches nothing outside `docs/`.
- **Creating a `.github/` directory or any CI workflow file.** Never, by this task or any other in
  this package — the user's decision is that none is wanted, not that one is deferred.
- **Fixing any gate that a pruned or surviving script now reveals as red.** `npm run lint` never runs
  (**FIX-01**), `npm run test` fails 14/14 files (**FIX-04**), `npx playwright test` has 41 failures
  (**FIX-09**). This task changes no gate's behaviour, only which names exist.
- **The three `scripts/*.spec.mjs` files and any `test:scripts` entry.** The pre-D17 design of this
  task added `test:scripts` to run them with `node --test`; under D17 all three test files are
  deleted along with the scripts they test (**FIX-05**, **FIX-13**, **FIX-38** each delete their own
  pair), so nothing survives for a `test:scripts` entry to run and none is created.

## How to verify

Run these from the repository root. The package manager is **npm 11.17.0**; there is no pnpm and no
mise in this repository.

**Step 1 — before editing, record the baseline.**

```bash
node -e "console.log(Object.keys(require('./package.json').scripts).sort().join('\n'))"
```

Record the full output verbatim; its content depends on which other Phase A tasks have already
landed and is not asserted here — see "Ordering" in the Commit section for what it should already
contain.

**Step 2 — after editing `package.json`, verify the final key set.**

```bash
node -e "console.log(Object.keys(require('./package.json').scripts).sort().join('\n'))"
```

Expected output, exactly, one name per line, alphabetically sorted:

```
api:drift
api:generate
build
build:e2e
format
format:check
lint
ng
start
test
watch
```

**Step 3 — verify `docs/spec/testing.md`.**

```bash
grep -n '\bCI\b' docs/spec/testing.md
grep -ohE 'npm run [a-z0-9:_-]+' docs/spec/testing.md | sort -u
grep -c 'HARD prerequisite' docs/spec/testing.md
grep -c 'docs/mi-bolt/spec/coverage-policy.json' docs/spec/testing.md
```

**The first command returns exactly one line, not zero: `There is no CI pipeline and no aggregate
release gate.` — the opening sentence of the new section 7's second paragraph, item 2 Edit F.** This
is a correction to the pre-D17 design (`docs/fix/README.md` section 6), whose own verify step claimed
this grep "returns nothing" after the same edit it specifies; the replacement text it itself quotes
contains the word "CI" inside that very sentence, so the design's own verify command would have
failed against the design's own replacement text. The sentence is the correct, intended one — it is what states that no CI exists,
which is D17's whole point — so it is kept and the check is corrected to expect it rather than
dropped. If `grep -n '\bCI\b' docs/spec/testing.md` returns a second line, or a different first line,
that is a real defect and must be reported, not folded into this expectation.

The second command returns exactly eight lines, each prefixed `npm run `, sorted: `npm run api:drift`,
`npm run api:generate`, `npm run build`, `npm run build:e2e`, `npm run format`, `npm run format:check`,
`npm run lint`, `npm run test`. `npm start` and `npx playwright test` do not match the `npm run` pattern,
which is why they are absent from this list despite being real lines in the replacement text. The third
returns `0` (Edit E removed the paragraph that phrase was in). The fourth returns `0` (Edit A removed
the only occurrence).

**Step 4 — verify `docs/index.html`.**

```bash
grep -c '\bCI\b' docs/index.html
grep -ohE 'npm run [a-z0-9:_-]+' docs/index.html | sort -u
grep -c 'fail CI' docs/index.html
```

**The first returns `1`, not `0`, for the same reason step 3 explains: the mirrored "There is no CI
pipeline and no aggregate release gate." sentence (item 3 Edit A) contains the word "CI" by design,
stating its absence.** The second returns the same eight lines step 3's second command returns. The
third returns `0`.

**Step 5 — no scripts/*.mjs file touched.**

```bash
git status --short scripts/
```

Returns nothing (empty output) for this commit — this task's own edits, before staging anything
else. If it prints anything, a sibling task's uncommitted work is in the tree; do not stage it and do
not remove it.

**Step 6 — regression.**

```bash
git diff --staged --name-only
```

Lists exactly three paths: `package.json`, `docs/spec/testing.md`, `docs/index.html`. Nothing under
`docs/tasks/`, `scripts/`, `angular.json` or `playwright.config.ts`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

**This task edits three files — `package.json`, `docs/spec/testing.md`, `docs/index.html` — and
the third of them is a rendered deliverable, so this task is not exempt.** `docs/index.html` is
the project's interactive HTML report, and Edit A replaces a whole `<h2>` + `<p>` +
`<pre><code class="language-text">` + `<p>` block inside it (`:5279-5301` on `db6d295`, in the
`id="quality"` section the sidebar labels **100% és elfogadás**). `.claude/rules/browser-verification.md`
covers *"generated HTML deliverables"* in its opening paragraph and carries a dedicated
`### HTML report verification` subsection; `FIX-36-AC08` already treats this same file as not
exempt. A malformed `<pre><code>` or a leaked `<` in the replacement text would pass every grep
this task runs and would be visible only in a browser, which is precisely what the criterion
below is for. **AC11 is that check**, scoped to the block this task replaces — the whole-page
sweep (all eight sections, every internal `href`, the previews) is `FIX-36-AC08`'s and is not
repeated here.

`package.json` and `docs/spec/testing.md` reach no rendered surface and need no check of their
own.

- **R26 applies**: the commit body must identify the files changed, the checks run with their exit
  codes or grep results, the deviation from the pre-D17 design (the "run this task first" ordering is
  dropped and why), and the actual remaining limitations (eleven scripts is the survivor count; the
  gates that stay red are named in "Out of scope"). AC09 requires it.
- R01–R25: N/A. The change removes `package.json` entries, rewrites specification prose and its
  static-site mirror, and adds one `package.json` entry whose command already exists as a first-party
  Angular build configuration. It touches no brand asset, imagery, layout, spacing, colour, type
  scale, copy, price field, data source, provider, variant, filter, state machine, target size,
  breakpoint, dialog, persistence or offer.

## Acceptance criteria

- [ ] **FIX-47-AC01** `node -e "console.log(Object.keys(require('./package.json').scripts).sort().join('\n'))"`
      prints exactly eleven names, sorted: `api:drift`, `api:generate`, `build`, `build:e2e`,
      `format`, `format:check`, `lint`, `ng`, `start`, `test`, `watch`. No twelfth name, no missing
      name. Record the before-edit and after-edit output. This criterion requires `format` and
      `format:check` to already exist, which requires `FIX-03` to have landed — see "What to change"
      item 1 above: if it has not, stop and report; do not commit.
- [ ] **FIX-47-AC02** `git diff --staged package.json` shows exactly **nine** changed lines
      inside the `scripts` block and nothing outside it: eight removals — the eight keys
      named in "What to change" item 1 — and one addition,
      `"build:e2e": "ng build --configuration e2e"`, as the **last** entry, after
      `api:drift`. No line for any of the ten surviving keys `ng`, `start`, `build`,
      `watch`, `test`, `lint`, `format`, `format:check`, `api:generate` or `api:drift`
      appears in the diff at all: none of those ten lines' text changed, trailing comma
      included. If `api:drift`'s line appears as changed, `build:e2e` was inserted before
      it instead of after it and took `api:drift`'s trailing comma with it — move the new
      key to the end rather than accepting the diff.
- [ ] **FIX-47-AC03** `grep -n '\bCI\b' docs/spec/testing.md` returns exactly one line — `There is no
      CI pipeline and no aggregate release gate.`, the opening sentence of item 2 Edit F's second
      paragraph — and no other line; and `grep -ohE 'npm run [a-z0-9:_-]+' docs/spec/testing.md | sort -u`
      returns exactly eight lines: `npm run api:drift`, `npm run api:generate`, `npm run build`,
      `npm run build:e2e`, `npm run format`, `npm run format:check`, `npm run lint`, `npm run test`.
- [ ] **FIX-47-AC04** `grep -c 'HARD prerequisite' docs/spec/testing.md` and
      `grep -c 'docs/mi-bolt/spec/coverage-policy.json' docs/spec/testing.md` both return `0`.
- [ ] **FIX-47-AC05** `grep -in '\bCI\b' docs/index.html` — the case-**insensitive** form,
      because two of this file's CI mentions live lower-cased inside `data-search`
      attributes and the case-sensitive form does not see them — prints only lines of these
      three kinds, and the commit body lists every hit with its kind and its owner:
      (a) the one `npm ci` line inside the section-7 command block Edit A wrote;
      (b) the one `There is no CI pipeline and no aggregate release gate.` sentence Edit A
      wrote, matching FIX-47-AC03; (c) a `T02-AC06` mirror (**FIX-08** owns `:2700`,
      `:2704`, `:2745`) or a `T26-AC01` mirror (**FIX-13** owns `:4002`, `:4006`, `:4038`)
      that its owner has not yet rewritten. No hit matches `CI order`, no hit matches
      `CI fails`, and no hit falls inside the coverage-exemption paragraph Edit B wrote.
      The measured baseline for this grep before this task runs is `9` hits, at
      `:2700 :2704 :2745 :4002 :4006 :4038 :5224 :5279 :5281`. And
      `grep -ohE 'npm run [a-z0-9:_-]+' docs/index.html | sort -u` returns the same eight
      lines as FIX-47-AC03.
- [ ] **FIX-47-AC06** `docs/index.html:5224` reads the exact replacement text given in "What to
      change" item 3, Edit B — the coverage-exemption paragraph mirroring
      `docs/spec/testing.md:18`. Quote the edited span in the evidence record. This task edits no
      T02-AC06 or T26-AC01 span in `docs/index.html`; those belong to **FIX-08** and **FIX-13**
      respectively (see "What to change" item 3 and "Out of scope").
- [ ] **FIX-47-AC07** `git diff --staged --name-only` lists exactly `package.json`,
      `docs/spec/testing.md`, `docs/index.html` — nothing under `docs/tasks/`, no `scripts/*` path,
      no `angular.json`, no `playwright.config.ts`.
- [ ] **FIX-47-AC08** `git status --short scripts/` is empty for this task's own changes: no
      `scripts/*.mjs` file was deleted, moved or edited by this commit.
- [ ] **FIX-47-AC09** The commit body records, as named items rather than asides: the eleven
      survivors and the D19 count correction; that `api:drift`'s value is untouched and why
      (**FIX-11** owns it); that the "run this task first" ordering from the pre-D17 text is dropped
      and why (`docs/fix/README.md` section 6); the two sentences dropped from the old `:133` pipeline
      paragraph and why neither is carried over; that `verify:release` was specified as a
      gate expected to fail and is not recreated; and the correction to the pre-D17 design's verify
      step (`docs/fix/README.md` section 6) recorded in "How to verify" steps 3 and 4 — the
      replacement text's own "There is no CI
      pipeline…" sentence leaves one intentional `CI` occurrence in each of `docs/spec/testing.md`
      and `docs/index.html`, not zero.
- [ ] **FIX-47-AC10** `npm run build` exits `0` after this commit (regression check; the `scripts`
      block prune must not have broken the build script's own entry).
- [ ] **FIX-47-AC11** **Real-browser check of the replaced block in `docs/index.html`.** Through
      the `real-browser-sonnet` agent (`model: sonnet`), not by reading the diff and not from a
      `curl` 200: serve `docs/` with the plain static server named in "How to verify", open
      `index.html` at 1440×900, click the sidebar button `[data-section="quality"]` labelled
      **100% és elfogadás**, and record:
      (a) a `take_snapshot` of the replaced block showing one `<h2>` whose text is the new
      heading, one `<pre>` containing one `<code>`, and **exactly eleven** command lines
      inside it — `npm ci`, `npx playwright test` and the eight `npm run` lines `FIX-47-AC03`
      counts — with no HTML tag rendered as literal text and no stray `<` or `&` anywhere in
      the block;
      (b) a `take_screenshot` of that block;
      (c) `list_console_messages` returning **zero errors**;
      (d) that the section still scrolls to `<h2>8. Required evidence</h2>` immediately after
      the replaced block, so nothing was consumed by an unclosed tag.
      Per `.claude/rules/browser-verification.md`, an HTTP 200 from `curl`, a file-exists check,
      a grep over the file or a read of the diff is explicitly **not** this criterion.

      `FIX-36-AC08` sweeps the whole page; this criterion covers only what this task changed,
      and neither replaces the other.

## Commit

This task is exactly one commit touching three files: `package.json`, `docs/spec/testing.md`,
`docs/index.html`. Do not bundle it with any other FIX task — in particular not with **FIX-03**,
**FIX-05**, **FIX-08**, **FIX-11**, **FIX-13**, **FIX-36b**, **FIX-38**, **FIX-39**, **FIX-40**,
**FIX-46** or **FIX-58**, each of which owns its own `package.json`, `angular.json`, `scripts/` or
`docs/tasks/` edit and must stay separately reviewable. Do not commit until every acceptance
criterion above has passed and its output is recorded.

**Ordering — this task runs in Phase A, after FIX-01, FIX-04 and FIX-06, after FIX-03, and after
FIX-36b.** This is a change from the pre-D17 text, which ran this task first for a rename that no
longer happens (see "Why `verify:traceability` does not survive" above). The reason for the new
ordering: `test:unit:coverage` is **the only currently-green unit command** in the repository today
(`docs/fix/README.md` section 6: "Exits GREEN while reporting Statements 56.42%"), and this task
removes it. Removing it before `ng test` actually passes — which is **FIX-01**'s and **FIX-04**'s
work, followed by **FIX-06**'s co-location of the contract specs so `ng test` collects everything —
would leave the repository with no working unit command at all in the window between. `FIX-03` should
also have landed first, so `format` and `format:check` already exist and this task's package.json
edit only ever removes and adds, never collides with a sibling adding the same two keys. **FIX-36b**
must also have landed first: `FIX-36b-AC02` requires the tree-wide `docs/mi-bolt/` count to still read
`1`, that one hit being `docs/spec/testing.md:9` — this task's Edit A rewrites that line, and landing
first would drop the count to `0` and fail a criterion that is not this task's to satisfy. If any of
FIX-01, FIX-03, FIX-04, FIX-06 or FIX-36b has not landed when this task is picked up, land it first;
do not reorder around this task instead.

Because several FIX tasks edit the same `scripts` block, **read `git status` and
`git diff package.json` immediately before staging**, and stage `package.json`,
`docs/spec/testing.md` and `docs/index.html` explicitly by path, per
`.claude/rules/session-lifecycle.md` ("Commits"). If a sibling's entry is already in the working
tree, do not carry it into this commit and do not remove it.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
build: prune the npm scripts to the stack's standard commands and delete the CI text
```
