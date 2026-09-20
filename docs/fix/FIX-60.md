# FIX-60 — Extract the four components the spec names, and give pagination its numbered pages

Status: PARTIAL — `AsyncContent`, `CatalogToolbar`, `AppliedFilters` and `Pagination` now exist as
the four `.ts`/`.html`/`.scss`/`.spec.ts` sets `components.md` names, each wired into
`catalog-page.ts`/`.html`, with pagination's numbered pages (AC01, AC04); `npm run build` and
`npm run test` exit 0 (AC05); commit 67f802a. `CatalogToolbar`'s mobile trigger initially lost its
`aria-expanded`/`aria-controls` in the extraction — a WCAG 4.1.2 regression flagged and then fixed
in a same-branch follow-up (commit `f95d065`),
which also completes AC12's disclosure duty for the `HeaderNav`/`AppHeader` drift against
`components.md:71-84`. Open: AC06–AC10 are real-browser checks (numbered pages, the async states,
chip removal, 390px layout) this task's author had no tool for, and AC11 (the four spec files'
content) was verified by reading the diff rather than a separate check; all are deferred to the
batched browser-verification pass.
Severity: major
Source: Review round item N7, carried over from round one: `FIX-16`'s out-of-scope section (A3 findings 3 and 4) and `FIX-24`'s out-of-scope section (A3 finding 3). `docs/spec/components.md:191-200`, `:356-365`, `:371-380`, `:386-395`. Decision **D1**.

## Why this is wrong

`docs/spec/components.md` is the component catalogue: every entry in it is a component the
application is specified to have, with a fixed owner, inputs, outputs, functions and
required states. **Four entries have no component at all.** `AsyncContent` (`:191`),
`AppliedFilters` (`:356`), `CatalogToolbar` (`:371`) and `Pagination` (`:386`) exist only
as markup inlined into `CatalogPage`, which is why `CatalogPage` is an 859-line file that
renders a toolbar, a chip row, five async states and a pager without a single one of them
being testable, reusable or replaceable on its own.

Decision **D1** settles it: *"`docs/` is the specification. Where the code differs from it,
the code is wrong and the fix task changes the code, never the spec."*

The fifth defect in this task is behavioural. `components.md:394` gives `Pagination` this
function: *"Previous/next **and numbered page navigation** with aria-current."* The live
control renders "Előző / 1 / 2 / Következő" as a single text span between two buttons.
There is no numbered navigation, so on a catalogue with more than two pages a user must
click through one page at a time.

**FIX-50** owns the five components whose signatures drift from their entries. **This task
owns the four that do not exist**, plus the one function the fourth of them is missing.

## Evidence

### The four missing components

`ls src/app/shared/ui/` returns `accessible-dialog`, `button`, `empty-state`,
`error-state`, `form-field-message`, `index.ts`, `loading-state`, `price-block`,
`product-image`, `quantity-control`, `status-message`, `ui-states.spec.ts` — no
`async-content`. `ls src/app/features/catalog/` returns `catalog-page.*`,
`catalog-query.ts`, `catalog.facade.ts`, `filter-drawer.*`, `filter-panel.*`,
`product-card.*` — no toolbar, no applied-filters, no pagination.

Their contracts, verbatim:

```
### AsyncContent — shared / T10
**Signal inputs:** `status:AsyncStatus; problem:UiProblem|null; hasPrevious:boolean`.
**Outputs:** `retryRequested:void`.
**Functions:** Distinct skeleton, error, empty, refresh and loaded presentation; previous usable data can remain under explicit refresh warning.
**Required states:** loading,refreshing,success,empty,error.

### AppliedFilters — catalogue / T13
**Signal inputs:** `query:CatalogQuery`.
**Outputs:** `filterRemoved:FilterIdentity; cleared:void`.
**Functions:** Named removable chips and clear-all, with accessible remove labels; no own filter source of truth.
**Required states:** default,selected,focus; no filters renders nothing.

### CatalogToolbar — catalogue / T13
**Signal inputs:** `total:number; sort:Sort; pageSize:12|24; status:AsyncStatus`.
**Outputs:** `sortChanged:Sort; pageSizeChanged:12|24; openFilters:void`.
**Functions:** Live result count, sort and page-size controls; mobile filter trigger with selected-count cue.
**Required states:** loading,ready,disabled,focus.

### Pagination — catalogue / T13
**Signal inputs:** `page:number; pageSize:number; total:number`.
**Outputs:** `pageChanged:number`.
**Functions:** Previous/next and numbered page navigation with aria-current; out-of-range handled by facade.
**Required states:** default,active,disabled,focus.
```

### The inlined markup, with the exact boundaries to extract

After **FIX-14** moves the inline template into its own file, the four regions of
`src/app/features/catalog/catalog-page.html` are:

| Component | Lines | First line of the region |
|---|---|---|
| `CatalogToolbar` | `:23-65` | `<div class="toolbar flex flex-wrap items-center justify-between gap-3">` |
| `AppliedFilters` | `:67-88` | `@if (appliedQuery().appliedChips.length > 0) {` |
| `AsyncContent` | `:90-144` | `<div class="grid gap-5" …>` with the `@switch (facade.vm().status)` inside it |
| `Pagination` | `:146-168` | `@if (shouldShowPagination()) {` |

### Pagination has no numbered pages

`src/app/features/catalog/catalog-page.html:152-166`:

```html
          <button
            type="button"
            class="page min-h-10 min-w-10 px-4 rounded font-inherit cursor-pointer"
            data-testid="pagination-prev"
            [disabled]="currentPage() <= 1 || isRefreshing()"
            (click)="onPageChanged(currentPage() - 1)"
          >Előző</button>
          <span class="page page--current font-bold cursor-default" aria-current="page">{{ currentPage() }} / {{ totalPages() }}</span>
          <button
            type="button"
            class="page min-h-10 min-w-10 px-4 rounded font-inherit cursor-pointer"
            data-testid="pagination-next"
            [disabled]="currentPage() >= totalPages() || isRefreshing()"
            (click)="onPageChanged(currentPage() + 1)"
          >Következő</button>
```

The design prototype builds the numbered form, and supplies the accessible-name pattern
and the `aria-current` placement. `docs/design/prototype.html:31`:

```js
<nav class="pagination" aria-label="Lapozás">${Array.from({length:pages},(_,i)=>`<button class="icon-button ${S.page===i+1?'selected':''}" data-page="${i+1}" aria-label="${i+1}. oldal" ${S.page===i+1?'aria-current="page"':''}>${i+1}</button>`).join('')}</nav>
```

**The prototype has no previous or next button and the specification requires both.** Under
**D1** the specification wins: `components.md:394` says *"Previous/next **and** numbered
page navigation"*, so the two existing buttons stay and the numbers are added between them.
The prototype is quoted here for the accessible name (`"<n>. oldal"`) and the
`aria-current` placement, not as the layout target.

### Three type mismatches this task must navigate, all measured

**1. `AsyncContent`'s `status:AsyncStatus` has no `refreshing`, and its required states do.**
`src/app/shared/ui/price-block/price-block.ts:3` declares
`AsyncStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error'`, matching
`components.md:7` exactly, while the catalogue's own
`src/app/features/catalog/catalog.facade.ts:61` declares
`CatalogStatus = 'loading' | 'refreshing' | 'success' | 'empty' | 'error'`.

**This is not a contradiction and needs no decision.** The entry's own Functions line
resolves it: *"previous usable data can remain under explicit refresh warning"*, and
`hasPrevious:boolean` is the third input. `refreshing` is the pair
`status === 'loading' && hasPrevious === true`. The catalogue maps `CatalogStatus` onto the
two declared inputs; it does not widen `AsyncStatus`.

**2. `FilterIdentity` cannot name two of the eight chips, and this one IS a contradiction.**
`components.md:7` declares `FilterIdentity = {name: keyof CatalogFilters; value?:string|number}`
and `CatalogFilters` has six keys: `brands`, `storageGb`, `minPrice`, `maxPrice`,
`inStock`, `is5g`. `catalog-page.ts:817-844`'s `buildChips` produces eight kinds, and the
other two cannot be named by that type:

- `q` — the search term. `components.md:7` puts `q` in `CatalogQuery`, not in
  `CatalogFilters`, so `keyof CatalogFilters` excludes it by construction.
- `featured` — `catalog-page.ts:840` reads `q.featured`, and `components.md:7`'s
  `CatalogQuery` declares no `featured` field at all. The code's query type has one
  (`catalog-query.ts`), the specification's does not.

**What this task does about it is in "What to change" item 3.** The user has already
decided it — **D16** widens `FilterIdentity` and **D21** extends `CatalogQuery` with
`featured?: boolean` (item 3, `:269-325`, carries both edits to `components.md:7`) — the
way **D11** settled `MobileBuyRail`'s missing `error` input. Nothing here is left for the
orchestrator to raise.

**3. The sort type is named `SortMode` in the code and `Sort` in the specification.**
`catalog-query.ts:22` declares `SortMode`; `components.md:7` and `:375` say `Sort`. Under
decision **D10** the specification's name wins, and **`FIX-65` owns that rename and lands
before this task** (`FIX-65.md:49-84` is its closed list of sites). By the time this task
runs, `catalog-query.ts:22` declares `Sort`, so the two components extracted below are
written against `Sort` from the start. Before starting, confirm with
`grep -c "^export type Sort " src/app/features/catalog/catalog-query.ts`, which must
print `1`; if it prints `0`, FIX-65 has not landed — stop and report.

## What to change

**Read this first: the seam, if this will not hold as one commit.** The package's rule is
one task, one commit, and this task is the largest of its round. Item 1 builds a shared
primitive that nothing else here depends on; items 2 to 5 rebuild one page around three
catalogue components. **If the work will not close as one reviewable commit, the seam is
between item 1 and item 2** — `AsyncContent` shipped with a spec file and no call site is
still a complete, testable unit, and the catalogue items then land as one. Do not split it
any other way, and do not split it at all without saying in the commit body why the single
commit did not hold. Splitting is a report to the orchestrator, not a decision the executor
takes silently.

### 1. `src/app/shared/ui/async-content/` — the shared primitive

Three files plus a spec, matching the repository's own structure: `async-content.ts`,
`async-content.html`, `async-content.scss`, `async-content.spec.ts`. Selector
`app-async-content`, to match `angular.json`'s `"prefix": "app"`. Export it from
`src/app/shared/ui/index.ts`, where the other primitives are exported.

```ts
  readonly status = input.required<AsyncStatus>();
  readonly problem = input<UiProblem | null>(null);
  readonly hasPrevious = input<boolean>(false);

  readonly retryRequested = output<void>();
```

`UiProblem` is imported from `src/app/shared/types/ui-problem.ts`. **That file is created
by `FIX-50` and this task must not create a second declaration of the same type.** If
FIX-50 has not landed, stop and report.

The template renders the five required states by composing the primitives that already
exist — `LoadingState`, `EmptyState`, `ErrorState` — and projects the loaded content:

- `loading` with `hasPrevious() === false`: the skeleton.
- `loading` with `hasPrevious() === true`: **the refreshing state.** The projected content
  stays visible under a visible refresh indication, which is the entry's *"previous usable
  data can remain under explicit refresh warning"*.
- `success`: the projected content alone.
- `empty`: `EmptyState`, with its action projected — see below.
- `error`: `ErrorState`, showing `problem()?.message`, with a retry control that emits
  `retryRequested` when `problem()?.retryable` is true.

**Content projection, and the decision behind the named slot.** The loaded content arrives
through the default `<ng-content>`. The empty state's action arrives through a named slot:

```html
      <ng-content select="[data-async-empty-action]"></ng-content>
```

The entry declares one output, `retryRequested`, and no output for an empty-state action,
so an input or a second output would be a change to the specification that **D1** forbids
this task from making. Projection adds no member to the declared surface and lets the
catalogue keep ownership of "Szűrők törlése", which `components.md:362` assigns to
`AppliedFilters`' `cleared` output and `:364` names as its own function ("clear-all"). Record this reasoning in the commit body.

### 2. `src/app/features/catalog/catalog-toolbar.*`

Selector `app-catalog-toolbar`, three files plus a spec. It receives what the entry
declares and owns nothing:

```ts
  readonly total = input.required<number>();
  readonly sort = input.required<Sort>();
  readonly pageSize = input.required<12 | 24>();
  readonly status = input.required<AsyncStatus>();
  readonly appliedCount = input<number>(0);

  readonly sortChanged = output<Sort>();
  readonly pageSizeChanged = output<12 | 24>();
  readonly openFilters = output<void>();
```

`appliedCount` is the one member not in the entry's input list, and it is required by the
entry's own Functions line: *"mobile filter trigger with **selected-count cue**"*. The cue
is rendered today from `appliedChipCount()` at `catalog-page.html:36`. An input is the only
way a presentation component can receive a count it is forbidden to compute. Name this in
the commit body as an addition the Functions line requires, not a liberty.

Move `catalog-page.html:23-65` into its template verbatim, replacing
`resultCountLabel()` with a `computed` over `total()` and `status()`, `currentSort()` with
`sort()`, `currentPageSize()` with `pageSize()`, `isRefreshing()` with
`status() === 'loading'`, and each `(click)` / `(change)` handler with the matching
`output`. `sortLabel` and `SORT_MODES` move with it; import `SORT_MODES` from
`catalog-query.ts`, where it already lives.

Map `CatalogStatus` to `AsyncStatus` at the call site, not inside the component:
`'refreshing'` becomes `'loading'`.

### 3. `src/app/features/catalog/applied-filters.*`

Selector `app-applied-filters`, three files plus a spec.

```ts
  readonly query = input.required<CatalogQuery>();

  readonly filterRemoved = output<FilterIdentity>();
  readonly cleared = output<void>();
```

Declare `FilterIdentity` in `src/app/shared/types/` beside `ui-problem.ts`, exactly as
`components.md:7` declares it after decision **D16** below widens it:

```ts
export interface FilterIdentity {
  readonly name: keyof CatalogFilters | 'q' | 'featured';
  readonly value?: string | number;
}
```

Move `buildChips` and the `AppliedChip` interface out of `catalog-page.ts:810-844` and into
`catalog-query.ts`, exported. That is the same move and the same reason **FIX-24** gives
for the symbol it relocates: the codec's own file is where a query-derived helper belongs,
and a module-private symbol cannot be imported by a test. **FIX-24 lands first**; if both
are in flight, they collide in that file.

**Two edits land on this one physical line — `docs/spec/components.md:7` is one line
carrying every shared type, and two user decisions now edit it: D16 widens
`FilterIdentity`, D21 extends `CatalogQuery`. Two tasks cannot edit one line under
one-commit-per-task, so this task carries both in its single commit and owns the line
outright, not left for this task to decide which half it would take.**
`docs/spec/components.md:7` reads, in full, byte-for-byte as it stands today:

```text
`CatalogFilters = {brands: readonly string[]; storageGb: readonly (128|256|512)[]; minPrice?:number; maxPrice?:number; inStock:boolean; is5g:boolean}`. `CatalogQuery = CatalogFilters & {q:string; sort:Sort; page:number; pageSize:12|24}`. `Sort = recommended | price_asc | price_desc | name_asc`. `Facets` is the ProductPage.facets schema. `FilterIdentity = {name: keyof CatalogFilters; value?:string|number}`. `CheckoutStep = cart | contact | delivery | review | success`. `AsyncStatus = idle | loading | success | empty | error`. `UiProblem = {code:string; message:string; fieldErrors:FieldError[]; retryable:boolean}`. `CheckoutDraft` composes optional Contact, DeliverySelection and paymentMethod. `ReviewState = quoting | ready | expired | price-changed | stock-error | submitting | error`. `PaymentStatus = idle | pending | succeeded | declined | unknown | error`. `CategoryShortcut = {label:string; query:Partial<CatalogQuery>}`. `LicensedLocalModel = {src:string; licenseReference:string; variantId:string}`. `ViewerError = load | decode | unsupported`. `FieldTree<T>` is Angular Signal Forms typed field-tree API, not a handwritten replacement. Wire types Money,Cart,Variant,Quote,Image,FieldError are generated from OpenAPI.
```

This task owns two clauses of that line and replaces both in the same commit. Where it
reads:

```text
`CatalogQuery = CatalogFilters & {q:string; sort:Sort; page:number; pageSize:12|24}`.
```

replace it with:

```text
`CatalogQuery = CatalogFilters & {q:string; sort:Sort; page:number; pageSize:12|24; featured?:boolean}`.
```

and where it reads:

```text
`FilterIdentity = {name: keyof CatalogFilters; value?:string|number}`.
```

replace it with:

```text
`FilterIdentity = {name: keyof CatalogFilters | 'q' | 'featured'; value?:string|number}`.
```

Every other sentence on the line is untouched. **`FIX-60` owns `docs/spec/components.md:7`
outright — it is the only task in the package that edits this line — and every other task
that names it points at `FIX-60` by number rather than editing it itself**; **FIX-65**'s
"Out of scope" section does exactly that.

The `FilterIdentity` widening is the user's words: *"Spec bővítés, mint a D11-nél"* ("spec
extension, as with D11") — decision **D16**. The `CatalogQuery` extension is the user's
words, asked what the `featured` field actually is and answered after being shown the
measurement: *"Marad, a components.md kiegészül"* ("it stays, `components.md` is
extended") — decision **D21**. **Both have exactly the standing D11 has and no more.** Each
is a change to a specification document, which decision **D1** forbids a *task* from
proposing on its own; both are allowed here only because the **user** decided them, on a
document that already contradicted itself about its own component — two of the eight chips
`AppliedFilters` must render were nameable by neither `CatalogFilters` nor any other
declared type — and about its own wire contract: `docs/api/openapi.yaml:117` declares
`featured` as a real `listProducts` query parameter that `components.md:7`'s `CatalogQuery`
omitted. **D1 is not weakened by either edit, and no other task in this package, and no
task outside it, may cite this passage as a precedent for editing a specification document
to match what an implementation happens to do.** Stage `docs/spec/components.md` in the
same commit as the code, exactly as **FIX-50** does for decision **D11**'s edit at `:480`
(`.claude/rules/session-lifecycle.md`, "One commit, one logical change").

`AppliedFilters` renders and emits **all eight** chips `buildChips` produces — the six
whose kind is a `keyof CatalogFilters`, plus `q` and `featured`, both now valid
`FilterIdentity` names. The `q` chip and the `featured` chip move into the component along
with the other six; `CatalogPage` no longer renders either of them on its own. The chip
row's visible order and content are unchanged from what ships today — only which component
owns all eight chips changes.

The "Összes szűrő törlése" button at `catalog-page.html:81-86` moves into the component and
emits `cleared`. The entry's *"no filters renders nothing"* state is a guard on the
component's own root: when `query()` produces no chip, it renders nothing at all.

### 4. `src/app/features/catalog/pagination.*` — and the numbered pages

Selector `app-pagination`, three files plus a spec.

```ts
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly disabled = input<boolean>(false);

  readonly pageChanged = output<number>();
```

`totalPages` moves in as a `computed` over `total()` and `pageSize()`; the entry gives the
component `total` and `pageSize` precisely so it derives the count itself.
`catalog-page.ts:632`'s `shouldShowPagination` stays on the page, because the entry says
*"out-of-range handled by facade"* and whether to render the pager at all is the page's
call.

`disabled` is the one member not in the entry's input list, and it carries what
`isRefreshing()` carries today at `catalog-page.html:156` and `:164`. The entry's required
states include `disabled`, and no declared input can produce it — the same shape of gap
**D11** settled for `MobileBuyRail`. Name it in the commit body.

The template keeps the two existing buttons and adds the numbers between them:

```html
<nav class="pagination" aria-label="Lapozás" data-testid="catalog-pagination">
  <button type="button" data-testid="pagination-prev" [disabled]="page() <= 1 || disabled()" (click)="pageChanged.emit(page() - 1)">Előző</button>
  @for (n of pageNumbers(); track n) {
    <button
      type="button"
      class="page"
      [class.is-current]="n === page()"
      [attr.data-testid]="'pagination-page-' + n"
      [attr.aria-label]="n + '. oldal'"
      [attr.aria-current]="n === page() ? 'page' : null"
      [disabled]="disabled()"
      (click)="pageChanged.emit(n)"
    >{{ n }}</button>
  }
  <button type="button" data-testid="pagination-next" [disabled]="page() >= totalPages() || disabled()" (click)="pageChanged.emit(page() + 1)">Következő</button>
</nav>
```

- **`pageNumbers()` is every page, `1..totalPages()`.** Do not add ellipsis truncation.
  The specification does not ask for it, the prototype renders every page
  (`Array.from({length:pages}, …)`), and a truncation window would need a threshold this
  task would have to invent — which `.claude/rules/planning-deliverables.md` forbids.
- **The accessible name is `"<n>. oldal"`** and `aria-current="page"` sits on the current
  page's button, both copied from the prototype rather than composed. The current page's
  button is **not** disabled: disabling it would remove it from the tab order and lose the
  `aria-current` announcement.
- **The span at `catalog-page.html:159` goes**: the numbers replace it. The `aria-current`
  it carried moves onto the current numbered button.
- Every button keeps the 44 px minimum target the existing `min-h-10 min-w-10` provides;
  carry that through and verify it in the browser, per R21.

### 5. `src/app/features/catalog/catalog-page.*` — compose the four

Replace the four regions with the four elements, bind the inputs from the facade, and route
each output back to the handler that exists today. The page's handlers
(`onSortChanged`, `onPageSizeChanged`, `onChipRemoved`, `onClearAll`, `onPageChanged`,
`onRetry`, `openDrawer`) keep their bodies; only their signatures change where an output
carries a typed payload instead of a DOM `Event`.

Move the SCSS for each region out of `catalog-page.scss` and into the new component's own
stylesheet, verbatim. Leave `catalog-page.scss`'s `.catalog`, `.layout`, `.sidebar` and
`.results` rules where they are.

`catalog-page.ts` loses `resultCountLabel`, `currentSort`, `currentPageSize`,
`totalPages`, `appliedQuery`, `appliedChipCount`, `sortModes`, `sortLabel`, `buildChips`
and `AppliedChip`, all of which move into the components that use them. It keeps
`isRefreshing`, `currentPage`, `shouldShowPagination`, `drawerOpened` and every handler.

### 6. Tests

Each of the four components gets its own spec file beside it, and each asserts the
contract rather than the markup:

- **`AsyncContent`**: one test per required state — `loading` with
  `hasPrevious=false`, `loading` with `hasPrevious=true`, `success`, `empty`, `error` —
  asserting the rendered difference; plus one test that `retryRequested` emits from the
  error state's retry control, and one that the projected content is visible in the
  refreshing state and absent in the plain loading state.
- **`CatalogToolbar`**: one test per output, asserting the emitted payload's value, and one
  that the mobile filter trigger shows the count when `appliedCount() > 0` and not when it
  is `0`.
- **`AppliedFilters`**: one test that a query with no filters renders nothing; one that
  each of the eight chips emits a `FilterIdentity` with the right `name` and `value`; one
  that the clear-all control emits `cleared`; and one asserting each chip's remove button
  has an accessible name naming the chip it removes.
- **`Pagination`**: one test that `pageNumbers()` has `totalPages()` entries; one that the
  current page's button carries `aria-current="page"` and none of the others does; one per
  output path (`prev`, a number, `next`) asserting the emitted page; and one that `prev` is
  disabled on page 1 and `next` on the last page.

`src/app/features/catalog/catalog-page.spec.ts` keeps its existing assertions and gains one
that the page renders all four elements. Do not assert that a template contains a string:
that is the pattern **FIX-07** and **FIX-07b** exist to remove.

## Out of scope

- **`src/app/shared/types/ui-problem.ts` — `FIX-50`.** Consume it; never declare it.
- **The five components whose signatures drift — `FIX-50`.** `AddToCart`,
  `ProductGallery`, `VariantSelector`, `MobileBuyRail`, `DemoNotice`.
- **`DeliveryStep`'s signature — `FIX-56`.**
- **`AppHeader` and `AppFooter` drifting from `components.md:71-98`.** `FIX-24`'s
  out-of-scope section records `HeaderNav`'s drift, which is **still genuinely unowned** —
  do not fix it here. `src/app/core/navigation/footer-nav.ts` has no signal input at all
  while `components.md:90` gives `AppFooter` a `compact:boolean`; **`FIX-64` now owns that
  half** (its item 3). The app shell is composed by three layouts, and finding
  `HeaderNav`'s owner is a task of its own. Record and report it.
- **Renaming `SortMode` to `Sort` under decision D10 — `FIX-65`.** It lands before this
  task. Use `Sort`, which is what `catalog-query.ts:22` declares by then; do not rename
  anything here and do not report it as a gap.
- **`CatalogQuery`'s `featured` field is no longer out of scope.** Decision **D21**
  ("`featured` stays, and `components.md:7` gains it") settles it, and item 3 above already
  carries the `components.md:7` edit that declares it, in this task's own commit.
- **Extracting the inline template and styles — `FIX-14`.** **It lands first.** If it has
  not, stop and report: editing the orphaned `catalog-page.html` changes nothing, and
  editing the inline copy in `catalog-page.ts` collides with FIX-14.
- **The catalogue's duplicated `.catalog` layout — `FIX-59`.** Same file, the root element
  this task does not touch. Never concurrent.
- **Clearing the filters leaving the URL stale, and the sort control ignoring it —
  `FIX-24`.** **It lands first**, and it moves a module-private symbol into
  `catalog-query.ts`, where item 3 also moves two. Never concurrent.
- **The test-only 1×1 input and the hidden commit button in the catalogue markup —
  `FIX-43`.** Carry them across unchanged if they are still there; do not remove them.
- **The catalogue's empty-state and badge copy — `FIX-35`.** Move the strings verbatim.
- **The mobile filter drawer's overflow (`FIX-27`) and the header search below 1024 px
  (`FIX-28`).** Different elements.
- **`FilterPanel` and `FilterDrawer`.** They already exist as components and are not
  touched.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

**Prerequisites, in this order: `FIX-04`, `FIX-14`, `FIX-24`, `FIX-50`, `FIX-65`.**
FIX-14 makes the template file live, FIX-24 settles `catalog-query.ts` and the URL
behaviour this task must not regress, FIX-50 creates `ui-problem.ts`, FIX-65 renames
`SortMode` to `Sort` so the two components extracted here are written against the
specification's name in their first commit. If any is missing, stop and report.

```bash
npm run build               # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does not
                            # fail this task, since this task names no spec file of its own
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Browser checks (mandatory — this task rebuilds a page a person uses):

1. At 1440, open `http://localhost:4200/telefonok`. Record a screenshot and compare it
   against one taken before the change: **the rendered catalogue must look the same**,
   apart from the numbered pages. This is a pure extraction everywhere else.
2. Exercise the toolbar: change the sort, change the page size, open the filter drawer.
   Each must behave exactly as before and must update the URL as before.
3. Apply two filters and a search term, so the chip row shows both a filter chip and the
   `q` chip. Remove each chip individually and then use "Összes szűrő törlése".
4. Exercise the pager: click a numbered page, then Előző, then Következő. With a page size
   of 12 and 16 demo devices there are two pages; set the page size to 12 to reach them.
5. Exercise the async states: with the network panel, make `GET /api/v1/products` fail and
   confirm the error state renders with a working retry; apply filters that match nothing
   and confirm the empty state renders with its clear-filters action; change a filter on a
   populated list and confirm the previous results stay visible under the refresh
   indication rather than being replaced by a skeleton.
6. Repeat steps 1, 3 and 4 at 390.

Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R14 applies and is the rule this task restores**: each of the four components now
  renders every state its entry requires, and each state is reachable by setting an input.
  Screenshot all five of `AsyncContent`'s and all four of `Pagination`'s.
- **R20 applies**: every numbered page button has a discernible accessible name
  (`"<n>. oldal"`) and a visible focus ring; the chip remove buttons keep the accessible
  names they have today (`'Szűrő eltávolítása: ' + chip.label`).
- **R21 applies**: every numbered page button, every chip remove button and every toolbar
  control measures at least 44 × 44 CSS px at 390 and at 1440. Measure the rendered rects,
  not the CSS.
- **R22 applies**: `aria-current="page"` is on exactly one numbered button, and the
  pager's `aria-label="Lapozás"` survives the extraction.
- **R06 and R04 apply**: the SCSS moved into each new component is moved **verbatim**. No
  new colour, spacing value or dimension is introduced by the extraction; the numbered
  buttons reuse the existing `.page` rules.
- **R25 applies**: the chip row and the pager must not overflow at 390. With every page
  numbered, the pager is the control most at risk, and step 6 measures it.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R03, R05, R07–R13, R15–R19, R23, R24: N/A — this change moves existing markup
  into four components and adds one control. It introduces no brand asset, font, copy
  string, data source, dialog, or handoff artefact, and it changes no page's data flow.

## Acceptance criteria

- [ ] **FIX-60-AC01** The four components exist, each as a `.ts`, a `.html`, a `.scss` and
      a `.spec.ts`: `src/app/shared/ui/async-content/`,
      `src/app/features/catalog/catalog-toolbar.*`, `applied-filters.*` and
      `pagination.*`. `src/app/shared/ui/index.ts` exports `AsyncContent`.
- [ ] **FIX-60-AC02** Each component declares exactly the inputs and outputs its
      `components.md` entry names, plus only the additions item 2, item 3 and item 4
      justify in writing (`appliedCount` on the toolbar, `disabled` on the pager). Every
      addition is named in the commit body with the specification line that requires it.
- [ ] **FIX-60-AC03** `grep -rn "interface UiProblem\|type UiProblem" src` returns exactly
      one line, in `src/app/shared/types/ui-problem.ts`, which this task did not create.
- [ ] **FIX-60-AC04** `src/app/features/catalog/catalog-page.html` contains
      `<app-catalog-toolbar`, `<app-applied-filters`, `<app-async-content` and
      `<app-pagination`, and contains none of the markup those four now own:
      `grep -c "catalog-sort\|applied-chip-remove\|catalog-empty\|pagination-prev" src/app/features/catalog/catalog-page.html`
      prints `0`.
- [ ] **FIX-60-AC05** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; this task names
      no spec file of its own, so if it has not landed, record that verbatim.
- [ ] **FIX-60-AC06** **Real-browser check: the numbered pages exist and work.** At 1440 on
      `/telefonok` with page size 12, the pager renders one button per page. Clicking page
      2 shows page 2's products and updates the URL's `page` parameter. Exactly one button
      carries `aria-current="page"`, and it is the current page's.
- [ ] **FIX-60-AC07** **Real-browser check: the extraction changed nothing else.**
      Screenshots of `/telefonok` at 1440 and at 390, taken before and after the change,
      differ only in the pager region. Any other difference is named in the commit body
      with its cause.
- [ ] **FIX-60-AC08** **Real-browser check: all five async states.** The loading skeleton,
      the refreshing state (previous results still visible), the success state, the empty
      state with its working clear-filters action, and the error state with its working
      retry are each reached and screenshotted. Zero console errors in each.
- [ ] **FIX-60-AC09** **Real-browser check: the chips.** With two filters and a search term
      applied, the chip row shows the filter chips and the `q` chip together. Removing each
      chip removes exactly that filter and updates the URL; "Összes szűrő törlése" clears
      all of them. With no filters applied, the chip row renders nothing at all.
- [ ] **FIX-60-AC10** **Real-browser check at 390.** Every numbered page button, every chip
      remove button and every toolbar control measures at least 44 × 44 CSS px, and
      `document.documentElement.scrollWidth` is not greater than `window.innerWidth + 1`.
- [ ] **FIX-60-AC11** Each of the four spec files contains the tests item 6 lists for it,
      and each asserts rendered state or an emitted payload. No test asserts that a source
      file contains a string.
- [ ] **FIX-60-AC12** The commit body records: the `FilterIdentity` contradiction and the
      decision taken about the `q` and `featured` chips (**D16**); the `CatalogQuery`
      extension that adds `featured?: boolean` and the decision behind it (**D21**); and
      `AppHeader`/`HeaderNav`'s unowned drift against `components.md:71-84`. Each as a
      finding, with its `file:line`.
## Commit

This task is intended as exactly one commit: four components extracted from one page, plus
the one function the specification requires of the fourth. They meet on a single template,
so splitting them means rewiring the same call site four times. **If it will not hold as
one commit, the seam is between item 1 and item 2**, and the commit body of the first of
the two says why the single commit did not hold. Do not split it any other way. Do not
bundle it with **FIX-14**, **FIX-24**, **FIX-50** or **FIX-59**. Commit only after every
acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
refactor: extract AsyncContent, CatalogToolbar, AppliedFilters and Pagination
```
