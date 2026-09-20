# FIX-41 — Style the 404 page and give it the catalogue link the spec requires

Status: PARTIAL — `NotFoundPage` now ships `not-found-page.scss` (tokens only, plus the
named structural exceptions), the decorator gained `styleUrl`, and the template gained the
`/telefonok` catalogue link, `data-testid`s and a `.title`/`.lede`/`.links`/`.link`
class structure per this document's markup; worktree commit (sha filled in by the
orchestrator after cherry-pick), spanning `not-found-page.ts`/`.html`, the new `.scss` and
a new spec. One deviation from this document's own instruction: **FIX-06 has landed and
moved feature specs out of root `tests/` into co-location beside their components**
(confirmed — every other feature spec under `src/app/features/**` is co-located, not
under `tests/`), so the new spec is `src/app/features/not-found/not-found-page.spec.ts`
rather than `tests/not-found-page.spec.ts`, following the landed policy rather than this
document's stale text. `FIX-35`'s row 16 about this same defect was searched for and not
found in the current `docs/fix/FIX-35.md` — no duplicate anchor to reconcile. Open:
**AC01–AC06** are real-browser checks (styled render, centreline, axe, focus rings,
in-page navigation, 390 wrap) deferred to the orchestrator's batched browser-verification
pass; the unit-level facts (two links, hrefs, heading text) are covered directly by the
new spec instead.
Severity: major
Source: A6 (idiom sweep, the missing `.scss`), B1 (browser observation of the rendered 404), `docs/spec/screens.md:27`. Recorded as unowned in `FIX-15` and `FIX-14`; this task is its owner.

## Why this is wrong

Two defects on one screen. First, `NotFoundPage` declares a `templateUrl` and no
`styleUrl`, and no stylesheet exists in its directory, while its template applies
`class="not-found"` — a class no stylesheet in the repository defines. The page
therefore renders with no styling at all: plain black text on white, top-left
aligned, with no card, no centreline and no spacing. Under `docs/spec/screens.md:95`
every screen's rendered state has to follow its component contract, and design rule
**R05** requires content to sit on the shared centreline, which an unstyled block
cannot do.

Second, `docs/spec/screens.md:27` specifies the utility route as *"404 with
Home/Catalogue links"* — two links — and the template offers one. Under **D1** the
specification is right and the code is wrong, so the catalogue link is added; the
spec line is not edited.

## Evidence

### The directory has no stylesheet

```
$ ls -la src/app/features/not-found/
-rw-r--r--@ 1 eggp staff 258 szept. 16 20:09 not-found-page.html
-rw-r--r--@ 1 eggp staff 504 szept. 16 20:09 not-found-page.ts
```

Two files. Every other feature directory in `src/app/features/` ships a `.ts`, a
`.html` and a `.scss` for each rendered component.

### The component declares no `styleUrl`

`src/app/features/not-found/not-found-page.ts:10-15`:

```ts
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  templateUrl: './not-found-page.html',
})
export class NotFoundPage {}
```

### The template's only class is undefined

`src/app/features/not-found/not-found-page.html`, in full:

```html

    <section class="not-found">
      <h1>Az oldal nem található</h1>
      <p>A keresett oldal nem érhető el a MiBolt demóban.</p>
      <nav aria-label="Hasznos linkek">
        <a routerLink="/">Vissza a főoldalra</a>
      </nav>
    </section>
```

```
$ grep -rn "\.not-found\b" src
$ echo $?
1
```

No hits anywhere in `src/`, stylesheets included. `.not-found` selects nothing, so
the `<section>` is an unstyled block; the `<h1>`, `<p>` and `<a>` fall back to the
user-agent defaults plus whatever `src/styles/primitives.css` sets on `html` and
`body`. A browser agent opened the route independently and reported the same
consequence from the rendered page: plain black text, no card, top-left aligned, no
page styling of any kind.

### The spec requires two links

`docs/spec/screens.md:27`:

```text
| Utility | `**` | ShopLayout | 404 with Home/Catalogue links |
```

`not-found-page.html:6` is the only link and it points at `/`.

### The route and its shell are correct and are not part of this defect

`src/app/app.routes.ts:180-190` mounts the wildcard inside `ShopLayout`, which is
what `screens.md:27` asks for. The wildcard's **position** in the array is a
separate, confirmed defect that makes `/primitives` and `/canary` unreachable;
**`FIX-09`** owns moving it. Do not reorder the array in this task.

## What to change

### 1. Create `src/app/features/not-found/not-found-page.scss`

Every value below is an existing token from `src/styles/tokens.css`, except the
structural values named as exceptions here: the `1px`/`2px` border and outline
widths, the `2px` outline offset, the `60ch` lede max-width and the `1024px`
breakpoint carry no colour or spacing meaning a token would replace. Introduce no
other raw colour and no other raw dimension (**R04**).

```scss
.not-found {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  align-items: flex-start;
  max-width: var(--layout-container-max);
  margin: 0 auto;
  padding: var(--space-9) var(--layout-gutter-mobile);
}

.title {
  margin: 0;
  font-size: var(--type-page-title-mobile);
  line-height: var(--line-height-heading);
  font-weight: var(--weight-bold);
  color: var(--color-text-primary);
}

.lede {
  margin: 0;
  max-width: 60ch;
  font-size: var(--type-body);
  line-height: var(--line-height-body);
  color: var(--color-text-secondary);
}

.links {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
}

.link {
  display: inline-flex;
  align-items: center;
  min-height: var(--size-control);
  padding: 0 var(--space-4);
  border-radius: var(--radius-control);
  font-size: var(--type-body);
  text-decoration: none;
}

.link--primary {
  background: var(--color-brand-accent);
  color: var(--color-text-primary);
}

.link--secondary {
  border: 1px solid var(--color-border-control);
  color: var(--color-brand-ink);
}

.link:focus-visible {
  outline: 2px solid var(--color-focus-light);
  outline-offset: 2px;
}

@media (min-width: 1024px) {
  .not-found {
    padding: var(--space-10) var(--layout-gutter-desktop);
  }

  .title {
    font-size: var(--type-page-title);
  }
}
```

`min-height: var(--size-control)` is 44 px, which is design rule **R21**'s
requirement for every target in the shopping flow; `--color-brand-accent` with
`--color-text-primary` is the pair `docs/spec/screens.md:9` names ("Orange#FF6A00
with dark#171B1F button text"), which is **R09**. `--color-brand-ink` is the
"#A83B00 accessible orange-toned links" colour from the same line.

### 2. `src/app/features/not-found/not-found-page.ts`

Add the `styleUrl` to the decorator. Change nothing else — the class body stays
empty and `RouterLink` is already imported.

```ts
@Component({
  selector: 'app-not-found-page',
  imports: [RouterLink],
  templateUrl: './not-found-page.html',
  styleUrl: './not-found-page.scss',
})
export class NotFoundPage {}
```

Also update the doc comment above the decorator (`not-found-page.ts:4-9`), which
currently calls the component a "minimal stub" that "gives it a link back home".
After this change that sentence is false; make it describe the two links and the
stylesheet. Leave the rest of the comment, including the sentence about the
`ShopLayout` wildcard mount, exactly as it is.

### 3. `src/app/features/not-found/not-found-page.html`

Replace the file with the version below. The two Hungarian strings that already
exist are kept **character for character**; the only new string is the catalogue
link's label, which uses the catalogue's own name from `docs/spec/screens.md:45`
("Mobiltelefonok") so no new UI wording is invented (**R12**).

```html
<section class="not-found" data-testid="not-found-page">
  <h1 class="title">Az oldal nem található</h1>
  <p class="lede">A keresett oldal nem érhető el a MiBolt demóban.</p>
  <nav class="links" aria-label="Hasznos linkek">
    <a
      class="link link--primary"
      routerLink="/"
      data-testid="not-found-home-link"
    >Vissza a főoldalra</a>
    <a
      class="link link--secondary"
      routerLink="/telefonok"
      data-testid="not-found-catalog-link"
    >Mobiltelefonok</a>
  </nav>
</section>
```

The leading blank line and the four-space indentation in the current file are
artefacts of the template having been cut out of an inline decorator string; the
replacement above starts at column 0, which is how every other `.html` in
`src/app/features/` is written.

### 4. Add a spec: `tests/not-found-page.spec.ts`

Put it in `tests/`, not beside the component. **FIX-06** owns the policy of where
feature specs live, and this file follows it; when that task runs it moves this
file with the others.

Assert the rendered DOM, not the source text:

- The component renders exactly two links inside `[aria-label="Hasznos linkek"]`.
- `[data-testid="not-found-home-link"]` has an `href` of `/`.
- `[data-testid="not-found-catalog-link"]` has an `href` of `/telefonok`.
- The `<h1>` text is `Az oldal nem található`.

Use `RouterTestingHarness` or a `TestBed` with `provideRouter([])` so `routerLink`
produces a real `href`; a bare `TestBed.createComponent` without a router provider
throws on the directive.

**Do not assert a computed style in this spec.** The JIT resource resolver at
`tests/setup-msw.ts:57-130` loads `styleUrl` files by basename from disk and hands
the compiler their **raw SCSS source**, not compiled CSS, so a `getComputedStyle`
reading in jsdom proves nothing about the shipped page. The computed values are
measured in the browser, by FIX-41-AC01 to FIX-41-AC04.

## Out of scope

- **The wildcard route's position in `src/app/app.routes.ts`.** `**` is declared at
  `:181` before `primitives` at `:194` and `canary` at `:202`, so both of those
  render this page instead of their own. That is the confirmed root cause of most
  of the 41 Playwright failures and **`FIX-09`** owns it. Do not reorder the array
  here, and do not "fix" the two routes while measuring this page.
- **`ShopLayout`, the header and the footer.** This task changes what sits between
  them, nothing else. The header's dead `A demóról` anchor is **`FIX-42`**.
- **Moving inline templates and styles into files generally — `FIX-14`.** That task
  names the three components it moves; this one is not among them, and it is the
  opposite operation (a file that does not exist yet). `FIX-14`'s out-of-scope
  section records this page as unowned; after this task it is owned here.
- **Deleting dead components — `FIX-15`.** `NotFoundPage` is live and reachable.
  `FIX-15`'s Evidence section records this defect and explicitly does not repair
  it.
- **`FIX-35`'s copy table row 16.** That row names the same defect — *"404 useful
  links | Home **and** Catalogue | Home only | `src/app/features/not-found/not-found-page.html:5-7`
  | screens.md:27"* — so two tasks would add the same anchor to the same file. **This
  task owns the whole of the 404 page**, styling and links together, because the link
  cannot be added without deciding how it is styled; `FIX-35`'s row 16 must be cut. If
  `FIX-35` has nevertheless already added a catalogue link, keep it,
  give it the classes and `data-testid` above, and say so in the commit body — do not
  add a second one.
- **Hardcoded colours and spacing elsewhere — `FIX-17`.** The new stylesheet uses
  tokens from the start; do not retokenise anything outside this directory.
- **UI copy — `FIX-35`.** The two existing Hungarian strings are copied unchanged.
  If `FIX-35` has already landed and changed either of them, keep whatever is in
  the file and say so in the commit body; do not restore the strings quoted above.
- **Adding a `<p>` about the demo, a search box, a suggestion list or any other
  content the spec does not name.** `screens.md:27` names a heading, an
  explanation and two links. Design rule **R25** forbids inventing content.

## How to verify

Run these from the repository root, in order. The package manager is **npm
11.17.0**; there is no pnpm and no mise in this repository, so every command is a
bare `npm run …` or `npx …`.

```bash
npm run build                    # expected exit 0
npx vitest run tests/not-found-page.spec.ts   # expected exit 0
npm run test                     # record the exit code; a failure attributable to FIX-04 does
                                  # not fail this task, but the spec file above must pass
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty. Do not run the full Playwright
suite for this task: it rewrites 49 tracked screenshots under
`e2e/design/screenshots/`.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R04 applies and is central**: every value in the new stylesheet is an existing
  token, except the structural exceptions named in "What to change" item 1. AC07
  checks it mechanically.
- **R05 applies**: the page sits on the shared centreline with
  `max-width: var(--layout-container-max)` (1320 px) and `margin: 0 auto`. AC02
  measures it.
- **R06 applies**: spacing comes from `--space-*`, which is the 4 px system, and
  the radius is `--radius-control` (6 px) on a control-shaped link.
- **R09 applies**: the primary link is `--color-brand-accent` with
  `--color-text-primary`, the pair `screens.md:9` names; the secondary link uses
  `--color-brand-ink`. AC03 measures the contrast with axe.
- **R20 applies**: both links are native anchors with visible text and a
  `:focus-visible` outline. AC04 checks the focus ring.
- **R21 applies**: both links are at least 44 px tall. AC04 measures the rects.
- **R12 applies**: the Hungarian strings keep their accents and the new label is
  taken from the spec rather than invented.
- **R25 applies**: nothing beyond the heading, the sentence and the two links is
  added.
- R01, R02, R03, R07, R08, R10, R11, R13–R19, R22–R24: N/A. The change adds
  no brand asset or imagery (R01, R10, R11), alters no shell or hero surface (R02),
  introduces no new palette (R03), adds no font declaration beyond the inherited
  `--font-family-base` (R07), adds no button that competes with a primary action on
  another screen (R08), touches no price, offer, variant, filter or data source
  (R13–R18), creates no loading, error or success state (R19), adds no responsive
  rule beyond the one gutter breakpoint the catalogue already uses (R22), opens no
  dialog (R23), stores nothing (R24), and R26 is satisfied by the commit body and
  the recorded evidence rather than by runtime behaviour.

## Acceptance criteria

Every browser criterion is checked in a real browser driven through
`mcp__chrome-devtools__*`, at 1x device pixel ratio and light colour scheme.
Reading the diff, a file listing, an HTTP 200 and a green unit test are none of
them a browser check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-41-AC01** With the dev server running, open
      `http://localhost:4200/ez-az-oldal-nem-letezik` at 1440. A screenshot shows a
      styled page: the heading, the sentence and two side-by-side links. Record the
      screenshot. Before the change the same URL rendered unstyled black text at the
      top-left corner.
- [ ] **FIX-41-AC02** On that page,
      `getComputedStyle(document.querySelector('[data-testid="not-found-page"]')).maxWidth`
      returns `1320px`, and the element's `getBoundingClientRect()` is horizontally
      centred in the viewport: `left` and `viewportWidth - right` differ by no more
      than 1 px.
- [ ] **FIX-41-AC03** An axe run on that page reports **zero** violations. Record
      the full output. Axe reported zero violations on this page before the change
      as well, so this criterion is a no-regression check: the new colours must not
      introduce a `color-contrast` failure.
- [ ] **FIX-41-AC04** `document.querySelector('[data-testid="not-found-catalog-link"]')`
      exists, its `getBoundingClientRect().height` is at least 44, the same holds for
      `[data-testid="not-found-home-link"]`, and pressing `Tab` until each is focused
      produces a visible focus ring in a screenshot.
- [ ] **FIX-41-AC05** Clicking `[data-testid="not-found-catalog-link"]` navigates to
      `/telefonok` and the catalogue's `[data-testid="filter-sidebar"]` mounts.
      Clicking `[data-testid="not-found-home-link"]` from a fresh 404 navigates to
      `/` and `[data-testid="hero"]` mounts. Both are in-page router navigations, not
      full page loads.
- [ ] **FIX-41-AC06** The same two checks hold at 390: both links are at least 44 px
      tall, they wrap onto separate rows rather than overflowing, and
      `document.documentElement.scrollWidth` is not greater than
      `document.documentElement.clientWidth`.
- [ ] **FIX-41-AC07** `git diff src/styles/tokens.css` is empty for this commit, and
      `grep -nE "#[0-9a-fA-F]{3,8}|[0-9]+px" src/app/features/not-found/not-found-page.scss`
      shows no new literal introduced by this change beyond the structural
      exceptions named in "What to change" item 1 (the `1px`/`2px` border and outline
      widths, the `2px` outline offset and the `1024px` breakpoint).
- [ ] **FIX-41-AC08** `grep -rn "\.not-found\b" src` now returns at least one line —
      the class the template applies has a definition. The command returned nothing
      and exited 1 before the change.
- [ ] **FIX-41-AC09** `grep -n "styleUrl" src/app/features/not-found/not-found-page.ts`
      returns one line naming `./not-found-page.scss`, and that file exists.
- [ ] **FIX-41-AC10** `tests/not-found-page.spec.ts` exists and asserts the four
      rendered facts listed under "What to change" item 4;
      `npx vitest run tests/not-found-page.spec.ts` exits 0.
- [ ] **FIX-41-AC11** `npm run build` exits 0 and `npm run test`
      exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/not-found-page.spec.ts` instead.

## Commit

This task is exactly one commit. Do not bundle it with any other FIX task, and do
not commit until every acceptance criterion above has passed and its output is
recorded. The commit carries the new `.scss`, the edited `.ts` and `.html`, and the
new spec file. The commit body names the two defects separately —
the missing stylesheet and the missing catalogue link — and records that
`FIX-15` and `FIX-14` had both flagged this page as unowned.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: style the 404 page and add the catalogue link screens.md requires
```
