# FIX-28 — Restore the mobile search and fix the tablet featured grid

Status: PARTIAL — the mobile search is no longer gated behind a shop-only check, the menu trigger
moved to the header's first child, and the featured grid's breakpoint split from one 720px query
into 640px/1024px per spec (`header-nav.html`, `header-nav.scss`, `header-nav.ts`,
`featured-products.scss`); `header-search.spec.ts` added as this task's unit regression (AC09);
commit 5cac63d. `npm run build` and `npm run test` both exit 0 (AC10). Open: AC01–AC08 are
viewport measurements and interaction checks at 320/390/640/768/1024/1440/1920 and AC11's 44×44
target measurement, none of which a unit spec can produce; all are deferred to the orchestrator's
batched browser-verification pass.
Severity: major
Source: B2 F6, B2 F7, B3 F7 ("Home 390")

## Why this is wrong

`docs/spec/screens.md` S1, under **Mobile**, requires: "readable hero text+CTA before illustration,
16px gutters, stacked shortcut rows, single-column cards, stacked tiles. No compressed desktop
screenshot. **Search is second header row**; menu is accessible drawer." The same file's "Global
geometry and visual contract" section requires: "**Home featured grid: 1/2/4 by
mobile/tablet/desktop**", and fixes the boundaries those three words mean — "Below 640px one
catalogue column. 640–1023px two columns with filter drawer. 1024–1279px 264px sidebar plus
2-column catalogue."

Neither holds. On the home page the search control does not exist at all below 1024 px: it is
`display: none`, it is not in the mobile drawer, and there is no icon that would reveal it. A user
on a phone cannot search from the home page at all. And the featured grid jumps straight from two
columns to four at 720 px, so at the tablet width the spec calls out it shows four 153 px cards
instead of two.

Both are confined to `MarketingLayout`. The catalogue's `ShopLayout` renders the same header
component correctly at every width, so the fix has a working sibling in the same file to copy.
Under decision D1 the specification is right and the code is wrong.

## Evidence

All measurements were taken in a real browser on commit `db6d295`, at 1x device pixel ratio, light
colour scheme.

### 1. The home page has no search below 1024 px

`src/app/core/navigation/header-nav.html:43-57` puts the desktop search inside
`.header__actions`:

```html
        <label class="header__search hidden items-center rounded min-h-10 px-3 lg:flex" data-testid="header-search">
          <span class="sr-only">Keresés a telefonok között</span>
          <input
            class="bg-transparent border-0 outline-none min-w-50 font-inherit h-10"
            type="search"
            name="q"
            ...
          />
        </label>
```

`src/app/core/navigation/header-nav.scss:100-107` and `:253-265` decide when it is visible:

```scss
.header__search {
  display: none;
  ...
}

@media (min-width: 1024px) {
  ...
  .header__search {
    display: flex;
  }
```

Measured `getComputedStyle(document.querySelector('[data-testid="header-search"]')).display` on
`/`: `none` at 320, 390 and 768; `flex` at 1024, 1440 and 1920.

The full-width mobile search row that should cover the narrow widths **exists in the same
template and is switched off for the marketing variant by one line**.
`src/app/core/navigation/header-nav.html:93-111`:

```html
    @if (variant() === 'shop') {
      <div class="mobile-search block px-4 pb-3 pt-2 border-t" data-testid="mobile-search" role="search">
        <label class="mobile-search__field block">
          <span class="sr-only">Keresés a telefonok között</span>
          <input
            ...
            data-testid="mobile-search-input"
            [value]="searchDraft()"
            (input)="onSearchDraftInput($event)"
            (keydown.enter)="commitSearch()"
          />
        </label>
      </div>
    }
```

That `@if` sits **inside** the `@else` branch of `@if (variant() === 'checkout')` which opens at
`header-nav.html:20`, so at that point the variant is already known to be `marketing` or `shop`.
The condition's only effect is to withhold the row from `marketing`.

The stylesheet is already correct for both variants and needs no change: `.mobile-search` is
`display: block` at `header-nav.scss:186-191`, `display: none` from 1024 up at `:275-277`, and the
narrow-width rule at `:281-285` is written against `.header--default`, which
`header-nav.html:22` applies to the marketing **and** the shop header alike.

The drawer does not compensate. `src/app/core/navigation/header-nav.html:113-128` projects only
the two nav links into it:

```html
  <app-mobile-drawer
    id="mobile-drawer"
    [opened]="drawerOpen()"
    label="Menü"
    [triggerEl]="menuTriggerEl()"
    (closed)="closeDrawer()"
  >
    @for (link of navLinks(); track link.label) {
      <a
        class="block no-underline"
        [routerLink]="link.routerLink"
        [fragment]="link.fragment"
        (click)="closeDrawer()"
      >{{ link.label }}</a>
    }
  </app-mobile-drawer>
```

and `navLinks()` at `src/app/core/navigation/header-nav.ts:65-68` returns exactly
`Mobiltelefonok` and `A demóról`. There is no search entry and no search icon anywhere below
1024 px on the home page.

`docs/design/prototype.html` confirms the intent independently: its `header()` function emits
`<form class="header-search" id="header-search">` unconditionally in every non-compact header, with
no width condition at all.

The behaviour the row needs already works from any route.
`src/app/core/navigation/header-nav.ts:95-100`:

```ts
  commitSearch(): void {
    const q = this.searchDraft().trim();
    if (q.length === 0) return;
    void this.router.navigate(['/telefonok'], { queryParams: { q } });
    this.searchDraft.set('');
  }
```

It navigates to the catalogue regardless of which variant rendered the input, so enabling the row
on `marketing` needs **no TypeScript change**.

### 2. The featured grid is four columns at 768

`src/app/features/home/featured-products.scss:39-46` and `:215-223`:

```scss
.featured__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-5);
}

@media (min-width: 540px) {
  .featured__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 720px) {
  .featured { padding: var(--space-10) var(--layout-gutter-desktop); }
  .featured__title { font-size: var(--type-section-title); }
  .featured__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
```

540 and 720 are not the spec's boundaries; 640 and 1024 are. Measured
`getComputedStyle(document.querySelector('[data-testid="featured-grid"]')).gridTemplateColumns` at
768: `153px 153px 153px 153px`. The arithmetic confirms the rules above are the ones in force:
768 − 2 × 48 (`--layout-gutter-desktop`, applied from 720) = 672 content px, minus three 20 px gaps
(`--space-5`) = 612, divided by four = **153**.

### 3. The mobile menu trigger sits on the opposite side from the prototype

`src/app/core/navigation/header-nav.html:81-90` renders the trigger as the **last** child of
`.header__actions`, which carries `margin-left: auto` (`header-nav.scss:93-98`), so it lands at the
far right at 390.

`docs/design/prototype.html:23` emits it **before** the brand:

```js
function header(compact=false){return `<header class="app-header ${compact?'compact':''}"><div class="container header-row">${!compact?'<button class="icon-button mobile-menu" data-action="menu" aria-label="Menü megnyitása">☰</button>':''}${brand()}...
```

This is the **lowest-severity item in this file**. Nothing is broken, clipped or unreachable; the
control is simply on the other side from the reference. It is listed here because it lives in
`header-nav.html`, the shared shell, which is the file this task is already opening — not because
it is comparable in weight to items 1 and 2.

## What to change

### `src/app/core/navigation/header-nav.html` — item 1

Delete the `@if (variant() === 'shop') {` line at line 93 and its closing `}` at line 111, keeping
the `<div class="mobile-search">` block they wrap and re-indenting it by one level. The result is:

```html
    <div class="mobile-search block px-4 pb-3 pt-2 border-t" data-testid="mobile-search" role="search">
      <label class="mobile-search__field block">
        <span class="sr-only">Keresés a telefonok között</span>
        <input
          class="w-full min-h-10 px-3 bg-transparent border border-transparent rounded font-inherit"
          type="search"
          name="q-mobile"
          placeholder="Keresés a telefonok között…"
          autocomplete="off"
          inputmode="search"
          data-testid="mobile-search-input"
          [value]="searchDraft()"
          (input)="onSearchDraftInput($event)"
          (keydown.enter)="commitSearch()"
        />
      </label>
    </div>
  </header>
```

Do not replace the condition with `@if (variant() !== 'checkout')`. The block already sits inside
the `@else` of the checkout test at line 20, so any condition there is dead weight; removing it
outright is the smaller and clearer change.

Change **nothing** in `header-nav.scss` for this item and **nothing** in `header-nav.ts`. The
stylesheet already hides the row from 1024 up and shows it below, for both variants, and
`commitSearch()` already works from the home route.

Correct the stale comment at `src/app/core/navigation/header-nav.ts:10-13`, which now says the
wrong thing: "The `shop` variant **additionally** exposes a full-width mobile search bar below the
header at narrow widths." After this change both non-checkout variants do. Change that sentence and
leave the rest of the comment alone. The comment at `header-nav.scss:1-5` says the same thing and
needs the same correction.

### `src/app/features/home/featured-products.scss` — item 2

Replace the two media queries at lines 215-223 with the spec's own boundaries, splitting the 720
block so that **only the column count moves**:

```scss
@media (min-width: 640px) {
  .featured__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (min-width: 720px) {
  .featured { padding: var(--space-10) var(--layout-gutter-desktop); }
  .featured__title { font-size: var(--type-section-title); }
}

@media (min-width: 1024px) {
  .featured__grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
```

640 and 1024 are not numbers this task invented: they are the boundaries
`docs/spec/screens.md` states for mobile / tablet / desktop in the same paragraph as the
"1/2/4 by mobile/tablet/desktop" requirement.

The `.featured` padding and the `.featured__title` size **stay at 720** deliberately. Moving the
section to `--layout-gutter-desktop` at 720 is a gutter-scale question — `docs/spec/screens.md`
asks for "gutters mobile16px, **tablet24px**, desktop48px minimum" and no tablet gutter token
exists in `src/styles/tokens.css` — and the gutter scale and the shared centreline belong to
**FIX-34**. Do not create a tablet token here, and do not change the 20 px `gap`, which is
**FIX-34**'s too.

**And this task lands before `FIX-34`.** That is the order, not a preference: this task
replaces `featured-products.scss:215-223` as a range, and `FIX-34` rewrites `:4` and
`:220` — the base and the 720 `.featured` padding — onto the 640/1024 ladder with a
tablet step. Run in the other order, the range this task names no longer holds what
this task expects. Landing this one first also means **FIX-34-AC04**
(*"no container still switches its gutter at 540px, 720px or 768px"*) is what
**clears** the 720 block this task deliberately leaves standing, rather than the two
contradicting each other: the gutter leaves 720 in FIX-34's commit, not this one's.
Confirm before starting: `grep -c "min-width: 540px" src/app/features/home/featured-products.scss`
must print `1`. If it prints `0`, FIX-34 has already landed — stop and report rather
than searching for a new range.

`.featured__title { font-size: var(--type-section-title); }` stays inside the surviving
720 block and is **nobody's to move**: FIX-34-AC04 is about gutters, and a type
breakpoint at 720 does not violate it. Record that in the commit body so the next
reader does not read it as a leftover.

### `src/app/core/navigation/header-nav.html` — item 3

Move the `<button #menuTrigger …>` element at lines 81-90 out of `.header__actions` and make it the
**first** child of `.header__inner` at line 26, immediately before the `<a class="brand">`. Move the
element verbatim: every attribute, the `#menuTrigger` reference variable, the `aria-expanded`,
`aria-controls`, `aria-label` and the `(click)` handler stay exactly as they are. Change nothing
else — not `.header__actions`, not `.menu-trigger` in the stylesheet, not `header-nav.ts`.

The `#menuTrigger` template reference variable and the `menuTriggerEl()` computed at
`header-nav.ts:56-62` follow the element wherever it sits in the template, so focus restoration
into the drawer's trigger keeps working. Confirm that in FIX-28-AC07 rather than assuming it.

### Regression test

Add a new spec file `src/app/core/navigation/header-search.spec.ts`, beside the code it tests.
**Not in `tests/`**: `FIX-06` lands before this task and settles where feature specs live — it
moves every feature spec under `src/` and leaves `tests/` holding exactly six shared and contract
files (`FIX-06.md:260-269`). After `FIX-04`, `ng test`'s runner discovers specs with `cwd` set to
the project source root and cannot see a spec outside `src/` (`FIX-06.md:17-21`), and the
`vitest.contract.config.ts` `FIX-06` creates runs `tests/**/*.spec.ts` in a **Node** environment
with no Angular compiler (`FIX-06.md:278-303`), so a TestBed spec placed there is collected by a
runner that cannot compile it. Confirm with `ls tests/`, which must list six entries; if it lists
more, `FIX-06` has not landed — stop and report. Run this spec with `npm run test`; do not use
`npx vitest run <path>`, which after `FIX-06` no longer has a config that includes `src/`.

Copy the setup shape from `src/app/layouts/layouts.spec.ts:11-19` — the `// @vitest-environment jsdom`
pragma, `import '@angular/compiler';`, `TestBed`, `provideZonelessChangeDetection()`. That file
already renders the layouts, so it is the closest working example in the repository.

The spec asserts the three things jsdom can see:

1. `HeaderNav` rendered with `variant = 'marketing'` contains one
   `[data-testid="mobile-search-input"]`. This is the assertion that fails before the fix and
   passes after it.
2. The same holds for `variant = 'shop'`, and `variant = 'checkout'` contains none.
3. In the rendered `marketing` header, `[data-testid="menu-trigger"]` precedes `.brand` in document
   order — `header.querySelector('[data-testid="menu-trigger"]').compareDocumentPosition(header.querySelector('.brand')) & Node.DOCUMENT_POSITION_FOLLOWING` is non-zero.

**Do not attempt a layout assertion in a unit test.** jsdom has no layout engine: it does not apply
component stylesheets and does not evaluate media queries, so
`getComputedStyle(...).display` and `getComputedStyle(...).gridTemplateColumns` return nothing
usable there. Every width-dependent claim in the acceptance criteria below is a real-browser check,
and that is deliberate.

## Out of scope

- **Rebuilding the home page.** `FIX-33` owns making the home page match the prototype — the
  missing headline, the second CTA, the demo banner strip, the shortcut cards, the
  "Minden telefon →" link and the footer CTA bar are all its work. This task changes the header's
  search row, the featured grid's column count, and the position of the menu trigger. Touch
  nothing else in `src/app/features/home/`.
- **The centreline and the spacing scale.** `FIX-34` owns the shared centreline and the grid-gap
  scale. Do not change the 20 px `gap: var(--space-5)` in `featured-products.scss`, do not change
  `--layout-container-max` or any gutter token, and do not introduce a tablet gutter.
- **The home page's three 404-ing quick-filter links.** `FIX-18` owns them. They sit in
  `src/app/features/home/hero.html:100-110`; do not touch that file.
- **UI copy.** `FIX-35` owns correcting text to the spec. Leave every Hungarian string as it is,
  including the placeholder "Keresés a telefonok között…" and the `sr-only` label beside it.
- **The catalogue's clear-filters and sort controls, and the catalogue's own search behaviour.**
  `FIX-24` owns them. The search row you are enabling navigates to `/telefonok?q=…` through code
  that already exists and is unchanged by this task.
- **The mobile drawer's initial focus.** `FIX-30` owns it. You are moving the drawer's trigger, not
  changing what the drawer focuses when it opens.
- **The hidden 1×1 `[data-testid="catalog-search"]` input on the catalogue.** `FIX-29` owns the
  accessibility violation it raises.
- **`src/app/core/navigation/header-nav.scss`'s `.header--checkout .header__inner` rule
  (`:219-221`) — `FIX-27`.** This task edits the file's header comment at `:1-5` only; the two
  regions are disjoint, so either order is safe, but whichever lands second says so in its commit
  body.

## How to verify

Run these in order, from the repository root. The package manager is **npm 11.17.0**; there is no
pnpm and no mise in this repository.

**Step 1 — build.**

```
npm run build
```

Expected exit code 0. This command was measured green on commit `db6d295`.

**Step 2 — unit tests.** This task's spec runs under `ng test`, not `npx vitest run`
(see "Regression test" above). Run `npm run test` before your first edit and again after your
last,
and record both coverage figures in the commit body. There is no target number: the pair is the
evidence that this task did not reduce coverage, and **FIX-08** is what turns the thresholds into
a gate. Do not carry the 56.42 % figure forward — it was measured by `npm run test:unit:coverage`
over the 30 specs under `tests/` only, a runner and a denominator that no longer exist, so it
cannot be compared with anything `ng test` reports. `npm run test` fails 14 of 14 files at the
baseline for a reason **FIX-04** owns; record that rather than treating it as this task's
regression.

**Step 3 — real browser.** Mandatory, and it is what actually proves this task. See
FIX-28-AC01 to FIX-28-AC08. Every check is on `/` or `/telefonok`, both of which are reachable
directly; nothing in this task needs a checkout route, so the `FIX-10` reload defect does not
affect it.

**Step 4 — the existing viewport matrix**, to confirm the new second header row did not introduce
overflow anywhere:

```
npx playwright test e2e/design/viewport-matrix.spec.ts -g "home has no horizontal overflow"
npx playwright test e2e/design/viewport-matrix.spec.ts -g "telefonok has no horizontal overflow"
```

Expect every selected test to pass. Home and Catalogue were both clean at all six widths before
the fix, so any failure here is caused by this change.

Three warnings:

- The suite runs against the **production build** served from `dist/mi-bolt/browser` by
  `scripts/serve-static.mjs` (`playwright.config.ts:52-65`), so step 1 must have run first.
- It **rewrites the 49 tracked screenshots under `e2e/design/screenshots/`**; `git status` will
  show them modified. That is expected. Do **not** use `git restore`, `git checkout --`,
  `git stash`, `git reset` or `git clean` on them.
- The full `npx playwright test` run is red at baseline with 41 failures; **FIX-09** owns those.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` while working on this task: it rewrites tracked files and leaves
the working tree dirty. **Do not run the bare `npx playwright test` either** — the full suite is
270 tests, rewrites all 49 tracked images under `e2e/design/screenshots/`, and is `FIX-09`'s.
**The scoped commands named in "How to verify" are the sanctioned exception and are mandatory**:
run exactly those commands, nothing wider. The two commands together rewrite twelve tracked
images, `e2e/design/screenshots/<viewport>/home.png` and `.../telefonok.png` at all six
viewports. Run them deliberately, read the result, and check `git status --short` afterwards;
anything they wrote is either committed with a stated reason or left out of the commit with a
stated reason.

## Acceptance criteria

Every browser criterion is checked at 1x device pixel ratio, light colour scheme, in a real browser
driven through `mcp__chrome-devtools__*`. Reading the diff, an HTTP 200, a green unit test and a
file listing are none of them a browser check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-28-AC01** On `/` at 320, 390 and 768,
      `getComputedStyle(document.querySelector('[data-testid="mobile-search"]')).display` returns
      `block`, and `document.querySelector('[data-testid="mobile-search-input"]')` is not `null`.
      Before the fix the element did not exist in the DOM at all.
- [ ] **FIX-28-AC02** On `/` at 1024, 1440 and 1920,
      `getComputedStyle(document.querySelector('[data-testid="mobile-search"]')).display` returns
      `none` and
      `getComputedStyle(document.querySelector('[data-testid="header-search"]')).display` returns
      `flex` — i.e. exactly one search control is rendered at every width, never two and never
      zero. State the pair of values for all six widths.
- [ ] **FIX-28-AC03** On `/` at 390, type `Demo` into `[data-testid="mobile-search-input"]` and
      press Enter. The browser navigates to `/telefonok?q=Demo`; record `window.location.href`
      and the result count the catalogue then shows. Capture a screenshot of the home page with
      the search row visible before the interaction.
- [ ] **FIX-28-AC04** On `/` at 768,
      `getComputedStyle(document.querySelector('[data-testid="featured-grid"]')).gridTemplateColumns.trim().split(/\s+/).length`
      returns `2`. It returned `4` (`153px 153px 153px 153px`) before the fix.
- [ ] **FIX-28-AC05** The same expression returns `1` at 320 and 390, `2` at 640 and 768, and `4`
      at 1024, 1440 and 1920. Record all eight returned strings. This is the
      "1/2/4 by mobile/tablet/desktop" requirement of `docs/spec/screens.md` measured at the
      boundaries that file names.
- [ ] **FIX-28-AC06** On `/` at 390,
      `document.querySelector('[data-testid="menu-trigger"]').getBoundingClientRect().left < document.querySelector('.brand').getBoundingClientRect().left`
      is `true`. Capture a screenshot showing the trigger, the brand and the search row together.
- [ ] **FIX-28-AC07** On `/` at 390, click `[data-testid="menu-trigger"]`, confirm the drawer opens,
      press Escape, and confirm
      `document.activeElement === document.querySelector('[data-testid="menu-trigger"]')`. This
      behaviour worked before the move and must still work after it. Record the returned boolean.
- [ ] **FIX-28-AC08** On `/` at each of 320, 390, 768, 1024, 1440 and 1920,
      `document.documentElement.scrollWidth <= window.innerWidth + 1` is `true`, and
      `list_console_messages` reports zero errors. Home was clean at all six widths before the fix;
      the new second header row must not change that.
- [ ] **FIX-28-AC09** `src/app/core/navigation/header-search.spec.ts` exists, asserts the three
      named behaviours in "Regression test" above, and `npm run test` exits 0.
- [ ] **FIX-28-AC10** `npm run build` exits 0, `npm run test` exits 0, and both
      `-g "home has no horizontal overflow"` and `-g "telefonok has no horizontal overflow"`
      Playwright selections pass. Paste the three summary lines.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim.

### Design rules (mi-bolt-design 1.0.1)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- [ ] **FIX-28-AC11** Applicable and asserted above: **R22** (the narrow layout must not be a
      scaled-down desktop page — AC01, AC04, AC05), **R21** (44×44 targets — measure and record the
      rects of the mobile search input and the relocated menu trigger at 390; both must be at least
      44 px in each dimension, and `--size-control` already sets 44), **R20** (keyboard operation,
      visible focus and a meaningful accessible name — tab to the search input at 390 and confirm
      its `sr-only` label "Keresés a telefonok között" is its accessible name and the focus ring is
      visible against the dark header), **R02** (dark header with light shopping surfaces — record
      that the new second row's computed `background` is still `--color-shell-dark`
      `rgb(27, 32, 36)`), **R18** (list filtering, sorting, result count and URL state stay
      consistent — AC03 proves the search writes `q` to the URL and the count follows), **R08**
      (one prominent primary action per decision unit — AC02 proves exactly one search control is
      live at each width).
- [ ] **FIX-28-AC12** Recorded as N/A with reasons: **R01, R03** — the change adds no imagery and
      introduces no new palette. **R04, R06** — no new raw colour or dimension is introduced; the
      only numbers changed are the two breakpoints, both taken from `docs/spec/screens.md`, and
      `FIX-17` and `FIX-34` own tokens and spacing. **R05** — the centreline is not moved;
      `FIX-34` owns it. **R07** — no font or type-scale declaration is touched; the
      `.featured__title` size rule is left where it was on purpose. **R09** — no text/background
      colour pair changes. **R10, R11** — no image markup or aspect ratio is touched. **R12, R15**
      — no Hungarian string is added or edited. **R13, R14, R17, R19, R24, R25** — the change
      reaches no price field, variant logic, component state machine, persistence or offer copy.
      **R16** — the application has exactly one provider. **R23** — no dialog behaviour changes;
      AC07 only proves the existing drawer behaviour survived the move, and `FIX-30` owns dialog
      focus. **R26** — a handoff-practice rule, satisfied by the commit body and the recorded
      evidence rather than by runtime behaviour.

## Commit

This task is exactly one commit. Do not bundle it with another FIX task, and do not commit until
every acceptance criterion above has passed and its output is recorded. The commit carries both
`header-nav.html` changes — the removed `@if` and the moved menu trigger — the two comment
corrections in `header-nav.ts` and `header-nav.scss`, the
`featured-products.scss` breakpoint change, the new spec file, and whichever screenshots under
`e2e/design/screenshots/` the Playwright run actually changed — named explicitly in the commit
body, with the reason.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: mobile search on home and spec breakpoints for the featured grid
```
