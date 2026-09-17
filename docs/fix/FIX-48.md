# FIX-48 — Stop the e2e a11y suite writing screenshots outside the repository

Status: PLANNED — not executed.
Severity: major
Source: A5 (test-suite sweep), orchestrator confirmation of the resolved path, plus a directory measured on disk outside the checkout.

## Why this is wrong

`e2e/a11y/keyboard.spec.ts` resolves its repository root by walking **three**
directories up from `__dirname`. The file sits two levels below the repository root,
so three `..` land on the parent of the checkout. Every path the spec derives from
that constant — the screenshot directory it creates and the PNG it writes for each
step of the keyboard flow — therefore points outside the working tree.

This is not a theoretical defect. The directory the spec creates exists on disk
outside the repository today, so the suite has already run and written there. Two
consequences follow. Files the project produces land where nothing in the project
tracks, ignores or cleans them; and the screenshots this spec takes as its evidence
land outside the directory the other 49 are committed in, so the design review the
file's own header points at (`:19-21`: *"The skipped-step count is recorded as
evidence in `docs/mi-bolt/execution/design-review.md`"*) has no images to reference.

Every sibling spec gets it right. The fix is one character.

## Evidence

### One file out of four uses the wrong depth

```
$ grep -rn "REPO_ROOT = resolve" e2e
e2e/design/state-matrix.spec.ts:41:const REPO_ROOT = resolve(__dirname, '..', '..');
e2e/design/viewport-matrix.spec.ts:34:const REPO_ROOT = resolve(__dirname, '..', '..');
e2e/fixtures/coverage.ts:29:const REPO_ROOT = resolve(__dirname, '..', '..');
e2e/a11y/keyboard.spec.ts:34:const REPO_ROOT = resolve(__dirname, '..', '..', '..');
```

All four files sit exactly two levels below the repository root — `e2e/design/`,
`e2e/a11y/`, `e2e/fixtures/` — so two `..` is correct and three is one too many.

`e2e/a11y/keyboard.spec.ts:34-35`:

```ts
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const SCREENSHOT_ROOT = resolve(REPO_ROOT, 'e2e/design/screenshots');
```

### The wrong path is used three times in the spec body

`e2e/a11y/keyboard.spec.ts:97`:

```ts
    mkdirSync(resolve(SCREENSHOT_ROOT, 'keyboard'), { recursive: true });
```

and again inside the step loop at `:138-144`:

```ts
      const screenshotPath = resolve(
        SCREENSHOT_ROOT,
        'keyboard',
        `${step.name.replace(/\s+/g, '-').toLowerCase()}.png`,
      );
      mkdirSync(resolve(SCREENSHOT_ROOT, 'keyboard'), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });
```

`mkdirSync(..., { recursive: true })` creates every missing parent without
complaint, which is why a wrong root produced a new directory tree rather than an
error.

### The directory exists outside the repository — measured

Run from the repository root:

```
$ find ../e2e -type d
../e2e
../e2e/design
../e2e/design/screenshots
../e2e/design/screenshots/keyboard
$ find ../e2e -type f | wc -l
       0
```

Four directories and zero files. The `mkdirSync` at `:97` therefore executed at
least once, which is what makes this defect live rather than latent, and no
screenshot followed — consistent with every step of the flow reaching the
`test.skip` at `:103` before the screenshot line, which is the baseline state
**`FIX-09`** owns.

The corresponding directory **inside** the repository does not exist:

```
$ ls e2e/design/screenshots/
1024
1440
1920
320
390
768
states
$ ls e2e/design/screenshots/keyboard
ls: e2e/design/screenshots/keyboard: No such file or directory
```

Seven tracked screenshot directories and no `keyboard/` among them. The spec has
never written a keyboard screenshot into the tree it belongs to.

### Why the second half of this finding is not here

The audit also reported that `@axe-core/playwright` is installed and used nowhere,
and that the comment at `e2e/a11y/keyboard.spec.ts:23-26` falsely claims axe is
covered elsewhere:

```ts
 * Manual keyboard checks (T25-AC05) are kept separate from any
 * automated axe results — this file asserts the keyboard
 * contract only; `state-matrix.spec.ts` and the per-page unit
 * suites cover axe.
```

Both halves are already owned. **`FIX-29`** creates `e2e/a11y/axe.spec.ts`, which is
what puts the installed dependency to work, and its **FIX-29-AC10** requires that
this comment stop claiming `state-matrix.spec.ts` covers axe and name the new file
instead. Neither is repeated here. This task changes one constant and cleans up what
the wrong value left behind.

## What to change

### 1. `e2e/a11y/keyboard.spec.ts:34` — one `..` fewer

```ts
const REPO_ROOT = resolve(__dirname, '..', '..');
```

Nothing else in the file changes. `SCREENSHOT_ROOT` at `:35`, the `mkdirSync` calls
at `:97` and `:143`, the `screenshotPath` at `:138-142` and the attachment push at
`:145-149` all become correct once the constant is.

**Do not extract a shared `REPO_ROOT` helper for the four files.** Three of them are
already correct, a shared module would touch three files this task has no reason to
open, and `e2e/design/state-matrix.spec.ts` and this file are both being edited by
**`FIX-46`** and **`FIX-29`** in the same period. One character is the whole fix.

### 2. Remove the directory tree the defect created, outside the repository

Run from the repository root, in this order:

```bash
find ../e2e -type f
rmdir ../e2e/design/screenshots/keyboard ../e2e/design/screenshots ../e2e/design ../e2e
```

`rmdir` removes an empty directory and **fails on a non-empty one**, which is the
guard: if anything unexpected is in there, the command refuses and nothing is lost.

- If the first command lists **no files**, run the second and record its exit code.
- If the first command lists **any file**, run neither. Record the full listing,
  report it, and leave the directory alone. A file there may be a screenshot this
  suite wrote, or it may belong to something else entirely; deciding is the
  orchestrator's, not the executor's.

Do not use `rm -rf`. Do not use `git clean` — `.claude/rules/session-lifecycle.md`
forbids it, and in any case the path is outside the repository where git would not
reach it.

### 3. Add the directory the spec will now write into, or let the spec create it

Nothing to do: `mkdirSync(..., { recursive: true })` at `:97` creates
`e2e/design/screenshots/keyboard/` on the first run. **Do not create it by hand and
do not add a `.gitkeep`.** Whether the keyboard screenshots are committed alongside
the other 49 tracked screenshots is a question this task does not answer; see
"Out of scope".

## Out of scope

- **The unused `@axe-core/playwright` dependency and the false comment at
  `:23-26` — `FIX-29`.** That task adds `e2e/a11y/axe.spec.ts` and its **AC10**
  corrects the comment. Do not add an axe import here and do not edit the header
  comment.
- **The `built` field and the `test.skip` calls in this file — `FIX-46`.** That task
  removes the never-false `built` flag from `KeyboardStep` and from the eight `FLOW`
  rows. This task edits line 34 only, so the two touch different lines of the same
  file; the orchestrator sequences them rather than running them together.
- **The 41 Playwright failures — `FIX-09`.** Every step of this spec's flow reaches
  `test.skip` at `:103` today because the routes it walks are not reachable, which is
  why the wrongly-placed directory is empty. Fixing the path does not make the flow
  run; `FIX-09` does.
- **Whether keyboard screenshots are committed.** The 49 screenshots under
  `e2e/design/screenshots/` are tracked, so the keyboard ones would naturally be too
  — but no screenshot has ever been produced, so there is nothing to decide about
  yet. If the run in FIX-48-AC03 produces PNGs, report their count and leave them
  unstaged; do not add a `.gitignore` entry and do not commit them.
- **`e2e/design/state-matrix.spec.ts` and `e2e/design/viewport-matrix.spec.ts`, plus
  `e2e/fixtures/coverage.ts` unless `FIX-62` has already deleted it (`FIX-62.md:430`).**
  All already resolve correctly. Leave them.
- **Any other path the suite writes**, including `playwright-report/`, which
  `playwright.config.ts:37-40` configures, and `test-results/`, Playwright's unset
  `outputDir` default. They are correct.

## How to verify

Run these from the repository root, in order. The package manager is **npm
11.17.0**; there is no pnpm and no mise in this repository.

**Step 1 — before editing, record the stray tree.**

```bash
find ../e2e -type d
find ../e2e -type f
ls e2e/design/screenshots/
```

Copy all three outputs into the commit body. They are the evidence that the defect
was live. Note that `../e2e` is written repository-relative on purpose: the commit
message is committed and `.claude/rules/code-standards.md` forbids a machine-specific
absolute path in a committed file.

**Step 2 — after the change.**

```bash
node -e "const {resolve}=require('node:path');console.log(resolve('e2e/a11y','..','..'))"
grep -n "REPO_ROOT = resolve" e2e/a11y/keyboard.spec.ts
npm run build                                   # expected exit 0; needed before Playwright
npx playwright test e2e/a11y/keyboard.spec.ts   # record the exit code
find ../e2e 2>&1
find e2e/design/screenshots/keyboard -type f 2>&1
```

The Playwright run is expected to report skipped steps, because the routes it walks
are not reachable at baseline (**FIX-09**). That is fine: what this task proves is
**where** the run writes, not that it passes.

Do **not** run `npx playwright test` with no argument. It rewrites 49 tracked
screenshots under `e2e/design/screenshots/` and has 41 baseline failures
(**FIX-09**). After the single-spec run, read `git status --short` and record it; if
anything tracked changed, say so and leave it out of this commit's staged paths. Do
not use `git restore`, `git checkout --`, `git stash`, `git reset` or `git clean`
(`.claude/rules/session-lifecycle.md`).

**Step 3 — no regression.**

```bash
npm run test                  # record the exit code and the failure list; not gated — see below
```

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**) and `npx playwright test` (**FIX-09**). `npm run test` is **run** by this task as step 3 above and is neither deferred nor gated: its exit code and its failure list are recorded, and every failure is attributed — **FIX-04** owns the 14-of-14 baseline, **FIX-08** the coverage thresholds — because this task names no spec file of its own and can therefore neither cause nor repair one of them. Do not run `npm run api:drift` while working on this task: it rewrites tracked files and leaves the working tree dirty. For the Playwright runs this task's own verification needs, see the "Do not run the full Playwright suite" clause in that step.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

**This task changes one constant in a Playwright spec and removes an empty directory.
Nothing it edits is rendered, so `.claude/rules/browser-verification.md`'s exemption
applies and is claimed here explicitly: there is no route to open and no rendered
surface to exercise.** The Playwright run in step 2 drives a browser, but it is run
as a measurement of where files land, not as verification of a user-visible change,
and none of the criteria below reads as one.

- **R26 applies**: the commit body has to name the file changed, the commands run
  with their outputs, and the actual remaining limitation — that the flow still skips
  every step until **FIX-09** lands, so the screenshots the corrected path enables
  have still not been produced. AC05 requires it.
- R01–R25: N/A. The change touches no rendered surface at all — no brand asset,
  imagery, layout, spacing, colour, type, copy, price, data source, state machine,
  target size, breakpoint, dialog, persistence or offer. It edits one path constant
  in a test file.

## Acceptance criteria

- [ ] **FIX-48-AC01** `grep -n "REPO_ROOT = resolve" e2e/a11y/keyboard.spec.ts`
      shows `resolve(__dirname, '..', '..')` — two `..`, matching
      `e2e/design/state-matrix.spec.ts:41` and `e2e/design/viewport-matrix.spec.ts:34`,
      plus `e2e/fixtures/coverage.ts:29` **unless `FIX-62` has already landed and deleted
      that file** (`FIX-62.md:430`), in which case record the remaining three lines
      together.
- [ ] **FIX-48-AC02** `find ../e2e` run from the repository root reports that the
      path does not exist. Record the before output (four directories, zero files)
      and the after output. If the removal was skipped because a file was found there,
      this criterion is recorded as **not met** with the file listing, and the finding
      is reported rather than forced.
- [ ] **FIX-48-AC03** After `npx playwright test e2e/a11y/keyboard.spec.ts`,
      `find ../e2e` still reports nothing, and any screenshot the run produced is
      under `e2e/design/screenshots/keyboard/` inside the repository. Record the file
      count in both places. Zero files inside is an acceptable result at this baseline
      — every step skips (**FIX-09**) — but a non-zero count **outside** is a failure
      of this criterion.
- [ ] **FIX-48-AC04** `git status --short` after that run is recorded. No tracked
      screenshot under `e2e/design/screenshots/` was modified, and no `git restore`,
      `git checkout --`, `git stash`, `git reset` or `git clean` was used at any
      point.
- [ ] **FIX-48-AC05** The commit body records: the measured stray directory before
      the change, the `rmdir` result, the Playwright run's exit code and skip count,
      and that the axe half of the original finding belongs to **FIX-29** and was
      deliberately not touched here.
- [ ] **FIX-48-AC06** `npm run build` exits `0`. `npm run test` is run before this task's
      first edit and again after its last, and **both exit codes and both failure lists are
      recorded in the commit body and are identical**. This task edits `e2e/` and
      `package.json` only and names no spec file of its own, so it can cause no change in
      either; a difference is a regression this task must fix. The exit code is not the bar —
      **FIX-04** owns the 14-of-14 baseline and **FIX-08** the coverage thresholds — and this
      criterion is met by the two recorded runs matching, whatever they say.
## Commit

This task is exactly one commit: one changed character in one file, plus the removal
of the directory tree that character created outside the repository. Do not bundle
it with any other FIX task — in particular not with **FIX-29** or **FIX-46**, which
edit other lines of the same file and must stay separately reviewable. Do not commit
until every acceptance criterion above has passed and its output is recorded.

The removed directory is outside the repository, so it does not appear in the diff.
Under **D23** the commit body is the only record there is, and here it is also the only
record of the deletion: write the `find` output from before and after into it.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: resolve the a11y suite's screenshot root inside the repository
```
