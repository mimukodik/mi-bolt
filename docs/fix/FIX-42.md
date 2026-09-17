# FIX-42 — Make router fragment navigation work at all

Status: PLANNED — not executed.
Severity: major
Source: A3 (navigation sweep), B1 (header and footer link clicks), `docs/spec/screens.md:33`.

## Why this is wrong

Four links in the application's permanent chrome navigate to a URL fragment, and
not one of them can work. Nothing in `src/app/` declares `id="how"` or `id="demo"`,
so there is no element for the browser to scroll to; and `provideRouter` is
configured without `withInMemoryScrolling`, whose `anchorScrolling` option is
`'disabled'` by default, so even once the ids exist the router will not scroll to
them on an in-page navigation. Both halves are needed: the ids alone leave the
links dead on every SPA navigation, and the router option alone has nothing to
scroll to.

`docs/spec/screens.md:33` requires the header to carry an **"A demóról anchor"**,
which is the link this defect disables, and the same line puts a "Hogyan működik?"
secondary action on the home page. A link that changes the URL and does nothing
visible is a broken control under design rule **R20**, which requires every
interactive element to be operable, and under **R19**, which requires the outcome
of an action to be distinguishable.

## Evidence

### No fragment target exists anywhere

```
$ grep -rn 'id="how"\|id="demo"' src/app
$ echo $?
1
```

Nothing. The home page's how-it-works section carries a `data-testid` and an
`aria-labelledby`, but no `id` on the section itself —
`src/app/features/home/how-demo-works.html:2-9`:

```html
    <section
      class="how"
      data-testid="how-demo-works"
      aria-labelledby="how-heading"
    >
      <div class="how__inner">
        <header class="how__header">
          <h2 id="how-heading" class="how__title">Hogyan működik a demó?</h2>
```

`id="how-heading"` is on the `<h2>` and is used by `aria-labelledby`; it is not the
fragment the links name and it is not a scroll target for the section.

The `demo` fragment has no candidate at all today: the demo strip that
`screens.md:33` requires ("Compact demo banner immediately below header") was
removed from the shell, and **`FIX-33`** rebuilds it under decision **D6**.

### Four dead links in the permanent chrome

The header nav is data-driven. `src/app/core/navigation/header-nav.ts:26-29`:

```ts
const STANDARD_LINKS: readonly NavLink[] = [
  { label: 'Mobiltelefonok', routerLink: '/telefonok' },
  { label: 'A demóról', routerLink: '/', fragment: 'demo' },
];
```

and both renderings bind it. `src/app/core/navigation/header-nav.html:32-39`
(desktop):

```html
        @for (link of navLinks(); track link.label) {
          <a
            class="inline-flex items-center no-underline min-h-10 rounded"
            [routerLink]="link.routerLink"
            [fragment]="link.fragment"
            routerLinkActive="is-active"
```

`src/app/core/navigation/header-nav.html:120-126` (the mobile drawer):

```html
    @for (link of navLinks(); track link.label) {
      <a
        class="block no-underline"
        [routerLink]="link.routerLink"
        [fragment]="link.fragment"
        (click)="closeDrawer()"
```

`src/app/core/navigation/footer-nav.html:13-14`:

```html
        <li><a routerLink="/" fragment="demo" class="inline-flex items-center min-h-10 px-1 no-underline">A demóról</a></li>
        <li><a routerLink="/" fragment="how" class="inline-flex items-center min-h-10 px-1 no-underline">Hogyan működik?</a></li>
```

### The router is not configured for anchor scrolling

`src/app/app.config.ts:27`:

```ts
const _provideRouter = provideRouter(routes, withComponentInputBinding());
```

`withInMemoryScrolling` is not applied. In the installed
`@angular/router` (Angular 22), `node_modules/@angular/router/types/router.d.ts:409`
declares `withInMemoryScrolling(options?: InMemoryScrollingOptions)`, and
`node_modules/@angular/router/types/_router_module-chunk.d.ts:750-793` declares the
two fields it takes:

```ts
interface InMemoryScrollingOptions {
    anchorScrolling?: 'disabled' | 'enabled';
    scrollPositionRestoration?: 'disabled' | 'enabled' | 'top';
}
```

Both default to `'disabled'`, which is why the router changes the URL and leaves the
scroll position alone.

### Who owns the repair

**This task owns the whole of it**: the router option, the fragment targets, and the
four chrome links above. No other task in the package adds `withInMemoryScrolling`
to `src/app/app.config.ts:27`, and none adds `id="how"`.

**`FIX-33` depends on this task and therefore lands after it.** That task rebuilds
the home page to the prototype and creates two hero call-to-action buttons, the
secondary one of which is an anchor to the how-it-works section; those buttons work
only once the router option and the target id this task adds are in place. This task
does not touch the hero and does not create those two buttons.

## What to change

### 1. `src/app/app.config.ts` — enable anchor scrolling

Import `withInMemoryScrolling` from `@angular/router` alongside the two symbols
already imported at `:10`, and add it to the existing `_provideRouter` constant:

```ts
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
```

```ts
const _provideRouter = provideRouter(
  routes,
  withComponentInputBinding(),
  withInMemoryScrolling({
    anchorScrolling: 'enabled',
    scrollPositionRestoration: 'enabled',
  }),
);
```

`scrollPositionRestoration: 'enabled'` is included deliberately, not as an extra:
`docs/spec/screens.md:53` lists "back/forward restoration" among the catalogue's
required states, and without this option a browser-back into the catalogue lands at
the top of the list rather than where the user left it. Do not use `'top'`, which
would reset every navigation and defeat that requirement.

Keep the constant a single named top-level `const`. `app.config.ts:18-24` explains
why each provider is bound that way, and `app.config.ts:57-63`'s `providerManifest`
re-exports `_provideRouter` for `app.spec.ts` to assert against; both keep working
because the constant's name and shape do not change.

### 2. `src/app/features/home/how-demo-works.html` — give the section its id

Add `id="how"` to the `<section>` element at `:2-6`. Add nothing else; the
`data-testid`, the `class` and the `aria-labelledby` all stay.

```html
    <section
      id="how"
      class="how"
      data-testid="how-demo-works"
      aria-labelledby="how-heading"
    >
```

Also add `scroll-margin-top` to the existing `.how` rule at
`src/app/features/home/how-demo-works.scss:12`, so the sticky 64 px header
(`docs/spec/screens.md:35`: "64px header") does not cover the heading the browser
scrolls to:

```scss
.how {
  background: var(--color-surface-section);
  color: var(--color-text-primary);
  padding: var(--space-9) var(--layout-gutter-mobile);
  scroll-margin-top: var(--space-10);
}
```

`--space-10` is 64 px, which is exactly the header height the spec names; it is an
existing token, so no number is invented (**R04**, and
`.claude/rules/planning-deliverables.md`).

### 3. The `demo` fragment target — a requirement placed on `FIX-33`'s element

The element the `demo` fragment names is the demo strip that `screens.md:33`
requires and that **`FIX-33`** restores under decision **D6**. Because this task
lands first, the expected case is that the strip does not exist yet, and this task
cannot build it. Check which case applies before editing:

```bash
grep -rn 'data-testid="demo-notice"\|id="demo"' src/app
```

- **If that grep finds a demo strip component and it carries no `id="demo"`**, add
  `id="demo"` to its outermost rendered element and `scroll-margin-top:
  var(--space-10)` to that element's rule, exactly as item 2 does for the
  how-it-works section. Record in the commit body that `FIX-33` had already landed.
- **If that grep finds nothing** — the expected case — `FIX-33` has not landed yet.
  Do **not** build a demo strip here: that is `FIX-33`'s deliverable and building a
  second one would give the page two. Instead, leave the `demo` fragment target
  unbuilt and write the requirement into the commit body in these exact terms, so
  the review round can place it: *the demo strip `FIX-33` restores must carry
  `id="demo"` on its outermost rendered element and `scroll-margin-top:
  var(--space-10)` on that element's rule; the router option and the footer and
  header links that point at it are already in place.* Record it as the one part of
  this task that is blocked on `FIX-33`. FIX-42-AC03 and FIX-42-AC05 are written to
  be answerable either way.

**Never add a second `id="demo"`.** Two elements with the same id is a
`duplicate-id` axe violation and the fragment would resolve to whichever comes
first.

### 4. Leave the four chrome links exactly as they are

`header-nav.ts:28`, `header-nav.html:36`, `header-nav.html:124` and
`footer-nav.html:13-14` are already correct: they bind the right fragment names to
the right routes. They are listed here so the executor does not "fix" them. Once
items 1 to 3 land, all four start working with no edit.

### 5. Add a spec: `tests/fragment-navigation.spec.ts`

Put it in `tests/` for the reason **FIX-31** states and **FIX-06** owns:
`vitest.config.ts:506` sets `include: ['tests/**/*.spec.ts']`, and `npm run test`
is red at baseline (**FIX-04**).

Assert two things, both of them behaviour:

- `providerManifest.router` from `src/app/app.config.ts` is built from a
  `provideRouter` call that includes an in-memory-scrolling feature. Assert it by
  bootstrapping a `TestBed` with `appConfig.providers` and reading the injected
  router options, **not** by reading `app.config.ts` as text — a source-text
  assertion is the pattern **FIX-07** exists to remove.
- Rendering `HowDemoWorks` produces an element whose `id` is `how`, and that
  element is the same element that carries `data-testid="how-demo-works"`.

Do not assert scroll position in a unit test: jsdom has no layout, so
`scrollIntoView` is a no-op there. Scrolling is measured in the browser, by
FIX-42-AC02 to FIX-42-AC04.

## Out of scope

- **The home page rebuild — `FIX-33`.** It owns the hero, its two call-to-action
  buttons, the demo strip it restores under **D6**, the featured section and the
  how-it-works copy. It does **not** own the router option or the fragment targets:
  those are this task's, and `FIX-33`'s two call-to-action buttons depend on them,
  so **this task lands first**. This task adds one attribute and one
  `scroll-margin-top` to the how-it-works section and touches nothing else on the
  home page. If `FIX-33` has nevertheless already changed `how-demo-works.html`, add
  the `id` to whatever element is there now rather than restoring the markup quoted
  above.
- **The header's hidden search below 1024 px — `FIX-28`**, and the mobile drawer's
  behaviour generally — `FIX-30` owns drawer focus. This task changes no class, no
  breakpoint and no handler in `header-nav.html`, `header-nav.scss` or
  `header-nav.ts`.
- **`HeaderNav`'s and `AppFooter`'s contract drift against
  `docs/spec/components.md:71-98`** (A3 finding 13). Split since this task was written:
  `AppFooter`'s missing `compact:boolean` input (`components.md:88-92`) is now
  **`FIX-64`**'s. `HeaderNav`'s own drift against `components.md:71-84` (the spec's
  `searchQuery`/`cartCount` inputs and `searchSubmitted` output; the component injects
  the facade and navigates itself) remains genuinely unowned — no FIX number in the
  package closes it. This task does not close either.
- **The home page's 404-ing quick-filter links — `FIX-18`.** Different links, a
  different defect, a different file.
- **Adding any further fragment link, anchor or in-page table of contents.** The
  spec names two anchors. Design rule **R25** forbids inventing navigation.
- **`src/app/app.routes.ts`.** The wildcard's position is **`FIX-09`**'s.

## How to verify

Run these from the repository root, in order. The package manager is **npm
11.17.0**; there is no pnpm and no mise in this repository.

```bash
npm run build                                   # expected exit 0
npx vitest run tests/fragment-navigation.spec.ts # expected exit 0
npm run test                                    # record the exit code; a failure attributable to
                                                 # FIX-04 does not fail this task, but the spec
                                                 # file above must pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty. Do not run the full Playwright
suite: it rewrites 49 tracked screenshots under `e2e/design/screenshots/`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R20 applies and is the rule this task restores**: four links in the permanent
  chrome become operable. AC02 and AC03 measure them by clicking, and AC04 by
  keyboard.
- **R19 applies**: the outcome of activating an anchor link becomes observable
  (the page scrolls) instead of silent.
- **R04 applies**: `scroll-margin-top` uses `--space-10`, an existing token; no new
  dimension is introduced.
- **R06 applies**: that token is a value from the 4 px system.
- **R22 applies**: the same anchors are exercised at 390, where the link lives in
  the mobile drawer rather than in the desktop nav. AC03 covers it.
- **R23 applies**: activating the anchor from inside the mobile drawer must close
  the drawer and restore focus. The `(click)="closeDrawer()"` handler at
  `header-nav.html:125` already does the first half; AC03 confirms both.
- R01, R02, R03, R05, R07–R18, R21, R24, R25: N/A. The change adds no imagery or
  brand asset (R01, R10, R11), alters no shell, hero or palette (R02, R03), changes
  no width or centreline (R05), touches no font or type scale (R07), adds and
  removes no action (R08), changes no colour pair (R09), adds no string (R12,
  R15), reaches no price, data source, provider, variant or filter (R13, R14,
  R16–R18), changes no target size (R21), persists nothing (R24) and invents no
  content (R25). R26 is satisfied by the commit body and the recorded evidence.

## Acceptance criteria

Every browser criterion is checked in a real browser driven through
`mcp__chrome-devtools__*`, at 1x device pixel ratio and light colour scheme.
Reading the diff, an HTTP 200 and a green unit test are none of them a browser
check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-42-AC01** `grep -rn 'id="how"' src/app` returns exactly one line. The
      command returned nothing and exited 1 before the change. There is exactly one
      match, not two.
- [ ] **FIX-42-AC02** At 1440, open `http://localhost:4200/`, scroll to the top, and
      record `window.scrollY` (expected `0`). Click the footer's "Hogyan működik?"
      link. Afterwards: `location.hash` is `#how`, `window.scrollY` is greater than
      `0`, and `document.getElementById('how').getBoundingClientRect().top` is
      between `0` and `80` — the section's top is on screen and is not hidden behind
      the 64 px header. Record all three numbers and a screenshot.
- [ ] **FIX-42-AC03** At 390 on the same page, open the mobile menu, click "A
      demóról" in the drawer, and record: the drawer closes, `location.hash` is
      `#demo`, and — **only if the demo strip exists**, per "What to change" item 3
      — `window.scrollY` is greater than `0` and the strip is on screen. If the strip
      does not exist yet because `FIX-33` has not landed, record that instead, with
      the output of the grep from item 3, and mark this criterion as blocked on
      `FIX-33` rather than as passed.
- [ ] **FIX-42-AC04** From the top of `/` at 1440, press `Tab` until the header's
      "A demóról" link has focus (confirm with `document.activeElement.textContent`),
      then press `Enter`. The same three measurements as AC02 or AC03 apply,
      depending on whether the demo strip exists. The link must be reachable by
      keyboard and must have a visible focus ring in the screenshot.
- [ ] **FIX-42-AC05** Navigating to `http://localhost:4200/#how` as a **fresh page
      load** (not an in-page click) also lands on the section:
      `document.getElementById('how').getBoundingClientRect().top` is between `0` and
      `80` once the page has settled. Record the number. If it is not, record the
      measured value and report it — the two paths go through different router code
      and one working is not evidence for the other.
- [ ] **FIX-42-AC06** Back and forward still behave. From `/` scrolled to `#how`,
      navigate to `/telefonok`, scroll the catalogue down at least 400 px, then press
      browser Back and Forward. Record `window.scrollY` after each. The catalogue's
      position is restored rather than reset to the top — that is what
      `scrollPositionRestoration: 'enabled'` buys and `docs/spec/screens.md:53`
      requires.
- [ ] **FIX-42-AC07** An axe run on `/` at 1440 reports **zero** violations, and in
      particular no `duplicate-id`. Record the output.
- [ ] **FIX-42-AC08** `tests/fragment-navigation.spec.ts` exists, asserts the two
      behaviours listed under "What to change" item 5 without reading any source file
      as text, and `npx vitest run tests/fragment-navigation.spec.ts` exits 0.
- [ ] **FIX-42-AC09** `npm run build` exits 0 and `npm run test`
      exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/fragment-navigation.spec.ts` instead.

## Commit

This task is exactly one commit. The two halves — the fragment targets and the
router option — are one change because neither is observable without the other, and
FIX-42-AC02 measures them together. Do not bundle it with any other FIX task, and
do not commit until every acceptance criterion above has passed and its output is
recorded.

The commit body states which of the two cases in "What to change" item 3 applied, so
the next reader can tell a completed `demo` anchor from one whose element `FIX-33`
has yet to build, and repeats the requirement item 3 places on that element:
`id="demo"` and `scroll-margin-top: var(--space-10)`, added once and only once.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: make router fragment links scroll to a real target
```
