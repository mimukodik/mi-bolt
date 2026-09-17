# FIX-09 — Fix the 41 Playwright failures

Status: PLANNED — not executed.
Severity: blocker
Source: A5 Part 6, A5 Part 4

## Why this is wrong

`npx playwright test` fails **41** tests, measured on `db6d295`. Thirty-six of those
forty-one share one root cause: a lazy-loaded route's root `data-testid` never mounts,
for two different routes, `/canary` and `/primitives`, because the router's catch-all is
declared **before** both in the same array.

**`/canary` is no longer this task's concern.** D19 item 1 removes the separate E2E
source-coverage requirement entirely: `src/app/coverage-canary/` (`canary-page.ts/html/
scss`, `canary.ts`, `unused.ts`), the `/canary` route it serves, `e2e/coverage-canary.spec.ts`
and `e2e/coverage-canary-negative.spec.ts` all go with the pipeline `docs/tasks/T02.md:45`
(T02-AC01) and `docs/spec/testing.md:55` were written for. This task does not repair
`/canary`'s reachability and does not run the two spec files that tested it — they and the
route they exercised are deleted elsewhere in this package. **FIX-62** owns that deletion
under D19 item 1; this task names it as an open item rather than performing it (see "Out
of scope").

`/primitives` **is** this task's concern and is unaffected by D19: it is the design
showcase every `e2e/design/primitives.spec.ts` assertion is written against, and nothing
about its route removes it.

## Evidence

### The route table, in declaration order

`src/app/app.routes.ts` declares five top-level routes. `grep -n "path:" src/app/app.routes.ts`
gives their line numbers; the top-level ones are `:109` (`''`), `:125` (`'telefonok'`),
`:156` (`'kosar'`), `:167` (`'penztar'`), `:181` (`'**'`), `:194` (`'primitives'`) and
`:202` (`'canary'`).

`src/app/app.routes.ts:178-206`, verbatim:

```ts
  // Utility 404 — wrapped in the ShopLayout chrome so the user keeps
  // the standard header/footer when an unknown URL is hit.
  {
    path: '**',
    component: ShopLayout,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
        title: 'MiBolt — Az oldal nem található',
      },
    ],
  },
  // Internal routes ------------------------------------------------------
  {
    path: 'primitives',
    loadComponent: () =>
      import('./features/primitives-showcase/primitives-showcase').then(
        (m) => m.PrimitivesShowcase,
      ),
    title: 'MiBolt — UI primitives',
  },
  {
    path: 'canary',
    loadComponent: () =>
      import('./coverage-canary/canary-page').then((m) => m.CoverageCanaryPage),
    title: 'MiBolt — coverage canary',
  },
];
```

The Angular Router matches routes in array order and takes the first match. `**` matches
every path, so nothing declared after it is ever reachable. Neither `/primitives` nor
`/canary` matches `''`, `'telefonok'`, `'kosar'` or `'penztar'` first, so both fall into
`**` and render `NotFoundPage`.

### The components and testids are fine

```text
src/app/coverage-canary/canary-page.html:3   data-testid="canary-branch"
src/app/features/primitives-showcase/primitives-showcase.html:2   data-testid="primitives-showcase"
```

Both are present, both are the root element the tests look for
(`e2e/coverage-canary.spec.ts:22` expects `getByTestId('canary-branch')`,
`e2e/design/primitives.spec.ts:34` expects `getByTestId('primitives-showcase')`). Nothing
in the components needs changing.

### The 41, grouped, with the arithmetic

Both Playwright projects — `mi-bolt-design` at 1440 and `mi-bolt-narrow` at 390
(`playwright.config.ts:66-81`) — run every spec, so each failing test counts twice.

| Group | Symptom | Specs | Tests × 2 projects |
|---|---|---|---|
| 1 | `getByTestId('canary-branch')` never found | `e2e/coverage-canary.spec.ts` (3), `e2e/coverage-canary-negative.spec.ts` (1), `e2e/network-isolation.spec.ts` (2, both `goto('/canary?branch=true')` first) | 6 × 2 = **12** |
| 2 | `getByTestId('primitives-showcase')` never found | `e2e/design/primitives.spec.ts` (12) | 12 × 2 = **24** |
| 3 | `Kosárba teszem` never appears within 30 s | `e2e/checkout-f8.spec.ts:52` (1) | 1 × 2 = **2** |
| 4 | real horizontal overflow at narrow widths | `e2e/design/viewport-matrix.spec.ts:114` | **3** |

12 + 24 + 2 + 3 = **41**, which matches the measured baseline exactly.

**Group 1 is not this task's either, for a different reason than group 4.** Its three
specs and the `/canary` route they exercise are deleted under D19 item 1, so by the time
this task runs those 12 failures are expected to disappear along with the files that
produced them, not because this task's route-order fix reaches them. See "Why this is
wrong" above.

Group 4's failures are measurements, not flakes: `/penztar/siker/…` reports
`documentElement.scrollWidth` 359 against `window.innerWidth` 320, and
`/penztar/ellenorzes` reports 410 against 390. The assertion is
`e2e/design/viewport-matrix.spec.ts:111-114`:

```ts
          expect(
            overflow.scrollWidth,
            `${route.path} at ${viewport.name}px: documentElement.scrollWidth=${overflow.scrollWidth}, innerWidth=${overflow.innerWidth}`,
          ).toBeLessThanOrEqual(overflow.innerWidth + 1);
```

**Group 4 is not this task's.** It is a real layout defect on two shipped screens and
**FIX-27** owns it.

### Group 3 is probably not the same bug

`/telefonok/demo-one-5g` is matched by the `'telefonok'` route at `:125`, which is
declared *before* the wildcard, so the route-order defect does not explain it. A5 Part 6
groups 1 and 2 together and marks it *"UNVERIFIED: whether groups 1 and 2 share one root
cause or two"* without taking a position on group 3. The instruction below is to prove
each cause before fixing it, and group 3 gets its own proof.

## What to change

### Step 0 — prove the cause before changing one line

**Do not patch thirty-six tests.** One look at `/primitives` in a real browser settles the
cause, and it must be taken, and recorded in the commit body, before any edit. Build
first:

```bash
npx ng build --configuration e2e
```

then start the static host **in the background** and stop it again when the check is
finished — it is the same command `playwright.config.ts:61` runs for the suite:

```bash
PORT=4200 MI_BOLT_E2E_STATIC_DIR=dist/mi-bolt/browser node scripts/serve-static.mjs
```

With it running, and with the `real-browser-sonnet` agent driving a real Chrome per
`.claude/rules/browser-verification.md`:

- navigate to `http://127.0.0.1:4200/primitives`, `take_snapshot`, and confirm the page
  rendered is the 404 page — the document title is `MiBolt — Az oldal nem található` and
  `primitives-showcase` is absent.

If it shows the 404 page, the wildcard-order cause is confirmed and one edit fixes
group 2's 24 failures. If it shows something else — a blank page, a chunk-load error in
`list_console_messages`, a stack trace — **stop and report it**, because the fix below
would then be treating a symptom.

**`/canary` is not checked here.** Its route and the component behind it are deleted
elsewhere in this package under D19 item 1 (see "Why this is wrong"), so its
reachability is no longer a fact this task needs to establish.

There is no `build:e2e` npm script even though `docs/spec/testing.md:122` lists
`npm run build:e2e`; `npx ng build --configuration e2e` is the equivalent
(`angular.json:61-71` declares the configuration). Note the missing script in the commit
body as an observation; adding it is **FIX-47**'s.

### Step 1 — move the wildcard route to the end of the array

One file, `src/app/app.routes.ts`. Move the `'primitives'` block (`:193-200`) so it comes
**before** the `'**'` block, and leave the wildcard as the final element of the array.

**If the `'canary'` block (`:201-206`) is still present when this task runs**, move it
too, in the same edit — its removal is a different task's job under D19 item 1, not an
assumption this task makes. **If it has already been deleted, this step moves only
`'primitives'`.** Either way, the result has the wildcard last. From the `penztar` route
onward, with the `'canary'` block still present:

```ts
  // Internal routes ------------------------------------------------------
  {
    path: 'primitives',
    loadComponent: () =>
      import('./features/primitives-showcase/primitives-showcase').then(
        (m) => m.PrimitivesShowcase,
      ),
    title: 'MiBolt — UI primitives',
  },
  {
    path: 'canary',
    loadComponent: () =>
      import('./coverage-canary/canary-page').then((m) => m.CoverageCanaryPage),
    title: 'MiBolt — coverage canary',
  },
  // Utility 404 — wrapped in the ShopLayout chrome so the user keeps
  // the standard header/footer when an unknown URL is hit. It matches
  // every path, so it must stay the last element of this array; any
  // route declared after it is unreachable.
  {
    path: '**',
    component: ShopLayout,
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/not-found/not-found-page').then((m) => m.NotFoundPage),
        title: 'MiBolt — Az oldal nem található',
      },
    ],
  },
];
```

If the `'canary'` block is already gone, the same result with that block absent —
`'primitives'` directly followed by the wildcard.

Nothing else in the file changes: the routes above `'primitives'` are untouched, every
moved block keeps its contents byte for byte, and the wildcard block gains only the
sentence about staying last. That sentence is the whole point — it is what stops the next
person adding a route below it.

### Step 2 — prove group 3 separately, then decide

With the fix from step 1 built and served, drive the product page in a real browser:
navigate to `http://127.0.0.1:4200/telefonok/demo-one-5g`, `take_snapshot`, and look for a
button whose accessible name is `Kosárba teszem`.

- **If the button is there**, group 3 was a consequence of something the route move
  repaired (for example a chunk that failed to load while the router was resolving the
  wildcard). Re-run `npx playwright test e2e/checkout-f8.spec.ts` and record the result.
  Nothing more to do.
- **If the button is absent**, that is a product defect on the product page, not a
  Playwright defect. Record it in the commit body as
  `e2e/checkout-f8.spec.ts:52 — the add-to-cart button does not render at
  /telefonok/demo-one-5g` and hand it to **FIX-16** (which settles whether `AddToCart` is
  wired in at all) and **FIX-23** (product page defects), by number. **Do not fix the
  product page in this commit** and do not weaken the test.

### Step 3 — do not touch groups 4

Leave the three overflow failures failing. They belong to **FIX-27**.

## Out of scope

- **The three horizontal-overflow failures — FIX-27.** Named in evidence, not fixed here.
  This task's acceptance explicitly allows them to remain red.
- **The add-to-cart button, if step 2 finds it missing — FIX-16 and FIX-23.**
- **The eight skipped Playwright results, from thirteen `test.skip(` call sites.**
  `grep -rn "test\.skip(" e2e/` shows all thirteen at
  `e2e/a11y/keyboard.spec.ts:103`, `:167`, `:172`, `:201`, `:206`, `:231`,
  `e2e/design/state-matrix.spec.ts:108`, `:122`, `:138`, `:149`, `:179`, `:186` and
  `e2e/design/viewport-matrix.spec.ts:145`. Use the anchored pattern: plain `test.skip`
  also matches two docblock sentences, at `keyboard.spec.ts:18` and `state-matrix.spec.ts:24`.
  Every one is a **runtime** `test.skip(true,
  '…')` guard with a reason string like `'cart route not yet implemented (T17–T24)'`, not
  a `test.skip(...)` block modifier. `docs/spec/acceptance.md:26` (AC22) forbids them, and
  **FIX-39** owns the test-policy findings. Note in passing that A5 Part 5 cites this
  prohibition as "AC26"; the sentence is real and it is **AC22** — AC26 is the
  static-build criterion. Do not remove a skip guard here: some of them will start
  failing once the routes render, and turning that into a fix is FIX-39's work, not this
  task's.
- **`src/app/coverage-canary/`, its route and its two E2E specs.** D19 item 1 deletes them
  as part of the pipeline this task's group 1 used to test. **FIX-62** owns that deletion
  under D19 item 1; name it in the commit body as an open item rather than deleting the
  directory here, since deleting a directory this task does not otherwise touch is a wider
  change than this task's own subject.
- **`e2e/` file placement.** Root-level `e2e/` with `testDir: './e2e'`
  (`playwright.config.ts:32`) matches `docs/spec/architecture.md:97` and Playwright
  convention. Correct as it is; FIX-06 leaves it alone and so does this task.
- **Any component file.** `src/app/app.routes.ts` is the only source file this task
  edits. If a second file needs editing, the cause was not the one step 0 proved — stop
  and report.

## How to verify

From the repository root, npm only.

1. `npx ng build --configuration e2e` — must exit **0**.

2. `npx playwright test`

   **This command writes screenshots into the working tree, in two ways.** First, it
   rewrites every tracked PNG under `e2e/design/screenshots/<viewport>/` and
   `e2e/design/screenshots/states/` (`e2e/design/viewport-matrix.spec.ts:120-130` writes one
   per viewport/route pair). **Measure that count immediately before the run** with
   `git ls-files e2e/design/screenshots | wc -l` and record it in the commit body rather
   than expecting a fixed number: it was `49` at the `db6d295` baseline, and **FIX-68**,
   which lands before this task, deletes that tree and regenerates it with a Playwright
   project prefix in every filename, so both the count and the names differ once FIX-68 has
   landed. Second, once `/primitives` renders, `e2e/design/primitives.spec.ts:45-50` starts
   writing **20 new, currently non-existent** files directly into
   `e2e/design/screenshots/` — ten primitives × two Playwright projects, named
   `<name>-<viewport>.png`. Those twenty have never been produced before, because the
   test failed at `beforeEach` long before reaching the screenshot call. They carry no
   project prefix by design: `FIX-68.md:165-174` measured that `primitives.spec.ts` derives
   its own path segment from the project's viewport, so the two projects already write
   non-colliding names and FIX-68 deliberately leaves that file alone.

   Both sets are expected and unavoidable: the suite is the verification. **Do not use
   `git checkout --`, `git restore`, `git stash`, `git reset` or `git clean` to tidy them
   up**, which `.claude/rules/session-lifecycle.md` forbids outright. Stage all of them
   into this commit — the twenty new ones are the visual evidence
   `docs/spec/testing.md:105` asks the design review to compare against — and say in the
   commit body that the verification run produced them, and that this task changed none of
   the eight routes the viewport matrix visits
   (`e2e/design/viewport-matrix.spec.ts:53-65` lists them: `/`, `/telefonok`,
   `/telefonok/demo-one-5g`, `/penztar/kosar`, `/penztar/adatok`, `/penztar/szallitas`,
   `/penztar/ellenorzes`, `/penztar/siker/DEMO-000001` — `/canary` and `/primitives` are
   not among them).

   **Expected result, stated as which failures remain rather than as a total.** The three
   `documentElement.scrollWidth` failures of group 4 remain, and the two group 3 failures
   remain unless step 2 found the button present. Group 1 is not counted here at all: its
   specs are deleted under D19 item 1, whether or not that deletion has landed by the time
   this task runs (if it has not yet landed, those failures are still present and are not
   this task's to explain — see "Out of scope"). No total is promised here, and the reason
   is worth knowing: several of the eight skips are runtime
   `test.skip(true, '<route> not reachable')` guards, so a route that starts rendering can
   turn a skip into a real test that then passes or fails. Read the failure list, not the
   summary counts, and account for every line in it that is not group 1.

3. `npx playwright test e2e/design/primitives.spec.ts` — must exit **0**, 24 passed.

4. `npm run build`, `npm run lint` and `npm run test` — all three must exit **0** (or, for
   `npm run test`, unchanged from the state the tasks before it left).

`npm run lint` and `npm run test` are expected to already be green by the time this task
runs — FIX-01 through FIX-08 own getting them there, and step 4 above is this task's own
proof that the route reorder broke neither. Do not run `npm run api:drift` here; it
regenerates 27 files under `src/app/api/generated/` and its diff does not belong in this
commit.

## Acceptance criteria

- [ ] **FIX-09-AC01** `src/app/app.routes.ts`'s exported `routes` array has `path: '**'`
      as its **last** element. Demonstrate it in the commit body by quoting
      `grep -n "path:" src/app/app.routes.ts`, whose last top-level line must be the
      wildcard.
- [ ] **FIX-09-AC02** The wildcard route block carries a comment stating that it matches
      every path and must stay last, so the next person adding a route cannot repeat the
      defect.
- [ ] **FIX-09-AC03** `npx playwright test e2e/design/primitives.spec.ts` exits `0` with
      24 tests passed. This is the 24 of the 36 baseline failures this task fixes; the
      other 12 (group 1, canary-related) are out of scope — see "Out of scope".
- [ ] **FIX-09-AC04** In the full `npx playwright test` run, **every remaining failure that
      is not group 1 is accounted for by name and owner in the commit body**, and none of
      them is a `getByTestId('primitives-showcase')` timeout. The three
      `documentElement.scrollWidth` assertions at `e2e/design/viewport-matrix.spec.ts:114`
      for `/penztar/siker/DEMO-000001` at 320 and `/penztar/ellenorzes` at 390 are expected
      to remain and are attributed to **FIX-27**; the two `Kosárba teszem` failures may
      remain and are attributed under AC07. A failure that is none of those three groups,
      including one that appeared because a runtime `test.skip` guard stopped firing, is
      this task's to explain in the commit body before the task is accepted. A
      `getByTestId('canary-branch')` failure is expected if the coverage-canary deletion
      has not yet landed, and is not this task's to explain.
- [ ] **FIX-09-AC05** **Real-browser check, mandatory**, run through the
      `real-browser-sonnet` agent per `.claude/rules/browser-verification.md`. A green
      Playwright run is a test result and is not by itself this check; an HTTP 200 and a
      read of the diff are explicitly not it either. Against the `--configuration e2e`
      build served by `scripts/serve-static.mjs`, at viewport width **1440** and again at
      **390**:
      - `/primitives` — `take_snapshot` shows `data-testid="primitives-showcase"`, and
        inside it the ten showcase cards the spec enumerates
        (`e2e/design/primitives.spec.ts:16-27`: `showcase-button`, `showcase-priceblock`,
        `showcase-productimage`, `showcase-errorstate`, `showcase-loadingstate`,
        `showcase-emptystate`, `showcase-formfieldmessage`, `showcase-quantitycontrol`,
        `showcase-accessibledialog`, `showcase-statusmessage`). `take_screenshot`.
      - `/ez-az-oldal-nem-letezik` — `take_snapshot` shows the 404 page with the document
        title `MiBolt — Az oldal nem található`, proving the wildcard still catches
        unknown URLs after the move.
      `list_console_messages` must report **zero** errors on both routes at both widths,
      and `list_network_requests` must show no failed request behind them. Capture a
      screenshot of any failure mode and report it rather than hiding it. `/canary` is not
      part of this check: its route is deleted under D19 item 1, whether or not that
      deletion has landed by the time this task's browser pass runs.
- [ ] **FIX-09-AC06** Step 0's proof is recorded in the commit body: the snapshot evidence
      that `/primitives` rendered the 404 page **before** the edit, so a reader can see the
      cause was proven rather than guessed.
- [ ] **FIX-09-AC07** Group 3's outcome is recorded in the commit body: either
      `e2e/checkout-f8.spec.ts` now passes, with the run output quoted, or the add-to-cart
      button is absent at `/telefonok/demo-one-5g` and the defect is handed to **FIX-16**
      and **FIX-23** by number, with the snapshot that shows it missing. In the second
      case the two failures remain and are listed under AC04 with their owners.
- [ ] **FIX-09-AC08** `git status --short` shows `src/app/app.routes.ts` modified, every
      tracked screenshot under `e2e/design/screenshots/` modified — the count being
      whatever `git ls-files e2e/design/screenshots | wc -l` printed immediately before
      the run, recorded in the commit body — and the 20 new
      `e2e/design/screenshots/<name>-<viewport>.png` files untracked, all of which are
      staged into this commit. **Nothing else.** In particular no file under
      `src/app/api/generated/` appears, which would mean `npm run api:drift` was run; and
      no `git restore`, `git checkout --`, `git stash`, `git reset` or `git clean` was
      used at any point.
- [ ] **FIX-09-AC09** The `mi-bolt-design` R01–R26 record is in the commit body.
      **Applicable and checked in AC05's browser pass: R12** (Hungarian UI labels with
      correct accents — the 404 title and the showcase copy are asserted verbatim),
      **R19** (no-results, network-error, loading, success and disabled are distinct
      states — the primitives showcase is where those states are demonstrated), **R20**
      (keyboard operation, visible focus, meaningful accessible name — the showcase cards
      include the interactive primitives), **R22** (the narrow layout is not a scaled-down
      desktop page — hence the 390 pass beside the 1440 one) and **R26**. The remaining
      R-rules are marked N/A with the one-sentence reason that this task reorders a route
      table and changes no layout, colour, price field, image or commercial claim. Skill
      provenance is stated once in `docs/fix/README.md` section 3, "Every task records
      the design rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns
      it). Cite it from there; do not restate it here.

## Commit

This task is exactly one commit: the route reorder plus the screenshots the verification
run regenerated. Do not bundle it with FIX-27, whose three overflow failures this task
deliberately leaves red, and do not bundle it with any unit-test task. Commit only after
every acceptance criterion above passes.

Suggested subject line, in the repository's `type: summary` style:

```text
fix: move the wildcard route last so /primitives resolves
```

The push and the pull request are not the executor's; they belong to the orchestrating
session.

## Where this sits in the stream

**One task in this stream of nine lands before FIX-09: `FIX-68`.** FIX-68 deletes and
regenerates the whole of `e2e/design/screenshots/`, and the twenty new primitive
screenshots this task stages would be destroyed by that deletion and never rewritten, so
FIX-68 goes first — see `FIX-68.md`, "Commit". Otherwise this task touches one source
file and the Playwright suite, and depends on neither the lint chain (FIX-01 to FIX-03)
nor the unit chain (FIX-04, FIX-06 to FIX-08). It needs only `npm run build` green, which
it was on the `db6d295` baseline.

It is placed last in this stream because it is the one task here whose verification run
dirties the working tree, so running it while another of the nine is in progress would
mix 49 regenerated screenshots into that task's diff.

**FIX-08 is unaffected by this task landing.** Under the pre-D17 design this task made
`/canary` render, which would have let the E2E coverage collector produce a report for
the first time; D19 item 1 removes that collector entirely, so there is no longer a
report for anything to produce and nothing for FIX-08 to re-measure as a consequence of
this task.
