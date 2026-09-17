# FIX-56 — Bring `DeliveryStep`'s signature back to `components.md:570-572`

Status: PLANNED — not executed.
Severity: major
Source: Review round item N1 (orchestrator-measured), `docs/spec/components.md:566-576`, decision **D1**. Named as unowned in `FIX-44`'s and `FIX-50`'s out-of-scope sections; this task is its owner.

## Why this is wrong

`docs/spec/components.md` is the component contract: for each component it fixes the
owner, the signal inputs, the outputs, the functions and the required states. Decision
**D1** settles what happens when the code disagrees — *"`docs/` is the specification.
Where the code differs from it, the code is wrong and the fix task changes the code,
never the spec."*

`DeliveryStep`'s entry at `docs/spec/components.md:566-576` gives it an owner
(*"CheckoutFacade form owner"*), three inputs (`options`, `fields`, `saveState`) and two
outputs (`continueRequested`, `retryOptions`). **The implementation has none of the five
and is not owned by anything**: it is the routed component itself, it fetches its own
`CheckoutOptions` over the wire, it holds its own load state machine, and it navigates
itself to the next step. That is the same defect class as **FIX-50**'s five components,
one screen further into the checkout, and it is why two sibling tasks both had to list it
in their out-of-scope sections.

A component that owns its own fetch, its own state machine and its own navigation cannot
be rendered in any other context, cannot be given a failing `saveState` by a test without
breaking the network, and duplicates state the `CheckoutFacade` already holds —
`components.md:3` states the rule this violates: *"Public inputs use
input()/input.required(); intents use output()… No presentation component knows the SDK
or repository."* `DeliveryStep` knows both.

## Evidence

**The contract.** `docs/spec/components.md:566-576`:

```
### DeliveryStep — purchase/delivery / T21

**Owner:** CheckoutFacade form owner.

**Signal inputs:** `options:CheckoutOptions; fields:CheckoutFieldTree; saveState:AsyncStatus`.

**Outputs:** `continueRequested:void; retryOptions:void`.

**Functions:** Render delivery options, conditional address and simulated payment selection; no real-card inputs.

**Required states:** loading,ready,invalid,saving,error.
```

**The implementation has no inputs and no outputs at all.** Measured across every
`@Component` in `src/app`:

```
$ grep -cE "=\s*(input|model)[.<(]" src/app/features/checkout/delivery-step.ts
0
$ grep -cE "=\s*output[<(]" src/app/features/checkout/delivery-step.ts
0
```

What the spec calls an output is a plain signal the parent cannot subscribe to,
`delivery-step.ts:140`:

```ts
  /** Snapshot the parent reads through the `(selectionChanged)` event. */
  readonly selectionChanged = signal<DeliverySelectionChange | null>(null);
```

The comment describes an `output()`; the code is a `signal()`. `(selectionChanged)` in a
parent template would not bind to it, and no parent template exists to try.

**It knows the SDK.** `delivery-step.ts:112-115` and `:254-273`:

```ts
  private readonly http = inject(HttpClient);
  private readonly checkoutFacade = inject(CheckoutFacade);
  private readonly router = inject(Router);
  private readonly api: Api;
```

```ts
  async loadOptions(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.invoke(operations.getCheckoutOptions, {}),
      );
      this.state.set({ kind: 'ready', options: response });
```

`options` is meant to arrive as an input; instead the component fetches it and wraps it in
a private state machine, `delivery-step.ts:93-96`:

```ts
type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; detail: string }
  | { kind: 'ready'; options: CheckoutOptions };
```

**It navigates itself**, `delivery-step.ts:341`:

```ts
      await this.router.navigate(['/penztar/ellenorzes']);
```

`continueRequested:void` exists in the contract precisely so the owner decides that.

**There is no owner to give it inputs.** `src/app/features/checkout/delivery-page.ts` is
nine lines and all nine are a re-export:

```ts
export { DeliveryStep as DeliveryPage } from './delivery-step';
```

`checkout.routes.ts:220` routes `szallitas` to that name, so `DeliveryStep` is mounted
directly by the router with no parent template — which is exactly why it has no inputs.
Giving it inputs and leaving `delivery-page.ts` a re-export would produce a component
nothing can fill.

**Two of the three input types are not declared anywhere in the repository.**

- `CheckoutFieldTree` appears in the whole repository exactly once, at
  `docs/spec/components.md:570`. `grep -rn "CheckoutFieldTree" src` returns nothing. The
  type it names already exists under another spelling:
  `src/app/features/checkout/checkout-form.model.ts:277-280` declares
  `buildCheckoutForm(model): FieldTree<CheckoutFormModel>`, and `checkout.facade.ts:238`
  holds the one instance, `readonly form = buildCheckoutForm(this.modelWritable)`.
- `UiProblem` is declared in `docs/spec/components.md:7` and nowhere in the code:
  `grep -rn "UiProblem" src` returns nothing. **FIX-50** creates it at
  `src/app/shared/types/ui-problem.ts` (`FIX-50`'s "What to change").

`AsyncStatus` does exist, but in an odd place:
`src/app/shared/ui/price-block/price-block.ts:3` declares
`export type AsyncStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error'`, matching
`components.md:7` exactly, and `src/app/shared/ui/index.ts:5` re-exports it.

## What to change

The change has two halves and they are one commit, because either half alone leaves the
screen broken: a presentational `DeliveryStep` with no container renders nothing, and a
container with nothing to fill has no reason to exist.

### 1. `src/app/features/checkout/delivery-step.ts` — the declared surface

Add the three inputs and the two outputs, and delete what they replace.

```ts
  readonly options = input.required<CheckoutOptions>();
  readonly fields = input.required<CheckoutFieldTree>();
  readonly saveState = input<AsyncStatus>('idle');

  readonly continueRequested = output<void>();
  readonly retryOptions = output<void>();
```

`input.required` for the first two because the component cannot render without them, and
a plain `input` with an `'idle'` default for `saveState` because `idle` is the state
before anything has been saved. `components.md:3` requires exactly these two APIs:
*"Public inputs use input()/input.required(); intents use output()."*

Then remove what the inputs supersede:

- Delete `loadOptions()` (`:254-273`), `onRetry()` (`:275-280`), the `LoadState` type
  (`:93-96`), the `state` signal (`:120`), the `retrying` signal (`:122`) and the
  `readyOptions` computed (`:147-150`). The template reads `options()` directly, and the
  loading and error branches are driven by the owner, which is what the contract's
  `Owner:` line means.
- Delete the `HttpClient`, `Api` and `ApiConfiguration` wiring (`:112`, `:115`, `:158`)
  and the `operations` import at `:64`. The component must not know the SDK.
- Delete the `Router` injection (`:114`) and the `router.navigate` call at `:341`.
  `onConfirm()` ends by emitting `this.continueRequested.emit()`.
- Delete the `selectionChanged` signal at `:140` and every write to it (`:187`, `:319`,
  `:392`). `onBack()` at `:388-393` sets it to `null` as a stand-in for an intent that has
  no output; it goes with it. If a "back" intent is still needed by the container, the
  contract gives the component no output for one — leave the button's behaviour to the
  container's own breadcrumb and record the gap in the commit body rather than inventing
  a third output.
- Keep `snapshotChange`, `snapshotAddress`, `isAddressComplete`, `feeFor`,
  `currentShippingFee`, `requiresAddress`, `canConfirm`, `radioId`, `optionDescId`,
  `onOptionSelected` and `onPaymentChanged` as they are. They are presentation.

Replace the local address signals (`:129-134`) with reads and writes through
`fields()`. `fields` is the Signal Forms field tree the facade already owns, and
`components.md:3` names this the deliberate exception: *"Signal Forms fields are the
deliberate parent-owned two-way binding exception."* `syncFacadeForm` (`:357-386`) exists
today only because the component keeps a second copy of the same values; once the fields
are bound, that whole method goes.

Add the type import for `AsyncStatus`. **`FIX-67` now owns moving `AsyncStatus`** out of
`src/app/shared/ui/price-block/price-block.ts` into `src/app/shared/types/async-status.ts`,
and the barrel (`src/app/shared/ui`, `index.ts:5`) stops re-exporting it once that task
lands. Check which of the two tasks has landed first: `grep -n "export type AsyncStatus" src/app/shared/ui/price-block/price-block.ts`.

- **If that grep prints a line, `FIX-67` has not landed yet.** Import `AsyncStatus` from
  the existing barrel, `src/app/shared/ui` (`index.ts:5`), exactly as before. `FIX-67`'s own
  "What to change" item 5 finds and adjusts this one import line to
  `'../../shared/types/async-status'` when it lands after this task.
- **If that grep prints nothing, `FIX-67` has already landed.** Import `AsyncStatus`
  directly from `'../../shared/types/async-status'` instead.

State in the commit body which of the two cases applied.

### 2. `src/app/features/checkout/checkout-form.model.ts` — declare `CheckoutFieldTree`

One line, beside `buildCheckoutForm`:

```ts
/** The Signal Forms field tree the CheckoutFacade owns. `components.md:570`
 *  names this type `CheckoutFieldTree`; it is the return type of
 *  `buildCheckoutForm` under the name the specification uses. */
export type CheckoutFieldTree = FieldTree<CheckoutFormModel>;
```

This is the specification's own name for a type that already exists, so declaring it is
not an invention. Under decision **D10** the specification's name wins, so the alias takes
the spec's spelling and `buildCheckoutForm`'s return annotation is updated to use it.
**`FIX-63` also appends to this same file** (its item 5 declares `CheckoutDraft` beside
this task's `CheckoutFieldTree`). The two additions are disjoint; whichever task lands
second appends beside the first, and the two must never run concurrently.

### 3. `src/app/features/checkout/delivery-page.ts` — becomes the owner

Replace the nine-line re-export with a real container component that keeps the
`DeliveryPage` export name, because `checkout.routes.ts:220` binds to it. The container:

- injects `CheckoutFacade` and the generated `Api`, and does the `getCheckoutOptions`
  fetch that `delivery-step.ts:254-273` does today — moved, not rewritten;
- holds the load state machine that `LoadState` holds today — moved, not rewritten;
- renders `<app-delivery-step>` with `[options]`, `[fields]="checkoutFacade.form"` and
  `[saveState]`, bound to that state;
- renders the loading and error branches itself, and handles `(retryOptions)` by
  re-running the fetch;
- handles `(continueRequested)` by doing what `onConfirm()`'s tail does today
  (`delivery-step.ts:329-344`): the two facade saves and then
  `router.navigate(['/penztar/ellenorzes'])`.

**The wire behaviour must not change.** This is a relocation of responsibility, not a
redesign: the same request, the same two saves, the same destination route.

### 4. The error surface, and the one type this task must not declare

**FIX-44** adds the error surface for `onConfirm()`'s swallowed save failure, and lands
before this task. If that surface is typed with `UiProblem`, keep the type and import it
from `src/app/shared/types/ui-problem.ts`. **That file is created by `FIX-50` and this
task must not create a second declaration of the same type.** If FIX-50 has not landed
when this task is executed, stop and report rather than declaring it locally: two
declarations of one shared type is the drift the package exists to remove.

### 5. The tests

The three spec files covering `DeliveryStep` — `tests/checkout-f2.spec.ts`,
`tests/checkout-delivery.spec.ts` and `tests/checkout-f6.spec.ts` (`grep -rln
"DeliveryStep" src tests` locates them) — must together gain, in the same commit:

- a test that renders `DeliveryStep` with the three inputs set directly and **no MSW
  handler registered**, asserting it renders the options it was given. That test passing
  without a network handler is the proof that the component no longer knows the SDK.
- a test that asserts `continueRequested` emits when the confirm control is activated in
  a valid state, and that the component performs no navigation of its own.
- a test that asserts `retryOptions` emits from the error branch's retry control.
- a test per `saveState` value the contract's required states name (`loading`, `saving`,
  `error`), asserting the rendered difference for each — set the input, assert the DOM.

Do not assert that the string `input.required` appears in `delivery-step.ts`. A
source-text assertion is the pattern **FIX-07** and **FIX-07b** exist to remove.

## Out of scope

- **`src/app/shared/types/ui-problem.ts` — `FIX-50`.** Consume it; never declare it.
- **The other five components whose signatures drift — `FIX-50`.** `AddToCart`,
  `ProductGallery`, `VariantSelector`, `MobileBuyRail` and `DemoNotice`. Different
  components, different screens.
- **`ContactStep`, one screen earlier, which has the identical defect.**
  `components.md:555-557` gives it `contactFields:FieldTree<Contact>` and
  `saveState:AsyncStatus` and the output `continueRequested:void`;
  `src/app/features/checkout/contact-step.ts` has no inputs and injects
  `CONTACT_DRAFT_SAVER` and `Router` (`:172-173`). **`FIX-63` owns it**, and `FIX-20`
  works in the same file for a different defect. Do not fix it here.
- **`DeliveryStep.onConfirm()` swallowing the save failure — `FIX-44`.** It lands first.
  This task moves the call it fixes into the container; carry FIX-44's error handling
  across unchanged rather than re-deriving it, and say so in the commit body.
- **The dead in-flow confirm button and the orphaned `ready` / `pending` models —
  `FIX-22`.** It lands first. Do not re-introduce what it deleted.
- **The breadcrumbs' `href` versus `routerLink` — `FIX-55`.** Same template, three
  attributes, its own commit.
- **`AsyncStatus` living inside `price-block.ts` — `FIX-67`.** It owns moving the
  declaration out of `price-block.ts` into `src/app/shared/types/async-status.ts` and the
  barrel's no longer re-exporting it. This task only imports the type; see "What to change"
  item above for which path to import from, depending on landing order.
- **`PaymentMethodSelector` and `AddressForm`.** Their entries at `components.md:596-605`
  and `:581-590` are not measured by this task, and `AddressForm` is already bound to
  parent fields. Change neither.
- **The wizard's routing, guards and the `CheckoutFacade` itself.** The container inherits
  the navigation that exists; it does not redesign it. `checkout.guards.ts` is not touched.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`). Write the assertions in the right file
and do not gate on `npm run test`'s exit code; `FIX-04` is what turns it green.

**Prerequisites, in this order:** `FIX-22`, then `FIX-44`, then `FIX-50` (for
`ui-problem.ts`), then this task. If any of the three has not landed, stop and report —
do not work around a missing one.

```bash
npm run build               # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does not
                            # fail this task, but tests/checkout-f2.spec.ts,
                            # tests/checkout-delivery.spec.ts and tests/checkout-f6.spec.ts must
                            # pass
grep -cE "inject\(HttpClient\)|api\.invoke|router\.navigate" src/app/features/checkout/delivery-step.ts
                            # expected: 0
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Browser checks (mandatory — this is the screen a person fills in):

1. At 1440, reach `/penztar/szallitas` by clicking through the checkout, never by typing
   the URL.
2. Exercise the ready state: pick home delivery, fill the address, pick a payment method,
   continue. The review step must be reached.
3. Exercise the error state: with the dev tools' network panel, make
   `GET /api/v1/checkout/options` fail, reload the step, and confirm the error branch
   renders with a working retry that re-issues the request.
4. Repeat step 2 at 390.

Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R14 applies and is the rule this task restores**: the component renders every state
  its entry requires — `loading`, `ready`, `invalid`, `saving`, `error` — and each is now
  reachable by setting an input rather than by breaking the network. Verify all five in
  the browser and record a screenshot of each.
- **R15 applies**: the error branch must keep the generic user-visible message the code
  already uses (`delivery-step.ts:270`) and must not start leaking backend detail into the
  UI when the message moves to the container.
- **R20 and R21 apply**: the radio group, the address fields, the payment selector and the
  continue control keep their accessible names and their 44 px minimum targets after the
  restructuring. Measure the rendered rects, not the CSS.
- **R23 applies**: after `(retryOptions)` re-renders the step, focus must not be lost to
  the document body.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R13, R16–R19, R22, R24, R25: N/A — this change moves responsibility between two
  TypeScript files and one template. It introduces no brand asset, colour, dimension,
  font, centerline, copy string, data source or handoff artefact, and it changes no
  rendered text.

## Acceptance criteria

- [ ] **FIX-56-AC01** `src/app/features/checkout/delivery-step.ts` declares exactly the
      contract's five members: inputs named `options`, `fields` and `saveState`, and
      outputs named `continueRequested` and `retryOptions`. No sixth input and no third
      output is added.
- [ ] **FIX-56-AC02**
      `grep -cE "inject\(HttpClient\)|api\.invoke|router\.navigate" src/app/features/checkout/delivery-step.ts`
      prints `0`, and `grep -c "signal<DeliverySelectionChange" src/app/features/checkout/delivery-step.ts`
      prints `0`.
- [ ] **FIX-56-AC03** `grep -rn "CheckoutFieldTree" src` returns the declaration in
      `checkout-form.model.ts` and its use in `delivery-step.ts`, and
      `grep -rn "interface UiProblem\|type UiProblem" src` returns exactly one line, in
      `src/app/shared/types/ui-problem.ts`, which this task did not create.
- [ ] **FIX-56-AC04** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own specs with
      `npx vitest run tests/checkout-f2.spec.ts tests/checkout-delivery.spec.ts tests/checkout-f6.spec.ts`
      instead.
- [ ] **FIX-56-AC05** The spec file covering `DeliveryStep` contains a test that renders
      the component with all three inputs set and **no MSW handler registered**, and that
      test passes. This is the assertion that proves the SDK dependency is gone.
- [ ] **FIX-56-AC06** That same spec file contains one test per `saveState` value named in
      the contract's required states (`loading`, `saving`, `error`), each asserting a
      rendered difference in the DOM, plus a test that `continueRequested` emits and a
      test that `retryOptions` emits.
- [ ] **FIX-56-AC07** **Real-browser check, the happy path.** At 1440, reached by
      clicking: select home delivery, fill the address, select a payment method, activate
      continue. The application lands on `/penztar/ellenorzes` with the selection intact
      and `list_console_messages` reports zero errors.
- [ ] **FIX-56-AC08** **Real-browser check, the error and retry path.** With
      `GET /api/v1/checkout/options` forced to fail, the step renders the error branch,
      and activating retry issues a new request for that operation — verify the second
      request in the network log, not the rendered text alone.
- [ ] **FIX-56-AC09** **Real-browser check at 390.** The happy path of AC07 completes at a
      390 px viewport and `document.documentElement.scrollWidth` is not greater than
      `window.innerWidth + 1`.
- [ ] **FIX-56-AC10** The commit body names `ContactStep`'s identical drift against
      `components.md:555-557`, owned by `FIX-63`, and states that it was recorded and not
      repaired here.

## Commit

This task is exactly one commit covering `delivery-step.ts`, `delivery-page.ts`,
`checkout-form.model.ts`, the template and the tests. The two halves cannot be split: a
presentational step with no container renders nothing, and a container with nothing to
fill has no reason to exist, so either alone would be a commit that breaks the screen. Do
not bundle it with **FIX-22**, **FIX-44**, **FIX-50** or **FIX-55**, each of which is its
own commit in the same area. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
refactor: give DeliveryStep the inputs and outputs components.md declares
```
