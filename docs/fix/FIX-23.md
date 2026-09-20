# FIX-23 — Product page: the `?variant=` contract and the not-found state

Status: PARTIAL — query-param read (item 1) was already fixed by f990255 (FIX-02) as a side effect, measured before this task started. This task lands items 2–6: URL write-back, the reload guard, the notfound status/state and the unit tests. Open: AC01–AC03, AC04–AC07 and AC09–AC10's browser-only halves are unverified in this session (unit tests only, per this session's mandate); deferred to the batched browser pass.
Severity: blocker
Source: B1 F2, F8, F9, F7; B3 F7 ("Product" row); A3 (ProductPage / ProductGallery rows).

## Why this is wrong

Four defects, three of which have one cause. The route contract is
`/telefonok/:slug?variant=:variantId` (`docs/spec/screens.md:21`, route map row S3), and
today the page **never reads that query parameter at all** and **never writes it**:

1. Choosing a different storage or colour updates the price, the image and the capacity
   text correctly, but the URL keeps the old `variant=…`, so a reload reverts the
   selection. `docs/spec/screens.md:21` makes the variant part of the route, and
   `docs/spec/screens.md:61` requires a variant change to update image, price, capacity,
   stock and max quantity atomically; R17 requires that consistency and R18 requires the
   URL to be part of it.
2. `/telefonok/demo-one-5g?variant=nonsense-variant-id` renders the default variant with
   no message of any kind and leaves "Kosárba teszem" fully enabled.
   `docs/spec/screens.md:61` requires "Invalid deep-link variant yields explanation and
   blocked add until valid selection"; E046 (`docs/spec/test-scenarios.md:52`) covers it.
   The page already contains both the explanation and the disabling rule — they are
   unreachable because the query is never parsed.
3. `/telefonok/nincs-ilyen-telefon` renders the generic "A termék nem tölthető be" error
   with a single "Újrapróbálom" button — the same component a transient server error uses.
   A retry can never succeed for a slug that does not exist and there is no way back to
   the catalogue. `docs/spec/screens.md:65` lists "notfound" as its own state, distinct
   from "request error/Retry"; E042 (`docs/spec/test-scenarios.md:48`) requires "Dedicated
   not-found with catalogue return; no fake product". R19 is the rule.
4. *(moved)* The gallery thumbnail row renders a checkmark glyph and a bare "2" instead
   of preview images, against `docs/spec/screens.md:59`. **`FIX-71` owns it**: it
   touches `product-gallery.{html,ts,scss}` and the gallery spec, none of which this
   task touches, and it shares no cause with the three query-parameter defects above.
   The measurement stays in Evidence because it was taken here.

## Evidence

**The query parameter is never read. This is measured, not inferred.**
`src/app/features/product/product-page.ts:190` and `:205` both build the search params
from a `ParamMap` by calling `toString()` on it:

```ts
      const params = new URLSearchParams(this.route.snapshot.queryParamMap.toString());
```

```ts
      const params = new URLSearchParams(queryParamMap.toString());
```

`ParamMap`'s implementation class defines `has`, `get`, `getAll` and `keys` and **no**
`toString` (`node_modules/@angular/router/fesm2022/_router-chunk.mjs:16-41`), so the
expression evaluates to `Object.prototype.toString`'s result, `"[object Object]"`.
Measured with plain Node — `URLSearchParams` is a built-in, so no DOM is involved:

```
$ node -e "const p=new URLSearchParams('[object Object]'); console.log([...p.keys()], p.get('variant'))"
[ '[object Object]' ] null
```

`parseVariantQuery` reads exactly that key
(`src/app/features/product/variant-selection.ts:314-320`, `params.get('variant')`), so it
returns `null` on every load. With `variantQuery === null`, `selectInitialVariant`
(`variant-selection.ts:115-125`) returns the default variant and `invalidQuery: null`, and
`computeAddToCartState` (`variant-selection.ts:269-283`) therefore never produces its
"A linkben megadott változat nem található; válassz a listából." disabled reason. The
explanation block in the template (`src/app/features/product/product-page.html:111-116`)
is live and correct; it can simply never be true. **This single bug causes defect 1's
reload half and the whole of defect 2.**

The catalogue does the same conversion correctly, in the same repository —
`src/app/features/catalog/catalog-page.ts:665-669`:

```ts
        const search = new URLSearchParams();
        params.keys.forEach((key) => {
          for (const v of params.getAll(key)) search.append(key, v);
        });
        this.facade.loadFromParams(search);
```

**The URL is never written on a variant change.**
`src/app/features/product/product-page.ts:224-230`:

```ts
  onColorChange(colorCode: string): void {
    this.facade.selectColor(colorCode);
  }

  onStorageChange(storageGb: number): void {
    this.facade.selectStorage(storageGb);
  }
```

Neither navigates, and `ProductPage` does not inject `Router` at all
(`product-page.ts:86-89`). The facade already ships the encoder for this and nothing calls
it — `src/app/features/product/product.facade.ts:295-303`:

```ts
  /**
   * Encodes the current variant selection as `?variant=...` so the
   * page can write it back to the router without rebuilding the
   * search string by hand.
   */
  currentVariantParams(): URLSearchParams {
```

`grep -rn "currentVariantParams" src tests e2e` matches only its definition and
`tests/variant-selection.spec.ts`'s tests of the underlying codec.

**Every failure is the same state.** `src/app/features/product/product.facade.ts:62`
declares `export type ProductStatus = 'idle' | 'loading' | 'success' | 'error';` and the
load pipeline collapses every error into it (`product.facade.ts:161-162` and `:170-172`),
so a 404 for an unknown slug and a 503 are indistinguishable downstream. The repository already contains
the shape this needs: `src/app/features/checkout/success-step.ts:199-211` branches on
`result.error.status === 404` into a `missing` state, and
`src/app/features/checkout/success-step.html:43-53` renders that state with an
`ErrorState` whose action is a navigation rather than a retry.

**Thumbnails are text buttons.** `src/app/features/product/product-gallery.html:45-61`:

```html
              <span class="thumb-mark" aria-hidden="true">{{ thumbLabel(i) }}</span>
              <span class="thumb-check" aria-hidden="true">✓</span>
```

with `thumbLabel(index)` returning `${index + 1}`
(`src/app/features/product/product-gallery.ts:165-171`). There is no `<img>` anywhere in
the row, which is exactly what the browser runs saw: a check box and a "2" box.

## What to change

**1. Read the query parameters correctly — `src/app/features/product/product-page.ts`.**
Add one private helper and use it at both call sites (`:190` and `:205`), copying the
idiom the catalogue already uses at `catalog-page.ts:665-668`:

```ts
  /** `ParamMap` has no `toString()`; build the search params from its keys. */
  private toSearchParams(map: ParamMap): URLSearchParams {
    const search = new URLSearchParams();
    map.keys.forEach((key) => {
      for (const value of map.getAll(key)) search.append(key, value);
    });
    return search;
  }
```

Add `ParamMap` as a type-only import to the `@angular/router` import line
(`product-page.ts:11`, which imports `ActivatedRoute` today):
`import { ActivatedRoute, Router, type ParamMap } from '@angular/router';`

**2. Write the variant back to the URL — same file.** Inject the router
(`private readonly router = inject(Router);` beside the existing injections at `:86-89`)
and navigate after each selection, reusing the encoder the facade already exposes:

```ts
  onColorChange(colorCode: string): void {
    this.facade.selectColor(colorCode);
    this.syncVariantQuery();
  }

  onStorageChange(storageGb: number): void {
    this.facade.selectStorage(storageGb);
    this.syncVariantQuery();
  }

  /** Mirror the current selection into `?variant=` so a reload and a
   *  shared link restore it (screens.md S3 route contract). */
  private syncVariantQuery(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { variant: this.facade.currentVariantParams().get('variant') },
      queryParamsHandling: 'merge',
      replaceUrl: false,
    });
  }
```

`replaceUrl: false` matches the catalogue's own URL mirror (`catalog-page.ts:687`), so
Back returns to the previously selected variant.

**3. Do not let that navigation re-fetch the product.** The `queryParamMap` subscription
(`product-page.ts:202-207`) calls `facade.load()` on every emission, and `load()` resets
the status to `loading` and clears the product (`product.facade.ts:142-144`), so without a
guard every swatch click would flash the skeleton. Skip the reload when the incoming
variant is the one already applied:

```ts
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((queryParamMap) => {
      const slug = this.slug() || this.route.snapshot.paramMap.get('slug') || '';
      if (slug.length === 0) return;
      const incoming = queryParamMap.get('variant');
      const applied = this.facade.currentVariantParams().get('variant');
      if (slug === this.currentSlug() && incoming !== null && incoming === applied) return;
      this.facade.load(slug, this.toSearchParams(queryParamMap));
    });
```

**4. Give not-found its own state — `src/app/features/product/product.facade.ts`.**

- `:62` — `export type ProductStatus = 'idle' | 'loading' | 'success' | 'notfound' | 'error';`
- add an exported pure helper beside `describeError` (`:88-93`), so it can be unit-tested
  without TestBed:

```ts
/** True when the SDK error is a 404 — an unknown slug, not a transient failure. */
export function isProductNotFound(err: unknown): boolean {
  return err instanceof HttpErrorResponse && err.status === 404;
}
```

  importing `HttpErrorResponse` from `@angular/common/http`, the same import the cart and
  checkout facades already use (`src/app/features/cart/cart.facade.ts:28`).
- in the `catchError` at `:161-163`, carry the flag:
  `of({ kind: 'err' as const, error: describeError(err), notFound: isProductNotFound(err) })`
- in the subscriber's error branch (`:170-172`), set
  `this.statusSignal.set(event.notFound ? 'notfound' : 'error');` and keep the existing
  `errorSignal` write.

**5. Render it — `src/app/features/product/product-page.ts` and `product-page.html`.**
Widen the page's state computed (`product-page.ts:99-104`). Its generic annotation must
widen too — `readonly state = computed<'loading' | 'error' | 'success'>(...)` becomes
`readonly state = computed<'loading' | 'error' | 'success' | 'notfound'>(...)` — or the
new branch is a type error:
`if (v.status === 'notfound') return 'notfound';`. Add the two members the new branch
needs, and add the template case.

```ts
  readonly notFoundMessage = computed<string>(() => {
    const slug = this.currentSlug();
    return slug.length > 0
      ? `A(z) „${slug}” azonosítójú termék nem található. Nézd meg a telefonok listáját.`
      : 'A keresett termék nem található. Nézd meg a telefonok listáját.';
  });

  onBackToCatalog(): void {
    void this.router.navigate(['/telefonok']);
  }
```

```html
          @case ('notfound') {
            <app-error-state
              [title]="'A termék nem található'"
              [message]="notFoundMessage()"
              [retryLabel]="'Vissza a telefonokhoz'"
              [pending]="false"
              [preserving]="true"
              (retryRequested)="onBackToCatalog()"
            ></app-error-state>
          }
```

The message is modelled on the repository's existing not-found copy
(`src/app/features/checkout/success-step.ts:135-139`) and the action label is the S4.5 CTA
string from `docs/spec/screens.md:91`; neither is invented here. The existing
`@case ('error')` block (`product-page.html:10-19`) stays exactly as it is — that is the
transient-failure state, and it keeps its retry.

**6. Tests.**

- `tests/product-page.spec.ts` (runs today, node environment, source-text style): assert
  that `product-page.ts` no longer contains `queryParamMap.toString()`, that it navigates
  with `queryParams` from `onColorChange`/`onStorageChange`, and that the template carries
  a `@case ('notfound')` distinct from `@case ('error')`.
- `tests/variant-selection.spec.ts` or `tests/product-page.spec.ts`: import
  `isProductNotFound` and assert it returns `true` for an `HttpErrorResponse` with
  `status: 404` and `false` for `status: 503` and for a plain `Error`. This is a real
  behavioural test of a pure function and it runs today.

## Out of scope

- **The product page's missing content**: no breadcrumb
  (`nav[aria-label*="Breadcrumb"]` returns null while the catalogue has one), no
  description paragraph although `Product.description` exists on the wire model
  (`src/app/api/generated/models/product.ts`), no visible stock line although
  `Variant.availability` exists, and no simulation note near the CTA —
  all four required by `docs/spec/screens.md:57`. They are **not** fixed here: this task
  is the variant/state contract. **`FIX-45`** owns them.
- The add-to-cart control itself: `AddToCartControl` is orphaned and the inline CTA has no
  pending or success state (A3 finding 5) — `FIX-16` owns it.
- `ProductGallery` and `VariantSelector` input/output signature drift against
  `docs/spec/components.md:420-437` (A3 finding 6) — a contract decision, not this task.
- The mobile buy rail and the one-column collapse (`FIX-26`), the horizontal overflow at
  390 (`FIX-27`), and add-to-cart under touch emulation (`FIX-32`).
- The catalogue's own URL handling (`FIX-24`).
- Product-page copy and the badge text (`FIX-35`).

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

```bash
npm run build              # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does
                            # not fail this task, but the two spec files above must pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

At 1440, in this order:

1. Open `http://localhost:4200/telefonok/demo-one-5g`, click the 512 GB swatch, read
   `window.location.href`, then reload the page and read the rendered storage and price.
2. Open `http://localhost:4200/telefonok/demo-one-5g?variant=nonsense-variant-id` and read
   the page for an explanation and the CTA's `disabled` property.
3. Open `http://localhost:4200/telefonok/nincs-ilyen-telefon` and read the rendered
   state and its action.

This screen is not behind the cart, so a direct URL load is correct here — unlike any
`/penztar/*` route, which must be reached by clicking until `FIX-10` lands.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R17 applies and is central**: after a variant change the image, capacity, stock, price
  **and the URL** describe the same variant.
- **R18 applies**: URL state and rendered state agree, in both directions.
- **R19 applies**: not-found, request-error and loading become three distinct states.
- **R20 applies**: the not-found action's accessible name is "Vissza a telefonokhoz",
  written by this task to replace the misleading "Újrapróbálom" retry label; it reuses
  the unmodified, native `<button>`-based `app-button`/`app-error-state` components for
  keyboard operation and visible focus. AC06 confirms the name and a keyboard-only
  activation.
- **R11, R06, R21 and R03** were this task's while the thumbnail row was in it; they are
  **FIX-71**'s now, and its AC08 records them. This task marks them N/A with that as the
  one-sentence reason.
- **R14 applies**: the price shown after a variant switch comes from the API response, not
  from a local calculation.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01, R02, R04, R05, R07–R10, R12, R13, R15, R16, R22–R25: N/A — this change introduces
  no brand asset, colour, font, copy claim, provider mix, narrow-layout rework, modal or
  handoff artefact.

## Acceptance criteria

- [ ] **FIX-23-AC01** At 1440 on `/telefonok/demo-one-5g`, clicking the 512 GB swatch
      changes `window.location.search` so that it contains the id of the 512 GB variant,
      and the displayed price changes from 339 990 to 378 390 (the values measured in the
      browser run).
- [ ] **FIX-23-AC02** Reloading the page after AC01 renders the 512 GB variant: the
      storage text, the price and the image alt all belong to the same variant the URL
      names.
- [ ] **FIX-23-AC03** Clicking a swatch does not put the page through its loading state.
      Arm a `MutationObserver` on the product page's root element before the click, with
      `{ childList: true, subtree: true, attributes: true }` — `subtree` is required
      because `[data-testid="product-loading"]` is a descendant rather than a child
      (`src/app/features/product/product-page.html:6`) — and record every added node
      matching that selector. It records zero appearances between the click and the price
      text updating. Before trusting a zero, prove the observer can see the element at
      all: reload with it on screen and confirm the same observer reports it.
- [ ] **FIX-23-AC04** `/telefonok/demo-one-5g?variant=nonsense-variant-id` renders a
      visible explanation naming the unusable variant, and the "Kosárba teszem" button's
      `disabled` property is `true` (E046, `docs/spec/screens.md:61`).
- [ ] **FIX-23-AC05** Selecting a valid colour and storage on that same page clears the
      explanation and enables the button, proving the block lifts on a valid selection.
- [ ] **FIX-23-AC06** `/telefonok/nincs-ilyen-telefon` renders the not-found state: the
      heading is "A termék nem található", the action navigates to `/telefonok` when
      clicked, and the text "Újrapróbálom" is **not** present (E042,
      `docs/spec/screens.md:65`). The action's accessible name is "Vissza a
      telefonokhoz"; confirm it in the accessibility tree, then focus it with `Tab` and
      activate it with `Enter` and confirm the same navigation happens, proving the
      native `<button>` this task reuses is keyboard-operable (R20).
- [ ] **FIX-23-AC07** A transient failure still renders the retry state, and it is
      triggered deterministically rather than by network emulation. **DevTools offline
      does not work here**: MSW is a service worker that answers
      `GET /api/v1/products/:slug` from a handler without touching the network, and
      `src/mocks/scenarios.ts:61-82` declares only `default`, `happy-path`,
      `out-of-stock` and `payment-declined` — there is no error scenario to name.
      The application uses `provideHttpClient(withFetch())`
      (`src/app/app.config.ts:26`), so the trigger is a patched `window.fetch` in the
      page, which rejects before the service worker is reached. Run it in this order,
      in one browser session, and record each step:

      1. Open `http://localhost:4200/telefonok` and wait for the grid. **Do not start on
         the product page**: a full page load re-creates `window.fetch` and discards the
         patch.
      2. Evaluate:
         ```js
         () => {
           const original = window.fetch;
           window.__miboltRestoreFetch = () => { window.fetch = original; };
           window.fetch = (input, init) => {
             const url = typeof input === 'string' ? input : input.url;
             if (url.includes('/api/v1/products/')) {
               return Promise.reject(new TypeError('Failed to fetch'));
             }
             return original(input, init);
           };
           return 'patched';
         }
         ```
      3. Click a product card — an in-app router navigation, which keeps the patch.
         Confirm the page renders `[data-testid="error-state"]`, that it contains the
         `Újrapróbálom` action, and that the not-found heading this task adds is
         **absent**. Screenshot it and record the rendered message.
      4. Click `Újrapróbálom` once with the patch still in place: the error state must
         come back, which is what proves the action is live rather than decorative.
      5. Evaluate `() => window.__miboltRestoreFetch()`, click `Újrapróbálom` again, and
         confirm the product renders. Screenshot it.
      6. `list_console_messages` — the rejected request will have logged; record what it
         logged and confirm nothing else errored.

      Step 5 is not optional: leaving a patched `fetch` in the page would poison every
      later criterion in the same session.
- [ ] **FIX-23-AC08, FIX-23-AC09** *(moved)* The thumbnail row's rendered `<img>`, its
      44 × 44 target size and its non-colour selection indicator are **FIX-71**'s
      AC01–AC04.
- [ ] **FIX-23-AC10** `tests/product-page.spec.ts` asserts the absence of
      `queryParamMap.toString()` and the presence of a distinct `@case ('notfound')`; a
      test asserts `isProductNotFound` returns `true` for a 404 and `false` for a 503;
      `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/product-page.spec.ts tests/variant-selection.spec.ts` instead.
- [ ] **FIX-23-AC11** `npm run build` exits 0.

## Commit

This task is exactly one commit. Do not bundle it with any other FIX task. The three
defects ship together because they are one broken query-parameter path seen three ways:
the same unread `ParamMap` at `product-page.ts:190` and `:205` produces all three
symptoms, and one fix closes them. The gallery thumbnail row was a fourth defect here
until it was split out as **FIX-71**; it shares no file, no cause and no spec file with
these three, and "verified in the same browser pass" is convenience rather than a shared
cause.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: product page variant URL round-trip and not-found state
```
