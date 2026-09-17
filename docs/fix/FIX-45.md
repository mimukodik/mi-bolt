# FIX-45 — Render the product page's breadcrumb, description, stock line and simulation note

Status: PLANNED — not executed.
Severity: major
Source: A3 (product screen sweep), B1 (product page browser walk), `docs/spec/screens.md:57`. Recorded as unowned in `FIX-23`'s out-of-scope section; this task is its owner.

## Why this is wrong

`docs/spec/screens.md:57` fixes what the product screen shows:

> **Purpose:** inspect media/specifications, select exact configuration, add an
> available quantity. Shared shop shell/**breadcrumb**. Desktop left7 columns
> gallery, right5 columns product/configuration; light shopping canvas, no hero.
> Right: small **DEMÓTERMÉK marker**, H1 Demo One5G, **description**, **stock**,
> color/storage selectors, unit price, quantity, primary "Kosárba teszem",
> **simulation note**.

Five of those are absent from the shipped page: the breadcrumb, the DEMÓTERMÉK
marker, the description, the stock line and the simulation note. Under **D1** the
specification is right and the code is wrong, so all five are added and no spec line
is edited.

Two of the five carry rules of their own. Design rule **R15** requires demo data to
be clearly labelled as demo data and forbids implying a real order — that is the
marker and the simulation note, and with both absent the product page is the one
commerce screen that says nothing about being a simulation. **R19** requires
disabled, error and available to be distinct states; today a variant that is out of
stock is communicated only by the add button's enabled state, while `screens.md:61`
requires that "Unavailable combinations disabled with reason" — a reason in words,
beside the control.

The data is already on the wire and already in the page's view model. Nothing has to
be fetched, computed or invented; four fields are being dropped on the floor.

## Evidence

### Nothing renders any of the five

`src/app/features/product/product-page.html:39-52` is the whole of the buy column's
header:

```html
              <div class="buy">
                <header class="buy-header">
                  <p class="brand">{{ brand() }}</p>
                  <h1 class="name" data-testid="product-name">{{ productName() }}</h1>
                  @if (selectedColorName() !== null) {
                    <p class="meta">
                      <span class="meta-label">Szín:</span>
                      <span class="meta-value">{{ selectedColorName() }}</span>
                      <span class="meta-sep" aria-hidden="true">·</span>
                      <span class="meta-label">Tárhely:</span>
                      <span class="meta-value">{{ selectedStorageLabel() }}</span>
                    </p>
                  }
                </header>
```

The file has no `<nav>` at all — `product-page.html:2` opens straight into
`<main class="page" data-testid="product-page">` and then `<article class="card">`.

```
$ grep -n "availability\|description\|isDemo" src/app/features/product/product-page.ts
$ echo $?
1
```

Not one hit. `grep -n "availability\|description" src/app/features/product/product.facade.ts`
is empty too. The only field from the selected variant the page reads is
`maxQuantity`, at `product-page.ts:163`.

### The data exists on the wire model

`src/app/api/generated/models/product.ts`:

```ts
export interface Product {
  brand: string;
  defaultVariant: Variant;
  description: string;
  highlights: Array<string>;
  id: string;
  is5g: boolean;
  isDemo: true;
  name: string;
  slug: string;
  specGroups: Array<SpecGroup>;
  variants: Array<Variant>;
}
```

`src/app/api/generated/models/variant.ts`:

```ts
export interface Variant {
  availability: Availability;
  colorCode: string;
  …
}
```

`src/app/api/generated/models/availability.ts`:

```ts
export type Availability = 'in_stock' | 'out_of_stock';
```

`isDemo` is typed as the literal `true`, so the DEMÓTERMÉK marker needs no
condition at all.

### The page's view model already exposes what is needed

`src/app/features/product/product-page.ts:97-109`:

```ts
  readonly vm = this.facade.vm;
  …
  readonly product = computed(() => this.vm().product);
  readonly productName = computed<string>(() => this.vm().product?.name ?? '');
  readonly brand = computed<string>(() => this.vm().product?.brand ?? '');
  readonly highlights = computed<readonly string[]>(() => this.vm().product?.highlights ?? []);
```

and `this.vm().selectedVariant` is read at `:114`, `:148`, `:157`, `:163`, `:253`
and `:255`. Every field this task needs is one property access away from signals
that already exist.

### The catalogue is the working sibling to copy

`src/app/features/catalog/catalog-page.ts:69-73` renders a breadcrumb; the product
page does not:

```html
        <nav class="breadcrumbs flex gap-2 items-center" aria-label="Navigáció">
          <a routerLink="/" class="breadcrumb no-underline">Főoldal</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <span class="breadcrumb is-current" aria-current="page">Mobiltelefonok</span>
        </nav>
```

with its styles at `catalog-page.ts:295-320`.

### Where the copy comes from

None of the Hungarian strings below is invented. The design prototype,
`docs/design/prototype.html`, renders the product screen and is the reference the
spec points at; its product view contains, in order:

- the breadcrumb `Főoldal / Mobiltelefonok / {product name}`;
- `<p class="muted small">${prod.description}</p>`;
- `<div class="stock …" role="status">` reading `✓ Raktáron a demó készletben` when
  available and `× Ez a konfiguráció elfogyott a demó készletből.` when not;
- below the add control, `<p class="metadata">… A rendelés kipróbálható, de nem jár
  valódi vásárlással.</p>`.

Read those strings from the prototype rather than from this file, so a later edit to
the prototype is not silently ignored.

## What to change

All edits are in `src/app/features/product/`. Five additions to the template, four
computed signals, and the matching stylesheet rules.

### 1. `product-page.ts` — four computed signals

Add them beside the existing ones at `:106-109`, in the same style:

```ts
  /** Marketing description from the wire model. Empty string while the
   *  product is loading, so the template can skip the paragraph. */
  readonly description = computed<string>(() => this.vm().product?.description ?? '');

  /** Availability of the currently selected variant, or null when no
   *  variant is selected yet. Never defaulted to in-stock. */
  readonly selectedAvailability = computed<Availability | null>(
    () => this.vm().selectedVariant?.availability ?? null,
  );

  /** Stock sentence for the selected variant. Empty while unknown. */
  readonly stockMessage = computed<string>(() => {
    const availability = this.selectedAvailability();
    if (availability === null) return '';
    return availability === 'in_stock'
      ? 'Raktáron a demó készletben'
      : 'Ez a konfiguráció elfogyott a demó készletből.';
  });
```

Import the `Availability` type from `../../api/generated/models/availability`
alongside the model imports the file already has.

**`?? null`, never `?? 'in_stock'`.** `docs/spec/screens.md:65` requires that
"Failure never erases the selected variant or shows zero price", and the same
principle applies to stock: a page that has not loaded a variant must say nothing
about stock rather than claim availability. Design rule **R14** — "numerical offers
must come from an approved data source" — is the same rule for the same reason.

### 2. `product-page.html` — the breadcrumb

Insert it as the first child of `<main class="page">`, before
`<article class="card">` at `:3`, so it is outside the `@switch` and renders in the
loading and error states as well:

```html
      <nav class="breadcrumbs" aria-label="Navigáció" data-testid="product-breadcrumb">
        <a routerLink="/" class="breadcrumb">Főoldal</a>
        <span aria-hidden="true" class="breadcrumb__sep">/</span>
        <a routerLink="/telefonok" class="breadcrumb">Mobiltelefonok</a>
        <span aria-hidden="true" class="breadcrumb__sep">/</span>
        <span class="breadcrumb is-current" aria-current="page">{{ productName() }}</span>
      </nav>
```

`productName()` returns the empty string while loading, which renders an empty final
crumb; that is correct and matches the catalogue's own two-crumb shape until the
name arrives.

`RouterLink` must be in the component's `imports` array for `routerLink` to work.
Check whether it is already there and add it if not; the template uses no
`routerLink` today.

### 3. `product-page.html` — the DEMÓTERMÉK marker

As the first child of `<header class="buy-header">`, above the brand paragraph at
`:41`:

```html
                  <p class="demo-tag" data-testid="product-demo-tag">DEMÓTERMÉK</p>
```

No condition: `Product.isDemo` is typed as the literal `true`, so every product in
this application is a demo product and a conditional would be dead code. The word is
the one `docs/spec/screens.md:49` and `:57` both use.

### 4. `product-page.html` — the description

Directly under the `@if (selectedColorName() …)` block that closes at `:51`, still
inside `<header class="buy-header">`:

```html
                  @if (description()) {
                    <p class="description" data-testid="product-description">{{ description() }}</p>
                  }
```

### 5. `product-page.html` — the stock line

Between the header and `<section class="prices">` at `:54`:

```html
                @if (stockMessage()) {
                  <p
                    class="stock"
                    [class.stock--out]="selectedAvailability() === 'out_of_stock'"
                    role="status"
                    data-testid="product-stock"
                  >{{ stockMessage() }}</p>
                }
```

`role="status"` matches the prototype and means a variant change announces the new
stock state to a screen reader. The `stock--out` class carries a colour **and** the
sentence carries the meaning, so the state is not indicated by colour alone
(**R19**, and `docs/spec/screens.md:61`'s "Unavailable combinations disabled with
reason" applied to the same column).

### 6. `product-page.html` — the simulation note

Inside `<div class="cta-desktop">`, after the existing `@if (addToCartReason() …)`
block that closes at `:99`:

```html
                  <p class="simulation-note" data-testid="product-simulation-note">
                    A rendelés kipróbálható, de nem jár valódi vásárlással.
                  </p>
```

It sits with the call to action because that is where `screens.md:57` puts it
("primary 'Kosárba teszem', simulation note") and because that is the moment the
user needs it (**R15**).

### 7. `product-page.scss` — the rules

Append to the file, using existing tokens only. The breadcrumb rules are copied from
the catalogue's (`catalog-page.ts:295-320`) so the two screens look the same:

```scss
      .breadcrumbs {
        display: flex;
        gap: var(--space-2);
        align-items: center;
        margin-bottom: var(--space-4);
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .breadcrumb {
        color: var(--color-text-secondary);
        text-decoration: none;
      }

      .breadcrumb:hover,
      .breadcrumb:focus-visible {
        color: var(--color-brand-ink);
        text-decoration: underline;
      }

      .breadcrumb.is-current { color: var(--color-text-primary); }

      .breadcrumb__sep { color: var(--color-text-secondary); }

      .demo-tag {
        align-self: flex-start;
        margin: 0;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-badge);
        background: var(--color-brand-accent-soft);
        color: var(--color-brand-ink);
        font-size: var(--type-meta);
        font-weight: var(--weight-bold);
        letter-spacing: 0.04em;
      }

      .description {
        margin: 0;
        max-width: 60ch;
        font-size: var(--type-body);
        line-height: var(--line-height-body);
        color: var(--color-text-secondary);
      }

      .stock {
        margin: 0;
        font-size: var(--type-helper);
        font-weight: var(--weight-medium);
        color: var(--color-status-success);
      }

      .stock--out { color: var(--color-status-error); }

      .simulation-note {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }
```

`letter-spacing: 0.04em` is the one value here that is not a token. It is a
typographic detail with no token in `src/styles/tokens.css`; if you prefer, drop the
declaration entirely rather than add a token — **do not add anything to
`tokens.css`**, which `FIX-17` records as a user-level design decision. State in the
commit body which you did.

### 8. Tests — `tests/product-page.spec.ts`

The file exists and is the acceptance suite for this screen (its header: *"T16 —
Product detail page (S3)"*). Add the six cases to it; `FIX-06` owns moving it out of
`tests/`, so do not move it here.

**Rendering works in this suite, and the file's own header says it does not.** That
header is stale — see the correction at the end of this item. Six cases, all against
rendered DOM:

- With a loaded product, `[data-testid="product-description"]`'s text equals the
  fixture product's `description`.
- With a variant whose `availability` is `'in_stock'`,
  `[data-testid="product-stock"]` is present, its text is
  `Raktáron a demó készletben`, and it does not carry the `stock--out` class.
- With a variant whose `availability` is `'out_of_stock'`, the text is
  `Ez a konfiguráció elfogyott a demó készletből.` and the element does carry
  `stock--out`. Both arms of the branch need a case
  (`.claude/rules/code-standards.md`).
- **The case that proves the `?? null` in item 1** (FIX-45-AC05b): a success-state vm
  with a **null** `selectedVariant` — `status: 'success'`, a non-null `product`,
  `selectedVariant: null` — renders the `@default` branch, and in it
  `[data-testid="product-stock"]` is absent and `selectedAvailability()` is `null`.
  Not the loading state: the buy column is inside `@default`
  (`product-page.html:20`, `:39`) so the loading state has no stock element to assert
  about and cannot tell `?? null` from `?? 'in_stock'`. The stub is what produces this
  vm; the live facade never does, because `currentVariant()`
  (`product.facade.ts:333-342`) falls back to `product.defaultVariant` whenever a
  product is loaded — which is the point, since the guard exists for the shape the
  wire could send and the fixture set happens not to.
- `[data-testid="product-breadcrumb"]` contains three links or spans in the order
  `Főoldal`, `Mobiltelefonok`, the product name, and the first two have `href`s of
  `/` and `/telefonok`.
- `[data-testid="product-demo-tag"]` and
  `[data-testid="product-simulation-note"]` are both present with their exact text.

**What the three cases need at the top of the file.** `tests/product-page.spec.ts`
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

**The provider set.** `ProductPage` injects `ProductFacade`, `CartFacade`,
`ActivatedRoute` and `DestroyRef`, and reads everything the six cases are about through
`this.facade.vm` (`product-page.ts:96`, `readonly vm = this.facade.vm;`). Stub the facade
with `{ vm: signal<ProductVm>(…) }` and register it as
`{ provide: ProductFacade, useValue: stub }`; the whole of the six cases is then driving
that one signal. `ProductVm`'s fields are declared at `product.facade.ts:64-84`. Stub
`CartFacade` with an object exposing `ensureCart` and `addItem` as no-ops, and use
`provideRouter([], withComponentInputBinding())` as `tests/home-page.spec.ts:471` does.

**Correct the file's stale header in the same commit.**
`tests/product-page.spec.ts:24-30` currently reads:

```text
 * The vitest runtime cannot instantiate Angular components through
 * the legacy-decorator transform the project ships (styleUrl
 * resolution needs the Angular CLI's resource plugin; the legacy
 * transpile strips signal-input metadata). The tests below
 * therefore inspect the rendered source directly. The
 * implementation is exercised end-to-end by `ng build` (which runs
 * the real Angular compiler) and by the browser-side demos.
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

- **The product page's variant URL, invalid deep link, not-found state and
  thumbnails — `FIX-23`.** That task owns the variant/state contract and its
  out-of-scope section names all four of the items this task adds as unowned; after
  this task they are owned here. Do not touch `onVariantChange`, the query-parameter
  handling, `invalidQuery()` or the gallery.
- **Wiring `AddToCart` in — `FIX-16`.** That task replaces the inline call-to-action
  block at `product-page.html:88-100` with the `app-add-to-cart` component. **This
  task adds one paragraph inside `<div class="cta-desktop">`, which is the element
  `FIX-16` edits, so the two tasks must not run at the same time.** Whichever lands
  second keeps both changes: the simulation note stays in the CTA column beside
  whatever control is there. Say in the commit body which order applied.
- **The mobile buy rail** at `product-page.html:121-141` — it is unextracted and
  stateless, and **`FIX-50`** owns that. This task adds no simulation note, stock
  line or marker to the rail. If the rail should carry the note as well, that is
  `FIX-50`'s call when it extracts `MobileBuyRail`.
- **Component signature drift — `FIX-50`** for `AddToCart`, `ProductGallery` and
  `VariantSelector`.
- **The one-column collapse at 390 and the sticky rail — `FIX-26`**; the horizontal
  overflow — `FIX-27`; add-to-cart under touch emulation — `FIX-32`.
- **UI copy generally — `FIX-35`.** Its copy table has **no product-page row**, so
  the four strings this task adds are this task's, and they are taken from
  `docs/design/prototype.html` rather than written here. Do not change the existing
  `Készülékár` label, the `Szín:` / `Tárhely:` meta line or the `Műszaki adatok`
  heading.
- **`src/styles/tokens.css`.** Add no token. `FIX-17` records that file as a copy of
  the approved skill package and additions to it as a user decision.
- **The catalogue's breadcrumb.** It is the model this task copies; leave it exactly
  as it is. It lives in `catalog-page.ts`'s inline `template:`;
  `src/app/features/catalog/catalog-page.html` and `catalog-page.scss` also exist
  but are orphaned today — `catalog-page.ts` still declares its template and styles
  inline with no `templateUrl`/`styleUrl`, so neither compiled file is live. **`FIX-14`**
  owns the orphaned pair alongside the inline-to-file extraction it already performs;
  do not cite the extracted `.html`/`.scss` as the live breadcrumb markup.
- **The checkout breadcrumbs.** `src/app/features/checkout/delivery-step.html:3-11`
  uses plain `href` attributes rather than `routerLink`, so each crumb triggers a
  full page load. That is a real defect, it is not this screen, and **FIX-55** owns
  it. Report it; do not fix it here.
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
npm run build                              # expected exit 0
npx vitest run tests/product-page.spec.ts  # expected exit 0
npm run test                                # record the exit code; a failure attributable to
                                             # FIX-04 does not fail this task, but the spec file
                                             # above must pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

**How to reach an out-of-stock variant.** `src/mocks/` seeds the catalogue from
`docs/api/fixtures/products.json`. Find a variant whose `availability` is
`out_of_stock` with
`grep -n "out_of_stock" docs/api/fixtures/products.json` and select that colour and
storage combination on the page. If the fixture has none, say so and record how you
produced the state instead; do not report the criterion as passed without having
seen the out-of-stock sentence rendered.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty. Do not run the full Playwright
suite: it rewrites 49 tracked screenshots under `e2e/design/screenshots/`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R15 applies and is the rule the marker and the note restore**: the page labels
  itself as demo data and says plainly that no real purchase occurs. AC03 and AC06
  record the rendered strings.
- **R19 applies**: available and out-of-stock become distinct, announced states.
  AC04 measures both.
- **R14 applies**: the stock line comes from `Variant.availability` and is absent
  rather than optimistic when no variant is loaded. AC05 checks the loading state.
- **R12 applies**: every added string is correctly accented Hungarian taken from
  `docs/design/prototype.html`. AC07 records them verbatim.
- **R04 and R06 apply**: every added dimension and colour is an existing token,
  except the one `letter-spacing` the task explicitly flags. AC08 checks it.
- **R09 applies**: the demo tag is `--color-brand-accent-soft` with
  `--color-brand-ink`, and the out-of-stock line is `--color-status-error`; AC09's
  axe run measures both.
- **R20 applies**: the breadcrumb links are native anchors with visible text and
  focus rings, and the stock line is announced through `role="status"`.
- **R05 applies**: the breadcrumb sits inside `.page`, which already carries
  `max-width: var(--layout-container-max)` (`product-page.scss:7-16`), so nothing
  leaves the centreline.
- R01, R02, R03, R07, R08, R10, R11, R13, R16, R17, R18, R21, R22, R23, R24, R25:
  N/A. The change adds no imagery, brand asset or aspect ratio (R01, R10, R11),
  alters no shell or hero (R02), introduces no new palette (R03), adds no font or
  type-scale declaration outside the existing tokens (R07), adds no action (R08),
  touches no price field (R13), involves one provider only (R16), changes no
  variant-switching logic (R17) or filter state (R18), adds no interactive target
  (R21), changes no breakpoint (R22), opens no dialog (R23), persists nothing (R24)
  and invents no review, award or stock-urgency claim (R25) — the stock line states
  the wire's value and nothing more. R26 is satisfied by the commit body and the
  recorded evidence.

## Acceptance criteria

Every browser criterion is checked in a real browser driven through
`mcp__chrome-devtools__*`, at 1x device pixel ratio and light colour scheme.
Reading the diff, an HTTP 200 and a green unit test are none of them a browser check
(`.claude/rules/browser-verification.md`).

- [ ] **FIX-45-AC01** At 1440 on `http://localhost:4200/telefonok/demo-one-5g`, all
      five new elements are present:
      `['product-breadcrumb','product-demo-tag','product-description','product-stock','product-simulation-note'].map(t => document.querySelector('[data-testid="'+t+'"]') !== null)`
      returns five `true` values. Record a full-page screenshot. All five returned
      `null` before the change.
- [ ] **FIX-45-AC02** The breadcrumb reads `Főoldal / Mobiltelefonok / Demo One 5G`
      in that order, its first two entries are links, and clicking `Mobiltelefonok`
      navigates to `/telefonok` as an in-page router navigation rather than a page
      load. Record the rendered text and the resulting URL.
- [ ] **FIX-45-AC03** `document.querySelector('[data-testid="product-demo-tag"]').textContent.trim()`
      is exactly `DEMÓTERMÉK`, and the element is visible in the screenshot above the
      product name.
- [ ] **FIX-45-AC04** Stock is rendered for both states. With an in-stock variant
      selected, `[data-testid="product-stock"]`'s text is
      `Raktáron a demó készletben`. Select an out-of-stock combination (see "How to
      verify") and confirm the text becomes
      `Ez a konfiguráció elfogyott a demó készletből.` and the computed `color`
      changes. Record both strings, both computed colours and a screenshot of each.
- [ ] **FIX-45-AC05** **Smoke check, not a proof.** During the loading state — throttle
      the network or reload with the request paused — `[data-testid="product-stock"]` is
      **absent** rather than showing an in-stock claim. Record what was on screen. This
      criterion cannot distinguish `?? null` from `?? 'in_stock'` and is not evidence
      about item 1: `product-page.html:4` opens `@switch (state())`, the loading branch
      is `@case ('loading')` at `:5`, and the buy column that carries the stock
      paragraph is inside `@default` at `:20`, so the element is out of the template in
      that state whatever `selectedAvailability()` returns. **FIX-45-AC05b** is the
      criterion that proves item 1.
- [ ] **FIX-45-AC05b** **The criterion that proves the `?? null` in item 1.** In
      `tests/product-page.spec.ts`, render `ProductPage` against a `ProductFacade` stub
      whose `vm()` is in the success branch with **no selected variant** — that is,
      `status: 'success'`, a non-null `product`, and `selectedVariant: null` — and
      assert that `[data-testid="product-stock"]` is absent from the rendered DOM and
      that `componentInstance.selectedAvailability()` is `null`. This is the only state
      in which the two implementations differ: the page's `state` computed
      (`product-page.ts:99-104`) returns `'success'` for anything that is not `loading`
      or `error`, so the `@default` branch renders, and with `?? 'in_stock'` the stock
      paragraph would be present and would read `Raktáron a demó készletben`. The case
      fails if item 1 is written with any non-null fallback, which is what makes it a
      proof rather than a smoke check.
- [ ] **FIX-45-AC06** `[data-testid="product-simulation-note"]` renders in the same
      column as the primary "Kosárba teszem" control and is visible without scrolling
      once the CTA is on screen at 1440. Record its rendered text and its bounding
      rect relative to the button's.
- [ ] **FIX-45-AC07** Every added Hungarian string is recorded verbatim and matches
      `docs/design/prototype.html`'s product view. No English text is added to the
      page.
- [ ] **FIX-45-AC08** `git diff src/styles/tokens.css` is empty for this commit, and
      `grep -nE "#[0-9a-fA-F]{3,8}|[0-9]+px" src/app/features/product/product-page.scss`
      shows no new literal introduced by this change. The single `letter-spacing`
      value, if kept, is named in the commit body as the one exception.
- [ ] **FIX-45-AC09** An axe run on the product page at 1440 reports **zero**
      violations, with the in-stock state and again with the out-of-stock state.
      Record both outputs.
- [ ] **FIX-45-AC10** At 390, all five elements are present, the description does not
      overflow, and `document.documentElement.scrollWidth` is not greater than
      `document.documentElement.clientWidth`. `FIX-27` owns pre-existing overflow on
      this screen; if the number is already over before your change, record both
      numbers and name that task.
- [ ] **FIX-45-AC11** The six unit cases in "What to change" item 8 exist in
      `tests/product-page.spec.ts`, each renders `ProductPage` through
      `TestBed.createComponent` and asserts on the DOM, and
      `npx vitest run tests/product-page.spec.ts` exits 0. Check the form with
      `grep -c "createComponent(ProductPage)" tests/product-page.spec.ts`, which must
      print at least `6`; before this task it printed `0`.
- [ ] **FIX-45-AC12** `npm run build` exits 0 and `npm run test`
      exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/product-page.spec.ts` instead.

## Commit

This task is exactly one commit covering all five additions, because they are one
spec line, one screen and one browser pass, and splitting them would produce five
commits of four lines each. Do not bundle it with any other FIX task, and do not
commit until every acceptance criterion above has passed and its output is recorded.

The commit body records: that the five items come from `docs/spec/screens.md:57` and
the copy from `docs/design/prototype.html`, with no string invented; whether this
task or **FIX-16** touched `<div class="cta-desktop">` first; whether the
`letter-spacing` declaration was kept or dropped; and that the checkout
breadcrumbs' plain `href` attributes are a separate defect, owned by **FIX-55**,
that was reported and not fixed.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: render the product page's breadcrumb, description, stock and demo notes
```
