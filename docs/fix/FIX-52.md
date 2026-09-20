# FIX-52 — Stop overriding the user's font size, and settle the skip link

Status: PARTIAL — the root font size is no longer pinned and the duplicated skip link is gone; commit 07937d7, with `src/app/app-skip-link.spec.ts` covering it. Open: the two criteria that only a browser can settle — the skip link being off-screen unfocused and on-screen focused, and the page honouring a raised browser font setting — are deferred to the batched browser-verification pass.
Severity: major
Source: B2 (responsive and accessibility sweep), A6 (idiom sweep), orchestrator note on the skip link. Recorded as unowned in `FIX-17`'s out-of-scope section; this task is its owner.

## Why this is wrong

Two independent defects in the two global stylesheets that every page loads.

**The root font size is pinned.** `src/styles/primitives.css:18` sets
`html { font-size: var(--type-body) }`, and `--type-body` is the literal `16px`. A
user who has raised their browser's default font size gets 16 px anyway: an explicit
declaration on `html` replaces the value the browser derived from their preference.
The root `CLAUDE.md` requires the application to "follow all WCAG AA minimums",
`docs/spec/acceptance.md:27` (**AC23**) names "200% text sizing" as part of that, and
`docs/spec/test-scenarios.md:116` (**E110**) makes it a tested scenario:
*"Use reduced-motion +200% text sizing | No nonessential motion/clipping; purchase
controls remain reachable."* An automated axe scan does not flag this, which is why
no audit caught it.

**The skip link declares its position twice, and the two disagree.**
`src/app/app.html:8` applies the Tailwind utilities `absolute left-0 top-0 z-50`,
which put the link at the top-left of every page; `src/app/app.scss:10-19` declares
`position: absolute; left: -9999px; top: 0; z-index: 1000`, which puts it off screen
until focused. Whichever wins today, the page's appearance depends on cascade order
between a utility layer and a component stylesheet — which is not something a later
change should be able to flip by accident.

## Evidence

### 1. The root override

`src/styles/primitives.css:16-24`:

```css
html {
  font-family: var(--font-family-base);
  font-size: var(--type-body);
  line-height: var(--line-height-body);
  color: var(--color-text-primary);
  background: var(--color-surface-light);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

`src/styles/tokens.css:66`:

```css
  --type-body: 16px;
```

So the declaration resolves to `html { font-size: 16px }`.

**Be precise about what this does and does not break, because the executor has to
measure it rather than assert it.** Browser *page zoom* multiplies every length and
is unaffected. What the declaration overrides is the **user's default font-size
preference** — the browser setting that would otherwise set the root size — and with
it any text-only resizing that works by changing that default. AC23 and E110 make
text sizing a tested requirement of this project regardless of which mechanism a
strict WCAG 1.4.4 reading accepts, so the override is in scope either way. The
criteria below measure the effect rather than argue it.

### 2. The design rule that looks like it says the opposite

The `mi-bolt-design` skill's **R07** reads:

> Use a system font or an approved, licensed brand font; use 16 px body text and
> hierarchical headings.

An executor will read that and conclude the pinned root is correct. It is not the
same statement. R07 fixes the **type scale**: body text is the 16 px step of it, which
is what `--type-body: 16px` records and what every component that sets
`font-size: var(--type-body)` renders. Pinning `html` additionally overrides the
user's own starting point, which R07 says nothing about. After the change a user at
the default setting sees **exactly** the same page — `font-size: 100%` on `html`
resolves to the same 16 px — so R07 is preserved in every case R07 is about. AC01
measures that identity.

### 3. The skip link's two position declarations

`src/app/app.html:8`, in full:

```html
<a class="skip-link absolute left-0 top-0 z-50 no-underline" href="#main-content">Ugrás a tartalomhoz</a>
```

`src/app/app.scss:10-25`:

```scss
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  padding: 0.5rem 0.75rem;
  background: #171b1f;
  color: #ffffff;
  text-decoration: none;
  z-index: 1000;
}

.skip-link:focus {
  left: 0.5rem;
  top: 0.5rem;
  outline: 2px solid #ff6a00;
}
```

Four of the five utility classes duplicate an SCSS declaration on the same element —
`absolute`/`position`, `left-0`/`left`, `top-0`/`top`, `z-50`/`z-index`,
`no-underline`/`text-decoration` — and the `left` pair **contradicts**: `left-0`
means visible at the left edge, `left: -9999px` means off screen.

**Which one wins has not been measured.** Angular's emulated encapsulation appends an
`[_ngcontent-*]` attribute to the component selector, raising its specificity above a
bare utility class; Tailwind 4 also puts utilities in a cascade layer, and unlayered
styles beat layered ones. Both arguments point at the SCSS winning. **Both are
reasoning, not a measurement**, and the orchestrator recorded them as exactly that.
**FIX-17-AC03** already makes an executor measure
`getComputedStyle(document.querySelector('.skip-link')).left` and record the answer.

This task's point is that the answer should stop mattering. `FIX-17`'s out-of-scope
section says repairing the contradiction "is not this task's, and no FIX number owns
it"; this task is its owner.

## What to change

### 1. `src/styles/primitives.css:18`

Replace the declaration and say why in place, because the next reader will otherwise
"restore" it:

```css
html {
  font-family: var(--font-family-base);
  /* 100%, not var(--type-body): an explicit px value on the root
     replaces the size the browser derived from the user's own
     font-size preference. The 16 px body step of the type scale is
     unchanged — it lives in --type-body and in the component rules
     that use it — and at the default setting this resolves to the
     same 16 px. docs/spec/acceptance.md:27 (AC23) and
     docs/spec/test-scenarios.md:116 (E110) require text sizing to
     work; mi-bolt-design R07 fixes the scale, not the root. */
  font-size: 100%;
  line-height: var(--line-height-body);
```

**Do not delete the declaration entirely.** `font-size: 100%` and no declaration at
all compute to the same value, but the explicit line is what carries the comment, and
without it the next author has nothing to read before adding `16px` back.

**Do not touch `src/styles/tokens.css`.** `--type-body: 16px` stays, and so does
every `font-size: var(--type-body)` in the component stylesheets. `FIX-17` records
`tokens.css` as a copy of the approved skill package whose contents are a user-level
design decision.

### 2. Measure what still does not scale, and record it

Converting the whole type scale from `px` to `rem` would make every component's text
follow the user's preference too. That is a change to `tokens.css` and to the
twenty-odd component rules that consume it, and it is **not** done here — see
"Out of scope".

What this task does instead is measure and record, per
`.claude/rules/planning-deliverables.md` ("Where a threshold would be invented,
measure and record instead"). FIX-52-AC03 sets the browser's default font size to a
larger value and records which text scaled and which did not, as a numbered list of
selectors. That list is the finding the user decides on; do not act on it here.

### 3. `src/app/app.html:8` — one owner for the skip link's position

```html
<a class="skip-link" href="#main-content">Ugrás a tartalomhoz</a>
```

The four position utilities and `no-underline` come off. **This is the decision; do
not weigh alternatives and do not delete the SCSS instead.** The SCSS is the half
that can express the behaviour: a skip link has to be off screen until it is focused
and on screen once it is, and `.skip-link:focus` at `app.scss:21-25` is what does
that. A utility class list cannot express a `:focus` position change, so keeping the
utilities and deleting the SCSS would delete the feature.

Change nothing else on that line: the `href`, the Hungarian text and the element stay.

**Do not touch `app.scss`.** Its three hardcoded colours — `#171b1f`, `#ffffff` and
`#ff6a00` at `:15`, `:16` and `:24` — are real findings and **`FIX-17`** owns the
colour layer. This task removes five class names from one HTML attribute.

### 4. Tests

Put new specs in `tests/` for the reason **FIX-31** states and **FIX-06** owns:
`vitest.config.ts:506` sets `include: ['tests/**/*.spec.ts']` and `npm run test` is
red at baseline (**FIX-04**).

- `tests/app-skip-link.spec.ts`: render `App` and assert that the skip link's
  `classList` is exactly `['skip-link']`, that its `href` is `#main-content`, and
  that its text is `Ugrás a tartalomhoz`. **Do not assert a computed style here**:
  jsdom applies neither the global stylesheet nor the component stylesheet, so
  `getComputedStyle(...).left` proves nothing. The computed values are measured in
  the browser by FIX-52-AC04 and AC05.
- For the root font size there is no useful unit test at all — `primitives.css` is a
  global stylesheet loaded by `angular.json`, not by a component, so nothing in the
  TestBed environment applies it. Say so in the commit body rather than writing a
  test that reads the file as text, which is the pattern **FIX-07** exists to remove.
  The browser criteria are the evidence.

## Out of scope

- **Converting `--type-*` to `rem`.** `src/styles/tokens.css:66-75` declares ten type
  tokens in `px` and more than twenty component rules consume them. Changing them is
  a design decision about the type scale and `FIX-17` records `tokens.css` as
  belonging to the user. Measure the consequence (item 2), report it, and stop.
- **`src/styles/tokens.css` — no edit at all.** AC07 checks the diff.
- **`src/app/app.scss` — no edit at all.** Its hardcoded colours are **`FIX-17`**'s,
  and its `.skip-link` rules are the half this task keeps.
- **`FIX-17` itself.** That task names the skip-link contradiction in its Evidence and
  measures `left` in **FIX-17-AC03**; it does not repair it. **The two tasks touch
  different files** — `FIX-17` works in the colour and spacing layer, this one changes
  one `class` attribute and one `font-size` declaration — but if `FIX-17` has already
  landed, re-read `app.html:8` before editing and remove whatever utility classes are
  there then, rather than assuming the list quoted above.
  **One more thing FIX-17 does that this task must not undo.** FIX-17 converts three
  `rem` values in `app.scss` to `--space-*` tokens — `.skip-link`'s
  `padding: 0.5rem 0.75rem`, and `app-fatal`'s `padding: 1.5rem 1rem` and
  `margin: 0 0 0.5rem` — and its own text derives those from the very `html` declaration
  this task replaces. It lands first, so the derivation is checked against the state it
  describes. After this task those three boxes stay at fixed `px` while their text
  scales, which is not an oversight: `--space-*` stays `px` by this task's own
  "Out of scope" decision, and **FIX-52-AC03** is where that consequence is measured and
  handed to the user. Do not convert them back to `rem` here, and do not add them to
  `tokens.css`.
- **Every other Tailwind-plus-SCSS double declaration in the repository.** `FIX-17`'s
  Evidence lists four of them: the two shared primitives (**`FIX-19`** fixes those),
  the catalogue page's `.catalog` (**`FIX-59`** owns it), and this skip link.
  This task fixes only the one where the two copies **disagree**. Report the others;
  do not sweep.
- **Focus management generally — `FIX-30`** owns dialog and drawer focus. The skip
  link's own `:focus` rule is unchanged by this task.
- **The contrast of the skip link's own colours.** `#171b1f` on `#ffffff` and the
  `#ff6a00` outline are `FIX-17`'s and **`FIX-31`**'s territory. Measure them in
  AC05's axe run and report, do not change.
- **Reduced motion**, the other half of E110. Nothing here touches an animation.

## How to verify

Run these from the repository root, in order. The package manager is **npm
11.17.0**; there is no pnpm and no mise in this repository.

```bash
npm run build                                # expected exit 0
npx vitest run tests/app-skip-link.spec.ts   # expected exit 0
npm run test                                 # see the note below — not expected to exit 0
```

`npm run test` is `ng test`, which fails 14 of 14 files at the `db6d295` baseline for
reasons **FIX-04** owns (`BASELINE.md:10`). Run it, record its exit code and its
failure list verbatim, and compare that list against the one taken before this task's
first edit: the bar is that this change added nothing to it, not that the suite is
green. **FIX-52-AC09** is worded the same way and is the criterion.

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

**How to change the browser's default font size.** In Chrome this is Settings →
Appearance → Font size, or the equivalent DevTools/CDP setting the harness exposes.
It is **not** page zoom and **not** `document.documentElement.style.fontSize`, and
the difference is the whole point: setting the style property by hand would prove
nothing, because it would override the same declaration this task removed. If the
harness cannot change the browser's default font size, say so, record the attempt,
and report the criterion as unmeasured rather than passing it on the inline-style
substitute.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty. Do not run the full Playwright suite: it rewrites 49
tracked screenshots under `e2e/design/screenshots/`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R07 applies and is preserved rather than broken** — see Evidence item 2. AC01
  measures that the rendered body size is unchanged at the browser's default setting.
- **R20 applies**: the skip link must be keyboard-operable with a visible focus
  state, which is what item 3 protects. AC04 and AC05 measure it.
- **R22 applies**: the narrow layout must not be a scaled-down desktop page, and text
  that does not respond to the user's size preference is the same failure seen from
  another angle. AC03 records it at 390 as well as at 1440.
- **R04 applies as a no-change rule**: no token value changes and no new literal is
  introduced. AC07 checks the diff.
- **R06 applies as a no-change rule**: no spacing value changes; `app.scss`'s
  `0.5rem`/`0.75rem` padding is untouched.
- **R09 applies**: the skip link's colours are unchanged and are measured, not
  adjusted. AC05's axe run records them.
- R01, R02, R03, R05, R08, R10–R19, R21, R23, R24, R25: N/A. The change adds no
  imagery or brand asset (R01, R10, R11), alters no shell or hero surface (R02),
  introduces no palette (R03), changes no container width (R05), adds and removes no
  action (R08), adds no string (R12, R15), reaches no price, data source, provider,
  variant, filter or state machine (R13, R14, R16–R19), changes no target size (R21)
  — the skip link's 44 px is not a shopping-flow target and its padding is unchanged
  — opens no dialog (R23), persists nothing (R24) and invents no content (R25). R26
  is satisfied by the commit body and the recorded evidence.

## Acceptance criteria

Every browser criterion is checked in a real browser driven through
`mcp__chrome-devtools__*`, at 1x device pixel ratio and light colour scheme.
Reading the diff, an HTTP 200 and a green unit test are none of them a browser check
(`.claude/rules/browser-verification.md`).

- [ ] **FIX-52-AC01** At the browser's **default** font-size setting, the page is
      unchanged. On `http://localhost:4200/` at 1440, record
      `getComputedStyle(document.documentElement).fontSize` and
      `getComputedStyle(document.body).fontSize` before and after the change; both
      read `16px` in both runs. Record
      `document.querySelector('h1').getBoundingClientRect()` and
      `document.querySelector('[data-testid="hero"]').getBoundingClientRect()` before
      and after the change: both rects must be numerically identical — the measurable
      stand-in for "visually identical" a screenshot alone cannot prove. Take a
      screenshot before and after as supporting evidence. This is the R07 no-regression
      check.
- [ ] **FIX-52-AC02** With the browser's default font size raised (see "How to
      verify"), `getComputedStyle(document.documentElement).fontSize` now reports the
      raised value instead of `16px`. Record the setting used and the value. Before
      the change it reported `16px` at every setting; record that too.
- [ ] **FIX-52-AC03** With the same raised setting, record **which text scaled and
      which did not**, as a numbered list of selectors with the computed `fontSize`
      of each, at 1440 and at 390, on `/` and on `/telefonok`. Include at least the
      `<h1>`, a paragraph, a product card title, a price and a button label. Confirm
      that no text is clipped and that no control has become unreachable (**E110**).
      This list is the finding described in "What to change" item 2; it goes into the
      commit body and is reported, not acted on.
- [ ] **FIX-52-AC04** The skip link is off screen until focused and on screen once
      focused, and the measurement no longer depends on cascade order. On `/` at 1440:
      before any interaction, `getComputedStyle(document.querySelector('.skip-link')).left`
      is `-9999px`; press `Tab` once so the link takes focus, and it becomes `8px`
      (`0.5rem`). Record both values and a screenshot of the focused state. **Record
      the pre-change value of the same property as well** — that is the measurement
      `FIX-17-AC03` asks for, and this task is the one that makes the answer stable.
- [ ] **FIX-52-AC05** `document.querySelector('.skip-link').className` is exactly
      `skip-link`, activating the focused link moves focus to `#main-content`, and an
      axe run on `/` at 1440 reports **zero** violations. Record the class string, the
      post-activation `document.activeElement`, and the axe output.
- [ ] **FIX-52-AC06** The same two checks hold at 390: the link is off screen
      unfocused, visible and at least as tall as its padding when focused, and
      `document.documentElement.scrollWidth` is not greater than
      `document.documentElement.clientWidth` in either state. A skip link parked at
      `left: -9999px` must not create horizontal overflow; if the number is already
      over before your change, record both numbers and name **FIX-27**.
- [ ] **FIX-52-AC07** `git diff --name-only` for this commit lists exactly
      `src/styles/primitives.css`, `src/app/app.html` and the new spec file. It does
      **not** list `src/styles/tokens.css` or `src/app/app.scss`.
- [ ] **FIX-52-AC08** `grep -n "font-size" src/styles/primitives.css` shows `100%` on
      the `html` rule and no `var(--type-body)`, and
      `grep -n "\-\-type-body" src/styles/tokens.css` still shows `16px`.
- [ ] **FIX-52-AC09** `npm run build` exits 0 and `npm run test` exits
      0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/app-skip-link.spec.ts` instead.
- [ ] **FIX-52-AC10** The commit body records: the AC03 list of what does and does not
      scale, named as a finding for the user about converting the type scale to `rem`;
      the pre-change `left` measurement from AC04, so `FIX-17`'s open question is
      answered in writing; and that no unit test covers the global stylesheet, with
      the reason.

## Commit

This task is exactly one commit. The two defects travel together because both are
one-line changes to the two global stylesheets every page loads, both are verified in
the same browser pass at the same two viewports, and neither is large enough to be
reviewable on its own. Do not bundle it with any other FIX task, and do not commit
until every acceptance criterion above has passed and its output is recorded.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: stop pinning the root font size and give the skip link one owner
```
