# FIX-68 — Namespace the design-suite screenshot paths by Playwright project

Status: PLANNED — not executed.
Severity: major
Source: Decision **D15**, item 13 (the FIX-54..FIX-61 unowned-defect sweep);
`e2e/design/viewport-matrix.spec.ts:120-123`; `e2e/design/state-matrix.spec.ts:158-164`;
`e2e/a11y/keyboard.spec.ts:138-142` (dormant until **FIX-48** repairs its `REPO_ROOT`);
`playwright.config.ts:33` (`fullyParallel: true`) and `:66-81` (the two projects); the
working precedent at `e2e/checkout-f8.spec.ts:58,84,97` and `.gitignore:320`. Flagged and
deferred, with its reason, by `FIX-58`'s out-of-scope section: *"Making `e2e/design`'s
screenshots project-aware. It would be the right change and it is not this task's: it
touches 49 tracked images and two suites that other FIX numbers work in. Record it in the
commit body and report it."* This task is that number, and it also closes the third,
dormant instance of the same defect that this task's own first version flagged and
deferred in its own "Out of scope" section.

## Why this is wrong

`e2e/design/viewport-matrix.spec.ts` builds its screenshot path from the viewport name and
the route only, `:120-128`:

```ts
const screenshotDir = resolve(
  SCREENSHOT_ROOT,
  viewport.name,
);
mkdirSync(screenshotDir, { recursive: true });
const screenshotPath = resolve(
  screenshotDir,
  `${route.id}.png`,
);
```

`e2e/design/state-matrix.spec.ts` does the same with a fixed `'states'` segment instead of
a viewport, `:158-164`:

```ts
const screenshotDir = resolve(
  SCREENSHOT_ROOT,
  'states',
  surface.state,
);
mkdirSync(screenshotDir, { recursive: true });
const screenshotPath = resolve(screenshotDir, `${surface.routeId}.png`);
```

Neither path carries which Playwright **project** wrote it. `playwright.config.ts:33`
declares `fullyParallel: true`, and `:66-81` configures two projects today —
`mi-bolt-design` at 1440×900 and `mi-bolt-narrow` at 390×844 — both of which run every spec
under `testDir` with no `testMatch` restriction, this pair of files included. **The
collision is not hypothetical and not only a future risk**: `viewport-matrix.spec.ts:86-90`
sets the page's viewport explicitly for every one of the six named entries in its own
`VIEWPORTS` table, inside a `test.beforeEach`, regardless of which project's own device
viewport is configured —

```ts
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({
    width: viewport.width,
    height: viewport.height,
  });
});
```

— so **both projects walk all six viewports today**, and both write to the exact same 48
paths (`e2e/design/screenshots/<viewport>/<route>.png`) for the same run. Under
`fullyParallel: true` those two writers race. `state-matrix.spec.ts` does not even
encode a viewport in its path at all, so its one currently-produced image
(`states/default/catalog-default.png`) is written by both projects to the identical path
regardless of their different device viewports.

`e2e/checkout-f8.spec.ts` already solves exactly this, three times, by putting the project
name into the filename (`:58,84,97`):

```js
path: `e2e/checkout-f8-screenshots/${test.info().project.name}-01-cart.png`,
```

`.gitignore:320` ignores that directory, so `checkout-f8`'s images stay untracked and
`git ls-files e2e/checkout-f8-screenshots` counts `0`. `e2e/design/screenshots/` carries no
such ignore entry — every image under it is tracked, `git ls-files e2e/design/screenshots`
counts **49** — so the same race here corrupts committed evidence, not a scratch directory.
This task copies the working, already-reviewed precedent rather than inventing a second
scheme.

`e2e/a11y/keyboard.spec.ts` builds its screenshot path the identical, unprefixed way,
`e2e/design/screenshots/keyboard/<step>.png` (`:138-142`), under the same two Chromium
projects and the same `fullyParallel: true`. It is not a live collision today only because
`e2e/a11y/keyboard.spec.ts:34`'s `REPO_ROOT` resolves one directory too high — a defect
**FIX-48** owns — so every step's `gotoAndCheck` fails and the loop's own `test.skip` fires
before the screenshot line ever runs; `git ls-files e2e/design/screenshots | grep -c
keyboard` counts `0` today. The moment **FIX-48** repairs `REPO_ROOT`, the loop reaches
real pages and the identical race this task fixes for the other two files becomes live for
this one too. Fixing the path now, while the suite is still dormant, means the file never
ships a single unprefixed, collision-prone filename once it starts writing real ones.

## Evidence

### The 49 tracked images, and where they come from

```
$ git ls-files e2e/design/screenshots | wc -l
49
$ git ls-files e2e/design/screenshots | awk -F/ '{print $4}' | sort | uniq -c
   8 1024
   8 1440
   8 1920
   8 320
   8 390
   8 768
   1 states
```

Six viewports × eight routes = 48 from `viewport-matrix.spec.ts`; one from
`state-matrix.spec.ts` (`states/default/catalog-default.png` — the only `SURFACES` entry
whose route is built at baseline; the rest are skipped per that file's own header comment,
`:22-26`, and README section 8).

### `testInfo` is already available in both files — no new parameter to add

`viewport-matrix.spec.ts:94`: ``test(`${route.id} has no horizontal overflow`, async ({ page }, testInfo) => {``.
`state-matrix.spec.ts:104-106`: `test(..., async ({ page }, testInfo) => {` (split across three
lines in the file).
Both already destructure `testInfo` for the `testInfo.attachments.push(...)` call each
file makes right after its screenshot. `testInfo.project.name` is the same accessor
`e2e/checkout-f8.spec.ts` uses through `test.info().project.name` — `test.info()` returns
the same `TestInfo` object the callback parameter already is.

### `FIX-58` lands independently; either order is safe

`FIX-58` (`test: add the Firefox and WebKit projects...`) edits only
`playwright.config.ts`, scoping the two new browser projects away from `e2e/design/*` and
`e2e/a11y/*` with its own `testMatch` (`FIX-58.md:130-149`). This task edits only
`e2e/design/viewport-matrix.spec.ts` and `e2e/design/state-matrix.spec.ts`. The two task's
file lists are disjoint, so **either order works** and neither is a prerequisite of the
other — see "How to verify" for what changes about `FIX-58`'s own reasoning once this task
has landed, and why that does not mean this task edits `playwright.config.ts`.

### `e2e/a11y/keyboard.spec.ts` carries `testInfo` already too, and `FIX-48` lands independently

`e2e/a11y/keyboard.spec.ts:94-96`: `test('Tab / Enter / Escape drive the purchase flow end
to end', async ({ page }, testInfo) => {` — the same `testInfo` parameter the other two
files already destructure, and this file already uses it two lines below its own
screenshot call, at `:145-149`, to push the screenshot as a named attachment. No new
parameter is added for this file either.

**`FIX-48` (`test: fix the e2e a11y suite...`) edits only `e2e/a11y/keyboard.spec.ts:34`**
(the `REPO_ROOT` computation) and the false axe comment at `:23-26`; it does not touch the
screenshot path this task edits at `:138-142`. This task's own edit does not touch
`REPO_ROOT` or the axe comment. The two tasks' changed lines in this shared file are
disjoint, so **either order is safe**: if this task lands first, the suite still test-skips
every step until `FIX-48` lands, so the corrected path is simply never exercised in the
meantime; if `FIX-48` lands first, the suite starts reaching real pages and writing real
screenshots, and they are correctly namespaced from the very first one because this task's
edit is already in place. Neither landing order produces an unprefixed, colliding filename.

### A related file measured and found not at risk today

`e2e/design/primitives.spec.ts:48-49` also writes into `e2e/design/screenshots/` with no
literal project-name segment —

```ts
const viewport = testInfo.project.name === 'mi-bolt-narrow' ? '390' : '1440';
const path = `e2e/design/screenshots/${name}-${viewport}.png`;
```

— but it derives its path segment from the project's **viewport**, not a fixed value, so
with today's two Chromium projects (`mi-bolt-design` → `'1440'`, `mi-bolt-narrow` →
`'390'`) the two projects already write to different, non-colliding paths by construction.
It stays safe as long as no third project it is *not* scoped away from also falls into the
`'1440'` branch, which is exactly what `FIX-58`'s `testMatch` prevents for Firefox and
WebKit. No file of this shape is tracked today (`git ls-files e2e/design/screenshots` shows none
of the `<name>-<viewport>.png` shape), so nothing needs to be deleted or regenerated for
this file. **That holds only while `FIX-09` has not landed**: `FIX-09.md:287-291` stages
twenty files of exactly this shape, and item 6's `git rm -r` would delete every one of
them while item 6's regeneration command never rewrites them. This task therefore lands
**before** `FIX-09` — see "Commit" for the check that proves it has not. Not touched by
this task; recorded so the sweep is not mistaken for incomplete.

## What to change

### 1. `e2e/design/viewport-matrix.spec.ts:127` — the one line that builds the filename

```ts
          const screenshotPath = resolve(
            screenshotDir,
            `${testInfo.project.name}-${route.id}.png`,
          );
```

(was `` `${route.id}.png` ``). Nothing else in the call changes.

### 2. `e2e/design/viewport-matrix.spec.ts:14-15` and `:116-119` — the two stale comments

`:14-16`, inside the file's header docblock:

```
 *   - one full-element screenshot per viewport / route pair is
 *     captured under `e2e/design/screenshots/<viewport>/<project>-<route>.png`
 *     for AC02 visual comparison.
```

`:116-119`, the inline comment immediately above the code item 1 edits:

```ts
          // Persist one screenshot per viewport / route pair under
          // e2e/design/screenshots/<viewport>/<project>-<route>.png
          // (AC02 visual evidence — comparison happens in
          // design-review.md, not in the test).
```

### 3. `e2e/design/state-matrix.spec.ts:164` — the matching line

```ts
      const screenshotPath = resolve(screenshotDir, `${testInfo.project.name}-${surface.routeId}.png`);
```

(was `` `${surface.routeId}.png` ``).

### 4. `e2e/design/state-matrix.spec.ts:12-14` — the one stale comment

```
 *   - a screenshot under
 *     `e2e/design/screenshots/states/<state>/<project>-<route>.png` is
 *     captured for the AC02 visual catalogue.
```

### 5. `e2e/a11y/keyboard.spec.ts:141` — the third file's one line

```ts
      const screenshotPath = resolve(
        SCREENSHOT_ROOT,
        'keyboard',
        `${testInfo.project.name}-${step.name.replace(/\s+/g, '-').toLowerCase()}.png`,
      );
```

(was `` `${step.name.replace(/\s+/g, '-').toLowerCase()}.png` ``). `testInfo` is already
the test callback's second parameter at `:96` — see "Evidence". No comment in this file
describes the path format, so there is no third stale comment to fix alongside it.

`e2e/a11y/keyboard.spec.ts:34`'s `REPO_ROOT` computation and the false axe comment at
`:23-26` are **`FIX-48`**'s, not this task's; this line change does not touch either. The
two tasks' changed lines in this shared file are disjoint, so **either may land first** —
see "Evidence".

### 6. The 49 tracked images: deleted and regenerated, not renamed

**Every one of the 49 existing files becomes orphaned by items 1 and 3**: nothing the two
specs write again matches an old filename (`home.png`), because every write now produces a
project-prefixed name (`mi-bolt-design-home.png`). A `git mv` is not possible because the
mapping is one-to-many — each of the 48 `viewport-matrix` paths is about to be written by
**both** configured projects, since neither has a `testMatch` restricting it away from
`e2e/design/`.

Delete the old tree and regenerate it in the same commit:

```bash
git rm -r e2e/design/screenshots
npm run build
npx playwright test e2e/design/viewport-matrix.spec.ts e2e/design/state-matrix.spec.ts
git add e2e/design/screenshots
```

The command names the two spec files explicitly, never a bare `npx playwright test`, so
only `mi-bolt-design` and `mi-bolt-narrow` run them — `FIX-58`'s two new projects are
scoped away from `e2e/design/*` by their own `testMatch` and never collect these files even
if `FIX-58` has already landed; if it has not, only two projects exist at all. **This is
the one task in the whole package whose job is to write into `e2e/design/screenshots/`.**
Every other task in this package that touches Playwright is told to leave that tree alone;
this one names both spec files precisely so it regenerates exactly this tree and nothing
else. **`e2e/a11y/keyboard.spec.ts` is deliberately not named in this command**: it writes
zero tracked images today (see "Evidence"), so there is nothing under
`e2e/design/screenshots/keyboard/` to orphan or regenerate here; item 5's line change is
correct and waiting, and it takes effect the first time the suite runs after `FIX-48`
lands, with no further edit needed in this task. Item 7 of "Acceptance criteria" verifies
this file separately, on its own.

**The count doubles, and that is the expected, measured consequence, not a bug to
suppress.** Both projects write every path today (see "Evidence" — `viewport-matrix.spec.ts`
overrides the viewport explicitly, so the project's own device viewport does not exclude
either from any of the six), so a tree that held `N` tracked images before this task holds
`2N` after. **Do not investigate a doubled count as a regression; investigate any other
multiple as one.** Record the before-count and the after-count in the commit body — do not
hardcode either number into this task's acceptance criteria, because whichever screens are
built (T17–T24, various FIX tasks) by the time this task actually runs changes how many of
`state-matrix.spec.ts`'s `SURFACES` entries are built rather than skipped, which changes
`N` itself.

## Out of scope

- **`playwright.config.ts` and its `projects` array.** Owned by `FIX-58`. This task never
  opens that file. See "How to verify" for what changes about the reasoning behind
  `FIX-58`'s `testMatch` scoping once this task has landed — that is a note for the record,
  not an edit to `FIX-58`'s file.
- **`e2e/design/primitives.spec.ts`.** Measured in "Evidence" and found not at risk under
  the current and planned project set. Not touched.
- **`e2e/a11y/keyboard.spec.ts:34`'s `REPO_ROOT` computation and the false axe comment at
  `:23-26` — `FIX-48`.** This task's own item 5 fixes only the screenshot-path line at
  `:141`. It does not repair why the suite is dormant, does not touch `REPO_ROOT`, and
  removes no `test.skip`.
- **The 41 Playwright failures generally — `FIX-09`.** If `viewport-matrix.spec.ts` or
  `state-matrix.spec.ts` fails for a reason unrelated to the path scheme, record it and
  leave it; this task's job is the path, not the suite's pass rate.
- **Any other tracked or untracked path under `e2e/`.** `playwright-report/` and
  `test-results/` are `playwright.config.ts`-configured and already correct;
  `e2e/checkout-f8-screenshots/` is the precedent, already correct and already ignored.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`),
`npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41
failures (`FIX-09`).

No prerequisite; either order against `FIX-58` or against `FIX-48` is safe (see
"Evidence").

```bash
npm run build                                     # expected exit 0
N_BEFORE=$(git ls-files e2e/design/screenshots | wc -l)   # record: 49 at baseline
git rm -r e2e/design/screenshots
npx playwright test e2e/design/viewport-matrix.spec.ts e2e/design/state-matrix.spec.ts
                                                   # record the exit code and per-project results
git add e2e/design/screenshots
N_AFTER=$(git ls-files e2e/design/screenshots | wc -l)
                                                   # expected: N_AFTER == 2 * N_BEFORE — read from the
                                                   # index after `git add`, not from `git diff --staged`,
                                                   # which would also count the 49 staged deletions
git ls-files e2e/design/screenshots | grep -cE "/(mi-bolt-design|mi-bolt-narrow)-"
                                                   # expected: equals N_AFTER — every new path carries a project prefix
npx playwright test e2e/a11y/keyboard.spec.ts     # record the exit code and, per project, whether
                                                   # every step test.skipped (FIX-48 has not landed)
                                                   # or produced screenshots (it has) — record which
git add e2e/design/screenshots                    # re-stage: the keyboard run above may have written
                                                   # new, untracked files that `git ls-files` below must see
git ls-files e2e/design/screenshots | grep -c keyboard
                                                   # expected: 0 if FIX-48 has not landed; if it has,
                                                   # every printed path carries a project prefix
```

**Once this task has landed, `FIX-58`'s own reasoning for scoping its two new projects
away from `e2e/design/*` narrows, and its `testMatch` restriction should stay exactly as
it is anyway.** Before this task, running Firefox or WebKit against `viewport-matrix.spec.ts`
would have overwritten the same 48 paths a third and fourth way; after it, the path
collision that reasoning was built on cannot happen, because every project now writes its
own distinctly-named file. **`FIX-58`'s `testMatch` is not loosened by this task and this
task does not touch `playwright.config.ts` to loosen it** — running the Chromium-only
design suite in two more browser engines is a scope decision about what the suite should
cover, not a safety question, and deciding that scope belongs to whoever next reads
`FIX-58`'s file, not to this task. Record this note in the commit body so the next reader
of `FIX-58` does not re-derive it.

Do not run a bare `npx playwright test`. Name the files explicitly, as above, or the run
also collects `e2e/checkout-f8.spec.ts`, `e2e/deployment/`, the rest of `e2e/a11y/` and
`e2e/network-isolation.spec.ts`, none of which this task owns.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **This task is exempt from browser verification, and the reason is recorded in the commit
  body.** It edits three Playwright spec files — three path expressions and three comments —
  and regenerates evidence images whose pixels are identical to what commit `db6d295` already
  renders; only their filenames change. No component, template, stylesheet, route, label or
  rendered surface differs afterwards, so there is nothing a person can see or click that this
  task changed. That is the *"build script"* case `.claude/rules/browser-verification.md` names,
  claimed here explicitly as that rule requires ("If I think a change is exempt, I say so
  explicitly and say why").

  **The regeneration run is not offered as that verification.** The rule requires the loop to
  run through `mcp__chrome-devtools__*` via the `real-browser-sonnet` agent, with
  `take_snapshot`, `take_screenshot` and `list_console_messages` returning zero errors; a
  headless Chromium driven by Playwright produces none of those three and invokes no such
  agent. The 98 regenerated images are evidence that the **rename** worked — that is this
  task's subject — and evidence of nothing about how the application renders.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R25: N/A beyond the above. This task edits six lines of Playwright test code (three
  path expressions, three comments) across three spec files and regenerates evidence images
  with the same content as before, differently named. It introduces no brand asset, colour,
  dimension, font, layout, copy, data source, state machine, target size or breakpoint, and
  changes no page's rendered output — the screenshots' pixels are identical to what the same
  commit `db6d295` application already renders; only their filenames change. The third file,
  `e2e/a11y/keyboard.spec.ts`, writes no tracked image today (dormant per "Evidence"), so
  this task's edit to it changes no rendered evidence at all yet — only a line of code the
  suite does not currently reach.

## Acceptance criteria

- [ ] **FIX-68-AC01** The project-prefixed screenshot path is present in
      `e2e/design/viewport-matrix.spec.ts`. Run from the repository root:

      ```bash
      grep -n 'route.id' e2e/design/viewport-matrix.spec.ts | grep -c "testInfo.project.name"
      ```

      prints `1`.
- [ ] **FIX-68-AC02** The bare, unprefixed template literal is gone from
      `e2e/design/viewport-matrix.spec.ts`. Run in single quotes exactly as shown so the
      shell passes the backtick through literally:

      ```bash
      grep -c '`${route.id}.png`' e2e/design/viewport-matrix.spec.ts
      ```

      prints `0`.
- [ ] **FIX-68-AC03** Run, in the same single-quoted form:

      ```bash
      grep -c '`${testInfo.project.name}-${surface.routeId}.png`' e2e/design/state-matrix.spec.ts
      ```

      prints `1`, and

      ```bash
      grep -c '`${surface.routeId}.png`' e2e/design/state-matrix.spec.ts
      ```

      prints `0`.
- [ ] **FIX-68-AC04** `e2e/a11y/keyboard.spec.ts`'s screenshot-path line (item 5 of "What
      to change") carries the project prefix and the bare form is gone — run in the same
      single-quoted form so the shell passes the backtick through literally:

      ```bash
      grep -c '`${testInfo.project.name}-${step.name' e2e/a11y/keyboard.spec.ts
      ```

      prints `1`, and

      ```bash
      grep -c '`${step.name.replace' e2e/a11y/keyboard.spec.ts
      ```

      prints `0`.
- [ ] **FIX-68-AC05** The two doc-comment updates (item 2 and item 4 of "What to change")
      are present: `grep -c "<project>-<route>.png" e2e/design/viewport-matrix.spec.ts`
      prints `2` (the header docblock and the inline comment), and
      `grep -c "<project>-<route>.png" e2e/design/state-matrix.spec.ts` prints `1`.
      `e2e/a11y/keyboard.spec.ts` has no matching comment to update (see item 5 of "What to
      change"), so no third count is expected here.
- [ ] **FIX-68-AC06** `npm run build` exits `0`.
- [ ] **FIX-68-AC07** `npx playwright test e2e/design/viewport-matrix.spec.ts e2e/design/state-matrix.spec.ts`
      ran to completion across both configured projects (`mi-bolt-design`,
      `mi-bolt-narrow`), and the exit code and per-project pass/fail counts are recorded in
      the commit body.
- [ ] **FIX-68-AC08** `npx playwright test e2e/a11y/keyboard.spec.ts` ran to completion, and
      the commit body records which of the two cases applied: every step still
      `test.skip`s (`FIX-48` has not landed) and `git ls-files e2e/design/screenshots | grep
      -c keyboard` prints `0`; or `FIX-48` has already landed and every path that same grep
      prints carries a `mi-bolt-design-` or `mi-bolt-narrow-` prefix.
- [ ] **FIX-68-AC09** Every file under `e2e/design/screenshots/` after the regeneration
      carries a project-name prefix: `git ls-files e2e/design/screenshots | grep -vcE "/(mi-bolt-design|mi-bolt-narrow)-[^/]+\.png$"`
      prints `0`. This covers whatever AC08 produced under `keyboard/` as well as the
      regenerated `viewport-matrix`/`state-matrix` tree.
- [ ] **FIX-68-AC10** The tracked count for the `viewport-matrix`/`state-matrix`
      regeneration doubles from whatever `N_BEFORE` was measured immediately before it:
      `git ls-files e2e/design/screenshots | wc -l` **minus** whatever AC08 added under
      `keyboard/` equals `2 * N_BEFORE`, both numbers recorded in the commit body. A
      different multiple, once the `keyboard/` count is subtracted out, is investigated and
      explained in the commit body, not silently accepted.
- [ ] **FIX-68-AC11** `git status --short e2e/checkout-f8-screenshots` and
      `git status --short playwright.config.ts` each print nothing — this task touches
      neither.
- [ ] **FIX-68-AC12** The commit body records: the `FIX-58` ordering note from "How to
      verify"; the `e2e/design/primitives.spec.ts` measurement from "Evidence" (not at
      risk, not touched); and the `FIX-48` ordering note from "Evidence" — the two tasks'
      changed lines in `e2e/a11y/keyboard.spec.ts` are disjoint, and this task's own edit to
      that file is fixed here rather than merely reported, unlike this task's earlier draft.

## Commit

This task is exactly one commit: the six lines of code and comment changes across the
three spec files, plus the deletion and regeneration of `e2e/design/screenshots/`. Do not
bundle it with **FIX-58**, **FIX-48** or **FIX-09**. It is independent of **FIX-58** and
**FIX-48** in either order, but **it must land before FIX-09**: `FIX-09` stages twenty new
`e2e/design/screenshots/<name>-<viewport>.png` files that `e2e/design/primitives.spec.ts:45-50`
writes, this task's `git rm -r e2e/design/screenshots` would delete all twenty, and its
regeneration command names only `viewport-matrix.spec.ts` and `state-matrix.spec.ts`, so
none of the twenty would be written again. Before running the `git rm`, check with
`git ls-files e2e/design/screenshots | grep -cE "/[^/]+-(390|1440)\.png$"`: if that prints
anything other than `0`, FIX-09 has already landed and this task must not be started —
stop and report. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
test: namespace the design-suite screenshot paths by Playwright project
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.
