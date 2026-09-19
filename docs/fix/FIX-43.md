# FIX-43 — Remove the test-only affordances and the dead public API from production markup

Status: PARTIAL — 02d0235, a5c3399. Open: the catalogue test 02d0235 added (calling setupHarness()) still hits the pre-existing ActivatedRoute.queryParamMap stub defect and has never passed; AC08's grep cannot return the claimed result while header-nav and filter-panel still exist.
Severity: major
Source: A5 (test-suite sweep), A6 (idiom sweep), B2 (accessibility tree), orchestrator confirmation of the `Button` input.

## Why this is wrong

Four surfaces in shipped markup are either invisible scaffolding that exists only so
a unit test can find something to click, or a declared API that the template ignores.
All four fail the same rule from the opposite direction: a public surface has to mean
what it says.

- Two controls on the catalogue render at one CSS pixel square with no label and no
  visible affordance. They are focusable and are announced by a screen reader, which
  is design rule **R20**'s requirement of a meaningful accessible name applied to
  something that should not be reachable at all. The component's own comment says
  what they are for: *"Used by tests to flush a search debounce; no UI surface."*
  `docs/spec/coverage-policy.json:55-63` lists what a test may not do to make itself
  pass; building a control into the product so the test has a handle is the same
  practice under another name.
- A shared dialog primitive hardcodes `id="dialog-title"` on its heading. No consumer
  references it, so it is dead today, and it becomes an axe `duplicate-id` violation
  the moment two dialogs are mounted at once.
- `Button` declares a `type` input that the template overrides with a literal, so a
  caller binding `[type]="'submit'"` silently gets a non-submitting button.
- `ReviewStep` binds a `(dismissed)` handler on four `StatusMessage` instances that
  it also marks `[persistent]="true"`, and the primitive renders its close control
  only when `persistent` is false. The handler cannot fire.

They are one task because they are one defect class — a surface that lies — and
because each is a small, self-contained deletion or one-line correction in a
different file, which would be four commits of two lines each if they were split.

## Evidence

### 1. The catalogue's 1×1 search input and hidden commit button

`CatalogPage` carries its markup in one of two places depending on whether **`FIX-14`**
has landed, and FIX-14 lands **before** this task (`README.md` section 4, Phase D).
Before it, the live markup is the decorator's inline `template:` and the block is at
`src/app/features/catalog/catalog-page.ts:249-263`; after it, `catalog-page.ts` carries
`templateUrl: './catalog-page.html'` and the same block is at
`catalog-page.html:183-197`, de-indented by four spaces. Settle which with
`grep -n "templateUrl\|template:" src/app/features/catalog/catalog-page.ts` before
editing anything. The block itself, in the pre-FIX-14 inline form:

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

`w-px h-px` is one CSS pixel in each dimension. The input has no `<label>`, no
`aria-label` and no placeholder. The button's visible text is the English literal
`commit` in an otherwise Hungarian interface.

The component says so itself. `src/app/features/catalog/catalog-page.ts:726-730`:

```ts
  commitSearch(): void {
    // Used by tests to flush a search debounce; no UI surface.
    const el = this.searchEl()?.nativeElement;
    if (el) this.facade.setSearch(el.value);
  }
```

The only consumer is `src/app/features/catalog/catalog-page.spec.ts:350-364`, the
test named *"search input is debounced 300ms and pushed to the URL via the facade"*,
which does:

```ts
    const input = harness.fixture.nativeElement.querySelector('[data-testid="catalog-search"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = 'demo';
    input.dispatchEvent(new Event('input'));
```

The behaviour it is testing does not live in the component. `onSearchInput` at
`catalog-page.ts:721-724` forwards straight to `this.facade.setSearch(value)`, and
the 300 ms debounce is the facade's: `src/app/features/catalog/catalog.facade.ts:274-276`
pushes into `searchInput$`. So the test can drive the real owner directly and lose
nothing.

**A second copy of the same markup exists.** `src/app/features/catalog/catalog-page.html:183-197`
is identical to the block above once it is de-indented by the four spaces the inline
literal carries. That file was extracted in commit `1ae1b1c`
and the component was then reverted to the inline template, so nothing references
it today (`grep -rn "catalog-page.html" src` returns no hits). **`FIX-14`** owns
making that file live again **and lands before this task**, which is what removes the
two-copy problem rather than managing it: after FIX-14 there is one copy of the markup,
in `catalog-page.html`, and this task deletes the controls from it. Only if FIX-14 has
not landed — which the ordering says it must have — are there two copies, and then both
lose the affordances in this commit, because otherwise whichever task lands second
resurrects them.

The spec's search requirement is met elsewhere and is not lost by this deletion.
`docs/spec/screens.md:47` says *"q search in header/list toolbar"* — either place —
and the header's search field at `src/app/core/navigation/header-nav.html:43-57`
is the one that exists and routes `q` to the catalogue. **`FIX-28`** owns that field
being hidden below 1024 px.

### 2. The dialog primitive's hardcoded id

`src/app/shared/ui/accessible-dialog/accessible-dialog.html:2-10`:

```html
  <div
    class="panel flex flex-col gap-3 rounded-lg"
    role="dialog"
    aria-modal="true"
    [attr.aria-label]="label()"
    [attr.aria-labelledby]="labelledBy()"
  >
    <header class="header flex items-center justify-between gap-3">
      <h2 class="title font-bold m-0" id="dialog-title">{{ label() }}</h2>
```

```
$ grep -rn "dialog-title" src e2e tests
src/app/shared/ui/accessible-dialog/accessible-dialog.html:10:      <h2 class="title font-bold m-0" id="dialog-title">{{ label() }}</h2>
```

One hit: the declaration. Nothing reads it. All four call sites pass `[label]` and
none passes `[labelledBy]`:

- `src/app/core/navigation/mobile-drawer.html:1-5` — `[label]="label()"`
- `src/app/features/catalog/filter-drawer.html:1-5` — `[label]="'Szűrők'"`
- `src/app/features/product/product-gallery.html:63-67` — `[label]="'Nagyított kép: ' + productName()"`
- `src/app/features/checkout/terms-dialog.html:1-5` — `[label]="label()"`

The accessible name is therefore always supplied by `aria-label` on the panel, and
the heading's id serves nothing. It is a fixed, non-unique id on a component the
application instantiates four times.

### 3. `Button`'s `type` input is never applied — orchestrator-confirmed

`src/app/shared/ui/button/button.ts:41`:

```ts
  readonly type = input<'button' | 'submit' | 'reset'>('button');
```

`src/app/shared/ui/button/button.html:1-2`:

```html
<button
  type="button"
```

The literal wins; the input is read nowhere in the component. `grep -rn '\[type\]' src/app`
returns no hits, so no caller is bitten today — the input is a trap set for the next
one. **This is a candidate mechanism for the contact form's Continue bypassing
validation on an empty form: if the call-to-action never raises the form's native
submit event, the Signal Forms `submit()` path never runs. `FIX-20` owns that defect
and carries this as a lead to settle. Do not investigate the contact form here and
do not change any caller's binding.**

### 4. `ReviewStep`'s unreachable `(dismissed)` handler

`src/app/shared/ui/status-message/status-message.html:11-20`:

```html
  @if (!persistent()) {
    <div class="actions inline-flex items-center">
      <app-button
        variant="secondaryOnDark"
        size="standard"
        label="Bezárás"
        (pressed)="dismissed.emit()"
      ></app-button>
    </div>
  }
```

`dismissed` is emitted from exactly one place and that place is inside
`@if (!persistent())`. `src/app/features/checkout/review-step.html` binds both at
once, four times — at `:144-150`, `:152-158`, `:160-166` and `:168-174`. The
`price-changed` case, quoted in full:

```html
                @case ('price-changed') {
                  <app-status-message
                    [message]="priceChangedMessage()"
                    severity="error"
                    [persistent]="true"
                    (dismissed)="onDismissStatus()"
                  ></app-status-message>
                }
```

`src/app/features/checkout/review-step.ts:424-426`:

```ts
  onDismissStatus(): void {
    void this.quoteController.refresh();
  }
```

So the handler is a quote refresh wearing a dismissal's name, and it can never run.
The affordance the spec actually asks for already exists as its own control:
`docs/spec/screens.md:87` requires that a *"stale quote offers refresh and
re-review"*, and `review-step.html:331-339` renders an always-present
`data-testid="review-refresh"` button labelled "Árajánlat frissítése" wired to
`onRefresh()`. Removing the dead bindings therefore removes no user-facing
capability.

`docs/spec/components.md:206-216` specifies `StatusMessage` with
`persistent:boolean`, an output `dismissed:void` and a required `dismissed` state.
The primitive honours that contract; the defect is at the call site, so under **D1**
nothing in `status-message.*` changes.

## What to change

### 1. `src/app/features/catalog/catalog-page.ts`

**Run this first and branch on it**, because **FIX-14** lands before this task and
moves both the template and the styles out of the decorator, which shifts every line
number below:

```bash
grep -n "templateUrl\|template:" src/app/features/catalog/catalog-page.ts
```

- **A `templateUrl:` — FIX-14 has landed, which is the expected case.** The markup is
  not in this file at all; item 2 deletes it from `catalog-page.html`. Delete **three**
  things here and nothing else, locating each by identifier rather than by line number,
  because FIX-14 removed roughly 198 template lines and 326 style lines from this file
  and every number in the pre-FIX-14 text below has moved:
  `grep -n "searchEl\|onSearchInput\|commitSearch" src/app/features/catalog/catalog-page.ts`
  locates all three.
  - the view child `private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('search');`
  - `onSearchInput(event: Event)` — three statements
  - `commitSearch()` — three statements, and the comment above it that reads
    `// Used by tests to flush a search debounce; no UI surface.`
- **A `template:` — FIX-14 has not landed.** Report that before continuing: the
  ordering in `README.md` section 4, Phase D, puts FIX-14 first and this task's
  verification is written for that order. If the orchestrator confirms this task runs
  anyway, delete **four** things — the three above, at the line numbers that grep
  returns, plus the `<input #search …>` / `<button #searchCommit …>` block at
  `:249-263` including the blank line at `:248` that separated it from the filter
  drawer — and then item 2 still applies to the orphan `.html` copy, so both copies
  lose the controls in this commit.

Then remove any import that only those four used. `ElementRef` stays — `:600` and
`:607` still use it. `viewChild` stays — `:607` still uses it. Check the rest with
the typecheck in "How to verify"; `.claude/CLAUDE.md` ("Surgical changes") requires
removing the orphans a change creates and only those.

### 2. `src/app/features/catalog/catalog-page.html`

Delete the block at `:183-197` — the `<input data-testid="catalog-search">` and the
`<button data-testid="search-commit">`, plus the blank line above them. **After FIX-14
this is the live template and this is the only copy**, which is why item 1 has nothing
to delete there. The range is unchanged by FIX-14: the extraction is the inline
template de-indented by four spaces, so inline `:249-263` becomes `:183-197` here.
Confirm with `grep -n 'data-testid="catalog-search"' src/app/features/catalog/catalog-page.html`
rather than trusting the number. Change nothing else in the file.

### 3. `src/app/features/catalog/catalog-page.spec.ts`

Rewrite the test at `:350-364` so it drives the facade instead of a fake DOM node.
Keep its name, which describes real behaviour, and keep every assertion about timing
and about the URL:

```ts
  it('search input is debounced 300ms and pushed to the URL via the facade', async () => {
    const harness = await setupHarness();
    harness.facade.setSearch('demo');
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(harness.captured.length).toBe(0);
    await new Promise<void>((r) => setTimeout(r, 320));
    expect(harness.captured.length).toBe(1);
    expect(harness.captured[0]?.params.get('q')).toBe('demo');
    harness.respond(successPage([], 0));
    await harness.waitForStatus('empty');
    harness.cleanup();
  });
```

The two `querySelector` lines and the two `input.` lines go; everything else is
unchanged. If any other test in that file queries `catalog-search` or
`search-commit`, convert it the same way. Do not delete a test.

### 4. `src/app/shared/ui/accessible-dialog/accessible-dialog.html`

Remove `id="dialog-title"` from the `<h2>` at `:10`. The line becomes:

```html
      <h2 class="title font-bold m-0">{{ label() }}</h2>
```

**This is the decision; do not weigh alternatives.** Generating a unique id per
instance and pointing `aria-labelledby` at it would be new behaviour that nothing
asks for: the panel already carries `[attr.aria-label]="label()"`, which is the
accessible name every one of the four call sites relies on, and `labelledBy` stays
available at `accessible-dialog.ts:59` for a future caller that supplies its own id.
`.claude/CLAUDE.md` ("Simplicity first") settles it in favour of the deletion.

### 5. `src/app/shared/ui/button/button.html`

Bind the declared input on the root element at `:2`:

```html
<button
  [type]="type()"
```

**This is the decision, and it is the opposite of item 4 on purpose.** The dialog's
id has no declared API behind it and no caller; `Button`'s `type` is a declared,
typed, defaulted input, and its default is `'button'`, so binding it changes the
rendered output of exactly zero current call sites while making the declaration
true. Deleting the input instead would close off the submit button that `FIX-20` may
need one screen later. `type` is a reflected property of `HTMLButtonElement`, so the
property binding `[type]` is correct here; `[attr.type]` is not needed.

### 6. `src/app/features/checkout/review-step.html` and `.ts`

Delete the four `(dismissed)="onDismissStatus()"` lines — `:149`, `:157`, `:165`
and `:173`. Leave `[persistent]="true"` on all four: these are blocking errors on the
final checkout step and the spec's required affordance is the separate refresh
button, not a dismissal.

Then delete `onDismissStatus()` at `review-step.ts:424-426`, which those four lines
were the only callers of (`grep -rn "onDismissStatus" src tests e2e` returns exactly
those five lines). Do not delete `onRefresh()` at `:411-414`; the refresh button uses
it.

### 7. Tests for items 4, 5 and 6

Add them to the four spec files that already cover these components — **none is
created**: `src/app/shared/ui/accessible-dialog/accessible-dialog.spec.ts`,
`src/app/shared/ui/button/button.spec.ts`, `src/app/features/catalog/catalog-page.spec.ts`
(item 3 already edits it), and the `ReviewStep` spec, which **FIX-06** row 24 moves
from `tests/review-step.spec.ts` to
`src/app/features/checkout/review-step.spec.ts`. Locate that fourth one with
`grep -rln "ReviewStep" src tests` and record which path it resolved to. All ten paths
this task writes are in "Files this change touches" above, and **FIX-43-AC12** is the
check.

Assert rendered DOM, never file text:

- **Dialog**: mount two `AccessibleDialog` instances with `opened` true and assert
  `document.querySelectorAll('#dialog-title').length === 0`, and that each panel's
  `aria-label` equals its own `label` input.
- **Button**: render with no `type` binding and assert the rendered
  `button.getAttribute('type')` is `'button'`; render with `[type]="'submit'"` and
  assert it is `'submit'`. The second case fails before the change and is the point.
- **ReviewStep**: with the review state set to `price-changed`, assert that
  `[data-testid="status-message"]` renders, that it contains **no** button, and that
  `[data-testid="review-refresh"]` exists and is enabled.
- **Catalogue**: assert that a rendered `CatalogPage` contains no
  `[data-testid="catalog-search"]` and no `[data-testid="search-commit"]`.

### Files this change touches

Ten paths, and no eleventh. Nothing is created: every spec file item 7 needs already
exists.

| # | Path | Item |
|---|---|---|
| 1 | `src/app/features/catalog/catalog-page.ts` | 1 |
| 2 | `src/app/features/catalog/catalog-page.html` | 2 |
| 3 | `src/app/features/catalog/catalog-page.spec.ts` | 3, 7 |
| 4 | `src/app/shared/ui/accessible-dialog/accessible-dialog.html` | 4 |
| 5 | `src/app/shared/ui/accessible-dialog/accessible-dialog.spec.ts` | 7 |
| 6 | `src/app/shared/ui/button/button.html` | 5 |
| 7 | `src/app/shared/ui/button/button.spec.ts` | 7 |
| 8 | `src/app/features/checkout/review-step.html` | 6 |
| 9 | `src/app/features/checkout/review-step.ts` | 6 |
| 10 | `tests/review-step.spec.ts` **or** `src/app/features/checkout/review-step.spec.ts` | 7 |

Row 10 is the one branch. **FIX-06** row 24 moves that file
(`tests/review-step.spec.ts → src/app/features/checkout/review-step.spec.ts`), so
locate it with `grep -rln "ReviewStep" src tests` rather than typing a path, and record
which side of FIX-06 this commit ran on.

## Out of scope

- **Giving the catalogue a visible search field.** `docs/spec/screens.md:47` allows
  the `q` search to live in the header **or** the list toolbar, and the header's
  exists. Adding a second one would put two writable owners of the same URL
  parameter on one screen. If a toolbar search is wanted, that is a decision for the
  user, not an improvement to make here.
- **The header search being hidden below 1024 px — `FIX-28`.** Do not touch
  `header-nav.html`, `header-nav.scss` or `header-nav.ts`.
- **The catalogue's clear-filters and sort controls — `FIX-24`**, and its inline
  template and styles — **`FIX-14`**. This task deletes sixteen lines from the inline
  template and sixteen from the orphan `.html`; it does not move either file and does
  not switch the decorator to `templateUrl`.
- **The axe violation `FIX-29` owns on the 1×1 input.** `FIX-29` gives that input an
  accessible name. This task removes the element. **Whichever lands second must
  re-run axe and record the result**: if `FIX-29` landed first, its label disappears
  with the element, and the commit body here says so; if this task landed first,
  `FIX-29` has one fewer node to fix and its own evidence must say so. Neither task
  edits the other's files.
- **The contact form's validation bypass — `FIX-20`.** The `Button` `type` finding is
  recorded here as a lead and is not chased. Do not change any `app-button` call site
  to `[type]="'submit'"` in this commit; that is `FIX-20`'s decision to make with its
  own browser evidence.
- **`src/app/shared/ui/status-message/*`.** The primitive matches
  `docs/spec/components.md:206-216`. Under **D1** the spec is right and the call site
  is wrong.
- **`ReviewStep`'s quote states, its `QuoteState` machine and its order-failure
  surface — `FIX-25`.** This task deletes four attribute bindings and one method.
- **Other `sr-only` elements in the repository.** Several are legitimate: a visually
  hidden `<span class="sr-only">` that labels a visible control is not a test-only
  affordance. Only the two named in Evidence are removed. Anything else you notice is
  reported, not deleted.

## How to verify

Run these from the repository root, in order. The package manager is **npm
11.17.0**; there is no pnpm and no mise in this repository.

```bash
npm run build                      # expected exit 0
npx vitest run tests/              # the new and edited specs; expected exit 0
npm run test                       # see the note below — not expected to exit 0
```

`npm run test` is `ng test`, which fails 14 of 14 files at the `db6d295` baseline for
reasons **FIX-04** owns (`BASELINE.md:10`). Run it, record its exit code and its
failure list verbatim, and compare that list against the one taken before this task's
first edit: the bar is that this change added nothing to it, not that the suite is
green. **FIX-43-AC10** is worded the same way and is the criterion.

`npm start` is not part of that block: it is `ng serve` and never exits, so a
sequential run that includes it hangs. Start it separately, in the background, before
the browser checks below, and stop it when finished.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty. Do not run the full Playwright
suite: it rewrites 49 tracked screenshots under `e2e/design/screenshots/`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R20 applies and is the rule item 1 restores**: two focusable controls with no
  accessible name and no visible affordance leave the tab order. AC01 and AC02
  measure it.
- **R21 applies**: a 1×1 px control is four hundred times smaller than the 44×44
  minimum. Removing it is how this task satisfies R21 rather than by resizing
  anything.
- **R23 applies**: the dialog change must not alter focus trapping, dismissal or
  focus restoration. AC04 confirms all three still work after the id is removed.
- **R19 applies**: item 6 leaves the review step's error states distinguishable and
  its refresh affordance present. AC05 confirms it.
- **R12 applies**: the English literal `commit` leaves a Hungarian interface.
- R01–R11, R13–R18, R22, R24, R25: N/A. The change adds no imagery, brand asset or
  aspect ratio (R01, R10, R11), alters no shell, hero, palette or contrast pair
  (R02, R03, R09), introduces no token, spacing, width or font (R04, R05, R06, R07),
  adds and removes no primary or secondary action a user can see (R08), touches no
  price, data source, demo labelling, provider, variant or filter state (R13–R18),
  changes no responsive rule (R22), persists nothing (R24) and invents no content
  (R25). R26 is satisfied by the commit body and the recorded evidence.

## Acceptance criteria

Every browser criterion is checked in a real browser driven through
`mcp__chrome-devtools__*`, at 1x device pixel ratio and light colour scheme.
Reading the diff, a grep, an HTTP 200 and a green unit test are none of them a
browser check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-43-AC01** At 1440 on `http://localhost:4200/telefonok`,
      `document.querySelectorAll('[data-testid="catalog-search"], [data-testid="search-commit"]').length`
      is `0`. It was `2` before the change.
- [ ] **FIX-43-AC02** On the same page, tab from the top of the document to the
      bottom recording `document.activeElement` at each stop. No stop has a
      `getBoundingClientRect()` of 1×1 px, and no stop is a control whose accessible
      name is empty. Record the full tab order.
- [ ] **FIX-43-AC03** The catalogue's search still works end to end from the header:
      at 1440, type `demo` into `[data-testid="header-search-input"]`, submit, and
      confirm the URL gains `q=demo` and the result count changes. This is the
      capability the deleted input pretended to provide; it must be shown to exist
      elsewhere.
- [ ] **FIX-43-AC04** With two dialogs reachable — open the catalogue's filter drawer
      at 390 (`[data-testid="filter-trigger"]`), and separately the product page's
      zoom dialog — confirm for each that `document.querySelectorAll('#dialog-title').length`
      is `0`, that the panel's `aria-label` is non-empty, that focus moves into the
      dialog on open, that `Escape` closes it, and that focus returns to the control
      that opened it. Record a screenshot of each open dialog. An axe run with a
      dialog open reports zero violations and in particular no `duplicate-id`.
- [ ] **FIX-43-AC05** On `/penztar/ellenorzes` with the review status forced to
      `price-changed`, the status banner renders with no close button inside it, and
      `[data-testid="review-refresh"]` is present and enabled. Clicking the refresh
      button re-requests the quote. Record a screenshot of the banner.
- [ ] **FIX-43-AC06** Every visible button in the application still renders
      `type="button"` unless a caller says otherwise: on `/`, `/telefonok`,
      `/telefonok/demo-one-5g` and `/penztar/kosar`, collect
      `[...document.querySelectorAll('button')].map(b => b.type)` and confirm every
      entry is `button`. This is a no-regression check on item 5.
- [ ] **FIX-43-AC07** `grep -rn "dialog-title" src e2e tests` returns nothing and
      exits 1. It returned one line before the change.
- [ ] **FIX-43-AC08** `grep -rn "commitSearch\|onSearchInput\|searchCommit" src`
      returns nothing and exits 1.
- [ ] **FIX-43-AC09** `grep -rn "onDismissStatus" src tests e2e` returns nothing and
      exits 1. It returned five lines before the change.
- [ ] **FIX-43-AC10** The four unit assertions in "What to change" item 7 exist, and
      the `Button` `[type]="'submit'"` case is demonstrated to fail on the pre-change
      code and pass after — record both runs. `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; this task names
      no single spec path, so if it has not landed, record that verbatim.
- [ ] **FIX-43-AC11** `npm run build` exits 0.
- [ ] **FIX-43-AC12** `git status --short` lists exactly the ten paths in "Files this
      change touches" and no eleventh — row 10 at whichever of its two locations
      **FIX-06** has left it, recorded by name. Nothing under `src/mocks/`, nothing
      under `e2e/`, nothing under `docs/`, no `.scss`, and no new file at all: every
      spec this task needs already exists (`accessible-dialog.spec.ts`,
      `button.spec.ts`, the review-step spec and `catalog-page.spec.ts`). A path not on
      the list fails this criterion; report it rather than committing it.

## Commit

This task is exactly one commit covering all four surfaces, because they are one
defect class and the four edits together total fewer than forty changed lines. Do
not bundle it with any other FIX task, and do not commit until every acceptance
criterion above has passed and its output is recorded.

The commit body records three things a later reader will need: that the catalogue's
`q` search is satisfied by the header field per `docs/spec/screens.md:47`; that
`Button`'s `type` input is a candidate mechanism for the contact form's validation
bypass, which **FIX-20** owns and this task did not chase; and which of this task
and **FIX-29** landed first, with the axe result measured after.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: remove test-only catalogue controls and three dead public surfaces
```

## Where this sits in the stream

**FIX-14 must land first.** It moves `CatalogPage`'s inline template into
`catalog-page.html` and its inline styles into `catalog-page.scss`, and its own
extraction diff is pinned to the pre-change line range `67,264p`, which the sixteen
lines this task deletes would invalidate. After FIX-14 there is one copy of the
catalogue markup instead of two, which is what item 1's first branch is written for.

**FIX-29 is either order, with a re-run.** Already stated in "Out of scope": whichever
of the two lands second re-runs axe and records the result in its own commit body.

**Nothing else has to land before this one**, and nothing in the package depends on it.
