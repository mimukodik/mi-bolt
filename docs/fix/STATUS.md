# docs/fix — execution status

Measured on 2026-09-19 against branch `feat/mi-bolt-mvp-implementation`, HEAD
`b1f4156`, by an audit session that changed no source file. Every number below
is a measurement taken that day, not a claim copied from a commit body. Where a
commit body and a measurement disagree, this file records the measurement and
says so.

This file exists so the next session can resume without re-running the audit.
It is a record of state, not a task file: it grants nothing and cancels
nothing. `docs/fix/README.md` remains the plan, `docs/fix/GOAL.md` the run
prompt, and the 74 task files the specification.

---

## 1. Where the run stands

**22 of the 74 tasks are committed, in 23 commits. The run stopped after
FIX-71.**

The 22, in the order they landed:

| # | Task | Commit | Trailer present |
|---|---|---|---|
| 1 | FIX-01 | `45edd61` | yes |
| 2 | FIX-04 | `0b36e02` | yes |
| 3 | FIX-05 | `7071958` | yes |
| 4 | FIX-62 | `98e9da4` | yes |
| 5 | FIX-06 | `e7834aa` | yes |
| 6 | FIX-11 | `ca65cd5` | yes |
| 7 | FIX-02 | `f990255` | yes |
| 8 | FIX-03 | `f4224d7` | yes |
| 9 | FIX-07 | `6418443` | yes |
| 10 | FIX-07b | `108b5e4` | yes |
| 11 | FIX-08 | `d8505e2` | yes |
| 12 | FIX-68 | `839b4ba` | yes |
| 13 | FIX-09 | `919f849` | yes |
| 14 | FIX-10 | `0b8f57e` | yes |
| 15 | FIX-12 | `fc2515e` | yes |
| 16 | FIX-13 | `1ff9a87` + `a2f560e` | only on the second |
| 17 | FIX-14 | `c37def1` | **no** |
| 18 | FIX-15 | `627d6e0` | **no** |
| 19 | FIX-16 | `08b4482` | yes |
| 20 | FIX-17 | `0f8f900` | yes |
| 21 | FIX-43 | `02d0235` | **no** |
| 22 | FIX-71 | `b1f4156` | **no** |

FIX-13 legitimately spans two commits under the exception at
`docs/fix/FIX-13.md:764-777`.

The other 52 tasks are not started. All 74 task files still read
`Status: PLANNED — not executed.` at line 3; nothing under `docs/fix/` has been
touched since the package landed.

### The next task

`docs/fix/README.md` section 4 gives two readings and does not settle between
them:

- **FIX-50** — the product-gallery collision row names it directly as the task
  that follows FIX-71, and both its named prerequisites (FIX-16, FIX-71) have
  landed.
- **FIX-22** — FIX-56's own chain (`FIX-56.md:295-296`) requires
  FIX-22 → FIX-44 → FIX-50 *in that order*, which puts FIX-22 and FIX-44 before
  FIX-50. Neither has a prerequisite of its own.

Whoever resumes picks one and records why. Before either, read section 2 of
this file: four gates are red and six landed tasks do not meet their own
acceptance criteria.

---

## 2. Gate results, with exit codes

| Command | Exit | Result | Baseline at `db6d295` |
|---|---|---|---|
| `npm run build` | 0 | green, 4 budget warnings | 0 |
| `npm run lint` | **1** | 3 errors, all in spec files landed tasks wrote | 1 (never ran) |
| `npm run format:check` | **1** | 5 files unformatted | n/a (FIX-03 created the script) |
| `npm run test` (`ng test`) | **1** | 15 files failed, **118 tests failed**, 435 passed, **162 skipped** (715), plus 256 coverage-threshold errors across 75 files | 1 (14/14 files failed) |
| `npx playwright test` | **1** | **10 failed**, 8 skipped, 248 passed | 1 (41 failed, 221 passed) |
| `npx vitest run --config vitest.contract.config.ts` | 0 | 4 files, 56 tests | n/a |
| SDK drift | n/a | **no drift**: a fresh `ng-openapi-gen` run into a temporary directory is byte-identical to the 56 committed files, and all 56 carry the `/* eslint-disable */` header | 0, but dirtied the tree |

The drift measurement was taken non-destructively (generator output redirected
to a temporary directory, then `diff -rq`), so `npm run api:drift` itself has
not been run on this tree.

### The three lint errors, with the commit that introduced each

| Error | Commit | Task |
|---|---|---|
| `src/app/features/catalog/catalog-page.spec.ts:65:10` `'queryInput' is defined but never used` | `02d0235` | FIX-43 (deleted the only caller, left the helper) |
| `src/app/features/product/add-to-cart.spec.ts:719:35` `Unnecessary optional chain on a non-nullish value` | `08b4482` | FIX-16 |
| `src/app/features/product/product-gallery.spec.ts:248:70` `Invalid type "number" of template literal expression` | `b1f4156` | FIX-71 |

### The five unformatted files

`src/app/features/catalog/catalog-page.html`,
`src/app/features/product/add-to-cart.spec.ts`,
`src/app/features/product/product-gallery.ts`,
`src/app/features/product/product-page.html`,
`tests/contract/schema.spec.ts` — introduced by `a2f560e` (FIX-13), `08b4482`
(FIX-16), `02d0235` (FIX-43) and `b1f4156` (FIX-71).

**Both gates were green at their own commits.** ESLint and Prettier were run
over extracted copies of the `f990255` (FIX-02) and `f4224d7` (FIX-03) trees:
exit 0, empty output, on both. Four later tasks broke them and none of the four
ran either gate — their commit bodies mention neither.

One cause is documented and is worth fixing in the task files themselves:
`FIX-10.md:688`, `FIX-14.md:309`, `FIX-16.md:345`, `FIX-43.md:444` and
`FIX-71.md:280` each carry the sentence that `npm run lint` is red for FIX-01's
reasons and is not the executor's to chase. That sentence was already stale
when those tasks ran, because FIX-01 and FIX-02 had both landed.

### The 10 Playwright failures

| Spec | Projects | Note |
|---|---|---|
| `e2e/checkout-f8.spec.ts:28` | both | the product detail page renders an error surface — see defect D1 |
| `e2e/design/primitives.spec.ts:45` (priceblock, productimage) | both | FIX-09-AC03 requires this file green; no task file names this spec |
| `e2e/design/primitives.spec.ts:60` (dialog focus) | both | strict-mode violation: `[role="dialog"]` resolves to 2 elements — see defect D5 |
| `e2e/design/viewport-matrix.spec.ts:95` 320px cart | `mi-bolt-design` only | new since FIX-09 ran; unattributed |
| `e2e/design/viewport-matrix.spec.ts:95` 320px success | `mi-bolt-design` only | baseline failure FIX-09-AC04 was required to attribute to FIX-27 and did not |

The identical 320px assertions pass in the `mi-bolt-narrow` project in the same
run. That divergence is unexplained.

### The 256 coverage-threshold errors

Expected, not a defect. FIX-08 mandates `perFile: true` at 100/100/100/100 and
explicitly forbids any exclusion list; `angular.json:101-107` matches
`FIX-08.md:185-192` byte for byte. The numbers cannot reach 100% while 118
tests never execute. Two files have no owner and no recorded exemption:
`src/environments/environment.development.ts` and
`src/environments/environment.e2e.ts`, both 0%, both `fileReplacements`
targets no unit run can load.

---

## Phase 0 — test infrastructure repair (2026-09-19)

Measured by the orchestrator at commit `a25d419`, against the baseline
recorded in section 2. Nothing in the baseline table above was re-run or
changed.

### Gate results, baseline → now

| gate | baseline | now |
|---|---|---|
| `npm run build` | 0 | 0 |
| `npm run lint` | 1 | 0 |
| `npm run format:check` | 1 | 0 |
| `npx vitest run --config vitest.contract.config.ts` | 0 (4 files, 56 tests) | 0 (4 files, 56 tests) |
| `npm run test` | 1 — 118 failed, 435 passed, **162 skipped** | 1 — **1 failed, 716 passed (717), 0 skipped**, run twice with identical results |
| `npx playwright test` | 1 — 10 failed, 8 skipped, 248 passed | 1 — **8 failed, 8 skipped, 250 passed** |

The unit suite still exits 1 on the pre-existing per-file coverage thresholds
(233 and 237 `ERROR: Coverage` lines across the two runs), which is unchanged
from the baseline and is not a regression.

### The seven commits that produced this, in order

- `36c64de` test: assert product card image on rendered DOM
- `3ed9c0e` test: drop the duplicate TestBed bootstrap
- `0192f9e` test: split the MSW server out of the setup entry
- `d570d90` test: fix catalogue page spec crash and asserts
- `3846949` style: run prettier on the six unformatted files
- `00b5495` test: register the MSW lifecycle per spec file
- `a25d419` test: put every spec on the one shared MSW server

### Cause groups from section 3, and what happened to each

- **A — duplicate `TestBed.initTestEnvironment`** (162 tests reported as
  skipped): fixed, 16 spec files, `3ed9c0e`. 0 skipped now.
- **B — `__dirname` resolving to the workspace root under the builder** (68
  failures): fixed by importing the JSON fixture, `d570d90` and the
  catalog-mock change.
- **C — MSW not intercepting** (21 failures, later 83): the first diagnosis
  was wrong. The real cause is that the Angular unit-test builder replaces
  every `setupFiles` entry with a one-line shim when coverage is on
  (`@angular/build/src/builders/unit-test/runners/vitest/plugins.js:298-308`),
  and Vitest's per-file setup re-run invalidates only that shim module
  (`vitest/dist/chunks/test.DNmyFkvJ.js:4287-4289`), so the chunk holding
  `beforeAll(listen)` evaluated once per worker process. Measured: 7 setup
  evaluations for 38 files with coverage on, 38 with `--coverage false`.
  Fixed by `useMswServer()` called from the spec module, `00b5495`.
- **D — compiled-CSS regex assertions** (2): fixed, `d570d90`.
- **E — `ActivatedRoute` stub was a plain object** (25): fixed, `d570d90`.
- **F — ProductCard assertions read the wrong component boundary** (2): fixed,
  `36c64de`.

### New finding: `msw@2.15.0` cannot have two Node servers listening in one process

Every `setupServer()` is built on one module-level `InterceptorSource`
(`node_modules/msw/lib/node/index.mjs:122-147`) whose `enable()` stacks
another `request` listener on the same `BatchInterceptor` per call
(`node_modules/msw/lib/core/experimental/sources/interceptor-source.mjs:19-22`),
so two servers listening at once dispatch every request twice.
`tests/setup-msw.ts` listens once per worker under `ng test`, so a spec with
a private server collided with it whenever it was its worker's first file.
That, and not the product, is why
`src/app/features/checkout/order-submission.spec.ts:379` counted 20 polls
against a cap of 10 and `:481` counted 2 `createOrder` calls against 1.
Scoped run before: `Tests 2 failed | 12 passed (14)`; after:
`Tests 14 passed (14)`. Eleven specs moved onto the shared server in
`a25d419`. Three of them passed handlers to `resetHandlers()`, which
permanently replaces a server's initial handler list and would have leaked
into every later file in the worker; those became `server.use()`.

### The remaining failures, all owned

- unit, 1: `src/app/layouts/layouts.spec.ts` `T11-AC04 … MobileDrawer depends
  on the AccessibleDialog primitive` — same defect as the baseline's D5.
- e2e, 8: `e2e/checkout-f8.spec.ts:28` in both projects (defect D1, the
  product detail page rendering an error surface);
  `e2e/design/primitives.spec.ts:45` priceblock and productimage in both
  projects (FIX-09-AC03); `e2e/design/primitives.spec.ts:60` dialog focus in
  both projects (defect D5, `[role="dialog"]` resolving to 2 elements).

### Unexplained improvement, flagged as unexplained rather than as a fix

The baseline's two `e2e/design/viewport-matrix.spec.ts:95` failures at 320px
(cart and success, `mi-bolt-design` only) now pass. Nothing in these seven
commits touches e2e or application source — all of them change only
`*.spec.ts` files and two files under `tests/` — so the cause was not
established.

### Browser verification

`real-browser-sonnet` at commit `00b5495`, 17 screenshots under
`.visual-screenshots/2026-09-19-p0-browser/`: catalogue listing, faceted
filtering, product detail, variant selection, add-to-cart and the mobile
drawer (open, focus trap, Escape) all render and behave correctly, zero
console errors and zero failed network requests across the whole run. Four
defects came back, and all four are now owned by a task:

- the cart line's quantity and remove controls are permanently disabled
  (`aria-busy="true"` never clears) — owned by `docs/fix/FIX-21.md`,
  unexecuted; the empty-cart state is unreachable through the UI.
- the header cart badge does not rehydrate after a reload although
  `sessionStorage['mi-bolt.snapshot.default']` holds the item, while the cart
  page itself rehydrates correctly — the baseline's defect D2.
- "Összes szűrő törlése" clears the UI but not the URL, so a reload
  re-applies the filter — owned by `docs/fix/FIX-24.md`, unexecuted.
- the add-to-cart success toast's dismiss control renders as an empty
  bordered box with no visible icon or text, though it carries the
  accessible name "Bezárás" — the baseline's WCAG AA finding.
- two Chrome DevTools issue-panel entries on `/penztar/kosar`: "A form field
  element should have an id or name attribute" and "Incorrect use of
  `<label for=FORM_ELEMENT>`", one each. Not console errors, but in scope
  under the workspace's WCAG AA mandate.

---

## 3. The 118 failing tests, grouped by cause

| Group | Tests | Cause | Verdict |
|---|---|---|---|
| A | 162 reported as **skipped**, 8 suite failures | A second `TestBed.initTestEnvironment` in specs the `@angular/build:unit-test` builder has already bootstrapped (`@angular/build/src/builders/unit-test/runners/vitest/build-options.js:119`). Files: `layouts.spec.ts:36`, `catalog.facade.spec.ts:49`, `checkout-f2.spec.ts:30`, `checkout-f6.spec.ts:50`, `checkout-f8.spec.ts:100`, `checkout-state.spec.ts:120`, `order-submission.spec.ts:105`, `variant-selection.spec.ts:401` | **Landed defect.** FIX-04-AC05 requires `grep -rln "initTestEnvironment" src/` to print nothing; it prints 16 files. FIX-06 moved 22 specs in without applying FIX-04's edit. Files opened by later tasks got an ad-hoc `try/catch` guard instead of a sweep |
| B | 68 | `catalog-mock.spec.ts:698` and `:943` resolve the fixture with `__dirname`, which under this builder is the workspace root → `ENOENT /Users/eggp/docs/api/fixtures/products.json` | **Landed defect.** FIX-07b-AC01's repository-wide `readFileSync` grep still prints this file and always did |
| C | 21 | MSW does not intercept: `ECONNREFUSED ::1:80` / `127.0.0.1:80`, status 0, zero captured requests. Files: `cart-mock.spec.ts`, `mocks-handlers.spec.ts`, `cart.facade.spec.ts`, `success-page.spec.ts` | **Split.** The one test in `mocks-handlers.spec.ts:270` is FIX-10's own and has never passed. The other 20 are **unattributed** — no task file names an interception failure. Root cause not settled |
| D | 2 | `catalog-page.spec.ts:348` and `:359-360` regex over compiled component CSS; `.grid {` never matches `.grid[_ngcontent-%COMP%] {`, and the two-column rule lives in the 640px block, not 1024px | **Unattributed, and NOT FIX-14's doing.** Both failed before `c37def1` and after; the extraction was faithful. Out of scope for FIX-07 and FIX-07b |
| E | 25 | `catalog-page.spec.ts:227-233` provides `ActivatedRoute.queryParamMap` as a plain object, not an Observable → `TypeError: this.route.queryParamMap.pipe is not a function` at `catalog-page.ts:136` | **Unattributed.** Predates `db6d295`. One line (`of(convertParams(...))`) closes 25 failures |
| F | 2 | `product-card.spec.ts:178` reads `aspectRatio` off the `<app-product-image>` host, which has no host binding; `:187` looks for `object-fit: contain` in `ProductCard`'s styles, where it is not declared | **Unattributed.** Predates `db6d295`. Unlanded FIX-29 would break the sibling assertion at `:180` — an unrecorded collision |

Group C is the one open root-cause question. Two readings were not separated:
an order-dependent leak under the builder's `isolate: false` default, or a
duplicated `tests/setup-msw` module instance so `server.use()` lands on an
instance that is not listening. The experiment that would settle it is running
`src/mocks/cart/cart-mock.spec.ts` under a plain vitest config outside the
Angular builder.

---

## 4. Per-task verdicts

### Genuinely done

**FIX-01, FIX-03, FIX-05, FIX-07, FIX-11, FIX-13, FIX-17.** Every measurable
criterion holds against the current tree. FIX-11 is the strongest: the
regenerated SDK is byte-identical to the commit. FIX-03's two gates were green
at its own commit and were broken later by others.

### Done in code, incomplete in evidence

**FIX-02, FIX-08, FIX-12, FIX-14, FIX-15, FIX-62, FIX-68, FIX-71.** The change
is what the task specifies; what is missing is what the acceptance criteria
made load-bearing — exit codes, coverage figures, per-rule N/A reasons, pasted
command output. Specifics worth carrying forward:

- **FIX-02** added `linterOptions: { reportUnusedDisableDirectives: 'off' }`
  (`eslint.config.js:23-25`), which its "What to change" never authorises and
  its body never mentions. With ESLint's installed default restored, the
  `f990255` tree produces 27 `Unused eslint-disable directive` warnings on the
  27 generated files, and `@angular-eslint/builder` prints
  `All files pass linting.` only at zero warnings — so the suppression is what
  produced the string FIX-02-AC01 demands.
- **FIX-12** touched an eighth file the task does not name,
  `src/mocks/repository.ts`, removing four runtime fallbacks. Checked and
  behaviour-safe, but out of scope. It also left `src/app/app.ts:5-6`
  describing a fatal-startup fallback the same commit removed.
- **FIX-14** was committed with the suite red and took FIX-04's escape clause,
  which was closed because FIX-04 had landed. The extraction itself is
  byte-faithful; the line ranges written into FIX-14-AC05 (`67,264p`,
  `268,593p`) are stale against the real pre-image (`67,300p`, `304,631p`).
- **FIX-15** has two criteria that were unsatisfiable when it ran. AC03's
  "exactly five lines" became two the moment FIX-06 landed, and the criterion
  states that fewer than five means the wrong component was deleted — a stop
  condition that fired and was walked past. AC04 compares against `db6d295`
  and was already non-empty.
- **FIX-62** weakened the surviving egress proof. `e2e/network-isolation.spec.ts`
  now returns `{ ok: res.ok }` where the task's own replacement file
  hard-codes `{ ok: true }`. Since MSW answers an unhandled `/api/v1/*` with a
  404, `expect(result.ok).toBe(false)` now passes on any non-2xx and proves
  nothing about egress.
- **FIX-68**'s AC09 invariant (every tracked screenshot carries a project
  prefix) is false today: `919f849` added 20 unprefixed
  `<name>-<viewport>.png` files from `e2e/design/primitives.spec.ts`. FIX-68
  landed before FIX-09 exactly as required; the ordering protected those files
  from deletion but nothing made them prefixed. No task owns that spec's
  screenshot naming.
- **FIX-71**'s AC06 grep (`grep -rn "thumbLabel\|thumb-mark" src`) passes partly
  because `product-gallery.spec.ts:251` writes the identifier as
  `'.thumb-' + 'mark'`. The assertion is correct; splitting the literal to get
  past an acceptance check is not.

### Not done — the task's own criteria fail

- **FIX-04.** AC02 forbids skipped tests; 162 are skipped. AC05's grep prints
  16 files. Undone by FIX-06, not by FIX-04 itself, but the task cannot be
  treated as holding. See group A.
- **FIX-06.** AC07 (lint) and AC08 (the failure list was never produced in the
  prescribed `file:line — test — symptom — owner` form).
- **FIX-07b.** AC01 has never passed: the grep it prescribes printed
  `src/mocks/catalog/catalog-mock.spec.ts` on the day of the commit and prints
  it now; the commit body narrows `src/` to `src/app/`. Worse, two of its three
  files swapped `readFileSync(.scss)` for `ɵcmp.styles` while keeping the regex
  assertions verbatim — the grep passes and the assertions remain exactly as
  evidentially empty as before.
- **FIX-09.** AC03 requires `e2e/design/primitives.spec.ts` green at 24/24; it
  is 18 passed / 6 failed, and was when FIX-09 ran. The commit body restates
  AC03 as "20 screenshot files were generated". AC04's required accounting
  omits the 320px overflow group the criterion names verbatim, and the three
  owners it does name (FIX-19, FIX-35, FIX-52) do not mention that spec;
  `FIX-52.md:238` hands dialog focus to FIX-30. AC07 records a diagnosis
  ("add-to-cart button absent") contradicted by the template in the same commit.
- **FIX-10.** AC07 and AC08 fail: the test FIX-10 itself added
  (`mocks-handlers.spec.ts:270`) has never passed, and AC08's `getCart` half was
  never written. The commit body says both passed. In a real browser the cart
  does survive a reload and is correctly tab-scoped, but the **header cart badge
  does not rehydrate** — see defect D2. AC01 also contains a clause the code
  cannot satisfy: it forbids a `POST /api/v1/carts` returning 201 on the
  reloaded page, while FIX-10's own Part 2 keeps that handler returning 201.
- **FIX-16.** AC02 fails on the code path: `CartFacade.addItem`,
  `dispatchAddItem` and `CartMutationQueue.enqueue` contain no `throw`, so
  `AddToCart.onAdd()`'s `catch` is unreachable and a failed add renders the
  **success** banner. The test that appears to prove otherwise replaces
  `facade.addItem` with a throwing `vi.spyOn`. AC09b's disabled-state test
  renders a hand-copied replica of the markup, not `ProductPage`.
- **FIX-43.** Shipped one of the three lint errors, and the catalogue test it
  added has never passed (it calls `setupHarness()`, which hits group E).
  AC08's grep can never exit 1 while `header-nav` and `filter-panel` exist,
  which the same task forbids touching; the body claims it returns 0 hits.

---

## 5. Defects with no owner in the package

Each needs a decision: fix, file, or leave.

- **D1 — the product detail page renders an error surface in the production
  build.** `test-results/checkout-f8-*/error-context.md` snapshots
  `/telefonok/demo-one-5g` as `A termék nem tölthető be` / `Ismeretlen hiba a
  termék betöltése közben.` / `Újrapróbálom`, and the tracked design screenshot
  `e2e/design/screenshots/1440/mi-bolt-design-product.png` shows the same.
  Long-standing, not a regression. It works correctly under `ng serve`, so the
  suspicion is the MSW worker not controlling the first navigation under
  `scripts/serve-static.mjs`. Blocks both `checkout-f8` failures, and means
  every tracked `*-product.png` is a picture of an error page.
- **D2 — the header cart badge does not rehydrate after a reload.** Add an
  item, reload any ShopLayout page: the badge reads
  `Kosár megnyitása, jelenleg üres` / `0` while
  `sessionStorage['mi-bolt.snapshot.default']` holds the item, and
  `/penztar/kosar` shows it correctly. The badge corrects itself only after
  another cart mutation in the same page load, jumping to the combined total.
  Silent, no console error.
- **D3 — three npm scripts invoke deleted files.** `coverage:manifest`,
  `coverage:unit:check` and `coverage:e2e:check` point at
  `scripts/runtime-manifest.mjs` and `scripts/check-coverage.mjs`, both deleted
  by `d8505e2` (FIX-08). Each exits with `MODULE_NOT_FOUND`, measured. FIX-47
  owns the cleanup and has not landed.
- **D4 — `src/main.ts` executes during the unit run**, throwing
  `Invariant Violation: [MSW] Failed to execute setupWorker in a non-browser
  environment` from `src/mocks/browser.ts:50`. The run's one unhandled
  rejection.
- **D5 — duplicated `role="dialog"`.** CDK's `cdk-dialog-container[role="dialog"]`
  wraps `accessible-dialog.html:4`'s own `role="dialog"`, so a locator resolves
  to two elements. An accessibility defect, not the focus problem FIX-09's body
  attributed to FIX-52.
- **D6 — the `Bezárás` dismiss button is invisible.** Label
  `color: rgb(255,255,255)` on `background-color: rgba(0,0,0,0)` inside a light
  `is-success` banner; contrast ≈1:1, a WCAG AA failure. Variant
  `secondaryOnDark` used on a light surface. Visible in the AddToCart toast and
  in the `/primitives` StatusMessage example.
- **D7 — the 404 page renders unstyled.** Its `<h1>` computes to 16px against
  36px on `/telefonok`; header and footer chrome render normally. FIX-41 owns
  the 404 repair and has not landed, so this one has an owner waiting.
- **D8 — `RecoveredOrder` is dead.** `order-submission.ts:105-109` still exports
  the interface for a method FIX-10 deleted, and the class docstring at
  `:191-193` still advertises `retryUnknownOutcome`, which no longer exists.
- **D9 — a source-text assertion and a facade spy re-entered a FIX-07 file.**
  `add-to-cart.spec.ts:680-689` reads `product-page.ts` and `product-page.html`
  off disk and regexes them; `:629` spies on `facade.addItem`. Both evade the
  criteria written to forbid them, because `readFile` is not `readFileSync` and
  `html`/`ts`/`css` do not end in `Source`/`Html`/`Scss`. Any future guard has
  to match the mechanism, not the variable name.

---

## 6. Process gaps to repair before resuming

- **Five commits carry no `Task: FIX-xx` trailer**: `1ff9a87`, `c37def1`,
  `627d6e0`, `02d0235`, `b1f4156`. `GOAL.md:66-68` calls the trailer the resume
  key, and `GOAL.md` "Resuming" defines the done set as
  `git log --grep "^Task: FIX"`, which returns 18 against 22 landed tasks. **A
  restarted run would re-execute FIX-13 (part 1), FIX-14, FIX-15, FIX-43 and
  FIX-71 on top of their own results.** This file is the workaround; fixing the
  record itself would mean rewriting history, which is the user's call.
- **All 74 task files still read `Status: PLANNED — not executed.`** There is no
  in-repo ledger of what has landed other than `git log` and this file.
- **The contract suite is reachable from no npm script.** `tests/contract/*.spec.ts`
  and `tests/network-isolation.spec.ts` run under neither `npm run test` nor
  anything else in `package.json`; only
  `npx vitest run --config vitest.contract.config.ts` reaches them, and
  `vitest.contract.config.ts:5` documents the gap and points at FIX-47.
  FIX-13's own text asserts the opposite — that its rescued invariants run on
  every `npm run test`.

---

## 7. What was not measured

- `npm run api:drift` itself (measured non-destructively instead).
- FIX-11-AC01 and FIX-11-AC09, which require the gate to be observed failing on
  a dirtied tree.
- The root cause of failure group C, and of the `mi-bolt-design` /
  `mi-bolt-narrow` divergence on the two 320px overflow assertions.
- The AddToCart pending state in a browser: four attempts, including one at 6x
  CPU throttling, always caught the success state. The code path exists
  (`loadingLabel`, `aria-busy`); it was recorded as not observed rather than
  passed.
- Whether lint was green at each individual landed commit. It was measured at
  `f990255` and `f4224d7` (both exit 0) and at HEAD (exit 1), and each current
  error was traced to its introducing commit with `git log -L`.

## 8. Working tree at the time of measurement

Seven tracked screenshots under `e2e/design/screenshots/` are modified by the
Playwright run this audit made, left in place deliberately. `.claude/settings.json`
was already modified before the audit began. Nothing else changed.
