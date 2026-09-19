# FIX-22 — Delivery step: a continue button that does nothing, and internal state printed at the user

Status: DONE — the dead in-flow confirm button is removed from
PaymentMethodSelector, the delivery summary shows the chosen delivery
method's own label instead of repeating the row term, and the raw
internal "Új áttekintés szükséges" flag is no longer rendered.
Severity: blocker
Source: B2 F3 (dead in-flow button, reproduced 4/4), B3 F6 (duplicated row label and the raw state string).

## Why this is wrong

**The dead button.** The delivery screen renders two "Tovább az ellenőrzéshez" buttons.
The first one in the document — the one directly under the payment radios, and therefore
the first one a keyboard user reaches — is inside `PaymentMethodSelector`, whose click
handler has an empty body and whose parent binds no output that could carry the intent.
Clicking it leaves `location.href` unchanged, with no console error. Only the duplicate
inside the "Szállítás és fizetés összesítése" sidebar card navigates. A keyboard user
going top to bottom therefore stops at a control that silently does nothing.
`docs/spec/screens.md:81` (S4.3) names **one** CTA for this screen, "Tovább az
ellenőrzéshez", and `docs/spec/components.md:600-606` gives `PaymentMethodSelector` inputs
`value` and `disabled`, one output `methodChanged`, and the function "Two radio options
with explicit simulation copy; **no fee or real payment widget**" — no confirm action at
all. Under D1 the specification is right and the extra button is the defect. R20 is the
design rule this breaks: an interactive element that cannot be operated to any effect.

**The sidebar.** The same card prints the row label "Szállítási díj" twice in a row, and
prints "Új áttekintés szükséges: Igen — A korábbi ajánlat és fizetési szándék elavult.",
which is an internal invalidation flag rendered as user-facing copy. `screens.md:81`
requires that "Any selected method is explicitly visible before final review" — which the
card does not do for the delivery option — and says nothing about exposing the
quote-invalidation state. R19 and R15 are the rules: states must be distinct and
meaningful to the reader, not a dump of a boolean.

**Whether the two share a cause: they do not, and this is settled from the source, not
guessed.** B2 and B3 both recorded it as undetermined. The button is dead because
`PaymentMethodSelector.onConfirm()` has no body and no output; the sidebar text is a
literal `<dt>`/`<dd>` pair in `delivery-step.html`. The two are independent, and both are
quoted below. If the executor's own reproduction contradicts this, stop and report it
rather than proceeding.

## Evidence

**The in-flow button.** `src/app/features/checkout/payment-method-selector.html:40-51`:

```html
  <div class="actions flex justify-end gap-3 mt-5">
    <app-button
      variant="primary"
      size="comfortable"
      [label]="confirmLabel()"
      [loadingLabel]="'Mentés…'"
      [loading]="pending()"
      [disabled]="!canConfirm()"
      (pressed)="onConfirm()"
      data-testid="payment-confirm"
    ></app-button>
  </div>
```

`src/app/features/checkout/payment-method-selector.ts:92-97` — the handler does nothing
and says so:

```ts
  onConfirm(): void {
    if (!this.canConfirm()) return;
    // The actual navigation is the parent's responsibility. We only
    // emit the chosen method through the model — the parent listens
    // for the confirm via `(pressed)` on the bound button.
  }
```

The parent does not listen for any such thing.
`src/app/features/checkout/delivery-step.html:107-113` is the entire binding surface:

```html
              <app-payment-method-selector
                [value]="paymentMethod()"
                (valueChange)="onPaymentChanged($event)"
                [pending]="confirmPending()"
                [ready]="canConfirm()"
                (paymentChanged)="onPaymentChanged($event)"
              ></app-payment-method-selector>
```

There is no confirm output on the component to bind (`payment-method-selector.ts:59-65`
declares `value`, `pending`, `ready`, `selectionChanged` and `paymentChanged`, and no
confirm output), so no click on that button can reach `DeliveryStep.onConfirm()`, which is the
method that actually saves and navigates (`delivery-step.ts:312-345`).

**The duplicated label.** `src/app/features/checkout/delivery-step.html:119-128` — the
`<dt>` and the `PriceBlock`'s own visible `label` input carry the same string:

```html
                <div class="summary-row" data-testid="summary-row-fee">
                  <dt>Szállítási díj</dt>
                  <dd>
                    <app-price-block
                      [money]="currentShippingFee()"
                      [label]="'Szállítási díj'"
                      [status]="'success'"
                    ></app-price-block>
                  </dd>
                </div>
```

`PriceBlock` always renders its label (`src/app/shared/ui/price-block/price-block.html:2`,
`<span class="label">{{ label() }}</span>`), and `docs/spec/components.md:150` makes
`label:string` part of its contract, so the duplication is the caller's to fix. It is
unconditional, not limited to the state before a method is chosen as B3 recorded it from
the screen.

**The raw state row.** `src/app/features/checkout/delivery-step.html:133-143`:

```html
                <div class="summary-row" data-testid="summary-row-fresh">
                  <dt>Új áttekintés szükséges</dt>
                  <dd class="fresh-value">
                    @if (requiresFreshReview()) {
                      <span class="fresh-flag" data-testid="fresh-flag">Igen</span>
                      <span class="fresh-hint">A korábbi ajánlat és fizetési szándék elavult.</span>
                    } @else {
                      <span class="fresh-ok">Nem</span>
                    }
                  </dd>
                </div>
```

## What to change

**1. Delete the in-flow button and everything that existed only to drive it.**

- `src/app/features/checkout/payment-method-selector.html:40-51` — delete the whole
  `<div class="actions">` block.
- `src/app/features/checkout/payment-method-selector.ts` — delete `onConfirm()` (`:92-97`),
  `confirmLabel` (`:71`), `canConfirm` (`:69`), the `pending` model (`:60`) and the
  `ready` model (`:62`), which have no other reader once the button is gone; delete the
  now-unused `Button` import (`:26`) and its entry in `imports: [Button]` (`:54`); and
  correct the docblock line that describes the removed control (`:20`, "T10 Button
  primitive drives the confirm action …").
- `src/app/features/checkout/delivery-step.html:110-111` — delete the `[pending]` and
  `[ready]` bindings, which now have no inputs to bind to. Leave `[value]`,
  `(valueChange)` and `(paymentChanged)` exactly as they are.
- `tests/checkout-delivery.spec.ts:302-304` — delete the test
  `'PaymentMethodSelector uses the shared Button primitive for the Confirm action'`. It
  asserts the presence of the control this change removes, and it asserts it by source
  text, so a leftover mention in a comment would leave it green for the wrong reason.
  Removing a test that pins a behaviour the specification does not grant is part of this
  change, and no other assertion in that file references the confirm button (verified with
  `grep -rn "payment-confirm\|confirmLabel\|canConfirm" tests e2e`, whose only other hits
  are `review-step.ts`'s unrelated `canSubmit|canConfirm` alternation and
  `e2e/checkout-f8.spec.ts:90`'s use of `delivery-confirm`, the sidebar button, which this
  task keeps).

After this the screen has exactly one CTA, `[data-testid="delivery-confirm"]`
(`delivery-step.html:154-163`), which already works, and it sits after the payment radios
in document order, so a keyboard user going top to bottom reaches it.

**2. Stop printing the label twice, and show the chosen delivery method.**
In `src/app/features/checkout/delivery-step.ts`, add one computed beside the existing
`paymentLabel` (`:233-237`):

```ts
  /** Name of the chosen delivery option, for the summary card.
   *  screens.md S4.3: "Any selected method is explicitly visible
   *  before final review." */
  readonly deliveryLabel = computed<string>(() => {
    const id = this.selectedOptionId();
    const option = (this.readyOptions()?.deliveryOptions ?? []).find((o) => o.id === id);
    return option?.label ?? 'Nincs kiválasztva';
  });
```

`'Nincs kiválasztva'` is the string this repository already uses for exactly this state
(`src/app/features/checkout/review-step.ts:210` and `:223`); do not invent another. Then
in `src/app/features/checkout/delivery-step.html:124`, bind that computed instead of the
duplicated string: `[label]="deliveryLabel()"`. The `<dt>Szállítási díj</dt>` stays, so the
row reads as a term, the chosen method and the amount, with nothing repeated.

**3. Delete the raw state row** — `src/app/features/checkout/delivery-step.html:133-143`,
the whole `summary-row-fresh` block. It renders an internal flag and satisfies no
requirement in `screens.md` or `components.md`.

**Keep the `requiresFreshReview` computed** at `delivery-step.ts:210-214` and the effect
that arms it (`:178-191`). The invalidation behaviour is T21-AC04 and is not the defect;
only its display is. `tests/checkout-delivery.spec.ts:237-244` also asserts that the flag
exists somewhere in the delivery-step source, and that assertion stays true because the
computed stays.

**4. Test — `tests/checkout-delivery.spec.ts`,** which runs today. Add assertions in the
file's own source-text style, in the T21 blocks that already own these surfaces:

- `payment-method-selector.html` contains no `app-button` and no `data-testid="payment-confirm"`;
- the delivery-step source contains exactly one occurrence of `Tovább az ellenőrzéshez`
  (it is produced by `delivery-step.ts:231`'s `confirmLabel`, and the selector's copy is
  gone);
- the delivery-step source no longer contains `Új áttekintés szükséges`;
- the summary fee row binds `[label]="deliveryLabel()"` rather than the literal
  `'Szállítási díj'`.

## Out of scope

- `AddressForm`: A4 F2 and F3 (it does not use Signal Forms although
  `docs/spec/components.md:585` requires it, and it re-declares the address regexes). Not
  touched here.
- `PaymentMethodSelector`'s remaining contract drift (A4 F11: the `selectionChanged` model
  is dead weight beside `paymentChanged`, and `docs/spec/components.md:602` names the
  output `methodChanged`). This task removes only what the deleted button needed.
- **The pickup fee rendering as "—" instead of "0 Ft".** B1 F10 records it; `PriceBlock`
  deliberately refuses to render a non-positive amount
  (`src/app/shared/ui/price-block/price-block.ts:49`) while `docs/spec/screens.md:81`
  requires an explicit "0 Ft". That is a copy/contract decision owned by `FIX-35`.
- The H1 "Szállítás és fizetés" (spec: "Átvétel és fizetés") and the radio-card copy —
  `FIX-35`.
- `DeliveryStep.onConfirm()` returning silently when `saveDeliverySection()` or
  `savePaymentMethod()` fails (`delivery-step.ts:331-340`): nothing on this screen renders
  `CheckoutFacade.error()`. That is a second, separate silence defect on this screen; it
  is **not** fixed here — **`FIX-44`** owns it.
- The review step's silent order failure (`FIX-25`).
- Layout overflow on this screen at 1024 (B2 F5) — `FIX-27`.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

```bash
npm run build              # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does
                            # not fail this task, but tests/checkout-delivery.spec.ts must pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

**Reaching the delivery step.** Build the cart by clicking and navigate with in-page links
only: `http://localhost:4200/telefonok/demo-one-5g` → "Kosárba teszem" → header cart link
→ `[data-testid="cart-continue"]` → fill the contact form → "Tovább a szállításhoz". **Never load a
`/penztar/*` URL directly and never reload one** — a full page load of a checkout route
throws the cart away today, a defect owned by `FIX-10`. Note that the cart line's controls
are stuck disabled until `FIX-21` lands; that does not block reaching this screen, since
the cart's own continue button works.

At 1440, on `/penztar/szallitas`:

1. Count the buttons whose text is "Tovább az ellenőrzéshez".
2. Press Tab from the top of the page and record the order in which the interactive
   elements receive focus, up to and including the CTA.
3. Choose "Házhoz szállítás – demó", fill the address, choose a payment method, and read
   the summary card's rendered text.
4. Click the CTA and confirm the URL becomes `/penztar/ellenorzes`.

Repeat step 1 and step 4 at 320, 768 and 1024 — the widths at which B2 reproduced the dead
button 4 times out of 4.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R20 applies and is the rule this task restores**: every interactive element must be
  operable, and the one that was not is removed.
- **R08 applies**: one prominent primary action per decision unit — the screen now has one
  CTA rather than two identical ones.
- **R19 and R15 apply**: the summary must show states a reader can act on, not an internal
  flag, and must keep the demo labelling intact.
- **R12 applies**: the Hungarian strings that remain keep their accents; the one new string
  is taken from the existing codebase.
- **R21 applies**: the remaining CTA keeps its 44 × 44 CSS px minimum.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R07, R09–R11, R13, R14, R16–R18, R22–R25: N/A — this change alters no brand asset,
  colour, spacing, type, image, price source, filter state, narrow layout, modal or
  handoff artefact.

## Acceptance criteria

- [ ] **FIX-22-AC01** On `/penztar/szallitas` reached by clicking, at 1440,
      `document.querySelectorAll('button')` contains exactly **one** element whose visible
      text is "Tovább az ellenőrzéshez", and `[data-testid="payment-confirm"]` is absent
      from the DOM.
- [ ] **FIX-22-AC02** With a delivery option, an address and a payment method chosen,
      clicking that single CTA changes `window.location.pathname` to
      `/penztar/ellenorzes`. Verified at 320, 768, 1024 and 1440 — the four widths at
      which the defect was reproduced.
- [ ] **FIX-22-AC03** Tabbing from the top of the page reaches that CTA without passing
      through any other control labelled "Tovább az ellenőrzéshez", and the CTA shows a
      visible focus ring when it receives focus.
- [ ] **FIX-22-AC04** The summary card's text content contains the string "Szállítási díj"
      exactly once, and contains the label of the chosen delivery option as returned by
      `GET /api/v1/checkout/options` (read the label from the network response and compare).
- [ ] **FIX-22-AC05** The summary card's text content does not contain "Új áttekintés
      szükséges" in any state: before a method is chosen, after choosing one, and after
      changing the choice a second time.
- [ ] **FIX-22-AC06** `tests/checkout-delivery.spec.ts` carries the four assertions listed
      in "What to change" item 4, no longer contains the deleted confirm-button test, and
      `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/checkout-delivery.spec.ts` instead.
- [ ] **FIX-22-AC07** `npm run build` exits 0.

## Commit

This task is exactly one commit. Do not bundle it with any other FIX task. The dead button
and the sidebar copy are one screen's user-facing failure and are verified in the same
browser pass, which is why they ship together even though they have separate causes.
Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: one working continue button and readable summary on the delivery step
```
