# Change chains

File-by-file step lists for the storefront changes that span more than one
file. Paths are relative to the repository root. Each chain starts from the
same first step: find an existing instance of the same kind of thing and trace
it with `git grep -n <identifier> -- frontend/projects/storefront/src frontend/projects/shop-mocks/src`,
because the instance shows every place the new one has to reach.

## Contents

1. Catalogue filter
2. Product-page field
3. Checkout field or step
4. Route or page
5. UI primitive
6. Error, conflict and expiry handling
7. User-facing copy and prices

## 1. Catalogue filter

The URL is the single source of truth for the catalogue query, which is what
makes a filter survive a reload. Trace the existing `is5g` filter for a
boolean, `storageGb` for a fixed set of values, and `brands` for a free list.

1. **SDK parameter.** The parameter must already exist on `listProducts` in
   `frontend/projects/shop-api/src/generated/`. If it does not, the contract
   changes first, in `mibolt-cross-package-changes`.
2. **URL codec**, `frontend/projects/storefront/src/app/features/catalog/catalog-query.ts`:
   the field on `CatalogQuery`, and on `CatalogFilters` when the filter panel
   edits it; parsing in `parseCatalogQuery`; the key in `CATALOG_QUERY_KEYS`;
   writing in `serializeCatalogQuery`; the chip in `buildChips`. A literal
   union gets a guard in the style of `isStorageBucket`.
3. **Facade**, `frontend/projects/storefront/src/app/features/catalog/catalog.facade.ts`:
   `queryEquals` and `toSdkParams`, plus a setter in the style of `setIs5g`.
4. **Controls.** Both the desktop panel
   (`frontend/projects/storefront/src/app/features/catalog/filter-panel.ts` and
   its `.html`) and the mobile drawer
   (`frontend/projects/storefront/src/app/features/catalog/filter-drawer.ts` and
   its `.html`) carry the control. The drawer edits a draft that only Apply
   emits.
5. **Chips.** `FilterIdentity`
   (`frontend/projects/storefront/src/app/shared/types/filter-identity.ts:14-17`)
   names a chip by `keyof CatalogFilters` plus `'q'` and `'featured'`, so a
   field step 2 put on `CatalogFilters` is already a chip name, and only a
   filter kept off `CatalogFilters` adds its literal there. Add a `case` to
   `CatalogPage.onChipRemoved`
   (`frontend/projects/storefront/src/app/features/catalog/catalog-page.ts:286`).
   `AppliedFilters` only renders what it is given.
6. **Mock.** Parse and apply the parameter in
   `frontend/projects/shop-mocks/src/catalog/catalog-filter.ts`, which lists
   every contract parameter it accepts, and add its facet count in
   `frontend/projects/shop-mocks/src/catalog/catalog-facets.ts` if the
   control shows one.
7. **Specs**: the co-located `*.spec.ts` of every file above, including the
   applied-filter chips' spec, and
   `frontend/projects/shop-mocks/src/catalog/catalog-mock.spec.ts`.

## 2. Product-page field

1. **Wire and fixture.** A field new on the wire is a contract change, and a
   value new in the catalogue data changes
   `frontend/docs/api/fixtures/catalog.json`; both belong to
   `mibolt-cross-package-changes`.
2. **Mock store**, `frontend/projects/shop-mocks/src/catalog/catalog-store.ts`:
   `isProduct` checks a fixed field list, and `toCatalogItem` copies
   list-item fields one by one, so a field the catalogue list shows must be
   added there.
3. **Facade**, `frontend/projects/storefront/src/app/features/product/product.facade.ts`:
   `ProductVm` and `buildVm()`, when the field feeds a derived value.
4. **Selection rules**,
   `frontend/projects/storefront/src/app/features/product/variant-selection.ts`,
   when the field changes which variant can be chosen or bought. Every
   function exported there is pure.
5. **Render** in `frontend/projects/storefront/src/app/features/product/product-page.html`
   or the sub-component that owns that part of the page: `VariantSelector`,
   `ProductGallery`, `SpecificationAccordion`, `AddToCart` or
   `MobileBuyRail`.
6. **Specs**: the co-located `*.spec.ts` of the page, the selection rules and
   the sub-component. The two product-page specs build their product from
   `frontend/projects/storefront/src/app/features/product/demo-product.fixture.ts`,
   which has to carry a new required field.

## 3. Checkout field or step

1. **Form model.** Contact fields are validated by `contactFormSchema` in
   `frontend/projects/storefront/src/app/features/checkout/contact.schema.ts`,
   the rest of the wizard by `checkoutFormSchema` over `CheckoutFormModel` in
   `frontend/projects/storefront/src/app/features/checkout/checkout-form.model.ts`.
   Both are Signal Forms schemas, and the model is deliberately wider than
   the wire payload (the header of the model file says how).
2. **Step and page.** The step component (`ContactStep`, `DeliveryStep`,
   `ReviewStep`) renders the field; the page component beside it
   (`ContactPage`, `DeliveryPage`, `ReviewPage`) calls the facade and handles
   the result.
3. **Facade.** The four section writes, `updateContact`, `updateBilling`,
   `updateDelivery` and `updatePayment`, all go through the private `patch()`
   (`frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts:319-362`).
   A new section needs `UpdateCheckoutRequest` to carry it, which is a
   contract change.
4. **Server errors.** A 422 carries `fieldErrors` addressed by JSON pointer.
   The contact step maps them with `pointerToFieldKey`
   (`frontend/projects/storefront/src/app/features/checkout/contact.schema.ts:70`)
   and `toContactFieldErrors`
   (`frontend/projects/storefront/src/app/features/checkout/contact-server-errors.ts:68`).
5. **Guards.** A section the review step requires is checked in `reviewGuard`
   (`frontend/projects/storefront/src/app/features/checkout/checkout.guards.ts:222-239`).
6. **A new step** also needs a route entry in
   `frontend/projects/storefront/src/app/features/checkout/checkout.routes.ts`
   with `CheckoutLayout`, its `data.step` and a `canMatch` guard; a member in
   `CheckoutStep` and the step list in
   `frontend/projects/storefront/src/app/layouts/checkout-layout.ts`; and a
   case in `stepPath` in the guards file.
7. **Mock.** `PATCH /checkout` is handled in
   `frontend/projects/shop-mocks/src/checkout/checkout.handlers.ts`, validated
   in `frontend/projects/shop-mocks/src/checkout/validate-checkout.ts`, and
   stored in `frontend/projects/shop-mocks/src/checkout/checkout-store.ts`. A
   new draft field that must survive a reload also changes
   `PersistedCheckoutDraft`
   (`frontend/projects/shop-mocks/src/persistence.ts:70`), and with it the
   snapshot schema.
8. **Specs**: the co-located specs of the step, the page, the facade and the
   guards, the wizard-level
   `frontend/projects/storefront/src/app/features/checkout/checkout-flow.spec.ts`,
   and `frontend/projects/shop-mocks/src/checkout/checkout-mock.spec.ts`.

## 4. Route or page

1. Add the entry to `frontend/projects/storefront/src/app/app.routes.ts` as a
   `loadComponent` with a `title`, under the layout the page belongs to, with
   `demoAccessGuard` unless the page is meant to be open like `/belepes`, and
   before the `**` entry. A checkout page goes into
   `frontend/projects/storefront/src/app/features/checkout/checkout.routes.ts`
   instead (chain 3).
2. Create the feature's folder under
   `frontend/projects/storefront/src/app/features/`, named after the feature
   as `catalog/` and `product/` are, with the page, a `@Service()` facade if
   the page holds server state, and specs.
3. Link it from the header or footer in
   `frontend/projects/storefront/src/app/core/navigation/` where the shopper
   should reach it.
4. The route table is covered by
   `frontend/projects/storefront/src/app/app.spec.ts`,
   `frontend/projects/storefront/src/app/layouts/layouts.spec.ts` and
   `frontend/projects/storefront/src/app/cart-shortcut-redirect.spec.ts`.

## 5. UI primitive

1. The primitive's folder under
   `frontend/projects/storefront/src/app/shared/ui/` holds its `.ts`, `.html`,
   `.scss` and `.spec.ts`. Export it from
   `frontend/projects/storefront/src/app/shared/ui/index.ts`.
   `frontend/projects/storefront/src/app/shared/ui/ui-states.spec.ts` and
   `frontend/projects/storefront/src/app/features/primitives-showcase/primitives-showcase.ts`
   both consume the primitives through that barrel.
2. Take every value from a token in
   `frontend/projects/storefront/src/styles/tokens.css` or a recipe in
   `frontend/docs/design/yettel.md`. A value neither carries is measured on
   `frontend/docs/design/yettel/css/portal.css` and added to
   `frontend/docs/design/yettel.md` before it is used, as Design authority in
   [SKILL.md](../SKILL.md) says.
3. Find every consumer by class name and by element selector (`app-<name>`)
   before changing an input or output.
4. The production build budgets every component stylesheet
   (`anyComponentStyle` in `frontend/angular.json`): a warning at 4 kB, an
   error at 8 kB.

## 6. Error, conflict and expiry handling

1. **Mapping.** Each mutating facade turns an `HttpErrorResponse` into a typed
   error in a module-level `mapError`
   (`frontend/projects/storefront/src/app/features/cart/cart.facade.ts:569`,
   `frontend/projects/storefront/src/app/features/checkout/checkout.facade.ts:795`),
   narrowing the body with `isRecord` and never with a cast.
2. **Routing.** The private `recordFailure` of each facade sends a 412 to
   `conflict`, a 410 to `cartExpired` and anything else to `error`. It keeps
   the first failed intent for `retry()` and fires a background refetch on
   412. Change the branch there, not in the pages.
3. **Price change.** A 409 `PRICE_CHANGED` on the order goes through
   `recordPriceChange`, which arms `priceChange`. The submit stays disabled
   until `confirmPriceChange()` runs; `ReviewPage` and `ReviewStep` render it.
4. **Surfaces.** `CartPage`, `ProductPage`, `ReviewPage` and `ReviewStep` read
   `error`, `conflict`, `cartExpired` and `priceChange`, and render them with
   shared primitives such as `StatusMessage` and `ErrorState`.
5. **Reproduce.** In a unit spec, override one route with
   `server.use(http.<method>(...))` returning the Problem, as
   `frontend/projects/storefront/src/app/features/checkout/checkout-facade.spec.ts:558`
   does for a 412 on `PATCH /checkout` and
   `frontend/projects/storefront/src/app/features/checkout/checkout-facade.spec.ts:717`
   for a 410. In the browser, `?mi-scenario=fail-<operation>` and its sibling
   fault scenarios fail one endpoint on demand; `FAULT_OPERATIONS`
   (`frontend/projects/shop-mocks/src/faults.ts:64`) lists the operations.

## 7. User-facing copy and prices

- **Copy** is Hungarian, written as string literals in the page or component
  that shows it; there is no i18n pipeline. The add-to-cart refusal sentences,
  the quantity-limit one included, are built in `describeAddFailure`
  (`frontend/projects/storefront/src/app/features/product/product-page.ts:59`)
  from the error's `code` and `params`. A cart line shows its quantity as text
  and has no quantity control
  (`frontend/projects/storefront/src/app/features/cart/cart-line.ts:11-13`),
  so the product page is the only place a shopper meets the quantity limit.
  The cart page builds its sentences in
  `frontend/projects/storefront/src/app/features/cart/cart-page.ts`:
  `describeCartError` for a failed load or an expired cart, `describeNotice`
  for the `QUANTITY_REDUCED`, `ITEM_REMOVED` and `PRICE_CHANGED` notices,
  `statusMessage` for the banners after a failed change, a conflict or an
  expiry, and the `transientStatus` writes in the page's handlers for the
  progress, success and changed-cart lines. A
  Problem's `title` and `detail` are English developer text and are never
  shown (`contracts/commerce/kommunikacio.md` §6).
- **Prices.** `PriceBlock.formatHuf`
  (`frontend/projects/storefront/src/app/shared/ui/price-block/price-block.ts:68`)
  is the storefront's price formatter: it groups whole forints with a
  non-breaking space, `PriceBlock` renders every price through it, and
  `ReviewStep` calls it directly. The catalogue's minimum and maximum price
  chips are the exception, formatted with `toLocaleString('hu-HU')` in
  `buildChips`. The payment app formats with `CurrencyPipe` under the
  `hu-HU` locale registered in
  `frontend/projects/demo-payment/src/main.ts:14`.
- Changing a visible sentence or a `data-testid` can break end-to-end specs:
  every spec under `frontend/e2e/integration/` locates elements by test id,
  and most also by text or role.
