# FIX-33 — Rebuild the home page to the prototype

Status: PLANNED — not executed.
Severity: major
Source: B3 F5, B3 F7 (Home 390 row), B1 F10 (the five S1 rows), A3 finding 2

## Why this is wrong

`docs/spec/screens.md` S1 (lines 33–41) describes the home page element by element: a
demo strip under the header, a charcoal hero carrying the heading
"A következő mobilod. Egyszerűen.", a primary CTA "Megnézem a telefonokat" beside a
secondary "Hogyan működik?", three named category shortcuts, a featured heading with a
link beside it, three how-it-works tiles and a dark footer. The shipped home page is not
a variance on that; it is a different design. It has one CTA, no demo strip, no second
CTA, a different shortcut set, no link beside the featured heading, and a three-column
link-list footer. Under **D1 the specification is right and the implementation is
wrong**, so this task rebuilds the page against `screens.md` S1 and the two reference
renderings `docs/design/screenshots/home-1440.png` and `home-390.png`.

This is the largest single divergence the audit found. Because it is a rebuild rather
than a patch, this file says what "done" means one element at a time, and every
acceptance criterion names a string or a measurement rather than an impression.

## Evidence

### The spec text this page has to satisfy

`docs/spec/screens.md:33`:

```text
**Purpose:** give a clear first action and explain the simulation. Header: MiBolt brand
left, Mobiltelefonok active nav, A demóról anchor, search and cart right. Compact demo
banner immediately below header. Hero charcoal, live heading "A következő mobilod.
Egyszerűen."; accent second line, two concise sentences, primary "Megnézem a
telefonokat", secondary "Hogyan működik?". Device illustration right; do not put
functionality inside an image.
```

`docs/spec/screens.md:35`:

```text
**Desktop sequence:** 64px header → demo strip → 360–420px hero → three restrained
category shortcuts → featured heading/link → four consistent cards → three
how-it-works tiles → dark footer. Categories: Összes telefon, 5G készülékek, Raktáron.
Featured card CTA "Részletek". Cards keep unit price and action aligned.
```

`docs/spec/screens.md:37`:

```text
**Mobile:** readable hero text+CTA before illustration, 16px gutters, stacked shortcut
rows, single-column cards, stacked tiles. No compressed desktop screenshot. Search is
second header row; menu is accessible drawer.
```

### What the page renders instead

`src/app/features/home/hero.html:4-16` — one heading, one sentence pair, one CTA:

```html
        <h1 id="hero-heading" class="hero__title" data-testid="hero-heading">
          Mobiltelefonok a MiBolt demóban
        </h1>
        <p class="hero__message" data-testid="hero-message">
          Böngéssz a készülékek között, állítsd össze a kosarad és próbáld ki a szimulált
          rendelést — mindezt valódi vásárlás nélkül.
        </p>
        <div class="hero__cta-row" data-testid="hero-cta-row">
          <a
            routerLink="/telefonok"
            class="hero__cta"
            data-testid="hero-cta"
          >Telefonok böngészése</a>
        </div>
```

`src/app/features/home/hero.html:99-113` — the shortcut set, three pills, none of which
is the spec's "Összes telefon":

```html
          <a
            routerLink="/telefonok?is5g=true"
            class="hero__shortcut"
            data-testid="shortcut-5g"
          >5G készülékek</a>
          <a
            routerLink="/telefonok?inStock=true"
            class="hero__shortcut"
            data-testid="shortcut-instock"
          >Készleten</a>
          <a
            routerLink="/telefonok?is5g=true&inStock=true"
            class="hero__shortcut"
            data-testid="shortcut-5g-instock"
          >5G + készleten</a>
```

`src/app/features/home/home-page.ts:48-56` — the whole page is three children and no
demo strip:

```ts
  template: `
    <app-hero data-testid="hero" />
    <app-featured-products
      data-testid="featured"
      [slots]="slots()"
      (retryRequested)="retryFeatured()"
    />
    <app-how-demo-works data-testid="how-demo-works" />
  `,
```

`src/app/features/home/featured-products.html:9-14` — the featured heading, with no link
beside it, where `screens.md:35` writes "featured heading/link":

```html
          <h2 id="featured-heading" class="featured__title">
            Kiemelt készülékek
          </h2>
          <p class="featured__lede">
            A demóban elérhető négy kiemelt készülék — az árak a kiválasztott variánstól függenek.
          </p>
```

`src/app/core/navigation/footer-nav.html:1-27` — a three-column footer of link lists
plus a `demo@mibolt.hu` address, where `home-1440.png` shows one dark bar carrying the
brand, one sentence and one outlined CTA "Hogyan működik a demó?". `screens.md:7` is the
rule the address falls under: "Remove absent-scope services, social/account/newsletter
controls and unverified offer promises."

### The heading size has no token behind it

`src/styles/tokens.css:70-71`:

```css
  --type-page-title: 36px;
  --type-page-title-mobile: 28px;
```

`src/app/features/home/hero.scss:29` sets the hero H1 to `var(--type-page-title-mobile)`
and `:134` raises it to `var(--type-page-title)` at ≥720px, so the rendered hero H1 is
**36px** at 1440. `docs/spec/screens.md:9` specifies two separate scales:

```text
hero52/34px, H1 36/28px
```

`grep -n "type-hero" src/styles/tokens.css` returns nothing: the token set implements
every other pair on that line — body 16, support 14, metadata 12, section 28/24, card
18, price 28/26, page title 36/28 — and omits the hero pair alone. B3 measured 36px live
against 52px in the prototype; the source above is why.

### The demo strip was removed on an instruction that did not fit it

`screens.md:33` requires a "Compact demo banner immediately below header", and every
reference rendering inspected in this audit shows it — `home-1440.png`, `home-390.png`,
`catalogue-1440.png`, `contact-1440.png`, `contact-390.png`, `cart-empty-390.png` and
`success-1440.png` all open with a light strip carrying an orange `DEMÓ` pill and the
sentence "Fiktív termékek és árak. A vásárlás szimulált; nem történik valódi fizetés."
But the strip was **removed deliberately**, and the commit body records a direct user
instruction:

```text
8c88d45 fix: DemoNotice removal and 3 critical UI blockers
  DemoNotice (separate user request during the browser verify): the
  global app-demo-notice strip immediately below the header was removed
  from AppShell along with the DemoNotice component file, because the
  design called for the dark strip to go
```

The removed component is recoverable in full at
`git show 8c88d45^:src/app/shared/shell/demo-notice.ts`, and reading it shows the commit
body describes it wrongly. Its background is `var(--color-surface-section)`, which
`src/styles/tokens.css:17` defines as `#F5F6F7` — the light neutral. The strip was light,
carrying an orange `DEMÓ` badge, which is exactly what `home-1440.png` shows. The word
"dark" in the commit body has a likelier source than the rendering: the component's own
docblock opens "`DemoNotice` is the dark strip immediately below the global header", while
the rule further down sets the light neutral.

Two further details from the same commit matter to the rebuild:

- the element was mounted **above** `<app-header-nav>`, not below it, so what shipped was
  never the "immediately below header" placement `screens.md:33` asks for;
- `T11-AC05` in `docs/tasks/tasks.json` reads "Demo notice remains visible; cart badge
  derives from CartFacade.itemCount, never static copy or a second state store", and the
  same commit deleted the assertion that proved the first half — an
  `it('the demo notice is visible in every layout')` that queried
  `[data-testid="demo-notice"]` in all three layouts — while leaving the identifier in the
  describe title, which now reads `describe('T11-AC05 cart badge wiring'` at
  `tests/layouts.spec.ts:373`. Under decision **D17** the traceability gate that could be
  gamed this way — the citation-based check that counted a criterion reached from the
  string in a `describe` title alone, never from an assertion — is removed rather than
  repaired; this is exactly the failure mode D17 cites as evidence that a citation-only
  gate does not catch a defect, and it is why this task restores the actual assertion
  (item 2 below) instead of relying on a gate to notice its absence.

**The user settled this on 2026-09-17: "Vissza kell tenni" ("it has to be put back").**
The instruction recorded in `8c88d45` was aimed at a dark strip and the removed component
was not one, so it was applied to the wrong element; `screens.md:33` was never overridden,
and **D1 stands with no exception**. Item 2 builds the strip back.

## What to change

Work in this order. Every item below is settled; nothing here waits on an answer.

### 1. Add the missing hero type scale

`src/styles/tokens.css`, inside the `/* typography */` block at lines 64–80, add the pair
`screens.md:9` names and nothing else:

```css
  --type-hero: 52px;
  --type-hero-mobile: 34px;
```

Both numbers are read from `docs/spec/screens.md:9` ("hero52/34px"). Neither is chosen
here.

Then in `src/app/features/home/hero.scss` replace `--type-page-title-mobile` at line 29
with `--type-hero-mobile`, and `--type-page-title` at line 134 with `--type-hero`. Leave
every other use of the page-title pair alone: those are H1s on other screens and
`screens.md:9` keeps them at 36/28.

### 2. Restore the demo strip

Settled by the user on 2026-09-17 — *"Vissza kell tenni"* ("it has to be put back").
Build it; nothing here goes back to the orchestrator for a decision.

**Recover the source rather than inventing one.**
`git show 8c88d45^:src/app/shared/shell/demo-notice.ts` prints the removed component in
full and is the starting point. Its markup (`<aside class="demo-notice" role="status"
data-testid="demo-notice">` wrapping a `.demo-notice__badge` span reading `DEMÓ` and a
`.demo-notice__text` span), its `role`, its `data-testid` and its token-based styles all
come back unchanged except where a numbered point below says otherwise. Keep
`data-testid="demo-notice"` exactly as it was: the assertion restored below and
`FIX-33-AC10` both target that string.

Four things about the recovered file are wrong and are corrected on the way in:

1. **It is an inline-template component.** Split it into `demo-notice.ts` carrying
   `templateUrl: './demo-notice.html'` and `styleUrl: './demo-notice.scss'`, plus the two
   sibling files, matching `app-shell.ts` / `app-shell.html` / `app-shell.scss` in the
   same directory. The repository moved its components to external templates in `ecd6282`
   and `1ae1b1c`, and `FIX-14` is spending a commit on the three that were missed;
   restoring a fourth inline template adds a fourth case of the problem that task exists
   to clear.
2. **`ChangeDetectionStrategy` is imported and never used.** Drop it from the import
   statement. Do not add a `changeDetection` entry to give it a use: the root `CLAUDE.md`
   says `OnPush` is the default in Angular v22+ and must not be set explicitly.
3. **The docblock calls it "the dark strip".** That sentence is what the removal
   instruction was read against, so it does not come back. Rewrite the opening line to
   describe what the component renders: a light strip immediately below the global
   header, stating the simulation.
4. **The badge is styled as a control rather than a label.** The recovered rule gives
   `.demo-notice__badge` a solid `var(--color-brand-accent)` background at
   `min-width: 44px; height: var(--size-control)`; `home-1440.png` and `home-390.png`
   show a compact badge with orange text and an orange border on a pale tint. Match the
   reference. The badge is not interactive, so design rule **R21**'s 44×44 minimum target
   does not reach it.

**The sentence the strip carries comes from the reference, not from the recovered file.**
The recovered component reads `MiBolt demó — nincs valódi vásárlás, nincs fizetés, nincs
kiszállítás.`; the reference renderings listed in the Evidence section read `Fiktív
termékek és árak. A vásárlás szimulált; nem történik valódi fizetés.` `screens.md:33`
fixes the element but not the string, so the reference is the source — the same rule
items 5 and 6 follow. `FIX-35` owns correcting UI copy that already ships; this string
ships for the first time here, so it belongs to this task.

**Mount it exactly once.** In `src/app/shared/shell/app-shell.html`, between
`<app-header-nav [variant]="variant()" />` on line 1 and `<ng-content></ng-content>` on
line 2, and put `DemoNotice` back into the `imports` array at
`src/app/shared/shell/app-shell.ts:23`. Below the header, not above it: `screens.md:33`
says "immediately below header", `screens.md:35`'s desktop sequence reads "64px header →
demo strip → …", and `8c88d45^` had it above the header, which is why what shipped never
matched either line. `docs/spec/components.md:34` puts the element in the layout shell
("Compose AppHeader + DemoNotice + content outlet + full AppFooter"), and all three
layouts wrap `AppShell` — `marketing-layout.html:1`, `shop-layout.html:1`,
`checkout-layout.html:1` — so the single mount covers every screen family, including the
checkout shell that `screens.md:69` requires a demo strip on. **Do not mount it a second
time in `src/app/layouts/checkout-layout.html`**: that renders two strips on every
`/penztar/*` route.

**Restore the assertion with it, in `tests/layouts.spec.ts`.** Put back the
`it('the demo notice is visible in every layout')` case that `8c88d45` deleted — it
creates `MarketingLayout`, `ShopLayout` and `CheckoutLayout` in turn and asserts
`[data-testid="demo-notice"]` is present in each — with its text assertion updated to the
sentence above, and put the notice back into the describe title at `:373`, so `T11-AC05`
("Demo notice remains visible; cart badge derives from CartFacade.itemCount") is reached
by an assertion instead of by a leftover identifier. **Do not** restore the second deleted
case, which read `(DemoNotice as unknown as { ɵcmp: { styles: readonly string[] }
}).ɵcmp.styles` and asserted on the compiled style text: that is a source-text test of
the kind `FIX-07` exists to remove, and it is also the `as` cast
`.claude/rules/code-standards.md` forbids.

**One contract gap this task does not close.** `docs/spec/components.md:101` specifies
`DemoNotice` with a signal input `persistenceMode: durable|memory` (`:105`) and required
states `default,memory-warning` (`:111`). The recovered component has neither, and the
value that input would carry comes from the mock-persistence work `FIX-10` owns (D5).
This task restores the strip `screens.md:33` requires and does not invent the persistence
contract on top of it. No number in the `docs/fix` package is titled for `DemoNotice`'s
signature — `FIX-50`, which brings the component signatures back to `components.md`,
covers `AddToCart`, `ProductGallery`, `VariantSelector` and `MobileBuyRail` — so report
the gap to the orchestrator alongside the change, the way item 8 reports its own.

No other number in the `docs/fix` package is titled for the demo strip. If a sibling task
has already added one, reuse it; never add a second.

### 3. Rebuild the hero

`src/app/features/home/hero.html` — replace the contents of `.hero__inner` with, in this
DOM order (`screens.md:37` makes the order load-bearing: "readable hero text+CTA before
illustration"):

1. an eyebrow line `MIBOLT · MOBILTELEFONOK` (`home-1440.png`), marked
   `aria-hidden="true"` only if it is decorative; if it stays readable it is plain text,
   not a heading;
2. `<h1 id="hero-heading" data-testid="hero-heading">` containing exactly two lines:
   `A következő mobilod.` and, in a `<span class="hero__title-accent">`, `Egyszerűen.`
   The accent span carries `var(--color-brand-accent)`; the first line keeps
   `var(--color-text-inverse)`. Both lines are inside the one `h1`, so the accessible
   name of the heading is `A következő mobilod. Egyszerűen.`;
3. `<p class="hero__message" data-testid="hero-message">` with the two sentences from
   `home-1440.png`: `Találd meg a hozzád illő készüléket, válaszd ki a kedvenced, és
   próbáld ki a rendelést demó módban.`;
4. `<div class="hero__cta-row" data-testid="hero-cta-row">` with **two** links, primary
   first: `routerLink="/telefonok"` labelled `Megnézem a telefonokat →`
   (`data-testid="hero-cta"`, keep the existing test id) and a secondary link
   `routerLink="/" fragment="how"` labelled `Hogyan működik?`
   (`data-testid="hero-cta-secondary"`). The secondary is the outlined style, the
   primary the filled orange one — `screens.md:33` and design rule **R08**;
5. the illustration block, unchanged except that it keeps the caption
   `Illusztráció · nem valódi termékajánlat` from `home-1440.png` as live text below the
   artwork. `screens.md:33` forbids putting functionality inside an image (**R10**), so
   the caption is a DOM text node, not part of the SVG.

`src/app/features/home/hero.scss` — the desktop grid at lines 137–148 keeps its
`"heading / message / cta"` column beside `"illustration"`, and its `column-gap` becomes
`var(--space-6)`.

**Why 24px and not 48px.** B3 measured the prototype's hero columns at
`651.5px / 620.5px` with a `48px` gap. That is a measurement of
`docs/design/prototype.html`, and `docs/spec/screens.md:9` says something different:
"Desktop 12-column alignment, gap24px". The two sources disagree. Under **D1** the spec
document wins, so the gap is `var(--space-6)` (24px) and the prototype's 48px is recorded
here as evidence rather than used as a target. Do not write `651.5px` or `620.5px` into
any stylesheet: a measurement of an artifact is not a layout rule.

### 4. Replace the three quick-filter pills with the three specified shortcut cards

Delete the `<nav class="hero__shortcuts">` block at `hero.html:94-114` **in full**,
including all three `routerLink` strings, and build the shortcut band as its own sibling
section after the hero, matching `home-1440.png`: three cards separated by vertical
rules, each card an icon tile, a title, a one-line subtitle and a trailing `→`. In
`hero.scss`, delete the `"… shortcuts shortcuts"` row from the `grid-template-areas`
declaration at `:140-144` and the `.hero__shortcut` rules with it — the element they
style no longer exists, and a cut feature leaves nothing behind
(`.claude/rules/code-standards.md`).

The three entries, with the titles fixed by `screens.md:35` ("Categories: Összes telefon,
5G készülékek, Raktáron") and the subtitles read from `home-1440.png`:

| Title (spec) | Subtitle (reference) | Target |
|---|---|---|
| `Összes telefon` | `Válassz a készülékek közül` | `/telefonok` with no query |
| `5G készülékek` | `Fedezd fel a demó kínálatot` | `/telefonok` filtered to 5G |
| `Raktáron` | `Elérhető a demó készletben` | `/telefonok` filtered to in-stock |

Each card is one link and contains no nested interactive element.

**The two filtered links must not be written as a string `routerLink`.** A string
`routerLink` is a URL path, so the router percent-encodes `?` and `=` and the click lands
on the 404 page — that is the defect **FIX-18** owns, reproduced at `hero.html:100,105,110`.
Write them in the form the router supports:

```html
<a routerLink="/telefonok" [queryParams]="{ is5g: true }" …>
<a routerLink="/telefonok" [queryParams]="{ inStock: true }" …>
```

**Boundary with FIX-18, stated so the executor does not have to work it out.** FIX-18
owns those three broken links as they stand today. This task deletes the element that
carries them and rebuilds two of the three in a working form; the third, `5G + készleten`,
is not in `screens.md:35` and does not come back. So **FIX-18 must land before FIX-33, or
be closed as moot by the orchestrator.** If FIX-18 has already landed, this task keeps
whatever `[queryParams]` form it used for the two surviving shortcuts and does not
re-invent it. If it has not landed, say in this task's commit body that FIX-18 is now
moot and name this commit as the reason, so nobody fixes a deleted element afterwards.
`src/app/features/home/home-page.ts:36` carries a comment claiming these shortcuts "set
valid 5G / inStock URL filters"; it is false today and it is removed or corrected with
the code it describes.

### 5. Featured section

`src/app/features/home/featured-products.html:8-15` — the header becomes a heading with a
link beside it, which is what `screens.md:35` means by "featured heading/link":

- `<h2 id="featured-heading">` → `Készülékek, amiket érdemes megnézni`
  (`home-1440.png`; `screens.md` does not fix this string, so the reference is the
  source);
- beside it, right-aligned at desktop and under it at 390, a link
  `routerLink="/telefonok"` labelled `Minden telefon →`, `data-testid="featured-all-link"`.
  This link **is** spec-required: `screens.md:35` names it in the desktop sequence.
- the `.featured__lede` paragraph is dropped; neither the spec sequence nor the reference
  has it.

Each card gains the `DEMÓTERMÉK` tag on its media surface, as an orange-outlined pill at
the top-left, matching `home-1440.png`. `screens.md:49` requires that tag on the
catalogue card; the home featured card carries it in the reference and is the same visual
unit.

`src/app/features/home/featured-products.ts:98-108` reimplements HUF formatting that
`src/app/shared/ui/price-block/price-block.ts:54-61` already does, and the component's own
docblock at `:31-35` admits it does not use `PriceBlock` or `ProductImage`.
`docs/spec/components.md:289` says the section shows "shared cards" — suggestive, but it
names neither primitive. Replace the hand-rolled price markup with
`<app-price-block>` and the hand-rolled image with `<app-product-image>`, and delete the
duplicated formatter. **Do not change anything inside `PriceBlock` itself** — the currency
wrapping onto its own line is `FIX-19`'s.

**Read this before starting that swap.** The docblock at `:31-33` gives a reason for the
duplication, and it is not laziness:

```ts
 * The home page renders its own price block / image element because
 * the shared T10 primitives pull in their CSS through `styleUrl`,
 * which the vitest test runner cannot resolve at module-init time.
```

So importing the two primitives may break `tests/home-page.spec.ts` at module init rather
than at an assertion. `src/app/app.routes.ts:104` already calls
`core.ɵresolveComponentResources(resolver)` to work around the same problem for lazy
routes; check first whether that path covers this component too. **Attempt the swap,
measure, and do not fight it inside this task.** If the specs go red at module init, keep
the swap out, leave the duplicated formatter where it is, say so in the commit body with
the error, and hand the question to the orchestrator — `A3` finding 9 records that the
`ɵ`-prefixed workaround is itself a defect, and no number in the `docs/fix` package is
titled for it. Everything else in item 5 — the heading, the `Minden telefon →` link and the
`DEMÓTERMÉK` tag — is independent of the swap and ships either way.

### 6. How-it-works section

`src/app/features/home/how-demo-works.html:9-12` and the `tiles` array at
`how-demo-works.ts:24-36` carry a different heading and different tile titles from the
reference. `screens.md:35` fixes only the count ("three how-it-works tiles"), so the
strings below come from `home-1440.png` and are marked as such:

| Element | Set it to |
|---|---|
| `h2#how-heading` | `Három lépés. Egy új kedvenc.` |
| the lede paragraph | replaced by a right-aligned caption `Így működik a demó` |
| tile 1 title | `Válaszd ki a készüléked` |
| tile 2 title | `Állítsd össze a rendelést` |
| tile 3 title | `Próbáld végig a folyamatot` |

Each tile gains the numbered marker `01` / `02` / `03` shown in `home-1440.png`, as an
`aria-hidden="true"` span so the numbers are not read out twice beside an ordered list.
The `<ol>` and the existing tile bodies stay.

### 7. Footer

`src/app/core/navigation/footer-nav.html` — replace the three `.footer__group` columns
and `.footer__bottom` with the single dark bar from `home-1440.png`: the `MiBolt` brand,
the sentence `Mobilválasztás egyszerűen. Ez egy bemutató webshop: minden termék, ár és
rendelés demóadat.`, and one outlined CTA `Hogyan működik a demó?` linking to
`routerLink="/" fragment="how"`. The `demo@mibolt.hu` address at line 20 goes with them,
under `screens.md:7`.

This file is shared: the footer renders on every route, and every reference PNG
(`catalogue-1440.png`, `contact-1440.png`, `success-1440.png`) shows the same single bar,
so one change satisfies all of them. Adjust `footer-nav.scss` to match and delete the
rules that no longer have an element.

### 8. Make the `how` and `demo` fragments actually resolve

Items 3 and 7 both add a link of the form `routerLink="/" fragment="how"`, and the footer
already has two such links today. **Neither target exists and the router is not configured
to scroll to one.** Measured on commit `db6d295`:

```bash
$ grep -rn 'id="how"\|id="demo"' src/app --include="*.html" --include="*.ts"
(nothing)
$ grep -rn 'fragment=' src/app --include="*.html"
src/app/core/navigation/footer-nav.html:13:  ... fragment="demo" ... >A demóról</a>
src/app/core/navigation/footer-nav.html:14:  ... fragment="how" ... >Hogyan működik?</a>
$ grep -n "anchorScrolling\|withInMemoryScrolling" src/app/app.config.ts
(nothing)
```

`src/app/app.config.ts:27` is `provideRouter(routes, withComponentInputBinding())`, with no
`withInMemoryScrolling`, so Angular's router does not scroll to a fragment at all. The
header's own nav is data-driven through `[fragment]="link.fragment"`
(`header-nav.html:36`, `:124`), so the same gap reaches the "A demóról" anchor that
`screens.md:33` requires in the header.

Two changes, both small:

- Give the how-it-works section `id="how"` in
  `src/app/features/home/how-demo-works.html:2-6`, and give whichever home section
  explains the demo `id="demo"`. Keep the existing `aria-labelledby="how-heading"`; an
  `id` on the section and an `id` on its heading are different things and both are needed.
- **Do not add `withInMemoryScrolling` here. `FIX-42` owns
  `src/app/app.config.ts` outright and lands first** (`README.md` section 4, Phase E).
  Before starting, run `grep -n "withInMemoryScrolling" src/app/app.config.ts`; if it
  prints nothing, FIX-42 has not landed — stop and report rather than adding the option,
  because two tasks cannot edit one line under one-commit-per-task.

This is in this task because two of the CTAs it creates depend on it and would ship dead
otherwise.

### Files this change touches

- `src/styles/tokens.css`
- `src/app/shared/shell/demo-notice.ts`, `demo-notice.html`, `demo-notice.scss` — the
  three files item 2 restores; only the first existed before `8c88d45` deleted it
- `src/app/shared/shell/app-shell.ts`, `app-shell.html`
- `src/app/features/home/hero.html`, `hero.scss`, `hero.ts`
- `src/app/features/home/home-page.ts` (the stale comment at `:36`)
- `src/app/features/home/featured-products.html`, `featured-products.scss`,
  `featured-products.ts`
- `src/app/features/home/how-demo-works.html`, `how-demo-works.scss`, `how-demo-works.ts`
- `src/app/core/navigation/footer-nav.html`, `footer-nav.scss`
- `src/app/features/home/home-page.spec.ts` — the spec file that has to gain the
  assertions below (moved here by **FIX-06** row 17)
- `src/app/layouts/layouts.spec.ts` — the demo-strip assertion item 2 restores (moved
  here by **FIX-06** row 18)

## Out of scope

- **`FIX-18`** owns the three 404-ing quick-filter links as they stand. Read item 4
  above: this task deletes them, so the two tasks collide and the orchestrator sequences
  them. Do not "also fix" them in place.
- **`FIX-19`** owns `PriceBlock`'s wrapped currency and `QuantityControl`'s vertical
  stacking. This task makes `FeaturedProducts` *use* `PriceBlock`; it changes nothing
  inside `src/app/shared/ui/price-block/`.
- **`FIX-28`** owns the mobile search row and the tablet featured grid. `home-390.png`
  shows a persistent full-width search row under the header and a hamburger on the left;
  neither is this task's.
- **`FIX-34`** owns the page container width, the outer gutters and the grid-gap scale.
  This task does not change `--layout-container-max`, `--layout-gutter-*`, or the
  `gap` on `.featured__grid`.
- **`FIX-17`** owns replacing hardcoded colour and spacing literals with tokens at
  component level. The one literal this task may add is none: use the existing tokens,
  and the two new `--type-hero*` tokens from item 1.
- The catalogue product card's `DEMÓTERMÉK` tag is **`FIX-35`**'s. This task adds the tag
  to the home featured card only.
- The four checkout-specific demo notices inside the steps stay where they are:
  `contact-step.html:9`, `review-step.html:22`, `success-step.html:28` and
  `payment-method-selector.html:3`. `8c88d45` kept them when it removed the global strip;
  restoring the strip does not turn them into duplicates, and removing one is not this
  task's.
- Do not touch `src/app/home/` — that is a dead stub `FIX-15` owns.

## How to verify

Run from the repository root. The package manager is **npm**, never pnpm.

```bash
npm run build
```

Expected: exit `0`. This was green at the `db6d295` baseline and must stay green.

```bash
npm run test
```

That is `ng test`. **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it
has not landed, record that verbatim and read the result lines for
`src/app/features/home/home-page.spec.ts` and `src/app/layouts/layouts.spec.ts` — the
destinations **FIX-06** moves them to (rows 17 and 18) — not the exit code. There is no
separate `npx vitest` invocation for these two files once **FIX-06** has landed:
`vitest.config.ts:506`'s `tests/**/*.spec.ts` include no longer reaches them, so
`npm run test` is the only runner that does.

```bash
npm run test
```

Expected: exit `0`, every assertion added for AC01–AC05 passing and the demo-strip
assertion item 2 restores to `src/app/layouts/layouts.spec.ts` passing with it (AC10).

There is no citation-based traceability gate to run: decision **D17** removes it (see the
Evidence section's `:189-191` note). Requirement traceability for this task is what
FIX-33-AC11 below now measures directly — `npm run build` exiting `0` plus the browser
pass — not a citation count.

Do **not** run `npx playwright test` as part of this task: it rewrites 49 screenshots
under `e2e/design/screenshots/` and leaves the working tree dirty, and its 41 failures at
the baseline are `FIX-09`'s.

Then the browser pass, which is the one that decides this task.

`npm start` is not part of a fenced block: it is `ng serve` and never exits, so a
sequential run that includes it hangs. Start it separately, in the background, before
the browser checks below, and stop it when finished. It serves on
`http://localhost:4200`. Open `/` and follow AC06 and AC07 below.

## Acceptance criteria

- [ ] **FIX-33-AC01** `tests/home-page.spec.ts` asserts, against the rendered DOM, that
      `[data-testid="hero-heading"]`'s `textContent`, with runs of whitespace collapsed to
      single spaces and trimmed, equals `A következő mobilod. Egyszerűen.`
- [ ] **FIX-33-AC02** `tests/home-page.spec.ts` asserts that `[data-testid="hero-cta-row"]`
      contains exactly two links, that the first has `textContent` beginning
      `Megnézem a telefonokat` and an `href` of `/telefonok`, and that the second has
      `textContent` `Hogyan működik?`.
- [ ] **FIX-33-AC03** `tests/home-page.spec.ts` asserts that the shortcut band renders
      exactly three links whose trimmed titles are, in order, `Összes telefon`,
      `5G készülékek`, `Raktáron`, and that **no** rendered `href` on the home page
      contains the substring `%3F` or `%3D`. That second half is the assertion that
      proves the percent-encoding defect cannot come back.
- [ ] **FIX-33-AC04** `tests/home-page.spec.ts` asserts that a link with
      `data-testid="featured-all-link"`, `textContent` starting `Minden telefon` and
      `href` `/telefonok` exists inside the featured section's header.
- [ ] **FIX-33-AC05** `tests/home-page.spec.ts` asserts that the rendered footer contains
      exactly one link or button whose label is `Hogyan működik a demó?`, and that the
      string `demo@mibolt.hu` appears nowhere in the rendered footer.
- [ ] **FIX-33-AC06** **Real-browser check at 1440.** Start the app with `npm start`,
      open `http://localhost:4200/` at a viewport of 1440×900 in a real Chrome through
      the `real-browser-sonnet` agent, and record:
      (a) `getComputedStyle(document.querySelector('[data-testid="hero-heading"]')).fontSize`
      returns `52px`;
      (b) a `take_snapshot` showing, in this top-to-bottom order, the demo strip, the
      hero, the three shortcut cards, the featured heading with `Minden telefon →` beside
      it, four product cards, three how-it-works tiles and the single-bar footer — the
      sequence `docs/spec/screens.md:35` prescribes;
      (c) a `take_screenshot` placed beside `docs/design/screenshots/home-1440.png` in the
      report;
      (d) clicking the `5G készülékek` shortcut lands on a URL containing `is5g=true` and
      renders the catalogue, not `Az oldal nem található`;
      (e) `list_console_messages` returns zero errors.
      Per `.claude/rules/browser-verification.md`, an HTTP 200, a green unit test or a
      read of the diff is explicitly **not** this criterion.
- [ ] **FIX-33-AC07** **Real-browser check at 390.** Same session, viewport 390×844:
      `getComputedStyle` on the hero heading returns `34px`; the snapshot shows hero text
      and both CTAs **before** the illustration in the rendered order, the three shortcut
      cards stacked as full-width rows and the featured cards in one column; and
      `document.documentElement.scrollWidth` is not greater than `window.innerWidth + 1`.
      Screenshot beside `docs/design/screenshots/home-390.png`.
- [ ] **FIX-33-AC08** `grep -rn "5G + készleten" src/` returns nothing, and
      `grep -rn "telefonok?is5g" src/` returns nothing. The invented fourth shortcut and
      the string-`routerLink` form are both gone from the tree rather than merely unused.
- [ ] **FIX-33-AC09** `src/styles/tokens.css` contains `--type-hero: 52px;` and
      `--type-hero-mobile: 34px;`, and `grep -rn "52px\|34px" src/app/features/home/`
      returns nothing — the numbers live in the token file only.
- [ ] **FIX-33-AC10** The demo strip renders once, directly below the header, on every
      layout. `tests/layouts.spec.ts` asserts, for `MarketingLayout`, `ShopLayout` and
      `CheckoutLayout` in turn, that `querySelectorAll('[data-testid="demo-notice"]')`
      has length exactly `1` and that its `textContent` contains `Fiktív termékek és
      árak.` In the AC06 browser session at 1440: the strip is the element directly after
      the header in the rendered order;
      `getComputedStyle(document.querySelector('[data-testid="demo-notice"]')).backgroundColor`
      returns `rgb(245, 246, 247)`, which is `--color-surface-section` from
      `src/styles/tokens.css:17`; its badge reads `DEMÓ`; and opening
      `http://localhost:4200/penztar/kosar` shows exactly one strip, not two.
      `grep -rn "app-demo-notice" src/app/layouts/` returns nothing, because the single
      mount lives in `app-shell.html`.
- [ ] **FIX-33-AC11** `npm run build` exits `0`, unchanged from the `db6d295` baseline.
      Under decision **D17** there is no citation-based traceability gate for this task to
      keep green or regress; this criterion, together with AC06 and AC07's real-browser
      checks, is what proves the home page's requirements are met — a rendered, measured
      page rather than a citation count.
- [ ] **FIX-33-AC12** **Design rules.** The `mi-bolt-design` R01–R26 table is recorded in
      the commit body with evidence for every rule this task reaches:
      **R02** (dark hero on the marketing page only), **R05** (content on the shared
      centerline — measured but *not repaired* here; `FIX-34` owns the repair),
      **R06** (8px spacing; the 24px hero gap), **R07** (hierarchical headings, hero
      above H1), **R08** (one prominent primary beside a restrained secondary — item 3.4),
      **R09** (no small white text on orange), **R10** (the illustration caption is live
      text), **R12** (Hungarian labels with correct accents — every string in this file),
      **R15** (demo labelling; the restored demo strip of item 2), **R18** (the shortcut
      links filter rather than 404), **R21** (44×44 targets on the shortcut cards and
      both CTAs), **R22** (the 390 layout is not a scaled desktop page).
      Mark **R13, R14, R16, R17, R19, R23, R24, R25** N/A, each with a one-sentence
      reason — for example "R16 N/A: the demo has exactly one provider, so there is no
      second one to mix." **R26** is applicable and met by the commit body listing files,
      commands, exit codes and, as stated remaining limitations, the `DemoNotice`
      signature gap of item 2 and the fragment-routing defect of item 8.
      Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
      the design rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.

- [ ] **FIX-33-AC13** Every `fragment` link on the home page resolves to a real target.
      `grep -rn 'id="how"' src/app/features/home/` returns the how-it-works section, and
      `grep -n "withInMemoryScrolling" src/app/app.config.ts` returns the `provideRouter`
      call. In the AC06 browser session, clicking the hero's `Hogyan működik?` CTA and the
      footer's `Hogyan működik a demó?` CTA each scrolls the how-it-works section into
      view; record `window.scrollY` before and after each click, and both must change.

## Commit

This task is exactly one commit. Do not bundle it with `FIX-34`, `FIX-35` or any other
FIX task, however close the files sit. Commit only after every acceptance criterion above
passes, including the browser pass at both widths.

**The commit body records why the demo strip came back.** Name `docs/spec/screens.md:33`,
name commit `8c88d45`, state that the instruction that commit recorded was aimed at a
dark strip while the removed component was light — `var(--color-surface-section)`, which
`src/styles/tokens.css:17` defines as `#F5F6F7` — and quote the user's answer of
2026-09-17, *"Vissza kell tenni"* ("it has to be put back"). Without that paragraph the
next person reading `git log` finds a commit that removed the strip and a commit that put
it back with no reason recorded between them, and removes it a second time.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`):

```text
feat: rebuild the home page against screens.md S1
```

Nothing in this package is pushed by the executor. The push and the pull request belong
to the orchestrating session.
