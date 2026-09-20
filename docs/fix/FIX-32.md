# FIX-32 — Settle and fix add-to-cart under touch emulation

Status: PLANNED — not executed.
Severity: major, provisional — the defect is unconfirmed and Phase 1 may close this task unchanged.
Source: B3-F2

**Prerequisite: `FIX-16` lands before this task**, because FIX-16 changes what a tap on
"Kosárba teszem" does (`docs/fix/README.md` §4).

## Why this is wrong

`docs/spec/screens.md` S3 requires the product page to let the user "add an available quantity",
and its **Mobile** paragraph puts that action on the sticky rail: "A compact sticky rail shows
price+same add action and status". `docs/spec/acceptance.md` **AC07** requires all four families to
work at 320/390/768/1024/1440/1920, and **AC10** requires "A single global authoritative mock cart
supports add/merge/change/remove". If tapping "Kosárba teszem" on a phone does nothing, the
application's central action is unavailable to every mobile user and the whole purchase flow is
unreachable from a phone.

**But it is not established that it does nothing on a phone.** What was measured is that it does
nothing under one browser-automation tool's mobile-plus-touch emulation. The verifier that found it
said so and refused to name a cause, and this task does the same. **A task file that tells you to
fix a bug that may not exist is worse than no task file**, so this one is written in two phases:
Phase 1 settles whether the defect is real, and Phase 2 is chosen by Phase 1's answer — including
the branch where the answer is "the application is fine and the tooling was lying", in which case
the task closes with that recorded and no application code touched.

Read the whole file before you start. Do not skip to Phase 2.

## Evidence

Measured on commit `db6d295`.

### What was observed

At an emulated viewport of `390 × 844`, device scale factor **3**, with `mobile` and `touch`
emulation enabled, clicking "Kosárba teszem" on `/telefonok/demo-one-5g` did nothing. Reproduced
**3 out of 3 attempts**. Specifically:

- The cart badge stayed at `0`.
- **No console error** of any kind.
- The button was **not** disabled.
- `document.elementFromPoint` at the click coordinates returned the button itself, so nothing
  visible was covering it.

### What isolates the variable

| Configuration | Result |
|---|---|
| `1440 × 900`, no touch, not mobile | the click works |
| `390 × 844`, scale 1, **no** touch, **not** mobile | the click **works** |
| `390 × 844`, scale 3, **mobile**, **touch** | the click does nothing, 3/3 |

The width is therefore not the variable. Touch and mobile emulation is.

### What the source says, which narrows the search but settles nothing

The CTA is an ordinary native button with an ordinary Angular click binding.
`src/app/shared/ui/button/button.html:1-12`:

```html
<button
  type="button"
  class="root"
  ...
  [disabled]="disabled() || loading()"
  (click)="onClick($event)"
>
```

`src/app/shared/ui/button/button.ts:51-58`:

```ts
  onClick(event: MouseEvent): void {
    if (this.disabled() || this.loading()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    this.pressed.emit(event);
  }
```

and the page's handler, `src/app/features/product/product-page.ts:251-270`, ends with:

```ts
    void this.cartFacade.ensureCart().then(() => {
      void this.cartFacade.addItem(v.selectedVariant!.id, v.quantity);
    });
```

There is **no touch-specific code anywhere in the path**, and nothing that could suppress a tap:
`grep -rn "touch-action\|pointer-events\|user-select" src --include="*.scss" --include="*.css"
--include="*.html"` returns exactly one hit in the whole application,
`src/app/shared/ui/button/button.scss:24` — `user-select: none`, which controls text selection and
has no effect on click dispatch. A tap on a native `<button>` produces a `click` event in every
real mobile browser.

That makes a real touch-handler gap in the Angular binding **unlikely** — and unlikely is not
settled, which is why Phase 1 exists.

### Three hypotheses, none of them established

- **H1 — tooling.** The automation dispatched a synthetic touch sequence that Chrome did not turn
  into a `click` on that element. This costs nothing to test and Phase 1 tests it first.
- **H2 — two overlapping CTAs.** Below 1024 px the product page renders **two** "Kosárba teszem"
  controls: the in-flow one at `src/app/features/product/product-page.html:88-100` and the rail's
  at `:130-139`, and `product-page.scss:159-178` gives the rail `z-index: 10`. A click aimed at one
  could land on the other's host element padding, where there is no `<button>` to receive it.
  **`FIX-26` removes that duplication** by hiding the in-flow CTA below 1024. If `FIX-26` has
  already landed when you run Phase 1 and the defect does not reproduce, H2 is the answer and this
  task closes by recording that.
- **H3 — a real gap.** Something in the application suppresses the activation under mobile
  emulation. The source evidence above makes this the least likely of the three, but it is the only
  one that would require an application change.

### The one thing that is certain

`@playwright/test` **1.63.0** is installed in this repository
(`node_modules/@playwright/test/package.json`), and its device registry contains a real
touch-capable Chromium profile, read from the installed package rather than from memory:

```
devices['Pixel 5'] = {
  viewport: { width: 393, height: 727 },
  screen: { width: 393, height: 851 },
  deviceScaleFactor: 2.75,
  isMobile: true,
  hasTouch: true,
  defaultBrowserType: 'chromium'
}
```

The repository's existing Playwright projects are **not** touch-capable — both spread
`devices['Desktop Chrome']`, which is `{ isMobile: false, hasTouch: false }`
(`playwright.config.ts:66-81`), and the narrow one only narrows the viewport to `390 × 844`. That is
exactly the **non-touch** configuration in which the click was measured to **work**. So no existing
test in this repository has ever exercised a tap.

## What to change

### Phase 1 — settle it (mandatory, and it may be the whole task)

Write `e2e/add-to-cart-touch.spec.ts`. Override the context for this file only with `test.use(...)`;
do **not** add a project to `playwright.config.ts`, because `testDir` is `./e2e` with no per-project
`testMatch`, so a third project would re-run every existing spec a third time.

```ts
import { devices, expect, test } from '@playwright/test';

const PRODUCT = '/telefonok/demo-one-5g?variant=demo-one-5g-graphite-256';

/**
 * B3-F2: "Kosárba teszem" did nothing under a 390x844x3 mobile+touch
 * emulation driven by the chrome-devtools MCP, and worked at the same
 * width without touch. This suite settles whether a real touch context
 * reproduces it. `tap()` dispatches touch events; `click()` dispatches
 * mouse events. Running both in the same touch-enabled context is what
 * separates a tooling artifact from an application defect.
 */
test.describe('B3-F2 — add to cart under touch', () => {
  test.use({
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });

  test('tap adds the item to the cart', async ({ page }) => {
    await page.goto(PRODUCT, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('cart-badge')).toHaveText('0');
    await page.getByTestId('purchase-cta').locator('button').tap();
    await expect(page.getByTestId('cart-badge')).toHaveText('1');
  });

  test('click adds the item to the cart in the same touch context', async ({ page }) => {
    await page.goto(PRODUCT, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('cart-badge')).toHaveText('0');
    await page.getByTestId('purchase-cta').locator('button').click();
    await expect(page.getByTestId('cart-badge')).toHaveText('1');
  });
});

test.describe('B3-F2 — add to cart on a real device profile', () => {
  test.use({ ...devices['Pixel 5'] });

  test('tap adds the item to the cart', async ({ page }) => {
    await page.goto(PRODUCT, { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('cart-badge')).toHaveText('0');
    await page.getByTestId('purchase-cta').locator('button').tap();
    await expect(page.getByTestId('cart-badge')).toHaveText('1');
  });
});
```

Notes you need before you run it, none of which are optional:

- `locator.tap()` requires `hasTouch: true` on the context. Both `test.use` blocks set it; the
  Pixel 5 descriptor sets it too.
- `[data-testid="purchase-cta"]` is on the `<app-button>` **host** element
  (`product-page.html:132`), and the clickable element is the `<button>` inside it. `.locator('button')`
  is what targets the real control, and it is what makes H2 above impossible to hit by accident.
- `[data-testid="cart-badge"]` is at `src/app/core/navigation/header-nav.html:74` and `:78`; it
  renders `0` when the cart is empty, so `toHaveText('0')` is a real precondition assertion rather
  than a wait for absence.
- The suite runs against the **production build** served from `dist/mi-bolt/browser`
  (`playwright.config.ts:52-65`), so `npm run build` must run first.
- Both existing projects (`mi-bolt-design`, `mi-bolt-narrow`) pick up every file in `e2e/`, so this
  file runs twice with identical `test.use` overrides. That is harmless; expect six results, not
  three.

Then run Phase 1 and read the answer off this table:

| tap in the touch context | click in the touch context | tap on Pixel 5 | What it means | Go to |
|---|---|---|---|---|
| passes | passes | passes | No application defect. The MCP's synthetic touch input, or H2's duplicate CTA, produced the observation. | **Phase 2a** |
| passes | **fails** | passes | Touch input works; mouse input in a touch context does not. This is a tooling-interaction result, not a user-facing defect — no real user sends a mouse event to a touch device. | **Phase 2a**, with this distinction recorded |
| **fails** | either | either | A real defect. Something in the application does not respond to a genuine tap. | **Phase 2b** |

If the three results disagree in any pattern the table does not list, treat that as **Phase 2b**
and say in the report which cells you actually got.

### Phase 2a — the application is fine

**Change no application code.** Not the button, not the product page, not a stylesheet. Adding a
`(touchend)` handler, a `touch-action` declaration, or a pointer-event polyfill "just in case" is
forbidden: it is speculative code for a scenario that was measured not to occur, it would be a
second activation path on top of the native `click`, and `.claude/CLAUDE.md` ("Simplicity first")
rules it out.

What you do instead:

1. Keep `e2e/add-to-cart-touch.spec.ts`. It is now a regression guard for a real risk the
   repository had no coverage for at all, and it stays valuable whichever way Phase 1 went.
2. Record the finding: B3-F2 does not reproduce in a real Playwright touch context; the three
   results; and, if `FIX-26` had already landed, note that as a possible explanation (H2) rather
   than a proven one.
3. Close the task. That is a complete and correct outcome, not a failure to find anything.

### Phase 2b — there is a real defect

Only if Phase 1's tap failed. Debug it from the evidence, in this order, recording what each step
showed:

1. In the failing touch context, attach listeners before the tap and record which of them fire:
   `pointerdown`, `pointerup`, `touchstart`, `touchend`, `mousedown`, `mouseup`, `click` — on the
   inner `<button>`, on the `<app-button>` host, and on `document`. The first event that does not
   arrive is where the chain breaks.
2. If `click` fires on the element but the badge does not move, the break is downstream of
   `button.ts`'s `onClick`. Instrument `product-page.ts:251` and the two promise steps after it,
   and check the network panel for `POST /api/v1/carts` and `POST /api/v1/carts/:id/items`.
3. If `click` does not fire but `touchend` does, the break is in event dispatch. Establish whether
   a scroll or a drag threshold cancelled the tap, and whether the rail's `position` and `z-index`
   (`product-page.scss:159-178`, and **`FIX-26`** changes them) are involved.

Then fix the narrowest thing the investigation named, in the file the investigation named, and add
the failing case to `e2e/add-to-cart-touch.spec.ts`. **Do not fix anything the investigation did
not name.** If the investigation lands in the product page's rail, stop and report it: **`FIX-26`**
owns that rail, and the fix belongs in that task rather than here.

## Out of scope

- **The product page's layout and its buy rail.** `FIX-26` owns the single-column collapse, the
  fixed rail and the removal of the duplicate CTA. If Phase 2b's investigation points there, report
  it and stop; do not edit `product-page.scss` or `product-page.html`.
- **The `Button` primitive**, unless Phase 2b's investigation names it specifically and the
  recorded evidence shows the break is inside it. It is a native `<button>` with a native `(click)`
  and a documented reason to stay that way.
- **Adding any touch handler, `touch-action` rule or pointer-event polyfill on suspicion.** See
  Phase 2a.
- **The cart-reload defect.** `FIX-10` owns it. The spec above never reloads a `/penztar/*` route,
  which is why it asserts on the header's cart badge rather than by navigating to the cart.
- **The 41 pre-existing Playwright failures.** `FIX-09` owns them. Run the new file on its own.
- **Adding a touch project to `playwright.config.ts`.** The per-file `test.use` is the smaller
  change and it does not multiply the whole suite's run time. If a later task wants a standing
  touch project, that is its decision to make.
- **Settling the variant URL, the invalid deep link or the not-found state.** `FIX-23` owns all
  three; the spec above pins `?variant=demo-one-5g-graphite-256` only so the fixture is
  deterministic. That pin has no effect until `FIX-23` lands: today the query parameter is never
  parsed (`product-page.ts:190`, `:205` call `toString()` on the `ParamMap` without reading
  `variant`), so the page renders its default variant regardless of the query string.

## How to verify

Run these in order, from the repository root. The package manager is **npm 11.17.0**; there is no
pnpm and no mise in this repository.

**Step 1 — build.**

```
npm run build
```

Expected exit code 0. This command was measured green on commit `db6d295`.

**Step 2 — Phase 1.**

```
npx playwright test e2e/add-to-cart-touch.spec.ts
```

Record the **full** result for all six runs — three tests across the two existing projects — pass or
fail, with the assertion message for any failure. **A failure here is a result, not an error to be
worked around.** Do not modify the spec to make it pass.

Two warnings:

- The suite runs against the **production build** served from `dist/mi-bolt/browser`
  (`playwright.config.ts:52-65`), so step 1 must have run first.
- This spec takes no screenshots, so it does not touch the 49 tracked images under
  `e2e/design/screenshots/`. If you run any other design spec, that one does; do **not** use
  `git restore`, `git checkout --`, `git stash`, `git reset` or `git clean` on them afterwards.

**Step 3 — real browser, and it is mandatory.** Whichever phase you land in, the finding has to be
confirmed by hand as well as by Playwright, because the whole doubt in this task is about how a
tool synthesises input. On `/telefonok/demo-one-5g` in a real browser at 390 × 844 with mobile and
touch emulation on, tap "Kosárba teszem" and read the cart badge. Capture a screenshot before and
after, and check `list_console_messages` for errors and `list_network_requests` for the two cart
calls. If a physical phone or tablet is available, repeat there and say so — a real device is the
strongest evidence available for this particular question, and the verifier that raised B3-F2 asked
for exactly that.

**Step 4 — unit tests**, to confirm nothing regressed:

```
npm run test
```

Run it before your first edit and again after your last, and record both coverage figures in the
commit body. There is no target number: the pair is the evidence that this task did not reduce
coverage, and **FIX-08** is what turns the thresholds into a gate. Do not carry the 56.42 % figure
forward — it was measured by `npm run test:unit:coverage` over the 30 specs under `tests/` only, a
runner and a denominator that no longer exist, so it cannot be compared with anything `ng test`
reports. `npm run test` fails 14 of 14 files at the baseline for a reason **FIX-04** owns; record
that rather than treating it as this task's regression.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` while working on this task: it rewrites tracked files and leaves
the working tree dirty. **Do not run the bare `npx playwright test` either** — the full suite is
270 tests, rewrites all 49 tracked images under `e2e/design/screenshots/`, and is `FIX-09`'s.
**The scoped command named in "How to verify" is the sanctioned exception and is mandatory**:
run exactly that command, nothing wider. `e2e/add-to-cart-touch.spec.ts` is a file this task
creates and it writes no image, so this run rewrites no tracked file at all;
`git status --short e2e/design/screenshots` must still print nothing afterwards. This run is
**Phase 1**, the measurement that routes the rest of the task, so skipping it is not an option.
Run it deliberately, read the result, and check `git status --short` afterwards; anything it
wrote is either committed with a stated reason or left out of the commit with a stated reason.

## Acceptance criteria

The first six apply whichever phase you land in. AC07 and AC08 are the two mutually exclusive
closing criteria: **exactly one of them is ticked**, and the other is marked "not applicable —
Phase 2a/2b was not taken", with the Phase 1 result as the reason.

Every browser criterion is checked in a real browser driven through `mcp__chrome-devtools__*`.
Reading the diff, an HTTP 200, a green unit test and a file listing are none of them a browser
check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-32-AC01** `e2e/add-to-cart-touch.spec.ts` exists, uses `test.use` with
      `hasTouch: true` and `isMobile: true`, exercises both `tap()` and `click()` in the same touch
      context, and exercises `devices['Pixel 5']`. `playwright.config.ts` is **unchanged**.
- [ ] **FIX-32-AC02** `npx playwright test e2e/add-to-cart-touch.spec.ts` has been run and all six
      results are recorded verbatim in the task evidence, pass or fail. This criterion is about the
      record, not about the outcome.
- [ ] **FIX-32-AC03** The Phase 1 outcome is stated explicitly against the decision table in
      "Phase 1" above: which row was matched, and therefore whether Phase 2a or Phase 2b was
      entered. If the results matched no row, that is stated instead and Phase 2b was entered.
- [ ] **FIX-32-AC04** In a real browser at `390 × 844` with mobile and touch emulation, the cart
      badge reading before and after tapping "Kosárba teszem" is recorded, with a screenshot of
      each. `list_console_messages` reports zero errors, and `list_network_requests` is recorded
      showing whether `POST /api/v1/carts` and `POST /api/v1/carts/:id/items` were sent. The badge
      stayed at `0` across three attempts before this task.
- [ ] **FIX-32-AC05** The same measurement at `1440 × 900` without touch, as the control. It worked
      before this task and must still work.
- [ ] **FIX-32-AC06** Whether a physical touch device was used is stated either way. If one was, the
      result is recorded. If none was available, that is said plainly rather than left out —
      `.claude/CLAUDE.md` requires an unverified claim to be marked, not omitted.
- [ ] **FIX-32-AC07** *(Phase 2a only)* `git diff --name-only` for this commit lists
      **`e2e/add-to-cart-touch.spec.ts` and nothing else**. No file under `src/` is modified. The
      commit body states that B3-F2 did not reproduce, gives the three Phase 1 results, and names
      H1 or H2 as the explanation with the evidence for it rather than asserting one without.
- [ ] **FIX-32-AC08** *(Phase 2b only)* The failing event in the chain is named, with the listener
      output from step 1 of Phase 2b quoted. The fix touches only the file that investigation
      named. `e2e/add-to-cart-touch.spec.ts` contains a test that fails before the fix and passes
      after it, and both runs are recorded. If the investigation pointed at the product page's
      rail, no fix was made here and `FIX-26` was named as the owner instead.
- [ ] **FIX-32-AC09** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; this task names no
      spec file of its own, so if it has not landed, record that verbatim.

### Design rules (mi-bolt-design 1.0.1)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- [ ] **FIX-32-AC10** Applicable and asserted above: **R21** ("minimum 44×44 CSS px target area
      throughout the shopping flow" — record the rect of the tapped `<button>` at 390 × 844 with
      touch emulation on; the comfortable size is 48 px and a target measuring under 44 in either
      dimension would itself be a candidate explanation for a missed tap, so this measurement is
      evidence and not a formality), **R20** ("keyboard operation, visible focus and a meaningful
      accessible name" — in the same touch context, confirm the CTA is reachable with Tab, shows a
      visible focus ring, and activates on Enter; a control that works from the keyboard but not
      from a tap narrows Phase 2b considerably), **R19** ("loading, success and disabled are
      distinct states" — record that the button's `aria-busy` loading state appears and clears
      around the add, which is what tells a user the tap registered), **R24** ("preserve the cart
      … after an error" — record the badge value after the interaction, since a cart that appears
      and vanishes is a different defect from one that never appears), **R22** (the narrow layout
      is exercised at 390 throughout).
- [ ] **FIX-32-AC11** Recorded as N/A with reasons: **R01, R02, R03** — the task adds no imagery and
      alters no brand, shell or hero colour. **R04, R05, R06, R07** — no token, width, spacing,
      radius, font or type-scale declaration is touched. **R08** — no primary or secondary action is
      added, removed or restyled; whether two "Kosárba teszem" controls coexist at 390 is `FIX-26`'s
      to fix. **R09** — no colour pair changes; `FIX-31` owns contrast. **R10, R11** — no image
      markup or aspect ratio is touched. **R12, R15** — the task adds and edits no UI string.
      **R13, R14, R17, R18** — no price field, variant logic or filter state is touched; the spec
      pins one variant only for determinism. **R16** — the application has exactly one provider.
      **R23** — no dialog is involved; `FIX-30` owns dialog focus. **R25** — no offer, review or
      urgency copy exists in this path. **R26** — a handoff-practice rule, satisfied by the commit
      body and the recorded evidence rather than by runtime behaviour.

## Commit

This task is exactly one commit. Do not bundle it with another FIX task, and do not commit until
every applicable acceptance criterion above has passed and its output is recorded.

**Phase 2a still produces a commit**: it carries `e2e/add-to-cart-touch.spec.ts` and a commit body
recording that B3-F2 did not reproduce, with the three Phase 1 results. A task that proves a
reported defect is not there is finished work, and the test that proved it is the deliverable. Do
not leave it uncommitted and do not delete it.

Suggested subject lines, in the repository's existing `type: summary` style
(`git log --oneline -20`) — pick the one matching the phase you landed in:

```
test: touch-context add-to-cart coverage; B3-F2 does not reproduce
```

```
fix: add-to-cart under touch input on the product page
```
