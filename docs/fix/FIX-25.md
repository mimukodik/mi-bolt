# FIX-25 — A declined or failed order commit is completely silent

Status: PLANNED — not executed.
Severity: blocker
Source: A4 F9 (highest priority), B1 "Not covered" (no UI control reaches this path).

## Why this is wrong

On the final review step the user presses "Demórendelés véglegesítése". If the simulated
payment is declined, or the commit fails for any other reason, the page does **nothing**:
no banner, no retry, no way to change the payment method, no message of any kind. The
button simply stops spinning and the user is left on the same screen with no idea whether
anything happened.

`docs/spec/screens.md:87` (S4.4) requires the opposite: "Failed payment offers
Retry/change method; stale quote offers refresh and re-review; stock loss links cart
correction. An uncertain response says processing outcome not known, not definitive
rejection." Design rule R19 is the rule this breaks — "No results, network error, loading,
success and disabled are distinct states" — and R24, because the user must be told that
their cart and data are intact.

The machinery is already there and already works. The price-changed, quote-expired,
out-of-stock and field-error banners all render from one status region
(`src/app/features/checkout/review-step.html:135-178`). The failure path was simply never
wired to it.

## Evidence

`src/app/features/checkout/review-step.ts:428-453` — three silent exits:

```ts
      const paymentMethod = this.reviewForm().value().paymentMethod;
      if (paymentMethod === 'demo_card') {
        const intent = await this.checkoutFacade.createPaymentIntent();
        if (!intent.ok) {
          // Payment-decline is surfaced through the cart facade's
          // `error` signal; the form + cart are preserved.
          return;
        }
      }
      const order = await this.checkoutFacade.commitOrder();
      if (!order.ok) {
        return;
      }
```

The comment is wrong twice over: the decline is not surfaced anywhere, and the signal it
names belongs to `CheckoutFacade`, not to the cart facade. `grep -n "checkoutFacade.error\|declined\|PAYMENT_DECLINED" src/app/features/checkout/review-step.ts src/app/features/checkout/review-step.html`
returns nothing — neither file ever reads the facade's error signal.

**`intent.ok` is not the payment's outcome.** It only says the HTTP call did not throw.
The wire model carries the real result:
`src/app/api/generated/models/payment-intent.ts` declares
`status: 'succeeded' | 'declined' | 'pending'`, and
`src/app/features/checkout/checkout.facade.ts:670-679` returns `{ ok: true, value: intent }`
for all three. A declined intent therefore passes the `!intent.ok` check and the code goes
on to commit, where the mock refuses it:
`src/mocks/orders/commit-order.ts:391-394` returns `paymentDeclined()` for a declined
intent, and `:667-673` defines that Problem as status 409, code `PAYMENT_DECLINED`, detail
"A szimulált fizetés elutasítva. Új fizetési szándékot kell létrehozni." That detail
reaches `CheckoutError.detail` through `checkout.facade.ts:193-206` and is then thrown
away by `if (!order.ok) { return; }`.

**No test covers it.** A4 records that the only reference is
`e2e/design/state-matrix.spec.ts`, which `test.skip`s the checkout routes for exactly this
scenario.

## What to change

**1. Model the failure — `src/app/features/checkout/review-step.ts`.** Add a discriminated
signal beside `submitting` (`:126`) and `submitted` (`:131`):

```ts
/** Outcome of the last submit attempt that did not produce an order. */
type SubmitFailure =
  | { readonly kind: 'declined'; readonly detail: string }
  | { readonly kind: 'pending'; readonly detail: string }
  | { readonly kind: 'error'; readonly detail: string };
```

```ts
  /** Null until a submit attempt fails; cleared by the next attempt
   *  and by a quote refresh. */
  readonly submitFailure = signal<SubmitFailure | null>(null);
```

**2. Route every failure into it — `review-step.ts:433-449`.** Clear it at the top of
`onSubmit()`, check the intent's real status, and keep the wire-authored detail on every
branch:

```ts
    this.submitted.set(true);
    this.submitFailure.set(null);
    this.submitting.set(true);
    try {
      const paymentMethod = this.reviewForm().value().paymentMethod;
      if (paymentMethod === 'demo_card') {
        const intent = await this.checkoutFacade.createPaymentIntent();
        if (!intent.ok) {
          this.submitFailure.set({ kind: 'error', detail: intent.error.detail });
          return;
        }
        if (intent.value.status === 'declined') {
          this.submitFailure.set({ kind: 'declined', detail: '' });
          return;
        }
        if (intent.value.status === 'pending') {
          this.submitFailure.set({ kind: 'pending', detail: '' });
          return;
        }
      }
      const order = await this.checkoutFacade.commitOrder();
      if (!order.ok) {
        this.submitFailure.set({
          kind: order.error.code === 'PAYMENT_DECLINED' ? 'declined' : 'error',
          detail: order.error.detail,
        });
        return;
      }
      await this.router.navigate(['/penztar/siker', order.value.id]);
```

Delete the wrong comment that stands where the decline branch now is.

**3. The copy** — one computed, with the sentences taken from the design prototype rather
than invented here. `docs/design/prototype.html:39` renders the declined state as
"A szimulált fizetés elutasítva." plus "A kosarad és az adataid megmaradtak. Próbáld újra,
vagy módosítsd a fizetési módot.", and the in-flight state as "A demórendelés feldolgozás
alatt…" plus "Nem küldünk újabb rendelést ismételt kattintásra.":

```ts
  readonly submitFailureMessage = computed<string>(() => {
    const failure = this.submitFailure();
    if (failure === null) return '';
    const preserved = 'A kosarad és az adataid megmaradtak.';
    switch (failure.kind) {
      case 'declined':
        return `A szimulált fizetés elutasítva. ${preserved} Próbáld újra, vagy módosítsd a fizetési módot.`;
      case 'pending':
        return 'A demórendelés feldolgozás alatt… Az eredmény még nem ismert, ezért nem tekintjük elutasítottnak. Nem küldünk újabb rendelést ismételt kattintásra.';
      case 'error':
        return `${failure.detail} ${preserved} Próbáld újra, vagy módosítsd a fizetési módot.`;
    }
  });
```

The `pending` wording is what `docs/spec/screens.md:87` demands in its own words:
"processing outcome not known, not definitive rejection".

**4. Do not offer a retry for the unknown outcome.** A pending intent means the demo
payment may still land, and a second commit would be sent with a fresh
`Idempotency-Key` (`checkout.facade.ts:723`), i.e. as a new order. Gate the CTA:
in `canSubmit()` (`review-step.ts:346-353`) add

```ts
    if (this.submitFailure()?.kind === 'pending') return false;
```

and clear the failure in `onRefresh()` (`:411-414`) so asking for a fresh quote is the
documented way out of that state. Declined and error keep the CTA enabled: pressing it
again is the retry `screens.md:87` asks for.

**5. Render it — `src/app/features/checkout/review-step.html`,** immediately above
`<div class="actions">` (`:260`), inside the same column:

```html
          @if (submitFailure(); as failure) {
            <div class="submit-failure" data-testid="review-submit-failure">
              <app-status-message
                [message]="submitFailureMessage()"
                [severity]="failure.kind === 'pending' ? 'info' : 'error'"
                [persistent]="true"
              ></app-status-message>
              @if (failure.kind !== 'pending') {
                <app-button
                  variant="secondary"
                  size="comfortable"
                  label="Fizetési mód módosítása"
                  (pressed)="onBack()"
                  data-testid="review-change-payment"
                ></app-button>
              }
            </div>
          }
```

`StatusMessage` and `Button` are already imported by this component
(`review-step.ts:105-114`). `[persistent]="true"` is deliberate: the component renders its
dismiss control only when `persistent` is false
(`src/app/shared/ui/status-message/status-message.html:11`), and a failure the user can
wave away without acting on it is the state this task exists to prevent. `onBack()`
(`review-step.ts:399-401`) already navigates to `/penztar/szallitas`, which is where the
payment method is chosen.

`src/app/features/checkout/review-step.scss` — add the container, using existing tokens
only:

```scss
.submit-failure {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
```

**6. Test — `tests/review-step.spec.ts`,** which runs today. Add assertions in that file's
existing style:

- `review-step.ts` reads `intent.value.status` and has a branch for `'declined'` and one
  for `'pending'`;
- neither `if (!intent.ok)` nor `if (!order.ok)` is followed by a bare `return;` — each
  sets `submitFailure` first;
- the template renders `data-testid="review-submit-failure"` and
  `data-testid="review-change-payment"`;
- `canSubmit` gates on the pending failure.

## Out of scope

- **`OrderSubmission` and `PaymentProgress`.** A4 F4 and F5 report that
  `src/app/features/checkout/order-submission.ts` (retry, poll, idempotent replay,
  `recoverPersistedOrder`) and `src/app/features/checkout/payment-progress.ts` (the
  declared UI for pending / declined / unknown) are unreachable from the UI: nothing
  imports them. Wiring them in is **FIX-61**'s full scope ("Wire `OrderSubmission` and
  `PaymentProgress`"); **FIX-25 lands first**, and `FIX-61.md:280, :353-355` names this
  task as its prerequisite. This task makes the failure **visible** with the
  machinery already on the page, and does not wire those two modules in. Report the gap.
- **Idempotent retry.** `docs/spec/screens.md:87` also requires "Same request/key retry is
  mandatory", and `commitOrder()` takes a fresh key on every call
  (`checkout.facade.ts:723`) while `commitOrderWithKey` (`:732`) exists unused for exactly
  that purpose. This task does not change the key policy; it avoids the hazard by refusing
  to resubmit after an unknown outcome (item 4). The key policy belongs with the
  `OrderSubmission` wiring above.
- The quote banners that already work (`review-step.html:135-177`) and `QuoteState`
  (`src/app/features/checkout/quote-state.ts`). Do not route a commit failure into
  `field-error`: that state belongs to the quote controller and is cleared by a quote
  refresh.
- The review step's H1 and the "Szerkesztés" edit links (`docs/spec/screens.md:85` requires
  "Minden rendben?" and "Módosítás") — `FIX-35`.
- `DeliveryStep.onConfirm()`'s own silent failure on a save error
  (`src/app/features/checkout/delivery-step.ts:331-340`) — the same class of defect on the
  previous screen. It is named in `FIX-22`'s out-of-scope section; **FIX-44** owns it. Do
  not fix it here.
- The cart being lost on reload (`FIX-10`).

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

```bash
npm run build              # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does
                            # not fail this task, but tests/review-step.spec.ts must pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

**How to make the failure happen — no mock edit is needed.** The mock picks its scenario
from the query string at bootstrap: `parseScenarioFromLocation()` reads `?mi-scenario=`
(`src/mocks/scenarios.ts:109-114`) and the bootstrap hook calls it before the app starts
(`src/core/bootstrap-demo.ts:51`). That hook is `prepareMocks()` today and `startMocks()`
after **FIX-51** renames it under decision **D10**; nothing in this task depends on which,
because the scenario still comes from the query string either way. `initialStatusFor()`
(`src/mocks/payment/payment.handlers.ts:118-126`) then returns a declined intent for
`payment-declined` and a pending one for `payment-pending-timeout`, and unknown names are
accepted and preserved (`src/mocks/scenarios.ts:92-101`).

The parameter must be on the **first** page load of the tab, because that is when the
worker is prepared. Load `http://localhost:4200/?mi-scenario=payment-declined`, then build
the cart and walk the flow **by clicking** — product page → "Kosárba teszem" → header cart
link → "Tovább a pénztárhoz" → contact form → "Tovább a szállításhoz" → choose "Bankkártya
(szimulált)" → continue to the review step. **Never load a `/penztar/*` URL directly and
never reload one**: a full page load of a checkout route throws the cart away today
(`FIX-10`), and it would also reset the scenario. Two known defects sit on that path: the
cart line's controls are stuck disabled (`FIX-21`, which does not block walking through)
and the delivery step's in-flow continue button is inert (`FIX-22`) — use the button inside
the "Szállítás és fizetés összesítése" sidebar card to get past that screen.

Three runs, at 1440:

1. `?mi-scenario=payment-declined`, payment method "Bankkártya (szimulált)" — the declined
   branch.
2. `?mi-scenario=payment-pending-timeout`, same method — the unknown-outcome branch.
3. Default scenario, but switch the browser to offline in devtools immediately before
   pressing the CTA — the generic commit-failure branch.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R19 applies and is the rule this task restores**: declined, unknown, failed and
  submitting become four states a person can tell apart.
- **R24 applies**: the message states that the cart and the entered data are preserved, and
  the browser check confirms they actually are.
- **R15 applies**: the copy keeps the simulation framing ("szimulált fizetés") and must not
  read as a real bank decline.
- **R08 applies**: the recovery offers one primary action (retry, via the existing CTA) and
  one restrained secondary (change method).
- **R20 applies**: the banner must be announced (`StatusMessage` sets the role from the
  severity) and the new secondary button must be keyboard reachable with visible focus.
- **R12 applies**: Hungarian copy with correct accents.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R07, R09–R11, R13, R14, R16–R18, R21–R23, R25: N/A — this change introduces no
  brand asset, colour, spacing, font, image, price source, filter state, narrow-layout
  rework or modal; the new button inherits the shared `Button` primitive's 44 px target.

## Acceptance criteria

- [ ] **FIX-25-AC01** In run 1 (`?mi-scenario=payment-declined`), pressing
      "Demórendelés véglegesítése" leaves the browser on `/penztar/ellenorzes` and renders
      `[data-testid="review-submit-failure"]`, whose text contains "elutasítva" and states
      that the cart and the data are preserved.
- [ ] **FIX-25-AC02** In run 1, `[data-testid="review-change-payment"]` is present and
      clicking it navigates to `/penztar/szallitas` with the cart and the contact data
      still intact (the contact summary on the review step shows the same values after
      returning).
- [ ] **FIX-25-AC03** In run 1, after the failure the primary CTA
      `[data-testid="review-submit"]` is still enabled, and pressing it a second time makes
      a second `POST` attempt (visible in the network log) rather than doing nothing.
- [ ] **FIX-25-AC04** In run 2 (`?mi-scenario=payment-pending-timeout`), the banner's text
      says the outcome is not yet known and does not claim a rejection, and
      `[data-testid="review-submit"]`'s `disabled` property is `true`
      (`docs/spec/screens.md:87`, "An uncertain response says processing outcome not known,
      not definitive rejection").
- [ ] **FIX-25-AC05** In run 3 (offline), the banner appears and its text contains the
      `detail` string from the failed request's Problem body, or the facade's fallback when
      the request never reached the worker. Capture the network log with the failed call.
- [ ] **FIX-25-AC06** On the happy path with no scenario parameter, the order still
      completes and the browser reaches `/penztar/siker/…` — the new branches do not block
      a successful commit.
- [ ] **FIX-25-AC07** Zero console errors in all four runs
      (`list_console_messages` must be empty of errors).
- [ ] **FIX-25-AC08** `tests/review-step.spec.ts` carries the four assertions listed in
      "What to change" item 6, and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/review-step.spec.ts` instead.
- [ ] **FIX-25-AC09** `npm run build` exits 0.
- [ ] **FIX-25-AC10** `grep -n "intent.value.status" src/app/features/checkout/review-step.ts`
      returns at least one line, and no `if (!order.ok)` or `if (!intent.ok)` branch in that
      file returns without setting `submitFailure`.

## Commit

This task is exactly one commit. Do not bundle it with any other FIX task. Commit only
after every acceptance criterion above passes, and include the test spec file.
**`FIX-63` lands after this task** and restructures `ReviewStep` into a presentational
component with a `ReviewPage` container; `FIX-63.md`'s "Out of scope" names every artefact
this task lands and where each one goes. Every one of them is relocated rather than
undone, with one exception `FIX-63` states and records: item 4's
`if (this.submitFailure()?.kind === 'pending') return false;` cannot stay in a component
that no longer holds the signal, so `FIX-63` re-expresses the same gate through the
`state` input the specification gives `ReviewStep`. The behaviour AC04 measures is
unchanged. Write this task as written; do not pre-empt that.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: surface declined, pending and failed order commits on the review step
```
