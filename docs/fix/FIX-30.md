# FIX-30 — Restore focus after a dialog closes and focus the drawer heading on open

Status: PLANNED — not executed.
Severity: major
Source: B2 F8, B2 F9, B3 R20 (fail), B3 R23 (fail)

## Why this is wrong

`docs/spec/testing.md` §6 requires: "Full keyboard journey includes all dialog types with **focus
restoration**." `docs/spec/screens.md` S2, describing the mobile filter drawer, is more specific:
"Escape/backdrop behaves as cancel; applied URL unchanged. **Initial focus=drawer heading,
return=filter trigger.**" `docs/spec/screens.md` S3 requires the same of the gallery: "Zoom opens
real modal with named close and contained focus." `docs/spec/acceptance.md` **AC23** makes the
whole of it a release gate, and the repository's root `CLAUDE.md` requires the application to
"follow all WCAG AA minimums, including focus management". Design rules **R20** and **R23** say the
same in the skill's own words.

Two things are wrong, and they are opposite halves of the same primitive.

Closing the terms dialog or the gallery's zoom modal drops focus to `<body>` instead of returning
it to the control that opened it. A keyboard user loses their place entirely: the next Tab starts
at the top of the document, and on a long checkout review page that means walking the whole page
again to get back to the checkbox they were filling in.

Both drawers open with focus on the close button instead of on the drawer heading, so the first
thing a screen-reader user is told on opening the filter drawer is "Bezárás, button" rather than
"Szűrők, heading level 2" — the name of the thing they just opened.

Under decision D1 the specification is right and the code is wrong. The Escape-and-return half of
**both drawers** already works correctly; do not rewrite it.

## Evidence

All browser measurements were taken on commit `db6d295`. The library facts below were read from the
installed `@angular/cdk` **22.1.6** in `node_modules`, not from memory.

### 1. Focus restoration — the root cause, confirmed at source

`src/app/shared/ui/accessible-dialog/accessible-dialog.ts:102-114`:

```ts
  private openInternal(): void {
    const restore = (this.restoreTarget() as HTMLElement | null) ?? this.host.nativeElement;
    this.ref = this.dialog.open(this.body, {
      ariaLabel: this.label(),
      ariaLabelledBy: this.labelledBy() ?? undefined,
      ariaModal: true,
      role: 'dialog',
      hasBackdrop: true,
      disableClose: false,
      restoreFocus: restore,
      autoFocus: 'first-tabbable',
      viewContainerRef: this.viewContainerRef,
    });
```

When the consumer passes no `restoreTarget`, the fallback is `this.host.nativeElement` — the
`<app-accessible-dialog>` element itself. That element is a plain custom element with no `tabindex`
and no intrinsic focusability, so calling `.focus()` on it does nothing and `document.activeElement`
stays where it was, which after a dialog teardown is `<body>`.

The CDK does exactly that. `node_modules/@angular/cdk/fesm2022/dialog.mjs:206-227`:

```js
  _restoreFocus() {
    const focusConfig = this._config.restoreFocus;
    let focusTargetElement = null;
    if (typeof focusConfig === 'string') {
      focusTargetElement = this._document.querySelector(focusConfig);
    } else if (typeof focusConfig === 'boolean') {
      focusTargetElement = focusConfig ? this._elementFocusedBeforeDialogWasOpened : null;
    } else if (focusConfig) {
      focusTargetElement = focusConfig;
    }
    if (this._config.restoreFocus && focusTargetElement && typeof focusTargetElement.focus === 'function') {
      ...
          this._focusMonitor.focusVia(focusTargetElement, this._closeInteractionType);
```

The `boolean` branch is the one that does the right thing by itself: passing `true` restores to
`_elementFocusedBeforeDialogWasOpened`, which the CDK captures when the dialog opens
(`dialog.mjs:244`). `node_modules/@angular/cdk/types/dialog.d.ts:31` gives the accepted type:

```ts
type RestoreFocusValue = boolean | string | HTMLElement;
```

**Which consumers pass a target, and which do not**, is exactly the split B2 measured:

| Dialog | `restoreTarget` passed? | Source | Measured `document.activeElement` after Escape |
|---|---|---|---|
| Mobile nav drawer | yes | `src/app/core/navigation/mobile-drawer.html:4` — `[restoreTarget]="triggerEl() ?? null"` | the trigger — correct |
| Catalogue filter drawer | yes | `src/app/features/catalog/filter-drawer.html:4` — `[restoreTarget]="restoreEl()"`, fed from `catalog-page.ts` as `filterTrigger()?.nativeElement ?? null` | the trigger — correct |
| Review terms dialog | **no** | `src/app/features/checkout/terms-dialog.html:1-6` | `<body>` |
| Product gallery zoom modal | **no** | `src/app/features/product/product-gallery.html:63-67` | `<body>` |

```html
<app-accessible-dialog
  [opened]="opened()"
  [label]="label()"
  (closed)="onClosed()"
  data-testid="review-terms-dialog"
>
```

```html
    <app-accessible-dialog
      [opened]="zoomOpen()"
      [label]="'Nagyított kép: ' + productName()"
      (closed)="closeZoom()"
    >
```

**The disagreement in the evidence, and how the source settles it.** B1 recorded the zoom modal's
focus return as a PASS at 1440; B2 read `document.activeElement` and got `<body>`. The source
above settles it in B2's favour: there is no code path by which the zoom modal could restore focus
to `[data-testid="gallery-zoom-open"]`, because the only element it hands the CDK is the
non-focusable `<app-accessible-dialog>` host. **Re-verify it in the browser as step 1 anyway** and
record the value you read — the disagreement is in the record and a measurement is what closes it,
not an argument.

The cast in that same line, `(this.restoreTarget() as HTMLElement | null)`, is a no-op:
`restoreTarget` is declared `input<HTMLElement | null>(null)` at
`accessible-dialog.ts:65`, so the expression already has that type. `as` is forbidden by
`.claude/rules/code-standards.md`. You are rewriting the line anyway; write it without the cast.

### 2. Initial focus — the drawer heading exists, and the primitive never focuses it

`accessible-dialog.ts:112` passes `autoFocus: 'first-tabbable'` for every consumer. The panel's
first tabbable element is the close button, because the heading comes before it but is not
tabbable. `src/app/shared/ui/accessible-dialog/accessible-dialog.html:9-18`:

```html
    <header class="header flex items-center justify-between gap-3">
      <h2 class="title font-bold m-0" id="dialog-title">{{ label() }}</h2>
      <button
        type="button"
        class="close inline-flex items-center justify-center rounded border border-transparent bg-transparent cursor-pointer text-2xl leading-none"
        aria-label="Bezárás"
        data-testid="dialog-close"
        (click)="close()"
      >×</button>
    </header>
```

So the heading `docs/spec/screens.md` S2 asks for already exists and already carries the right
text: the filter drawer passes `[label]="'Szűrők'"` (`filter-drawer.html:3`) and the nav drawer
passes `[label]="label()"`, which `header-nav.html:116` sets to `"Menü"`. Nothing needs to be added
to either drawer's own template.

The CDK already supports focusing it, and the value is a documented one.
`node_modules/@angular/cdk/types/dialog.d.ts:22`:

```ts
type AutoFocusTarget = 'dialog' | 'first-tabbable' | 'first-heading';
```

`node_modules/@angular/cdk/fesm2022/dialog.mjs:194-195`:

```js
        case 'first-heading':
          this._focusByCssSelector('h1, h2, h3, h4, h5, h6, [role="heading"]', options);
          break;
```

and `_forceFocus` (`dialog.mjs:155-167`) sets `element.tabIndex = -1` before focusing and removes
the attribute again on blur, so **the `<h2>` needs no author-added `tabindex`** and nothing in
`accessible-dialog.html` changes.

## What to change

Two edits in the primitive, two attributes in the two drawer templates. Nothing else.

### `src/app/shared/ui/accessible-dialog/accessible-dialog.ts`

**a. Fix the restore fallback.** Replace line 103:

```ts
    const restore = (this.restoreTarget() as HTMLElement | null) ?? this.host.nativeElement;
```

with:

```ts
    const restore = this.restoreTarget() ?? true;
```

`true` is the CDK's own "restore to whatever had focus before the dialog opened", which is the
correct behaviour for every consumer that does not name a specific element — and it is the right
answer for the terms dialog and the zoom modal without either of them changing. The two drawers
keep passing an explicit element and keep their current behaviour exactly.

This makes `private readonly host = inject(ElementRef<HTMLElement>);` at
`accessible-dialog.ts:47` unused. Remove that field and the now-unused `ElementRef` entry from the
`@angular/core` import at lines 1-11, because the change is what orphaned them
(`.claude/CLAUDE.md`, "Surgical changes"). Confirm with
`grep -n "this.host" src/app/shared/ui/accessible-dialog/accessible-dialog.ts` that there is no
other use before you remove it.

**Also correct the doc comment this orphans.** `accessible-dialog.ts:61-64` documents
`restoreTarget` as *"Defaults to the host element of the primitive"*, which is no longer true once
`this.host` is removed — the fallback is now the CDK's own before-open focus target. Replace it
with:

```ts
  /**
   * Element that should regain focus when the dialog closes. When left
   * unset, the CDK restores focus to whatever had it before the dialog
   * opened.
   */
```

**b. Make the initial focus target a choice the consumer makes.** Add one input beside the existing
ones, after `restoreTarget` at line 65:

```ts
  /**
   * Where focus lands when the dialog opens. `first-tabbable` is the
   * CDK default and keeps a plain modal behaving as it did. A drawer
   * passes `first-heading` so the user is told the name of what they
   * opened, per docs/spec/screens.md S2 ("Initial focus=drawer heading").
   */
  readonly initialFocus = input<'first-tabbable' | 'first-heading'>('first-tabbable');
```

and pass it at line 112, replacing the literal:

```ts
      autoFocus: this.initialFocus(),
```

Declare the narrow union rather than `string`, so `strictTemplates`
(`tsconfig.json`, `angularCompilerOptions.strictTemplates: true`) rejects a typo at build time.

### `src/app/core/navigation/mobile-drawer.html`

Add one attribute to the existing element at lines 1-6:

```html
<app-accessible-dialog
  [opened]="opened()"
  [label]="label()"
  [initialFocus]="'first-heading'"
  [restoreTarget]="triggerEl() ?? null"
  (closed)="closed.emit()"
>
```

### `src/app/features/catalog/filter-drawer.html`

Add the same attribute to the existing element at lines 1-6:

```html
<app-accessible-dialog
  [opened]="opened()"
  [label]="'Szűrők'"
  [initialFocus]="'first-heading'"
  [restoreTarget]="restoreEl()"
  (closed)="onDialogClosed()"
>
```

**Pass it from these two files only.** `docs/spec/screens.md` asks for heading-first focus for the
drawer; it asks the gallery's zoom modal only for "named close and contained focus", and it asks
nothing of the terms dialog beyond what a modal already does. Leaving those two on
`first-tabbable` is the decision, not an omission: their Escape-and-close behaviour is already
correct and this task does not rewrite working behaviour.

`src/app/features/primitives-showcase/primitives-showcase.html:106` also uses the primitive. Do not
change it. It inherits the restore fix for free and its initial focus is unchanged.

### Regression test

Add a new spec file `src/app/shared/ui/accessible-dialog/dialog-focus.spec.ts`, beside the
component it tests. **Not in `tests/`**: `FIX-06` lands before this task and settles where feature
specs live — it moves every feature spec under `src/` and leaves `tests/` holding exactly six
shared and contract files (`FIX-06.md:260-269`). After `FIX-04`, `ng test`'s runner discovers
specs with `cwd` set to the project source root and cannot see a spec outside `src/`
(`FIX-06.md:17-21`), and the `vitest.contract.config.ts` `FIX-06` creates runs
`tests/**/*.spec.ts` in a **Node** environment with no Angular compiler (`FIX-06.md:278-303`), so
a TestBed spec placed there is collected by a runner that cannot compile it. Confirm with
`ls tests/`, which must list six entries; if it lists more, `FIX-06` has not landed — stop and
report. Run this spec with `npm run test`; do not use `npx vitest run <path>`, which after
`FIX-06` no longer has a config that includes `src/`.

Copy the setup shape from `src/app/layouts/layouts.spec.ts:11-19` — the `// @vitest-environment jsdom`
pragma, `import '@angular/compiler';`, `TestBed`, `provideZonelessChangeDetection()`. jsdom
implements focus, `document.activeElement` and `HTMLElement.focus()`, so the behavioural half of
this task **is** unit-testable, unlike a layout change.

The spec asserts, by name:

1. A host component with a real `<button>` trigger opens an `AccessibleDialog` that is given **no**
   `restoreTarget`; after the dialog closes, `document.activeElement` is that button and **not**
   `document.body`. This is the assertion that fails before the fix and passes after it.
2. The same, with an explicit `restoreTarget` pointing at a second button: focus returns to that
   second button, proving the explicit path still wins.
3. `MobileDrawer` and `FilterDrawer` each render an `app-accessible-dialog` whose `initialFocus`
   input is `'first-heading'`, and `TermsDialog` and the gallery's dialog leave it at
   `'first-tabbable'`.

Do **not** try to unit-test which element the CDK focuses on open. `_trapFocus` runs inside
`afterNextRender` (`dialog.mjs:174-205`), so the assertion would depend on render scheduling rather
than on this task's change. Criteria FIX-30-AC03 and FIX-30-AC04 below check that in a real
browser, which is where it is worth checking.

## Out of scope

- **The Escape-and-return behaviour of the two drawers.** It already works. Do not touch
  `mobile-drawer.ts`, `filter-drawer.ts`, `catalog-page.ts`'s `filterTrigger` view child, or
  `header-nav.ts`'s `menuTriggerEl` computed. Both drawers keep passing their explicit
  `restoreTarget` and this task does not change what they pass.
- **The dialog panel's markup.** `accessible-dialog.html` does not change. The heading is already
  there and the CDK makes it focusable on its own.
- **Anything about the terms dialog or the zoom modal other than focus restoration.** `FIX-23` owns
  the gallery's broken thumbnails; `FIX-25` owns declined-order messaging on the review step. Do
  not touch `product-gallery.ts`, `product-gallery.scss`, `review-step.ts` or `terms-dialog.ts`.
- **The product page's layout and its buy rail.** `FIX-26` owns them.
- **The drawer's footer overflow.** `FIX-27` owns it. You will open the filter drawer to check
  focus; do not fix what you see in its footer while you are there.
- **The structural axe violations.** `FIX-29` owns them.
- **Colour and contrast, including the focus ring's own colour.** `FIX-31` owns the contrast
  failure; `FIX-17` owns colour literals. `:focus-visible` in `src/styles/primitives.css:46-50` is
  not this task's.
- **UI copy.** `FIX-35` owns it. This task adds no string at all.

## How to verify

Run these in order, from the repository root. The package manager is **npm 11.17.0**; there is no
pnpm and no mise in this repository.

**Step 1 — settle the B1 / B2 disagreement before editing.** Start the dev server, open
`/telefonok/demo-one-5g` at 1440 in a real browser, click `[data-testid="gallery-zoom-open"]`, press
Escape, and read:

```js
document.activeElement.outerHTML.slice(0, 120)
```

Record the result verbatim. B1 reported this as a pass and B2 measured `<body>`; your reading is
what closes it. Repeat on the review step with `[data-testid="review-consent-terms-button"]`,
reached by clicking through the flow. This step does not change the fix either way.

**Step 2 — build.**

```
npm run build
```

Expected exit code 0. This command was measured green on commit `db6d295`.

**Step 3 — unit tests.** This task's spec runs under `ng test`, not `npx vitest run`
(see "Regression test" above). Run `npm run test` before your first edit and again after your
last,
and record both coverage figures in the commit body. There is no target number: the pair is the
evidence that this task did not reduce coverage, and **FIX-08** is what turns the thresholds into
a gate. Do not carry the 56.42 % figure forward — it was measured by `npm run test:unit:coverage`
over the 30 specs under `tests/` only, a runner and a denominator that no longer exist, so it
cannot be compared with anything `ng test` reports. `npm run test` fails 14 of 14 files at the
baseline for a reason **FIX-04** owns; record that rather than treating it as this task's
regression.

**Step 4 — the existing keyboard suite.**

```
npx playwright test e2e/a11y/keyboard.spec.ts
```

`e2e/a11y/keyboard.spec.ts:1-27` states its own contract as "focus moves into modals / drawers when
they open and is restored to the invoking control on close (R23)", so it is the suite this task
belongs to. Record its result. Note two things before you read it: that file's steps use
`test.skip` rather than a hard failure when a `data-testid` is missing, so count the skips and
report them rather than reading a green line as coverage; and the full `npx playwright test` run is
red at baseline with 41 failures, which **FIX-09** owns.

**Step 5 — real browser.** Mandatory, and it is what actually proves this task. See
FIX-30-AC01 to FIX-30-AC06. Reach the review step by **clicking through the flow** from
`/telefonok` — add an item, open the cart from the header, continue through contact and delivery —
never by typing a `/penztar/*` URL or reloading one: a full page load of any checkout route
currently discards the cart and redirects to the empty cart, a defect **FIX-10** owns, so a
criterion that reloads into one tests the wrong screen.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` while working on this task: it rewrites tracked files and leaves
the working tree dirty. **Do not run the bare `npx playwright test` either** — the full suite is
270 tests, rewrites all 49 tracked images under `e2e/design/screenshots/`, and is `FIX-09`'s.
**The scoped command named in "How to verify" is the sanctioned exception and is mandatory**:
run exactly that command, nothing wider. `e2e/a11y/keyboard.spec.ts` writes its screenshots to
`e2e/design/screenshots/keyboard/`, where nothing is tracked and nothing is gitignored, so this
run rewrites no tracked file but does leave **untracked** PNGs in the tree; list them and say
whether they are committed. Run it deliberately, read the result, and check `git status --short`
afterwards; anything it wrote is either committed with a stated reason or left out of the commit
with a stated reason.

## Acceptance criteria

Every browser criterion is checked at 1x device pixel ratio, light colour scheme, in a real browser
driven through `mcp__chrome-devtools__*`, **with the keyboard**, not by clicking where a click would
hide a focus bug. Reading the diff, an HTTP 200, a green unit test and a file listing are none of
them a browser check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-30-AC01** On `/telefonok/demo-one-5g` at 1440, Tab to
      `[data-testid="gallery-zoom-open"]`, press Enter, then press Escape. Afterwards
      `document.activeElement === document.querySelector('[data-testid="gallery-zoom-open"]')`
      returns `true`. Record the boolean and the element's `outerHTML` prefix. It was `<body>`
      before the fix.
- [ ] **FIX-30-AC02** On the review step reached by clicking through the flow, Tab to
      `[data-testid="review-consent-terms-button"]`, press Enter, then press Escape. Afterwards
      `document.activeElement === document.querySelector('[data-testid="review-consent-terms-button"]')`
      returns `true`. Record the boolean. It was `<body>` before the fix.
- [ ] **FIX-30-AC03** On `/telefonok` at 390, activate `[data-testid="filter-trigger"]` from the
      keyboard. On open, `document.activeElement.tagName` is `H2` and
      `document.activeElement.textContent.trim()` is `Szűrők`. It was the `aria-label="Bezárás"`
      button before the fix. Capture a screenshot of the open drawer with the focus ring visible on
      the heading.
- [ ] **FIX-30-AC04** On `/` at 390, activate `[data-testid="menu-trigger"]` from the keyboard. On
      open, `document.activeElement.tagName` is `H2` and `document.activeElement.textContent.trim()`
      is `Menü`.
- [ ] **FIX-30-AC05** The working half still works. After AC03, press Escape:
      `document.activeElement === document.querySelector('[data-testid="filter-trigger"]')` returns
      `true`. After AC04, press Escape:
      `document.activeElement === document.querySelector('[data-testid="menu-trigger"]')` returns
      `true`. Both were already correct before this task and must still be correct after it.
- [ ] **FIX-30-AC06** In each of the four dialogs — nav drawer, filter drawer, terms dialog, zoom
      modal — Tab and Shift+Tab stay inside the panel: from the last focusable element, Tab returns
      to the first, and `panel.contains(document.activeElement)` stays `true` for a full cycle. The
      CDK focus trap already provides this; the criterion is here because the `autoFocus` change
      touches the same code path and a regression would be silent.
- [ ] **FIX-30-AC07** `src/app/shared/ui/accessible-dialog/dialog-focus.spec.ts` exists, asserts
      the three named behaviours in "Regression test" above, and `npm run test` exits 0.
- [ ] **FIX-30-AC08** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim.
- [ ] **FIX-30-AC09** The value measured in "How to verify" step 1, before any edit, is recorded
      verbatim in the commit body, together with which of B1 and B2 it agreed with.
- [ ] **FIX-30-AC10** `grep -n "as HTMLElement" src/app/shared/ui/accessible-dialog/accessible-dialog.ts`
      returns nothing, and `grep -n "this.host" src/app/shared/ui/accessible-dialog/accessible-dialog.ts`
      returns nothing.

### Design rules (mi-bolt-design 1.0.1)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- [ ] **FIX-30-AC11** Applicable and asserted above: **R23** ("Handle focus, background exclusion,
      dismissal and focus restoration in modals" — AC01 to AC06 cover all four clauses; record for
      each of the four dialogs that `document.querySelector('.cdk-overlay-backdrop')` is not `null`,
      and that the app root element outside the panel carries `aria-hidden="true"` or `inert`),
      **R20** ("keyboard operation, visible focus and a meaningful accessible name" — every
      criterion above is driven from the keyboard; additionally record that the focus ring on the
      newly focused `<h2>` is visible against the panel's white surface, and that the heading is
      announced with its level), **R21** (44×44 targets — the close button uses
      `min-width/min-height: var(--size-control)` at `accessible-dialog.scss:35-38`; re-measure its
      rect at 390 after the focus change and record it), **R19** (states stay distinct — the filter
      drawer's disabled state, driven by `[disabled]="isRefreshing()"`, must still render while the
      heading holds focus).
- [ ] **FIX-30-AC12** Recorded as N/A with reasons: **R01, R02, R03** — the change adds no imagery
      and alters no brand, shell or hero colour. **R04, R06** — no colour, dimension or spacing
      value is introduced or changed. **R05** — no container width or centreline is touched.
      **R07** — no font or type-scale declaration is touched. **R09** — no text/background colour
      pair changes; `FIX-31` owns contrast. **R10, R11** — no image markup or aspect ratio is
      touched. **R12, R15** — the task adds no string at all, so no Hungarian copy and no demo
      labelling changes. **R13, R14, R17, R18, R24, R25** — the change is focus behaviour only and
      reaches no price field, variant logic, filter state, persistence or offer copy. **R16** — the
      application has exactly one provider. **R22** — no responsive rule changes; `FIX-26` owns the
      narrow-layout failure. **R26** — a handoff-practice rule, satisfied by the commit body and the
      recorded evidence rather than by runtime behaviour.

## Commit

This task is exactly one commit. Do not bundle it with another FIX task, and do not commit until
every acceptance criterion above has passed and its output is recorded. The commit carries the
three changes in `accessible-dialog.ts` — the restore fallback, the new `initialFocus` input, and
the corrected `restoreTarget` doc comment — the one attribute added to each of the two drawer
templates, and the new spec file — four files in total (`accessible-dialog.ts`,
`mobile-drawer.html`, `filter-drawer.html`,
`src/app/shared/ui/accessible-dialog/dialog-focus.spec.ts`), and no screenshot changes, because
this task runs no screenshot-writing Playwright suite.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: restore dialog focus on close and focus the drawer heading on open
```
