# FIX-16 — Settle `AddToCart`: wire it in or delete it

Status: PLANNED — not executed.
Severity: blocker
Source: A3 finding 5 (wire it in) against A6 4.3 (delete it). **The verdict is: wire it
in.** The reasoning is set out below rather than asserted.

## Why this is wrong

Today a user on a product page clicks `Kosárba teszem` and gets **no** loading indication,
**no** success confirmation and **no** error message. If the add fails, nothing on the
screen says so. `src/app/features/product/product-page.ts:251-270` fires the mutation and
discards the promise.

The component that handles all three states exists, is finished, and is imported by
nothing.

`docs/spec/components.md:446-458` specifies `AddToCartControl` with required states
`default,hover,focus,disabled,loading,error,success`, and `docs/tasks/T18.md` (T18-AC01)
requires the add to confirm product, colour, storage and quantity in an accessible status
message. Design rule R19 (`.claude/skills/mi-bolt-design/SKILL.md:71`) says *"No results,
network error, loading, success and disabled are distinct states."* Under D1 the
specification is right and the code is wrong.

## Evidence

### The two audit reports disagree, and this is how the disagreement is settled

| Report | Verdict | Argument |
|---|---|---|
| A6 4.3 | **delete** `AddToCart` | Full-tree grep for `app-add-to-cart`, `AddToCart` and `from '.*add-to-cart'` hits only its own declaration. Unused code is rubbish. |
| A3 finding 5 | **wire it in** | The inline substitute on the product page is missing states the specification requires, so deleting the component removes the only implementation of a specified behaviour. |

**The specification decides, and it decides for A3.** D1 of this repair package says the
code is wrong wherever it and a spec document disagree, and no task may edit a spec
document to match the implementation. `docs/spec/components.md:446` defines
`AddToCartControl` as a component of the product screen. Deleting `AddToCart` would leave
the specification describing a component the repository does not have, which is the case D1
exists to forbid — and it would leave the *behaviour* missing too, since the inline
substitute does not implement it. A6's argument is sound for genuinely unspecified dead
code (that is FIX-15's subject); it does not reach a component the specification names.

**A6 4.3 also states that "No `.spec.ts` exists for it either." That is wrong.**
`tests/add-to-cart.spec.ts` exists, is 140+ lines, and asserts on the component throughout
— for example `:53` (`expect(addToCartSource).toMatch(/app-status-message/)`) and `:107`
(`expect(addToCartSource).toMatch(/inject\(CartFacade\)/)`). Every one of its assertions
reads the component's **source text** rather than rendering it, which is why they all pass
today while the component is never rendered by the application. That test file is a
textbook case of the problem **FIX-07** owns, and the fact that a full green suite coexists
with a component nobody renders is the strongest single argument for this task.

### What the inline version is missing

`src/app/features/product/product-page.ts:251-270`:

```ts
  onAddToCart(): void {
    const v = this.vm();
    if (v.selectedVariant === null) return;
    this.addRequested.emit({
      variantId: v.selectedVariant.id,
      quantity: v.quantity,
    });
    …
    void this.cartFacade.ensureCart().then(() => {
      void this.cartFacade.addItem(v.selectedVariant!.id, v.quantity);
    });
  }
```

and `src/app/features/product/product-page.html:88-100`:

```html
                <div class="cta-desktop">
                  <app-button
                    [variant]="'primary'"
                    [size]="'comfortable'"
                    [label]="'Kosárba teszem'"
                    [loadingLabel]="'Hozzáadás…'"
                    [disabled]="!addToCartEnabled()"
                    (pressed)="onAddToCart()"
                  ></app-button>
```

Four things are missing, each verifiable in the quoted lines:

1. **No loading state.** `[loadingLabel]="'Hozzáadás…'"` is passed and `[loading]` is
   **never bound**, so the label the component was given can never be shown. The button
   looks idle for the whole round trip.
2. **No success confirmation.** Nothing renders after the add resolves. T18-AC01 requires a
   `StatusMessage` naming product, colour, storage and quantity.
3. **No error surfacing.** `void this.cartFacade.addItem(...)` discards the promise inside a
   `.then()` whose own promise is also discarded. The comment at `:258-266` argues the
   facade's `error` / `conflict` / `cartGone` / `cartExpired` signals carry the failure —
   but nothing on the product page reads any of those four signals. Check with
   `grep -n "cartFacade\." src/app/features/product/product-page.ts`.
4. **A non-null assertion at `:268`**, `v.selectedVariant!.id`, re-asserting inside the
   `.then()` what `:253` already narrowed. It is one of the twelve non-null assertions A6
   group 5 counted, and it disappears with the code that carries it.

### What the existing component already does

`src/app/features/product/add-to-cart.ts` is complete:

- `:114-142` — `onAdd()` sets `pending`, awaits `ensureCart()` then `addItem()`, sets a
  success banner, emits the confirmed `CartItem`, and catches the failure into an error
  banner with `finally { this.pending.set(false); }`.
- `:82-87` — `statusBanner` returns `A termék hozzáadása a kosárhoz…` while pending.
- `:166-170` — `composeMessage` builds
  `"<product>, <colour>, <storage> GB – <qty> darab a kosárban."` from the parent's
  selection, inventing nothing.
- `src/app/features/product/add-to-cart.html:2-23` — a `Button` with both `[disabled]`
  **and** `[loading]` bound, and a `StatusMessage` behind `@if (statusBanner(); as banner)`.

### The divergence this task deliberately does not resolve

`docs/spec/components.md:450-454` specifies `AddToCartControl` as *"Owner: local
presentation"*, with signal inputs `variant:Variant|null; quantity:number; pending:boolean;
error:UiProblem|null`, output `addRequested:{variantId,quantity}`, and the instruction
*"emit one intent, no own cart persistence."* The delivered component instead injects
`CartFacade` itself (`add-to-cart.ts:57`) and owns `pending` internally
(`add-to-cart.ts:78`).

So the component's **signature** diverges from the specification even though its
**behaviour** is the one the specification asks for. This task wires in the behaviour and
does not reshape the signature, for three reasons stated here rather than left implicit:
reshaping it moves the cart mutation back out into the page and rebuilds the component's
state machine, which is a second change of a different kind; `tests/add-to-cart.spec.ts:107`
pins `inject(CartFacade)` inside the component, so the reshape drags a test rewrite
FIX-07 owns; and A3 finding 6 records the same class of divergence for `ProductGallery` and
`VariantSelector` and leaves it open. **The divergence is recorded, not closed here.**
**`FIX-50`** owns component-signature conformance to `components.md`; `FIX-50.md:80-85`
quotes this task's own criterion and answers it.

## What to change

Two files. Nothing is deleted from `src/app/features/product/add-to-cart.*`.

### 1. `src/app/features/product/product-page.ts`

Add the import and the component to `imports`:

```ts
import { AddToCart, type AddToCartSelection } from './add-to-cart';
```

Remove `Button` from the `imports` array **only if** no other element in
`product-page.html` still uses `app-button` after step 2 — check with
`grep -c "app-button" src/app/features/product/product-page.html`. The mobile buy rail at
`:130-140` also uses one, so `Button` almost certainly stays. Do not guess; grep.

**Leave `onAddToCart()` (`:251-270`) exactly as it is.** This is a deliberate reversal of
what an earlier draft of this task said, and the reason is
`docs/spec/components.md:409`, which gives `ProductPage` *"CartFacade injection only at
container/add orchestrator"* — the page **is** where the facade belongs, and stripping
the mutation out of it would be a move away from the contract, not toward it.

It is also what keeps the mobile buy rail alive. The rail's button at
`product-page.html:138` is bound to `(pressed)="onAddToCart()"` and to nothing else;
`addRequested` (`:84`) has no consumer anywhere —
`grep -rn "addRequested" src e2e tests` returns only the declaration, the emit, and
source-text assertions. With the body reduced to the emit, a click on the sticky rail at
390 px would add nothing at all, which is the same class of defect this task exists to
remove, one viewport down.

After step 2 below, `onAddToCart()` is reached only from the rail: the desktop column
renders `<app-add-to-cart>`, which performs its own mutation inside `AddToCart.onAdd()`
(`add-to-cart.ts:114-142`). One click, one mutation, on either path — no second
independently writable total, which is what `docs/spec/architecture.md:57` forbids.

The interim state this leaves — `CartFacade` injected in both `product-page.ts` and
`add-to-cart.ts` — is closed by **FIX-50** item 2 and its page-orchestrator item, which
move the mutation to the page for both paths. Record it in the commit body as a stated
interim, naming FIX-50.

Add a computed that builds the component's `selection` input from the view model, beside
the existing `addToCartEnabled()` / `addToCartReason()` computeds:

```ts
  /** Selection handed to AddToCart. Null until a variant is chosen. */
  readonly addToCartSelection = computed<AddToCartSelection | null>(() => {
    const v = this.vm();
    const variant = v.selectedVariant;
    if (variant === null) return null;
    return {
      variantId: variant.id,
      quantity: v.quantity,
      productName: v.product?.name ?? '',
      colorName: variant.colorName,
      storageGb: variant.storageGb,
    };
  });
```

Read the actual view-model field names out of `product-page.ts` before writing this —
`v.product?.name` is the shape to confirm, and `AddToCartSelection` is declared at
`add-to-cart.ts:42-48`. Do not invent a field the view model does not carry, and do not
fall back to a placeholder string if one is missing: R14
(`.claude/skills/mi-bolt-design/SKILL.md:66`) forbids inventing a value, so a genuinely
absent field is a finding to report rather than a default to supply.

If `CartFacade` has no remaining reader in the file after the replacement — check with
`grep -n "cartFacade" src/app/features/product/product-page.ts` — remove the field and its
import. `.claude/CLAUDE.md` ("Surgical changes") requires removing the orphans this change
creates and forbids removing anything else.

### 2. `src/app/features/product/product-page.html`

Replace the desktop CTA at `:88-100` with the component, keeping the existing
`addToCartReason()` hint that sits beside it:

```html
                <div class="cta-desktop">
                  @if (addToCartSelection(); as selection) {
                    <app-add-to-cart
                      [selection]="selection"
                      [enabled]="addToCartEnabled()"
                    />
                  } @else {
                    <app-button
                      [variant]="'primary'"
                      [size]="'comfortable'"
                      [label]="'Kosárba teszem'"
                      [loadingLabel]="'Hozzáadás…'"
                      [disabled]="true"
                    ></app-button>
                  }
                  @if (addToCartReason() !== null && !addToCartEnabled()) {
                    <p class="hint" role="status">{{ addToCartReason() }}</p>
                  }
                </div>
```

**The `@else` is not decoration, and it is not a second implementation.**
`addToCartSelection()` is `null` exactly when `v.selectedVariant === null`
(`product-page.ts:157` returns state `'empty'` there, which falls into
`product-page.html:4`'s `@default` case, so this block does render), and **today that
case renders the CTA disabled**, not absent — the current markup at
`product-page.html:88-96` binds `[disabled]="!addToCartEnabled()"` with no `@if` around
it. `docs/spec/components.md:456` lists `disabled` among `AddToCartControl`'s required
states and **FIX-16-AC10** claims R19 applicable and met, so dropping it here would
make that claim false. The `@else` keeps exactly the element that is there now, with
the binding hardcoded to `true` because in this branch there is nothing to enable. It
carries no `(pressed)` handler: there is no selection to add. `Button` is already in
the page's imports, so nothing changes in the component class.

**This block is temporary and its owner is named.** **FIX-50** item 2 gives `AddToCart`
the inputs `variant`, `quantity`, `pending` and `error`, where `variant` may be null,
and item 2b makes the page the add orchestrator; at that point the `@if`/`@else` pair
collapses into one always-rendered `<app-add-to-cart>` that handles its own disabled
state. Record that in the commit body, naming FIX-50.

**`(added)` is deliberately not bound.** `AddToCart` has already performed the mutation
by the time it emits (`add-to-cart.ts:128-130`); routing that emit into `onAddToCart()`,
which mutates too, would add the item twice on every desktop click. `added` has no other
consumer on this page, so it is left unbound. `FIX-50` item 2 replaces the output with
`addRequested` and the page-orchestrator item binds that one; until then nothing listens
and nothing needs to.

**The decision on the mobile buy rail, so the executor does not have to make it.** Leave
the rail's own `<app-button>` at `:130-140` **as it is**, including its existing
`(pressed)="onAddToCart()"` binding at `:138` — that binding is why step 1 leaves
`onAddToCart()`'s body intact. It is a second CTA for the same intent, and
`docs/spec/components.md:476-488` specifies `MobileBuyRail` as a component of its own
that this repository has inlined (A3 finding 7). Putting a second `AddToCart` instance
inside the rail would give the page two independent pending and success banners for one
cart, which contradicts `docs/spec/architecture.md:57` — *"Do not maintain two
independently writable totals."* The rail therefore keeps a plain button with no
pending, success or error surface of its own until **FIX-50** item 5 extracts
`MobileBuyRail` as a component and binds the page's single pair of state signals into
it. Record in the commit body that the rail is left without its own pending state, and
name **FIX-50** as its owner — it says so in its own Source line (`FIX-50.md:5`).

### 3. Nothing changes in `src/app/features/product/add-to-cart.ts`, `.html` or `.scss`

Stated as a change because the component's signature diverges from
`docs/spec/components.md:450` and the temptation to "fix it while here" is real. Do not.
See "The divergence this task deliberately does not resolve".

### The spec file that must gain a test

`tests/add-to-cart.spec.ts` is the owner. Its existing cases read source text; **add**
cases that render, so the component is exercised rather than grepped:

1. Rendering `AddToCart` with a selection and clicking the button puts the button into its
   loading state while the mutation is in flight, with `[loading]` bound true.
2. On success a `StatusMessage` is rendered whose text contains the product name, the
   colour name, the storage in GB and the quantity.
3. On a failed add — an MSW handler returning a Problem — a `StatusMessage` with
   `severity` `error` is rendered and the cart is unchanged.
4. `ProductPage`'s template contains `app-add-to-cart`, and `onAddToCart()` **still**
   calls `cartFacade.addItem` — this is the reversed case, kept as a regression guard:
   `docs/spec/components.md:409` puts `CartFacade` on the container, and `onAddToCart()`
   is the mobile buy rail's only path to the cart, so a page with no facade call would
   leave the rail's button doing nothing. See **FIX-16-AC04**.

Do not delete the existing source-text cases in this task; FIX-07 owns converting them.

## Out of scope

- **Converting the rest of `tests/add-to-cart.spec.ts` from source-text assertions to
  rendered assertions — FIX-07.** Add the four cases above; leave the others.
- **Reshaping `AddToCart` to the `components.md:450-452` signature — `FIX-50`.** Recorded
  above, not done here; `FIX-50.md:80-85` quotes this task's criterion and answers it.
- **Extracting `MobileBuyRail` (A3 finding 7) — `FIX-50`; `AsyncContent` (A3 finding 4),
  `AppliedFilters`, `CatalogToolbar` and `Pagination` (A3 finding 3) — `FIX-60`.**
  Different components, each with an owner; do not fold one in.
- **`ProductGallery` and `VariantSelector` signature drift (A3 finding 6) — `FIX-50`**
  items 3 and 4.
- **The product page's variant URL, invalid deep link, not-found state and thumbnails —
  FIX-23.** Do not touch those parts of `product-page.ts` or `.html`.
- **Add-to-cart under touch emulation — FIX-32.** If the change makes that case pass, say
  so in the commit body and leave the task to its owner.
- **`src/app/features/cart/cart.facade.ts`.** The facade is correct; only its callers
  change.

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

1. `npm run build` — must exit `0`. Green at the `db6d295` baseline. This is the check that
   catches a missing `imports` entry or a template binding that does not type-check, since
   `strictTemplates` is on.

2. `npx vitest run tests/add-to-cart.spec.ts` — must exit `0`, with the four new cases
   passing by name.

3. `npx vitest run tests/cart.facade.spec.ts tests/variant-selection.spec.ts` — must exit
   `0`.

4. Run `npm run test` before your first edit and again after your last, and record both
   coverage figures in the commit body. There is no target number: the pair is the
   evidence that this task did not reduce coverage, and **FIX-08** is what turns the
   thresholds into a gate. Do not carry the 56.42 % figure forward — it was measured by
   `npm run test:unit:coverage` over the 30 specs under `tests/` only, a runner and a
   denominator that no longer exist, so it cannot be compared with anything `ng test`
   reports.

5. The three browser runs described in FIX-16-AC01 to FIX-16-AC03. Start the app with
   `npm start` and drive it through a real browser per
   `.claude/rules/browser-verification.md`; the agent takes the snapshots, the screenshots
   and the console and network reads, and the orchestrator starts and stops the server.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-16-AC01** **Real-browser check, mandatory — the success path.** At viewport
      width 1440, open a product page, choose a colour and a storage, set the quantity to 2,
      and click `Kosárba teszem`. While the request is in flight the button shows
      `Hozzáadás…` and is disabled. After it resolves, a status message is rendered whose
      text contains the product name, the colour name, the storage in GB and `2`. The header
      cart badge shows `2`. Screenshot the pending state and the success state separately.
      `list_console_messages` reports zero errors. At the baseline none of the three
      observations held: the label never changed and nothing was rendered after the add.
- [ ] **FIX-16-AC02** **Real-browser check, mandatory — the failure path.** With the
      network request for `POST /api/v1/carts/*/items` blocked or failed in the browser,
      click `Kosárba teszem` on a product page. A status message is rendered containing
      `A termék hozzáadása nem sikerült` and the header cart badge does **not** change.
      Screenshot it. At the baseline the click produced no visible change of any kind, which
      is the defect A3 rated **blocker**.
- [ ] **FIX-16-AC02b** **Real-browser check, mandatory — the mobile buy rail at 390.**
      At viewport width **390**, open a product page, choose a colour and a storage, and
      click the sticky rail's `Kosárba teszem`
      (`[data-testid="purchase-rail"] [data-testid="purchase-cta"]`). The header cart
      badge increments by the chosen quantity and a
      `POST /api/v1/carts/*/items` request appears in `list_network_requests` with a
      2xx response. Screenshot the rail before and after, and record the badge value
      from each. `list_console_messages` reports zero errors. This is the criterion
      every other browser check in this file misses: AC01, AC02 and AC03 all run at
      1440, where `product-page.scss:150-152` sets `.rail { display: none }`, so the
      rail is not on screen for any of them.
- [ ] **FIX-16-AC02c** At the same 390 viewport, record how many controls labelled
      `Kosárba teszem` are visible:
      `Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim() === 'Kosárba teszem' && b.offsetParent !== null).length`.
      `product-page.scss:112-116` never hides `.cta-desktop` and `:159-182` shows
      `.rail` below 1024 px, so the expected value today is `2`. **Record the number;
      do not change any stylesheet to reduce it** — that is a responsive-layout
      question this task does not own. Name it in the commit body as a measured
      finding.
- [ ] **FIX-16-AC03** **Real-browser check.** Keyboard only: Tab to the `Kosárba teszem`
      control, confirm a visible focus indicator, press Enter, and confirm the same success
      message appears. Measure the control's `getBoundingClientRect()` and record its height
      and width; both must be at least 44 CSS px (design rule R21).
- [ ] **FIX-16-AC04** `grep -c "app-add-to-cart" src/app/features/product/product-page.html`
      returns at least `1`, and
      `grep -n "cartFacade.addItem" src/app/features/product/product-page.ts` still
      returns its one line. The second half is deliberately the opposite of what an
      earlier draft required: `docs/spec/components.md:409` puts `CartFacade` on the
      container, and the page's `onAddToCart()` is the rail's only path to the cart, so
      a page with no facade call is a page whose sticky CTA at 390 px does nothing.
      `grep -n "(added)=" src/app/features/product/product-page.html` must return
      nothing, which is what proves the desktop path does not mutate twice.
- [ ] **FIX-16-AC05** `grep -n "selectedVariant!" src/app/features/product/product-page.ts`
      returns nothing. The non-null assertion at `:268` is removed in place: `v` is
      already narrowed by the `if (v.selectedVariant === null) return;` guard at `:253`,
      so binding the variant to a local before the `then` callback removes the need for
      it —
      `const variant = v.selectedVariant;` after the guard, then
      `void this.cartFacade.addItem(variant.id, v.quantity);` inside the callback.
      `.claude/rules/code-standards.md` bans the assertion; it does not ban the call
      that carried it.
- [ ] **FIX-16-AC06** Unit tests in `tests/add-to-cart.spec.ts`: three rendered cases —
      loading, success message content, error message — plus the regression guard on
      `ProductPage`'s template. `npx vitest run tests/add-to-cart.spec.ts` exits `0` and the
      four case names appear in its output.
- [ ] **FIX-16-AC07** `npm run build` exits `0` and `npm run test` exits `0`, with the
      before and after coverage percentages recorded in the commit body.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own specs with
      `npx vitest run tests/add-to-cart.spec.ts tests/cart.facade.spec.ts tests/variant-selection.spec.ts`
      instead.
- [ ] **FIX-16-AC08** `git status --short` lists exactly three paths:
      `src/app/features/product/product-page.ts`,
      `src/app/features/product/product-page.html` and `tests/add-to-cart.spec.ts`. Nothing
      under `src/app/features/product/add-to-cart.*`, nothing under
      `src/app/features/cart/`.
- [ ] **FIX-16-AC09** The commit body records, as stated remaining limitations rather than
      as asides: that `AddToCart`'s signature still diverges from
      `docs/spec/components.md:450-454` and that **FIX-50** owns closing it; that the mobile
      buy rail keeps its plain button and renders no pending or success state of its own;
      and that A6 4.3's recommendation to delete the component was not carried out, with the
      reasoning from Evidence.
- [ ] **FIX-16-AC09b** The desktop CTA still has a **disabled** state, and it is covered
      by a test rather than by reasoning. With `addToCartSelection()` null — a rendered
      `ProductPage` whose view model carries `selectedVariant: null`
      (`product.facade.ts:358` sets it) — `.cta-desktop` contains exactly one rendered
      `<button>`, that button's `disabled` property is `true`, and its accessible name
      is `Kosárba teszem`. The same case asserts the positive arm: with a selection,
      `.cta-desktop` contains an `<app-add-to-cart>` and no bare `<app-button>`. Both
      arms in one spec, per `.claude/rules/code-standards.md`.
      **This state is not reachable from a URL in a browser until `FIX-23` lands** —
      `FIX-23.md:36-52` measures that `?variant=` is never parsed today, so there is no
      way to ask the page for an unresolvable variant — and all three of this task's
      browser criteria run at 1440. Name that gap in the commit body, name **FIX-23**,
      and **do not report this criterion as passed on reasoning**: the unit case is the
      evidence, and a browser screenshot of the enabled state is not a substitute for
      it.
- [ ] **FIX-16-AC10** Design rules recorded in the commit body. **Applicable and met:
      R08** (`Give each decision unit one prominent primary action`) — the product page has
      one primary add control on desktop, evidenced by FIX-16-AC01's screenshot; **R12**
      (`Hungarian UI labels with correct accents`) — `Kosárba teszem`, `Hozzáadás…` and the
      confirmation copy from `add-to-cart.ts:166-170`; **R14** (`Numerical offers must come
      from an approved data source`) — the confirmation names only values the selection
      carried, and the `addToCartSelection` computed is forbidden from supplying a default;
      **R19** (`No results, network error, loading, success and disabled are distinct
      states`) — this is the rule the task exists for, and FIX-16-AC01 and FIX-16-AC02 are
      its evidence; **R20** (`keyboard operation, visible focus, meaningful accessible
      name`) and **R21** (`minimum 44×44 CSS px target area`) — both measured in
      FIX-16-AC03; **R24** (`Preserve the cart, filters and previously entered non-sensitive
      data after an error`) — FIX-16-AC02 records the cart badge unchanged after the failure;
      **R25** (`Do not invent reviews, awards or stock urgency`) — the banner states what
      happened and nothing more; **R26** — the commit body names every file, every command
      with its exit code, and the three limitations in FIX-16-AC09. R01–R07, R09–R11, R13 and
      R15–R18 are **N/A: this task changes which component renders an existing CTA and the
      states it can show, and introduces no brand asset, colour, token, image, price field
      or filter behaviour**, and R22 and R23 are **N/A: the mobile rail is deliberately
      unchanged and no modal is involved.** Skill provenance is stated once in
      `docs/fix/README.md` section 3, "Every task records the design rules": the installed
      path, the version, and the fact that `docs/mi-bolt/execution/skill-location.json`
      does not exist yet (**FIX-38** owns it). Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with FIX-14, FIX-15, FIX-17, FIX-23 or
any other FIX task. Commit only after every acceptance criterion above passes, including
all three browser checks.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`, for example `fix: F3 success page receipt fallback
(sessionStorage)`):

```text
fix: wire AddToCart into the product page so the add has real states
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

Nothing has to land before this one.

FIX-23 also edits `src/app/features/product/product-page.ts` and `.html`, from a different
angle — the variant URL, the deep link, the not-found state and the thumbnails. The two
tasks touch different regions of the same two files, so whichever runs second rebases onto
the other's result; neither may re-do the other's work. FIX-32 (add-to-cart under touch
emulation) should run **after** this one, because this task changes what a tap on that
control does.

**`FIX-45` and `FIX-50` both edit `<div class="cta-desktop">` too, and both already name
this task for the collision** (`FIX-45.md:387-390`: *"the two tasks must not run at the
same time"*; `FIX-50.md:584-588`: *"This task runs after it"*). This section did not say
so from FIX-16's own side; it does now. Whichever of the three lands, the other two rebase
onto its result rather than re-deriving the CTA markup.
