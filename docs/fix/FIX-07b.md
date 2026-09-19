# FIX-07b — Strip the source-text assertions out of the three mixed spec files

Status: PARTIAL — 108b5e4, df1e7a8. Open: AC01's scoped grep now also hits src/main.spec.ts (added later by dd5b51a, outside this task), which the task's own anticipated-exception list does not cover; two of the three rewritten files replaced readFileSync(.scss) with ɵcmp.styles while keeping the same regex assertions.
Severity: blocker
Source: A5 Part 2 (and a correction to it); binding decision **D9**

## Why this is wrong

`docs/spec/testing.md:7` states the rule these files break, in the spec's own words:
*"Passing 100% of written tests is NOT 100% source coverage, nor does source coverage
prove correctness."* `docs/spec/testing.md:24` states what a unit test here must do:
*"Use real Angular TestBed and generated SDK/HttpClient when testing data flow."*

Three spec files read their subject's `.ts`, `.html` and `.scss` files as **raw strings**
and assert regular expressions against the text, beside the real work they also do. A
regular expression on source text passes whether the wiring works or not: it cannot tell
a rendered button from a button in a comment, an event handler that fires from one that
is never bound, or a signal that updates from one that is written and never read. An
assertion of that kind is worth nothing as evidence, and it is worth less than nothing in
a file that also contains real assertions, because the green run cannot be read to see
which kind carried it.

These three are the **mixed** files. Unlike the six that `FIX-07` rewrites, each of them
imports its subject from `src/` and drives real TestBed, real Signal Forms schema calls
or a real SDK request over MSW. **That half stays exactly as it is.** This task deletes
the file-reading helpers, deletes every `const …Source` constant they feed, and replaces
each assertion that used one with a rendered-DOM, emitted-output or intercepted-request
assertion in the same `it` block.

The files say so themselves. `src/app/features/checkout/success-page.spec.ts:22-25`:

```ts
 * The tests inspect the rendered source AND drive the MSW wire path
 * because vitest's esbuild/oxc pipeline strips the Angular signal-input
 * metadata that TestBed's runtime instantiation needs (see
 * `tests/checkout-state.spec.ts` for the runtime pattern). The source-
 * level coverage keeps the gate tight against regressions in template,
 * imports, and wire types; the runtime block confirms the actual end-
 * to-end contract over MSW.
```

That stated reason is the broken runner `FIX-04` repairs. Once TestBed works, the reason
is gone and the source-text half has no defence.

**Why this is a task of its own.** The original FIX-07 rewrote all nine files carrying
368 source-text assertions in one commit. The user split it: *"Mindkettő felosztva"*
("split both"). The seam is the one the files themselves draw — six import nothing from
`src/` and are rewritten whole (`FIX-07`), three import their subject and only lose their
source-text half (this task).

## Evidence

### The pattern

`tests/contact-step.spec.ts:49-62`, the helper and the constants it feeds:

```ts
function read(relative: string): string {
  const base = relative.replace(/\.ts$/, '');
  const sources = [relative, `${base}.html`, `${base}.scss`];
  return sources
    .map((p) => {
      try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
      catch { return ''; }
    })
    .join('\n');
}

const stepSource = read('src/app/features/checkout/contact-step.ts');
const schemaSource = read('src/app/features/checkout/contact.schema.ts');
const pageSource = read('src/app/features/checkout/contact-page.ts');
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
| `tests/review-step.spec.ts` | 64 | 70 | no | FIX-07 |
| `tests/contact-step.spec.ts` | 63 | 105 | yes | **FIX-07b** |
| `tests/cart-page.spec.ts` | 51 | 61 | no | FIX-07 |
| `tests/checkout-delivery.spec.ts` | 51 | 68 | no | FIX-07 |
| `tests/success-page.spec.ts` | 40 | 66 | yes | **FIX-07b** |
| `tests/product-page.spec.ts` | 34 | 46 | no | FIX-07 |
| `tests/product-gallery.spec.ts` | 28 | 30 | no | FIX-07 |
| `tests/add-to-cart.spec.ts` | 26 | 26 | no | FIX-07 |
| `tests/home-page.spec.ts` | 11 | 61 | yes | **FIX-07b** |

**368 source-text assertions across nine files: 114 in this task's three, 254 in
FIX-07's six.** The counting regex is a heuristic — it matches `expect(<name>Source)`,
`expect(<name>Html)` and the like — so treat each number as the count to re-measure
rather than as a constant. The "imports its subject" column is exact, comes from each
file's own import list, and is the seam this split follows.

### What each file actually holds, measured

The three do not share one helper shape, and an executor who assumes they do will leave
`readFileSync` behind in two of them. Measured on `db6d295`:

| File | `src/` imports | file-reading code to delete | constants to delete |
|---|---|---|---|
| `tests/contact-step.spec.ts` | 1 (`contact.schema`) | `readFileSync` import `:31`; `read()` `:49-58` | `:60-62` (`stepSource`, `schemaSource`, `pageSource`) |
| `tests/home-page.spec.ts` | 11 | `readFileSync` import `:41`; **no `read()` function** — four inline `.map(…readFileSync…)` blocks at `:101-132` | the same four blocks; each `const` *is* its own reader |
| `tests/success-page.spec.ts` | 16 | `readFileSync` import `:32`; `read()` `:90-99`; **a second helper, `componentStyles()` `:101-124`**, with two further `readFileSync` calls at `:106` and `:115` | `:129-135` (seven constants) |

`grep -n "readFileSync" <file>` returns 2 hits in `contact-step.spec.ts`, 5 in
`home-page.spec.ts` and 4 in `success-page.spec.ts`. Every one of them goes.

### The acceptance-criterion headers these files carry

Each of the three maps its assertions to task acceptance criteria in a header comment,
and each has one `describe` block per criterion. **Those mappings are the index of what
the file covers and they stay.**

| File | Header mapping | `describe` blocks |
|---|---|---|
| `tests/contact-step.spec.ts` | `:10-24`, T20-AC01…T20-AC05 | `:101`, `:263`, `:314`, `:348`, `:382` |
| `tests/home-page.spec.ts` | `:8` and `:30` name AC04 and AC05 | `:314`, `:381`, `:458`, `:598`, `:645`, named `T14-AC01`…`T14-AC05` |
| `tests/success-page.spec.ts` | `:6-17`, T24-AC01…T24-AC05 | `:141`, `:169`, `:200`, `:227`, `:252` |

### A correction to the audit report this task follows

A5 Part 2 names five files and **does not mention these three at all**. It treats the
problem as confined to files that import nothing from `src/`. The measurement above shows
otherwise: `tests/contact-step.spec.ts` carries 63 source-text assertions, more than any
file A5 does name except `review-step.spec.ts`, while importing its subject and running
real schema tests. A5's list is a starting point, not the boundary.

### The coverage consequence

A source-text assertion contributes nothing to statement coverage of the file it names,
because the file is read as a string rather than executed. The components behind these
three specs are therefore covered only by whatever real work each file already does.
`coverage:unit:check`, the command that used to measure this, no longer exists under
D17; `npm run test`'s own per-file coverage report after this task is what says where
they stand — the audit's own numbers live in its working directory and not in this
repository, so re-measure rather than quoting them forward.

## What to change

Three files, at the paths `FIX-06` moves them to. **This task never edits a file under
`tests/`; by the time it runs, all three live under `src/`.**

| Replace only the source-text assertions (three) |
|---|
| `src/app/features/checkout/contact-step.spec.ts` |
| `src/app/features/home/home-page.spec.ts` |
| `src/app/features/checkout/success-page.spec.ts` |

The six files `FIX-07` rewrites in full are not opened in this commit.

### The replacement pattern, decided rather than offered

Every replaced assertion uses `TestBed.createComponent` and asserts on the **rendered
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

The example is `AddToCart` because it is the shortest component in the package with an
input, a click and a rendered result; the shape is what transfers, not the component.
The click drives a real `CartFacade` call over the generated SDK, so MSW must be
answering the cart endpoints the facade reaches — `POST /api/v1/carts`
(`src/mocks/cart/cart.handlers.ts:262`) and `POST /api/v1/carts/:cartId/items`
(`:286-287`) — for the assertion to be reached at all. Register the handlers the test
needs through the shared server, exactly as the mock specs already do; do not stub the
facade to skip the request.

**Two patterns are explicitly ruled out, so the executor does not have to weigh them.**

- **Do not use `TestBed.runInInjectionContext(() => new SomeComponent())`.** That pattern
  exists at `src/app/features/checkout/checkout-f2.spec.ts:94` and A5 recommends copying it because it
  "avoids `createComponent()`". That avoidance was a workaround for the same broken
  runner this package already fixed; `createComponent` works after `FIX-04`. The pattern
  also forces the test to reach into private state — `src/app/features/checkout/checkout-f2.spec.ts:97-128`
  sets `step['confirmPending']`, `step['selectedOptionId']`, `step['postalCode']` and five
  more — which asserts on the implementation instead of on what the user sees.
  `docs/tasks/T21.md:32` is the house rule: *"UI criteria require rendered DOM/user-action
  assertions; API criteria require actual SDK requests intercepted by MSW."*
- **Do not mock the facade, the `Api` service or `HttpClient` to avoid the HTTP
  boundary.** `docs/spec/testing.md:24` forbids it in terms: *"Do not mock the Api
  service, HttpClient or facades just to avoid testing the HTTP boundary; do not replace
  business HTTP with provideHttpClientTesting/HttpTestingController."* Where a component
  needs data, let the real SDK call go out and let MSW's Node server answer it — the
  server is available from `tests/setup-msw.ts` and `FIX-06` registers it as the
  builder's setup file.

### The procedure, per file

1. Delete the `readFileSync` import and every file-reading helper listed in the table
   above — both of `success-page.spec.ts`'s, and all four of `home-page.spec.ts`'s inline
   blocks, not only the first.
2. Delete every `const …Source` constant they feed.
3. For each assertion that used one of those constants, write a DOM, output or
   intercepted-request assertion **in the same `it` block**, asserting the same contract
   the regex was standing in for.
4. Leave every assertion that already drives TestBed, the Signal Forms schema or the SDK
   exactly as it is. Do not renumber, rename or reorder a `describe`.
5. Delete `resolvePath` / `workspaceRoot` only once nothing else uses them; a leftover
   unused import fails `npm run lint`.

### What each file must still cover

Every criterion named in a header comment keeps a named test in the same file. A
criterion that genuinely cannot be asserted from the DOM — a computed style at a specific
viewport, a sticky position, a contrast ratio — is **not** allowed to fall back to a
source-text regex. It moves to the browser check in the acceptance criteria below, or to
the `e2e/design/` suite that already owns viewport and state matrices, and the file's
header records where it went. Do not leave a criterion with no assertion anywhere and do
not leave it silently absent: `docs/spec/testing.md:18` requires that *"Any new file or
changed coverage boundary needs an explicit classification."*

`T14-AC05` ("mobile content order and 320 px clip safety") and `T20-AC05` ("default,
touched-invalid, submitted-invalid, loading and server-error visual states on narrow and
desktop views") are the two most likely to move. `docs/spec/screens.md:13` and
`docs/spec/acceptance.md:11` (AC07) both require verification at 320, 390, 768, 1024,
1440 and 1920 CSS px, which is where those two belong.

## Out of scope

- **The six files `FIX-07` rewrites in full.** `add-to-cart.spec.ts`,
  `cart-page.spec.ts`, `checkout-delivery.spec.ts`, `product-gallery.spec.ts`,
  `product-page.spec.ts` and `review-step.spec.ts` are that task's. Do not open them here,
  even to copy a helper out.
- **Changing what a component does.** This task rewrites assertions. If a replaced
  assertion fails because the component genuinely does not do what its acceptance
  criterion says, that is a real defect: record it in the commit body with the FIX number
  that owns that screen (FIX-18 through FIX-25 for screen defects, FIX-26 through FIX-32
  for responsive and accessibility, FIX-33 through FIX-35 for design fidelity), and leave
  the test failing rather than weakening it to pass. Do not repair a component here.
- **Moving any file — FIX-06.** All three are already where they need to be.
- **`vitest.config.ts`, `angular.json` and the runner — FIX-04.**
- **Coverage thresholds — FIX-08.**
- **Unreached acceptance criteria, formerly counted by `npm run verify:traceability` —
  FIX-40.** That gate is deleted under D17 along with the count it produced — its baseline
  of 43 was measured by a command that no longer exists and is not a number to carry
  forward. The human record of requirement traceability that replaces it is
  `docs/mi-bolt/execution/traceability.md`, which FIX-40 item 4 already commissions. This
  commit changes how many criteria that document can mark reached; record the note in the
  commit body and do not chase the remainder here.
- **The cart being lost on reload — FIX-10.** `success-page.spec.ts`'s T24-AC02 is about
  a refresh restoring the receipt, and the browser check below walks a route where that
  defect is live. Report what you see; do not fix it here.
- **The other fifteen specs FIX-06 moved.** A5's Part 2 sweep was explicitly not
  exhaustive (*"Not an exhaustive sweep of all ~700 tests"*). If the counting command
  above turns up a tenth file with source-text assertions, name it in the commit body as
  a finding and leave it.

## How to verify

From the repository root, npm only.

1. `grep -rln "readFileSync" --include="*.spec.ts" src/` — must print **nothing**. This is the
   whole point of the pair of tasks and it can only pass once `FIX-07` has also landed, which
   is why this task runs second.

   **The `--include="*.spec.ts"` is load-bearing, not tidiness.** The unscoped form also prints
   `src/app/app.routes.ts`, which carries `readFileSync` at `:60` and `:100` inside
   `resolveLazyResources()` — a production JIT resource shim, not a spec. **`FIX-59`** owns
   removing it (`FIX-59.md:276-278`), this task's Out of scope forbids touching production
   route code, and nothing in this task's ordering requires `FIX-59` to have landed first. Do
   not widen this grep and do not edit `app.routes.ts` to make an unscoped form pass.

2. `grep -rlnE "expect\([A-Za-z0-9_]*([Ss]ource|Html|Scss)\b" src/` — must print nothing.

3. `grep -c "expect(" <path>` for each of the three, recorded in the commit body before
   and after, so a reviewer can see assertions were replaced rather than deleted. **A file
   with materially fewer assertions than it started with is a coverage loss dressed as a
   cleanup.** The baseline totals are 105, 61 and 66.

4. `npm run test` — must exit **0**, or exit non-zero only on failures that are real
   product defects, each listed in the commit body with its owning FIX number.

5. Run `npm run test` before your first edit and again after your last, and record both
   coverage figures in the commit body. There is no target number: the pair is the
   evidence that this task did not reduce coverage, and **FIX-08** is what turns the
   thresholds into a gate. Do not carry the 56.42 % figure forward — it was measured by
   `npm run test:unit:coverage` over the 30 specs under `tests/` only, a runner and a
   denominator that no longer exist, so it cannot be compared with anything `ng test`
   reports. `coverage:unit:check`, the gate that used to bucket issues per file, no longer
   exists under D17; also record, from `npm run test`'s own per-file coverage output, the
   statement coverage of `src/app/features/checkout/contact-step.ts`,
   `src/app/features/home/home-page.ts` and `src/app/features/checkout/success-page.ts`,
   before and after.

6. `npm run build` and `npm run lint` — both must exit **0**. Lint is where a leftover
   `resolvePath` or `workspaceRoot` import turns up.

This task runs `npm run test` and `npm run lint` itself as steps 4 and 6 above, so neither
is a gate it defers. The one gate it genuinely defers is `npx playwright test` (FIX-09).
`npm run coverage:e2e:check`, `npm run verify:traceability` and `npm run check:test-policy`
are deleted under D17 and no longer exist to be red or green. Do not run
`npm run api:drift` or `npx playwright test` here; both leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-07b-AC01** `grep -rln "readFileSync" --include="*.spec.ts" src/` prints nothing, and
      `grep -rlnE "expect\([A-Za-z0-9_]*([Ss]ource|Html|Scss)\b" --include="*.spec.ts" src/`
      prints nothing. No spec under `src/` reads its subject off disk any more. Both greps are
      scoped to `*.spec.ts` because `src/app/app.routes.ts:60` and `:100` carry `readFileSync`
      in production code that **FIX-59** removes and this task may not touch; record in the
      commit body that the unscoped form still prints that one path and names `FIX-59` as its
      owner, so a later reader does not mistake the scope for an oversight.
- [ ] **FIX-07b-AC02** Each of the three files has a named `it` for every acceptance
      criterion its header comment claims — T20-AC01…AC05, T14-AC01…AC05 and
      T24-AC01…AC05 — and every one of those tests asserts on rendered DOM, an emitted
      output, or a request MSW intercepted. Demonstrate it in the commit body with the
      criterion-to-test-name table, one row per criterion.
- [ ] **FIX-07b-AC03** Every assertion each file already made against TestBed, the Signal
      Forms schema or the SDK still exists and still passes. Show it in the commit body as
      the before-and-after `grep -c "expect("` count per file against the baselines 105,
      61 and 66, with the difference accounted for line by line.
- [ ] **FIX-07b-AC04** `grep -rn "provideHttpClientTesting\|HttpTestingController" src/`
      prints nothing, and no `vi.mock` or `vi.spyOn` was added against `Api`, `HttpClient`
      or any `*.facade.ts` — check with
      `git diff --staged | grep -nE "vi\.(mock|spyOn).*(Api|HttpClient|Facade)"`, which
      must print nothing. `git diff --staged | grep -n "runInInjectionContext(() => new "`
      must print nothing either.
- [ ] **FIX-07b-AC05** The before/after `npm run test` coverage figures required by "How
      to verify" step 5 are quoted in this commit's body, together with the per-file
      statement coverage `npm run test` reports, before and after, for
      `src/app/features/checkout/contact-step.ts`, `src/app/features/home/home-page.ts`
      and `src/app/features/checkout/success-page.ts`. No target figure is set for those
      three files, because none was measured before this task was written; the gate is
      that the numbers were read and recorded. `coverage:unit:check`, the gate that used
      to report an issue count for these, no longer exists under D17; **FIX-08** is what
      turns `npm run test`'s thresholds into a gate.
- [ ] **FIX-07b-AC06** `npm run build` exits `0` and `npm run lint` exits `0`.
      `git diff --staged | grep -cE "\.(skip|todo|only)\("` prints `0`, per
      `docs/spec/acceptance.md:26` (AC22).
- [ ] **FIX-07b-AC07** **Real-browser check, mandatory.** These three specs cover screens
      a person uses, and a criterion that cannot be asserted from jsdom is moved to this
      check rather than dropped. Run it through the `real-browser-sonnet` agent per
      `.claude/rules/browser-verification.md`; a green unit run, an HTTP 200 or a read of
      the diff is explicitly **not** this check. Three routes:
      - `/` at viewport widths **1440**, **390** and **320** — the three widths
        `docs/spec/screens.md:13` and `docs/spec/acceptance.md:11` (AC07) name that this
        file's T14-AC05 depends on. `take_snapshot` and confirm the hero, the three
        shopping entry points, four featured products and the three "how the demo works"
        tiles are present, and that at 390 and 320 the content order is heading, message,
        CTA, illustration with no horizontal overflow. `take_screenshot` at each width.
      - `/penztar/adatok` at **1440** and **390** — `fill` the contact form with an
        invalid e-mail and submit; `take_snapshot` and confirm an error summary appears
        and focus lands in it, then on the first invalid field (T20-AC02). Confirm there
        is no marketing checkbox and no account requirement, and that the demo notice is
        present (T20-AC03).
      - the success route, `/penztar/siker/:orderId`, at **1440** — reach it by walking
        the wizard from `/penztar/kosar` with one item, since the route is guarded.
        `take_snapshot` and confirm the receipt shows an order number, line items, a
        total, the payment method and the simulation notice (T24-AC01), and that keyboard
        focus is on the success heading (T24-AC05).
      `list_console_messages` must report **zero** errors on every route, before and after
      each interaction. Capture a screenshot of any failure mode and report it rather than
      hiding it. Record every criterion that was moved from jsdom to this check, by
      criterion id, in the commit body.
- [ ] **FIX-07b-AC08** The `mi-bolt-design` R01–R26 record is in the commit body.
      **Applicable and checked in AC07's browser pass: R12** (Hungarian UI labels with
      correct accents — the contact-form errors and the receipt copy are asserted
      verbatim), **R13** (device price, monthly fee, installment, duration and one-time
      cost are separate fields — the receipt's line items and total), **R15** (demo data
      labelled as demo data — the contact step's demo notice and the receipt's simulation
      notice), **R19** (no-results, network-error, loading, success and disabled are
      distinct states — each file's state coverage) and **R26**. The remaining R-rules are
      marked N/A with the one-sentence reason that this task rewrites test files and
      changes no component, layout, colour or copy. Skill provenance is stated once in
      `docs/fix/README.md` section 3, "Every task records the design rules": the
      installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns
      it). Cite it from there; do not restate it here.
- [ ] **FIX-07b-AC09** Every replaced test that fails because the component under test is
      genuinely wrong is listed in the commit body as
      `spec file:line — criterion id — what the component does instead — owning FIX
      number`, and none of them was made to pass by weakening the assertion.

## Commit

This task is exactly one commit covering all three files. Do not bundle it with `FIX-07`,
`FIX-06` or `FIX-08`. `FIX-07` and this task are two commits because the user asked for
the original nine-file task to be split — *"Mindkettő felosztva"* ("split both") — so
folding them back together undoes the decision this file exists to carry out. Commit only
after every acceptance criterion above passes.

Suggested subject line, in the repository's `type: summary` style:

```text
test: drop the source-text assertions from the three mixed spec files
```

The push and the pull request are not the executor's; they belong to the orchestrating
session.

## Where this sits in the stream

**FIX-04 must land first.** Without it `TestBed.createComponent` throws
`ReferenceError: document is not defined`, which is the exact excuse these files were
written under; replacing assertions on a runner that still cannot run them would produce
failures for the old reason.

**FIX-06 must land first.** It moves all three to the paths this task edits, and it
rewrites their `'../src/…'` imports. Editing them under `tests/` first would mean editing
and then moving.

**FIX-07 must land first, and this task depends on it.** Two reasons, both concrete. The
replacement pattern is settled there rather than here: those six files are rewritten from
nothing, so they are where the TestBed-plus-MSW shape gets decided, and this task then
applies a settled shape inside files whose other half has to keep passing untouched.
And AC01 above — no spec under `src/` reads its subject off disk — is a repository-wide
check that neither commit can satisfy alone; it belongs to whichever runs second, and
that is this one.

**FIX-08 must land after both.** Turning coverage thresholds on before the 368
source-text assertions become real ones would gate the branch against a coverage figure
these two tasks are about to move by a large margin.
