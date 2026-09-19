# FIX-07 — Rewrite the six source-text-only spec files as behaviour tests

Status: DONE — 6418443. Rewrites the six source-text-only spec files as real TestBed behaviour tests.
Severity: blocker
Source: A5 Part 2

## Why this is wrong

`docs/spec/testing.md:7` states the rule these files break, in the spec's own words:
*"Passing 100% of written tests is NOT 100% source coverage, nor does source coverage
prove correctness."* `docs/spec/testing.md:24` states what a unit test here must do:
*"Use real Angular TestBed and generated SDK/HttpClient when testing data flow."*

Nine spec files instead read their subject's `.ts`, `.html` and `.scss` files as **raw
strings** and assert regular expressions against the text. A regular expression on source
text passes whether the wiring works or not: it cannot tell a rendered button from a
button in a comment, an event handler that fires from one that is never bound, or a
signal that updates from one that is written and never read. The components those files
claim to cover report between 0% and 2.6% real statement coverage while their "specs"
report green.

**Six of those nine are this task's.** They import nothing at all from `src/` — their
whole import lists are `node:fs`, `node:path` and `vitest` — so they execute none of the
code they claim to cover, and each one is rewritten in full. The other three are mixed
files that do real TestBed and SDK work beside their source-text assertions; **`FIX-07b`**
strips the source-text half out of those and leaves the rest of each file standing. The
user ordered that split in their own words, *"Mindkettő felosztva"* ("split both"), after
being shown that one commit would otherwise rewrite nine files carrying 368 source-text
assertions.

The files say so themselves. `tests/add-to-cart.spec.ts:20-23`:

```ts
 * The vitest runtime cannot instantiate Angular components through
 * the legacy-decorator transform (see product-page.spec.ts for the
 * full explanation); the suite below inspects the source directly.
 * `ng build` exercises the template / signal-input pipeline end to
```

That stated reason is the broken runner FIX-04 repairs. Once TestBed works, the reason is
gone and the files have no defence.

## Evidence

### The pattern

`tests/add-to-cart.spec.ts:27-40`:

```ts
import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolvePath(process.cwd());

function read(relative: string): string {
  const base = relative.replace(/\.ts$/, '');
  const sources = [relative, `${base}.html`, `${base}.scss`];
  return sources
    .map((p) => {
      try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
      catch { return ''; }
    })
```

Note the `catch { return ''; }`: when a file is missing the helper silently returns an
empty string, so an assertion that a pattern is **absent** passes for a file that does not
exist at all.

### How many assertions this is, measured

Counted on commit `db6d295` with this command, which the executor can re-run:

```bash
for f in tests/*.spec.ts; do
  n=$(grep -cE "expect\([A-Za-z0-9_]*([Ss]ource|Html|Scss|Template|Styles)\b" "$f")
  tot=$(grep -c "expect(" "$f")
  echo "$f source-text=$n total=$tot"
done
```

| File | source-text assertions | total `expect(` calls | imports its subject? | Owned by |
|---|---|---|---|---|
| `tests/review-step.spec.ts` | 64 | 70 | no | **FIX-07** |
| `tests/contact-step.spec.ts` | 63 | 105 | yes | FIX-07b |
| `tests/cart-page.spec.ts` | 51 | 61 | no | **FIX-07** |
| `tests/checkout-delivery.spec.ts` | 51 | 68 | no | **FIX-07** |
| `tests/success-page.spec.ts` | 40 | 66 | yes | FIX-07b |
| `tests/product-page.spec.ts` | 34 | 46 | no | **FIX-07** |
| `tests/product-gallery.spec.ts` | 28 | 30 | no | **FIX-07** |
| `tests/add-to-cart.spec.ts` | 26 | 26 | no | **FIX-07** |
| `tests/home-page.spec.ts` | 11 | 61 | yes | FIX-07b |

**368 source-text assertions across nine files: 254 in this task's six, 114 in
FIX-07b's three.** The counting regex is a heuristic — it matches `expect(<name>Source)`,
`expect(<name>Html)` and the like — so treat each number as the count to re-measure
rather than as a constant. The "imports its subject" column is exact and comes from each
file's own import list, and it is the seam the split follows: six of the nine import
**nothing** from `src`, so they cannot be executing anything and are rewritten whole,
while the three that do import their subject keep everything they already execute. Both
columns were re-measured on commit `db6d295` and every row matched.

### Two corrections to the audit report this task follows

A5 Part 2 names five files. Two things it says need correcting, and both are checkable:

1. **`tests/cart-page.spec.ts` is a sixth file of the same kind**, not, as A5 Part 1 put
   it, a file where "no direct src import found in a quick grep". Its whole import list is
   `node:fs`, `node:path` and `vitest`, and it carries 51 source-text assertions. Its own
   header at `:24-28` gives the same excuse as the others: *"The tests inspect the
   rendered source directly because vitest's esbuild/oxc pipeline strips the Angular
   signal-input metadata that TestBed's runtime instantiation needs."*
2. **Three further files are mixed**, which A5 does not mention at all:
   `tests/contact-step.spec.ts`, `tests/home-page.spec.ts` and
   `tests/success-page.spec.ts` each do real TestBed work **and** carry source-text
   assertions beside it. They are not rewritten wholesale; only their source-text
   assertions are replaced, and that is **`FIX-07b`**, not this task. Do not open those
   three files here.

### The coverage consequence

A5 Part 2 quotes the issue list `coverage:unit:check` reported for the same four
components, before D17 removed that command; it no longer exists, so what follows is kept
as the historical measurement that named these four, not as something to re-run:

```text
- [unvisited-owned-file] src/app/features/checkout/review-step.ts
- [unvisited-owned-file] src/app/features/product/add-to-cart.ts
- [threshold-not-met] src/app/features/product/product-gallery.ts (statements=2.56)
- [threshold-not-met] src/app/features/product/product-page.ts (statements=1.51)
```

Each of those four has a dedicated spec file and still contributes 0% to 2.6% real
coverage, historical figures and not a target for this task. That log lives in the
audit's own working directory and not in this repository; `coverage:unit:check`, the
command that produced it, no longer exists under D17, so after FIX-04, FIX-06, this task
and FIX-07b, `npm run test`'s own per-file coverage report is what says where those four
stand — see "How to verify" step 4.

## What to change

Six files, at the paths FIX-06 moves them to. **This task never edits a file under
`tests/`; by the time it runs, all six live under `src/`.**

| Rewrite in full (six) |
|---|
| `src/app/features/product/add-to-cart.spec.ts` |
| `src/app/features/cart/cart-page.spec.ts` |
| `src/app/features/checkout/checkout-delivery.spec.ts` |
| `src/app/features/product/product-gallery.spec.ts` |
| `src/app/features/product/product-page.spec.ts` |
| `src/app/features/checkout/review-step.spec.ts` |

The three mixed files — `src/app/features/checkout/contact-step.spec.ts`,
`src/app/features/home/home-page.spec.ts` and
`src/app/features/checkout/success-page.spec.ts` — belong to **`FIX-07b`** and are not
opened in this commit.

### The replacement pattern, decided rather than offered

Every rewritten assertion uses `TestBed.createComponent` and asserts on the **rendered
DOM** or on an **emitted output**, driving the component the way a user would. Not on
source text, and not on a private field.

A worked example, written against the real component API rather than a sketch.
`AddToCart` takes one required input, `selection: AddToCartSelection`
(`src/app/features/product/add-to-cart.ts:42-48` and `:63`); its clickable element is the
`<button>` that `app-button` renders inside `[data-testid="add-to-cart-button"]`
(`src/app/features/product/add-to-cart.html:2-12` and
`src/app/shared/ui/button/button.html:1-12`); and the confirmation string it composes is
`` `${productName}, ${colorName}, ${storageGb} GB – ${qty} darab a kosárban.` ``
(`src/app/features/product/add-to-cart.ts:166-170`).

```ts
import { TestBed } from '@angular/core/testing';
import { AddToCart, type AddToCartSelection } from './add-to-cart';

const selection: AddToCartSelection = {
  variantId: 'demo-one-5g-graphite-256',
  quantity: 2,
  productName: 'Demo One 5G',
  colorName: 'Grafit',
  storageGb: 256,
};

const fixture = TestBed.createComponent(AddToCart);
fixture.componentRef.setInput('selection', selection);
await fixture.whenStable();

const button = fixture.nativeElement.querySelector<HTMLButtonElement>(
  '[data-testid="add-to-cart-button"] button',
);
button.click();
await fixture.whenStable();

expect(
  fixture.nativeElement.querySelector('app-status-message')?.textContent,
).toContain('Demo One 5G, Grafit, 256 GB – 2 darab a kosárban.');
```

The click drives a real `CartFacade` call over the generated SDK, so MSW must be
answering the cart endpoints the facade reaches — `POST /api/v1/carts`
(`src/mocks/cart/cart.handlers.ts:262`) and `POST /api/v1/carts/:cartId/items`
(`:286-287`) — for the assertion to be reached at all. Register the handlers the test
needs through the shared server, exactly as the mock specs already do; do not stub the
facade to skip the request.

**Two patterns are explicitly ruled out, so the executor does not have to weigh them.**

- **Do not use `TestBed.runInInjectionContext(() => new SomeComponent())`.** That pattern
  exists at `tests/checkout-f2.spec.ts:118` and A5 recommends copying it because it
  "avoids `createComponent()`". That avoidance was a workaround for the same broken
  runner this package already fixed; `createComponent` works after FIX-04. The pattern
  also forces the test to reach into private state — `tests/checkout-f2.spec.ts:121-128`
  sets `step['confirmPending']`, `step['selectedOptionId']`, `step['postalCode']` and five
  more — which asserts on the implementation instead of on what the user sees.
  `docs/tasks/T21.md:32` is the house rule: *"UI criteria require rendered DOM/user-action
  assertions; API criteria require actual SDK requests intercepted by MSW."*
- **Do not mock the facade, the `Api` service or `HttpClient` to avoid the HTTP
  boundary.** `docs/spec/testing.md:24` forbids it in terms: *"Do not mock the Api
  service, HttpClient or facades just to avoid testing the HTTP boundary; do not replace
  business HTTP with provideHttpClientTesting/HttpTestingController."* Where a component
  needs data, let the real SDK call go out and let MSW's Node server answer it — the
  server is available from `tests/setup-msw.ts` and FIX-06 registers it as the builder's
  setup file.

### What each rewritten file must still cover

Every one of the six carries a header comment mapping its assertions to acceptance
criteria — `T16-AC01` through `T16-AC05` in `product-page.spec.ts:5-25`, `T18-AC01`
through `T18-AC05` in `cart-page.spec.ts:5-25`, `T21-AC01` through `T21-AC05` in
`checkout-delivery.spec.ts:5-20`, `T22-AC01` through `T22-AC05` in
`review-step.spec.ts:12-27`, `T18-AC01` through `T18-AC05` in
`add-to-cart.spec.ts:6-12` (AC02 through AC04 explicitly deferred there to the cart
page, which owns them), and `T16-AC02` / `T16-AC05` in `product-gallery.spec.ts:2`
and `:13-25`. **Keep those mappings.** The rewritten file must still have
a named test for each criterion its header claims, and the header stays as the index of
what the file covers.

A criterion that genuinely cannot be asserted from the DOM — a computed style at a
specific viewport, a sticky position, a contrast ratio — is **not** allowed to fall back
to a source-text regex. It moves to the browser check in the acceptance criteria below,
or to the `e2e/design/` suite that already owns viewport and state matrices, and the
file's header records where it went. Do not leave a criterion with no assertion anywhere
and do not leave it silently absent: `docs/spec/testing.md:18` requires that
*"Any new file or changed coverage boundary needs an explicit classification."*

## Out of scope

- **Changing what a component does.** This task rewrites tests. If a rewritten test fails
  because the component genuinely does not do what its acceptance criterion says, that is
  a real defect: record it in the commit body with the FIX number that owns that screen
  (FIX-18 through FIX-25 for screen defects, FIX-26 through FIX-32 for responsive and
  accessibility, FIX-33 through FIX-35 for design fidelity), and leave the test failing
  rather than weakening it to pass. Do not repair a component here.
- **Moving any file — FIX-06.** All six are already where they need to be.
- **`vitest.config.ts`, `angular.json` and the runner — FIX-04.**
- **Coverage thresholds — FIX-08.** Coverage will rise a great deal in this commit; that
  is a welcome side effect, not this task's gate.
- **Unreached acceptance criteria, formerly counted by `npm run verify:traceability` —
  FIX-40.** That gate is deleted under D17 along with the count it produced — its baseline
  of 43 was measured by a command that no longer exists and is not a number to carry
  forward. The human record of requirement traceability that replaces it is
  `docs/mi-bolt/execution/traceability.md`, which FIX-40 item 4 already commissions.
  Rewriting these six files changes how many criteria that document can mark reached;
  record the note in the commit body and do not chase the remainder here.
- **The three mixed spec files — FIX-07b.** `contact-step.spec.ts`, `home-page.spec.ts`
  and `success-page.spec.ts` keep their `read()` helper and their source-text assertions
  until that task runs. Do not open them here and do not finish the job early by
  stripping one of them: these are two commits because the user asked for two.
- **The other fifteen specs FIX-06 moved.** FIX-06 moves 24 files; nine of them are
  the ones counted above — six here and three in FIX-07b — and fifteen are not. A5's Part 2 sweep was explicitly not
  exhaustive (*"Not an exhaustive sweep of all ~700 tests"*). If the counting command
  above turns up a tenth file with source-text assertions, name it in the commit body as
  a finding and leave it; widening this task past its six files makes it two tasks.

## How to verify

From the repository root, npm only.

1. For each of the six paths in "What to change": `grep -c "readFileSync" <path>` must
   print `0`. The wider form, `grep -rln "readFileSync" --include="*.spec.ts" src/`, still
   prints the three mixed files at this point, because FIX-07b has not run yet; that wider
   check is FIX-07b's gate and is not chased here. **The unscoped `grep -rln "readFileSync" src/`
   additionally prints `src/app/app.routes.ts`**, which carries it at `:60` and `:100` inside
   `resolveLazyResources()` — production code that **`FIX-59`** removes and that neither this
   task nor `FIX-07b` may touch. Use the `--include="*.spec.ts"` form so that file never enters
   either task's evidence.

2. `grep -rc "expect(" src/app/features/product/add-to-cart.spec.ts` and the same for the
   other five — record each count in the commit body, before and after, so a reviewer
   can see assertions were replaced rather than deleted. **A rewritten file with
   materially fewer assertions than it started with is a coverage loss dressed as a
   cleanup.**

3. `npm run test` — must exit **0**, or exit non-zero only on failures that are real
   product defects, each listed in the commit body with its owning FIX number.

4. Run `npm run test` before your first edit and again after your last, and record both
   coverage figures in the commit body. There is no target number: the pair is the
   evidence that this task did not reduce coverage, and **FIX-08** is what turns the
   thresholds into a gate. Do not carry the 56.42 % figure forward — it was measured by
   `npm run test:unit:coverage` over the 30 specs under `tests/` only, a runner and a
   denominator that no longer exist, so it cannot be compared with anything `ng test`
   reports.

   Also record, from `npm run test`'s own per-file coverage output, the statement
   coverage of the four files named in the evidence above —
   `src/app/features/checkout/review-step.ts`, `src/app/features/product/add-to-cart.ts`,
   `src/app/features/product/product-gallery.ts`,
   `src/app/features/product/product-page.ts` — before and after.
   `coverage:unit:check`, the gate that used to report these as `unvisited-owned-file`, no
   longer exists under D17; `npm run test`'s own per-file report is what shows whether
   each moved off zero, and **FIX-08** is what turns a per-file threshold into a gate.

5. `npm run build` and `npm run lint` — both must exit **0**.

This task runs `npm run test` and `npm run lint` itself as steps 3 and 5 above, so neither
is a gate it defers. The one gate it genuinely defers is `npx playwright test` (FIX-09).
`npm run coverage:e2e:check`, `npm run verify:traceability` and `npm run check:test-policy`
are deleted under D17 and no longer exist to be red or green. Do not run
`npm run api:drift` or `npx playwright test` here; both leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-07-AC01** For each of the six files named in "What to change",
      `grep -c "readFileSync" <path>` prints `0` and
      `grep -cE "expect\([A-Za-z0-9_]*([Ss]ource|Html|Scss)\b" <path>` prints `0`. The
      repository-wide `grep -rln "readFileSync" src/` still lists the three mixed files
      after this commit; that is FIX-07b's criterion, not this one.
- [ ] **FIX-07-AC02** Each of the six files has a named `it` for every acceptance
      criterion its header comment claims, and every one of those tests asserts on
      rendered DOM, an emitted output, or a request MSW intercepted. Demonstrate it in
      the commit body with the criterion-to-test-name table, one row per criterion.
- [ ] **FIX-07-AC03** `grep -rc "TestBed.createComponent" src/` returns a non-zero count
      for each of the six fully rewritten files, and
      `grep -rn "runInInjectionContext(() => new " src/` shows no occurrence added by
      this commit.
- [ ] **FIX-07-AC04** `grep -rn "provideHttpClientTesting\|HttpTestingController" src/`
      prints nothing, and no `vi.mock` or `vi.spyOn` was added against `Api`, `HttpClient`
      or any `*.facade.ts` — check with
      `git diff --staged | grep -nE "vi\.(mock|spyOn).*(Api|HttpClient|Facade)"`, which
      must print nothing.
- [ ] **FIX-07-AC05** `npm run test`'s own per-file coverage report shows non-zero
      statement coverage for `src/app/features/checkout/review-step.ts` and
      `src/app/features/product/add-to-cart.ts` (both 0% before this task, per the evidence
      above), and the before/after `npm run test` coverage figures required by "How to
      verify" step 4 are quoted in this commit's body. `coverage:unit:check`, which used to
      report these as `unvisited-owned-file`, no longer exists under D17.
- [ ] **FIX-07-AC06** `npm run build` exits `0` and `npm run lint` exits `0`.
      `git diff --staged | grep -cE "\.(skip|todo|only)\("` prints `0`, per
      `docs/spec/acceptance.md:26` (AC22).
- [ ] **FIX-07-AC07** **Real-browser check, mandatory.** These six specs cover screens a
      person uses, and a criterion that cannot be asserted from jsdom is moved to this
      check rather than dropped. Run it through the `real-browser-sonnet` agent per
      `.claude/rules/browser-verification.md`; a green unit run, an HTTP 200 or a read of
      the diff is explicitly **not** this check. Two routes, both at viewport width
      **1440** and again at **390**:
      - `/telefonok/demo-one-5g` — click the button named `Kosárba teszem`, then
        `take_snapshot` and confirm a status message naming the product, the colour, the
        storage and the quantity appears (the behaviour `add-to-cart.spec.ts`'s T18-AC01
        header claims). `take_screenshot` before and after the click.
      - `/penztar/kosar` — with one item in the cart, `take_snapshot` and confirm the
        line shows image, name, variant, unit price, quantity and line total, and that a
        subtotal is present (T18-AC02).
      `list_console_messages` must report **zero** errors on both routes, before and
      after each interaction. Capture a screenshot of any failure mode and report it
      rather than hiding it. Record every criterion that was moved from jsdom to this
      check, by criterion id, in the commit body.
- [ ] **FIX-07-AC08** The `mi-bolt-design` R01–R26 record is in the commit body.
      **Applicable and checked in AC07's browser pass: R12** (Hungarian UI labels with
      correct accents — the status message and the cart line copy are asserted verbatim),
      **R13** (device price, monthly fee, installment, duration and one-time cost are
      separate fields — the cart line and subtotal assertions), **R15** (demo data
      labelled as demo data — no rewritten test may assert a claim of a real order),
      **R19** (no-results, network-error, loading, success and disabled are distinct
      states — each rewritten file's state coverage) and **R26**. The remaining R-rules
      are marked N/A with the one-sentence reason that this task rewrites test files and
      changes no component, layout, colour or copy. Skill provenance is stated once in
      `docs/fix/README.md` section 3, "Every task records the design rules": the
      installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns
      it). Cite it from there; do not restate it here.
- [ ] **FIX-07-AC09** Every rewritten test that fails because the component under test is
      genuinely wrong is listed in the commit body as
      `spec file:line — criterion id — what the component does instead — owning FIX
      number`, and none of them was made to pass by weakening the assertion.

## Commit

This task is exactly one commit covering all six files. Splitting it further by file
would leave part of the set still reading its subject off disk while the rest had been
converted, which is the half-done state the task exists to end. Do not bundle it with
FIX-06, FIX-07b or FIX-08 — FIX-07b is a separate commit because the user asked for the
original nine-file task to be split, and bundling them back together undoes that
decision. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's `type: summary` style:

```text
test: replace source-text assertions with real TestBed behaviour tests
```

The push and the pull request are not the executor's; they belong to the orchestrating
session.

## Where this sits in the stream

**FIX-04 must land first.** Without it `TestBed.createComponent` throws
`ReferenceError: document is not defined`, which is the exact excuse these six files were
written under; rewriting them onto a runner that still cannot run them would produce six
files that fail for the old reason.

**FIX-06 must land first.** It moves all six to the paths this task edits. Rewriting them
under `tests/` first would mean rewriting and then moving, and every import the rewrite
adds would be written against a path that is about to change.

**FIX-07b must land after this one.** It strips the source-text assertions out of the
three mixed files. The replacement pattern is decided here rather than there: these six
files are rewritten from nothing, so they are where the TestBed-plus-MSW shape is settled,
and FIX-07b then applies that settled shape inside files whose other half has to keep
passing untouched. FIX-07b also owns the repository-wide check that no spec under `src/`
reads its subject off disk, which no single commit can satisfy on its own.

**FIX-08 must land after both.** Turning coverage thresholds on before the 368
source-text assertions become real ones would gate the branch against a coverage figure
this task and FIX-07b are about to move by a large margin.
