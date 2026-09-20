# FIX-34 — Put every page on one centerline and one spacing scale

Status: PARTIAL — `--layout-gutter-tablet: 24px` added to `tokens.css`; every one of the five
named containers (catalogue, product page, checkout shell, primitives showcase, home's hero/
featured/how-it-works) now splits the outer gutter-bearing element from the inner
`max-width: var(--layout-container-max); margin: 0 auto;` element, on the 16/24/48 (mobile/640/
1024) ladder; the grid gap is `var(--space-6)` (24px) on both grids; worktree commit (sha filled
in by the orchestrator after cherry-pick). Several files had moved since this document was
written and the fix was applied to the tree as it now stands, not to the document's stale line
numbers: (1) `catalog-page.ts` no longer carries inline `template`/`styles` — **FIX-60** already
extracted them into real `catalog-page.html`/`.scss` files, so this task edited
`catalog-page.scss` directly rather than an inline TS block; (2) the catalogue's actual card
grid (the `gap: var(--space-5)` this task targets) had already moved out of `catalog-page.*`
entirely by that same FIX-60 extraction, into `src/app/shared/ui/async-content/async-content.scss`'s
`.grid` (confirmed — `catalog-page.spec.ts`'s own comments say "FIX-60 moved the grid rules out
of CatalogPage into AsyncContent, which now owns the `[data-testid="catalog-grid"]` element"), so
the gap fix landed there instead of the document's named `catalog-page.ts:351`; (3)
`product-page.scss` and `checkout-layout.scss` have evolved past the document's quoted line
numbers (post-FIX-26/FIX-50/FIX-56) but keep the same `.page`/`.layout-main` shape the document
describes, so the same outer/inner split was applied to the current file content. `featured-products.scss`'s and `how-demo-works.scss`'s `.featured`/`.how` gutter rules were pulled out of
their surviving 720px block into new 640px (gutter only) and 1024px (full rule, matching the
former 720px values) rules, leaving `.featured__title`, `.featured__header`, `.featured__all-link`,
`.how__title`, `.how__grid` and `.how__header` at their existing 720px breakpoint untouched, per
this document's own carve-out for `.featured__title`. `checkout-layout.scss`'s `.steps { gap:
var(--space-4) }` rule, bundled in the same single 768px block the document says to "replace…
with the 640/1024 ladder", moved to 1024 along with the gutter since the document draws no
distinction for it. **The defect this document found and did not fix — `hero.scss`'s
`.hero-shortcuts` section (added by FIX-33 after this document was written) declaring
`max-width: var(--layout-container-max)` and non-zero horizontal `padding` on the same
selector, needing an inner wrapper element in `hero.html` this document did not authorize
— is now fixed**, in a separate worktree commit (sha given in the executor's report to
the orchestrator, who rewrites it here after cherry-pick). `.hero-shortcuts` now carries
only the gutter-bearing background and padding, on the same 16/24/48 (mobile/640/1024)
ladder as `.hero` right above it in the same file; a new `.hero-shortcuts__inner` wrapper
(added to `hero.html`, wrapping the three shortcut cards) carries `max-width:
var(--layout-container-max); margin: 0 auto` and the `flex-direction` layout switch that
previously lived on `.hero-shortcuts` itself. Covered by a new structural assertion in
`home-page.spec.ts` (the outer/inner split renders); the shared centerline itself is a
real-browser measurement, deferred to the orchestrator's batched browser-verification
pass along with this document's own AC05–AC07. Open: AC05,
AC06 and AC07 are real-browser measurements deferred to the orchestrator's batched
browser-verification pass.
Severity: major
Source: B3 F7 (Catalogue row, Grid gap row), B3 R05 fail, B3 R06 fail

## Why this is wrong

`docs/spec/screens.md:9` fixes the page geometry in one sentence:

```text
Container max1320px; gutters mobile16px, tablet24px, desktop48px minimum. Desktop
12-column alignment, gap24px, header64px. At1440px content margin60px.
```

Two of those clauses are broken. **The centerline is not shared:** the home page's
sections put the gutter padding *outside* the 1320px box, so their content is 1320px wide
with a 60px margin at 1440, exactly as the spec says; the catalogue, the product page, the
checkout shell and the primitives showcase put the same padding *inside* the same box, so
their content is 1224px wide with a 108px margin. **And the tablet gutter does not
exist:** every one of those containers steps straight from 16px to 48px, so between 640px
and 1023px nothing renders the 24px the spec names, and the step fires at four different
widths depending on which file you read. The grid gap is the third miss: the home featured
grid and the catalogue grid use `var(--space-5)` (20px), which is on the 4px grid but off
the 8px one that `screens.md:9` and design rule **R06** ask for and that the rest of the
same pages already follow.

Design rules **R05** ("Align content to a shared centerline; desktop content width must
not exceed 1320 px") and **R06** ("Use a 4 px spacing system, generally in 8 px
increments") are live criteria in this file, not N/A. Under **D1** the specification is
right and the stylesheets are wrong.

## Evidence

### The two container patterns

The repository already contains both. The home pattern, `src/app/features/home/featured-products.scss:1-13`:

```scss
.featured {
  background: var(--color-surface-light);
  color: var(--color-text-primary);
  padding: var(--space-9) var(--layout-gutter-mobile);
  border-top: 1px solid var(--color-border-subtle);
}

.featured__inner {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  max-width: var(--layout-container-max);
  margin: 0 auto;
}
```

The padding sits on the outer element and the `max-width` on the inner one, so the
content box is the full 1320px. `hero.scss:14-26` and `how-demo-works.scss:15-22` are
built the same way.

The other pattern, live in `src/app/features/catalog/catalog-page.ts:274-287` — note this
is the **inline `styles:` block inside the TypeScript file**, see the warning below:

```ts
      .catalog {
        display: flex;
        flex-direction: column;
        gap: var(--space-7);
        max-width: var(--layout-container-max);
        margin: 0 auto;
        padding: var(--space-6) var(--space-4);
      }

      @media (min-width: 1024px) {
        .catalog {
          padding: var(--space-7) var(--layout-gutter-desktop);
        }
      }
```

One element carries both the `max-width` and the padding. `src/styles/primitives.css:7-9`
sets `box-sizing: border-box` on every element:

```css
*, *::before, *::after {
  box-sizing: border-box;
}
```

so the 48px padding is subtracted from the 1320px, not added to it. At 1440 the element is
1320px wide starting at x=60, and its **content** is 1224px starting at x=108 — which is
exactly the `1224px / 108px` B3 measured.

Three more files repeat that shape:

- `src/app/features/product/product-page.scss:7-15` plus its desktop override at `:185-188`
  (`padding: var(--space-8) var(--layout-gutter-desktop) var(--space-10)` at ≥1024px);
- `src/app/layouts/checkout-layout.scss:5-13` plus `:64-67`
  (`padding: var(--space-7) var(--layout-gutter-desktop) var(--space-8)` at ≥768px);
- `src/app/features/primitives-showcase/primitives-showcase.scss:3-9` plus `:75-78`.

### A correction to the finding this task was written from

B3 F7 records "live content width **1224px / 108px** at 1440 while home and product use
**1320px / 60px** — the app does not share one centerline". The measurement of the
catalogue is right and the conclusion is right, but **the claim about the product page is
not.** `product-page.scss:185-188` gives `.page` the same inside-the-box 48px padding at
≥1024px, so the product page's content is 1224px at 1440, not 1320px. B3 most likely
measured the border box of `.page` (1320 wide at x=60) on the product page and the content
box on the catalogue.

So the divergence is wider than reported: **home is the outlier and four pages are wrong**,
rather than the catalogue being the single outlier. What would settle it beyond doubt is
one sweep that names the element it measures — see AC05, which does exactly that on all
five routes with one selector list.

### The gap

`src/app/features/home/featured-products.scss:39-46`:

```scss
.featured__grid {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-5);
}
```

`src/app/features/catalog/catalog-page.ts:348-353`:

```ts
      .grid {
        display: grid;
        grid-template-columns: repeat(1, minmax(0, 1fr));
        gap: var(--space-5);
        min-height: 240px;
      }
```

`src/styles/tokens.css:46` defines `--space-5: 20px`. B3 measured 20px on both grids at
both 1440 and 390, while the same home page's hero (24/40px), how-it-works (16px) and
footer (40px) grids are all 8px multiples.

### A trap in the catalogue files

`src/app/features/catalog/catalog-page.html` and `catalog-page.scss` **exist and are
dead**. `catalog-page.ts` declares an inline `template:` at line 66 and an inline
`styles:` at line 266, and carries no `templateUrl` and no `styleUrl`:

```bash
grep -n "styleUrl\|templateUrl" src/app/features/catalog/catalog-page.ts   # prints nothing
grep -rn "catalog-page.scss" src/                                          # prints nothing
```

Editing `catalog-page.scss` changes nothing that renders. Every catalogue edit in this
task goes into the inline block in `catalog-page.ts`. `FIX-14` owns moving those blocks
into files and deciding what happens to the orphan pair; this task must not do it, because
doing both at once makes the diff unreviewable.

## What to change

### 1. Add the tablet gutter token

`src/styles/tokens.css`, in the layout block at lines 82–85, between the mobile and
desktop entries:

```css
  --layout-gutter-tablet: 24px;
```

24 is read from `docs/spec/screens.md:9` ("gutters mobile16px, tablet24px, desktop48px
minimum"). It is not chosen here.

### 2. One container pattern, one set of breakpoints

Every page container adopts the home pattern: **an outer element that carries the gutter
padding and no `max-width`, and an inner element that carries
`max-width: var(--layout-container-max); margin: 0 auto;` and no horizontal padding.**

The breakpoints come from `docs/spec/screens.md:11`, which defines the three bands:
"Below640px one catalogue column. 640–1023px two columns with filter drawer.
1024–1279px 264px sidebar plus2-column catalogue." So the gutter ladder is
`16px` below 640, `24px` from 640 to 1023, `48px` from 1024 up — one ladder, used by every
container. Do not invent a fourth step and do not keep the 540px and 720px steps the home
components use today for their gutters.

**Catalogue** — in `src/app/features/catalog/catalog-page.ts`'s inline `styles:` block,
replace lines 268–287 with:

```ts
      :host {
        display: block;
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        padding: var(--space-6) var(--layout-gutter-mobile);
      }

      @media (min-width: 640px) {
        :host { padding: var(--space-6) var(--layout-gutter-tablet); }
      }

      @media (min-width: 1024px) {
        :host { padding: var(--space-7) var(--layout-gutter-desktop); }
      }

      .catalog {
        display: flex;
        flex-direction: column;
        gap: var(--space-7);
        max-width: var(--layout-container-max);
        margin: 0 auto;
        padding: 0;
      }
```

The host element is the outer box and `.catalog` the inner one, so no template change is
needed.

**Product page** — `src/app/features/product/product-page.scss`, apply the same split:
move the horizontal padding from `.page` to `:host` with the three-step ladder, and leave
`.page` with `max-width`, `margin: 0 auto` and vertical padding only. Keep the
`padding-bottom: calc(env(safe-area-inset-bottom) + 8rem)` rule at `:159-162` on `.page`
— it reserves the sticky buy rail's height and is not a gutter.

**Checkout shell** — `src/app/layouts/checkout-layout.scss`, same split between `:host`
(lines 1–3, which is already an empty `display: block`) and `.layout-main`. Replace the
single `@media (min-width: 768px)` step at `:64-67` with the 640/1024 ladder.

**Primitives showcase** — `src/app/features/primitives-showcase/primitives-showcase.scss`,
same split, same ladder.

**Home** — `hero.scss:17` and `:130`, `featured-products.scss:4` and `:220`, and
`how-demo-works.scss:15` and `:97` already use the outer-padding pattern; only their
breakpoints move, from 720px to the 640/1024 ladder, and they gain the tablet step.
**`featured-products.scss`'s two numbers are the pre-`FIX-28` ones and FIX-28 lands
first**, so locate that file's `.featured` padding declarations by selector rather than
by line: `grep -n "\.featured {" src/app/features/home/featured-products.scss` returns
the base rule and the one inside the surviving `@media (min-width: 720px)` block, and
those two are what move. Do not touch `.featured__grid` at any width, and do not move
`.featured__title`'s `font-size` out of 720.

### 3. One grid gap

`src/app/features/home/featured-products.scss:45` and
`src/app/features/catalog/catalog-page.ts:351`: `gap: var(--space-5)` becomes
`gap: var(--space-6)`. That is 24px, the number `docs/spec/screens.md:9` gives
("Desktop 12-column alignment, gap24px") and an 8px multiple, so **R06** passes.

Leave `--space-5` in the token file. It is used elsewhere for padding, and deleting a
token is not this task's business.

### Files this change touches

Eight paths. `git status --short` must list nothing under `e2e/`.

- `src/styles/tokens.css`
- `src/app/features/catalog/catalog-page.ts` (the inline `styles:` block only)
- `src/app/features/product/product-page.scss`
- `src/app/layouts/checkout-layout.scss`
- `src/app/features/primitives-showcase/primitives-showcase.scss`
- `src/app/features/home/hero.scss`, `featured-products.scss`, `how-demo-works.scss`

## Out of scope

- **`e2e/design/viewport-matrix.spec.ts` — not edited by this task.** An earlier draft
  listed it as *"the spec file that gains the assertion in AC05"*; **FIX-34-AC05** is a
  real-browser criterion that names no spec file, and this task forbids
  `npx playwright test`, so an assertion added there could be neither run nor proved
  failing-first from inside this commit. The centreline property is measured in a real
  browser by AC05 and AC06, which is what `.claude/rules/browser-verification.md` asks
  for. The file's regions belong to **FIX-39** (its `test.skip(` guard),
  **FIX-57** (it reads the matrix for `design-review.md`) and **FIX-68**.

- **`FIX-17`** owns replacing hardcoded colour and spacing literals with the existing
  tokens at component level. This task changes *which* token a container uses and *where*
  the padding sits; it adds one token and no literal. If a component-level literal turns
  up while editing, leave it and let FIX-17 have it.
- **`FIX-14`** owns the inline templates and styles, including the dead
  `catalog-page.html` / `catalog-page.scss` pair. This task edits only the live inline
  block and deletes nothing.
- **`FIX-33`** owns the home page's content: the hero copy, the shortcut cards, the
  featured header link, the footer bar and the new `--type-hero` tokens. This task touches
  the home stylesheets only for gutters, breakpoints and the grid gap. If FIX-33 has
  already landed, re-read `hero.scss` before editing: its line numbers will have moved.
- **`FIX-28` owns `featured-products.scss`'s grid-column breakpoints, and it lands
  before this task.** It replaces `:215-223` with a 640 grid query, a surviving
  `@media (min-width: 720px)` block holding `.featured`'s padding and
  `.featured__title`'s size, and a 1024 grid query
  (`FIX-28.md:236-248`). This task then moves the **gutter** out of that 720 block onto
  the 640/1024 ladder, which is what **FIX-34-AC04** requires; do not touch
  `.featured__grid`'s `grid-template-columns` at any width — that is FIX-28's, at 640
  and 1024 — and leave `.featured__title`'s `font-size` at 720, which is nobody's to
  move and does not violate AC04 because AC04 is about gutters. Before editing, run
  `grep -n "min-width" src/app/features/home/featured-products.scss`: three queries at
  640, 720 and 1024 mean FIX-28 has landed; a 540 query means it has not — stop and
  report.
- **`FIX-27`** owns the three horizontal-overflow bugs. AC06 below only measures overflow
  as a regression guard; it does not repair one.
- **`FIX-26`** owns the product page's mobile single-column collapse and the sticky buy
  rail. This task does not change `.layout`'s `grid-template-columns` anywhere.
- Do not change `--layout-container-max`. 1320px is correct and is what
  `docs/spec/screens.md:9` requires.

## How to verify

Run from the repository root. The package manager is **npm**, never pnpm.

```bash
npm run build
```

Expected: exit `0`, unchanged from the `db6d295` baseline.

```bash
npm run test
```

Expected: exit `0`. If a spec asserts a padding or a gap value that this task changed, the
assertion is updated in the same commit and the spec line quoted in the commit body.
`layouts.spec.ts` and `home-page.spec.ts` are `src/app/layouts/layouts.spec.ts` and
`src/app/features/home/home-page.spec.ts` once **FIX-06** has landed (rows 18 and 17) —
the same suite `ng test` already collects together with the catalogue's own co-located
specs, `src/app/features/catalog/catalog-page.spec.ts` and `product-card.spec.ts`; there
is no separate runner to name any more. That suite fails 14 files out of 14 at the
baseline with `ReferenceError: document is not defined`. `FIX-04` owns making it pass. So
do not try to prove the catalogue change through a command of its own; AC05 and AC07
measure it in a browser, which is where a container width is observable anyway.

```bash
npm run lint
```

Expected: exit `0`, once **FIX-01** has landed — that task repairs `ng lint`'s broken
schema; before it lands, `npm run lint` cannot run at all (`BASELINE.md:9`), which is not
this task's to fix. `npm run check:test-policy`, the gate this step used to run, is
deleted under D17, and its owner is no longer **FIX-39** but **FIX-46**, which moves the
requirement into an ESLint `no-restricted-syntax` rule. The expected result here holds
either way FIX-46 stands relative to this task: if FIX-46 has not yet landed, the rule
does not exist yet, so `npm run lint` enforces nothing about skipped specs and simply
exits `0`; if FIX-46 has landed, it lands strictly after **FIX-39** removes the thirteen
skipped specs the old gate used to flag, so by then there is nothing left for the new rule
to catch and `npm run lint` still exits `0`.

Do **not** run `npx playwright test` here. `e2e/design/viewport-matrix.spec.ts` rewrites
49 screenshots under `e2e/design/screenshots/` and leaves the working tree dirty, and its
overflow failures at 320 and 390 belong to `FIX-27`. AC05 is measured in a real browser
instead.

`npm start` is not part of a sequential block to run to completion: it is `ng serve`
and never exits, so a literal run of it as one more step in this sequence hangs. Start
it separately, in the background, before AC05 and AC06 below, and stop it when
finished.

## Acceptance criteria

- [ ] **FIX-34-AC01** `src/styles/tokens.css` contains `--layout-gutter-tablet: 24px;`,
      and `grep -rn "24px" src/app/` returns no new occurrence introduced by this task —
      the number lives in the token file only.
- [ ] **FIX-34-AC02** No stylesheet in `src/app/` declares `max-width:
      var(--layout-container-max)` and a non-zero horizontal `padding` on the same
      selector. Check by reading each of the five containers named in "What to change";
      each must have its gutter padding on a different element from its `max-width`.
- [ ] **FIX-34-AC03** `grep -rn "gap: var(--space-5)" src/app/features/home/featured-products.scss
      src/app/features/catalog/catalog-page.ts` returns nothing, and both grids declare
      `gap: var(--space-6)`.
- [ ] **FIX-34-AC04** Every container named in "What to change" declares its gutter at
      exactly three widths — the base rule, `@media (min-width: 640px)` and
      `@media (min-width: 1024px)` — and no container still switches its gutter at 540px,
      720px or 768px.
- [ ] **FIX-34-AC05** **Real-browser check of the shared centerline at 1440.** Through the
      `real-browser-sonnet` agent at viewport 1440×900, open each of `/`, `/telefonok`,
      `/telefonok/demo-one-5g`, `/penztar/kosar` and `/primitives`, and on each run

      ```js
      (sel) => { const el = document.querySelector(sel);
                 const r = el.getBoundingClientRect();
                 const cs = getComputedStyle(el);
                 return { left: r.left,
                          content: r.width
                                   - parseFloat(cs.paddingLeft)
                                   - parseFloat(cs.paddingRight),
                          layoutWidth: document.documentElement.clientWidth,
                          innerWidth: window.innerWidth }; }
      ```

      with `sel` = `.featured__inner` on `/`, `.catalog` on `/telefonok`, `.page` on the
      product page, `.layout-main` on the cart and `.showcase` on `/primitives`.

      Three assertions over the five returns, and **`left` is derived rather than asserted as
      a constant**:

      1. All five return `content` = `1320`. That number is
         `docs/spec/screens.md:9`'s and is what `--layout-container-max` carries; this task
         does not change it.
      2. All five return the **same** `left` as each other. That is the shared centreline,
         which is the whole subject of this criterion.
      3. That shared value equals `(layoutWidth − 1320) / 2`, computed from the
         `layoutWidth` the same call returned. At 1440 with no scrollbar taking layout space
         this is `60`; with a classic scrollbar `layoutWidth` is smaller and so is `left`,
         and the centreline is still correct. Asserting `60` outright would fail a correct
         implementation in a browser that renders classic scrollbars, and a `±1` tolerance
         would be a number this file invented — `.claude/rules/planning-deliverables.md`
         forbids an agent-chosen number as a gate. Record `left`, `content`, `layoutWidth`
         and `innerWidth` for all five, verbatim, so a reader can see whether a scrollbar was
         present.

      This is the criterion that settles the contradiction named in the Evidence section,
      because it names the element it measures.
- [ ] **FIX-34-AC06** **Real-browser check at 768 and 390.** Same session, same five
      routes. At 768 all five must return the same `left` value as each other and that
      value must be `24`. At 390 all five must return `left` = `16`. On every route at
      both widths, `document.documentElement.scrollWidth` is not greater than
      `window.innerWidth + 1`; where a route already overflowed at the baseline, report
      the number and name `FIX-27` rather than repairing it here. `24` and `16` are
      asserted as constants here and `left` is not derived, because at 768 and 390 the
      container's max-width exceeds the viewport: the block is full-width minus its
      gutter, so `left` **is** the gutter and a scrollbar does not move it. Record
      `document.documentElement.clientWidth` alongside anyway, so the two criteria's
      records are comparable.
- [ ] **FIX-34-AC07** **Real-browser check of the grid gap.** At 1440 on `/`,
      `getComputedStyle(document.querySelector('[data-testid="featured-grid"]')).gap`
      returns a value whose column component is `24px`; at 1440 on `/telefonok`, the same
      call on `[data-testid="catalog-grid"]` returns `24px`. Screenshots of both, placed beside
      `docs/design/screenshots/home-1440.png` and `catalogue-1440.png`.
      `list_console_messages` returns zero errors on every route visited in AC05–AC07.
- [ ] **FIX-34-AC08** `npm run build` exits `0` and `npm run test` exits `0`, covering
      `src/app/layouts/layouts.spec.ts` (**FIX-06** row 18).
- [ ] **FIX-34-AC09** **Design rules.** The `mi-bolt-design` R01–R26 table is recorded in
      the commit body. **R05** and **R06** are the two this task exists for and both are
      marked met, with the AC05, AC06 and AC07 numbers quoted as the evidence. **R22** is
      applicable and met: AC06's 390 measurements show the narrow layout is not a
      scaled-down desktop page. **R04** is applicable and met: the one new value is a
      token, and the token set was read before it was added. Mark
      **R01, R02, R03, R07, R08, R09, R10, R11, R12, R13, R14, R15, R16, R17, R18, R19,
      R20, R21, R23, R24, R25** N/A, each with a one-sentence reason — for example
      "R20 N/A: this task changes container padding and grid gap and adds, removes or
      renames no interactive element." **R26** is applicable and met by the commit body
      listing the files, the commands, their exit codes, and the B3 contradiction named in
      the Evidence section as a stated remaining limitation that AC05 resolved.
      Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
      the design rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with `FIX-33`, `FIX-17` or any other
FIX task, even though it touches the same stylesheets. Commit only after every acceptance
criterion above passes, including the three-width browser pass.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`):

```text
fix: one container centerline and one gutter ladder across every page
```

Nothing in this package is pushed by the executor. The push and the pull request belong
to the orchestrating session.
