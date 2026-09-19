# FIX-26 — Collapse the product page to one column on mobile and make the buy rail stick

Status: PLANNED — not executed.
Severity: blocker
Source: B2 F1, B2 F18, B3 R22 (fail)

## Why this is wrong

`docs/spec/screens.md` S3 requires, under **Mobile**: "one column gallery then product
info/options; specs follow" and "A compact sticky rail shows price+same add action and status;
only one responsive primary control is focusable at a time". The same file's "Global geometry
and visual contract" section adds "Fixed buy rails reserve their height plus safe-area; no focus
can be hidden under a rail" and "Layout must be verified at 320, 390, 768, 1024, 1440, 1920".
`docs/spec/acceptance.md` **AC07** makes the no-overflow half a release gate.

The implementation does none of it. The product page keeps a fixed two-column grid at every
width, so at 320 px the gallery and the buy panel are squeezed into 154 px and 110 px and the page
scrolls sideways. The rail that is supposed to carry the price and the add action to the bottom of
the viewport sits in normal page flow and scrolls out of sight, and the in-flow CTA it duplicates
is never hidden, so two "Kosárba teszem" controls are focusable at the same time. Under decision
D1 the specification is right and the code is wrong. This is also the clearest failure of design
rule **R22** ("The narrow layout must not be a scaled-down image of the entire desktop page") in
the application — it is a live criterion in this task, not an N/A.

## Evidence

All measurements were taken in a real browser on commit `db6d295`, at 1x device pixel ratio,
light colour scheme.

**1. The two-column grid is the base rule, not the desktop rule.**
`src/app/features/product/product-page.scss:24-29`:

```scss
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
        gap: var(--space-6);
        align-items: start;
      }
```

There is no narrow-width override. The only other rule that touches `.layout` is
`src/app/features/product/product-page.scss:185-194`, which restates the same two tracks at
`@media (min-width: 1024px)`:

```scss
      /* T16-AC01 — desktop layout. */
      @media (min-width: 1024px) {
        .page {
          padding: var(--space-8) var(--layout-gutter-desktop) var(--space-10);
        }

        .layout {
          grid-template-columns: minmax(0, 7fr) minmax(0, 5fr);
          gap: var(--space-6);
        }
      }
```

The measured computed values follow from those two rules exactly:

| Width | `getComputedStyle('.layout').gridTemplateColumns` | Arithmetic |
|---|---|---|
| 320 | `154px 110px` | (320 − 2×16 gutter − 24 gap) × 7/12 and × 5/12 |
| 390 | `194.828px 139.172px` | (390 − 2×16 gutter − 24 gap) × 7/12 and × 5/12 |

`--layout-gutter-mobile: 16px` and `--space-6: 24px` are defined at
`src/styles/tokens.css:84` and `src/styles/tokens.css:47`. The arithmetic reproducing the
measurement to the pixel is what confirms that this SCSS file is the rule in force.

The block comment at `src/app/features/product/product-page.ts:30-33` claims the opposite of what
the stylesheet does: "At < 1024 px the layout collapses to a single column — gallery,
configuration and specifications stack vertically (T16-AC01, R22)." The comment asserts a
correctness the code does not have.

**2. The page overflows horizontally.** Measured `document.documentElement.scrollWidth` against
`window.innerWidth` on `/telefonok/demo-one-5g`:

| Width | scrollWidth | innerWidth | Overflow |
|---|---|---|---|
| 320 | 368 | 320 | 48 px |
| 390 | 408 | 390 | 18 px |
| 768 / 1024 / 1440 / 1920 | — | — | none |

**3. The rail is in normal flow.** `src/app/features/product/product-page.html:121-142` renders
the rail as the last child of the page root element, `.page` — which is a `<main>` today and which
**FIX-29** changes to a `<div>` to fix a landmark violation, so read the tag off the file rather
than off this quote:

```html
      @if (showStickyRail()) {
        <aside class="rail" data-testid="purchase-rail" aria-label="Kosárba helyezés">
```

`src/app/features/product/product-page.scss:150-182` declares it:

```scss
      .rail {
        display: none;
      }

      @media (max-width: 1023px) {
        .page {
          padding-bottom: calc(env(safe-area-inset-bottom) + 8rem);
        }

        .rail {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          position: sticky;
          bottom: 0;
          left: 0;
          right: 0;
```

**Contradiction to settle before changing anything.** B2 F18 reports that the
`complementary "Kosárba helyezés"` block measured `position: static` "at any width". The source
above declares `position: sticky` below 1024 px, so the two disagree. Both readings are consistent
with the observed behaviour ("sits in normal flow and scrolls away") for a reason that is worth
stating: `position: sticky` with `bottom: 0` constrains the element to its containing block, which
here is the padding box of `.page`. Because the rail is the **last** in-flow child of `.page`, its
only sticking range is the roughly 128 px of bottom padding that `padding-bottom: calc(...+ 8rem)`
adds — it therefore scrolls with the page for the entire document and arrives at the viewport
bottom only at the very end. Whichever of the two readings is correct, the rail does not stay with
the user. **Step 1 of this task is to re-measure the computed value and record it** (see "How to
verify"); the fix below is the same either way.

**4. Two primary CTAs are focusable at once below 1024 px.**
`src/app/features/product/product-page.html:88-100` renders the in-flow CTA in
`<div class="cta-desktop">`, and `src/app/features/product/product-page.scss:112-116` gives
`.cta-desktop` no width-dependent rule at all, so it stays visible under the rail's own CTA at
320 / 390 / 768. This is the "duplicate CTA appearing twice down the page" B2 observed; it is a
symptom of items 3 and 4, not a separate bug.

**5. `position: fixed` will resolve against the viewport here.** `position: fixed` is neutralised
by an ancestor carrying `transform`, `filter`, `contain` or `will-change`. There is none:
`src/app/layouts/shop-layout.scss`, `src/app/shared/shell/app-shell.scss`,
`src/styles/primitives.css` and `src/styles/tokens.css` contain no such declaration, and
`.page` uses `position: relative` (`src/app/features/product/product-page.scss:8`), which creates
a containing block for `absolute` but not for `fixed`.

**6. Edit the SCSS, not the utility classes.** `src/styles.css:6` imports Tailwind v4
(`@import 'tailwindcss';`), which emits its utilities inside
`@layer theme, base, components, utilities`. Angular component styles are not in any cascade
layer, and unlayered declarations beat layered ones regardless of specificity. Every rule in
`product-page.scss` therefore wins over any Tailwind class on the same element. Changing a utility
class in the template will not change the rendering.

## What to change

### `src/app/features/product/product-page.scss`

**a. One column below 1024 px.** Change the base `.layout` rule at line 24-29 so its single
declared track is the full-width one. Leave the `@media (min-width: 1024px)` block at line 190-193
exactly as it is — it is what restores the two columns on desktop.

```scss
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-6);
        align-items: start;
      }
```

1024 is not a new number: it is already the breakpoint this same file uses for `.page` padding
(line 185), for the rail (line 159) and for the `.buy` column, and it is the boundary
`docs/spec/screens.md` names in "1024–1279px 264px sidebar plus 2-column catalogue".

**b. Pin the rail to the viewport.** Inside the existing `@media (max-width: 1023px)` block at
line 159, change the rail's `position: sticky` to `position: fixed`. `docs/spec/screens.md`
sanctions this wording directly: "Fixed buy rails reserve their height plus safe-area". Keep
`bottom: 0; left: 0; right: 0;` and every other declaration in that rule unchanged — the
`padding-bottom: calc(env(safe-area-inset-bottom) + var(--space-3))`, the border, the shadow and
`z-index: 10` are all still correct.

**c. Hide the in-flow CTA where the rail is showing.** In the same `@media (max-width: 1023px)`
block, add:

```scss
        .cta-desktop {
          display: none;
        }
```

This is what "only one responsive primary control is focusable at a time"
(`docs/spec/screens.md` S3) requires. `display: none` removes the element from the tab order and
from the accessibility tree; do not use `visibility: hidden` or `opacity: 0`, which do not.

**d. Do not change the height reservation.** `.page`'s
`padding-bottom: calc(env(safe-area-inset-bottom) + 8rem)` at line 160-162 already reserves space
so the fixed rail cannot cover page content or keyboard focus. Measure the rail's height once the
rail is fixed and record the number in the task evidence. Change the 8rem only if the measurement
shows the rail is taller than the reservation, and if you change it, record both numbers.

**e. If FIX-26-AC05 fails on an otherwise correct implementation.** A browser's scroll-into-view on
Tab has no knowledge of the fixed rail overlay, so a focused control can land underneath it even
when (a)-(d) are implemented correctly. If AC05 fails, add
`scroll-padding-bottom: <rail height + safe area>` to the scrolling root and record the value used.

### `src/app/features/product/product-page.ts`

Correct the block comment at lines 30-33 and 47-53 so it describes what the stylesheet now does.
The comment currently promises a single-column collapse and a sticky rail that did not exist; once
(a) to (c) land it is true, except that the rail is `fixed` rather than `sticky`. Change the word
`sticky` to `fixed` in the sentence at lines 47-48 and leave the rest of the comment alone.

### If overflow survives the column change

The 48 px overflow at 320 is expected to disappear with (a), because it came from content that
could not fit a 154 px track. If `document.documentElement.scrollWidth` still exceeds
`window.innerWidth` afterwards, find the responsible element in the browser with:

```js
Array.from(document.querySelectorAll('*'))
  .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
  .map((el) => `${el.tagName}[class="${el.getAttribute('class')}"] right=${Math.round(el.getBoundingClientRect().right)}`);
```

and fix the offending `min-width` / `white-space` inside `src/app/features/product/` only. Report
the element and the value you changed.

### Regression test

Add a new spec file `src/app/features/product/product-page-responsive.spec.ts`, beside the code it
tests. **Not in `tests/`**: `FIX-06` lands before this task and settles where feature specs live —
it moves every feature spec under `src/` and leaves `tests/` holding exactly six shared and
contract files (`FIX-06.md:260-269`). After `FIX-04`, `ng test`'s runner discovers specs with `cwd`
set to the project source root and cannot see a spec outside `src/` (`FIX-06.md:17-21`), and the
`vitest.contract.config.ts` `FIX-06` creates runs `tests/**/*.spec.ts` in a **Node** environment
with no Angular compiler (`FIX-06.md:278-303`), so a TestBed spec placed there is collected by a
runner that cannot compile it. Confirm with `ls tests/`, which must list six entries; if it lists
more, `FIX-06` has not landed — stop and report. Run this spec with `npm run test`; do not use
`npx vitest run <path>`, which after `FIX-06` no longer has a config that includes `src/`.

Copy the setup shape from `src/app/layouts/layouts.spec.ts:11-19` — the `// @vitest-environment jsdom`
pragma, `import '@angular/compiler';`, `TestBed`, `provideZonelessChangeDetection()`.

The spec asserts the two things jsdom can see:

1. A rendered `ProductPage` contains exactly one element matching
   `[data-testid="purchase-rail"]`, and exactly one `.cta-desktop`.
2. The `.rail` element and the `.cta-desktop` element are siblings of distinct parents as in the
   template — i.e. the rail is a direct child of `.page` and the in-flow CTA is inside `.buy`.

**Do not attempt a layout assertion in a unit test.** jsdom has no layout engine: it does not
apply component stylesheets, does not evaluate media queries, and returns empty or zero values for
`getComputedStyle(...).gridTemplateColumns`, `getBoundingClientRect()` and `scrollWidth`. Every
width-dependent claim in the acceptance criteria below is a real-browser or Playwright check, and
that is deliberate.

## Out of scope

- **The grid gap and the page centreline.** `FIX-34` owns the shared centreline and the grid-gap
  scale. Do not change `gap: var(--space-6)`, `--layout-container-max`, or any gutter token.
- **Colour, spacing and token literals.** `FIX-17` owns replacing hardcoded colours and spacing
  with existing tokens. Do not retokenise anything in `product-page.scss` while you are in it.
- **`QuantityControl` and `PriceBlock`.** `FIX-19` owns their vertical-stacking and wrapped-currency
  bugs. Both render inside the area you are changing; leave
  `src/app/shared/ui/quantity-control/` and `src/app/shared/ui/price-block/` untouched.
- **The product page's variant URL, invalid deep link, not-found state and thumbnails.** `FIX-23`
  owns all four. Do not touch `product.facade.ts`, `variant-selection.ts`, `variant-selector.*` or
  `product-gallery.*`.
- **The gallery zoom modal's focus restoration.** `FIX-30` owns it.
- **The nested `<main>` at `product-page.html:2` and `:143`.** `FIX-29` owns it: the page opens a
  second `<main>` inside the shell's, which axe reports as three landmark violations. You will see
  it while editing this page. Leave it; this task changes no line of `product-page.html`.
- **UI copy.** `FIX-35` owns correcting text to the spec. Leave every Hungarian string as it is.
- **Everything outside `src/app/features/product/` and `tests/`**, except the one new spec file.

## How to verify

Run these in order, from the repository root. The package manager is **npm 11.17.0**; there is no
pnpm and no mise in this repository.

**Step 1 — settle the rail contradiction before editing.** Start the dev server, open
`/telefonok/demo-one-5g` at 390 px in a real browser and read:

```js
getComputedStyle(document.querySelector('[data-testid="purchase-rail"]')).position
```

Record the value verbatim in the task evidence, whether it is `static` or `sticky`. This settles
the disagreement between B2 F18 and the stylesheet; it does not change the fix.

**Step 2 — build.**

```
npm run build
```

Expected exit code 0. This command was measured green on commit `db6d295`.

**Step 3 — unit tests.** This task's spec runs under `ng test`, not `npx vitest run`
(see "Regression test" above). Run `npm run test` before your first edit and again after your
last, and record both coverage figures in the commit body. There is no target number: the pair is the
evidence that this task did not reduce coverage, and **FIX-08** is what turns the thresholds into
a gate. Do not carry the 56.42 % figure forward — it was measured by `npm run test:unit:coverage`
over the 30 specs under `tests/` only, a runner and a denominator that no longer exist, so it
cannot be compared with anything `ng test` reports. `npm run test` fails 14 of 14 files at the
baseline for a reason **FIX-04** owns; record that rather than treating it as this task's
regression.

**Step 4 — the existing viewport matrix.**

```
npx playwright test e2e/design/viewport-matrix.spec.ts -g "product has no horizontal overflow"
```

`e2e/design/viewport-matrix.spec.ts:40-47` already declares the six widths 320 / 390 / 768 / 1024 /
1440 / 1920, and the test that begins at line 94 of that file asserts, at lines 111-114,
`documentElement.scrollWidth <= innerWidth + 1`. Expect every selected test to pass.

Two warnings:

- The suite runs against the **production build** served from `dist/mi-bolt/browser` by
  `scripts/serve-static.mjs` (`playwright.config.ts:52-65`), so step 2 must have run first.
- The suite **rewrites the 49 tracked screenshots under `e2e/design/screenshots/`**;
  `git status` will show them modified. That is expected. Do **not** use `git restore`,
  `git checkout --`, `git stash`, `git reset` or `git clean` on them. Commit the screenshots this
  task's change actually altered along with the change, and say in the commit body which ones and
  why.
- The full `npx playwright test` run is red at baseline with 41 failures; **FIX-09** owns those.
  Do not chase them here.

**Step 5 — real browser.** Mandatory, and it is what actually proves this task. See
FIX-26-AC01 to FIX-26-AC05 below for the measurements. Reach the product page by clicking through
from `/` or `/telefonok`, not by a reload into a checkout route — a full page load of any
`/penztar/*` route currently discards the cart and redirects to the empty cart, a defect **FIX-10**
owns, so a criterion that reloads into one tests the wrong screen.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` while working on this task: it rewrites tracked files and leaves
the working tree dirty. **Do not run the bare `npx playwright test` either** — the full suite is
270 tests, rewrites all 49 tracked images under `e2e/design/screenshots/`, and is `FIX-09`'s.
**The scoped command named in "How to verify" is the sanctioned exception and is mandatory**:
run exactly that command, nothing wider. It rewrites six tracked images,
`e2e/design/screenshots/<viewport>/product.png` at 320, 390, 768, 1024, 1440 and 1920, because
both Chromium projects write the same six paths. Run it deliberately, read the result, and check
`git status --short` afterwards; anything it wrote is either committed with a stated reason or
left out of the commit with a stated reason.

## Acceptance criteria

Every criterion below is checked on `/telefonok/demo-one-5g` at 1x device pixel ratio, light
colour scheme, in a real browser driven through `mcp__chrome-devtools__*`. Reading the diff, an
HTTP 200, a green unit test and a file listing are none of them a browser check
(`.claude/rules/browser-verification.md`).

- [ ] **FIX-26-AC01** At 320 and at 390,
      `getComputedStyle(document.querySelector('app-product-page .layout')).gridTemplateColumns.trim().split(/\s+/).length`
      returns `1`. At 1440 it returns `2`. Record all three returned strings verbatim.
- [ ] **FIX-26-AC02** At each of 320, 390, 768, 1024, 1440 and 1920,
      `document.documentElement.scrollWidth <= window.innerWidth + 1` is `true`. Record the
      `scrollWidth` / `innerWidth` pair for all six. The 320 and 390 pairs were `368/320` and
      `408/390` before the fix.
- [ ] **FIX-26-AC03** At 320, 390 and 768,
      `getComputedStyle(document.querySelector('[data-testid="purchase-rail"]')).position`
      returns `fixed`; after scrolling the page to `document.body.scrollHeight / 2`, the rail's
      `getBoundingClientRect().bottom` is within 1 px of `window.innerHeight`. At 1440 the same
      element's computed `display` is `none`. Take a screenshot at 390 after the scroll showing the
      rail still on screen.
- [ ] **FIX-26-AC04** At 320, 390 and 768, exactly one rendered control carries the accessible name
      "Kosárba teszem":
      `Array.from(document.querySelectorAll('app-product-page button')).filter((b) => b.textContent.trim().startsWith('Kosárba teszem') && b.getClientRects().length > 0).length === 1`.
      Use `getClientRects().length`, not `offsetParent`: `offsetParent` is `null` for a
      `position: fixed` element and would wrongly exclude the rail's own button. At 1440 the same
      expression also returns `1`, and the one control is the in-flow CTA.
- [ ] **FIX-26-AC05** (R22) At 390, tab from the page heading to the end of the page with the
      keyboard. No focused element is hidden behind the rail: for every focused element,
      `document.activeElement.getBoundingClientRect().bottom <= document.querySelector('[data-testid="purchase-rail"]').getBoundingClientRect().top`
      or the element is the rail's own control. Capture a screenshot of the last focus stop.
- [ ] **FIX-26-AC06** `npx playwright test e2e/design/viewport-matrix.spec.ts -g "product has no horizontal overflow"`
      exits 0 with every selected test passing. Paste the summary line.
- [ ] **FIX-26-AC07** `src/app/features/product/product-page-responsive.spec.ts` exists and
      asserts, by name, that a rendered `ProductPage` contains exactly one
      `[data-testid="purchase-rail"]` and exactly one `.cta-desktop`, and that the rail is a direct
      child of `.page`. `npm run test` exits 0.
- [ ] **FIX-26-AC08** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim.
- [ ] **FIX-26-AC09** The computed `position` value measured in "How to verify" step 1, before any
      edit, is recorded verbatim in the commit body, together with which of B2 F18 and
      `product-page.scss:159-170` it agreed with.

### Design rules (mi-bolt-design 1.0.1)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- [ ] **FIX-26-AC10** Applicable and asserted above: **R22** (narrow layout is not a scaled-down
      desktop page — AC01, AC02, AC05), **R21** (44×44 targets — the rail's CTA keeps
      `size="comfortable"`, 48 px; measure and record its rect at 390), **R20** and **R23**
      (keyboard operation and focus not trapped under the rail — AC05), **R05** (content stays on
      the shared centreline; this task does not move it, so record that `.page`'s computed
      `max-width` is unchanged at 1440), **R08** (one prominent primary action per decision unit —
      AC04), **R19** (the loading and error states of the page still render, and the column change
      did not break their layout). Open `http://localhost:4200/telefonok/nincs-ilyen-telefon`
      at **390** and again at **1440**, and at each width record three things: (a)
      `document.querySelector('app-product-page [role="alert"]') !== null` is `true`, and
      that element's `textContent` verbatim; (b) the pair
      `{ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }`,
      with `scrollWidth <= innerWidth + 1`, in the same shape **FIX-26-AC02** records its six
      pairs; (c) a screenshot. `[role="alert"]` is the selector because it is carried by both
      shapes this branch can be in: `src/app/shared/ui/error-state/error-state.html:1` has
      `role="alert" data-testid="error-state"` today, and **FIX-23** may have replaced it with
      its own `@case ('notfound')` by the time this task runs. The recorded `textContent`
      says which one rendered. **What this clause does not claim**: whether the copy in that
      branch is the right copy is **FIX-23**'s, not this task's; if the observation shows an
      overflow at either width, record the number and name **FIX-27**, which owns the
      horizontal-overflow bugs, rather than repairing it here.
- [ ] **FIX-26-AC11** Recorded as N/A with reasons: **R01, R02, R03** — the change adds no imagery
      and alters no brand, header, footer or hero colour. **R04, R06** — no new raw colour or
      dimension is introduced and no spacing value is changed; `FIX-17` and `FIX-34` own those.
      **R07** — no font or type-scale declaration is touched. **R09** — no text/background colour
      pair changes. **R10, R11** — no image markup or aspect ratio is touched. **R12, R15** — no
      Hungarian string is added or edited. **R13, R14, R17, R18, R24, R25** — the change is
      presentational only and reaches no price field, variant logic, filter state, persistence or
      offer copy. **R16** — the application has exactly one provider. **R26** — a handoff-practice
      rule, satisfied by the commit body and the recorded evidence rather than by runtime
      behaviour.

## Commit

This task is exactly one commit. Do not bundle it with another FIX task, and do not commit until
every acceptance criterion above has passed and its output is recorded. The commit carries the
SCSS change, the comment correction in `product-page.ts`, the new spec file, and whichever
screenshots under `e2e/design/screenshots/` the Playwright run actually changed — named
explicitly in the commit body, with the reason.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: product page single column below 1024 and fixed buy rail
```
