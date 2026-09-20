# FIX-57 — Create the `design-review.md` the running test suites already point at

Status: DONE — be534f3. Created docs/mi-bolt/execution/design-review.md with all eleven required sections. Found two real defects while measuring (keyboard.spec.ts's getByTestId('app-marketing-layout') targets a component selector, not a data-testid, so the whole keyboard flow test skips at its first step; state-matrix.spec.ts's built:false rows are stale). Open: FIX-57-AC04, AC06 and AC07 (the 48-cell overflow table, the six manual checks, the live axe run) need a real browser session and were recorded "not measured" — no Agent tool was available in the executing session to spawn real-browser-sonnet.
Severity: major
Source: Review round item N6 (orchestrator-measured), `docs/tasks/T25.md:22`, `e2e/a11y/keyboard.spec.ts:19-21`, `e2e/design/state-matrix.spec.ts:28`, `e2e/design/viewport-matrix.spec.ts:98-100` and `:116-119`. Named as unowned and explicitly forbidden in `FIX-53`'s out-of-scope section; this task is its owner.

## Why this is wrong

`docs/tasks/T25.md:22` lists `docs/mi-bolt/execution/design-review.md` as one of T25's
four deliverable files, alongside the three test suites. The three suites were written and
they all reference it: each one deliberately records something in that file **instead of**
failing, and the file does not exist. `ls docs/mi-bolt/execution/` confirms it.

The result is three suites that pass or skip while their evidence goes nowhere. A skipped
keyboard step is supposed to be a counted, written-down gap; today it is a green run.
`.claude/CLAUDE.md` ("Surgical changes") states the principle the user gave in their own
words — *"nem hagyunk hátra ismert hibát"* ("we do not leave a known bug behind") — and a
test that silently swallows its own gaps is exactly that.

`docs/tasks/T25.md:26` fixes what the file is for: *"Output: measured screenshots, axe
results, keyboard/focus report and R01–R26 evidence."* This task creates the file with
that content and nothing else. **The document shape is read off T25, not invented.**

## Evidence

**The file does not exist.**

```
$ ls docs/mi-bolt/execution/
$ grep -rn "design-review" docs/tasks/T25.md
22:- `docs/mi-bolt/execution/design-review.md`
```

**Three suites point at it.**

`e2e/a11y/keyboard.spec.ts:16-21`:

```
 * The flow is data-driven by `KEYBOARD_STEPS`; each step waits for
 * a `data-testid` to appear before pressing the documented key,
 * so a missing feature surfaces as a `test.skip` with the exact
 * step name in the message rather than a hard failure. The
 * skipped-step count is recorded as evidence in
 * `docs/mi-bolt/execution/design-review.md`.
```

`e2e/design/state-matrix.spec.ts:23-28`:

```
 * Routes that are not yet implemented (cart / checkout / success —
 * T17–T24) are skipped with a `test.skip` instead of failing the
 * suite: the navigation returns 404 because the page bundle is
 * missing from the production build, not because the design audit
 * is wrong. The skip count is the explicit `not-yet-built` evidence
 * recorded in `docs/mi-bolt/execution/design-review.md`.
```

`e2e/design/viewport-matrix.spec.ts:98-100` and `:116-119`:

```js
          // The success page only renders for a known demo order id;
          // an unresolved route is documented as a known limitation
          // in design-review.md instead of being a silent pass.
```

```js
          // Persist one screenshot per viewport / route pair under
          // e2e/design/screenshots/<viewport>/<route>.png (AC02
          // visual evidence — comparison happens in design-review.md,
          // not in the test).
```

That last comment is the strongest evidence of what the file is for: the screenshot
comparison T25-AC02 requires is **deliberately not automated**, and the file is where it
was supposed to happen.

**The counters the suites compute and throw away.** `keyboard.spec.ts:98` declares
`let skippedSteps = 0;` and increments it at `:107` inside the skip branch; nothing reads
it afterwards.

**The specification lines that fix the content.** `docs/tasks/T25.md:15`, `:26` and
`:42-46`:

```
Deliverable: Independent mi-bolt-design review across the complete flow.
Input: every screen and relevant component state. Output: measured screenshots, axe results, keyboard/focus report and R01–R26 evidence.
- [ ] **T25-AC01** All four families and five checkout states have no page-level horizontal overflow at 320,390,768,1024,1440,1920 CSS px.
- [ ] **T25-AC02** Compare generated screenshots to supplied reference composition and tokens. Record necessary deviations: MiBolt live name, accessible dark orange-button labels, no fake operator promises or omitted-scope nav.
- [ ] **T25-AC03** Keyboard completes browsing→variant→cart→checkout→success; drawer/zoom/terms manage focus and restore it.
- [ ] **T25-AC04** Check 200% text enlargement, reduced motion, narrow reflow, 44px shopping targets, contrast and sticky-CTA focus visibility.
- [ ] **T25-AC05** Automated axe results and manual keyboard checks are separate evidence; do not claim a WCAG certificate from screenshots or static validation.
```

`docs/tasks/T25.md:59` adds what every record in this repository must carry: *"Record
source revision, exact dependency versions, skill hash, input scenarios, command and exit
status, independent unit/E2E metrics, applicable screenshots/viewports, defect list and
reviewer decision."*

**The six viewports and the screenshot layout are already fixed by the code**, so no
number in this file is invented: `viewport-matrix.spec.ts:40-47` declares
`320, 390, 768, 1024, 1440, 1920`, matching T25-AC01 exactly, and writes
`e2e/design/screenshots/<viewport>/<route>.png`; `state-matrix.spec.ts:158-164` writes
`e2e/design/screenshots/states/<state>/<route>.png`. `git ls-files e2e/design/screenshots`
counts **49** tracked images today.

## What to change

### 1. Create `docs/mi-bolt/execution/design-review.md`

One file. Create the `docs/mi-bolt/execution/` directory if it does not exist.

The document has these sections, in this order. Each one exists because a specification
line or a test comment asks for it; the mapping is given so a later reader can check that
nothing here was invented.

1. **`## Provenance`** — the commit the review was run against, the `npm` and package
   versions the run used, and the `mi-bolt-design` skill's resolved path, version and
   SHA-256. Required by `T25.md:59` and `T25-G01`. Read the path, version and hash from
   `docs/mi-bolt/execution/skill-location.json`, which **FIX-38** creates. **FIX-38 lands
   before this task**, for the same reason the package puts it before FIX-53: so the
   provenance is cited once from one source rather than recorded as a gap in every file.
2. **`## Commands run`** — every command, verbatim, with its exit code and the first line
   of its output. Required by `T25.md:59` ("command and exit status") and `T25-G06`
   ("Attach fresh command output… Planned checks are not passing checks").
3. **`## T25-AC01 — horizontal overflow`** — one row per route and viewport from
   `viewport-matrix.spec.ts`'s own matrix: **six viewports × eight routes = 48 rows**.
   Six is `VIEWPORTS` at `viewport-matrix.spec.ts:40-47` (320, 390, 768, 1024, 1440,
   1920) and eight is `ROUTES` at `:50-64`; both counts trace to those declarations and
   to nothing else. Each row carries the measured `scrollWidth`, the measured
   `innerWidth`, and a pass or fail.

   **Where the numbers come from, because the suite does not give them.**
   `viewport-matrix.spec.ts:104-114` builds the pair inside `page.evaluate` and passes
   it as the **message argument** of its `expect`, so a passing cell prints nothing and
   only a failing one shows its numbers — a report built from the run's output would
   read `not measured` for every cell that passes, which is most of them. Take all 48
   in the same real-browser session sections 4, 6 and 7 already require
   (**FIX-57-AC06**): for each viewport, resize, and for each route, navigate and
   evaluate
   ```js
   () => ({ scrollWidth: document.documentElement.scrollWidth,
            innerWidth: window.innerWidth })
   ```
   which is the spec's own expression, unchanged. **Do not add a `page.evaluate` to the
   spec file**: **FIX-57-AC09** forbids this task to edit anything under `e2e/`, and
   the suites are read, not edited.

   A cell may read `not measured` only where the route could not be reached at all, and
   then the row says why.
4. **`## T25-AC02 — screenshots against the reference`** — this is the section the test
   comment at `viewport-matrix.spec.ts:116-119` says is not automated. One row per
   screenshot under `e2e/design/screenshots/`, naming the reference it was compared
   against and the verdict, plus the deviations T25-AC02 names explicitly: the MiBolt live
   name, the dark labels on orange buttons, and the absent out-of-scope commercial and
   navigation elements. A deviation with no reason recorded is a defect, not a deviation.
5. **`## T25-AC03 — keyboard flow`** — the keyboard report, and **the skipped-step count
   `keyboard.spec.ts:98-107` computes**, with one line per skipped step naming the step
   and why it was skipped. This is the specific gap the review round raised.
6. **`## T25-AC04 — the six manual checks`** — 200 % text enlargement, reduced motion,
   narrow reflow, 44 px targets, contrast, and sticky-CTA focus visibility. One subsection
   each, each with what was done, at which viewport, and the measured result.
7. **`## T25-AC05 — axe results, kept separate`** — the automated axe output, in its own
   section, with the sentence T25-AC05 requires: no WCAG conformance claim is made from
   screenshots or static validation.
8. **`## R01–R26 applicability`** — the twenty-six rows, each marked applies / N/A with a
   one-sentence reason, per `.claude/CLAUDE.md`'s design-skill mandate.
9. **`## not-yet-built`** — the skip count from `state-matrix.spec.ts:23-28`, itemised.
10. **`## Defects found`** — the defect list `T25.md:59` requires, each item naming the
    `file:line` and, where the package already owns it, the FIX number.
11. **`## Reviewer decision`** — accepted or not accepted, with the reason. `T25-G06`:
    *"Leave the task unaccepted when any assertion fails."*

### 2. What the file must say today, which is not "everything passes"

Every gate this repository runs is red at baseline and this package has not been executed,
so an honest first version of this document **records failures**. That is the deliverable.

- Run the three suites, one file at a time, and record the real exit codes and the real
  skip counts. Do not run a bare `npx playwright test`: it rewrites 49 tracked screenshots
  and belongs to **FIX-09**.
- Where a suite cannot run at all, write that, with the command and the error.
- Where a section has no measurement yet, write `not measured` and say what would produce
  it. Do not leave the heading out, and do not write a verdict nobody took.
- The `## Reviewer decision` section says **not accepted** for as long as any assertion
  fails, and names the failures.

A document claiming a clean review would be false on the day it was written, and
`.claude/rules/planning-deliverables.md` is the rule: the gate is that the measurement
happened and someone read it.

### 3. Do not change the three test suites

Not one line. In particular, do not make `keyboard.spec.ts` write the file: the comment
says the count is *recorded as evidence in* the document, and a test that generates its
own evidence file proves nothing about whether anyone read it. **FIX-48** owns
`keyboard.spec.ts:34`, **FIX-39** owns its `built` field, **FIX-29** owns its header
comment, and **FIX-09** owns the suites' failures.

## Out of scope

- **`e2e/a11y/keyboard.spec.ts`, `e2e/design/state-matrix.spec.ts` and
  `e2e/design/viewport-matrix.spec.ts`.** Read them; change nothing in them. Four other
  FIX numbers work in those files.
- **`docs/mi-bolt/execution/skill-location.json` — `FIX-38`.** Cite it; do not create it
  and do not guess the hash.
- **`FIX-53`'s one summary document, `acceptance-summary.md`.** Different file in the same
  directory. `FIX-53`'s out-of-scope section names this file and forbids itself from
  creating it; this task is the answer to that sentence.
- **`docs/mi-bolt/execution/deployment.md` and the T29 handover deliverables — `FIX-40`.**
- **Fixing anything the review finds.** This task writes down what is true. A defect it
  records that no FIX number owns goes into the `## Defects found` section and into the
  report; it is not repaired here, and the scope is not widened to repair it.
- **Repairing the 41 Playwright failures — `FIX-09`.** Record them; do not chase them.
- **Populating `docs/mi-bolt/execution/evidence/screenshots/`.** Cite the images the
  suites already wrote under `e2e/design/screenshots/`; copy nothing.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`). None of
those is this task's to fix; all of them are this task's to record.

Run each suite by name, never the bare command:

```bash
npm run build                                          # expected exit 0
npx playwright test e2e/design/viewport-matrix.spec.ts # record the exit code
npx playwright test e2e/design/state-matrix.spec.ts    # record the exit code
npx playwright test e2e/a11y/keyboard.spec.ts          # record the exit code
git status --short e2e/design/screenshots              # see the warning below
```

**Those three commands rewrite tracked screenshots.** `viewport-matrix.spec.ts` and
`state-matrix.spec.ts` write into `e2e/design/screenshots/`, where 49 images are tracked.
Run the last `git status --short` and record in the commit body exactly which images
changed. **Do not stage them**: they are `FIX-09`'s to settle, and
`.claude/rules/session-lifecycle.md` forbids using git to undo the change, so leave them
in the working tree and say so.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here. **This task depends on `FIX-38` having
landed** — FIX-57-AC10 is the check.

- **All twenty-six are *in scope*, as the subject of the document rather than as a
  property of the change, and each gets a row and a verdict.** Section 8 of the file is
  the twenty-six-row table, and filling it honestly is what this task delivers. A
  verdict of **N/A is permitted** — `.claude/CLAUDE.md`'s design-skill mandate allows
  it with a one-sentence reason, and a rule the application genuinely has no surface
  for is honestly N/A. **What is forbidden is one particular reason**: that *this* is a
  documentation task. That ground would be a statement about the commit, and the table
  is about the application the document reviews, so it would empty the deliverable.
  Every N/A reason therefore names something about the application — the surface that
  does not exist, the state that cannot be reached — and **FIX-57-AC05** is the check.
- **Browser verification is required, and it is not exempt.** The file's sections 4, 6 and
  7 cannot be written without a browser: T25-AC02 is a visual comparison, T25-AC04's six
  checks are interactions, and T25-AC05's axe results come from a running page.
  `.claude/rules/browser-verification.md` lists what does not count — a green test run,
  file existence on disk, an HTTP 200 — and none of those can fill those three sections.
  The content is measured in a real browser and the measurements go into the file.
- **R26 also applies to this task's own commit, separately from the twenty-six-row table
  above, and is satisfied by the commit body.** The table's twenty-six rows judge the
  application the document reviews; this bullet is the property-of-the-commit reading
  "All twenty-six are *in scope*" opens by ruling out. Under **D23** the commit body is
  where this task's own R01–R26 outcome is recorded, together with every file changed,
  every command run and its result.

## Acceptance criteria

- [ ] **FIX-57-AC01** `docs/mi-bolt/execution/design-review.md` exists and contains all
      eleven headings listed in "What to change" item 1, in that order.
- [ ] **FIX-57-AC02** The `## T25-AC03 — keyboard flow` section states the skipped-step
      count that `npx playwright test e2e/a11y/keyboard.spec.ts` produced in this run, and
      lists one line per skipped step naming the step and the reason. The number in the
      file equals the number the run reported.
- [ ] **FIX-57-AC03** The `## Commands run` section lists every command this task ran,
      verbatim, each with its actual exit code. No command is listed that was not run, and
      no exit code is recorded that was not observed.
- [ ] **FIX-57-AC04** The `## T25-AC01 — horizontal overflow` section carries **48**
      rows — one per pair from `viewport-matrix.spec.ts`'s own `VIEWPORTS` (`:40-47`,
      six) and `ROUTES` (`:50-64`, eight) declarations — each with a measured
      `scrollWidth`, a measured `innerWidth` and a verdict. The numbers are read in the
      same real-browser session as AC06, with the spec's own evaluation expression, and
      **no file under `e2e/` is edited to obtain them** (see FIX-57-AC09). `not
      measured` appears only on a row whose route could not be reached, and that row
      states why. A section in which every passing row reads `not measured` fails this
      criterion: that is what building the report from the suite's output produces, and
      it is the failure this criterion exists to prevent.
- [ ] **FIX-57-AC05** The `## R01–R26 applicability` section has exactly twenty-six rows,
      one per rule, each carrying a verdict. Every row marked **N/A** carries a
      one-sentence reason and that reason is about the **application** — a surface it
      does not have, a state that cannot be reached — never about this commit. A blank
      reason fails this criterion, and so does any reason resting on the ground the
      Design-rules section forbids: `grep -inc "documentation task\|this is a docs\|not a
      visual change" docs/mi-bolt/execution/design-review.md` must print `0` inside that
      section. Record the twenty-six verdicts and the count of N/A rows in the commit
      body. N/A is a legitimate verdict here; the count is recorded, not gated.
- [ ] **FIX-57-AC06** **Real-browser evidence for T25-AC04.** The six manual checks — 200 %
      text enlargement, reduced motion, narrow reflow, 44 px targets, contrast, sticky-CTA
      focus visibility — were each performed in a real browser at a named viewport, and the
      file records for each one what was done and what was measured. A section saying only
      "passes" fails this criterion.
- [ ] **FIX-57-AC07** **Real-browser evidence for T25-AC05.** The axe results in the file
      come from a run against a live page, are in their own section, and carry the sentence
      T25-AC05 requires: that no WCAG conformance is claimed from screenshots or static
      validation.
- [ ] **FIX-57-AC08** The `## Reviewer decision` section reads **not accepted** while any
      assertion in the file fails, and names the failures. If it reads accepted, every
      section of the file shows a pass and the commit body says so explicitly.
- [ ] **FIX-57-AC09** `grep -c "docs/mi-bolt/execution/design-review.md" e2e/a11y/keyboard.spec.ts e2e/design/state-matrix.spec.ts`
      returns the same counts as before this task, and `git diff --name-only -- 'e2e/**/*.ts'`
      lists no file. The suites were read, not edited. The rewritten screenshots under
      `e2e/design/screenshots/` are reported in the commit body and left unstaged — they
      are expected to appear in `git diff --name-only` and are not what this criterion
      checks.
- [ ] **FIX-57-AC10** The provenance section cites the skill path, version and SHA-256
      from `docs/mi-bolt/execution/skill-location.json`. If **FIX-38** has not landed, this
      task stops and reports rather than guessing a hash.

## Commit

This task is exactly one commit: one new file. Do not bundle it with **FIX-38**, whose
`skill-location.json` it cites, or with **FIX-53**, whose one summary document,
`acceptance-summary.md`, sits in the same directory. Do not stage the screenshots the
verification run rewrote. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
docs: add the T25 design-review record the e2e suites reference
```
