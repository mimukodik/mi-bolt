# FIX-24 — Catalogue: clearing the filters leaves the URL stale, and the sort control ignores it

Status: PARTIAL — 766898e. Open: AC10 (comparing two template copies) has nothing left to compare since FIX-14 already merged them and is dropped; item 2's inline-template edit was made once rather than mirrored, per the commit's own note that FIX-24's premise was stale.
Severity: major
Source: B1 F5 (clear filters), B1 F6 (sort control), B3 R18 verdict.

## Why this is wrong

Both halves are failures of design rule R18, "Keep list filtering, sorting, result count
and URL state consistent", and of `docs/spec/screens.md:20` (S2 route row, "valid query
canonicalization"):

1. "Összes szűrő törlése" resets the result set to all 16 devices but leaves `q=…` in the
   URL, so a reload re-applies the query the user just cleared. E033
   (`docs/spec/test-scenarios.md:39`) requires "Reset restores query defaults".
2. `/telefonok?sort=price_desc&pageSize=24` sorts the grid correctly but the "Rendezés"
   control still displays "Ajánlott sorrend", while the page-size control next to it does
   restore. E035 (`docs/spec/test-scenarios.md:41`) requires that "Selections, sort, page
   and list restore correctly".

**Before editing anything, read this.** `src/app/features/catalog/catalog-page.ts:66` uses
an inline `template:` and `:266` an inline `styles:`. A file
`src/app/features/catalog/catalog-page.html` also exists (197 lines, added by commit
`1ae1b1c` "refactor: extract inline templates/styles into HTML/SCSS files") and **no
component references it** — `grep -n "templateUrl" src/app/features/catalog/catalog-page.ts`
returns nothing. Editing that HTML file alone changes nothing a user can see. `FIX-14`
owns promoting it; this task edits the live inline template and mirrors the same edit into
the orphan so the fix is not lost when `FIX-14` switches the decorator over.

## Evidence

**The URL keeps cleared keys.** `src/app/features/catalog/catalog-page.ts:851-859`:

```ts
function serializeForRouter(q: CatalogQuery): Record<string, string | string[] | null> {
  const params = serializeCatalogQuery(q);
  const out: Record<string, string | string[] | null> = {};
  for (const key of new Set<string>(params.keys())) {
    const all = params.getAll(key);
    out[key] = all.length > 1 ? all : (all[0] ?? null);
  }
  return out;
}
```

The loop iterates over the keys the codec **emitted**, and the codec deliberately omits
every default and empty value (`src/app/features/catalog/catalog-query.ts:207-213`
documents exactly that: "Default values … are omitted so the URL never carries noise").
A cleared filter therefore never appears in the object at all, and the navigation that
consumes it uses `queryParamsHandling: 'merge'`
(`src/app/features/catalog/catalog-page.ts:683-689`), which only overwrites the keys it is
given and removes only those explicitly set to `null`. `onClearAll()` (`:761-763`) calls
`facade.reset()` (`src/app/features/catalog/catalog.facade.ts:357-359`), the result count
returns to 16, and `?q=Demo%20One` stays in the address bar.

**The sort control never receives its initial value.**
`src/app/features/catalog/catalog-page.ts:105-115` (inline template) binds the value on the
`<select>` while its options are produced by a `@for` in the same block:

```html
                <select
                  class="select min-h-10 px-3 rounded font-inherit cursor-pointer"
                  data-testid="catalog-sort"
                  [value]="currentSort()"
                  [disabled]="isRefreshing()"
                  (change)="onSortChanged($event)"
                >
                  @for (mode of sortModes; track mode) {
                    <option [value]="mode">{{ sortLabel(mode) }}</option>
                  }
                </select>
```

The page-size control immediately below it (`:117-130`, static `<option>` elements) has **static** `<option>`
elements and restores correctly — which is the whole difference. Setting `value` on a
`<select>` before it has any option is dropped by the DOM, and the element then lands on
the first option that arrives. Measured with the workspace's installed jsdom (28.x):

```
$ node -e "const {JSDOM}=require('jsdom');const d=new JSDOM('<select id=s></select>').window.document;
const s=d.getElementById('s'); s.value='price_desc';
console.log(JSON.stringify(s.value));
for (const v of ['recommended','price_asc','price_desc','name_asc']) { const o=d.createElement('option'); o.value=v; s.appendChild(o); }
console.log(JSON.stringify(s.value), s.selectedIndex);"
""
"recommended" 0
```

and with the options present first, `select.value = 'price_desc'` selects index 2. That is
the observed behaviour exactly: correct after the user interacts (the options exist by
then), wrong on a deep link.

**Two search inputs, and a contradiction worth recording.** B1 reported that after
clearing, "the input still shows 'Demo One'". There are two inputs and they behave
differently:

- `src/app/features/catalog/catalog-page.ts:249-256` — the catalogue's own input is
  **visually hidden** (`class="sr-only absolute w-px h-px overflow-hidden"`) and is bound
  to the facade (`[value]="facade.query().q ?? ''"`), so it does follow a reset.
- `src/app/core/navigation/header-nav.html:45-56` and `:97-108` — the visible header
  inputs are bound to `searchDraft()`, a signal owned by `HeaderNav`
  (`src/app/core/navigation/header-nav.ts:53`) which is never fed from the URL:
  `commitSearch()` (`:95-100`) navigates and then clears the draft, and nothing else ever
  writes it.

So the visible box cannot follow a reset, by construction — there is no code path from the
catalogue's state to it. Which of the two B1 was looking at is not recorded. This task
fixes both surfaces and AC02/AC03 below check both, so the contradiction does not have to
be resolved first.

## What to change

**1. Make the URL drop the keys that are gone.** Move the key list to the module that owns
the codec, then emit every key explicitly.

`src/app/features/catalog/catalog-query.ts` — export the canonical key set beside
`serializeCatalogQuery` (`:214`). These are exactly the keys `parseCatalogQuery` (`:109`) reads and
`serializeCatalogQuery` (`:214`) writes:

```ts
/** Every query-string key this codec owns, in canonical order. */
export const CATALOG_QUERY_KEYS = [
  'q', 'brand', 'storageGb', 'minPrice', 'maxPrice',
  'inStock', 'is5g', 'featured', 'sort', 'page', 'pageSize',
] as const;
```

`src/app/features/catalog/catalog-page.ts:851-859` — rewrite `serializeForRouter` so an
absent key becomes an explicit `null`, which is what `queryParamsHandling: 'merge'`
removes:

```ts
function serializeForRouter(q: CatalogQuery): Record<string, string | string[] | null> {
  const params = serializeCatalogQuery(q);
  const out: Record<string, string | string[] | null> = {};
  for (const key of CATALOG_QUERY_KEYS) {
    const all = params.getAll(key);
    out[key] = all.length === 0 ? null : all.length > 1 ? all : (all[0] ?? null);
  }
  return out;
}
```

Import `CATALOG_QUERY_KEYS` from `./catalog-query`, which `catalog-page.ts` already imports
from. Keep `queryParamsHandling: 'merge'` — a sibling parameter that is not the
catalogue's (for example `mi-scenario`, read at bootstrap by
`src/mocks/scenarios.ts:109-114`) must survive, and it does, because the object now names
only the catalogue's own keys.

**2. Make the sort control show the value the URL asked for.** In the inline template at
`src/app/features/catalog/catalog-page.ts:105-115`, drop `[value]` from the `<select>` and
mark the selected option instead, so the selection is expressed on an element that exists
when it is evaluated:

```html
                <select
                  class="select min-h-10 px-3 rounded font-inherit cursor-pointer"
                  data-testid="catalog-sort"
                  [disabled]="isRefreshing()"
                  (change)="onSortChanged($event)"
                >
                  @for (mode of sortModes; track mode) {
                    <option [value]="mode" [selected]="mode === currentSort()">{{ sortLabel(mode) }}</option>
                  }
                </select>
```

Leave the page-size control alone: its static options make `[value]` work, and it is
verified to restore correctly.

Apply the identical edit to `src/app/features/catalog/catalog-page.html:38-49`. That file
is dead today, so the edit changes nothing now; it exists so `FIX-14` does not reintroduce
the defect when it promotes the file.

**3. Make the visible search box follow the URL.**
`src/app/core/navigation/header-nav.ts` — seed the draft from the query string instead of
from nothing, and stop clearing it after a navigation:

```ts
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  /** Current value of the header search input. It mirrors the URL's `q`
   *  parameter rather than holding local state, so clearing the filters
   *  on the catalogue also clears the box (R18). */
  readonly searchDraft = signal<string>('');

  constructor() {
    // The URL owns the active query; the input mirrors it, so clearing
    // the filters on the catalogue also clears the box (R18).
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => this.searchDraft.set(params.get('q') ?? ''));
  }
```

with `ActivatedRoute` added to the existing `@angular/router` import (`:2`),
`DestroyRef` to the `@angular/core` import (`:1`), and `takeUntilDestroyed` imported from
`@angular/core/rxjs-interop` — the same pairing `catalog-page.ts:12`/`:601`/`:663` uses.
**Importing `DestroyRef` is not declaring the field.** `header-nav.ts` has no
`destroyRef` today (`grep -n "destroyRef\|constructor" src/app/core/navigation/header-nav.ts`
returns nothing) and no constructor, so the `private readonly destroyRef =
inject(DestroyRef);` line above must be written as well; without it the snippet is a
TS2339 and `npm run build` fails. Put it beside the existing `router` injection at
`:45`. This is the shape eleven other files in `src/` already use — `catalog-page.ts:601`,
`product-page.ts:89`, `checkout-layout.ts:37`, `marketing-layout.ts:28`,
`shop-layout.ts:30` among them — so it is the project's idiom and not an invention.
`takeUntilDestroyed()` also works with no argument inside a constructor, and that
shorter form is deliberately **not** used here: no file in `src/` uses it, and
`.claude/CLAUDE.md` ("Surgical changes") says to match the existing style.

In `commitSearch()` (`:95-100`), delete the trailing `this.searchDraft.set('');` at
`:99`: the draft is no longer local state to reset, it is a mirror of the URL. The
docblock above `searchDraft` (`:50-52`) says the draft is *"cleared after a successful
navigation so a second query does not see stale text"*, which stops being true with
that line gone — the replacement block above carries the corrected docblock, and
`.claude/rules/code-standards.md` ("A cut feature leaves nothing behind") is why it is
rewritten rather than left. Query parameters live on the root of the activated route
tree (the router builds the root snapshot from `urlTree.queryParams`), so this works
from the header even though it sits outside the routed outlet.

Both header inputs bind the same signal (`header-nav.html:53` and `:105`), so this one
change covers the desktop box and the mobile row.

**4. Tests.**

- `tests/catalog.facade.spec.ts`, in the `T12-AC01 catalog-query codec` block (`:180`),
  which runs today: assert that `CATALOG_QUERY_KEYS` covers every key
  `serializeCatalogQuery` can emit — build a fully populated `CatalogQuery`, serialise it,
  and assert every emitted key is in the list — so a future key cannot be added to the
  codec and silently escape the reset.
- `tests/catalog.facade.spec.ts`, in the `T12-AC05 URL round-trip` block (`:789`): assert
  that serialising a defaulted query yields `null` for `q`, `brand`, `sort` and every other
  key, i.e. that a reset removes them rather than omitting them. If `serializeForRouter`
  cannot be imported because it is module-private in `catalog-page.ts`, move it into
  `catalog-query.ts` next to the codec it belongs to and export it; that is the better home
  regardless, and it is the only way this assertion can run in the node environment
  `tests/**` uses (`vitest.config.ts:506-509`).

## Out of scope

- Extracting the inline template and styles (`FIX-14`). Do not switch the decorator to
  `templateUrl` in this task.
- `CatalogToolbar`, `AppliedFilters` and `Pagination` not existing as components, and
  pagination having no numbered pages (A3 finding 3).
- The mobile filter drawer's overflow (`FIX-27`) and the header search being hidden below
  1024 px (`FIX-28`). This task changes **only** the source of `searchDraft` in
  `header-nav.ts`; it changes no class, no breakpoint and no markup in
  `header-nav.html`/`.scss`, which is where `FIX-28` works.
- `HeaderNav`'s contract drift against `docs/spec/components.md:75-77` (A3 finding 13 —
  the spec gives it `searchQuery` and `cartCount` inputs and a `searchSubmitted` output;
  the component injects the facade and navigates itself). That decision is not taken here.
- The catalogue card's badge text and the empty-state copy (`FIX-35`).

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

```bash
npm run build              # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does
                            # not fail this task, but tests/catalog.facade.spec.ts must pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

At 1440, in this order:

1. Open `http://localhost:4200/telefonok`, record the result count with no query.
2. Type `Demo One` into the visible header search box and press Enter; wait for the count
   to change and for `q=` to appear in the URL.
3. Apply one more filter (for example the 5G toggle) so the chip row and the
   "Összes szűrő törlése" button are visible.
4. Click `[data-testid="applied-filters-clear"]` and read: the result count, the full URL,
   the value of `[data-testid="header-search-input"]` and the value of
   `[data-testid="catalog-search"]`.
5. Reload the page and read the count and the URL again.
6. Open `http://localhost:4200/telefonok?sort=price_desc&pageSize=24` as a fresh load and
   read the displayed text of `[data-testid="catalog-sort"]` and
   `[data-testid="catalog-page-size"]`, plus the order of the first two prices in the grid.
7. Change the sort with the control, then press Back, and read the control again.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R18 applies and is the rule this task restores**, in both halves: the filter state, the
  sort state, the result count and the URL must agree in both directions.
- **R19 applies**: after a reset the list must return to its default ready state, not to an
  empty or error state.
- **R20 applies**: the sort `<select>` keeps its native semantics and its accessible name;
  `[selected]` on the options must not remove keyboard operation.
- **R24 applies**: a reset is not an error path, and no entered data other than the
  filters themselves may be discarded.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R17, R21–R23, R25: N/A — this change alters no colour, spacing, type, image,
  price, target size, narrow layout, modal, claim or handoff artefact.

## Acceptance criteria

- [ ] **FIX-24-AC01** After clicking `[data-testid="applied-filters-clear"]`,
      `window.location.search` contains none of `q=`, `is5g=`, `inStock=`, `brand=`,
      `storageGb=`, `minPrice=`, `maxPrice=`, `featured=`, `sort=`, `page=` or `pageSize=`.
- [ ] **FIX-24-AC02** After that same click, `[data-testid="header-search-input"]`'s
      `value` is the empty string.
- [ ] **FIX-24-AC03** After that same click, `[data-testid="catalog-search"]`'s `value` is
      the empty string, and the result count equals the count recorded in step 1 of "How to
      verify" with no query applied.
- [ ] **FIX-24-AC04** Reloading the page after the clear leaves the count unchanged from
      AC03 — the cleared query is not re-applied (E033).
- [ ] **FIX-24-AC05** On a fresh load of `/telefonok?sort=price_desc&pageSize=24`, the
      selected option text of `[data-testid="catalog-sort"]` is "Ár szerint csökkenő", the
      page-size control still reads "24 / oldal", and the first two grid prices are in
      descending order.
- [ ] **FIX-24-AC06** Changing the sort with the control and then pressing Back leaves the
      control showing the sort the restored URL names (E035).
- [ ] **FIX-24-AC07** A query parameter the catalogue does not own survives a filter
      change: load `/telefonok?mi-scenario=happy-path`, apply a filter, and confirm
      `mi-scenario=happy-path` is still in the URL.
- [ ] **FIX-24-AC08** `tests/catalog.facade.spec.ts` carries both assertions described in
      "What to change" item 4, and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/catalog.facade.spec.ts` instead.
- [ ] **FIX-24-AC09** `npm run build` exits 0.
- [ ] **FIX-24-AC10** The sort markup in the live inline template
      (`src/app/features/catalog/catalog-page.ts`) and in the unreferenced
      `src/app/features/catalog/catalog-page.html` match on the four attributes that carry
      the fix, indentation aside: the `data-testid`, the absence of `[value]` on the
      `<select>`, `[disabled]="isRefreshing()"`, and
      `[selected]="mode === currentSort()"` on each `<option>`.
- [ ] **FIX-24-AC11** `grep -n "inject(DestroyRef)" src/app/core/navigation/header-nav.ts`
      returns exactly one line, and `grep -n "this.searchDraft.set('')" src/app/core/navigation/header-nav.ts`
      returns nothing. `npm run build` exits `0`. The first half is what proves the
      field was declared and not merely imported; before this task the same grep
      returned nothing.

## Commit

This task is exactly one commit. Do not bundle it with any other FIX task. Both halves are
the same rule on the same screen and are verified in one browser pass.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: catalogue reset clears the URL and the sort control reflects it
```
