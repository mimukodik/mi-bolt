# FIX-29 — Fix the structural accessibility violations axe reports

Status: PLANNED — not executed.
Severity: blocker
Source: B2 F11, B2 F12, B2 F13, B2 F14

## Why this is wrong

The repository's root `CLAUDE.md` states, under "Accessibility Requirements", that the application
"MUST pass all AXE checks" and "MUST follow all WCAG AA minimums, including focus management, color
contrast, and ARIA attributes". That makes every item below a hard requirement, not an improvement.
`docs/spec/acceptance.md` **AC23** makes the same point a release gate: "Accessibility includes
semantics, route focus, keyboard-only purchase, screen-reader names/errors, dialogs, reduced motion
and 200% text sizing."

Five structural defects break it. Two of them (`listitem`, `dlitem`) mean a screen reader announces
no list and no definition list where the markup intends one, so the user is told nothing about how
many delivery options or receipt rows there are. One (`label`) is a critical violation: a focusable
1×1 pixel search field with no accessible name. One (`landmark-*`) nests a second `<main>` inside
the app shell's, so landmark navigation lands in the wrong place. One (`heading-order`) skips from
`h1` to `h3` on every catalogue view below 1024 px.

Under decision D1 the specification is right and the code is wrong. None of the five is a matter of
taste; each is a rule with one correct markup answer, given below.

## Evidence

Axe **4.13.0** was run on commit `db6d295` from the dev server's own `/@fs/` route (same origin, no
CDN) at 1x device pixel ratio, light colour scheme. `axe-core@4.13.0` and
`@axe-core/playwright@4.13.0` are both installed in this repository, so the same version is
reproducible here.

### Which pages are already clean, and must stay clean

Axe reported **zero violations** on **Home**, **Contact**, **Review** and **404**. Those four are a
baseline this task protects, not a surface it changes. Any new violation on them is a regression
caused by this task.

### 1. Product page — `landmark-main-is-top-level`, `landmark-no-duplicate-main`, `landmark-unique`

`src/app/layouts/shop-layout.html:1-5` already provides the document's main landmark:

```html
<app-app-shell variant="shop">
  <main id="main-content" tabindex="-1" class="layout-main block scroll-mt-20">
    <router-outlet />
  </main>
</app-app-shell>
```

and `src/app/features/product/product-page.html:2` opens a second one inside it:

```html
    <main class="page" data-testid="product-page">
```

closing at `src/app/features/product/product-page.html:143`. The catalogue page, routed through the
same `ShopLayout`, correctly opens with `<section class="catalog …>`
(`src/app/features/catalog/catalog-page.ts`, inline template) — so the product page is the outlier.

### 2. Catalogue — `label` (critical)

Measured: `input[data-testid="catalog-search"]` with no accessible name, rect
`{x: 15, y: 153, w: 1, h: 1}`. Source, in the **inline** template inside
`src/app/features/catalog/catalog-page.ts` (around line 249-263 of that file):

```html
      <input
        #search
        type="search"
        class="sr-only absolute w-px h-px overflow-hidden"
        data-testid="catalog-search"
        [value]="facade.query().q ?? ''"
        (input)="onSearchInput($event)"
      />
      <button
        #searchCommit
        type="button"
        class="sr-only absolute w-px h-px overflow-hidden"
        data-testid="search-commit"
        (click)="commitSearch()"
      >commit</button>
```

**Read this before you edit the catalogue.** `catalog-page.ts` declares its template **inline**
(`template:` at `src/app/features/catalog/catalog-page.ts:66`) and its styles inline
(`styles:` at `:266`). The files `src/app/features/catalog/catalog-page.html` and
`catalog-page.scss` exist on disk, are 197 and several hundred lines long, and are **not referenced
by the `@Component` decorator at all** — they are a dead second copy, and **FIX-14** owns wiring
them up. Editing `catalog-page.html` today changes nothing on screen. Before you touch the
catalogue, run:

```
grep -n "templateUrl\|template:" src/app/features/catalog/catalog-page.ts
```

and edit whichever of the two the decorator names at that moment. If **FIX-14** has already landed
and the decorator says `templateUrl`, edit `catalog-page.html` instead and make the identical
change there. Every other file this task touches uses `templateUrl` / `styleUrl` and has no such
duplicate.

**A defect this task does not fix, named so it is not lost.** That input and the
`[data-testid="search-commit"]` button beside it are test-only affordances living in production
markup: nothing on screen uses them, they are the only catalogue search control in the page itself,
and `src/app/features/catalog/catalog-page.spec.ts:352` queries the input by that exact test id.
They should not ship. This task gives the input an accessible name because that is what closes the
axe violation it owns; it does **not** delete them, because deleting them breaks a spec file and
that is **FIX-43**'s territory, and because turning them into a real visible toolbar search would
add UI that **FIX-24** and **FIX-33** own and that `docs/spec/screens.md` S2 phrases ambiguously
("q search in header/list toolbar"). Record this in the task evidence as an open defect.

### 3. Catalogue — `image-redundant-alt` (minor), all 12 product-card images

`src/app/shared/ui/product-image/product-image.html` announces the same alt text three times:

```html
<div
  class="root relative block w-full rounded overflow-hidden"
  [style.aspect-ratio]="aspectRatio()"
  [attr.data-status]="status()"
  role="img"
  [attr.aria-label]="image().alt"
>
      <img
        class="photo absolute inset-0 w-full h-full object-contain block"
        [src]="image().src"
        [alt]="image().alt"
        ...
      />
  <span class="sr-only absolute w-px h-px overflow-hidden">{{ image().alt }}</span>
</div>
```

and in the card that text is a word-for-word duplicate of what is already on screen. The alt comes
from the mock as `` `${product.name}, ${variant.colorName}, ${variant.storageGb} GB` ``
(`src/mocks/cart/cart-domain.ts:516`; the fixture rows at
`src/mocks/cart/cart.handlers.ts:50,69,88,107` read e.g.
`'Demo One 5G, Grafit, 256 GB, elölnézet'`), while `src/app/features/catalog/product-card.html:17-28`
renders the same name, colour and storage as visible text, and the link around the image already
carries its own name from `src/app/features/catalog/product-card.ts:84-88`:

```ts
  readonly ariaLabel = computed(() => {
    const p = this.product();
    const v = this.variant();
    return `${p.name}, ${v.colorName}, ${v.storageGb} GB — részletek megnyitása`;
  });
```

### 4. Catalogue — `heading-order` (moderate), h1 → h3 below 1024

B2 flagged the cause as "inferred from the DOM, not confirmed against source". **It is now
confirmed against source, and you do not need to re-derive it.** The live inline styles in
`catalog-page.ts` carry the rule — `src/app/features/catalog/catalog-page.ts:378-384`:

```scss
.sidebar { display: block; }

@media (max-width: 1023px) {
  .sidebar {
    display: none;
  }
}
```

The dead copy at `src/app/features/catalog/catalog-page.scss:100-106` has the same two rules in
the **reverse** order — the media query first, then `.sidebar { display: block; }`
unconditionally after it — so in that file the sidebar is never actually hidden. Do not cite the
dead copy as evidence; **FIX-14** inherits this reversed-order defect when it wires the dead copy
up.

The sidebar is where the only `h2` on the page lives — `src/app/features/catalog/filter-panel.html:7`:

```html
    <h2 class="title m-0">Szűrők</h2>
```

and the product cards are `h3` — `src/app/features/catalog/product-card.html:17`:

```html
    <h3 class="name m-0">
```

`display: none` removes an element from the accessibility tree, so below 1024 px the heading
sequence is `h1 "Mobiltelefonok"` followed directly by twelve `h3`s. At 1024 and above the `h2`
renders and the sequence is correct. Confirm the fix with axe rather than by re-reading the DOM,
but do not spend a step re-establishing the cause.

### 5. Delivery — `listitem` (serious)

B2 described this as `<li>` elements "not inside a `<ul>` or `<ol>`". **That description is wrong,
and the real cause is different and smaller.** The `<li>` elements are inside a `<ul>`, but that
`<ul>` carries an explicit `role` that overrides its implicit `list` role, which orphans every `<li>`
under it. `src/app/features/checkout/delivery-step.html:40-46`:

```html
                <ul class="option-list" role="radiogroup" aria-label="Szállítási mód">
                  @for (option of readyOptions()?.deliveryOptions ?? []; track option.id) {
                    <li
                      class="option"
                      [class.is-active]="option.id === selectedOptionId()"
                      data-testid="delivery-option"
                    >
```

and `src/app/features/checkout/payment-method-selector.html:7-9`:

```html
  <ul class="options m-0 p-0 list-none flex flex-col gap-3" role="radiogroup" aria-label="Fizetési mód">
    @for (option of options; track option.id) {
      <li class="option border rounded transition-colors" [class.is-active]="isSelected(option.id)" data-testid="payment-option">
```

The `radiogroup` role is also wrong on its own terms: a `radiogroup` must own `radio` children, and
here the `<li>` elements sit between the group and the radios. Both lists are already inside a
native `<fieldset>` with a `<legend>` that provides exactly the grouping and the name the role was
trying to add — `delivery-step.html:37-38`:

```html
              <fieldset class="options" data-testid="delivery-options">
                <legend class="legend">Szállítási mód</legend>
```

and `payment-method-selector.html:1-2`:

```html
<fieldset class="payment m-0 p-5 rounded" data-testid="payment-selector">
  <legend class="legend px-2 font-bold">Fizetési mód</legend>
```

so removing the role loses nothing.

### 6. Success — `dlitem` (serious)

B2 described this as `<dt>`/`<dd>` pairs "not inside a `<dl>`", and that description is exactly
right. `src/app/features/checkout/order-receipt.html:78-91`:

```html
  <section class="receipt__meta flex flex-col gap-2 p-4 rounded" aria-label="Fizetés és szállítás" data-testid="receipt-meta">
    <div class="meta__row flex items-center justify-between gap-3" data-testid="receipt-row-payment">
      <dt class="m-0">Fizetési mód</dt>
      <dd class="m-0">{{ paymentLabel() }}</dd>
    </div>
    <div class="meta__row flex items-center justify-between gap-3" data-testid="receipt-row-delivery">
      <dt class="m-0">Szállítási mód</dt>
      <dd class="m-0">{{ deliveryLabel() }}</dd>
    </div>
    <div class="meta__row flex items-center justify-between gap-3" data-testid="receipt-row-status">
      <dt class="m-0">Státusz</dt>
      <dd class="m-0">Demó rendelés visszaigazolva</dd>
    </div>
  </section>
```

There is no `<dl>` anywhere in that section. The totals section immediately above it, at
`order-receipt.html:42-75`, gets it right — it opens `<dl class="totals flex flex-col gap-2 m-0">`
and wraps each pair in a `<div class="totals__row">`, which is valid inside a `<dl>`. Copy that
shape.

## What to change

### `src/app/features/product/product-page.html` — item 1

Change the opening tag at line 2 from `<main class="page" data-testid="product-page">` to
`<div class="page" data-testid="product-page">`, and the matching closing tag at line 143 from
`</main>` to `</div>`. Nothing else changes: `product-page.scss` selects `.page`, not `main`, and
the `data-testid` stays so every existing test keeps finding it.

Before committing, confirm nothing selects the element by tag name:

```
grep -rn "app-product-page main\|product-page main\|main.page" src tests e2e
```

Expect no matches. If there are any, fix those call sites in the same commit and name them in the
commit body.

### `src/app/features/catalog/catalog-page.ts` (inline template) — items 2 and 4

**Item 2.** Add an accessible name to the hidden search input. One attribute, nothing else:

```html
      <input
        #search
        type="search"
        class="sr-only absolute w-px h-px overflow-hidden"
        data-testid="catalog-search"
        aria-label="Keresés a telefonok között"
        [value]="facade.query().q ?? ''"
        (input)="onSearchInput($event)"
      />
```

Use that exact Hungarian string: it is the one `src/app/core/navigation/header-nav.html:44` and
`:96` already use for the same purpose, so no new copy is introduced and **FIX-35** has nothing new
to correct.

**Item 4.** Add a visually-hidden results heading as the **first** child of
`<div class="results …>`, before `<div class="toolbar …>`:

```html
      <h2 class="sr-only absolute w-px h-px overflow-hidden">Találatok</h2>
```

Use that class string verbatim — it is the pattern
`src/app/shared/ui/product-image/product-image.html:31` already uses, and `.sr-only` is defined
globally in `src/styles/primitives.css:53-63`, so it applies regardless of component style
encapsulation.

This is the decision; do not weigh alternatives. Demoting the twelve card headings from `h3` to
`h2` would also silence the rule, and it is wrong: the card names are subordinate to the results
list, and at 1024 and above they would become siblings of "Szűrők", which misdescribes the page.
Rendering the sidebar `h2` at narrow widths is wrong too: the sidebar's controls are deliberately
replaced by the drawer below 1024 and a heading with no section under it is worse than none. A
hidden heading for a region that has no visible one is the standard answer and it fixes every width
at once.

### `src/app/shared/ui/product-image/product-image.ts` and `.html` — item 3

Add one optional input to the primitive, defaulting to today's behaviour so no other call site
changes. In `src/app/shared/ui/product-image/product-image.ts`, beside the existing inputs at lines
40-42:

```ts
  /** When true the image is presentational: the surrounding markup
   *  already names it in visible text, so repeating the alt here
   *  duplicates that text for a screen reader (axe image-redundant-alt). */
  readonly decorative = input<boolean>(false);
```

In `src/app/shared/ui/product-image/product-image.html`, make the three announcements conditional:

```html
<div
  class="root relative block w-full rounded overflow-hidden"
  [style.aspect-ratio]="aspectRatio()"
  [attr.data-status]="status()"
  [attr.role]="decorative() ? null : 'img'"
  [attr.aria-label]="decorative() ? null : image().alt"
>
```

change the `<img>` alt binding at line 16 to:

```html
        [alt]="decorative() ? '' : image().alt"
```

and wrap the `sr-only` span at line 31:

```html
  @if (!decorative()) {
    <span class="sr-only absolute w-px h-px overflow-hidden">{{ image().alt }}</span>
  }
```

Then, in `src/app/features/catalog/product-card.html:7-12`, pass it:

```html
    <app-product-image
      data-testid="product-card-image"
      [image]="image()"
      [productName]="product().name"
      [aspectRatio]="'4 / 3'"
      [decorative]="true"
    ></app-product-image>
```

Pass it **only** from `product-card.html`. Do not pass it from
`src/app/features/cart/cart-line.html:3-6` or from the product gallery: on the product page the
gallery image is the primary content and needs its real alt, and the cart line was not flagged.

### `src/app/features/checkout/delivery-step.html` and `payment-method-selector.html` — item 5

In `delivery-step.html:40`, replace:

```html
                <ul class="option-list" role="radiogroup" aria-label="Szállítási mód">
```

with:

```html
                <ul class="option-list" role="list">
```

and in `payment-method-selector.html:7`, replace:

```html
  <ul class="options m-0 p-0 list-none flex flex-col gap-3" role="radiogroup" aria-label="Fizetési mód">
```

with:

```html
  <ul class="options m-0 p-0 list-none flex flex-col gap-3" role="list">
```

`role="list"` rather than no role at all, because both `<ul>`s are styled `list-style: none`, which
strips list semantics in some browser and screen-reader combinations; the repository already
handles that the same way at `src/app/features/catalog/filter-drawer.html:16`
(`<ul class="options …" role="list">`). The group name each `aria-label` was carrying is not lost:
the enclosing `<fieldset>`/`<legend>` pairs quoted in the evidence provide it natively.

Change nothing else in either file — not the `<input type="radio">` elements, not their `name`
attributes, not `aria-describedby`, not any Hungarian string.

### `src/app/features/checkout/order-receipt.html` — item 6

Wrap the three rows at lines 79-90 in a `<dl>`, keeping the `<section>` and its `aria-label` so the
region landmark and its name survive:

```html
  <section class="receipt__meta flex flex-col gap-2 p-4 rounded" aria-label="Fizetés és szállítás" data-testid="receipt-meta">
    <dl class="meta__list flex flex-col gap-2 m-0">
      <div class="meta__row flex items-center justify-between gap-3" data-testid="receipt-row-payment">
        <dt class="m-0">Fizetési mód</dt>
        <dd class="m-0">{{ paymentLabel() }}</dd>
      </div>
      <div class="meta__row flex items-center justify-between gap-3" data-testid="receipt-row-delivery">
        <dt class="m-0">Szállítási mód</dt>
        <dd class="m-0">{{ deliveryLabel() }}</dd>
      </div>
      <div class="meta__row flex items-center justify-between gap-3" data-testid="receipt-row-status">
        <dt class="m-0">Státusz</dt>
        <dd class="m-0">Demó rendelés visszaigazolva</dd>
      </div>
    </dl>
  </section>
```

and add the matching rule to `src/app/features/checkout/order-receipt.scss`, immediately after the
`.receipt__meta` rule at lines 175-183, so the new element does not change the spacing:

```scss
.meta__list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0;
}
```

`.meta__row`, `.meta__row dt` and `.meta__row dd` at lines 185-201 are unaffected — they are
descendant selectors and still match.

### Regression tests

**a. A Playwright axe suite.** `@axe-core/playwright@4.13.0` and `axe-core@4.13.0` are installed in
this repository and **no test uses either** — `grep -rn "AxeBuilder" e2e src tests` returns nothing,
even though the comment at `e2e/a11y/keyboard.spec.ts:23-26` claims "`state-matrix.spec.ts` and the
per-page unit suites cover axe". That claim is false; correct that comment in this commit as well.

Add `e2e/a11y/axe.spec.ts`:

```ts
import { AxeBuilder } from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/** The rule ids FIX-29 fixes. Asserted on every route this suite can reach. */
const FIXED_RULES = [
  'landmark-main-is-top-level',
  'landmark-no-duplicate-main',
  'landmark-unique',
  'label',
  'image-redundant-alt',
  'heading-order',
  'listitem',
  'dlitem',
];

const ROUTES = [
  { id: 'home', path: '/' },
  { id: 'catalogue', path: '/telefonok' },
  { id: 'product', path: '/telefonok/demo-one-5g' },
  { id: 'cart', path: '/penztar/kosar' },
  { id: 'success', path: '/penztar/siker/DEMO-000001' },
  { id: 'not-found', path: '/nincs-ilyen-oldal' },
];

test.describe('FIX-29 — structural accessibility violations', () => {
  for (const route of ROUTES) {
    test(`${route.id} has none of the fixed axe violations`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      if (route.id === 'success') {
        // Without this the dlitem assertion passes vacuously: a blocked
        // success route renders no <dt> at all, and "no violations" then
        // means "nothing to violate". See the note below this snippet.
        await expect(page.getByTestId('order-receipt')).toBeVisible();
      }
      const results = await new AxeBuilder({ page }).withRules(FIXED_RULES).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }

  for (const route of [ROUTES[0], ROUTES[5]]) {
    test(`${route.id} has no axe violations at all`, async ({ page }) => {
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });
  }
});
```

Use the **named** import `{ AxeBuilder }`: the package's own declarations end with
`export { AxeBuilder, AxeBuilder as default };`
(`node_modules/@axe-core/playwright/dist/index.d.ts`), so the named form needs no interop flag, and
`tsconfig.spec.json` does not include `e2e/**` at all, so a bad import here would surface only when
Playwright runs.

The route list stops where it does on purpose. `/penztar/adatok`, `/penztar/szallitas` and
`/penztar/ellenorzes` are **not** in it, because a full page load of any checkout route currently
discards the cart and redirects to the empty cart — a defect **FIX-10** owns — so `page.goto()` on
them would scan the cart's empty state under a checkout URL and prove nothing. The delivery page's
`listitem` fix is therefore proved by FIX-29-AC04 in a real browser, by clicking through the flow.
When **FIX-10** lands, add those three routes to `ROUTES` — say so in a comment in the file.

**The success route needs the extra precondition, and may have to come out.**
`/penztar/siker/:orderId` is behind `successGuard` (`src/app/features/checkout/checkout.routes.ts:236-238`),
and the receipt only renders when the mock resolves that order id. The header comment at
`e2e/design/viewport-matrix.spec.ts:22-26` claims "the MSW order handler resolves any valid
six-digit suffix", but that is an assertion in a comment, not something this package measured.
If the `toBeVisible()` precondition fails, the route is not rendering a receipt in a fresh context,
the `dlitem` half of that test would otherwise have passed on an empty page, and the honest move is
to **remove `success` from `ROUTES`** and say so in the commit body — the `dlitem` fix is then
proved entirely by FIX-29-AC05 in a real browser, by completing the flow. Do not weaken the
precondition to make the test green.

The second loop asserts the full rule set only on Home and the 404 route, because those are two of
the four axe measured clean on `db6d295`; Contact and Review are the other two and are unreachable
by `goto` for the same `FIX-10` reason. The cart page is deliberately **not** in the full-scan loop:
axe reported seven colour-contrast violations there, and **FIX-31** owns them.

**b. A unit spec for the markup this task changes.** Add `src/app/a11y-structure.spec.ts`, beside
`src/app/app.spec.ts` at the app root — it renders five components from four features (see below),
so it does not belong inside any one feature. **Not in `tests/`**: `FIX-06` lands before this task
and settles where feature specs live — it moves every feature spec under `src/` and leaves
`tests/` holding exactly six shared and contract files (`FIX-06.md:260-269`). After `FIX-04`,
`ng test`'s runner discovers specs with `cwd` set to the project source root and cannot see a spec
outside `src/` (`FIX-06.md:17-21`), and the `vitest.contract.config.ts` `FIX-06` creates runs
`tests/**/*.spec.ts` in a **Node** environment with no Angular compiler (`FIX-06.md:278-303`), so
a TestBed spec placed there is collected by a runner that cannot compile it. Confirm with
`ls tests/`, which must list six entries; if it lists more, `FIX-06` has not landed — stop and
report. Run this spec with `npm run test`; do not use `npx vitest run <path>`, which after
`FIX-06` no longer has a config that includes `src/`.

Copy the setup shape from `tests/layouts.spec.ts:11-19` — the `// @vitest-environment jsdom`
pragma, `import '@angular/compiler';`, `TestBed`, `provideZonelessChangeDetection()`. The spec
asserts, by name, the five structural facts jsdom can see:

1. A rendered `ProductPage` contains no `<main>` element.
2. A rendered `ProductCard`'s `<img>` has `alt === ''` and its wrapper has no `role="img"`.
3. A rendered `DeliveryStep` and a rendered `PaymentMethodSelector` each contain a `<ul>` whose
   `getAttribute('role')` is `'list'`, and no element with `role="radiogroup"`.
4. In a rendered `OrderReceipt`, every `<dt>` and every `<dd>` has a `<dl>` ancestor:
   `Array.from(el.querySelectorAll('dt, dd')).every((n) => n.closest('dl') !== null)`.
5. A rendered `CatalogPage` contains an `h2` before its first `h3` in document order, and its
   `[data-testid="catalog-search"]` input has a non-empty `aria-label`.

## Out of scope

- **Colour contrast.** `FIX-31` owns the seven contrast violations axe reports on the cart page.
  Do not change a colour, an opacity or a token value in this task, and do not add the cart route
  to the full-scan loop of the new axe suite.
- **Wiring up `catalog-page.html` / `catalog-page.scss`.** `FIX-14` owns moving the three inline
  templates and styles into their own files. Edit whichever copy the `@Component` decorator names
  today; do not change which one it names.
- **Deleting the hidden `catalog-search` input and the `search-commit` button.** Named as a defect
  in the Evidence section above; `FIX-43` owns the spec that depends on them — its item 3 at
  `FIX-43.md:237` converts `catalog-page.spec.ts:350-364` rather than deleting a test.
- **The 41 Playwright failures.** `FIX-09` owns them. The new axe suite is a new file; its results
  are this task's, and the pre-existing failures are not.
- **The cart-reload defect.** `FIX-10` owns it. Do not try to make the checkout routes survive a
  `page.goto()` in order to widen the axe suite.
- **The product page's layout and its buy rail.** `FIX-26` owns them, and it edits
  `product-page.scss` and `product-page.ts`. This task edits exactly two lines of
  `product-page.html` and nothing else in that directory.
- **The delivery step's inert continue button and its raw internal-state copy.** `FIX-22` owns both.
- **UI copy.** `FIX-35` owns correcting text to the spec. The only new strings this task adds are
  "Keresés a telefonok között", copied verbatim from the existing header, and the heading
  "Találatok"; add no others and change none.
- **The mobile drawer's and the dialogs' focus behaviour.** `FIX-30` owns them.

## How to verify

Run these in order, from the repository root. The package manager is **npm 11.17.0**; there is no
pnpm and no mise in this repository.

**Step 1 — build.**

```
npm run build
```

Expected exit code 0. This command was measured green on commit `db6d295`.

**Step 2 — unit tests.** This task's spec runs under `ng test`, not `npx vitest run`
(see "Regression tests (b)" above). Run `npm run test` before your first edit and again after your
last,
and record both coverage figures in the commit body. There is no target number: the pair is the
evidence that this task did not reduce coverage, and **FIX-08** is what turns the thresholds into
a gate. Do not carry the 56.42 % figure forward — it was measured by `npm run test:unit:coverage`
over the 30 specs under `tests/` only, a runner and a denominator that no longer exist, so it
cannot be compared with anything `ng test` reports. `npm run test` fails 14 of 14 files at the
baseline for a reason **FIX-04** owns; record that rather than treating it as this task's
regression.

**Step 3 — the new axe suite.**

```
npx playwright test e2e/a11y/axe.spec.ts
```

Expected exit code 0. On failure, the assertion message contains the full serialised violation
array, including each node's selector and failure summary; paste it into the task evidence rather
than paraphrasing.

Three warnings:

- The suite runs against the **production build** served from `dist/mi-bolt/browser` by
  `scripts/serve-static.mjs` (`playwright.config.ts:52-65`), so step 1 must have run first.
- `e2e/a11y/axe.spec.ts` takes no screenshots, so it does not touch the tracked images. If you also
  run `e2e/design/viewport-matrix.spec.ts`, that one **rewrites the 49 tracked screenshots under
  `e2e/design/screenshots/`**. Do **not** use `git restore`, `git checkout --`, `git stash`,
  `git reset` or `git clean` on them.
- The full `npx playwright test` run is red at baseline with 41 failures; **FIX-09** owns those.
  Run the new file on its own.

**Step 4 — real browser.** Mandatory. See FIX-29-AC01 to FIX-29-AC06. Reach the delivery and review
screens by **clicking through the flow** from `/telefonok` — add an item, open the cart from the
header, continue through contact to delivery — never by typing a `/penztar/*` URL or reloading one,
for the `FIX-10` reason above. Load axe in the browser the same way B2 did, from the dev server's
own `/@fs/` route, not from a CDN: `docs/spec/testing.md` §3 forbids external traffic and
`docs/spec/acceptance.md` **AC25** forbids shipping or contacting external resources.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` while working on this task: it rewrites tracked files and leaves
the working tree dirty. **Do not run the bare `npx playwright test` either** — the full suite is
270 tests, rewrites all 49 tracked images under `e2e/design/screenshots/`, and is `FIX-09`'s.
**The scoped command named in "How to verify" is the sanctioned exception and is mandatory**:
run exactly that command, nothing wider. `e2e/a11y/axe.spec.ts` is a file this task creates and
it writes no image, so this run rewrites no tracked file at all; `git status --short
e2e/design/screenshots` must still print nothing afterwards. Run it deliberately, read the
result, and check `git status --short` afterwards; anything it wrote is either committed with a
stated reason or left out of the commit with a stated reason.

## Acceptance criteria

Every browser criterion is checked at 1x device pixel ratio, light colour scheme, in a real browser
driven through `mcp__chrome-devtools__*`, with axe **4.13.0** loaded from the dev server's own
origin. Reading the diff, an HTTP 200, a green unit test and a file listing are none of them a
browser check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-29-AC01** On `/telefonok/demo-one-5g` at 1440, an axe run reports zero violations of
      `landmark-main-is-top-level`, `landmark-no-duplicate-main` and `landmark-unique`, and
      `document.querySelectorAll('main').length === 1`. Record the count.
- [ ] **FIX-29-AC02** On `/telefonok` at 1440 and at 390, an axe run reports zero violations of
      `label`, `image-redundant-alt` and `heading-order`. Record, for both widths, the sequence
      `Array.from(document.querySelectorAll('h1,h2,h3')).map((h) => h.tagName + ':' + h.textContent.trim().slice(0, 24))`
      and confirm no level is skipped. The 390 reading contained an `h1` followed directly by an
      `h3` before the fix.
- [ ] **FIX-29-AC03** On `/telefonok` at 1440,
      `document.querySelector('[data-testid="product-card-image"] img').getAttribute('alt')`
      returns the empty string, and the twelve cards' visible names are unchanged. Capture a
      screenshot of the grid.
- [ ] **FIX-29-AC04** Reach `/penztar/szallitas` by clicking through the flow. An axe run reports
      zero violations of `listitem`, and
      `document.querySelector('[data-testid="delivery-option"]').closest('ul').getAttribute('role')`
      returns `list`. Repeat for `[data-testid="payment-option"]`. Capture a screenshot of the
      delivery screen with an option selected.
- [ ] **FIX-29-AC05** On a success page reached by completing the flow, an axe run reports zero
      violations of `dlitem`, and
      `Array.from(document.querySelectorAll('[data-testid="order-receipt"] dt, [data-testid="order-receipt"] dd')).every((n) => n.closest('dl') !== null)`
      returns `true`. Capture a screenshot of the receipt and confirm its three meta rows render
      with the same spacing as before.
- [ ] **FIX-29-AC06** The four pages axe measured clean on `db6d295` — **Home**, **Contact**,
      **Review** and **404** — still report **zero violations of any rule**. Home and 404 are
      covered by the new Playwright suite; reach Contact and Review by clicking through the flow
      and run axe there in the browser. Record the four results explicitly, including the two that
      needed the click-through, so a later reader can see they were checked rather than assumed.
- [ ] **FIX-29-AC07** `npx playwright test e2e/a11y/axe.spec.ts` exits 0 with all eight tests
      passing. Paste the summary line.
- [ ] **FIX-29-AC08** `src/app/a11y-structure.spec.ts` exists, asserts the five named facts in
      "Regression tests (b)" above, and `npm run test` exits 0.
- [ ] **FIX-29-AC09** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim.
- [ ] **FIX-29-AC10** The false comment at `e2e/a11y/keyboard.spec.ts:23-26` no longer claims that
      `state-matrix.spec.ts` covers axe, and names `e2e/a11y/axe.spec.ts` instead.

### Design rules (mi-bolt-design 1.0.1)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- [ ] **FIX-29-AC11** Applicable and asserted above: **R20** (every interactive element supports
      keyboard operation, visible focus and a meaningful accessible name — AC02 covers the named
      search input; additionally tab through the delivery options and the payment options after the
      role change and record that each radio is still reachable with Tab and selectable with the
      arrow keys, because a native radio group's arrow-key behaviour is what the removed
      `role="radiogroup"` was trying to imitate), **R19** (no-results, error, loading, success and
      disabled remain distinct — the catalogue's empty and error branches must still render with
      the new `h2` above them; visit `/telefonok?q=zzzzzz` once and confirm), **R10** (labels must
      be live text — AC03 confirms the card names stay DOM text and are not moved into the image),
      **R12** (Hungarian labels with correct accents — the two added strings are
      "Keresés a telefonok között" and "Találatok"; confirm both render with their accents intact),
      **R21** (44×44 targets — the hidden search input is 1×1 and stays so; record that it remains
      outside the visible control set and that no visible target changed size).
- [ ] **FIX-29-AC12** Recorded as N/A with reasons: **R01, R02, R03** — the change adds no imagery
      and alters no brand, shell or hero colour. **R04, R06** — no new raw colour or dimension is
      introduced; the one added SCSS rule reuses `--space-2`. **R05** — no container width or
      centreline is touched; `FIX-34` owns it. **R07** — no font or type-scale declaration is
      touched; the added `h2` is visually hidden and inherits nothing visible. **R09** — no
      text/background colour pair changes; `FIX-31` owns contrast. **R11** — no aspect ratio or
      image dimension changes; only the `alt` attribute does. **R13, R14, R17, R18, R24, R25** —
      the change is markup semantics only and reaches no price field, variant logic, filter state,
      persistence or offer copy. **R15** — no demo labelling is added or removed. **R16** — the
      application has exactly one provider. **R22** — no responsive rule changes; `FIX-26` owns the
      narrow-layout failure. **R23** — no dialog behaviour changes; `FIX-30` owns dialog focus.
      **R26** — a handoff-practice rule, satisfied by the commit body and the recorded evidence
      rather than by runtime behaviour.

## Commit

This task is exactly one commit. Do not bundle it with another FIX task, and do not commit until
every acceptance criterion above has passed and its output is recorded. The commit carries the six
markup fixes, the `ProductImage` input, the two new test files, the `order-receipt.scss` rule and
the corrected comment in `e2e/a11y/keyboard.spec.ts`. If you ran `viewport-matrix.spec.ts` as well,
name in the commit body whichever screenshots under `e2e/design/screenshots/` it changed, and why.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: structural a11y violations (landmarks, list, dl, label, heading order)
```
