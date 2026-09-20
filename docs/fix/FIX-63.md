# FIX-63 — Give ContactStep and ReviewStep the signal inputs the specification declares

Status: DONE (unit-verified; browser pass owed) — both components declare exactly the contract's signature: `ContactStep` has `contactFields`/`saveState` inputs and one `continueRequested` output with no `CONTACT_DRAFT_SAVER`/`Router` injection (`contact-page.ts` is now a real `ContactPage` container owning the Signal Forms model, the save call and the post-save navigation); `ReviewStep` has `quote`/`cart`/`draft`/`state` inputs and `editRequested`/`refreshQuote`/`submitRequested` outputs with no `CartFacade`/`CheckoutFacade`/`QuoteController`/`Router` injection (`review-page.ts` is now a real `ReviewPage` container owning those four dependencies). All four `grep` checks in AC02/AC04/AC05 print the expected `0`/nothing. `contact-step.spec.ts` and `review-step.spec.ts` were rewritten against the new contracts (AC07/AC08's own tests included); `contact-page.spec.ts` and `review-page.spec.ts` are new, covering the save/fetch/submit orchestration that moved to the containers. All four checkout spec files plus the rest of the feature's suite pass (181 tests) via `npx ng test`. Two judgment calls, recorded in the landing commit: (1) this task's own text records `ContactStep`'s field-level server-error mapping as a deliberate narrowing to a generic `saveState() === 'error'` message (R15) — not re-derived, per the document's own "recorded here rather than silently lost" instruction; (2) `ReviewStep`'s actual pre-existing implementation had evolved past this document's description to include the `OrderSubmission`/`PaymentProgress` subsystem (from later iteration work); rather than regressing to the document's stale description, that more-evolved architecture was relocated wholesale to `ReviewPage`, which now renders `PaymentProgress` and the generic-error retry banner beside `<app-review-step>`, consistent with the document's own guidance that `ReviewState`'s plain string union has no room for the backend `detail` or the `pending`-versus-`declined` distinction those two surfaces need. Open: every real-browser acceptance criterion (AC09, AC10) is unverified in this session (unit tests only, per the session's no-e2e mandate); deferred to the batched browser pass.
Severity: major
Source: D15 items 1 and 2 (the FIX-54..FIX-61 author's audit, user-approved: "Mind kapjon taskot"), `docs/spec/components.md:551-557` and `:611-617`, decisions D1 and D15. Recorded in `FIX-56`'s out-of-scope section, which now points here (item "ContactStep, one screen earlier, which has the identical defect… **`FIX-63` owns it**"); this task is its owner, and takes `ReviewStep` alongside it because the same defect class and the same fix shape apply to both.

## Why this is wrong

`docs/spec/components.md` is the component contract: for each component it fixes the
owner, the signal inputs, the outputs, the functions and the required states. Decision
**D1** settles what happens when the code disagrees — *"`docs/` is the specification.
Where the code differs from it, the code is wrong and the fix task changes the code,
never the spec."* **FIX-56** already fixed this exact defect class one screen later, for
`DeliveryStep`; this task carries the same fix to the two screens on either side of it.

## Evidence

**ContactStep.** `docs/spec/components.md:551-557`:

```
### ContactStep — purchase/contact / T20

**Owner:** CheckoutFacade form owner.

**Signal inputs:** `contactFields:FieldTree<Contact>; saveState:AsyncStatus`.

**Outputs:** `continueRequested:void`.
```

`src/app/features/checkout/contact-step.ts` declares **zero** signal inputs:

```
$ grep -cE "=\s*(input|model)[.<(]" src/app/features/checkout/contact-step.ts
0
```

It injects `CONTACT_DRAFT_SAVER` and `Router` directly (`contact-step.ts:172-173`):

```ts
  private readonly saver = inject(CONTACT_DRAFT_SAVER);
  private readonly router = inject(Router);
```

and it does have one output, but the wrong one — `submitContact` (`:177`,
`output<NormalizedContact>()`), not the contract's `continueRequested:void`. It fetches
nothing over HTTP directly (`CONTACT_DRAFT_SAVER` is a DI abstraction, not `HttpClient`),
but it still owns the save call and the post-save navigation itself
(`contact-step.ts:375`, `:401`), which `components.md:3`'s rule forbids just as much as a
direct SDK call: *"Public inputs use input()/input.required(); intents use output()…
No presentation component knows the SDK or repository."*

**ReviewStep.** `docs/spec/components.md:611-617`:

```
### ReviewStep — purchase/review / T22

**Owner:** page container.

**Signal inputs:** `quote:Quote|null; cart:Cart; draft:CheckoutDraft; state:ReviewState`.

**Outputs:** `editRequested:contact|delivery; refreshQuote:void; submitRequested:void`.
```

`src/app/features/checkout/review-step.ts` also declares zero inputs and zero outputs:

```
$ grep -cE "=\s*(input|model)[.<(]" src/app/features/checkout/review-step.ts
0
$ grep -cE "=\s*output[<(]" src/app/features/checkout/review-step.ts
0
```

and it injects four dependencies directly (`review-step.ts:119-122`):

```ts
  private readonly cartFacade = inject(CartFacade);
  private readonly checkoutFacade = inject(CheckoutFacade);
  private readonly quoteController = inject(QuoteController);
  private readonly router = inject(Router);
```

The component's own doc comment (`review-step.ts:5-7`) claims *"The component is purely
presentational; every signal it reads comes from `CheckoutFacade`… and `CartFacade`"* —
that sentence describes the defect, not an exemption from it: reading a facade directly
*is* the thing `components.md:3` forbids, regardless of whether the facade in turn wraps
the SDK. `ReviewStep` creates a quote on mount (`review-step.ts:379-397`, a `constructor`
effect that calls `quoteController.refresh()`), commits the order and navigates on submit
(`:441-451`, `router.navigate(['/penztar/siker', order.value.id])`) — none of that is
composition the contract's `Owner: page container` line permits it to do itself.

**Both components are routed directly, with no owning container.**
`src/app/features/checkout/contact-page.ts` and `.../review-page.ts` are nine-line
re-exports:

```ts
export { ContactStep as ContactPage } from './contact-step';
```

```ts
export { ReviewStep as ReviewPage } from './review-step';
```

`checkout.routes.ts:203` and `:231` route `adatok` and `ellenorzes` to those names, so both
components are mounted with no parent template to fill the inputs the contract requires —
the same shape `FIX-56` found and fixed for `DeliveryStep`/`delivery-page.ts`.

**Two more things this task found while measuring both components against the contract.**

**ContactStep's field-level server-error mapping is a real capability, and this fix
narrows it to a generic message.** `contact-step.ts:369-390`'s `submit()` call passes an
`action` callback that calls `this.saver(normalized)` *inside* Signal Forms' own submit
flow, so a rejected save can be mapped back onto the specific invalid field
(`buildServerErrors`, referenced at `:383`). Moving the save to the owning container (this
task's fix, below) means the container — not the field tree — sees the save result, so
that field-by-field mapping is dropped. What replaces it is the same generic
`saveState() === 'error'` message pattern `FIX-56` already established for `DeliveryStep`,
consistent with design rule **R15** (a save failure gets a visible, generic message, never
raw backend detail). Re-deriving per-field server-error mapping through the new input
surface is a larger piece of work this task does not attempt; it is recorded here rather
than silently lost.

**ReviewStep's order-submission failure has no visible surface today, and this task fixes
it as part of giving the component its declared `state` input.** `review-step.ts:441-451`'s
`onSubmit()`, on `!intent.ok` or `!order.ok`, returns without setting any state and without
navigating. The method's own comment claims the failure is *"surfaced through the cart
facade's error signal"* (`:440-441`), but `review-step.html` contains no binding to any
`CartFacade`/`CheckoutFacade` error signal — only `fieldErrorMessage()`, gated on
`quoteController.state().kind === 'field-error'` (`review-step.html:168-171`), which
`onSubmit()` never sets. A rejected payment or a rejected commit is silent today: the CTA's
spinner stops and nothing else happens. This is the same shape of defect `FIX-44` fixes for
`DeliveryStep.onConfirm()`, one screen later, and **`FIX-25` owns it for `ReviewStep`**
(`FIX-25.md:1`, *"A declined or failed order commit is completely silent"*; its item 2 at
`FIX-25.md:87` rewrites exactly this `review-step.ts:428-453`). **`FIX-25` lands before
this task**, so by the time this task runs the defect is already fixed and this task's
job is to carry that fix into the container it creates, not to re-derive a thinner one —
the same treatment this task gives `FIX-20` in "Out of scope". Confirm with
`grep -c "submitFailure" src/app/features/checkout/review-step.ts`, which must print a
non-zero count; if it prints `0`, FIX-25 has not landed — stop and report.
`docs/spec/components.md:7` (the "Shared types" section, not the per-component entry at
`:611-621`) types `ReviewState` with **seven** members — *"`ReviewState = quoting | ready
| expired | price-changed | stock-error | submitting | error`"* — one more than the six
the per-component "Required states" line at `:621` lists, and this task declares all
seven (item 6). **The seventh member is not where `FIX-25`'s failure goes, and this is
the one place a reader is likely to assume otherwise.** `ReviewState` is a plain string
union (`RULINGS-A2b` Q3, under **D1**), so it can carry neither the backend `detail`
`FIX-25` renders nor the `pending`-versus-`declined` distinction `FIX-25`'s CTA gate and
its change-payment button depend on. `error` is therefore reached from one place only —
`QuoteState.field-error`, a quote-fetch failure — and `FIX-25`'s order-submission failure
is rendered by the `ReviewPage` container that owns the network half, with `SubmitFailure`
and `submitFailureMessage()` moved up beside it. Item 6 and item 7 build that; the "Out
of scope" bullet on `FIX-25` states the contract between the two tasks.

## What to change

### 1. `src/app/features/checkout/contact-step.ts` — the declared surface

Add the two inputs and the one output, and delete what they replace.

```ts
  readonly contactFields = input.required<FieldTree<Contact>>();
  readonly saveState = input<AsyncStatus>('idle');

  readonly continueRequested = output<void>();
```

`input.required` for `contactFields` because the component cannot render a form without
it; a plain `input` with an `'idle'` default for `saveState`, matching `FIX-56`'s
`DeliveryStep` precedent exactly. Add `input`/`output` to the existing `@angular/core`
import, `type { FieldTree } from '@angular/forms/signals'` beside the file's existing
Signal Forms imports, `type { Contact } from '../../api/generated/models/contact'`, and
`AsyncStatus` from `src/app/shared/types/async-status.ts`, which is where **FIX-67**
moves it — the same source `FIX-56` uses for `DeliveryStep` once FIX-67 has landed.
**FIX-67 lands before this task**, and once it has, the `src/app/shared/ui` barrel no
longer re-exports `AsyncStatus` at all (`FIX-67.md:141-156`, item 3: *"No compatibility
re-export is added anywhere for the old path"*), so a barrel import here would not
compile. Confirm with
`grep -c "export type AsyncStatus" src/app/shared/ui/price-block/price-block.ts`: it must
print `0`. If it prints `1`, FIX-67 has not landed — stop and report rather than importing
from the barrel. **Do not move or re-declare `AsyncStatus` here**; FIX-67 owns it.

Then remove what the inputs supersede:

- Delete the `model` signal (`:187`) and its `INITIAL_CONTACT`/`EMPTY_CONTACT` seed
  (`FIX-20` owns whichever name is in the file when this task runs — see "Out of scope"
  below for the exact prerequisite ordering). The component reads and writes through
  `contactFields()` instead: `submit()`
  runs against the field tree the container hands in, not a local mirror of it.
- Delete the `saver` injection (`:172`) and the `Router` injection (`:173`).
- Delete the network half of `onSubmit()` (`:360-405`): the `this.saver(normalized)` call
  and the `buildServerErrors` branch it feeds (recorded above as a dropped capability), and
  the trailing `void this.router.navigate(['/penztar/szallitas'])` (`:401`). What remains
  is: run `submit()` against `contactFields()` with an `action` callback that returns
  `undefined` on a locally-valid form (no network call from inside it), run the existing
  `onInvalid` focus handling unchanged, and on a successful local validation call
  `this.continueRequested.emit()`. The component still owns its own validation gating and
  focus management — `components.md:3` forbids SDK/repository knowledge, not client-side
  Signal Forms validation.
- Delete the `submitContact` output (`:177`). It is not in the contract and nothing outside
  this file consumes it (`grep -rn "submitContact" src` returns only its declaration and
  its own emit site before this change).
- `onBack()` (`:352-354`) navigates to `/penztar/kosar` and has no output in the contract
  to carry it — the identical gap `FIX-56` recorded for `DeliveryStep.onBack()`. Leave the
  button's behaviour to the container's own breadcrumb/back link and record the gap in the
  commit body rather than inventing a second output.
- Keep every other computed and every DOM-focus helper (`focusSummary`, `focusFirstInvalidField`,
  the field-level error collectors) as they are; they are presentation, not SDK access.

### 2. `src/app/features/checkout/contact.schema.ts` — the field tree the input needs

`Contact` already exists as a generated model, `src/app/api/generated/models/contact.ts`:
`{ email: string; fullName: string; phone: string }` — an exact structural match for what
`components.md:555` names, already imported elsewhere in this feature
(`checkout.facade.ts`, `checkout-session.ts`). This task does not declare a second type
named `Contact`; it imports the generated one.

Add a schema and a builder beside the module's existing constants, reusing
`EMAIL_RFC5322_SUBSET` and `PHONE_INTERNATIONAL` (`contact.schema.ts:57,60`, which `FIX-20`
makes the sole owner of both patterns — see "Out of scope" for the ordering):

```ts
import {
  type FieldTree,
  type SchemaFn,
  form,
  pattern,
  required,
} from '@angular/forms/signals';
import type { WritableSignal } from '@angular/core';
import type { Contact } from '../../api/generated/models/contact';

export const contactFormSchema: SchemaFn<Contact> = (path) => {
  required(path.fullName, { message: 'A név megadása kötelező.' });
  required(path.email, { message: 'Az e-mail megadása kötelező.' });
  pattern(path.email, EMAIL_RFC5322_SUBSET, { message: 'Érvénytelen e-mail cím.' });
  required(path.phone, { message: 'A telefonszám megadása kötelező.' });
  pattern(path.phone, PHONE_INTERNATIONAL, {
    message: 'A telefonszám +36 prefixumú, 8-9 számjegy.',
  });
};

/** Builds the Signal Forms FieldTree the `ContactPage` container owns and passes
 *  down as `contactFields`. Mirrors `buildCheckoutForm` in checkout-form.model.ts. */
export function buildContactForm(model: WritableSignal<Contact>): FieldTree<Contact> {
  return form(model, contactFormSchema);
}
```

This mirrors `checkout-form.model.ts`'s existing `checkoutFormSchema`/`buildCheckoutForm`
pair exactly, at the same file-relationship distance (schema + builder beside the model's
own constants), so it introduces no new pattern into the codebase.

### 3. `src/app/features/checkout/contact-page.ts` — becomes the owner

Replace the nine-line re-export with a real container component that keeps the
`ContactPage` export name, because `checkout.routes.ts:203` binds to it. The container:

- injects `CONTACT_DRAFT_SAVER` and `Router` — the two dependencies this task removes from
  `ContactStep`, moved rather than deleted;
- owns `private readonly modelWritable = signal<Contact>({ fullName: '', email: '', phone: '' })`
  and `readonly contactFields = buildContactForm(this.modelWritable)`;
- owns `readonly saveState = signal<AsyncStatus>('idle')`;
- renders `<app-contact-step [contactFields]="contactFields" [saveState]="saveState()" (continueRequested)="onContinue()" />`;
- `onContinue()` does what `onSubmit()`'s network half did today: sets `saveState` to
  `'loading'`, calls `this.saver(normalizeContact(this.modelWritable()))`, sets `saveState`
  to `'error'` on failure (rendered as the existing generic message — see "Two things this
  task found" above) or to `'success'` and navigates to `/penztar/szallitas` on success.

**The wire behaviour must not change.** This is a relocation of responsibility: the same
`CONTACT_DRAFT_SAVER` call, the same destination route.

### 4. `src/app/features/checkout/review-step.ts` — the declared surface

Add the four inputs and the three outputs, and delete what they replace.

```ts
  readonly quote = input<Quote | null>(null);
  readonly cart = input.required<Cart>();
  readonly draft = input.required<CheckoutDraft>();
  readonly state = input.required<ReviewState>();

  readonly editRequested = output<'contact' | 'delivery'>();
  readonly refreshQuote = output<void>();
  readonly submitRequested = output<void>();
```

`quote` is nullable per the contract's own `Quote|null` (there is no quote before the
container's first fetch resolves); `cart`, `draft` and `state` are `input.required` because
the component cannot render any of its branches without them. Add `input`/`output` to the
existing `@angular/core` import, `type { Quote }` from
`../../api/generated/models/quote` (already imported in `quote-state.ts`, not yet in this
file), `type { Cart }` from `../../api/generated/models/cart`, and
`type { CheckoutDraft }` / `type { ReviewState }` from `checkout-form.model.ts` and
`quote-state.ts` respectively (items 5 and 6 below).

Then remove what the inputs supersede:

- Delete the four injections (`:119-122`): `CartFacade`, `CheckoutFacade`,
  `QuoteController`, `Router`.
- Delete `items`/`lines` (`:138-150`); read `cart().items` directly instead of
  `cartFacade.cart()?.items`.
- Delete `reviewForm` (`:156`) and every computed that reads through it —
  `contactName`/`contactEmail`/`contactPhone` (`:161-174`),
  `deliveryOptionId`/`deliveryAddress`/`deliveryLabel` (`:176-212`),
  `paymentMethod`/`paymentLabel` (`:213-226`). Replace each with a read from `draft()`:
  `draft().contact?.fullName`, `draft().delivery?.optionId`, `draft().delivery?.address`,
  `draft().paymentMethod`, following the same trimming/label logic the deleted computeds
  already have.
- **Keep the two consent checkboxes (`acceptedTerms`, `acknowledgedSimulation`) as local
  presentation state**, not part of any input: `components.md:615` declares no field-tree
  input for `ReviewStep` at all, unlike `ContactStep`/`DeliveryStep`, so these two toggles —
  which nothing outside this screen reads — become
  `readonly acceptedTerms = signal<boolean>(false)` and
  `readonly acknowledgedSimulation = signal<boolean>(false)`, replacing the reads through
  `reviewForm.acceptedTerms()` / `.acknowledgedSimulation()`. `termsConsentState`,
  `simulationConsentState` and the two message computeds keep their shape, reading the
  local signals instead of the field tree.
- Delete `state`/`stateKind`/`busy` as they read `quoteController` (`:227-247`); the new
  `state` input replaces `stateKind`'s role directly (`state()` is the member itself —
  `ReviewState` is a string union, so there is no `.kind`), and `busy` becomes
  `computed(() => state() === 'quoting' || state() === 'submitting')`.
- Delete `readySummary`/`summaryFootnote` (`:249-274`) where they read
  `quoteController.quote()`; read `quote()` (the input) instead.
- `canSubmit` (`:346-355`) and `ctaExplanation` (`:357-378`): replace every
  `quoteController.ready()`/`quoteController.busy()`/`reviewForm().valid()` read with
  `state() === 'ready'`, `busy()` and the local consent signals plus
  `draft().paymentMethod`/`draft().delivery` presence checks.
- **The four banner-message computeds lose their backend `detail` and become constants.**
  `review-step.ts:277-307` builds `priceChangedMessage`, `quoteExpiredMessage`,
  `outOfStockMessage` and `fieldErrorMessage` by interpolating `state.detail` — a
  backend-supplied string — into a Hungarian sentence. The new `state` input carries no
  detail, and R15 forbids rendering backend detail anyway, so each becomes the fixed
  sentence the existing fallback arm already returns, concatenated with the action clause
  the interpolating arm already appends:

```ts
  readonly priceChangedMessage =
    'A katalógus ára megváltozott. Erősítsd meg az új végösszeget a „Árajánlat frissítése” gombra kattintva.';
  readonly quoteExpiredMessage =
    'Az árajánlat lejárt. Kattints a „Árajánlat frissítése” gombra az új végösszegért.';
  readonly outOfStockMessage =
    'Egy vagy több változat elfogyott. Visszavonulhatsz a kosárhoz a cikk korrigálásához.';
  readonly errorMessage = 'A rendelés leadása nem sikerült.';
```

  They stop being `computed<string>` because nothing reactive is left in them; the
  template bindings (`review-step.html:145`, `:153`, `:161`, `:170`) drop their `()`
  accordingly. `fieldErrorMessage` is renamed `errorMessage` because the state it serves
  is now called `error`. Record in the commit body that the backend detail string stopped
  being rendered and that R15 is the reason.
- **`review-step.html:135-176` — the status block.** `@if (state() !== null)` at `:135`
  goes: `state` is `input.required<ReviewState>()` and is never null. `@switch
  (state()!.kind)` at `:137` becomes `@switch (state())`, and the five `@case` labels
  change from the `QuoteState` spelling to the `ReviewState` spelling: `'loading'` →
  `'quoting'`, `'price-changed'` stays, `'quote-expired'` → `'expired'`,
  `'out-of-stock'` → `'stock-error'`, `'field-error'` → `'error'`. Add the sixth and
  seventh members, `'ready'` (no banner) and `'submitting'` (the existing
  `app-loading-state`), so the switch covers all seven and no state renders nothing by
  accident. The `'submitting'` arm's label is `"Véglegesítés…"`, the CTA's own
  `loadingLabel` at `review-step.html:272`, rather than the `'quoting'` arm's "Árajánlat
  frissítése" — reused existing copy, not new copy, which `FIX-35` owns. `'submitting'`
  is a state the user can now sit in (item 6 maps a pending payment onto it), not only a
  flicker during a request. **The CTA's `[loading]="submitting()"` (`review-step.html:273`)
  loses its signal with the network half**: `submitting` moves to the container with
  `onSubmit()`'s network half, so the binding becomes `[loading]="state() === 'submitting'"`.
  `submitted` (`review-step.ts:131`) is **not** moved — the local gating still sets it and
  the two consent computeds still read it.
- Delete the constructor's `quoteController.syncFromFacade()` call and the mount `effect()`
  (`:379-397`) — the container now owns triggering the initial quote fetch.
- `onEditContact()`/`onEditDelivery()` (`:403-409`): replace the `quoteController.invalidate()`
  body with `this.editRequested.emit('contact')` / `this.editRequested.emit('delivery')`.
  **Keep the `routerLink` attributes on the two "Szerkesztés" anchors unchanged** — this
  mirrors the breadcrumbs' own `routerLink` usage on the same template, which `FIX-56`
  left in place and assigned to `FIX-55` rather than removing; client-side anchor
  navigation is not SDK/repository knowledge.
- `onRefresh()` (`:411-414`) and `onDismissStatus()` (`:424-426`): both become
  `this.refreshQuote.emit()`, replacing the direct `quoteController.refresh()` call.
- `onSubmit()` (`:428-453`, the file's last method): the local gating (`if (!this.canSubmit())`,
  `this.submitted.set(true)`) stays; the network half (`createPaymentIntent`,
  `commitOrder`, the navigate call) is deleted and replaced with
  `this.submitRequested.emit()` on a locally-valid submission.
- `onBack()` (`:399-401`) navigates to `/penztar/szallitas` and has no output in the
  contract — the same gap `FIX-56` recorded for `DeliveryStep.onBack()`. Record it in the
  commit body; do not invent a fourth output.
- `openTerms()`/`closeTerms()` (`:416-422`) stay unchanged; the terms dialog is local UI
  state.

### 5. `src/app/features/checkout/checkout-form.model.ts` — declare `CheckoutDraft`

`docs/spec/components.md:7` (Shared types) says *"`CheckoutDraft` composes optional
Contact, DeliverySelection and paymentMethod"* — exactly three fields, not the six
`CheckoutSession` (`src/app/api/generated/models/checkout-session.ts`) carries.
`CheckoutSession` already has all three under those exact names
(`contact?: Contact; delivery?: DeliverySelection; paymentMethod?: 'demo_card'|'demo_cod'`),
plus `cartId`/`cartVersion`/`quote`, which `CheckoutDraft` does not name. Declare the
precise shape with `Pick` rather than aliasing the wider type, so the declared surface
matches the specification exactly and a future field added to `CheckoutSession` does not
silently widen `CheckoutDraft` too:

```ts
import type { CheckoutSession } from '../../api/generated/models/checkout-session';

/** The spec's own shape (components.md:7 — "Shared types"): the three optional
 *  draft fields out of the six `CheckoutFacade.session()` carries. Structural
 *  typing lets a full `CheckoutSession` bind directly to a `[draft]` input typed
 *  this way — the extra fields on the wider type are simply ignored. */
export type CheckoutDraft = Pick<CheckoutSession, 'contact' | 'delivery' | 'paymentMethod'>;
```

The container binds `[draft]="checkoutFacade.session()"` once `session()` is non-null;
no cast and no runtime narrowing is needed for this to type-check.

**`FIX-56` also appends to this same file** (its item 2 declares `CheckoutFieldTree`
beside this task's `CheckoutDraft`). The two additions are disjoint; whichever task
lands second appends beside the first, and the two must never run concurrently.

### 6. `src/app/features/checkout/quote-state.ts` — declare `ReviewState`

`docs/spec/components.md:7` (Shared types) types `ReviewState` with **seven** members —
*"`ReviewState = quoting | ready | expired | price-changed | stock-error | submitting |
error`"* — one more than the six the per-component "Required states" line at `:621` lists.
`QuoteController`'s existing `QuoteState` stays exactly as it is — it is a working, tested
internal state machine and nothing here requires renaming its branches. Add a new,
separate type matching the contract's full seven-member shared type, plus one mapping
function the container uses:

**Why a string union and not an object union.** `components.md:7` writes each shared
union as `Name = a | b | c` and each shared *object* as `Name = {field:type; …}` —
`UiProblem`, `FilterIdentity`, `CategoryShortcut` and `LicensedLocalModel` all carry
braces on that line and `ReviewState` does not. Every other brace-less union on the same
line is implemented in this repository as a plain string union: `AsyncStatus` at
`src/app/shared/ui/price-block/price-block.ts:3`, `CheckoutStep` at
`src/app/layouts/checkout-layout.ts:25`. So the notation settles the shape and D1 makes
that reading binding; inventing an object union over a type the specification spells out
is exactly what D1 forbids a task from doing. The payload the object union would have
carried needs no carrier: `quote` is already one of `ReviewStep`'s four declared inputs
(`components.md:615`), and `detail` is backend text R15 keeps off the screen.

```ts
/** `components.md:7`'s shared `ReviewState`, spelled the way that line spells it and the
 *  way every other union on it is implemented in this repository
 *  (`AsyncStatus` at `price-block.ts:3`, `CheckoutStep` at `checkout-layout.ts:25`).
 *  It carries no payload: `quote` is `ReviewStep`'s own declared input
 *  (`components.md:615`) and the backend `detail` string is not rendered (R15). */
export type ReviewState =
  | 'quoting'
  | 'ready'
  | 'expired'
  | 'price-changed'
  | 'stock-error'
  | 'submitting'
  | 'error';

/** Maps the internal QuoteController state machine onto components.md:7's
 *  seven-member ReviewState. `field-error` — a quote-fetch failure that is neither a
 *  price, stock nor expiry rejection — maps onto the spec's own `error` member, an
 *  exact fit rather than an approximation, and it is the only producer of that member.
 *
 *  `paymentOutcomeUnknown` is true while FIX-25's `SubmitFailure` is `pending`: the demo
 *  payment may still land and no second order may be sent. That is the specification's
 *  own `submitting` member — as far as the screen is concerned the submission is still in
 *  flight — and mapping it there is what disables the CTA, because `canSubmit()` requires
 *  `state() === 'ready'`. That is FIX-25's item-4 gate (`FIX-25.md:150-161`) expressed
 *  through the declared input instead of through a signal `ReviewStep` no longer owns.
 *
 *  A `declined` or generic `error` outcome deliberately maps to nothing here. The quote is
 *  untouched, so the state stays `ready`, the CTA stays enabled, and the retry
 *  `docs/spec/screens.md:87` requires — measured by FIX-25-AC03 — is still possible. That
 *  failure is rendered by `ReviewPage` (FIX-63 item 7), which is also where the backend
 *  `detail` FIX-25-AC05 measures stays: it never enters this type. */
export function toReviewState(
  state: QuoteState,
  submitting: boolean,
  paymentOutcomeUnknown: boolean,
): ReviewState {
  if (state.kind === 'ready' && (submitting || paymentOutcomeUnknown)) {
    return 'submitting';
  }
  switch (state.kind) {
    case 'idle':
    case 'loading':
      return 'quoting';
    case 'ready':
      return 'ready';
    case 'quote-expired':
      return 'expired';
    case 'price-changed':
      return 'price-changed';
    case 'out-of-stock':
      return 'stock-error';
    case 'field-error':
      return 'error';
  }
}
```

`ReviewStep`'s `@case ('field-error')` branch becomes `@case ('error')` and renders the
same generic `StatusMessage` it renders today (R15: generic message, no backend
detail), reading the constant `errorMessage` from item 4 rather than the deleted
`fieldErrorMessage()` computed, with its dismiss control emitting `refreshQuote`.

### 7. `src/app/features/checkout/review-page.ts` — becomes the owner

Replace the nine-line re-export with a real container component that keeps the
`ReviewPage` export name, because `checkout.routes.ts:231` binds to it. The container:

- injects `CartFacade`, `CheckoutFacade`, `QuoteController` and `Router` — the four
  dependencies this task removes from `ReviewStep`, moved rather than deleted;
- owns `readonly submitting = signal<boolean>(false)` and
  `readonly submitFailure = signal<SubmitFailure | null>(null)` (the type and the signal
  moved up from `ReviewStep`, where `FIX-25` declared them), owns `FIX-25`'s
  `submitFailureMessage` computed (`FIX-25.md:131-148`) moved up **verbatim, every
  sentence unchanged**, and calls `quoteController.syncFromFacade()` plus the mount
  `effect()` this task deleted from `ReviewStep` (moved, not rewritten);
- derives the child's state once, as a computed, rather than calling a function from a
  template binding:

  ```ts
    readonly reviewState = computed<ReviewState>(() =>
      toReviewState(
        this.quoteController.state(),
        this.submitting(),
        this.submitFailure()?.kind === 'pending',
      ),
    );
  ```
- renders `<app-review-step>` with `[quote]="quoteController.quote()"`,
  `[cart]="cartFacade.cart()"` (gated behind a loading branch until the cart is non-null,
  the same way `DeliveryStep`'s container gates on its options fetch),
  `[draft]="checkoutFacade.session()"` (gated the same way), `[state]="reviewState()"`;
- **renders `FIX-25`'s failure block itself**, immediately after `<app-review-step>` and
  inside the same gated branch. `ReviewStep`'s declared input list is closed at four
  (`components.md:615`) and `ReviewState` cannot carry a `pending`-versus-`declined`
  distinction, a backend `detail` or a second control, so the block stays with the
  `SubmitFailure` signal that drives it rather than being pushed through the child.
  `StatusMessage` and `Button` move into this container's `imports`, and the
  `.submit-failure` rule `FIX-25.md:195-204` adds to `review-step.scss` moves into this
  container's styles unchanged:

  ```html
          @if (submitFailure(); as failure) {
            <div class="submit-failure" data-testid="review-submit-failure">
              <app-status-message
                [message]="submitFailureMessage()"
                [severity]="failure.kind === 'pending' ? 'info' : 'error'"
                [persistent]="true"
              ></app-status-message>
              @if (failure.kind === 'pending') {
                <app-button
                  variant="secondary"
                  size="comfortable"
                  label="Árajánlat frissítése"
                  (pressed)="onRefreshQuote()"
                  data-testid="review-pending-refresh"
                ></app-button>
              } @else {
                <app-button
                  variant="secondary"
                  size="comfortable"
                  label="Fizetési mód módosítása"
                  (pressed)="onChangePayment()"
                  data-testid="review-change-payment"
                ></app-button>
              }
            </div>
          }
  ```

  `onChangePayment()` is `void this.router.navigate(['/penztar/szallitas'])` — what
  `ReviewStep.onBack()` did for `FIX-25`'s button before this task took the `Router` out
  of the child. **`review-pending-refresh` is the one control this task adds that
  `FIX-25` did not write, and it is added because this task's own restructuring would
  otherwise trap the user.** `FIX-25`'s way out of a pending outcome was the existing
  refresh button (`review-step.html:331-339`), which is `[disabled]="busy()"`; with
  pending mapped onto `'submitting'`, `busy()` is true and that button is dead. The
  label is the same string that button already renders, so no copy is invented and
  `FIX-35` keeps its ownership. Record the added control and this reason in the commit
  body.
- handles `(editRequested)` by calling `quoteController.invalidate()` — exactly what
  `ReviewStep.onEditContact()`/`onEditDelivery()` did before this task, moved up;
- handles `(refreshQuote)` with `onRefreshQuote()`, which clears `submitFailure`
  (`this.submitFailure.set(null)`) and calls `quoteController.refresh()` — clearing it
  here is what lets the user out of a `pending` outcome, since that is the one
  `SubmitFailure` kind `toReviewState` turns into `'submitting'`, and it is the same
  "asking for a fresh quote is the documented way out" behaviour `FIX-25.md:159-161`
  built into `onRefresh()`. The same method backs the `review-pending-refresh` button
  above;
- handles `(submitRequested)` by doing what `onSubmit()`'s network half did **after
  `FIX-25` landed** (`review-step.ts:428-453` as FIX-25 rewrote it, `FIX-25.md:91-121`):
  set `submitting`, clear `submitFailure`, call `createPaymentIntent()` when the payment
  method is `demo_card`, branch on `intent.value.status` for `'declined'` and
  `'pending'`, call `commitOrder()`, branch on `order.error.code === 'PAYMENT_DECLINED'`,
  and navigate to `/penztar/siker/:orderId` on success. **Move `FIX-25`'s
  `SubmitFailure` type and its `submitFailureMessage()` computed up into this container
  unchanged** — `readonly submitFailure = signal<SubmitFailure | null>(null)` replaces
  the `submitError` signal named above. `toReviewState` (item 6) is fed only
  `submitFailure()?.kind === 'pending'`; the message and the `declined`-versus-`error`
  difference stay in this container's own template, because the string union cannot
  carry either. Do not invent a new message: `FIX-25.md:131-148` takes every sentence
  from `docs/design/prototype.html:39` and `docs/spec/screens.md:87`, and re-deriving one
  here would regress the copy `FIX-25` landed. Keep the `finally` that clears
  `submitting`: a pending outcome is not an in-flight request, and what keeps the screen
  in `submitting` is the `SubmitFailure`, not a lie about the request.

**The wire behaviour must not change.** The same two calls, the same destination route.

## Out of scope

- **Sequencing with `FIX-25`, which lands first and whose fix this task carries
  forward.** `FIX-25` makes a declined, pending or failed order commit visible in
  `ReviewStep`: a `SubmitFailure` discriminated signal (`FIX-25.md:75-78`), a
  `submitFailureMessage()` computed whose three sentences come from
  `docs/design/prototype.html:39` and `docs/spec/screens.md:87` (`FIX-25.md:131-148`), a
  `canSubmit()` gate that refuses a retry while the outcome is `pending`
  (`FIX-25.md:150-161`), and a rendered block carrying
  `data-testid="review-submit-failure"` and `data-testid="review-change-payment"`
  (`FIX-25.md:166-185`). **Every one of those four survives this task**, relocated rather
  than rewritten, and so does the rendered block: `data-testid="review-submit-failure"`
  with `[persistent]="true"`, the `review-change-payment` button and the
  `.submit-failure` rule are built in the container's own template and styles exactly as
  `FIX-25.md:166-185` and `:195-204` build them, because `ReviewStep`'s input list is
  closed at four and a string `ReviewState` can carry neither the backend `detail`
  `FIX-25-AC05` measures nor the `pending`-versus-`declined` distinction. **`ReviewState`
  as declared cannot carry that distinction, and this is how it is settled rather than
  deferred**: `toReviewState` (item 6) takes one boolean,
  `submitFailure()?.kind === 'pending'`, and maps it onto the specification's own
  `submitting` member, which disables the CTA through `canSubmit()`'s
  `state() === 'ready'` test — `FIX-25`'s item-4 gate (`FIX-25.md:150-161`)
  re-expressed, not dropped, and the one line of `FIX-25` this task rewrites rather than
  relocates. A `declined` or `error` outcome maps to no state change at all, which is
  what keeps the CTA enabled for `FIX-25-AC03`'s second attempt. **Three consequences to
  carry, each recorded in the commit body.** The banner moves out of the child's column
  and renders below `<app-review-step>`, which is a placement change from
  `FIX-25.md:163-164`'s "immediately above `<div class="actions">`"; the pending branch
  gains the `review-pending-refresh` control described in item 7, because this task's own
  mapping disables the refresh button `FIX-25` relied on; and `FIX-25`'s two
  `data-testid` assertions (`FIX-25.md:206-215`) move with the markup, asserted against
  `ReviewPage` rather than `ReviewStep`. Do not drop any of the four, and do not replace
  `FIX-25`'s copy with a generic message.
- **Sequencing with `FIX-20`, which lands first.** It fixes `ContactStep`'s
  prefill/empty-form-bypass defect and de-duplicates
  `EMAIL_RFC5322_SUBSET`/`PHONE_INTERNATIONAL` into `contact.schema.ts`, touching
  `contact-step.ts:125-135` (the seed constant), `:187` (the model signal init), `:137-140`
  and its use sites `:233`/`:253` (the local regex declarations), and `contact-step.html`'s
  three inputs. None of those lines are touched by this task's edits to `contact-step.ts`
  (which start at `:172` and run through the end of `onSubmit()`), so the two tasks do not
  rewrite the same lines — but this task's restructuring **deletes** the `model` signal
  and the local schema-building code FIX-20 edits, so it must run **after** FIX-20 has
  landed, carrying FIX-20's fix forward rather than re-deriving it: the empty starting
  value and the single-owner regex constants move into `buildContactForm`'s schema (item 2
  above), unchanged in substance. If FIX-20 has not landed when this task is executed,
  stop and report — do not restructure a file whose prefill/validation fix is still
  pending, and do not re-derive FIX-20's fix independently.
- **`FIX-44`'s payment-decline/commit-failure surface for `DeliveryStep`.** Different
  component, already owned; this task's `ReviewStep` fix is a separate, parallel fix for a
  different screen, using the `error` state `components.md:7` already declares.
- **`ContactStep`'s dropped field-level server-error mapping.** Recorded above as a
  narrowing, not repaired — re-deriving it through the new input surface is a larger piece
  of work.
- **`QuoteController` and `QuoteState`.** Unchanged; `toReviewState` wraps it rather than
  renaming its branches.
- **`AddressForm` and `PaymentMethodSelector`.** Their entries at `components.md:581-590`
  and `:596-605` are not measured by this task. Change neither.
- **The breadcrumbs' `href` versus `routerLink` on both screens — `FIX-55`.** Its own
  commit, per `FIX-56`.
- **UI copy — `FIX-35`.** No label, message or heading text changes in this task.
- **The wizard's routing, guards and `CheckoutFacade` itself.** Both containers inherit the
  navigation and guards that exist; neither redesigns them. `checkout.guards.ts` is not
  touched.
- **The Signal Forms field-tree binding for `AddressForm`** (it does not use one today,
  per `FIX-20`'s own out-of-scope note) — untouched by this task.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`),
`npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41
failures (`FIX-09`). Write the assertions in the right files and do not gate on
`npm run test`'s exit code; `FIX-04` is what turns it green.

**Prerequisites, in this order: `FIX-07`, `FIX-07b`, `FIX-20`, then `FIX-67`.** `FIX-07`
and `FIX-07b` own removing the source-text-pattern assertions in
`tests/review-step.spec.ts` and `tests/contact-step.spec.ts` that this task's
restructuring would otherwise break — both existing suites are rewritten by this task,
not merely extended, and must target what `FIX-07`/`FIX-07b` leave behind. `FIX-20` fixes
`ContactStep`'s prefill/empty-form-bypass defect and de-duplicates the two regex
constants, which this task carries forward rather than re-derives; `FIX-67` moves
`AsyncStatus` to `src/app/shared/types/async-status.ts`, which is the path item 1 imports
from. If any is missing, stop and report — do not work around a missing one.

```bash
npm run build               # expected exit 0
npm run test                 # record the exit code; a failure attributable to FIX-04 does not fail this task
grep -cE "inject\(CONTACT_DRAFT_SAVER\)|inject\(Router\)" src/app/features/checkout/contact-step.ts
                            # expected: 0
grep -cE "inject\(CartFacade\)|inject\(CheckoutFacade\)|inject\(QuoteController\)|inject\(Router\)" src/app/features/checkout/review-step.ts
                            # expected: 0
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Browser checks (mandatory — both are screens a person fills in):

1. At 1440, reach `/penztar/adatok` by clicking through the checkout (open a product,
   add to cart, "Tovább a pénztárhoz"), never by typing the URL. Leave all three fields
   empty and confirm FIX-20's validation behaviour still holds (no navigation, no network
   request), then fill valid values and confirm the continue button reaches
   `/penztar/szallitas`.
2. Continue through delivery to reach `/penztar/ellenorzes`. Confirm the cart lines,
   contact snapshot, delivery choice and payment method render from the new inputs. Check
   both consents, activate the terms dialog and close it, then submit; confirm the
   application lands on `/penztar/siker/:orderId`.
3. On the review screen, click "Szerkesztés" beside the contact section; confirm it
   navigates to `/penztar/adatok` and that returning to review re-fetches a quote (network
   panel shows a fresh `POST /checkout/{id}/quote`).
4. Re-run `FIX-25`'s own two scenarios against the restructured screen, the way
   `FIX-25.md:255-282` reaches them — the parameter must be on the **first** page load of
   the tab and the whole flow is walked by clicking. With
   `?mi-scenario=payment-declined` and "Bankkártya (szimulált)", activate submit and
   confirm `[data-testid="review-submit-failure"]` renders `FIX-25`'s declined sentences,
   `[data-testid="review-change-payment"]` is present and reaches `/penztar/szallitas`,
   and `[data-testid="review-submit"]` is still enabled. With
   `?mi-scenario=payment-pending-timeout`, confirm the banner says the outcome is not yet
   known, `[data-testid="review-submit"]`'s `disabled` property is `true`, and
   `[data-testid="review-pending-refresh"]` re-issues a fresh
   `POST /checkout/{id}/quote` and clears the banner. Screenshot the failure banner
   together with the CTA at both viewports: the banner is rendered outside the step's
   column now, and that screenshot is what says whether a person sees it.
5. Repeat step 2's happy path at 390.

Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R14 applies and is the rule this task restores**: both components render every state
  their entry requires — `ContactStep`: pristine, dirty, invalid, valid, saving, error;
  `ReviewStep`: quoting, ready, expired, price-changed, stock-error, submitting, and the
  `error` state this task newly wires up (`components.md:7`'s seventh `ReviewState`
  member) — and each is now reachable by setting an input rather than by manipulating a
  live facade. Verify the reachable subset in the browser and record a screenshot of each.
- **R15 applies**: both save/submit error branches keep a generic, user-visible message
  and must not start leaking backend detail into the UI when the message moves to the
  container.
- **R19 applies**: invalid, saving/submitting and error must stay visually distinct on
  both screens after the restructuring.
- **R20 and R21 apply**: every field, consent checkbox, edit link and CTA keeps its
  accessible name and 44 px minimum target. Measure the rendered rects, not the CSS.
- **R23 applies**: after `(refreshQuote)` re-renders the review screen, focus must not be
  lost to the document body; the terms dialog keeps its existing focus trap.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R13, R16–R18, R22, R24, R25: N/A — this change moves responsibility between
  TypeScript files and two templates. It introduces no brand asset, colour, dimension,
  font, centerline, copy string, data source or handoff artefact, and it changes no
  rendered text.

## Acceptance criteria

- [ ] **FIX-63-AC01** `src/app/features/checkout/contact-step.ts` declares exactly the
      contract's two inputs (`contactFields`, `saveState`) and one output
      (`continueRequested`). No second output is added.
- [ ] **FIX-63-AC02**
      `grep -cE "inject\(CONTACT_DRAFT_SAVER\)|inject\(Router\)|submitContact" src/app/features/checkout/contact-step.ts`
      prints `0`.
- [ ] **FIX-63-AC03** `src/app/features/checkout/review-step.ts` declares exactly the
      contract's four inputs (`quote`, `cart`, `draft`, `state`) and three outputs
      (`editRequested`, `refreshQuote`, `submitRequested`). No fifth input and no fourth
      output is added.
- [ ] **FIX-63-AC04**
      `grep -cE "inject\(CartFacade\)|inject\(CheckoutFacade\)|inject\(QuoteController\)|inject\(Router\)" src/app/features/checkout/review-step.ts`
      prints `0`.
- [ ] **FIX-63-AC05** `grep -n "export { ContactStep as ContactPage }" src/app/features/checkout/contact-page.ts`
      and the equivalent for `review-page.ts` both return nothing — both files declare a
      real `@Component` class instead of a re-export.
- [ ] **FIX-63-AC06** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own specs with
      `npx vitest run tests/contact-step.spec.ts tests/review-step.spec.ts` instead
      (create `tests/review-step.spec.ts` if it does not exist yet; `FIX-06` owns spec
      placement, and this file follows that placement from the start).
- [ ] **FIX-63-AC07** `tests/contact-step.spec.ts` contains a test that renders
      `ContactStep` with `contactFields`/`saveState` set directly and **no
      `CONTACT_DRAFT_SAVER` provided**, asserting it renders; that test passing without
      the saver is the proof the component no longer knows the save path.
- [ ] **FIX-63-AC08** `tests/review-step.spec.ts` contains a test that renders
      `ReviewStep` with all four inputs set directly and **no `CartFacade`,
      `CheckoutFacade` or `QuoteController` provided**, asserting it renders the given
      cart lines and quote totals; a test per `state` kind — including `error`, the
      seventh member this task newly wires up — asserting a rendered difference; and a
      test that each of the three outputs emits from its triggering control.
- [ ] **FIX-63-AC09** **Real-browser check, the contact step.** At 1440, reached by
      clicking through the cart: the empty-submit and valid-submit behaviours from
      "How to verify" step 1 both hold, and `list_console_messages` reports zero errors.
- [ ] **FIX-63-AC10** **Real-browser check, the review step.** At 1440, "How to verify"
      steps 2 and 4 both complete: the happy path through to the success page, and both
      of `FIX-25`'s scenarios, with **FIX-25-AC01, AC02, AC03 and AC04 still holding
      against the restructured screen** — each re-measured and its result quoted in the
      commit body. `list_console_messages` reports zero errors.
- [ ] **FIX-63-AC11** **Real-browser check at 390.** The review screen's happy path
      completes at a 390 px viewport and `document.documentElement.scrollWidth` is not
      greater than `window.innerWidth + 1`.
- [ ] **FIX-63-AC12** The commit body names the "Two things this task found" section's two
      findings — the narrowed server-error mapping on contact save (recorded, not
      repaired) and the `ReviewStep` order-submission silence (fixed by `FIX-25` and
      relocated here into `ReviewPage`, not re-derived) — and records that `FIX-20` and
      `FIX-25` both landed first. It also records the three consequences named in the
      `FIX-25` bullet of "Out of scope": the banner's new placement, the added
      `review-pending-refresh` control and why it was needed, and the one `FIX-25` line
      re-expressed rather than relocated (`canSubmit()`'s pending gate, now
      `state() === 'ready'`).

## Commit

This task is exactly one commit covering `contact-step.ts`, `contact-page.ts`,
`contact.schema.ts`, `review-step.ts`, `review-page.ts`, `review-step.scss` (the
`.submit-failure` rule `FIX-25` put there leaves it for the container),
`checkout-form.model.ts`, `quote-state.ts`, both step templates, the two containers'
own markup and styles, and both test files. The two components' fixes are one
commit because they are the same defect class, the same spec section, and the same
sequencing prerequisite (`FIX-20`); splitting them would leave one component's R01–R26
record in the commit body without the other. Do not bundle it with **FIX-20**,
**FIX-44**, **FIX-55** or **FIX-35**, each of which is its own commit in the same area.
Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
refactor: give ContactStep and ReviewStep the inputs and outputs components.md declares
```
