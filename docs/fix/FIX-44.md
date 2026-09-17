# FIX-44 — Stop DeliveryStep.onConfirm() swallowing the save failure

Status: PLANNED — not executed.
Severity: blocker
Source: A4 (checkout flow sweep), B1 (delivery step browser walk). Recorded as unowned in `FIX-22` and `FIX-25`; this task is its owner.

## Why this is wrong

On the delivery step, pressing "Tovább az ellenőrzéshez" calls `onConfirm()`, which
issues two PUTs through `CheckoutFacade`. When either returns `{ ok: false }` the
method clears its pending flag and returns. Nothing on that screen renders
`CheckoutFacade.error()`, so the user sees the button's spinner stop, no message
appear, and no navigation happen. The interface gives a failed save and a successful
one the same appearance, which is exactly what design rule **R19** forbids: *"No
results, network error, loading, success and disabled are distinct states."*

`docs/spec/components.md:576` lists `DeliveryStep`'s required states as
`loading,ready,invalid,saving,error` — **error** is one of them, and the only error
this screen renders today is the options-load failure, which is a different error.
`docs/spec/acceptance.md` **AC12** requires that "server error … and unknown outcome
have tested recovery paths", and a path the user cannot see is not a recovery path.

**This is the same defect `FIX-25` fixes one screen later**, on the review step's
order submission. That task's approach — a typed failure signal, a computed message,
and a `StatusMessage` rendered above the actions — is the one to reuse here. Do not
invent a second shape for the same problem on the adjacent screen.

## Evidence

### The two silent returns

`src/app/features/checkout/delivery-step.ts:312-344`:

```ts
  async onConfirm(): Promise<void> {
    if (!this.canConfirm()) return;
    const selection = this.snapshotChange(false);
    this.confirmPending.set(true);
    // Emit the final selection once more, WITHOUT the
    // `requiresFreshReview` flag — the parent will use this as the
    // green light to advance to /penztar/ellenorzes.
    this.selectionChanged.set(selection);
    …
    try {
      this.syncFacadeForm(selection);
      const deliveryResult = await this.checkoutFacade.saveDeliverySection();
      if (!deliveryResult.ok) {
        this.confirmPending.set(false);
        return;
      }
      const paymentResult = await this.checkoutFacade.savePaymentMethod();
      if (!paymentResult.ok) {
        this.confirmPending.set(false);
        return;
      }
      await this.router.navigate(['/penztar/ellenorzes']);
    } finally {
      this.confirmPending.set(false);
    }
  }
```

`:332-335` and `:337-340` are the two returns. Each discards a fully populated error.
`src/app/features/checkout/checkout.facade.ts:137-140`:

```ts
/** Result returned by every save / quote / submit helper. */
export type CheckoutMutationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: CheckoutError };
```

and `checkout.facade.ts:129-135`:

```ts
/** Errors surfaced to the UI as a banner string. */
export interface CheckoutError {
  readonly code: string;
  readonly status: number;
  readonly detail: string;
  readonly fieldErrors: readonly { path: string; message: string }[];
}
```

The comment on that interface says the errors are "surfaced to the UI as a banner
string". On this screen there is no banner.

### The facade already records it, and the screen never reads it

`src/app/features/checkout/checkout.facade.ts:264-265`:

```ts
  private readonly errorWritable: WritableSignal<CheckoutError | null> = signal<CheckoutError | null>(null);
  readonly error: Signal<CheckoutError | null> = this.errorWritable.asReadonly();
```

```
$ grep -n "checkoutFacade.error\|facade.error" src/app/features/checkout/delivery-step.ts src/app/features/checkout/delivery-step.html
$ echo $?
1
```

No hits in either file.

### The only error surface on the screen belongs to a different failure

`src/app/features/checkout/delivery-step.html:25-33`:

```html
        @case ('error') {
          <app-error-state
            [title]="'Az opciók nem érhetők el'"
            [message]="errorMessage()"
            [retryLabel]="'Újrapróbálom'"
            [pending]="retrying()"
            (retryRequested)="onRetry()"
          ></app-error-state>
        }
```

That `@case` belongs to the options-load state machine, and its message is derived
from that state alone — `delivery-step.ts:239-243`:

```ts
  readonly errorMessage = computed<string>(() => {
    const state = this.state();
    if (state.kind !== 'error') return '';
    return state.detail;
  });
```

When the save fails, `state()` is still `'ready'`, so this branch is not rendered and
`errorMessage()` returns the empty string. The screen stays exactly as it was.

### What the user sees

The confirm control is `delivery-step.html:154-163`:

```html
                <app-button
                  variant="primary"
                  size="comfortable"
                  [label]="confirmLabel()"
                  [loadingLabel]="'Mentés…'"
                  [loading]="confirmPending()"
                  [disabled]="!canConfirm()"
                  (pressed)="onConfirm()"
                  data-testid="delivery-confirm"
                ></app-button>
```

`[loading]="confirmPending()"` swaps the label to "Mentés…" and back. On a failed
save the label returns to normal, the route does not change, and nothing else moves.

## What to change

Mirror `FIX-25`'s structure. Four edits and one test file.

### 1. `src/app/features/checkout/delivery-step.ts` — model the failure

Add a signal beside `confirmPending`:

```ts
  /** Detail of the last save attempt that failed. Null until a save
   *  fails; cleared at the start of the next attempt. */
  readonly saveFailure = signal<CheckoutError | null>(null);
```

`CheckoutError` is already exported from `./checkout.facade`; add it to the existing
import at `delivery-step.ts:66`, which today reads
`import { CheckoutFacade } from './checkout.facade';`, rather than creating a second
import statement from the same module.

### 2. `src/app/features/checkout/delivery-step.ts` — route both failures into it

In `onConfirm()`, clear the signal when the attempt starts and set it on each of the
two failing branches. Keep the wire-authored `detail` rather than writing a message
here, exactly as `FIX-25` item 2 does:

```ts
    this.confirmPending.set(true);
    this.saveFailure.set(null);
```

```ts
      const deliveryResult = await this.checkoutFacade.saveDeliverySection();
      if (!deliveryResult.ok) {
        this.saveFailure.set(deliveryResult.error);
        return;
      }
      const paymentResult = await this.checkoutFacade.savePaymentMethod();
      if (!paymentResult.ok) {
        this.saveFailure.set(paymentResult.error);
        return;
      }
```

The two `this.confirmPending.set(false);` lines inside the branches come out: the
`finally` block at `:342-344` already clears the flag on every path, so those two
lines were redundant before this change and removing them keeps one owner of the
flag.

### 3. `src/app/features/checkout/delivery-step.ts` — the message

One computed, taking the wire's own text and appending the sentence that tells the
user nothing was lost. The Hungarian below is the same wording `FIX-25` uses for the
same situation on the next screen, so the two screens do not speak differently:

```ts
  readonly saveFailureMessage = computed<string>(() => {
    const failure = this.saveFailure();
    if (failure === null) return '';
    return `${failure.detail} A kosarad és az adataid megmaradtak. Próbáld újra.`;
  });
```

Design rule **R24** is what the second sentence is for — "preserve the cart, filters
and previously entered non-sensitive data after an error" — and it is true here: the
component's local signals for the option, the address and the payment method are
untouched by a failed save, which AC03 verifies by reading the fields back.

**Do not invent a message when `detail` is empty.** If `detail` is an empty string,
render the generic half alone; do not substitute a status code or a technical
string. Record in the commit body whether any tested failure produced an empty
`detail`.

### 4. `src/app/features/checkout/delivery-step.html` — render it

Immediately above `<div class="actions">` at `:146`, inside the same `<aside>`:

```html
              @if (saveFailure() !== null) {
                <app-status-message
                  [message]="saveFailureMessage()"
                  severity="error"
                  [persistent]="true"
                  data-testid="delivery-save-failure"
                ></app-status-message>
              }
```

`[persistent]="true"` is deliberate and matches `FIX-25`: `StatusMessage` renders its
close control only when `persistent` is false
(`src/app/shared/ui/status-message/status-message.html:11`), and an error the user
can wave away without acting on it is the state this task exists to prevent. Bind no
`(dismissed)` handler — on a persistent message it can never fire, which is the
defect **`FIX-43`** removes four times over on the review step.

`StatusMessage` is **not** currently imported by this component. Add the import
statement beside the other shared-UI imports at `delivery-step.ts:68-71`, using the
same path the two other consumers use (`review-step.ts:86`,
`add-to-cart.ts:38`):

```ts
import { StatusMessage } from '../../shared/ui/status-message/status-message';
```

and add the symbol to the `imports` array at `delivery-step.ts:100-107`, keeping the
list alphabetical as it is now:

```ts
  imports: [
    AddressForm,
    Button,
    ErrorState,
    LoadingState,
    PaymentMethodSelector,
    PriceBlock,
    StatusMessage,
  ],
```

`StatusMessage` renders `role="alert"` and `aria-live="assertive"` for
`severity="error"` (`status-message.html:6-7`), so the message is announced without
this task adding any ARIA of its own.

### 5. Test — `tests/checkout-delivery.spec.ts`

That file already exists and is the one that covers `DeliveryStep` (its header: *"T21 —
delivery + payment-method step (S4.3)"*). There is no `tests/delivery-step.spec.ts` and
this task does not create one: `grep -rln "DeliveryStep" src tests` returns
`tests/checkout-f2.spec.ts`, `tests/checkout-delivery.spec.ts` and
`tests/checkout-f6.spec.ts`, and the second is the acceptance suite for this screen.
Add the three cases below to it. `FIX-06` owns moving it out of `tests/`; do not move
it here.

**Rendering works in this suite, and the file's own header says it does not.** That
header is stale — see the correction at the end of this item. Three cases, all driving
the rendered component:

- `saveDeliverySection()` resolves `{ ok: false, error }` → after the confirm click,
  `[data-testid="delivery-save-failure"]` is in the DOM, its text contains the
  error's `detail`, the router did not navigate, and `[data-testid="delivery-confirm"]`
  is no longer in its loading state.
- `saveDeliverySection()` succeeds and `savePaymentMethod()` resolves
  `{ ok: false, error }` → the same three assertions, with the second error's detail.
  The second branch must have its own case: a fix that only covers the first is the
  half-fix `.claude/rules/code-standards.md` warns about when a change touches a
  branch condition.
- Both succeed → no `[data-testid="delivery-save-failure"]` anywhere in the DOM and
  the router navigates to `/penztar/ellenorzes`.

Add a fourth case if the existing spec already renders the screen: after a failed
save, the selected delivery option, the address field values and the payment method
are unchanged. That is R24 asserted in a unit test as well as in the browser.

**What the three cases need at the top of the file.** `tests/checkout-delivery.spec.ts`
is a source-pattern suite today and has none of it. Copy the four lines
`tests/layouts.spec.ts` uses, which is the file that proves this works:

```ts
// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, Router } from '@angular/router';
import { beforeAll } from 'vitest';

beforeAll(() => {
  TestBed.initTestEnvironment(
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting(),
    { teardown: { destroyAfterEach: true } },
  );
});
```

`// @vitest-environment jsdom` is a file-level pragma and switches the whole file out of
the config's `environment: 'node'` default; the existing source-pattern cases use only
`readFileSync` and are unaffected by it. Nothing else has to be added: the legacy-decorator
lowering, the signal-input metadata shim and the `templateUrl`/`styleUrl` resolver are all
supplied by `vitest.config.ts` and `tests/setup-msw.ts` already.

**The provider set.** `DeliveryStep` injects `CheckoutFacade` and `Router`. Stub the
facade with an object literal exposing only the members the three cases drive —
`saveDeliverySection` and `savePaymentMethod` returning the `{ ok: false, error }` /
`{ ok: true, value }` shapes the real one returns — and register it with
`{ provide: CheckoutFacade, useValue: stub }` in `TestBed.configureTestingModule`, the
way `tests/home-page.spec.ts:472` does for `Api`. Use `provideRouter([])` and spy on
`Router.navigate`. Do not stand up MSW for these three cases: the point of the fix is
what the component does with the facade's answer, not what the wire returns.

**If a component in the import graph fails to resolve its `styleUrl`** — the one case
where this is known to happen is recorded at `tests/home-page.spec.ts:475-483` — use
`TestBed.overrideComponent(DeliveryStep, { set: { imports: […] } })` to drop the
offending child, and record in the commit body which child was dropped and why. Do not
fall back to source-pattern assertions for these three cases: a regex over the source
does not execute the line, and `.claude/rules/code-standards.md` requires the changed
lines to be executed *and* asserted on.

**Correct the file's stale header in the same commit.**
`tests/checkout-delivery.spec.ts:21-26` currently reads:

```text
 * Same trade-off as cart-page.spec: vitest's esbuild/oxc pipeline
 * strips Angular decorator metadata, so the suite inspects the
 * source files directly. The behaviour is exercised end-to-end by
 * `ng build` and the cart.facade.spec analogue can run in a real
 * browser.
```

Replace it with:

```text
 * The older cases in this file inspect the source files directly, a
 * convention from before `vitest.config.ts` gained its legacy-decorator
 * lowering and signal-input metadata shim and `tests/setup-msw.ts` gained
 * its `templateUrl` / `styleUrl` resolver. Those three together make
 * `TestBed.createComponent` work here — see `tests/layouts.spec.ts` and
 * `tests/home-page.spec.ts` — so the cases added since render the
 * component instead.
```

Leaving the old paragraph in place would be a false statement in committed code, which
`.claude/rules/code-standards.md` does not allow.

## Out of scope

- **The review step's silent order failure — `FIX-25`.** Same defect, next screen,
  different files. Do not touch `review-step.ts`, `review-step.html` or
  `review-step.scss`. `FIX-25`'s out-of-scope section names this defect and leaves it
  alone; after this task it is owned here.
- **The delivery step's inert continue button and its raw internal-state copy —
  `FIX-22`.** That task owns `canConfirm()`, the button's enabled/disabled logic and
  the visible copy on this screen. This task adds a failure signal, a computed
  message and one element; it changes no existing string, no label and no enablement
  rule. `FIX-22`'s out-of-scope section names this defect as unowned; after this task
  it is owned here.
- **`CheckoutFacade`.** `saveDeliverySection()` and `savePaymentMethod()` already
  return a typed result and already record the error. The defect is in the caller.
  Change nothing in `checkout.facade.ts`.
- **`DeliveryStep`'s signature drift against `docs/spec/components.md:570-572`.** The
  spec gives it inputs `options/fields/saveState` and outputs
  `continueRequested/retryOptions`; the implementation has none of those. That is a
  real **D1** divergence and **`FIX-56` owns it** ("Bring `DeliveryStep`'s signature
  back to `components.md`") — `FIX-50` covers `AddToCart`, `ProductGallery`,
  `VariantSelector` and `MobileBuyRail` and not this component. Report it; do not
  reshape the component here, because doing so would change what every caller
  passes and would put an architecture change inside an error-handling commit.
- **`docs/spec/components.md`.** Under **D1** no task may edit a spec document to
  match the implementation.
- **The options-load `@case ('error')` branch and `onRetry()`.** They are correct and
  cover a different failure. Leave them.
- **The cart being lost on a full page load — `FIX-10`.** Reach the delivery step by
  clicking through the checkout, never by typing the URL; see "How to verify".
- **UI copy generally — `FIX-35`.** This task adds one sentence, taken from
  `FIX-25`'s wording for the identical situation so the two screens agree. If
  `FIX-35` has already standardised that sentence, use whatever it landed and say so
  in the commit body.
- **The vitest runner's own configuration — `FIX-04` and `FIX-06`.** This task's unit
  cases render components, which works in two configurations and not in the gap between
  them: before `FIX-04`, under `npx vitest run`, because `vitest.config.ts`'s
  legacy-decorator plugin, signal-input shim and raw-resource loader plus
  `tests/setup-msw.ts`'s `ɵresolveComponentResources` resolver supply everything JIT
  needs; and after `FIX-06`, under `ng test`, because the `@angular/build:unit-test`
  builder compiles with the real Angular compiler. `FIX-04` deletes the first set and
  `FIX-06` moves the specs into the builder's reach, so between them nothing under
  `tests/**` is collected by either runner. **This task must therefore land wholly before
  `FIX-04`, or after both `FIX-04` and `FIX-06`.** Which of the two is the orchestrator's
  call; do not start this task inside that window.

## How to verify

Run these from the repository root, in order. The package manager is **npm
11.17.0**; there is no pnpm and no mise in this repository.

```bash
npm run build                          # expected exit 0
npx vitest run tests/checkout-delivery.spec.ts   # expected exit 0
npm run test                           # record the exit code; a failure attributable to FIX-04
                                        # does not fail this task, but the spec file above must
                                        # pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

**How to make the save fail in the browser.** The screen talks to MSW, not a real
server, so a failure has to be induced. Use, in this order of preference:

1. The dev-tools request-blocking control, to block the `PUT /api/v1/checkout/…`
   request while leaving the page loaded. This is the closest to a genuine transport
   failure and needs no source change.
2. If that is not available in the harness, switch the browser to offline in
   devtools immediately before pressing the confirm button — the same mechanism
   `FIX-25`'s run 3 uses for its generic commit-failure branch. No scenario in
   `src/mocks/scenarios.ts` (`default`, `happy-path`, `out-of-stock`,
   `payment-declined`) rejects `PUT /api/v1/checkout/{cartId}`, so a demo-scenario
   switch is not an alternative here; do not hunt for one or invent one. State in
   the commit body which mechanism you used.

Do **not** prove this criterion by calling `saveFailure.set(...)` from the console.
That shows the template renders a signal and says nothing about whether the failure
reaches it, which is the whole defect.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty. Do not run the full Playwright
suite: it rewrites 49 tracked screenshots under `e2e/design/screenshots/`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R19 applies and is the rule this task restores**: a failed save becomes visually
  distinct from a successful one and from the loading state. AC01 and AC02 measure
  it.
- **R24 applies**: the cart and every entered field survive the error. AC03 reads
  them back after the failure.
- **R20 applies**: the message is announced (`role="alert"`) and the retry path is
  the same keyboard-reachable primary button. AC04 confirms both.
- **R15 applies**: the message must not claim a real order, payment or email. It is
  the wire's `detail` plus one neutral Hungarian sentence; AC05 records the exact
  rendered string.
- **R12 applies**: that sentence is correctly accented Hungarian and matches
  `FIX-25`'s wording for the identical situation.
- **R04 and R06 apply**: no new colour and no new spacing value is introduced;
  `StatusMessage` brings its own, already-tokenised treatment.
- R01, R02, R03, R05, R07, R08, R09, R10, R11, R13, R14, R16, R17, R18, R21, R22,
  R23, R25: N/A. The change adds no imagery or brand asset (R01, R10, R11), alters
  no shell, hero or palette (R02, R03), changes no width or centreline (R05), touches
  no font or type scale (R07), adds no competing primary action (R08), introduces no
  new colour pair (R09), reaches no price field, offer source, provider, variant or
  filter state (R13, R14, R16–R18), changes no target size (R21) and no responsive
  rule (R22), opens no dialog (R23) and invents no promotional content (R25). R26 is
  satisfied by the commit body and the recorded evidence.

## Acceptance criteria

Every browser criterion is checked in a real browser driven through
`mcp__chrome-devtools__*`, at 1x device pixel ratio and light colour scheme.
Reading the diff, an HTTP 200 and a green unit test are none of them a browser check
(`.claude/rules/browser-verification.md`).

Reach the delivery step by **clicking through**: add an item from
`/telefonok/demo-one-5g`, open the cart from the header link, continue to
`/penztar/adatok`, fill the contact form, continue. Never type `/penztar/szallitas`
or reload it — a full page load of any checkout route currently discards the cart
and shows the empty state, a defect **FIX-10** owns, and an empty cart never reaches
this screen.

- [ ] **FIX-44-AC01** At 1440, with the checkout `PUT` made to fail by one of the two
      mechanisms in "How to verify", press "Tovább az ellenőrzéshez". Afterwards:
      `[data-testid="delivery-save-failure"]` exists, its rendered text is non-empty,
      `location.pathname` is still `/penztar/szallitas`, and
      `[data-testid="delivery-confirm"]` no longer shows "Mentés…". Record a
      screenshot. Before the change, the same interaction left the page visually
      unchanged with nothing added to the DOM.
- [ ] **FIX-44-AC02** Repeat with only the **second** PUT failing — the delivery
      section saved and the payment method rejected. The same four observations hold.
      If the harness cannot separate the two calls, say so and record how you covered
      the second branch in the unit test instead; do not report the criterion as
      passed on the first branch's evidence.
- [ ] **FIX-44-AC03** Immediately after the failure in AC01, and without reloading:
      the selected delivery radio is still checked, every address field still holds
      what was typed, the payment radio is still selected, and the header cart badge
      still shows the same count. Record all four. This is **R24**.
- [ ] **FIX-44-AC04** The failure is announced and the retry works. Confirm
      `[data-testid="delivery-save-failure"]`'s rendered element has `role="alert"`,
      that it appears in the accessibility tree snapshot, and that with the failure
      removed a second press of the same button navigates to `/penztar/ellenorzes`.
- [ ] **FIX-44-AC05** Record the exact rendered Hungarian string. It contains no
      claim of a real order, payment or email, no HTTP status number and no English
      text.
- [ ] **FIX-44-AC06** An axe run on the delivery step with the failure banner
      rendered reports **zero** violations. Record the output.
- [ ] **FIX-44-AC07** The same interaction at 390 renders the banner inside the
      viewport with no horizontal overflow:
      `document.documentElement.scrollWidth` is not greater than
      `document.documentElement.clientWidth`. Record both numbers. `FIX-27` owns
      pre-existing overflow on this screen; if the number is already over before your
      change, say so and name that number.
- [ ] **FIX-44-AC08** The three unit cases in "What to change" item 5 exist in
      `tests/checkout-delivery.spec.ts`, each one renders `DeliveryStep` through
      `TestBed.createComponent` and asserts on the DOM, and
      `npx vitest run tests/checkout-delivery.spec.ts` exits 0. Check the form with
      `grep -c "createComponent(DeliveryStep)" tests/checkout-delivery.spec.ts`, which
      must print at least `3`; before this task it printed `0`.
- [ ] **FIX-44-AC09** `npm run build` exits 0 and `npm run test`
      exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/checkout-delivery.spec.ts` instead.
- [ ] **FIX-44-AC10** `grep -n "confirmPending.set(false)" src/app/features/checkout/delivery-step.ts`
      returns exactly one line — the `finally` block. It returned three before the
      change.

## Commit

This task is exactly one commit. Do not bundle it with any other FIX task —
particularly not with **FIX-25**, which fixes the same defect class on the next
screen and must stay reviewable on its own. Do not commit until every acceptance
criterion above has passed and its output is recorded.

The commit body states that this is the delivery-step half of the same silence
defect **FIX-25** fixes on the review step, that `FIX-25`'s shape was reused rather
than a second one invented, which failure mechanism was used in the browser, and
that `DeliveryStep`'s signature still diverges from `docs/spec/components.md:570-572`
— **`FIX-56`** owns closing that gap.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: surface the delivery step's save failure instead of returning silently
```
