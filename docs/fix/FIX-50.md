# FIX-50 — Bring the component signatures back to `components.md`

Status: PARTIAL — all four component reshapes (AddToCart, ProductGallery, VariantSelector, MobileBuyRail extraction) and the one-line D11 edit to `components.md:480` land, with new/updated unit tests for all four. One judgment call beyond the doc's own text: `AddToCartControl`'s reshaped contract (components.md:450) has no `enabled`/`disabled` input, so passing the real variant unconditionally would have silently dropped the invalid-query/out-of-stock/over-quantity disable that FIX-23 and the pre-existing `addToCart.enabled` vm field provide; the page now withholds the variant (`addableVariant` computed) whenever `addToCart.enabled` is false, so the component's own `variant === null` disabled rule still produces the required block. `ProductGallery`'s `image-error` state (an unresolvable `selectedImageId`) is implemented as a rendered note plus a first-image fallback, since no existing markup was there to reuse. Open: every real-browser AC (AC02, AC02b, AC03, AC05–AC07) is unverified in this session (unit tests only, per this session's mandate); deferred to the batched browser pass. This also closes FIX-16's second open item (the AC09b hand-copied markup replica), now replaced by two cases rendering the real ProductPage.
Severity: major
Source: A3 findings 1, 5, 6 and 7, `docs/spec/components.md`, decisions **D1** and **D11**. Recorded as unowned in `FIX-16` (three times) and in `FIX-23`; this task is its owner. It also makes the one change to `docs/spec/components.md` **that this task makes** — `:480`, on the user's own decision **D11**; see Evidence item 6. `FIX-60` (D16, D21) and `FIX-62` (D20) also edit this document, in commits of their own — this is not the package's only edit to it, only this task's.

## Why this is wrong

`docs/spec/components.md` is the component contract: for each component it fixes the
signal inputs, the outputs, the functions and the required states. Decision **D1**
settles what happens when the code disagrees — *"`docs/` is the specification. Where
the code differs from it, the code is wrong and the fix task changes the code, never
the spec."* The user answered the question that produced **D1** about these exact
components.

Five components disagree with it, in three shapes:

- **`AddToCart`** is specified as presentation-only and injects `CartFacade`
  instead, so a component the spec says "emit one intent, no own cart persistence"
  writes to the cart itself.
- **`ProductGallery`** and **`VariantSelector`** take and emit different things from
  what their entries declare — an index instead of an image id, a whole `Product`
  and two axis events instead of a variant list and one resolved id.
- **`MobileBuyRail`** has an entry of its own and does not exist as a component: its
  markup is inlined in the product page, and it renders none of the states its entry
  requires.
- **`DemoNotice`** has an entry of its own, with a `persistenceMode` input and a
  `memory-warning` state, and the strip that **`FIX-33`** restores under decision
  **D6** has neither. **`FIX-70` owns it**; this task owns the other four.

They are one task because they are one rule applied four times **on one screen**: the
product page composes `ProductGallery`, `VariantSelector`, `AddToCart` and the buy
rail, so reshaping one without the others means rewiring the same call site four
times. `DemoNotice` is the fifth instance of the same rule and is **not** in this task:
it shares no file, no screen and no call site with the four, and it waits on **FIX-33**
and **FIX-10**, which none of the four does. **FIX-70** owns it.

## Evidence

### 1. `AddToCart` versus `components.md:446-458`

The contract:

```text
### AddToCartControl — product / T18

**Signal inputs:** `variant:Variant|null; quantity:number; pending:boolean; error:UiProblem|null`.

**Outputs:** `addRequested:{variantId:string;quantity:number}`.

**Functions:** Single primary CTA with native disabled/in-flight label and stable width; emit one intent, no own cart persistence.

**Required states:** default,hover,focus,disabled,loading,error,success.
```

The delivered component. `src/app/features/product/add-to-cart.ts:56-78`:

```ts
export class AddToCart {
  private readonly facade = inject(CartFacade);
  private readonly destroyRef = inject(DestroyRef);
  …
  readonly selection = input.required<AddToCartSelection>();
  …
  readonly enabled = input<boolean>(true);
  …
  readonly added = output<CartItem>();
  …
  readonly pending = signal<boolean>(false);
```

and `:122`:

```ts
      await this.facade.addItem(selection.variantId, selection.quantity);
```

Four divergences: the facade injection (against "no own cart persistence"), a
bespoke `AddToCartSelection` input in place of `variant` and `quantity`, `pending`
owned locally instead of taken from the parent, and an `added: CartItem` output in
place of `addRequested`.

**`FIX-16` wires this component into the product page and deliberately does not
reshape it.** Its own words, `FIX-16` item 3: *"Stated as a change because the
component's signature diverges from `docs/spec/components.md:450` and the temptation
to 'fix it while here' is real. Do not."* Its **FIX-16-AC09** requires the commit
body to record that "no FIX number owns closing it". This task closes it.

### 2. `ProductGallery` versus `components.md:416-428`

```text
**Signal inputs:** `images:Image[]; selectedImageId:string; productName:string`.

**Outputs:** `imageSelected:string; zoomRequested:string`.

**Required states:** loading,ready,image-error,zoom-open.
```

`src/app/features/product/product-gallery.ts:50-56`:

```ts
export class ProductGallery {
  readonly images = input<readonly ImageLike[]>([]);
  readonly imageIndex = input<number>(0);
  readonly productName = input<string>('');

  readonly imageChange = output<number>();
  readonly zoomChange = output<boolean>();
```

An index where the contract says an id, and a boolean where it says the id of the
image being zoomed. An index is position-dependent: when a variant change swaps the
image list — which `docs/spec/screens.md:61` requires to happen atomically ("A variant
change updates image, price, capacity, stock and max quantity atomically") — index 2
silently becomes a different photograph, while an id either resolves or does not.

### 3. `VariantSelector` versus `components.md:431-443`

```text
**Signal inputs:** `variants:Variant[]; selectedId:string|null; disabled:boolean`.

**Outputs:** `variantSelected:string`.

**Functions:** Resolve exact color+storage combination; name swatches, checkmark/aria-selected, disabled reason; never choose a substitute.

**Required states:** default,selected,unavailable,focus,disabled.
```

`src/app/features/product/variant-selector.ts:31-38`:

```ts
export class VariantSelector {
  readonly product = input.required<Product>();
  readonly selectedColorCode = input<string | null>(null);
  readonly selectedStorageGb = input<number | null>(null);
  readonly disabledCombinations = input<readonly DisabledCombination[]>([]);

  readonly colorChange = output<string>();
  readonly storageChange = output<number>();
```

The component takes the whole `Product` rather than its `variants`, and splits the
selection into two axis events, which pushes "resolve exact color+storage
combination" — the job the contract gives this component — up into the page. It has
no `disabled` input at all.

### 4. `MobileBuyRail` versus `components.md:476-488` — not a component

The entry as it stands today, before the one edit item 6 makes to it:

```text
**Signal inputs:** `money:Money|null; available:boolean; pending:boolean`.     (:480)

**Outputs:** `addRequested:void`.                                             (:482)

**Functions:** Narrow viewport-only sticky purchase price/action; reserve bottom space and honor safe-area; hidden nonmobile variant not focusable.   (:484)

**Required states:** default,loading,disabled,error,focus.                    (:486)
```

Item 6 adds `error:UiProblem|null` to `:480` on the user's own decision, so the
contract this task builds to is those three inputs plus `error`, and all five required
states at `:486` are drivable. Read item 6 before building the rail.

There is no such component. `src/app/features/product/product-page.html:121-142`
inlines it:

```html
      @if (showStickyRail()) {
        <aside class="rail" data-testid="purchase-rail" aria-label="Kosárba helyezés">
          <div class="rail-price">
            <app-price-block
              [money]="devicePrice()"
              [label]="'Készülékár'"
              [status]="devicePriceStatus()"
            ></app-price-block>
          </div>
          <div class="rail-cta">
            <app-button
              data-testid="purchase-cta"
              [variant]="'primary'"
              [size]="'comfortable'"
              [label]="'Kosárba teszem'"
              [loadingLabel]="'Hozzáadás…'"
              [disabled]="!addToCartEnabled()"
              (pressed)="onAddToCart()"
            ></app-button>
          </div>
        </aside>
      }
```

No `[loading]` binding, so no pending state; no success and no error surface. **After
`FIX-16` lands, the desktop control has full states and the mobile one still has
none** — `FIX-16`'s **AC09** requires that limitation to be recorded in its commit
body, and this task is what removes it.

**The constraint `FIX-16` gives its reason from applies here and is why this is an
extraction rather than a second control.** `docs/spec/architecture.md:57`:

> Do not maintain two independently writable totals.

A second `AddToCart` instance inside the rail would give one cart two independent
pending and success surfaces. The extracted rail therefore **shares** the page's
state — it takes `pending` from the same signal and emits into the same handler —
rather than owning any.

### 5. `DemoNotice` versus `components.md:101-113` — not a component either

```text
**Signal inputs:** `persistenceMode: durable|memory`.

**Outputs:** `none`.

**Functions:** Persistent Hungarian simulation disclosure; explain memory-only/reload behavior without suggesting real order fulfillment.

**Required states:** default,memory-warning.
```

```
$ grep -rn "DemoNotice\|persistenceMode" src
$ echo $?
1
```

Neither name exists. What does exist is four unrelated `.demo-notice` paragraphs
inside checkout templates — `contact-step.html:9`, `review-step.html:22`,
`success-step.html:28` and `payment-method-selector.html:3` — none of which is the
shared component the entry describes and none of which takes a persistence mode.

The `memory-warning` state has a concrete meaning that `docs/spec/architecture.md`
§8 fixes: *"Storage denied still supports a complete in-memory demo but explicitly
warns that reload cannot restore it."* The mock already detects that condition —
`src/mocks/persistence.ts:94` holds a private `denied` flag and `:138-143` logs
*"sessionStorage denied, using in-memory cache; reload will not restore snapshot"* —
and does not expose it.

**`FIX-70` owns this one.** It shares no file, no screen and no call site with the four
components above, and it is blocked on **FIX-33** and **FIX-10** where they are not, so
it is its own commit. The measurement stays here because it is what the other four were
measured against.

### 6. One contradiction inside the specification, settled by the user as D11

`components.md:480` gives `MobileBuyRail` the inputs `money`, `available` and
`pending`, and `:486` lists `error` among its required states. No declared input can
put it in an error state. The same mismatch does not occur for `AddToCartControl`,
whose input list at `components.md:450` carries `error:UiProblem|null` to match its own
`error` state at `:456`, so the pattern the rail is missing already exists thirty lines
above it in the same document.

**The user settled it: "Kapjon error bemenetet" ("give it an error input").** That is
decision **D11**. The input list at `components.md:480` gains a fourth input and the
rail is built with all five of its required states.

**This is a change to a specification document, and that needs saying plainly, because
the next reviewer will otherwise read it as a D1 violation and revert it.** **D1**
forbids a *task* from proposing a spec edit to make the specification match the
implementation, and this is not one: the implementation has no `MobileBuyRail` at all,
so there is nothing here for the document to be bent towards. What is being repaired is
a document that contradicts itself, and the repair is the **user's own decision**, not
an executor's or an author's reading of the evidence. The task is carrying out a
decision, not overruling the specification. D1 is untouched and is not weakened by this
edit; no other task may cite it as a precedent for editing a spec document.

The exact edit is in "What to change", item 5. Change nothing else in
`docs/spec/components.md` — not `AddToCartControl`'s entry, not the required-state line
at `:486`, not the shared paragraph at `:488`, and no other component's entry.

### 7. `UiProblem` has no TypeScript declaration

`components.md:7` defines it as a shared type —
`UiProblem = {code:string; message:string; fieldErrors:FieldError[]; retryable:boolean}`
— and `grep -rn "UiProblem" src` returns nothing. `AddToCart`'s new `error` input
needs it, so this task declares it. `FieldError` is generated:
`src/app/api/generated/models/field-error.ts`.

## What to change

Run the items in the order given: **1, 2, 2b, 3, 4** and **5**. Items 1 to 4, including
**2b**, are the product page and must be done together; item 5 is independent and has
its own ordering constraint.

### 1. Declare the shared `UiProblem` type

Create `src/app/shared/types/ui-problem.ts`:

```ts
import type { FieldError } from '../../api/generated/models/field-error';

/**
 * `UiProblem` as `docs/spec/components.md:7` defines it: the shape a
 * presentation component receives when an operation failed. It is a
 * UI type, not a wire type — the wire's `Problem` is mapped into it by
 * whichever facade owns the call.
 */
export interface UiProblem {
  readonly code: string;
  readonly message: string;
  readonly fieldErrors: readonly FieldError[];
  readonly retryable: boolean;
}
```

Use no `as` and no `any` (`.claude/rules/code-standards.md`). Do not add a second
definition anywhere else; `components.md:195` gives `AsyncContent` the same type and
whoever builds that component imports this one.

### 2. Reshape `AddToCart` to `components.md:450-452`

`src/app/features/product/add-to-cart.ts`:

- Delete `private readonly facade = inject(CartFacade);` (`:57`) and the
  `await this.facade.addItem(...)` call at `:122` together with the async wrapper
  around it. Delete the `CartFacade` and `CartItem` imports if nothing else uses
  them. Keep `DestroyRef` only if something else still needs it; remove it otherwise.
- Replace the `selection` (`:63`) and `enabled` (`:69`) inputs with the four the
  contract declares:

```ts
  readonly variant = input<Variant | null>(null);
  readonly quantity = input<number>(1);
  readonly pending = input<boolean>(false);
  readonly error = input<UiProblem | null>(null);
```

  `pending` becomes an **input**, replacing the local `signal<boolean>(false)` at
  `:78`. That is the single most important part of this item: it is what stops the
  component owning cart state.
- Replace the `added` output (`:74`) with:

```ts
  readonly addRequested = output<{ variantId: string; quantity: number }>();
```

- The click handler emits and returns; it awaits nothing:

```ts
  onAdd(): void {
    const variant = this.variant();
    if (variant === null || this.pending()) return;
    this.addRequested.emit({ variantId: variant.id, quantity: this.quantity() });
  }
```

- The status banner keeps its existing `StatusMessage` rendering, but its content now
  comes from the inputs: `pending()` drives the in-flight message and `error()`
  drives the error message. The **success** state the contract requires
  (`:454`) is the parent's to signal; add a fifth input only if you find the contract
  declares one — it does not, so the success banner moves to the page. Record that in
  the commit body.
- Delete `AddToCartSelection` if nothing imports it after the change.

`src/app/features/product/add-to-cart.html` — bind the new names. The Hungarian
strings stay exactly as they are; **`FIX-35`** owns copy.

### 2b. `ProductPage` becomes the add orchestrator

Item 2 takes the cart mutation out of `AddToCart`. Item 5 binds `[pending]="addPending()"`
and `[error]="addError()"` into the extracted rail. Neither creates those signals and
neither calls the facade, so without this item the page has two CTAs that emit into
nothing and **FIX-50-AC02** ("clicking 'Kosárba teszem' still adds the item: the header
cart badge increments") cannot pass. This item is what makes both true, and it must be in
the same commit as item 2.

`docs/spec/components.md:409` is the authority for putting it here: `ProductPage`'s
Functions line ends *"CartFacade injection only at container/add orchestrator"*.
`:456` says `AddToCartControl` must *"emit one intent, no own cart persistence"*, and
`:478` gives `MobileBuyRail` the single output `addRequested:void`. One owner, two views.

**`src/app/features/product/product-page.ts`** — the page already injects `CartFacade`
(`:87`). Add the two state signals and the handler, and move `AddToCart`'s banner logic
up rather than rewriting it:

```ts
  /** In-flight state of the page's single cart mutation. Both the desktop
   *  control and the mobile rail read it; neither owns one of its own
   *  (docs/spec/architecture.md:57, components.md:409). */
  readonly addPending = signal<boolean>(false);

  /** Last cart-mutation failure, or null. Same single owner. */
  readonly addError = signal<UiProblem | null>(null);

  /** Performs the one cart mutation this page owns. Called by the desktop
   *  control's `(addRequested)` and by the mobile rail's `(addRequested)`. */
  async onAddRequested(intent: { variantId: string; quantity: number }): Promise<void> {
    if (this.addPending()) return;
    this.addPending.set(true);
    this.addError.set(null);
    try {
      await this.cartFacade.ensureCart();
      await this.cartFacade.addItem(intent.variantId, intent.quantity);
    } finally {
      this.addPending.set(false);
    }
  }
```

**Where `addError`'s value comes from — read before you write.** `CartFacade` does not
throw on HTTP errors; it surfaces failures on four signals,
`error: Signal<CartError | null>` (`cart.facade.ts:118`), `conflict` (`:122`),
`cartGone` (`:126`) and `cartExpired` (`:130`), and `CartError` is
`{ code: ProblemCode; status: number; detail: string }` (`:60-64`). `UiProblem` is the
type item 1 declares. Derive `addError` from those signals rather than from a `catch`,
and do **not** put `CartError.detail` into `UiProblem.message`: it is backend text and
R15 requires a generic message. `AddToCart`'s existing catch arm
(`add-to-cart.ts:131-138`) already supplies the wording —
`'A termék hozzáadása nem sikerült; a kosár változatlan.'` — so reuse that string rather
than inventing one. If the facade's signal set turns out not to distinguish a failed
`addItem` from a pre-existing error, **stop and report**; do not invent a discriminator.

**The success banner moves up with it.** Item 2's own text says *"the success state the
contract requires (`:454`) is the parent's to signal … so the success banner moves to the
page"*. `AddToCart`'s `composeMessage` (`add-to-cart.ts:166-170`) and `findAddedLine`
(`:153-158`) are what built it; move both onto the page unchanged and render the same
`StatusMessage` from the desktop column. Do not re-derive the Hungarian sentence.

**`src/app/features/product/product-page.html`** — the desktop control's binding:

```html
                    <app-add-to-cart
                      [variant]="selectedVariant()"
                      [quantity]="quantity()"
                      [pending]="addPending()"
                      [error]="addError()"
                      (addRequested)="onAddRequested($event)"
                    />
```

**The rail's output is `void`, so it gets its own handler.** `components.md:478` declares
`addRequested:void` for `MobileBuyRail`, so the rail cannot carry the intent; the page
builds it from its own view model. Add beside the handler above:

```ts
  /** The mobile rail emits `void` per components.md:478, so the page
   *  supplies the intent from its own view model. */
  onRailAddRequested(): void {
    const v = this.vm();
    if (v.selectedVariant === null) return;
    void this.onAddRequested({ variantId: v.selectedVariant.id, quantity: v.quantity });
  }
```

**This reverses `FIX-16-AC04`'s first half**, which forbade `cartFacade.addItem` in
`product-page.ts`. Say so in the commit body, and say why: `components.md:409` puts the
facade on the container, so the criterion was measuring the wrong thing.

**`onAddToCart()` is deleted by this item** and `onRailAddRequested()` takes its place,
so the page has exactly one mutation path with two entry points. `addRequested`
(`product-page.ts:84`) — the page's own output, which never had a consumer — goes with
it; `.claude/CLAUDE.md` ("Surgical changes") requires removing the orphans this change
creates. `tests/add-to-cart.spec.ts:129-133` asserts on that emit's shape in source text
and must be updated in the same commit.

### 3. Reshape `ProductGallery` to `components.md:420-422`

`src/app/features/product/product-gallery.ts`:

```ts
  readonly images = input<readonly ImageLike[]>([]);
  readonly selectedImageId = input<string>('');
  readonly productName = input<string>('');

  readonly imageSelected = output<string>();
  readonly zoomRequested = output<string>();
```

- The internal mirror signal and the `effect` that syncs it (`product-gallery.ts:62`
  onward) keep working; they mirror an **id** instead of an index. Resolve the
  active image by `find(img => img.id === selectedImageId())` and fall back to the
  first image when the id does not resolve — **not** to a different variant's photo.
  `docs/spec/screens.md:61` requires an unresolvable selection to be explained rather
  than substituted; render the component's existing `image-error` state in that case
  and emit nothing.
- Previous / next / thumbnail clicks emit `imageSelected` with the target image's
  `id`.
- Opening the zoom emits `zoomRequested` with the current image's `id`. Closing it is
  internal — the contract lists `zoom-open` as a state of this component and gives it
  no close output — so the `AccessibleDialog`'s `(closed)` stays wired to the
  component's own `closeZoom()`.

`src/app/features/product/product-page.html:23-29` and `product-page.ts:232-243` —
update the bindings and rename `onImageChange(index: number)` to
`onImageSelected(imageId: string)` and `onZoomChange(open: boolean)` to
`onZoomRequested(imageId: string)`. `product-page.ts:119-125`'s `galleryIndex`
computed becomes a `selectedImageId` computed over the same view model.

### 4. Reshape `VariantSelector` to `components.md:435-437`

`src/app/features/product/variant-selector.ts`:

```ts
  readonly variants = input<readonly Variant[]>([]);
  readonly selectedId = input<string | null>(null);
  readonly disabled = input<boolean>(false);

  readonly variantSelected = output<string>();
```

- The two-axis UI stays. `components.md:439` asks this component to "Resolve exact
  color+storage combination", which is what a colour row plus a storage row does;
  what changes is that the component now derives both rows from `variants()` instead
  of `product().variants`, derives the current colour and storage from the variant
  whose `id` equals `selectedId()`, and emits the **resolved variant id** rather than
  two axis values.
- Clicking a colour resolves against the currently selected storage; clicking a
  storage resolves against the currently selected colour. When the resulting pair has
  no variant, the control for it renders in the `unavailable` state with its reason
  and **emits nothing** — `components.md:439`'s "never choose a substitute".
- `disabledCombinations` goes away: an unavailable pair is now simply a pair with no
  matching variant in `variants()`, which is derivable and needs no second input.
  Remove the `DisabledCombination` type if nothing else imports it.
- The new `disabled` input disables every control in the selector, which is the
  `disabled` required state at `:441`.

`src/app/features/product/product-page.html:62-69` and `product-page.ts` — bind
`variants`, `selectedId` and `disabled`, and replace `onColorChange` /
`onStorageChange` with one `onVariantSelected(variantId: string)`.

**`FIX-23` owns the product page's variant URL handling, invalid deep links and
not-found state.** This task changes how the page hears about a selection; it must
not change what the page then does with it. If `FIX-23` has landed, route
`onVariantSelected` into the handler it built. If it has not, keep the existing
behaviour and say so in the commit body.

### 5. Extend `components.md:480`, then extract `MobileBuyRail` to it

**First, the one specification edit this task makes.** Evidence item 6 has the whole
reasoning; this is the edit. `docs/spec/components.md:480` reads:

```text
**Signal inputs:** `money:Money|null; available:boolean; pending:boolean`.
```

Replace that one line with:

```text
**Signal inputs:** `money:Money|null; available:boolean; pending:boolean; error:UiProblem|null`.
```

Nothing else in the file changes, and the new input is spelled exactly as
`AddToCartControl`'s is at `:450`, because it is the same type for the same purpose —
`components.md:7` defines `UiProblem` once for the whole document. Make this edit
before writing the component, so the component is built to a contract that already
says what it is being built to, and stage `docs/spec/components.md` in the same commit
as the code: a specification change and the code that implements it are one logical
change (`.claude/rules/session-lifecycle.md`, "One commit, one logical change").

**Then create `src/app/features/product/mobile-buy-rail.{ts,html,scss}`:**

```ts
  readonly money = input<Money | null>(null);
  readonly available = input<boolean>(false);
  readonly pending = input<boolean>(false);
  readonly error = input<UiProblem | null>(null);

  readonly addRequested = output<void>();
```

`UiProblem` is the type item 1 declares at `src/app/shared/types/ui-problem.ts`. Do not
declare a second one here.

Move the markup from `product-page.html:122-141` — the `<aside class="rail">…</aside>`
element, **not** the `@if (showStickyRail()) { … }` wrapper around it at `:121` and
`:142`, which stays in `product-page.html` — into `mobile-buy-rail.html` verbatim,
changing only the bindings. Keep `data-testid="purchase-rail"` and
`data-testid="purchase-cta"`: several e2e specs query them.

Move the `.rail`, `.rail-price` and `.rail-cta` rules out of `product-page.scss` into
`mobile-buy-rail.scss`, unchanged in content but **not** in file structure — no
retokenising, no new values either way (**`FIX-17`** owns the colour and spacing
layer). The top-level `.rail { display: none; }` (`product-page.scss:150-152`) moves
whole. The `@media (max-width: 1023px) { … }` block (`:159-182`) cannot move whole: it
holds both the page's own rail clearance and the rail's rules together. Leave
`.page { padding-bottom: calc(env(safe-area-inset-bottom) + 8rem); }` (`:160-162`)
behind, inside its own `@media (max-width: 1023px) { … }` block in `product-page.scss`
— the page still needs that clearance once the sticky rail is a separate component.
Move `.rail` (`:164-177`), `.rail-price` (`:180`) and `.rail-cta` (`:181`) into the same
media-query shape inside `mobile-buy-rail.scss`. A literal, unsplit move of the whole
`:159-182` block would carry the page's own clearance rule into the rail's stylesheet
and leave the sticky rail overlaying page content with nothing padding it out of the
way.

`product-page.html` renders it in place of the inline block:

```html
      @if (showStickyRail()) {
        <app-mobile-buy-rail
          [money]="devicePrice()"
          [available]="addToCartEnabled()"
          [pending]="addPending()"
          [error]="addError()"
          (addRequested)="onRailAddRequested()"
        ></app-mobile-buy-rail>
      }
```

`addPending()` and `addError()` are the two signals **item 2b declares on
`ProductPage`**, under those exact names, and they are the same two the page binds to
`AddToCart`'s `pending` and `error` inputs — which is how `architecture.md:57` is
honoured: one owner, two views. Never give the rail a pending or error signal of its
own. Bind the button's
`[loading]` to `pending()` inside the rail; that is the `loading` required state the
inline markup never had.

**Render all five required states** (`components.md:486`): default, `loading`
(`pending()`), `disabled` (`!available()`), `focus`, and `error` (`error()` non-null).
The fifth is drivable because item 5's specification edit declares the input that
drives it — that is what decision **D11** was for. Render it the way the desktop
control does after item 2, with the same `StatusMessage` treatment and the problem's
`message` as its text, so one failed add does not read as two different failures at two
viewports. Narrow the input in the template with `@if (error(); as problem)` and read
`problem.message`; do not reach for a non-null assertion, and use no TypeScript `as`
cast and no `any` (`.claude/rules/code-standards.md`) — the `as` in
`@if (…; as problem)` is the template's alias syntax and not a cast. Add no state
beyond the five;
`components.md:488`'s shared paragraph is explicit that the required-state field
governs.

### 7. Tests

Put new specs in `tests/` for the reason **FIX-31** states and **FIX-06** owns;
`vitest.config.ts:506` sets `include: ['tests/**/*.spec.ts']` and `npm run test` is
red at baseline (**FIX-04**). `tests/add-to-cart.spec.ts` already exists (7510 bytes)
and must be updated rather than replaced.

Assert the **contract**, against rendered DOM, for each component:

- `AddToCart`: with `variant` null the control is disabled and no event fires; with a
  variant, a click emits exactly one `addRequested` carrying that variant's `id` and
  the `quantity` input's value; with `pending` true the control shows its in-flight
  label and a second click emits nothing; with an `error` the error banner renders
  its `message`. And, specifically: constructing the component in a TestBed with **no
  `CartFacade` provider at all** succeeds — that is the assertion that proves the
  injection is gone.
- `ProductGallery`: `selectedImageId` selects by id regardless of position; a
  thumbnail click emits that thumbnail's `id`; an id that matches no image renders
  the `image-error` state and emits nothing; opening the zoom emits `zoomRequested`
  with the current id.
- `VariantSelector`: with a colour and storage pair that has a variant, the click
  emits that variant's `id`; with a pair that has none, the control is in the
  `unavailable` state and emits nothing; `disabled` true disables every control.
- `MobileBuyRail`: `pending` true renders the loading label; `available` false
  renders the disabled control; `error` non-null renders the problem's `message` and
  `error` null renders no error surface at all — both arms, per
  `.claude/rules/code-standards.md`; a click emits `addRequested` exactly once; the
  rendered root carries `data-testid="purchase-rail"`.

Every branch this task adds needs both arms covered
(`.claude/rules/code-standards.md`).

### Files this change touches

**The creates are closed; the modifies are bounded and named individually in the commit
body.** Five files are created and no sixth:

- `src/app/shared/types/ui-problem.ts` (item 1)
- `src/app/features/product/mobile-buy-rail.ts` (item 5)
- `src/app/features/product/mobile-buy-rail.html` (item 5)
- `src/app/features/product/mobile-buy-rail.scss` (item 5)
- one new spec per component that has none — measured today, that is
  `MobileBuyRail` and `VariantSelector`; `tests/product-gallery.spec.ts` and
  `tests/add-to-cart.spec.ts` already exist and are **updated**, not replaced
  (`FIX-50.md`, item 7). **FIX-06** decides where a new spec goes: under `tests/`
  before it, beside the component under `src/` after it. Check with
  `ls vitest.contract.config.ts` and record which.

Every **modified** file is under one of exactly four roots, and nothing outside them is
touched:

| Root | Why |
|---|---|
| `src/app/features/product/` | items 2, 2b, 3, 4, 5 — the four components, the page and its stylesheet |
| `src/app/shared/types/` | item 1's `UiProblem` only |
| the spec locations above | item 7 |
| `docs/spec/components.md` | item 5's **one line**, `:480`, under **D11** — and no other line, which **FIX-50-AC09** already checks |

The modified list is deliberately **not** enumerated here as a count. Items 3 and 4
rename inputs (`selectedImageId`, `variants` / `selectedId` / `disabled`, and
`disabledCombinations` removed), and how far that reaches into
`product-gallery.html` and `variant-selector.html` is settled by reading those
templates, not by this file predicting it. What is required instead is that **every**
modified path is named in the commit body beside the item number that required it — see
**FIX-50-AC09b**. A path the commit body cannot attach to an item is a stray edit.

## Out of scope

- **Wiring `AddToCart` into the product page — `FIX-16`.** That task puts the
  component on the page with its current signature. **This task runs after it** and
  updates the wiring it created. If `FIX-16` has not landed, stop and report: without
  it there is no call site to reshape, and building one here would duplicate its
  work.
- **The product page's variant URL, invalid deep link, not-found state and
  thumbnails — `FIX-23`.** See item 4's note.
- **The product page's missing breadcrumb, description, stock line, demo tag and
  simulation note — `FIX-45`.** That task edits `<div class="cta-desktop">`, which
  item 2's rewiring also touches, so the two do not run at the same time.
- **The one-column collapse and the sticky rail's responsive behaviour — `FIX-26`.**
  This task moves the rail's markup and stylesheet **verbatim**; every breakpoint,
  `position: sticky` rule and safe-area inset stays byte-identical. If `FIX-26` has
  landed, move whatever is there then.
- **Hardcoded colours and spacing — `FIX-17`.** Moving a rule between stylesheets is
  not retokenising it.
- **UI copy — `FIX-35`.** Every Hungarian string moves unchanged. The one new string
  is the `memory-warning` sentence in item 6, and it is taken from
  `docs/design/prototype.html` and `architecture.md` §8 rather than written here.
- **The demo strip itself — `FIX-33`**, and the persistence that feeds
  `persistenceMode` — **`FIX-10`**. See item 6.
- **`AsyncContent`, `AppliedFilters`, `CatalogToolbar` and `Pagination` — `FIX-60`**,
  which `components.md` also declares and which do not exist (A3 findings 3 and 4);
  **`AppFooter`'s missing `compact:boolean` (`components.md:86-99`) — `FIX-64`**;
  **`DeliveryStep`'s drift against `components.md:570-572` — `FIX-56`**. All are the
  same class of defect and none is in this task's five. **`HeaderNav`'s own drift against
  `components.md:71-84` is the one half nobody owns** (see `README.md` section 7.3).
  Report them; do not fold them in.
- **Every line of `docs/spec/components.md` except `:480`.** Under **D1** no task may
  edit a spec document to make it match the implementation, and this task does not:
  the single line it changes is the user's own decision **D11**, spelled out in
  Evidence item 6 and applied in "What to change" item 5. That is one line, and it is
  **the only line this task changes** — `FIX-60` (`:7`, under D16 and D21) and `FIX-62`
  (under D20) also edit this document, each in a commit of its own. Do not correct a
  typo, do not align a neighbouring entry, and do not extend any other component's
  input list on the same reasoning — an argument that worked once for the user is not a
  licence for an executor.
- **`src/mocks/`.** Item 6 says explicitly not to expose the persistence flag here.

## How to verify

Run these from the repository root, in order. The package manager is **npm
11.17.0**; there is no pnpm and no mise in this repository.

```bash
npm run build                 # expected exit 0
npx vitest run tests/         # the four updated and new specs; expected exit 0
npm run test                  # see the note below — not expected to exit 0
```

`npm run test` is `ng test`, which fails 14 of 14 files at the `db6d295` baseline for
reasons **FIX-04** owns (`BASELINE.md:10`). Run it, record its exit code and its
failure list verbatim, and compare that list against the one taken before this task's
first edit: the bar is that this change added nothing to it, not that the suite is
green. **FIX-50-AC10** is worded the same way and is the criterion.

`npm start` is not part of that block: it is `ng serve` and never exits, so a
sequential run that includes it hangs. Start it separately, in the background, before
the browser checks below, and stop it when finished.

Reach the cart by **clicking** after adding an item, never by typing a checkout URL:
a full page load of a checkout route currently discards the cart, a defect **FIX-10**
owns.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty. Do not run the full Playwright suite: it rewrites 49
tracked screenshots under `e2e/design/screenshots/`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R19 applies and is what item 5 restores**: the mobile rail gains distinct
  default, loading, disabled and error states — the fourth of them only because
  decision **D11** gave it the input that drives it. AC05 measures all four.
- **R17 applies**: a variant change must keep the image, storage, stock and price
  consistent, which is exactly why item 3 moves the gallery from an index to an id.
  AC03 measures it by switching variants and reading the rendered image id.
- **R08 applies**: the page must still have one prominent primary action per
  viewport. AC06 confirms the desktop control and the rail are not both focusable at
  the same width, per `components.md:484` ("hidden nonmobile variant not focusable").
- **R15 applies**: the `memory-warning` state must not suggest a real order was lost.
  AC08 records its exact string.
- **R21 applies**: the rail's control keeps its 44 px minimum after extraction. AC05
  measures the rect.
- **R20 applies**: every reshaped control keeps its accessible name and its focus
  ring. AC07's axe run and tab order cover it.
- **R04, R05, R06, R07 apply as no-change rules**: the rail's stylesheet moves
  verbatim, so no token, width, spacing or type value changes. AC09 checks the diff.
- **R24 applies**: reshaping `AddToCart` must not lose the cart. AC02 confirms the
  header count after an add.
- R01, R02, R03, R09, R10, R11, R12, R13, R14, R16, R18, R22, R23, R25: N/A. The
  change adds no brand asset or imagery (R01, R10, R11), alters no shell, hero,
  palette or contrast pair (R02, R03, R09), adds no string except the one in item 6
  (R12), changes no price field's meaning or source (R13, R14), involves one provider
  (R16), touches no filter state (R18), changes no breakpoint (R22) — the rail's media
  queries move unchanged — opens no new dialog (R23), and invents no promotional
  content (R25). R26 is satisfied by the commit body and the recorded evidence.

## Acceptance criteria

Every browser criterion is checked in a real browser driven through
`mcp__chrome-devtools__*`, at 1x device pixel ratio and light colour scheme.
Reading the diff, an HTTP 200 and a green unit test are none of them a browser check
(`.claude/rules/browser-verification.md`).

- [ ] **FIX-50-AC01** `grep -n "inject(CartFacade)" src/app/features/product/add-to-cart.ts`
      returns nothing and exits 1, and
      `grep -nE "readonly [a-zA-Z]+ = (input|output)" src/app/features/product/add-to-cart.ts`
      shows exactly `variant`, `quantity`, `pending`, `error` and `addRequested` — anchored
      so it cannot also match the `@angular/core` import line or a docblock using either
      word. A TestBed that constructs the component with no `CartFacade` provider succeeds.
- [ ] **FIX-50-AC02** At 1440 on `/telefonok/demo-one-5g`, clicking "Kosárba teszem"
      still adds the item: the header cart badge increments, the in-flight label
      appears and then clears, and the success confirmation renders. Record a
      screenshot of each of the three moments and the badge value before and after.
      This is the no-regression check on items 2 and 5.
- [ ] **FIX-50-AC02b** **Real-browser check at 390 — the rail's CTA reaches the cart.**
      At viewport width 390, open a product page, choose a colour and a storage, and
      click `[data-testid="purchase-rail"] [data-testid="purchase-cta"]`. The header
      cart badge increments, a `POST /api/v1/carts/*/items` appears in
      `list_network_requests` with a 2xx response, and while it is in flight the rail's
      button renders its loading state — which is the `loading` required state
      `components.md:486` asks for and the inline markup never had. Then block that
      request and click again: the rail renders its `error` state from `error()`, the
      badge does not change, and the desktop column does not render a second, different
      failure message. Screenshot each of the three states.
- [ ] **FIX-50-AC03** Switching the colour and then the storage on the same page
      changes the gallery image, the price and the stock line together. Record
      `document.querySelector('[data-testid="image-photo"]').src` before and after
      each switch, and confirm the image changed. Then select a colour and storage
      pair that has no variant and confirm the control renders its unavailable
      treatment with a reason and that the selection did **not** move to a substitute.
- [ ] **FIX-50-AC04** A deep link whose `?variant=` does not resolve renders the
      explanation and leaves the add control blocked. If **FIX-23** has landed, this
      is its behaviour and this criterion is a no-regression check; if it has not,
      record what happens and name **FIX-23**.
- [ ] **FIX-50-AC05** At 390 on the same page, the extracted rail renders four of its
      five required states: default; `loading` while an add is in flight (screenshot
      it mid-request); `disabled` when the variant is unavailable; and `error`. Its
      button's `getBoundingClientRect()` is at least 44 px tall. Record all four
      screenshots and the rect. The fifth state, `focus`, is AC06's and AC07's.
      **The `error` state has no deterministic trigger in the browser today**, and
      that is measured rather than assumed: `src/mocks/scenarios.ts:62-83` declares
      four built-in scenarios — `default`, `happy-path`, `out-of-stock` and
      `payment-declined` — and none of them makes `POST /carts/…/items` fail, which is
      the same gap `docs/fix/README.md` section 8 records for the cart's 409 and 503
      states. If the executor can induce the failure without editing code or mock
      configuration, do that and record how. If not, record the attempt, say plainly
      that the state was not reached in the browser, and name the unit case from item 7
      that covers it. **Do not report it as passed on reasoning**
      (`.claude/rules/browser-verification.md`), and do not edit `src/mocks/` to
      manufacture a trigger — that is out of scope below.
- [ ] **FIX-50-AC06** Only one primary add control is focusable per viewport. At 1440
      tab through the page and record whether `[data-testid="purchase-cta"]` is
      reachable; at 390 record whether the desktop control is. `components.md:484`
      requires the hidden one not to be focusable; if both are reachable at either
      width, that is a finding to record, and **FIX-26** owns the responsive layer.
- [ ] **FIX-50-AC07** An axe run on the product page at 1440 and at 390 reports
      **zero** violations in both, with a variant selected and again with an
      unavailable pair chosen. Record all four outputs.
- [ ] **FIX-50-AC08** *(moved)* The `DemoNotice` half of this task, and the permission
      to ship it blocked on **FIX-33** and **FIX-10**, are **FIX-70**'s. Nothing in
      this task may ship blocked.
- [ ] **FIX-50-AC09** `git diff --stat` for this commit lists no file under
      `src/styles/` and none under `src/mocks/`. Under `docs/` it lists exactly one
      file, `docs/spec/components.md`, and `git diff docs/spec/components.md` shows
      exactly one changed line, `:480`, gaining `error:UiProblem|null` — decision
      **D11**, applied in "What to change" item 5. Any second changed line under
      `docs/` fails this criterion. The rail's markup and stylesheet rules moved
      unchanged in content: confirm with
      `diff <(git show HEAD:src/app/features/product/product-page.html | sed -n '122,141p') <(sed -n '1,20p' src/app/features/product/mobile-buy-rail.html)`
      (only the bindings named in item 5 differ) and the equivalent diff for the
      `.rail`, `.rail-price`, `.rail-cta` and clearance rules against
      `mobile-buy-rail.scss`, and record both outputs. **Do not use `git diff -M`** to
      prove this: `-M` is whole-file rename detection, and `product-page.scss` survives
      the change while `mobile-buy-rail.scss` is a new file carrying only part of it, so
      `-M` never reports a rename here.
- [ ] **FIX-50-AC09b** `git status --short` lists no path outside the four roots named
      in "Files this change touches": `src/app/features/product/`,
      `src/app/shared/types/ui-problem.ts`, the spec locations item 7 names, and
      `docs/spec/components.md`. Nothing under `src/mocks/`, `src/styles/`, `e2e/` or
      `src/app/core/`, and no second file under `docs/`. Then, for **every** path the
      command lists, the commit body names it on its own line with the "What to change"
      item number that required it and one sentence saying what changed — created files
      included. A listed path that no item accounts for is a stray edit: report it and
      do not commit it.
- [ ] **FIX-50-AC10** `npm run build` exits 0 and `npm run test` exits
      0, and the unit cases listed in "What to change" item 7 all exist and run.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; item 7 names no
      single spec path for its new specs, so if it has not landed, record that
      verbatim and run `npx vitest run tests/add-to-cart.spec.ts` plus the specific
      spec file(s) this task added instead.
- [ ] **FIX-50-AC11** The commit body records, as named items rather than asides: the
      one-line edit to `docs/spec/components.md:480`, naming decision **D11** and the
      user's own words as its authority, and stating explicitly that **D1** is not
      being overruled — the task is carrying out a decision the user took about a
      document that contradicted itself, and no other task may cite this as a
      precedent; that `AddToCartControl`'s `success` required state is now the page's
      to signal because the contract declares no input for it; whether the rail's
      `error` state was reachable in the browser (AC05); and the further
      components with the same class of drift and who owns each: `AsyncContent`,
      `AppliedFilters`, `CatalogToolbar` and `Pagination` (`FIX-60`), `AppFooter`
      (`FIX-64`), `DeliveryStep` (`FIX-56`), and `HeaderNav`, which nobody owns.

## Commit

This task is exactly one commit. The four components are one change because they are
one rule — **D1** applied to `docs/spec/components.md` — and because they are all
composed by the same page, so reshaping them separately would rewire that page four
times and leave it in a half-conformant state in between. `DemoNotice`, the fifth
instance of the same rule, is **FIX-70**'s own commit. The one-line edit to
`docs/spec/components.md:480` is staged in that same commit: **D11** and the rail it
enables are one change, and splitting them would leave a commit in the history whose
specification asks for an input nothing implements, or whose component takes an input
nothing declares. Do not bundle it with any other FIX task, and do not commit until
every acceptance criterion above has passed and its output is recorded.

**This task runs after `FIX-16`**, which creates the `AddToCart` call site this task
reshapes. If `FIX-16` has not landed, stop and report rather than building a call site
here. The `DemoNotice` half is **FIX-70**'s and carries its own chain, **FIX-33** then
**FIX-10**; nothing in this task waits on either.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
refactor: bring the product components' signatures back to components.md
```
