# FIX-46 — Move the test-policy check into ESLint and delete the bespoke gate

Status: BLOCKED — not executed. FIX-46-AC00 requires FIX-39 to have landed (`scripts/check-traceability.mjs` absent, zero `test.skip(` calls in `tests`/`e2e`/`src`). Measured on this run's final commit: the file still exists and 13 `test.skip(` calls remain. FIX-39 is out of scope for this session, so per the orchestrating instructions this task stops here and is reported BLOCKED with these counts rather than forced.
Severity: blocker
Source: A5 (test-suite sweep), A7 (governance sweep); superseded by decision **D17** (the
plan was over-engineered: standard scripts, no bespoke gates) and its narrowing answer
**D19 item 2**, both dated 2026-09-17.

## Why this is wrong

`scripts/check-test-policy.mjs` is a hand-written gate that reads `tests/` and `e2e/` for
a skipped, focused or quarantined test and exits 1 when it finds one. It enforces
`docs/spec/coverage-policy.json:55-63`, whose `forbidden` array names `"skip/todo/only"` as
its second entry, and it backs `docs/tasks/T27.md`'s **T27-AC05** ("no skip/todo/only,
flaky quarantine or lowered threshold") and **T27-AC06** ("every deliberate failure
expected by a scenario is asserted"). Before D17 this task was going to repair three
defects in that script: it never scanned `src/`, it reported one finding per pattern per
file instead of per occurrence (`String.prototype.match` with no `/g` flag), and the line
number it printed was computed against comment-stripped text and pointed at the wrong
line — `e2e/a11y/keyboard.spec.ts:77` is a helper's parameter, not a `test.skip(` call.

**D17 does not ask for that script to be repaired. It asks for it to not exist.** The
user's words: *"nem kell ennyi script es npm parancs sem, standardek kellenek lint, test,
coverage stb, plan tul lett tervezve javitasd"* ("this many scripts and npm commands are
not needed either; standards are what is needed — lint, test, coverage and so on; the plan
was over-engineered, fix it"). `docs/spec/testing.md:118` already says the requirement
belongs inside `npm run lint` — *"TS/templates/boundaries/test-policy lint"* — and the
repository built a separate script instead of putting it there. The three defects above
are no longer something to fix; they are evidence that the bespoke tool was the wrong
instrument, and this task does not repair any of them.

**The requirement survives.** No `skip`, `only`, `todo` or `fixme` in a committed spec is
still what T27-AC05 and T27-AC06 require, and core ESLint's `no-restricted-syntax` rule
expresses it with **no new dependency** — the alternative, `eslint-plugin-vitest` plus
`eslint-plugin-playwright`, would add two, and D17's own charter is fewer scripts and
fewer invented tools, not a different invented tool.

**This task must land after `FIX-39`.** `FIX-39` removes the thirteen existing
`test.skip(` call sites across `e2e/a11y/keyboard.spec.ts`,
`e2e/design/state-matrix.spec.ts` and `e2e/design/viewport-matrix.spec.ts`. Until it has
landed, this task's ESLint rule would fire on every one of those thirteen call sites and
`npm run lint` could never exit 0 — the same shape as `FIX-07` running before `FIX-08`
elsewhere in this package. Do not start this task until `FIX-39`'s commit is on the branch;
**FIX-46-AC00** below is the check.

**`docs/spec/coverage-policy.json` stays, and the reason has to be on record.** The design
that produced this rewrite recommended deleting it once its only reader was gone. **The
user did not choose that** (decision **D19 item 2**). This task still moves the
`"skip/todo/only"` rule into ESLint and still deletes `scripts/check-test-policy.mjs`, but
`docs/spec/coverage-policy.json` remains in the tree with its `forbidden` list intact.
Nothing may delete that file later on the grounds that nothing reads it — this paragraph is
the record that the user was asked and kept it anyway.

## Evidence

### 1. The rule the gate enforces is already declared as ESLint's job

`docs/spec/testing.md:118` reads, today:

```
npm run lint                     TS/templates/boundaries/test-policy lint
```

`FIX-47` rewrites that section and its replacement text for this line is
`npm run lint              ng lint — TS, templates, and the test-policy rules`. Either
wording says the same thing about this task: the test-policy rules belong inside
`npm run lint`, which is why this task moves them there and why What to change item 2 widens
`lintFilePatterns` so the command actually reaches them.

### 2. `docs/spec/coverage-policy.json:55-63` — the rule this task moves

```json
  "forbidden": [
    "coverage-ignore pragmas",
    "skip/todo/only",
    "silent reduced thresholds",
    "unit+e2e counter merging",
    "calling internal business functions from page.evaluate to increase E2E counters",
    "deleting defensive code solely to evade meaningful behavior tests",
    "using 100% passing tests as a synonym for 100% source coverage"
  ],
```

Only `"skip/todo/only"` (the second entry) is what a static lint rule can catch; the other
six describe run-time or review-time practices and are untouched by this task.

### 3. The gate as it exists today — measured on commit `db6d295`

```text
test-policy:FAIL — 6 finding(s) in 3 location(s) across 43 files:
  - e2e/a11y/keyboard.spec.ts:77  it-skip, pw-skip
  - e2e/design/state-matrix.spec.ts:75  it-skip, pw-skip
  - e2e/design/viewport-matrix.spec.ts:119  it-skip, pw-skip
```

`e2e/a11y/keyboard.spec.ts:76` is:

```ts
  url: string,
```

— the second parameter of a helper, not a violation. The real count of `test.skip(` call
sites across those three files is **thirteen**, confirmed with
`grep -n "test\.skip(" e2e/a11y/keyboard.spec.ts e2e/design/state-matrix.spec.ts
e2e/design/viewport-matrix.spec.ts`. All thirteen are `FIX-39`'s to remove, not this
task's, and this task's own ESLint rule only has something to prove once none of them
remain.

### 4. `eslint.config.js` today has no test-policy rule

Read in full (82 lines). It declares a `**/*.ts` block (`:9-52`), a
`src/app/shared/ui/**/*.ts` override (`:58-71`) and a `**/*.html` block (`:72-81`). None of
the three mentions `no-restricted-syntax`, `tests/`, `e2e/` or a spec-file pattern.
`no-restricted-syntax` is a core ESLint rule — it ships with `eslint` itself, no plugin
required, which is why it costs the "no new dependency" claim above nothing to check.

### 5. `package.json` today

```json
    "check:test-policy": "node scripts/check-test-policy.mjs",
```

at `:19` (measured on commit `db6d295`). **This line may already be gone by the time this
task runs.** `FIX-47` prunes `package.json`'s `scripts` block to the eleven survivors in
its own single commit, and `check:test-policy` is not one of the eleven, so `FIX-47`'s
commit removes this line whether or not `scripts/check-test-policy.mjs` has been deleted
yet — the file and its npm entry have two different owners on purpose, per the design's
own rule that "no commit bundles a wiring change with a behaviour change." What to change
item 4 below covers both orderings.

## What to change

### 1. `eslint.config.js` — add the test-policy rule as a new block

Insert after the `**/*.html` block, i.e. after line 81 (`  },`) and before line 82
(`]);`):

```js
  {
    // Moved here from the deleted scripts/check-test-policy.mjs (D17), which
    // enforced docs/spec/coverage-policy.json's "skip/todo/only" entry by
    // hand. T27-AC05 and T27-AC06 are the requirement; this is the standard
    // tool for it.
    //
    // These trees are in no tsconfig (tsconfig.app.json and tsconfig.spec.json
    // both include only src/), so type-aware linting is switched off for them
    // — otherwise FIX-02's `projectService: true` fails on every file here.
    files: ['tests/**/*.ts', 'e2e/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    // The selector keys on the METHOD name only. Keying on
    // callee.object.name — the obvious form — silently misses
    // test.describe.skip(, test.step.skip( and every other nested member
    // expression, because esquery's attribute matcher requires the resolved
    // path to be a string and an inner MemberExpression has no `name`
    // (node_modules/esquery/dist/esquery.js:3996-4001). Matching on the
    // property alone is depth-independent, which is the whole point.
    files: ['tests/**/*.ts', 'e2e/**/*.ts', 'src/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.type='Identifier'][callee.property.name=/^(skip|only|todo|fixme|fails|failing|skipIf|runIf)$/]",
          message:
            'No .skip / .only / .todo / .fixme / .fails / .skipIf / .runIf in a committed spec, at any chain depth — this catches test.describe.skip() and test.step.skip() too (T27-AC05, T27-AC06).',
        },
        {
          selector:
            "CallExpression[callee.type='Identifier'][callee.name=/^x(describe|it|test)$/]",
          message:
            'No xdescribe / xit / xtest in a committed spec (T27-AC05, T27-AC06).',
        },
      ],
    },
  },
```

`tseslint` is already required at `eslint.config.js:4`; no new import and no new dependency.

**The first selector's shape was derived from esquery's source, not guessed, and the proof
is still mandatory.** `node_modules/esquery/dist/esquery.js:3996-4001` shows that a regex
attribute match requires `getPath(node, path)` to be a string, so `callee.object.name` is
`undefined` for `test.describe.skip(` and a selector written that way cannot fire on
Playwright's most common suppression form. Keying on `callee.property.name` alone is what
makes the rule depth-independent. `FIX-46-AC02` requires the executor to prove every one of
the eleven forms listed in How to verify Step 1 actually trips the rule, with the command and
its output recorded, before claiming the rule replaces the gate. If a form does not fire, fix
the selector here and re-run the proof — do not report the rule as working because it looks
right.

**The broad selector is deliberate.** It will also flag an unrelated `.skip(` or `.only(`
method call in a spec file. Measured on `db6d295`,
`grep -rnE "\.(skip|only|todo|fixme|fails|failing)\s*\(" tests/ e2e/ --include="*.ts"` returns
only the thirteen call sites `FIX-39` removes, and the same grep over `src/**/*.spec.ts`
returns nothing, so there is no such call to flag today. A false positive here is one loud,
obvious error with a message naming the rule; the alternative — a selector narrow enough to
have no false positives — is a rule that silently misses the form the repository actually
used. That trade is the reason for this shape and it is recorded here so a later reader does
not "tighten" it back into the hole.

**What the deleted gate caught and this rule deliberately does not.**
`scripts/check-test-policy.mjs:37-65` carried eighteen regexes. Five are not carried over,
each for a stated reason:
- `test.slow(` (`pw-slow`) — a timeout multiplier, not a suppression. `coverage-policy.json`'s
  entry is `"skip/todo/only"` and `.claude/rules/planning-deliverables.md` ("Verification
  apparatus is justified per item") is against banning it on the strength of its old company.
- `quarantine-marker` (`/\b(flaky[_-]?quarantine|quarantine|skipQuarantine)\b/i`) and
  `skip-comment` (`/@(skip|todo|ignore|xfail|fixme)\b/i`) — both match **comment and string
  text**. `no-restricted-syntax` matches AST nodes and cannot see a comment at all, so no
  selector can express these. They are not replaced, and this paragraph is the record that
  they were dropped knowingly rather than overlooked.
- `fdescribe(` / `fit(` — neither is an API in Vitest or in Playwright, and `fit` is a
  plausible ordinary function name; banning it would buy a false-positive class for nothing.
- The bracket form, `test['skip'](…)`, is not caught. Neither was it by the deleted gate,
  whose regexes all required a literal dot, so nothing regresses.

`.fails` / `.failing` and `.skipIf` / `.runIf` **are** carried, and are the two additions over
the old list: a test that asserts its own failure and a test skipped on a condition are both
parked failures under another name, and a conditional skip is exactly the form all thirteen
removed call sites took.

### 2. `angular.json` — widen `lintFilePatterns` so the rule is actually executed

`FIX-01` adds `lintFilePatterns` as a two-element array, `src/**/*.ts` and `src/**/*.html`, and
explicitly defers widening it (`FIX-01.md:115-117`). With that array unchanged, `ng lint` never
visits `tests/` or `e2e/` — and all thirteen violations the deleted gate found were in `e2e/`.
**A rule no command executes has not replaced a gate; it has removed one.** Widening the array is
therefore this task's own delivery mechanism, not an unrelated config change.

In `projects.mi-bolt.architect.lint.options`, replace the two-element array with:

```json
            "lintFilePatterns": [
              "src/**/*.ts",
              "src/**/*.html",
              "tests/**/*.ts",
              "e2e/**/*.ts"
            ]
```

`src/**/*.spec.ts` needs no entry of its own — `src/**/*.ts` already covers it.

**This widens what `ng lint` sees, and the first run may surface findings in `tests/` and `e2e/`
that no lint has ever reported, because no lint has ever run on this repository
(`BASELINE.md:8`).** `FIX-46-AC05` below says what to do with them: a `no-restricted-syntax`
finding fails this task; any other finding is recorded by `path:rule` in the commit body and
reported, not repaired here — repairing lint violations is `FIX-02`'s subject and `FIX-02` is
scoped to `src/`, so a finding under `tests/` or `e2e/` belongs to nobody in this package and is
named as such.

### 3. Delete `scripts/check-test-policy.mjs`

The whole file. Nothing else in the repository imports it: `grep -rn
"check-test-policy" --include="*.ts" --include="*.mjs" src scripts tests e2e` returns
only the file's own path before this change, and nothing after.

### 4. Remove the `check:test-policy` npm entry — check first

```bash
grep -n '"check:test-policy"' package.json
```

- **If it prints a line**, delete that line from `package.json`'s `scripts` block and, if
  it is not the last entry, remove the trailing comma from the new last line of the block
  instead (or from the newly-last entry, whichever the diff makes cleaner — `package.json`
  must remain valid JSON).
- **If it prints nothing**, `FIX-47` has already removed it as part of pruning to the
  eleven survivors. Record that in the commit body as "already absent, removed by
  FIX-47" rather than treating this item as skipped.

Either way, confirm the same grep returns nothing after this task's commit.

### 5. `docs/spec/coverage-policy.json` — confirm it is untouched

Do not edit this file. Its `forbidden` list stays exactly as quoted in Evidence item 2. The
commit body states, in these terms: *"`docs/spec/coverage-policy.json`'s only reader,
`scripts/check-test-policy.mjs`, is deleted by this commit. The user was asked whether the
file should go with it and answered no (decision D19 item 2); the file stays, unread by
any script, as a record of the policy the ESLint rule above now enforces."*

### 6. `docs/tasks/T27.md` — remove the `check-test-policy.mjs` file reference

**Do this only after confirming `FIX-39` has already landed** (`FIX-46-AC00`). Current
text at `:17-23`:

```
## Files

- `e2e/`
- `tests/`
- `docs/mi-bolt/spec/coverage-policy.json`
- `scripts/check-test-policy.mjs`
```

(`FIX-39`'s own commit has already removed the `scripts/check-traceability.mjs` line
above this one — if that line is still present, stop, `FIX-39` has not landed.)

Replace with:

```
## Files

- `e2e/`
- `tests/`
- `docs/mi-bolt/spec/coverage-policy.json`
```

Leave the wrong `docs/mi-bolt/spec/` prefix on that third line exactly as it is —
**`FIX-36b`** owns correcting every task packet's path prefix to the real flat layout, and
this task does not touch it.

### 7. `docs/tasks/tasks.json:1523-1529` — the same list, mirrored

Current text (after `FIX-39` has already removed the `check-traceability.mjs` entry):

```json
    "files": [
      "e2e/",
      "tests/",
      "docs/mi-bolt/spec/coverage-policy.json",
      "scripts/check-test-policy.mjs"
    ],
```

Replace with:

```json
    "files": [
      "e2e/",
      "tests/",
      "docs/mi-bolt/spec/coverage-policy.json"
    ],
```

### 8. `docs/index.html` — four occurrences, three of them shared lines

Line numbers below were measured on commit `db6d295` and will have moved once `FIX-39`'s
edit to this same file has landed; locate each by the quoted substring, not by the number.

- **The `data-search` attribute** (`:4055` at baseline) contains the same JSON array as
  `tasks.json`, inline, after `FIX-39` has already removed its own entry:
  `..."docs/mi-bolt/spec/coverage-policy.json", "scripts/check-test-policy.mjs"], ...`.
  Delete the substring `, "scripts/check-test-policy.mjs"` (leading comma and space,
  no trailing comma — it is the last element of that array). Confirm the result is still
  valid JSON inside the attribute by checking the array now ends
  `..."docs/mi-bolt/spec/coverage-policy.json"]`.
- **The "Fájlfelelősség" file-list `<div>`** (`:4058` at baseline) contains
  `<code>scripts/check-test-policy.mjs</code>` with no separator before or after it (the
  entries are concatenated `<code>` tags, not a comma-joined list). Delete that one
  `<code>…</code>` element exactly.
- **One standalone `<li>`** (`:4076` at baseline):
  `<li><code>scripts/check-test-policy.mjs</code></li>`. Delete the whole line.

After this task's edit, `grep -c "check-test-policy" docs/index.html` returns `0` and
`grep -c "check-traceability" docs/index.html` also returns `0` (removed by `FIX-39`
already).

## Out of scope

- **The thirteen `test.skip(` call sites and the `built: false` rows in
  `e2e/design/state-matrix.spec.ts`** — `FIX-39` removes all of them, including the two
  rows and the branch that reads them. This task's ESLint rule depends on that removal
  having already happened; it does not perform any part of it.
- **`scripts/check-traceability.mjs` and the unreached-criteria count** — `FIX-39`.
- **The `docs/spec/testing.md` rewrite of section 7** and the survivor script list —
  `FIX-47`.
- **`docs/spec/coverage-policy.json` itself** — stays, per D19 item 2, see What to change
  item 5. No task deletes or edits it.
- **The `docs/mi-bolt/spec/` path prefix** in `docs/tasks/T27.md` and its mirrors —
  `FIX-36b`.
- **`npm run lint`'s other failures.** If lint is still red at baseline for a reason
  `FIX-01` owns, this task does not chase it; `FIX-46-AC05` says how to tell the two
  apart.
- **Adding `eslint-plugin-vitest` or `eslint-plugin-playwright`.** The whole point of
  moving this rule is that core ESLint already expresses it; do not add either package.

## How to verify

Run from the repository root. The package manager is **npm 11.17.0**; there is no pnpm
and no mise in this repository.

**Step 0 — confirm `FIX-39` has landed before touching anything.**

```bash
test -f scripts/check-traceability.mjs && echo "FIX-39 has not landed — stop" || echo "ok"
grep -rnE "\.(skip|only|todo|fixme|fails|failing|skipIf|runIf)\s*\(" tests e2e src --include="*.ts" | wc -l   # expect 0
```

**Step 1 — add the rule and prove it fires, through `npm run lint` itself, before deleting
anything.**

Do not use `npx eslint --stdin`. `FIX-02` sets `parserOptions.projectService: true` on the
`**/*.ts` block, and the project service cannot resolve a `--stdin-filename` that is not on
disk; a real file is also what proves the rule fires through the command
`docs/spec/testing.md:118` says owns it, rather than through a one-off invocation.

Create three temporary fixtures, each containing exactly these eleven lines:

```ts
describe.skip('x', () => {});
describe.only('x', () => {});
it.skip('x', () => {});
it.only('x', () => {});
test.skip('x', () => {});
test.only('x', () => {});
test.todo('x');
test.fixme('x', () => {});
test.skip(true, 'conditional form');
test.describe.skip('x', () => {});
test.describe.only('x', () => {});
xdescribe('x', () => {});
xit('x', () => {});
```

at these three paths, one per `files` glob:

```
tests/zz-test-policy-fixture.ts
e2e/zz-test-policy-fixture.ts
src/app/zz-test-policy-fixture.spec.ts
```

Then:

```bash
npm run lint 2>&1 | grep -c "no-restricted-syntax"   # expect 39 — 13 forms x 3 fixtures
npm run lint 2>&1 | grep "zz-test-policy-fixture" -A 20
```

Record the full output. Every one of the thirteen lines must produce a
`no-restricted-syntax` finding in every one of the three files. **`test.skip(true, 'conditional
form')` needs no selector of its own**: `test.skip('title', fn)` and `test.skip(condition, reason)`
parse to the same `CallExpression` with the same `callee`, so the one selector covers both, and
line 9 is in the fixture to prove it rather than to be caught by something extra.

Then delete all three fixtures and confirm the tree is clean:

```bash
rm tests/zz-test-policy-fixture.ts e2e/zz-test-policy-fixture.ts src/app/zz-test-policy-fixture.spec.ts
git status --short          # must not list any zz-test-policy-fixture path
grep -rn "zz-test-policy-fixture" . --exclude-dir=node_modules --exclude-dir=.git   # nothing
```

A fixture left behind under `src/` is collected by `ng test`; one left under `tests/` or `e2e/`
is linted forever after. Deleting them is part of this step, not an afterthought.

**Step 2 — delete the script and its npm entry.**

```bash
rm scripts/check-test-policy.mjs
grep -n '"check:test-policy"' package.json   # edit or "already absent", per What to change item 4
```

**Step 3 — full lint run.**

```bash
npm run lint
```

Gates that are red for reasons this task does not fix, so the executor does not chase
them: `npm run lint` failing for a reason `FIX-01` owns. If it fails, check whether
`no-restricted-syntax` appears anywhere in the output; if it does not, the failure is
unrelated to this rule and is recorded as `FIX-01`'s.

**Step 4 — the doc edits.**

Apply What to change items 6, 7 and 8, then:

```bash
grep -c "check-test-policy" docs/tasks/T27.md docs/tasks/tasks.json docs/index.html   # each 0
git diff docs/spec/coverage-policy.json   # empty
```

**Step 5 — no-regression check.**

```bash
npm run build
```

Expected exit 0.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

**This task changes an ESLint config file, deletes one Node script, and edits three
documentation mirrors. Nothing it edits is rendered in a browser, so
`.claude/rules/browser-verification.md`'s exemption applies and is claimed here
explicitly: there is no route to open and no rendered surface to exercise.** That is why
no acceptance criterion below is a browser check.

- **R26 applies**: the commit body names every file changed, the fixture commands and
  their output, the `npm run lint` result, and the stated reason
  `docs/spec/coverage-policy.json` is kept rather than deleted.
- R01–R25: N/A. The change touches no rendered surface — no brand asset, imagery, layout,
  spacing, colour, type, copy, price, data source, state machine, target size, breakpoint,
  dialog, persistence or offer. It edits an ESLint config, deletes a Node script, and edits
  documentation.

## Acceptance criteria

- [ ] **FIX-46-AC00** `test -f scripts/check-traceability.mjs` fails (file absent) and
      `grep -rn "test\.skip(\|it\.skip(\|describe\.skip(" tests e2e src` returns nothing,
      proving `FIX-39` landed first. If either check fails, this task's commit does not
      happen yet.
- [ ] **FIX-46-AC01** `eslint.config.js` contains a block whose `files` includes
      `tests/**/*.ts`, `e2e/**/*.ts` and `src/**/*.spec.ts` and whose `rules` sets
      `no-restricted-syntax`, and a second block applying `tseslint.configs.disableTypeChecked`
      to `tests/**/*.ts` and `e2e/**/*.ts`. `grep -n "no-restricted-syntax" eslint.config.js`
      returns at least one line and `grep -n "disableTypeChecked" eslint.config.js` returns
      exactly one. Neither selector string contains `callee.object.name`:
      `grep -c "callee.object.name" eslint.config.js` prints `0`.
- [ ] **FIX-46-AC01b** `node -e "console.log(JSON.stringify(require('./angular.json').projects['mi-bolt'].architect.lint.options.lintFilePatterns))"`
      prints exactly `["src/**/*.ts","src/**/*.html","tests/**/*.ts","e2e/**/*.ts"]`. This is
      what makes the rule reachable at all: before this change `ng lint` never visited the two
      trees every one of the thirteen removed violations lived in, so `FIX-46-AC05` would have
      passed without the rule ever running.
- [ ] **FIX-46-AC02** The three fixture files in How to verify Step 1 were created, `npm run lint`
      reported a `no-restricted-syntax` finding for **all thirteen** lines in **each** of the
      three, and the fixtures were then deleted. Record the fixture contents, the full
      `npm run lint` output for them, and the post-deletion `git status --short` verbatim.
      `test.describe.skip` and `test.describe.only` are the two forms the selector shape was
      changed for; a run in which those two do not fire fails this criterion outright. This
      is the proof the selector is not just plausible.
- [ ] **FIX-46-AC03** `scripts/check-test-policy.mjs` no longer exists:
      `test -f scripts/check-test-policy.mjs` fails. `grep -rn "check-test-policy"
      --include="*.ts" --include="*.mjs" --include="*.json" src scripts tests e2e
      package.json` returns nothing.
- [ ] **FIX-46-AC04** `grep -n '"check:test-policy"' package.json` returns nothing, and
      the commit body states whether this task removed the line or found it already
      absent because `FIX-47` had landed.
- [ ] **FIX-46-AC05** `npm run lint` runs (it does not fail schema validation) and its output
      contains **no** `no-restricted-syntax` finding: `npm run lint 2>&1 | grep -c "no-restricted-syntax"`
      prints `0`. A `no-restricted-syntax` finding fails this task. **The exit code itself is
      recorded, not gated**: this commit is the first time `ng lint` has ever visited `tests/`
      and `e2e/` (`BASELINE.md:8` — lint "NEVER RUNS" on this repository), so a finding from
      any other rule in either tree is new information rather than a regression. List every such
      finding in the commit body as `path:line rule`, state that no task in this package owns
      repairing them (`FIX-02` is scoped to `src/`), and report them. A failure in `src/` is
      `FIX-01`/`FIX-02`'s and is named as theirs.

      This criterion requires **FIX-01** to have landed (without `lintFilePatterns` the command
      does not run at all) and reads more cleanly after **FIX-02** (which is what makes the
      `src/` half green); the landing order is the orchestrator's ruling, not this file's.
- [ ] **FIX-46-AC06** `git diff docs/spec/coverage-policy.json` is empty, and the commit
      body states in its own words that the file's only reader is gone, that the user
      decided to keep the file anyway (D19 item 2), and that nothing may delete it later
      on the grounds that nothing reads it.
- [ ] **FIX-46-AC07** `grep -c "check-test-policy" docs/tasks/T27.md docs/tasks/tasks.json
      docs/index.html` prints `0` for all three files, and the same three files already
      show `0` for `check-traceability` (confirming `FIX-39` landed first and this task
      did not touch that entry).
- [ ] **FIX-46-AC08** `npm run build` exits 0 — a no-regression check; neither the ESLint
      config nor the deleted script is in the build's own path.
- [ ] **FIX-46-AC09** `git log --oneline` shows this task's commit strictly after the
      commit whose subject matches `FIX-39`'s (see that file's `## Commit` section);
      record both commit subjects in this task's evidence record in that order.

## Commit

This task is exactly one commit, and it does not happen until `FIX-39`'s commit is already
on the branch — see `FIX-46-AC00`. Do not bundle it with `FIX-39` or any other FIX task.

The commit body carries: the eight selector-proof runs, the `npm run lint` result, whether
the `check:test-policy` npm entry was removed here or already gone, and the stated reason
`docs/spec/coverage-policy.json` is kept rather than deleted.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
chore: move the test-policy check into ESLint and delete the bespoke gate
```
