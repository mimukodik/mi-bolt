# FIX-71 — Render real preview images in the product gallery's thumbnail row

Status: PLANNED — not executed.
Severity: major
Source: Split out of FIX-23 item 6 by RULINGS-B2 (finding S5a-23): it shares no file, no
cause, no symptom and no spec file with FIX-23's ?variant= contract work.
docs/spec/screens.md:59 requires a thumbnail row.

## Why this is wrong

`docs/spec/screens.md:59` requires the product gallery to include a "thumbnail row" as
part of its media surface. What renders instead is a checkmark glyph and a bare digit:

`src/app/features/product/product-gallery.html:56-57`:

```html
              <span class="thumb-mark" aria-hidden="true">{{ thumbLabel(i) }}</span>
              <span class="thumb-check" aria-hidden="true">✓</span>
```

with `thumbLabel(index)` returning `${index + 1}` (`product-gallery.ts:169-171`). There is
no `<img>` anywhere in the row — a person looking at the thumbnail strip sees a row of
tick marks and index numbers, not photographs of the device.

**Why this is its own task rather than part of `FIX-23`.** `FIX-23` repairs the product
page's `?variant=` query-parameter round trip: three symptoms (a reload losing the
selection, an unresolvable deep link rendering silently, and a nonexistent slug reusing the
generic error state) that are all the same unread `ParamMap` at `product-page.ts:190` and
`:205`. The thumbnail row shares none of that: it is a different cause (no `<img>` element,
not an unread query parameter), a different symptom (a missing image, not a stale URL), a
different file set (`product-gallery.{html,ts,scss}` and its spec, never
`product-page.*` or `product.facade.ts`), and a different specification line
(`screens.md:59`, not `screens.md:21` or `:61`). `.claude/CLAUDE.md`'s own test for a
single commit — "a commit a reviewer cannot describe in one sentence is two commits" —
fails on the four-defect version of this task, whose own suggested subject line needed
three clauses joined by "and". `.claude/rules/session-lifecycle.md` ("One commit, one
logical change") and `.claude/rules/planning-deliverables.md` ("One file per independently
executable unit") both point the same way, and decisions **D8**, **D13** and **D15** are
the user's standing answer to leaving a measured defect unowned: *"nem hagyunk hátra ismert
hibát"*.

## Evidence

**The thumbnail markup, measured on this branch.** `src/app/features/product/
product-gallery.html:46-59`:

```html
      <ol class="thumbs" aria-label="Galéria indexképei">
        @for (image of images(); let i = $index; track i) {
          <li>
            <button
              type="button"
              class="thumb"
              [attr.data-testid]="'gallery-thumb-' + i"
              [attr.aria-current]="i === imageIndex() ? 'true' : 'false'"
              [attr.aria-label]="'Ugrás a(z) ' + (i + 1) + '. képre'"
              (click)="goTo(i)"
            >
              <span class="thumb-mark" aria-hidden="true">{{ thumbLabel(i) }}</span>
              <span class="thumb-check" aria-hidden="true">✓</span>
            </button>
          </li>
        }
      </ol>
```

`thumbLabel` (`product-gallery.ts:169-171`):

```ts
  thumbLabel(index: number): string {
    return `${index + 1}`;
  }
```

`grep -n "thumbLabel" src/app/features/product/product-gallery.ts` returns exactly this
one declaration and its call site at `:57`; nothing else in `src/` references it, so
deleting it orphans no other caller.

**The stylesheet, measured on this branch.** `src/app/features/product/
product-gallery.scss:104-141`:

```scss
      .thumb {
        position: relative;
        min-width: var(--size-control);
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        border-radius: var(--radius-control);
        border: 1px solid var(--color-border-subtle);
        background: var(--color-surface-light);
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-helper);
        font-weight: var(--weight-medium);
        cursor: pointer;
      }

      .thumb[aria-current='true'] {
        border-color: var(--color-brand-ink);
        background: var(--color-brand-accent-soft);
        color: var(--color-brand-ink);
      }

      .thumb:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .thumb-mark { display: inline-block; }

      .thumb-check {
        display: none;
        margin-left: var(--space-2);
        font-weight: var(--weight-bold);
      }

      .thumb[aria-current='true'] .thumb-check { display: inline-block; }

      .thumb[aria-current='true'] .thumb-mark { display: none; }
```

`.thumb` has no picture shape today — no `overflow: hidden`, no aspect ratio, no
`object-fit` rule — because it has never held an image.

**The gallery spec today.** `tests/product-gallery.spec.ts:84` already asserts that
`gallery-thumb-` renders (`grep -n "gallery-thumb-" tests/product-gallery.spec.ts`
confirms it); it makes no assertion about an `<img>` and none about `thumbLabel`.
`grep -rln "gallery-thumb-" src tests` returns only `tests/product-gallery.spec.ts` and the
component's own files, confirming the file has not moved under `src/` yet, i.e. **FIX-06**
has not landed at the time this evidence was measured.

**The two auditors who mapped every task onto `product-page.{ts,html}` gave the gallery
file no row at all.** Splitting the thumbnail work out of `FIX-23` therefore adds an
ownership statement where none existed, rather than complicating one that did.

**The one real cost, stated so it is not discovered later: `FIX-50` item 3 reshapes
`ProductGallery`'s signature** (`images`, `selectedImageId`, `productName`,
`imageSelected`, `zoomRequested`) — measured on this branch,
`grep -n "selectedImageId\|imageSelected\|zoomRequested" src/app/features/product/*.ts
src/app/features/product/*.html` returns nothing today, confirming `FIX-50` has not landed
either. So this task and `FIX-50` meet on the same three files, and the order matters — see
"Where this sits in the stream" below.

## What to change

**Prerequisites:** none. **`FIX-50`** item 3 reshapes the same component's signature and
**must land after this one**. **`FIX-23`** is independent; either order works, and neither
touches the other's files.

Three source files and one spec, and nothing else:

### 1. `src/app/features/product/product-gallery.html:56-57`

Replace the two `<span>`s inside each `[data-testid^="gallery-thumb-"]` button with an
`<img class="thumb-img">` plus the existing `.thumb-check` span:

```html
              <img
                class="thumb-img"
                [src]="image.src"
                alt=""
                aria-hidden="true"
                [attr.width]="image.width ?? null"
                [attr.height]="image.height ?? null"
                decoding="async"
                loading="lazy"
              />
              <span class="thumb-check" aria-hidden="true">✓</span>
```

`alt=""` and `aria-hidden` are correct here because the button already carries the
accessible name (`aria-label="Ugrás a(z) N. képre"`), so the image must not be announced
twice. **Do not reuse `<app-product-image>` inside the button**: its root element is a
`<div>` (`src/app/shared/ui/product-image/product-image.html:1`), and a `<div>` is not
valid content for a `<button>`, whose content model is phrasing content.

### 2. `src/app/features/product/product-gallery.ts:169-171`

Delete `thumbLabel`, whose only caller is the span being removed (confirmed above: no
other file in `src/` references it). The non-colour selection indicator stays: it is
`aria-current` plus `.thumb-check`.

### 3. `src/app/features/product/product-gallery.scss:104-141`

Give `.thumb` a picture shape, give `.thumb-img` its rule, give `.thumb-check`
`position: absolute` so the tick overlays the image instead of being laid out below it and
clipped, and delete `.thumb-mark` and the two selectors that read it:

```scss
      .thumb {
        position: relative;
        width: var(--space-10);
        min-width: var(--size-control);
        min-height: var(--size-control);
        padding: 0;
        overflow: hidden;
        border-radius: var(--radius-control);
        border: 1px solid var(--color-border-subtle);
        background: var(--color-surface-light);
        cursor: pointer;
      }

      .thumb[aria-current='true'] {
        border-color: var(--color-brand-ink);
        background: var(--color-brand-accent-soft);
      }

      .thumb:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .thumb-img {
        display: block;
        width: 100%;
        height: auto;
        aspect-ratio: 4 / 3;
        object-fit: contain;
      }

      .thumb-check {
        display: none;
        position: absolute;
        inset-block-end: var(--space-1);
        inset-inline-end: var(--space-1);
        margin-left: 0;
        font-weight: var(--weight-bold);
      }

      .thumb[aria-current='true'] .thumb-check { display: inline-block; }
```

Delete `.thumb-mark { display: inline-block; }` and
`.thumb[aria-current='true'] .thumb-mark { display: none; }` entirely — both selectors
target a class no longer rendered.

`position: absolute` on `.thumb-check` is the load-bearing change: without it, the tick
stays in normal flow beside the new `<img>`, and `.thumb`'s `overflow: hidden` plus the
image's own height push it below the picture and clip it, losing the non-colour selection
indicator R03 requires. `--space-10` (64px) is the existing token the current `.thumb`
width partially reuses via `min-width: var(--size-control)`; keeping the box a fixed
`--space-10` wide gives every thumbnail a uniform, token-derived footprint above the 44px
minimum (R06, R21).

### 4. The gallery spec

`tests/product-gallery.spec.ts` before **FIX-06**,
`src/app/features/product/product-gallery.spec.ts` after it; locate with
`grep -rln "gallery-thumb-" src tests` before editing, since this task may run after
`FIX-06` has moved the file. It already asserts at `:84` that `gallery-thumb-` renders;
add that the button contains an `<img` and no longer contains `thumbLabel`, and that the
selected thumb carries `aria-current`.

## Out of scope

- **`product-page.ts`, `product-page.html` and `product.facade.ts`.** The `?variant=`
  round trip, the `notfound` state and the `ProductStatus` union are **FIX-23**'s.
- **`ProductGallery`'s signature** — index-versus-id, `imageSelected`, `zoomRequested` — is
  **FIX-50** item 3's. This task changes no input, no output and no public member other
  than deleting `thumbLabel`.
- **The zoom dialog.** Unchanged by this task.
- **The main image.** `<app-product-image>` inside `.frame` is unchanged; only the
  thumbnail row below it changes.

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

```bash
npm run build                 # expected exit 0
npx vitest run <the gallery spec>   # expected exit 0
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Gates that are red for reasons this task does not fix, so the executor does not chase
them: `npm run lint` (**FIX-01**), `npm run test` (**FIX-04**, **FIX-08**) and
`npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or the full
`npx playwright test`: both rewrite tracked files and leave the working tree dirty.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R11 applies**: images not stretched or cropped — `4/3` ratio, `object-fit: contain`.
  AC01 measures rendered `naturalWidth`.
- **R06 and R21 apply**: the 64px thumb box comes from the token scale
  (`--space-10`, `src/styles/tokens.css:51`) and never drops below the 44px target. AC03
  measures the rect.
- **R03 and R20 apply**: the selected thumbnail keeps a non-colour indicator (the
  `.thumb-check` tick, now overlaid via `position: absolute`) with a meaningful accessible
  name and visible focus. AC04 measures the overlay geometrically.
- **R26 applies**: the commit body names the count of thumbnails, every measured
  `naturalWidth`, all rects, and the overlay geometry.
- R01, R02, R04, R05, R07–R10, R12–R19, R22–R25: N/A. The change adds no brand asset, no
  new colour token, no new type value, no copy, no price, no filter, no breakpoint and no
  dialog.

## Acceptance criteria

- [ ] **FIX-71-AC01** **Real-browser check at 1440 on `/telefonok/demo-one-5g`.** Each
      `[data-testid^="gallery-thumb-"]` button contains an `<img>` whose `naturalWidth` is
      greater than `0` after load, and the row contains no bare index digit. Record the
      count of thumbs and every `naturalWidth`. Screenshot the row before and after.
- [ ] **FIX-71-AC02** **Real-browser check.** Clicking the second thumbnail still changes
      the main image and the live counter. Record both before and after.
- [ ] **FIX-71-AC03** **Real-browser check at 390 and at 1440.** Every thumbnail button
      measures at least 44 × 44 CSS px. Record all rects.
- [ ] **FIX-71-AC04** **Real-browser check.** The selected thumbnail is distinguishable
      without colour: it carries `aria-current` and its `.thumb-check` tick is rendered
      **over** the image — read the tick's and the image's `getBoundingClientRect()` and
      confirm the tick's box is inside the image's, which is what `position: absolute` buys
      and what a tick laid out in normal flow would fail.
- [ ] **FIX-71-AC05** The gallery spec asserts the thumb button renders an `<img`, no
      longer renders `thumbLabel`, and marks the selected thumb with `aria-current`.
      `npx vitest run <that spec>` exits `0`; record the path and which side of **FIX-06**
      it was on.
- [ ] **FIX-71-AC06** `grep -rn "thumbLabel\|thumb-mark" src` returns nothing — the
      function, its two SCSS rules and the span are all gone in the same commit
      (`.claude/rules/code-standards.md`, "A cut feature leaves nothing behind").
- [ ] **FIX-71-AC07** `npm run build` exits `0`; `git status --short` lists exactly four
      paths — `product-gallery.html`, `product-gallery.ts`, `product-gallery.scss` and the
      gallery spec at whichever location FIX-06 has left it. Nothing under
      `src/app/features/product/` beyond those three, and no `product-page.*`.
- [ ] **FIX-71-AC08** The `mi-bolt-design` R01–R26 record is in the commit body, per
      **D23**. **R11** (images not stretched or cropped — 4/3, `object-fit: contain`),
      **R06** and **R21** (the 64px thumb box from the token scale, never below the target
      size), **R03** and **R20** (a non-colour selection indicator with a meaningful
      accessible name and visible focus) and **R26** are applicable and are what AC01,
      AC03 and AC04 measure; each N/A carries its one-sentence reason.

## Commit

This task is exactly one commit: the gallery template, the component class, the
stylesheet and the gallery spec. Do not bundle it with `FIX-23`, `FIX-50` or any other FIX
task.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```text
fix: render real preview images in the product gallery's thumbnail row
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

**This task lands before `FIX-50`.** `FIX-50` item 3 reshapes `ProductGallery`'s signature
(`images`, `selectedImageId`, `productName`, `imageSelected`, `zoomRequested`) and rewrites
the thumbnail click to emit an **id**. This task rewrites the thumbnail markup, deletes
`thumbLabel` and gives `.thumb-check` `position: absolute`, all inside the existing
index-based component. In the other order this task's markup edits would land on a
template `FIX-50` has just rewritten, and this task's cited line ranges would no longer
hold. Neither task performs the other's half: this task changes no input and no output,
`FIX-50` item 3 changes no `.scss`. The two must never run concurrently, since both touch
`product-gallery.html` and `product-gallery.ts`. **`FIX-23`** is independent of both and may
land in either order relative to this task.
