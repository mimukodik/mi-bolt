# FIX-35 — Correct the UI copy to the text the spec requires

Status: PARTIAL — the UI copy now matches `screens.md` across the cart, the catalogue card, all four checkout H1s, the success step and the checkout route titles, and `PriceBlock`'s `<= 0` became `< 0` so a known zero renders as `0 Ft` instead of an em dash; commit bd020fd. Two pre-existing unit tests were asserting the very bug this fixes and were rewritten to cover both arms of the changed condition, measured red before and green after by reverting the operator. The `delivery-step.html` slice deferred while a sibling agent held that file has since landed: the H1 and the summary H2 both read "Átvétel és fizetés" (carried forward through FIX-56's restructuring of the file), and `checkout-delivery.spec.ts`'s "FIX-35 delivery-step heading copy" test covers both, measured red before and green after by reverting the two strings. Open: (a) the cart empty-state icon is unresolved, because `EmptyState` has neither an icon input nor `<ng-content>`, reported per this document's own fallback instruction rather than inventing a new input; (b) the contact-step button order at 390 vs 1440 is a CSS-only reorder with no jsdom proxy at all, so it is deferred to the batched browser-verification pass along with the rest of the visible copy.
Severity: major
Source: B1 F10 (the 17-row copy table), B3 F7 (Review, Success, Empty cart, Contact rows)

## Why this is wrong

`docs/spec/screens.md` does not describe the UI copy in general terms; it quotes the
required Hungarian strings directly. `screens.md:73` writes `H1 "A kosarad"` and
`CTA "Tovább az adatokhoz"`; `screens.md:81` writes `H1 "Átvétel és fizetés"`;
`screens.md:85` writes `H1 "Minden rendben?"` and `contact summary with Módosítás`;
`screens.md:91` writes `H1 "Elkészült a demórendelésed."` and `CTA "Vissza a
telefonokhoz"`. The shipped application uses different words in every one of those
places. Under **D1 the specification is right and the implementation is wrong**, so this
task changes the strings in the templates and never the spec.

Design rule **R12** ("Use Hungarian UI labels with correct accents; do not arbitrarily
translate product or brand names") is the governing rule and is a live criterion here.
The accents in the shipped copy are correct; what is wrong is that the words are not the
ones the specification fixed.

## Evidence

### The copy table

Every row was confirmed against the file named in the last column. **Spec** cites
`docs/spec/screens.md` where that file fixes the string, and the reference PNG under
`docs/design/screenshots/` where it does not — the Source column says which.

| # | Place | Spec / reference text | What renders today | Where | Source |
|---|---|---|---|---|---|
| 1 | S1 hero H1 | `A következő mobilod. Egyszerűen.` | `Mobiltelefonok a MiBolt demóban` | `src/app/features/home/hero.html:5` | screens.md:33 |
| 2 | S1 primary CTA | `Megnézem a telefonokat` | `Telefonok böngészése` | `src/app/features/home/hero.html:16` | screens.md:33 |
| 3 | S1 secondary CTA | `Hogyan működik?` | **absent** | `src/app/features/home/hero.html:11-17` | screens.md:33 |
| 4 | S1 shortcuts | `Összes telefon`, `5G készülékek`, `Raktáron` | `5G készülékek`, `Készleten`, `5G + készleten` | `src/app/features/home/hero.html:103,108,113` | screens.md:35 |
| 5 | S1 demo banner | compact strip under the header | **absent** | removed in commit `8c88d45` | screens.md:33 |
| 6 | S4.1 H1 | `A kosarad` | `Kosár` | `src/app/features/cart/cart-page.html:8` | screens.md:73 |
| 7 | S4.1 CTA | `Tovább az adatokhoz` | `Tovább a pénztárhoz` | `src/app/features/cart/cart-page.html:94` | screens.md:73 |
| 8 | S4.1 shipping line | `A következő lépésben választod ki` | `A szállítási díj a pénztárban kerül kiszámításra.` | `src/app/features/cart/cart-page.html:81` and `order-summary.html:23` | screens.md:73 |
| 9 | S4.3 H1 | `Átvétel és fizetés` | `Szállítás és fizetés` | `src/app/features/checkout/delivery-step.html:13` | screens.md:81 |
| 10 | S4.3 pickup price | explicit `0 Ft` | `—` with the screen-reader text `Az ár nem áll rendelkezésre.` | `src/app/shared/ui/price-block/price-block.ts:49` | screens.md:81 |
| 11 | S4.4 H1 | `Minden rendben?` | `Rendelés véglegesítése` | `src/app/features/checkout/review-step.html:21` | screens.md:85 |
| 12 | S4.4 edit links | `Módosítás` | `Szerkesztés` | `src/app/features/checkout/review-step.html:41,69` | screens.md:85 |
| 13 | S4.5 H1 | `Elkészült a demórendelésed.` | `A demórendelésed elkészült` | `src/app/features/checkout/success-step.html:19` and `order-receipt.html:5` | screens.md:91 |
| 14 | S4.5 CTA | `Vissza a telefonokhoz` | `Új vásárlás indítása` and `Vissza a főoldalra` | `src/app/features/checkout/success-step.html:82,92` | screens.md:91 |
| 15 | Catalogue card tag | `DEMÓTERMÉK` | the brand string (`MiBolt Demo` / `Sample` / `Example`) | `src/app/features/catalog/product-card.html:16` | screens.md:49 |
| 17 | Success route id | `DEMO-000001` form | a raw UUID in the URL segment; the rendered order number on the page is already correct | `src/app/features/checkout/checkout.routes.ts` | screens.md:91 |

**Row 17 needs no change and this task makes none.** `screens.md:91` fixes the *displayed*
order number ("Order DEMO-000001"), and B1 confirmed the rendered number is right;
`screens.md:26` describes the route as `/penztar/siker/:orderId` without constraining the
segment's form. The row is kept in the table so that a later reader does not re-open it.

**Row 5 is blocked, not this task's.** `FIX-33` owns the demo strip and carries the reason:
`screens.md:33` and every reference PNG require it, but commit `8c88d45` removed it on a
recorded direct user instruction, and only the user can settle which holds. Do not re-add
it here.

**Rows 1–4 are `FIX-33`'s**, because that task rebuilds the hero and the shortcut band
outright rather than swapping strings inside them. They stay in this table because the
table is the audit's record and a reader needs the whole of it in one place, but this
task must not edit `hero.html`. See "Out of scope".

### The strings, quoted at source

`src/app/features/cart/cart-page.html:6-8`:

```html
      <span class="breadcrumb is-current font-medium" aria-current="page">Kosár</span>
    </nav>
    <h1 class="title m-0 font-bold">Kosár</h1>
```

`src/app/features/cart/cart-page.html:81` and `:94`:

```html
            A szállítási díj a pénztárban kerül kiszámításra.
...
            label="Tovább a pénztárhoz"
```

`src/app/features/checkout/review-step.html:21` and `:41`:

```html
        <h1 class="title">Rendelés véglegesítése</h1>
...
                Szerkesztés
```

`src/app/features/checkout/success-step.html:19` and `:82,92`:

```html
            A demórendelésed elkészült
...
                    label="Új vásárlás indítása"
...
                    label="Vissza a főoldalra"
```

`src/app/features/catalog/product-card.html:16` — the card has **no** `DEMÓTERMÉK` tag at
all; a brand paragraph stands where `screens.md:49` puts the tag:

```html
    <p class="brand m-0">{{ product().brand }}</p>
```

`docs/design/screenshots/catalogue-1440.png` shows the tag as an orange-outlined pill at
the top-left of the 4:3 media surface and shows **no** brand text anywhere on the card;
the brand names appear only in the filter panel, with counts.

### Row 10 has a root cause, and it is not a string

The pickup option does not print `0 Ft` because `PriceBlock` refuses to render a zero.
`src/app/shared/ui/price-block/price-block.ts:43-51`:

```ts
  readonly amountText = computed<string | null>(() => {
    const m = this.money();
    if (m === null) return null;
    if (m.currency !== 'HUF') return null;
    if (!Number.isFinite(m.amount)) return null;
    if (!Number.isInteger(m.amount)) return null;
    if (m.amount <= 0) return null;
    return PriceBlock.formatHuf(m.amount);
  });
```

When `amountText()` is `null`, `price-block.html:13-14` renders the em dash and the
screen-reader line:

```html
        <span class="amount amount--error font-medium" data-testid="price-empty">—</span>
        <span class="sr-only absolute w-px h-px overflow-hidden">Az ár nem áll rendelkezésre.</span>
```

`delivery-step.html:64-68` passes `feeFor(option)` into that component, and
`delivery-step.ts:249-252` returns `PICKUP_FEE` for the pickup option — a real, known,
zero amount. `screens.md:81` requires `Demó átvételi pont (0Ft, no real physical
location)` and `docs/tasks/T21.md:43` (T21-AC03) requires "Shipping fee visibly follows
selected option: 1990 vs 0 HUF". A free option is a fact, not a missing value.

### Four items from the same sweep that are not strings

B3 F7 recorded these beside the copy rows. They are listed here because no other number in
the package owns them.

1. **The success page has no success icon.** `docs/design/screenshots/success-1440.png`
   opens the card with a green circular checkmark above the H1;
   `src/app/features/checkout/success-step.html:14-24` renders the heading with nothing
   before it.
2. **The step indicator never shows a completed step.**
   `src/app/layouts/checkout-layout.html:10` always prints the ordinal:

   ```html
          <span class="steps__index inline-flex items-center justify-center w-6 h-6 rounded-full font-bold">{{ $index + 1 }}</span>
   ```

   `contact-390.png` and `contact-1440.png` show `✓` in place of `1` once the cart step is
   behind the user, and `success-1440.png` shows all four as `✓`.
   `checkout-layout.ts:54-61` already returns `'success'` for `/penztar/siker`, and
   `'success'` is not one of the four entries in `steps` at `:64-69`, so on the success
   page every step is behind the current one and all four resolve to complete with no
   extra state.
3. **The empty-cart copy differs.** `src/app/features/cart/cart-page.html:41-47`:

   ```html
      <app-empty-state
        [title]="'A kosarad üres'"
        [message]="'Vegyél fel termékeket a kínálatból, és itt folytathatod a vásárlást.'"
        [actionLabel]="'Vásárlás folytatása'"
   ```

   `screens.md:73` fixes the action: `Empty H1+message+"Telefonokat nézek"`.
   `docs/design/screenshots/cart-empty-390.png` gives the other two:
   `A kosarad még üres.` and `Nézd meg a demókészülékeket, és válaszd ki a kedvenced.`,
   above an icon.
4. **At 390 the contact step puts the secondary button above the primary.**
   `src/app/features/checkout/contact-step.html:139`:

   ```html
    <div class="form-actions flex flex-col gap-3 lg:flex-row lg:justify-between lg:items-center">
   ```

   DOM order is secondary then primary, so the mobile column renders `Vissza a kosárhoz`
   on top. `docs/design/screenshots/contact-390.png` has `Tovább a szállításhoz →` first
   and `← Vissza a kosárhoz` under it; `contact-1440.png` has the secondary left and the
   primary right, which is what the `lg:` rules already produce. This is an ordering
   defect rather than a copy mismatch; it is in this task because it was found in the same
   pass and no other number covers it.

## What to change

### Cart — `src/app/features/cart/cart-page.html`

- line 8: `Kosár` → `A kosarad`. Leave the breadcrumb at line 6 as `Kosár`: that is the
  step name in the trail, and `screens.md:69` names the four steps `Kosár / Adatok /
  Szállítás / Ellenőrzés`.
- line 81: `A szállítási díj a pénztárban kerül kiszámításra.` →
  `A következő lépésben választod ki.`
- line 94: `label="Tovább a pénztárhoz"` → `label="Tovább az adatokhoz"`.
- lines 42–44: `[title]` → `'A kosarad még üres.'`, `[message]` →
  `'Nézd meg a demókészülékeket, és válaszd ki a kedvenced.'`, `[actionLabel]` →
  `'Telefonokat nézek →'`.
- line 88 carries a second `Vásárlás folytatása` label on the non-empty branch. Leave it:
  it is a different control in a different state and `screens.md` does not fix it.

`src/app/features/cart/order-summary.html:23` repeats the shipping sentence; change it the
same way. `order-summary.ts:13` and `cart-page.ts:121` quote the old sentence in
docblocks; update those two comments so the code and its description stop disagreeing.

If `app-empty-state` has no icon input, give the cart's empty branch the icon shown in
`cart-empty-390.png` through the component's existing content projection rather than by
adding a new input — a new public input on a shared primitive is a contract change, and
`docs/spec/components.md` is the authority for that contract. If neither is possible
without changing the contract, ship the copy change and report the icon as unresolved
rather than inventing an input.

### Delivery — `src/app/features/checkout/delivery-step.html`

- line 13: `Szállítás és fizetés` → `Átvétel és fizetés`.
- line 117 (`Szállítás és fizetés összesítése`) is a summary heading inside the page and
  is not fixed by `screens.md`. Change it to `Átvétel és fizetés összesítése` so the page
  does not carry two different names for the same step.
- `src/app/features/checkout/checkout.routes.ts:224`
  (`title: 'MiBolt — Szállítás és fizetés'`) → `'MiBolt — Átvétel és fizetés'`.

### The zero price — `src/app/shared/ui/price-block/price-block.ts`

Line 49:

```ts
    if (m.amount <= 0) return null;
```

becomes

```ts
    if (m.amount < 0) return null;
```

A negative amount is still refused; a genuine, known zero now renders `0 Ft`. This does
**not** contradict the component's docblock at `:30-31` ("The component never substitutes
0 or any placeholder digit for an unknown value"): `null`, a non-HUF currency, a
non-finite amount and a non-integer amount all still return `null`, so an *unknown* value
still never becomes `0 Ft`. Only a value that is known to be zero renders as zero. Add
that sentence to the docblock in the same edit.

### Review — `src/app/features/checkout/review-step.html`

- line 21: `Rendelés véglegesítése` → `Minden rendben?`
- lines 41 and 69: `Szerkesztés` → `Módosítás` (both).
- `review-step.ts:54` quotes `Szerkesztés` in a docblock; update it.
- The primary submit label stays `Demórendelés véglegesítése`, which is what
  `screens.md:87` requires. Do not move the old H1 text onto the button.

### Success — `src/app/features/checkout/success-step.html`

- line 19: `A demórendelésed elkészült` → `Elkészült a demórendelésed.` (with the full
  stop; `screens.md:91` includes it). `order-receipt.html:5` carries the same string;
  change it too.
- lines 78–95: the two buttons become **one** primary CTA labelled
  `Vissza a telefonokhoz →`, navigating to `/telefonok`. `screens.md:91` names exactly one
  CTA, and `success-1440.png` shows exactly one. Keep the `data-testid` of whichever
  button survives and record in the commit body which test id was removed, so the specs
  that referenced it are updated in the same commit rather than failing later.
- Add the green circular checkmark above the H1, as `success-1440.png` shows, marked
  `aria-hidden="true"`: the H1 beside it already carries the meaning, and a second
  announcement of the same fact is noise.

### Step indicator — `src/app/layouts/checkout-layout.html` and `.ts`

In `checkout-layout.ts`, derive a completed flag from the existing data rather than adding
state: the index of `currentStep()` inside `steps`, with `-1` (which is what `'success'`
yields) treated as "every step is behind us". In `checkout-layout.html:10`, render `✓`
when the step is complete and `{{ $index + 1 }}` otherwise. Give the checkmark span
`aria-hidden="true"` and add a visually hidden `Kész` (done) after the label for completed
steps, so the state is announced rather than carried by a glyph alone — design rule
**R20**, and `screens.md:81`'s "selection is not indicated by color alone" is the same
principle one step earlier in the flow.

### Catalogue card — `src/app/features/catalog/product-card.html`

Replace the brand paragraph at line 16 with a `DEMÓTERMÉK` tag rendered on the media
surface, matching `catalogue-1440.png`: an orange-outlined pill at the top-left of the
4:3 image area, live text, `data-testid="product-card-tag"`. `screens.md:49` enumerates
the card's contents — "4:3 neutral media surface with small DEMÓTERMÉK tag; live name,
max2 features, exact selected storage/color, one-time price with 'Egyszeri készülékár •
demóadat', outlined 'Részletek →'" — and the brand line is not among them, so it goes
out with the same edit. Update `product-card.scss` and remove the `.brand` rule it leaves
behind.

The home page's featured card carries the same tag; that one is **`FIX-33`**'s.

### Contact button order — `src/app/features/checkout/contact-step.html:139`

Add `flex-col-reverse` for the mobile case, keeping the DOM order and the desktop rules as
they are:

```html
    <div class="form-actions flex flex-col-reverse gap-3 lg:flex-row lg:justify-between lg:items-center">
```

**Why this and not a DOM reorder.** The desktop arrangement already matches
`contact-1440.png` (secondary left, primary right), so reversing the DOM would require a
second reversal at `lg:` to keep it — one change becomes two. Keeping the DOM order also
keeps the reading and tab order as `Vissza a kosárhoz` then `Tovább a szállításhoz`, which
is the same order the desktop layout presents left to right. The cost is that at 390 the
visual order and the tab order differ; AC10 makes the executor measure it rather than
assume it.

### Files this change touches

- `src/app/features/cart/cart-page.html`, `cart-page.ts`, `order-summary.html`,
  `order-summary.ts`
- `src/app/features/checkout/delivery-step.html`, `checkout.routes.ts`,
  `review-step.html`, `review-step.ts`, `success-step.html`, `order-receipt.html`,
  `contact-step.html`
- `src/app/layouts/checkout-layout.html`, `checkout-layout.ts`
- `src/app/shared/ui/price-block/price-block.ts`
- `src/app/features/catalog/product-card.html`, `product-card.scss`
- the spec files that gain the assertions, each at the location **FIX-06** moves it to
  (see AC07): `src/app/features/cart/cart-page.spec.ts`,
  `src/app/features/checkout/checkout-delivery.spec.ts`,
  `src/app/features/checkout/review-step.spec.ts`,
  `src/app/features/checkout/success-page.spec.ts`, `src/app/layouts/layouts.spec.ts`,
  and the co-located `src/app/features/catalog/product-card.spec.ts` for the card tag

## Out of scope

- **`FIX-33`** owns rows 1–4 and row 5 of the table, the hero, the shortcut band and the
  home featured card's `DEMÓTERMÉK` tag. Do not open `src/app/features/home/hero.html`.
- **`FIX-22`** owns the delivery step's raw internal-state message
  (`Új áttekintés szükséges: Igen — A korábbi ajánlat és fizetési szándék elavult.`) and
  the duplicated `Szállítási díj` row label before a method is chosen. Those are a
  behaviour bug, not a copy mismatch. Leave them exactly as they are, including the
  string; this task changes only the H1 on that screen and the summary heading that
  repeats it.
- **`FIX-19`** owns `PriceBlock`'s layout — the currency wrapping onto its own line, from
  `price-block.html:10-11` and `price-block.scss`. This task changes one comparison
  operator in `price-block.ts:49` and the docblock above it, and touches neither the
  template nor the stylesheet. Both tasks edit the same component, so they do not run at
  the same time; the orchestrator sequences them.
- **`FIX-20`** owns making the contact form validate and stop pre-filling itself. This
  task changes the button order on that screen and nothing else in it.
- **`FIX-25`** owns showing the user when an order is declined or fails. The success
  page's error and not-found branches at `success-step.html:20-24` keep their current
  wording here.
- **`FIX-24`** owns the catalogue's clear-filters and sort controls. This task touches
  `product-card.html` only.
- Do not edit any file under `docs/`. Under **D1** the specification is the authority and
  this task exists to make the code match it.

## How to verify

Run from the repository root. The package manager is **npm**, never pnpm.

```bash
npm run test
```

`npm run test` is `ng test`, which fails 14 of 14 files at the `db6d295` baseline for
reasons **FIX-04** owns (`BASELINE.md:10`); if it has not landed, record that verbatim
and run this task's own specs individually instead: `npx vitest run
tests/cart-page.spec.ts tests/checkout-delivery.spec.ts tests/review-step.spec.ts
tests/success-page.spec.ts tests/layouts.spec.ts`, each expected to exit 0. Several of
these specs assert the current strings; each such assertion moves to the new string in
this same commit. **FIX-06** moves them to
`src/app/features/cart/cart-page.spec.ts`,
`src/app/features/checkout/checkout-delivery.spec.ts`,
`src/app/features/checkout/review-step.spec.ts`,
`src/app/features/checkout/success-page.spec.ts` and `src/app/layouts/layouts.spec.ts`;
`npm run test` is what collects them once **FIX-06** has landed.

```bash
npm run build
```

Expected: exit `0`, unchanged from the `db6d295` baseline.

Run `npm run test` before your first edit and again after your last, and record both
coverage figures in the commit body. There is no target number: the pair is the evidence
that this task did not reduce coverage, and **FIX-08** is what turns the thresholds into
a gate. Do not carry the 56.42 % figure forward — it was measured by
`npm run test:unit:coverage` over the 30 specs under `tests/` only, a runner and a
denominator that no longer exist, so it cannot be compared with anything `ng test`
reports.

`npm run verify:traceability` is deleted under D17 and no longer exists to report a
count; do not run it. The human record of requirement traceability that replaces it is
`docs/mi-bolt/execution/traceability.md`, which **FIX-40** item 4 already commissions. If
a test id removed on the success page took an AC token with it, note that in the commit
body for FIX-40 to pick up; this task does not chase a count itself.

Do **not** run `npx playwright test`: it rewrites 49 screenshots and its 41 baseline
failures are `FIX-09`'s.

Gates that are red for reasons this task does not fix, so the executor does not chase
them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the
coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**).

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished. Then follow AC08–AC10 at
`http://localhost:4200`.

## Acceptance criteria

- [ ] **FIX-35-AC01** `tests/cart-page.spec.ts` asserts, against the rendered DOM, that
      the cart page's `h1` trimmed `textContent` is `A kosarad`, that the continue button's
      label is `Tovább az adatokhoz`, and that the shipping line contains
      `A következő lépésben választod ki`.
- [ ] **FIX-35-AC02** `tests/cart-page.spec.ts` asserts that the empty-cart state renders
      the heading `A kosarad még üres.` and an action labelled `Telefonokat nézek →`.
- [ ] **FIX-35-AC03** `tests/checkout-delivery.spec.ts` asserts that the delivery step's
      `h1` is `Átvétel és fizetés`, and that the pickup option's price element renders the
      text `0` followed by `Ft` — not `—`. Add a direct `PriceBlock` case in the same
      commit asserting that `{ amount: 0, currency: 'HUF' }` renders `0` and that
      `{ amount: -1, currency: 'HUF' }` still renders `—`, so both arms of the changed
      condition have a case.
- [ ] **FIX-35-AC04** `tests/review-step.spec.ts` asserts that the review step's `h1` is
      `Minden rendben?` and that both edit links read `Módosítás`;
      `grep -rn "Szerkesztés" src/` returns nothing.
- [ ] **FIX-35-AC05** `tests/success-page.spec.ts` asserts that the success `h1` is
      `Elkészült a demórendelésed.` and that the page renders exactly one navigation
      action, labelled `Vissza a telefonokhoz →`, pointing at `/telefonok`.
- [ ] **FIX-35-AC06** `tests/layouts.spec.ts` asserts that on `/penztar/adatok` the first
      step's indicator renders `✓` and the second renders `2`, and that on
      `/penztar/siker/:orderId` all four render `✓`.
- [ ] **FIX-35-AC07** `src/app/features/catalog/product-card.spec.ts` — the co-located
      spec **FIX-06** leaves in place — asserts that a rendered product card contains an
      element with `data-testid="product-card-tag"` whose text is `DEMÓTERMÉK`, and that
      the card's rendered text does **not** contain the product's `brand` value. **FIX-06**
      decides where a spec lives, not the runner split, and this file follows that
      placement; `npm run test` is what collects it once **FIX-04** has landed.
- [ ] **FIX-35-AC08** **Real-browser check of the checkout copy.** Through the
      `real-browser-sonnet` agent at 1440×900, run the flow with one item in the cart and
      record a `take_snapshot` at each of `/penztar/kosar`, `/penztar/szallitas`,
      `/penztar/ellenorzes` and the success route, showing: the four H1 strings from rows
      6, 9, 11 and 13; `Tovább az adatokhoz` on the cart; `0 Ft` beside the pickup radio;
      both `Módosítás` links; one CTA `Vissza a telefonokhoz →` on success; and a
      completed-step `✓` in the indicator on every screen after the cart.
      `list_console_messages` returns zero errors on each.
      Per `.claude/rules/browser-verification.md`, a green unit test, an HTTP 200 or a read
      of the diff is explicitly **not** this criterion.
- [ ] **FIX-35-AC09** **Real-browser check of the catalogue card.** Same session: at
      `/telefonok`, every visible card shows a `DEMÓTERMÉK` tag and no brand string.
      Screenshot of the catalogue beside `docs/design/screenshots/catalogue-1440.png`.
- [ ] **FIX-35-AC10** **Real-browser check of the contact step at 390.** Viewport 390×844
      on `/penztar/adatok`: the primary `Tovább a szállításhoz →` renders **above** the
      secondary `← Vissza a kosárhoz` — verified by comparing the two elements'
      `getBoundingClientRect().top` — and a Tab sweep from the last form field reports the
      order in which focus reaches the two buttons. Screenshot beside
      `docs/design/screenshots/contact-390.png`. At 1440 the secondary is on the left and
      the primary on the right, matching `contact-1440.png`.
- [ ] **FIX-35-AC11** `npm run build` exits `0`, and this file's own browser criteria —
      **FIX-35-AC08**, **FIX-35-AC09** and **FIX-35-AC10** — all pass.
      `npm run verify:traceability` is deleted under D17; it no longer exists to report a
      count, and the human record that replaces it, `docs/mi-bolt/execution/traceability.md`,
      is **FIX-40**'s.
- [ ] **FIX-35-AC12** **Design rules.** The `mi-bolt-design` R01–R26 table is recorded in
      the commit body. **R12** is the rule this task exists for and is marked met, with
      the seventeen table rows as evidence. Also applicable and met: **R08** (the success
      page keeps one prominent primary after the two buttons collapse into one),
      **R10** (the `DEMÓTERMÉK` tag and the success checkmark are DOM elements, not baked
      into an image), **R13** (`0 Ft` is the one-time shipping fee, kept distinct from the
      device price), **R14** (the zero comes from `PICKUP_FEE`, not from a placeholder),
      **R15** (every demo label the rows touch stays), **R19** (a known zero and an unknown
      price are now distinct states, which they were not), **R20** (the completed step is
      announced, not carried by a glyph alone), **R22** (AC10's 390 measurement).
      Mark **R01, R02, R03, R04, R05, R06, R07, R09, R11, R16, R17, R18, R21, R23, R24,
      R25** N/A, each with a one-sentence reason — for example "R21 N/A: this task changes
      labels and the order of two existing buttons and alters no target size."
      **R26** is applicable and met by the commit body listing the files, the commands,
      their exit codes, any removed `data-testid`, and rows 5 and 17 as stated remaining
      limitations. Skill provenance is stated once in `docs/fix/README.md` section 3,
      "Every task records the design rules": the installed path, the version, and the fact
      that `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns
      it). Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with `FIX-19`, `FIX-22`, `FIX-33` or any
other FIX task, even though several of them touch neighbouring lines. Commit only after
every acceptance criterion above passes, including the browser pass at both widths.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`):

```text
fix: bring the UI copy back to the strings screens.md fixes
```

Nothing in this package is pushed by the executor. The push and the pull request belong
to the orchestrating session.
