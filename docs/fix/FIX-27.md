# FIX-27 — Fix the three horizontal-overflow bugs

Status: PARTIAL — the three unshrinkable button rows now carry `flex-wrap: wrap` (`header-nav.scss`, `filter-drawer.scss`, `delivery-step.scss`), each with the one-line comment the document specifies; commit f3c1468. No unit spec was added, per this document's own FIX-27-AC07 reasoning that jsdom has no layout engine. Open: AC01–AC06 and AC10 are real-browser width measurements at 320/390/1024 and are deferred to the orchestrator's batched browser-verification pass.
Severity: major
Source: B2 F2, B2 F4, B2 F5

## Why this is wrong

`docs/spec/acceptance.md` **AC07** is a release gate: "All four families and wizard steps work at
320/390/768/1024/1440/1920 CSS px **without page overflow**; controls remain >=44px, including
sticky mobile controls." `docs/spec/screens.md` S4 repeats it for the purchase shell: "Mobile
single column, summary before final action; steps wrap/read **without horizontal page scrolling**."
The same file's "Global geometry and visual contract" section fixes the six widths this is measured
at. Under decision D1 the specification is right and the code is wrong.

Three places break it. They are one task because they are **two instances of the same mistake plus
the pattern that produced all three**, and fixing the pattern once is cheaper and safer than
nudging three widths. The mistake is: **a flex row whose items cannot shrink below their own
content, inside a container that does not let the row wrap.** The excess has to go somewhere, and
which edge it spills past is decided only by the row's `justify-content` — which is why the same
bug reads as a clipped label on the left in one place and as a page-wide scrollbar on the right in
another.

## Evidence

All measurements were taken in a real browser on commit `db6d295`, at 1x device pixel ratio, light
colour scheme.

### The shared root cause

`src/app/shared/ui/button/button.scss:3-26` makes every `app-button` unshrinkable:

```scss
.root {
  display: inline-flex;
  ...
  min-width: var(--button-height);
  padding: 0 var(--space-4);
  ...
  white-space: nowrap;
}
```

`white-space: nowrap` means the button's min-content width is the full width of its label. A flex
item's default `min-width: auto` floors its shrinking at min-content, so `flex-shrink: 1` cannot
take it below that. Two such buttons in a row that may not wrap will overflow their container
whenever the container is narrower than their sum plus the gap. This is not a defect in the button
— it is correct for a button — and **the button primitive is not what this task changes.**

### 1. Checkout header, 39 px overflow at 320 on all five `/penztar/*` screens

`src/app/core/navigation/header-nav.html:7-18` builds the row:

```html
    <div class="header__inner flex items-center gap-4 mx-auto w-full max-w-screen-xl min-h-16 px-4">
      <a routerLink="/" class="brand inline-flex items-center gap-2 no-underline min-h-10" aria-label="MiBolt kezdőlap">
        <span class="brand__mark inline-flex items-center justify-center w-9 h-9 rounded font-bold" aria-hidden="true">M</span>
        <span class="brand__word font-bold tracking-wide">MiBolt</span>
      </a>
      <span class="header__label uppercase tracking-wider" aria-label="Demó pénztár">Demó pénztár</span>
      <a
        routerLink="/telefonok"
        class="header__back inline-flex items-center no-underline min-h-10 rounded"
        data-testid="back-to-shop"
      >Vissza a shopba</a>
    </div>
```

`src/app/core/navigation/header-nav.scss:24-32` and `:219-242`:

```scss
.header__inner {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  min-height: 64px;
  padding: var(--space-2) var(--layout-gutter-mobile);
  max-width: var(--layout-container-max);
  margin: 0 auto;
}

.header--checkout .header__inner {
  justify-content: space-between;
}

.header__back {
  ...
  white-space: nowrap;
  flex-shrink: 0;
}
```

No `flex-wrap`. Measured on `/penztar/kosar`, `/penztar/adatok`, `/penztar/szallitas`,
`/penztar/ellenorzes` and `/penztar/siker/:id` at 320: `documentElement.scrollWidth` = **359**
against `innerWidth` = **320**. The `.header__back` box's own right edge is at **x = 332**, twelve
pixels past the viewport, and the link is visibly clipped.

### 2. Mobile filter-drawer footer — the same bug spilling **left**

`src/app/features/catalog/filter-drawer.html:128-142`:

```html
    <footer class="footer flex justify-end gap-3 pt-4 sticky bottom-0" data-testid="drawer-footer">
      <app-button
        variant="secondary"
        label="Mégse"
        data-testid="drawer-cancel"
        (pressed)="cancelDraft()"
      ></app-button>
      <app-button
        variant="primary"
        [label]="applyLabel()"
        data-testid="drawer-apply"
        [disabled]="!canApply()"
        (pressed)="applyDraft()"
      ></app-button>
    </footer>
```

`src/app/features/catalog/filter-drawer.scss:179-188`:

```scss
.footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border-subtle);
  position: sticky;
  bottom: 0;
  background: var(--color-surface-light);
}
```

Measured at 320 with the drawer open on `/telefonok`: the footer row is **238 px** wide, "Mégse" is
**84 px**, the gap (`--space-3`) is **12 px** and "Szűrők alkalmazása" is **180 px** — 276 px of
content in 238 px of row, a 38 px excess. Because the row is `justify-content: flex-end`, the
overflow spills past the row's **left** edge: "Mégse" renders at **x = 3** while its container
starts at **x = 41**, so only the letters "gse" are visible inside the drawer panel. There is no
page-level scrollbar, because the drawer panel clips it — which is why this one does not show up in
the overflow matrix and is the most easily missed of the three.

### 3. Delivery order-summary actions at 1024 — the same bug spilling **right**

`src/app/features/checkout/delivery-step.html:116` opens the fixed-width summary column and
lines 146-164 hold the row:

```html
              <div class="actions">
                <app-button
                  variant="secondary"
                  size="comfortable"
                  label="Vissza az adatokhoz"
                  (pressed)="onBack()"
                  data-testid="delivery-back"
                ></app-button>
                <app-button
                  variant="primary"
                  size="comfortable"
                  [label]="confirmLabel()"
                  ...
                  data-testid="delivery-confirm"
                ></app-button>
              </div>
```

`src/app/features/checkout/delivery-step.scss:264-289`:

```scss
      .actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      @media (min-width: 640px) {
        ...
        .actions {
          flex-direction: row;
          justify-content: space-between;
        }
      }

      @media (min-width: 1024px) {
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: var(--space-6);
          align-items: start;
        }
      }
```

Again no `flex-wrap` on the row that becomes horizontal at 640 px. The arithmetic matches the
measurement exactly: at 1024 the summary column is the fixed **360 px** track, `.summary` has
`padding: var(--space-6)` (24 px each side, `delivery-step.scss:270-274`) and a 1 px border on each
side, so the inner width is 360 − 48 − 2 = **310 px** — which is precisely the `.actions` width B2
measured. The two comfortable-size buttons together exceed it, and because the row is
`justify-content: space-between`, the overflow spills past the **right** edge: the second button's
rect runs **x = 838 → 1054**, thirty pixels past the 1024 viewport, and page-level overflow measures
**1054 / 1024**.

It does not reproduce at 768, because `.layout` only becomes a grid at 1024 and below that the
summary is full width. It does not reproduce at 1440 and above, because the container's 1320 px
maximum leaves 60 px of page margin for the spill to land in without pushing the document wider.
Neither is a reason to believe those widths are correct: the row is broken at every width, and only
the page margin hides it.

### Edit the SCSS, not the utility classes

`src/styles.css:6` imports Tailwind v4 (`@import 'tailwindcss';`), which emits its utilities inside
`@layer theme, base, components, utilities`. Angular component styles are unlayered, and unlayered
declarations beat layered ones regardless of specificity. So the `flex justify-end gap-3` and
`flex items-center gap-4` classes in the three templates above are all overridden by the SCSS rules
quoted beside them. Changing a utility class will not change the rendering. All three edits below
are SCSS edits.

## What to change

The fix is one declaration in each of three stylesheets, plus the reason written down once.

### `src/app/core/navigation/header-nav.scss`

Extend the existing checkout-only rule at line 219-221 so the compact checkout header may wrap:

```scss
.header--checkout .header__inner {
  justify-content: space-between;
  flex-wrap: wrap;
}
```

Scope it to `.header--checkout`, not to `.header__inner`, because the default header's row carries
`.header__nav { flex: 1 1 auto }` and `.header__actions { margin-left: auto }` and is not part of
this task. Leave `.header__back`'s `white-space: nowrap` and `flex-shrink: 0` exactly as they are:
wrapping is what makes room, and removing the shrink guard would clip the link's border instead of
moving it. All three elements `docs/spec/screens.md` S4 requires in this shell — "MiBolt left,
Demó pénztár label, back-to-phones link" — stay present and readable; they simply occupy two rows
at 320 instead of one.

### `src/app/features/catalog/filter-drawer.scss`

Add one declaration to `.footer` at line 179-188:

```scss
.footer {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  ...
}
```

Nothing else in that rule changes. `docs/spec/screens.md` S2 requires the drawer footer to carry
both "Mégse" and "Szűrők alkalmazása"; with wrapping, each keeps its full label and lands inside
the panel.

### `src/app/features/checkout/delivery-step.scss`

Add one declaration to the `@media (min-width: 640px)` `.actions` rule at line 276-279:

```scss
        .actions {
          flex-direction: row;
          flex-wrap: wrap;
          justify-content: space-between;
        }
```

Nothing else in that rule changes, and the base column rule at line 264-268 stays as it is.

### Write the reason down where the next reader will find it

Add a one-line comment above each of the three changed rules, in the existing style of the file it
sits in, saying what it is: `/* Row items cannot shrink (button.scss white-space: nowrap), so the
row must be allowed to wrap. */`. Do not restate the whole analysis in three places; the analysis
lives in this file.

### Regression test

No unit spec is added for this change. jsdom has no layout engine: it does not apply a component
stylesheet or evaluate a media query and returns zero or empty values for
`getBoundingClientRect()`, `scrollWidth` and `getComputedStyle(...).flexWrap`, and a `node:fs` read
of a stylesheet's text is a source-text assertion of exactly the kind **FIX-07** and **FIX-07b**
remove from this repository. The change is proved where it is observable — see **FIX-27-AC07** —
by the real-browser pass this file already requires and by
`e2e/design/viewport-matrix.spec.ts`'s overflow assertions.

## Out of scope

- **The `Button` primitive.** Do not touch `src/app/shared/ui/button/button.scss` or
  `button.html`. Its `white-space: nowrap` is correct; removing it would make button labels wrap
  mid-word across the whole application.
- **Hardcoded colours and spacing.** `FIX-17` owns replacing literals with tokens. Do not
  retokenise anything in the three stylesheets while you are in them.
- **The centreline and the grid-gap scale.** `FIX-34` owns them. Do not change
  `--layout-container-max`, any gutter token, or any `gap` value, including the 12 px drawer-footer
  gap and the 16 px header gap the measurements above name.
- **The product page's own overflow at 320 and 390.** `FIX-26` owns it; it is a grid-template bug,
  not this flex-row bug. Do not touch `src/app/features/product/`.
- **The delivery step's inert continue button and its raw internal-state copy.** `FIX-22` owns
  both. You are changing the layout of `.actions`, not what its buttons do. Do not touch
  `delivery-step.ts`, `delivery-step.html` or any string in them.
- **The catalogue's clear-filters and sort controls.** `FIX-24` owns them; do not touch
  `catalog-page.ts`, `catalog.facade.ts` or `catalog-query.ts`.
- **The drawer's initial focus.** `FIX-30` owns it. You are opening the drawer to measure its
  footer, not changing what it focuses.
- **UI copy.** `FIX-35` owns correcting text to the spec. In particular, leave "Vissza a shopba"
  exactly as it is — `docs/design/prototype.html` renders "← Vissza a telefonokhoz" in the same
  slot, and that difference belongs to `FIX-35`, not here.
- **`src/app/core/navigation/header-nav.scss`'s header comment (`:1-5`) — `FIX-28`.** This task
  edits `.header--checkout .header__inner` at `:219-221` only; the two regions are disjoint, so
  either order is safe, but whichever lands second says so in its commit body.

## How to verify

Run these in order, from the repository root. The package manager is **npm 11.17.0**; there is no
pnpm and no mise in this repository.

**Step 1 — build.**

```
npm run build
```

Expected exit code 0. This command was measured green on commit `db6d295`.

**Step 2 — unit tests.** This task adds no unit spec (see FIX-27-AC07). Run `npm run test`
before your first edit and again after your last,
and record both coverage figures in the commit body. There is no target number: the pair is the
evidence that this task did not reduce coverage, and **FIX-08** is what turns the thresholds into
a gate. Do not carry the 56.42 % figure forward — it was measured by `npm run test:unit:coverage`
over the 30 specs under `tests/` only, a runner and a denominator that no longer exist, so it
cannot be compared with anything `ng test` reports. `npm run test` fails 14 of 14 files at the
baseline for a reason **FIX-04** owns; record that rather than treating it as this task's
regression.

**Step 3 — the existing viewport matrix.**

```
npx playwright test e2e/design/viewport-matrix.spec.ts -g "has no horizontal overflow"
```

`e2e/design/viewport-matrix.spec.ts:40-47` declares the six widths, and the test that begins at
line 94 asserts, at lines 111-114, `documentElement.scrollWidth <= innerWidth + 1` for eight
routes.

Four warnings, all of which matter here:

- The suite runs against the **production build** served from `dist/mi-bolt/browser` by
  `scripts/serve-static.mjs` (`playwright.config.ts:52-65`), so step 1 must have run first.
- It **rewrites the 49 tracked screenshots under `e2e/design/screenshots/`**; `git status` will
  show them modified. That is expected. Do **not** use `git restore`, `git checkout --`,
  `git stash`, `git reset` or `git clean` on them.
- The full `npx playwright test` run is red at baseline with 41 failures; **FIX-09** owns those.
- **This spec reaches the four `/penztar/*` routes with `page.goto()`, which is a full page load,
  and a full page load of a checkout route currently discards the cart and lands on the empty-cart
  guard redirect — a defect `FIX-10` owns.** So the `cart` / `contact` / `delivery` / `review`
  rows of that matrix are today measuring the empty-cart screen under a checkout URL, and in
  particular they will **not** exercise defect 3 above. Treat a green result on those four rows as
  saying nothing about this fix, and prove defect 3 in the browser instead (FIX-27-AC03), reaching
  the delivery step by clicking through the flow.

**Step 4 — real browser.** Mandatory, and it is what actually proves this task. Reach every
checkout screen by **clicking through the flow** from `/telefonok` — add an item, open the cart
from the header, continue through contact to delivery — never by typing a `/penztar/*` URL or
reloading one, for the `FIX-10` reason above.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` while working on this task: it rewrites tracked files and leaves
the working tree dirty. **Do not run the bare `npx playwright test` either** — the full suite is
270 tests, rewrites all 49 tracked images under `e2e/design/screenshots/`, and is `FIX-09`'s.
**The scoped command named in "How to verify" is the sanctioned exception and is mandatory**:
run exactly that command, nothing wider. Its `-g "has no horizontal overflow"` filter matches
every one of the eight routes, so it rewrites **all forty-eight** tracked
`e2e/design/screenshots/<viewport>/<route>.png` images; if that is more churn than this task
wants in its diff, narrow the `-g` to the routes this task changed and say in the commit body
which you ran. Run it deliberately, read the result, and check `git status --short` afterwards;
anything it wrote is either committed with a stated reason or left out of the commit with a
stated reason.

## Acceptance criteria

Every browser criterion is checked at 1x device pixel ratio, light colour scheme, in a real browser
driven through `mcp__chrome-devtools__*`. Reading the diff, an HTTP 200, a green unit test and a
file listing are none of them a browser check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-27-AC01** At 320, on each of the five checkout screens reached by clicking through the
      flow — cart, contact, delivery, review, success —
      `document.documentElement.scrollWidth <= window.innerWidth + 1` is `true`. Record the
      `scrollWidth` / `innerWidth` pair for all five. Every one of them read `359 / 320` before the
      fix.
- [ ] **FIX-27-AC02** At 320 on the cart screen,
      `document.querySelector('[data-testid="back-to-shop"]').getBoundingClientRect().right <= window.innerWidth`
      is `true`, and the full text "Vissza a shopba" is legible in a screenshot. Its right edge was
      at x = 332 before the fix. Record the new right edge. Also record
      `document.querySelector('[data-testid="checkout-header"]').getBoundingClientRect().height`
      at 320, before and after the fix, with a screenshot of both states: wrapping moves the
      back-link to a second row, so the sticky header's height changes on this screen.
- [ ] **FIX-27-AC03** At 1024 on the delivery screen, with a delivery option selected,
      `document.documentElement.scrollWidth <= window.innerWidth + 1` is `true`, and
      `document.querySelector('[data-testid="delivery-confirm"]').getBoundingClientRect().right <= window.innerWidth`
      is `true`. The page read `1054 / 1024` and the button's rect ran `838 → 1054` before the fix.
      Record both new numbers, and repeat the page-level check at 768, 1440 and 1920 to confirm the
      widths that were already passing still pass.
- [ ] **FIX-27-AC04** At 320 on `/telefonok`, open the filter drawer with the "Szűrők" trigger.
      Both footer buttons lie fully inside the footer row:
      `document.querySelector('[data-testid="drawer-cancel"]').getBoundingClientRect().left >= document.querySelector('[data-testid="drawer-footer"]').getBoundingClientRect().left - 1`
      and the same comparison for `[data-testid="drawer-apply"]`'s `right` against the footer's
      `right`. "Mégse" was at x = 3 inside a container starting at x = 41 before the fix. Capture a
      screenshot of the open drawer showing both labels in full.
- [ ] **FIX-27-AC05** Repeat AC04 at 390. B2 captured this defect only at 320; 390 is the second
      width `docs/spec/screens.md` names for the reflow matrix and was never checked. If the
      drawer footer is correct at 390 both before and after, say so — an unreproduced case is a
      recorded result, not a silent pass.
- [ ] **FIX-27-AC06** `npx playwright test e2e/design/viewport-matrix.spec.ts -g "has no horizontal overflow"`
      exits 0 with every selected test passing. Paste the summary line, and state in the same
      evidence that the four checkout rows of that matrix are measuring the empty-cart screen for
      the `FIX-10` reason, so AC01 and AC03 rather than this run are what prove the checkout half.
- [ ] **FIX-27-AC07** No unit spec is added for this change, and the commit body says why:
      the change is a `flex-wrap` declaration in three stylesheets, jsdom applies neither a
      component stylesheet nor a media query and returns empty values for
      `getComputedStyle(...).flexWrap`, and a `node:fs` read of the stylesheet's text is a
      source-text assertion of exactly the kind **FIX-07** and **FIX-07b** remove from this
      repository. The change is proved where it is observable: by the real-browser pass this
      file already requires and by `e2e/design/viewport-matrix.spec.ts`'s overflow
      assertions.
- [ ] **FIX-27-AC08** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim.
- [ ] **FIX-27-AC09** `git diff --name-only` for this commit lists exactly three stylesheets and
      whichever screenshots under `e2e/design/screenshots/` the Playwright run
      changed. No template, no TypeScript file, and no file under `src/app/shared/ui/button/`.

### Design rules (mi-bolt-design 1.0.1)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- [ ] **FIX-27-AC10** Applicable and asserted above: **R22** (the narrow layout must not be a
      scaled-down desktop page — AC01, AC02, AC04), **R21** (44×44 targets — after wrapping,
      re-measure each of the five moved controls' rects at 320 and 1024 and record that width and
      height are both at least 44), **R20** (visible focus and keyboard operation survive the
      wrap — tab to each of the five controls at 320 and confirm the focus ring is fully visible
      and not clipped by the panel or the viewport edge), **R08** (one prominent primary action per
      decision unit — after wrapping, in the drawer footer and the delivery actions row, record
      `getComputedStyle(<primary button>).backgroundColor` and
      `getComputedStyle(<secondary button>).backgroundColor` for the two buttons in each row and
      confirm they differ, so the primary button's filled accent background remains visually
      distinct from the secondary button's outlined one after the wrap), **R05** (content stays on the shared centreline; this task does
      not move it, so record that `.header__inner`'s computed `max-width` is unchanged at 1440).
- [ ] **FIX-27-AC11** Recorded as N/A with reasons: **R01, R02, R03** — the change adds no imagery
      and alters no brand, header, footer or hero colour, only whether a row may wrap. **R04, R06**
      — no new raw colour or dimension is introduced and no spacing value is changed; `FIX-17` and
      `FIX-34` own those. **R07** — no font or type-scale declaration is touched. **R09** — no
      text/background colour pair changes. **R10, R11** — no image markup or aspect ratio is
      touched. **R12, R15** — no Hungarian string is added or edited. **R13, R14, R17, R18, R19,
      R24, R25** — the change is presentational only and reaches no price field, variant logic,
      filter state, component state machine, persistence or offer copy. **R16** — the application
      has exactly one provider. **R23** — the drawer is opened only to measure its footer; its
      focus behaviour is untouched and `FIX-30` owns it. **R26** — a handoff-practice rule,
      satisfied by the commit body and the recorded evidence rather than by runtime behaviour.

## Commit

This task is exactly one commit. Do not bundle it with another FIX task, and do not commit until
every acceptance criterion above has passed and its output is recorded. The commit carries the
three stylesheet changes, the new spec file, and whichever screenshots under
`e2e/design/screenshots/` the Playwright run actually changed — named explicitly in the commit
body, with the reason.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: let unshrinkable button rows wrap instead of overflowing
```
