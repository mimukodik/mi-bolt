# Product form and product list

The product create and edit screen and the Termékek list, with the change chain for a new field,
a new list filter and a new list column. Paths resolve as `SKILL.md` says.

## Contents

1. The edit page
2. Model, mapper and schema
3. Sections and error display
4. Chain: a new product field
5. The list keeps its state in the URL
6. Filters, sort, columns and row actions
7. Chain: a new list filter
8. Chain: a new list column

## 1. The edit page

- `frontend/projects/admin/src/app/features/products/products.routes.ts` ("m.ProductEditPage")
  routes `uj` (create) and `:productId` (edit) to `ProductEditPage`. The parameter arrives through
  the page's `productId` input
  (`frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`, "readonly
  productId = input").
- The page provides `ProductEditStore`, `SubmitAttempt` and `UploadTracker`
  (`frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`, "providers:
  [ProductEditStore, SubmitAttempt, UploadTracker]"), loads the featured count and the brand list on
  creation, and resets the form from `toFormModel(product)` after every load
  (`frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`, "private async
  open(").
- Its `view` is `form`, `loading`, `not-found` or `error`; an id that is not a positive integer
  is `not-found` without a request
  (`frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`, "protected
  readonly view = computed").
- Mentés runs through `SubmitAttempt.run`, calls `create` or `save`, and switches on `SaveResult`
  (`frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`, "private async
  save()"): `saved` shows a snack-bar and, after a create, navigates to the new product's URL;
  `invalid` maps the field errors onto the form; `conflict` reads a generation-guarded server snapshot, opens `ConflictDialog` with field differences, preserves input and updates only the version after explicit comparison;
  `failed` shows a snack-bar, with its own text for `VARIANT_IN_CART`.
- Mentés is disabled while the form submits, after a failed attempt until the form is valid, and
  while an image uploads
  (`frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`, "saveDisabled").
- The slug turns read-only once the product exists, because the backend rejects a changed slug
  with `SLUG_IMMUTABLE`
  (`frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`, "private readonly
  slugLocked").
- The form's `dirty()` is set only when a bound control writes a value or `markAsDirty()` is
  called (https://angular.dev/api/forms/signals/FieldState; in the installed `@angular/forms`
  a bound control writes `controlValue`, which marks the field dirty, and a write to
  `value` does not), and every `form().reset(...)` clears it. The cards with rows (highlights,
  colours, variants and spec groups) add and remove rows, and all but the variants card also move
  them, through `value.update(...)`, for example
  `frontend/projects/admin/src/app/features/products/edit/sections/colors-section.ts`
  ("value.update"), and the slug button and the swatch picker write through `value.set(...)`
  (`frontend/projects/admin/src/app/features/products/edit/sections/basics-section.ts`,
  "generateSlug()";
  `frontend/projects/admin/src/app/features/products/edit/sections/colors-section.ts`,
  "setSwatch("), so none of these marks the form dirty. A create navigates to `/termekek/<id>`
  without a reset (`frontend/projects/admin/src/app/features/products/edit/product-edit-page.ts`,
  "router.navigate(['/termekek', result.product.id]"). Anything that reads `dirty()`, a leave-page
  warning above all, accounts for both.

## 2. Model, mapper and schema

- `frontend/projects/admin/src/app/features/products/edit/product-form.model.ts` holds
  `ProductFormModel` and its row models. Every row carries a `key` from `newKey()`, used for
  `@for` tracking and for a variant's link to its colour; a key never reaches the wire.
  `emptyProductForm()` is the create-mode start value.
- `frontend/projects/admin/src/app/features/products/edit/product-form.mapper.ts`:
  - `toFormModel(product)` reads an `AdminProduct` into the model, with `releasedAt` at local
    midnight and each variant's colour looked up by code.
  - `toProductInput(model)` builds the `AdminProductInput`. It throws on a `null` the schema
    should have blocked instead of sending it, and derives each variant's `slug` with
    `variantSlug` (`frontend/projects/admin/src/app/features/products/edit/variant-id.ts`, "function
    variantSlug").
  - `toModelPointer(pointer)` rewrites a 422 pointer into the request body onto the model's path
    where the two differ, for example `/colors/N/imageId` onto `/colors/N/image`.
- `frontend/projects/admin/src/app/features/products/edit/product-form.schema.ts` ("function
  productFormSchema"), `productFormSchema(context)`, holds every client-side limit: lengths,
  patterns, integers and ranges, list minimums and maximums, and the four-featured cap through
  `context.featuredOthers`. It also raises four backend field codes on the client, before any
  request: `DUPLICATE_COLOR_CODE`, `DUPLICATE_VARIANT`, `UNKNOWN_COLOR`, and `VARIANT_ID_TOO_LONG`
  against `MAX_VARIANT_ID` (`frontend/projects/admin/src/app/features/products/edit/variant-id.ts`,
  "export const MAX_VARIANT_ID").

The Signal Forms rules used here are documented at
https://angular.dev/guide/forms/signals/validation, cross-field rules at
https://angular.dev/api/forms/signals/validateTree.

## 3. Sections and error display

`frontend/projects/admin/src/app/features/products/edit/product-edit-page.html` ("@case ('form')")
lays out five numbered sections and three side cards. The components are in
`frontend/projects/admin/src/app/features/products/edit/sections/`. The header comment of
`frontend/projects/admin/src/app/features/products/edit/sections/basics-section.ts` ("Stub: F20
writes the fields") still calls the section a stub whose fields a later unit (F20) writes; the
fields are implemented, and
`frontend/projects/admin/src/app/features/products/edit/sections/basics-section.html` binds all six
with `[formField]`.

| Card | Component | Model fields |
|---|---|---|
| 1 Alapadatok | `BasicsSection` | `name`, `brand`, `slug`, `description`, `releasedAt`, `is5g` |
| 2 Kiemelések | `HighlightsSection` | `highlights` |
| 3 Színek és képek | `ColorsSection` | `colors`: `code`, `name`, `swatchHex`, `alt`, `image` |
| 4 Változatok | `VariantsSection` | `variants`: `colorKey`, `storageGb`, `price`, `stock` |
| 5 Specifikáció | `SpecGroupsSection` | `specGroups` and their `rows` |
| Megjelenítés | `DisplayCard` | `featured`, `rank`, `popularityScore` |
| Előnézet, Adatok | `SectionCard`, inline | read-only |

- A section counts its fields' errors after an attempt from an explicit list, for example
  `frontend/projects/admin/src/app/features/products/edit/sections/basics-section.ts` ("errorCount")
  and `frontend/projects/admin/src/app/features/products/edit/sections/display-card.ts`
  ("errorCount"). A new field joins its section's list, or its errors are missing from the card
  header's count.
- A control inside a `mat-form-field` shows `errors()[0]?.message` in `mat-error`. A control
  outside one, such as a slide toggle or the image upload, gets `adm-control-error`
  (`frontend/projects/admin/src/app/shared/forms/control-error.ts`).
- The image upload is a custom Signal Forms control,
  `ImageUpload implements FormValueControl<Image | null>`
  (`frontend/projects/admin/src/app/shared/image-upload/image-upload.ts`, "class ImageUpload
  implements FormValueControl"), bound with `[formField]` like a native input
  (https://angular.dev/guide/forms/signals/custom-controls#formvaluecontrol).
- A 400 or 422 answer with field errors reaches the fields through `toServerErrors(form, errors)`
  (`frontend/projects/admin/src/app/shared/forms/server-errors.ts`, "export function
  toServerErrors"); an error whose pointer does not resolve lands on the form root.

## 4. Chain: a new product field

A field the generated `AdminProduct` and `AdminProductInput` do not carry yet starts in
`mibolt-cross-package-changes`: the contract, then the regenerated client. Once the models under
`frontend/projects/admin/src/app/api/generated/models/` have it, work in this order:

1. `frontend/projects/admin/src/app/features/products/edit/product-form.model.ts`: the field in
   `ProductFormModel` and in `emptyProductForm()`.
2. `frontend/projects/admin/src/app/features/products/edit/product-form.mapper.ts`: read it in
   `toFormModel`, write it in `toProductInput`, and add a `toModelPointer` rule only if its wire
   path differs from its model path.
3. `frontend/projects/admin/src/app/features/products/edit/product-form.schema.ts`: its
   validators, with the contract's limits.
4. `frontend/projects/admin/src/app/shared/forms/messages.ts`: any new `MESSAGES` entry, and a
   `SERVER_FIELD_MESSAGES` entry for any new backend field code.
5. The owning card's component and template under
   `frontend/projects/admin/src/app/features/products/edit/sections/`: the control bound with
   `[formField]`, a `mat-hint` length counter where the card shows them, `adm-control-error`
   outside a `mat-form-field`, and the field in the card's error-count list.
6. The write mock, `frontend/projects/admin/src/mocks/products-write.handlers.ts`: the member
   allow-list `TOP_MEMBERS` (`frontend/projects/admin/src/mocks/products-write.handlers.ts`, "const
   TOP_MEMBERS"), `readProductInput`
   (`frontend/projects/admin/src/mocks/products-write.handlers.ts`, "async function
   readProductInput"), `beanValidationErrors`
   (`frontend/projects/admin/src/mocks/products-write.handlers.ts`, "function
   beanValidationErrors"), `validatorErrors`
   (`frontend/projects/admin/src/mocks/products-write.handlers.ts`, "function validatorErrors") if
   the backend validator checks it, `toAdminProductInput`
   (`frontend/projects/admin/src/mocks/products-write.handlers.ts`, "function toAdminProductInput")
   and `buildProduct` (`frontend/projects/admin/src/mocks/products-write.handlers.ts`, "function
   buildProduct"). If seeded products carry it, `seedCatalog` in
   `frontend/projects/admin/src/mocks/seed.ts` ("export function seedCatalog"); if the list shows
   it, chain 8.
7. Specs: `frontend/projects/admin/src/app/features/products/edit/product-form.mapper.spec.ts`,
   `frontend/projects/admin/src/app/features/products/edit/product-form.schema.spec.ts`, the
   card's spec, `frontend/projects/admin/src/app/features/products/edit/product-edit-page.spec.ts`,
   and the write mock's specs, whose validation cases are in
   `frontend/projects/admin/src/mocks/products-write.validation.spec.ts`. The spec helper `inputOf`
   (`frontend/projects/admin/src/testing/mock-spec-helpers.ts`, "export function inputOf") rebuilds
   an `AdminProductInput` field by field, so it carries the new field too.

## 5. The list keeps its state in the URL

- The router query string is the only state of the list's filters and sort
  (`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`,
  "router query codec for the Termékek list";
  `frontend/projects/admin/src/app/features/products/list/product-list.store.ts`,
  "The URL query string is the single source of truth"). Hold no
  filter in a component field or a store field. Both headers give a line of
  `frontend/docs/spec/architecture.md` as the source of this rule, writing the path relative to
  `frontend/`; that line now describes request cancellation and write serialisation
  (`frontend/docs/spec/architecture.md`, "Read requests use switchMap to cancel obsolete HTTP"),
  so the code and this section are the source.
- `frontend/projects/admin/src/app/features/products/list/product-list.query.ts` is the codec:
  - `ProductListQuery`
    (`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, "export
    interface ProductListQuery") and `DEFAULT_PRODUCT_LIST_QUERY`
    (`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, "export const
    DEFAULT_PRODUCT_LIST_QUERY");
  - `parseProductListQuery`, lenient, with an unknown value falling back to the default
    (`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, "export
    function parseProductListQuery");
  - `serializeProductListQuery`, which omits defaults and sorts brands
    (`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, "export
    function serializeProductListQuery");
  - `toListParams`, the SDK parameters
    (`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, "export
    function toListParams");
  - `PRODUCT_LIST_QUERY_KEYS`
    (`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, "export const
    PRODUCT_LIST_QUERY_KEYS");
  - local literal-union guards in place of casts
    (`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, "Guard rather
    than cast").
- `ProductListStore.setQuery(patch)` merges and navigates. The store re-parses every
  `queryParamMap` emission, and a distinct query or a `retry()` builds a new
  `ProductListDataSource`, so a late page of an old query never lands in the new list
  (`frontend/projects/admin/src/app/features/products/list/product-list.store.ts`, "readonly
  dataSource").
- `ProductListDataSource`
  (`frontend/projects/admin/src/app/features/products/list/product-list.data-source.ts`, "export
  class ProductListDataSource") requests page 1 on connect and then the pages the virtual-scroll
  viewport asks for, 50 rows per page (`PRODUCT_LIST_PAGE_SIZE`,
  `frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, "export const
  PRODUCT_LIST_PAGE_SIZE"), into a sparse cache.
- The overview cards open the list with query parameters
  (`frontend/projects/admin/src/app/features/overview/overview.component.ts`, "const
  PRODUCT_FILTER_CARDS"); a renamed query key breaks those links.

## 6. Filters, sort, columns and row actions

- `ProductFilters`
  (`frontend/projects/admin/src/app/features/products/list/product-filters.ts`, "export class
  ProductFilters") takes the `query` and `filtered` inputs and emits `queryChange` with a partial
  query, or `clear`; it holds no filter state and loads the brand list once. Its chip handlers
  ignore an event whose `isUserInput` is false, because the programmatic `[selected]` write emits
  one too (`frontend/projects/admin/src/app/features/products/list/product-filters.ts`, "if
  (!event.isUserInput) return").
- `SORTABLE_COLUMNS`
  (`frontend/projects/admin/src/app/features/products/list/product-list-page.ts`, "const
  SORTABLE_COLUMNS") lists the headers `matSort` offers. `rank` is the default order with no active
  header, and `releasedAt` is not offered.
- The desktop header
  (`frontend/projects/admin/src/app/features/products/list/product-list-page.html`, "Műveletek") has
  ten columns: image, Név (name), Márka (brand), Színek (colours), Változatok (variants), Ár
  (price), Készlet (stock), Kiemelt (featured), Státusz (status), Műveletek (actions).
  The handset header
  (`frontend/projects/admin/src/app/features/products/list/product-list-page.html`, "@if
  (handset())") has four: image, Név, Státusz and the menu. The column widths are the
  `--adm-product-columns` variable, desktop at
  `frontend/projects/admin/src/app/features/products/list/product-list-page.css` (".adm-table {")
  and handset at `frontend/projects/admin/src/app/features/products/list/product-list-page.css`
  (".adm-table.adm-handset"), shared by the header and `ProductRow`
  (`frontend/projects/admin/src/app/features/products/list/product-row.css`, "grid-template-columns:
  var(--adm-product-columns)").
- `ProductRowActions`
  (`frontend/projects/admin/src/app/features/products/list/product-row-actions.ts`) confirms an
  archive through `openConfirm`
  (`frontend/projects/admin/src/app/shared/confirm-dialog/confirm-dialog.ts`, "function
  openConfirm"), offers Visszavonás on the snack-bar, and reports `conflict` (the list reloads),
  `featured-limit` and `failed`. Its `busy` signal keeps a second click from posting the same
  version again.

## 7. Chain: a new list filter

1. If `ListAdminProducts$Params` lacks the parameter, the contract changes first, through
   `mibolt-cross-package-changes`.
2. `frontend/projects/admin/src/app/features/products/list/product-list.query.ts`: the field in
   `ProductListQuery` and `DEFAULT_PRODUCT_LIST_QUERY`, its parsing, its serialising (default
   omitted), `toListParams` and `PRODUCT_LIST_QUERY_KEYS`.
3. `frontend/projects/admin/src/app/features/products/list/product-filters.ts` and
   `frontend/projects/admin/src/app/features/products/list/product-filters.html`: the control,
   emitting through `queryChange`.
4. `frontend/projects/admin/src/app/features/products/list/product-list-page.ts` ("readonly filtered
   = computed"): the `filtered` computed, so the empty state offers Szűrők törlése.
5. The read mock, `frontend/projects/admin/src/mocks/products-read.handlers.ts`:
   `KNOWN_QUERY_PARAMS` (`frontend/projects/admin/src/mocks/products-read.handlers.ts`, "const
   KNOWN_QUERY_PARAMS"), the conversion in `parseListQuery`
   (`frontend/projects/admin/src/mocks/products-read.handlers.ts`, "function parseListQuery"), a
   predicate beside `matchesFeatured`
   (`frontend/projects/admin/src/mocks/products-read.handlers.ts`, "function matchesFeatured"), and
   `filterAndSort` (`frontend/projects/admin/src/mocks/products-read.handlers.ts`, "function
   filterAndSort"). An unknown query key is a 400 there, as on the backend.
6. Specs: `frontend/projects/admin/src/app/features/products/list/product-list.query.spec.ts`,
   `frontend/projects/admin/src/app/features/products/list/product-filters.spec.ts`,
   `frontend/projects/admin/src/app/features/products/list/product-list-page.spec.ts` and
   `frontend/projects/admin/src/mocks/products-read.query.spec.ts`.

## 8. Chain: a new list column

1. The value comes from `AdminProductListItem`. If the generated model lacks it, the contract
   changes first, through `mibolt-cross-package-changes`.
2. The header cell in
   `frontend/projects/admin/src/app/features/products/list/product-list-page.html`, the row cell
   in `frontend/projects/admin/src/app/features/products/list/product-row.html`, and a width in
   `--adm-product-columns` for each layout that shows it. Copy an existing column's header cell
   and row cell as they stand, `role="columnheader"` and `role="cell"` included, so the new column
   matches its neighbours. Add no accessibility work beyond what the copied markup already
   carries, and remove no role an existing cell carries: `mibolt-frontend-code-standards`
   ("Accessibility") rules out work on ARIA, keyboard handling and AXE checks here. Add it to
   `SORTABLE_COLUMNS` only if the generated `AdminProductSortField` carries it, and then also to
   the codec's `SORT_VALUES`
   (`frontend/projects/admin/src/app/features/products/list/product-list.query.ts`, "const
   SORT_VALUES"), which the compiler does not check for completeness: a value missing there parses
   back to the default sort.
3. The read mock's projection `toListItem`
   (`frontend/projects/admin/src/mocks/products-read.handlers.ts`, "function toListItem"), and, if
   it sorts, `sortValue` (`frontend/projects/admin/src/mocks/products-read.handlers.ts`, "function
   sortValue") and both spellings of the field, the wire value and its constant name, in
   `SORT_VALUES` (`frontend/projects/admin/src/mocks/products-read.handlers.ts`, "const
   SORT_VALUES"), which otherwise answers 400.
4. Specs: `frontend/projects/admin/src/app/features/products/list/product-row.spec.ts`,
   `frontend/projects/admin/src/app/features/products/list/product-list-page.spec.ts` and
   `frontend/projects/admin/src/mocks/products-read.handlers.spec.ts`.
