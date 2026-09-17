# FIX-19 — QuantityControl stacks vertically and PriceBlock wraps the currency

Status: PLANNED — not executed.
Severity: major
Source: B3 F3 and B3 F4 (both orchestrator-confirmed at source), B1 (product and cart screenshots).

## Why this is wrong

Two shared primitives declare their layout twice — once as Tailwind utilities on the
element in the template, once as SCSS on the same element — and in both files the SCSS
describes a structure the template never builds. The visible result is that every
quantity stepper renders as a vertical column and every price on every screen breaks
"Ft" onto its own line.

Both are `mi-bolt-design` R06 failures (the 4 px / 8 px rhythm is applied to a layout
axis that should not exist) and R11/R13-adjacent presentation failures for the price:
`docs/spec/screens.md:57` places the unit price in the buy panel as one field, and the
design prototype (`docs/design/prototype.html`) renders "339 990 Ft" on one line
everywhere. `docs/spec/screens.md:73` lists the cart line as "unit price, quantity
control, remove action and line total" — one row of controls, not a column.

The same mistake made twice in two primitives is why they are one task: the fix is the
same shape in both files and the two components appear side by side on the product page
and on every cart line.

## Evidence

**QuantityControl.** `src/app/shared/ui/quantity-control/quantity-control.html:1` makes
the root a column and puts the three controls and the message in it as direct children:

```html
<div class="root inline-flex flex-col gap-1" [class.is-disabled]="disabled()" [class.is-invalid]="invalid()" data-testid="quantity-control">
```

`src/app/shared/ui/quantity-control/quantity-control.scss:3-13` defines the column root
**and** the row wrapper that the template never uses:

```scss
.root {
  display: inline-flex;
  flex-direction: column;
  gap: var(--space-1);
}

.row {
  display: inline-flex;
  align-items: center;
  gap: 0;
}
```

`grep -n "row" src/app/shared/ui/quantity-control/quantity-control.html` returns nothing:
`.row` is dead CSS today. Measured live in a real browser at 1440 (B3): the `−` button
sits at y=498 and the `+` button at y=594 at the same x, on both the product page and
the cart page. The border rules at `quantity-control.scss:40-50`
(`.step:first-of-type` removes the right radius and border, `.step:last-of-type` the
left) only make sense in a row as well.

**PriceBlock.** `src/app/shared/ui/price-block/price-block.html:1-11` — the currency is a
**sibling** of the amount inside a `flex-col` root:

```html
<div class="root inline-flex flex-col items-start gap-1" [attr.data-status]="status()">
  <span class="label">{{ label() }}</span>
  ...
        <span class="amount font-bold leading-tight tabular-nums" data-testid="price-amount">{{ amountText() }}</span>
        <span class="currency ml-1" aria-hidden="true">Ft</span>
```

`src/app/shared/ui/price-block/price-block.scss:31-35` gives `.currency` a left margin,
which is only meaningful beside something, not under it:

```scss
.currency {
  font-size: var(--type-helper);
  margin-left: var(--space-1);
  color: var(--color-text-secondary);
}
```

The `label` is a separate line by design (`docs/spec/components.md:150` gives PriceBlock a
`label:string` input and it is the caption above the figure), so the root stays a
column; only the amount and its currency belong on one line.

## What to change

**1. `src/app/shared/ui/quantity-control/quantity-control.html`** — wrap the decrement
button, the input and the increment button in the `.row` element the stylesheet already
defines. The message `<p>` stays outside it, as a second child of the column root, so it
keeps sitting under the controls. Nothing else in the file changes: every `data-testid`,
every `aria-*` binding and every handler stays exactly as it is.

```html
<div class="root inline-flex flex-col gap-1" [class.is-disabled]="disabled()" [class.is-invalid]="invalid()" data-testid="quantity-control">
  <div class="row inline-flex items-center">
    <button ... data-testid="quantity-decrement">−</button>
    <input ... data-testid="quantity-input" />
    <button ... data-testid="quantity-increment">+</button>
  </div>
  @if (invalid() && message()) {
    <p class="message m-0 px-2" [id]="describedById" role="status" aria-live="polite" data-testid="quantity-message">
      {{ message() }}
    </p>
  }
</div>
```

The two buttons stay siblings of one another inside `.row`, so `:first-of-type` and
`:last-of-type` at `quantity-control.scss:40-50` keep selecting the same two elements as
before. Add no SCSS: `.row` already exists at `quantity-control.scss:9-13`.

**2. `src/app/shared/ui/price-block/price-block.html`** — wrap the amount and the
currency, inside the `@case ('success')` / `@if (amountText())` branch only:

```html
      @if (amountText()) {
        <span class="row inline-flex items-baseline">
          <span class="amount font-bold leading-tight tabular-nums" data-testid="price-amount">{{ amountText() }}</span>
          <span class="currency ml-1" aria-hidden="true">Ft</span>
        </span>
      } @else {
```

The `—` branches (`price-empty`, `price-error`, `price-idle`) render no currency, so they
are left untouched.

**3. `src/app/shared/ui/price-block/price-block.scss`** — add the matching rule next to
`.currency`:

```scss
.row {
  display: inline-flex;
  align-items: baseline;
}
```

`baseline`, not `center`: the amount is `--type-price` and the currency is
`--type-helper`, and a baseline alignment is what puts them on one optical line.

**4. Tests, in the spec files that already cover these two primitives** —
`src/app/shared/ui/quantity-control/quantity-control.spec.ts` and
`src/app/shared/ui/price-block/price-block.spec.ts`. Assert the **structure**, not a
rendered blob:

- QuantityControl: the parent element of `[data-testid="quantity-decrement"]` is the
  same element as the parent of `[data-testid="quantity-input"]` and of
  `[data-testid="quantity-increment"]`; that element's `classList` contains `row`; and
  `[data-testid="quantity-message"]`, when present, is **not** inside it.
- PriceBlock: in the success state, `[data-testid="price-amount"]` and the `.currency`
  span share the same parent element, and that element is not the component root.

A snapshot assertion does not count as coverage of a layout fix. Neither does asserting
that the string `row` appears in the file. The test names the two elements and asserts
their relationship. Do not add a `getComputedStyle` assertion to these unit tests: the
`styleUrl` stylesheet is not applied in the TestBed environment, so a computed
`flex-direction` there proves nothing. The computed value is checked in the browser, by
AC01 and AC02 below.

## Out of scope

- The duplicated layout declaration itself (Tailwind utility classes in the template plus
  the same rules in SCSS on the same element). B3's cross-cutting note records it as an
  idiom defect across both primitives. This task follows the file's existing convention —
  semantic class plus the matching utilities — and introduces no third pattern. Removing
  the duplication is not done here.
- Every other consumer of these two primitives. The fix is inside the primitives, so the
  cart line, the product page, the delivery summary and the review summary all change
  appearance without being edited. Do not edit them.
- The cart line's permanently disabled controls (`FIX-21`) and the product page's state
  contract (`FIX-23`), even though both screens show a QuantityControl.
- Hardcoded colours and spacing elsewhere in these stylesheets (`FIX-17`).
- Any `label` text passed into PriceBlock by a caller (`FIX-35` owns UI copy).

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`). **The two spec files this task edits are
executed by `ng test`, which is red at baseline for a reason this task does not fix.**
Write the assertions anyway, in the right file, and do not gate on that command's exit
code; `FIX-04` is what turns it green.

```bash
npm run build              # expected exit 0
npm run test               # record the exit code; a failure attributable to FIX-04 does
                            # not fail this task
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Browser checks (mandatory — both changes are visible on every screen):

1. At 1440, open `http://localhost:4200/telefonok/demo-one-5g` and measure the quantity
   stepper and the unit price.
2. At 390, repeat on the same page.
3. Add the item to the cart by clicking "Kosárba teszem", then reach
   `/penztar/kosar` through the header cart link — an in-page navigation, never a fresh
   page load, because a full load of a checkout route throws the cart away today
   (`FIX-10` owns that). Measure the stepper on the cart line.

Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R06 applies and is the rule this task restores**: the spacing rhythm is preserved and
  the invented vertical axis is removed. `gap: 0` on `.row` and `--space-1` between the
  row and the message are the existing token values; introduce no new number.
- **R21 applies**: both step buttons and the input keep `min-width` / `height:
  var(--size-control)` (44 px) after the change — verify the measured rects in the
  browser, not the CSS.
- **R04 applies**: no new raw colour or dimension is introduced; `.row` uses the tokens
  already in the two stylesheets.
- **R13 applies to PriceBlock**: the amount and its currency are one field; the change
  must not separate the price from its unit or introduce a second price surface.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R03, R05, R07–R12, R14–R20, R22–R25: N/A — this change alters no brand asset,
  centerline, font, copy, data source, state machine, focus behaviour or handoff
  artefact; it moves three elements into a wrapper in each of two templates.

## Acceptance criteria

- [ ] **FIX-19-AC01** At 1440 on `/telefonok/demo-one-5g`,
      `getComputedStyle(document.querySelector('[data-testid="quantity-control"] .row')).flexDirection`
      returns `row`, and the bounding rects of `[data-testid="quantity-decrement"]` and
      `[data-testid="quantity-increment"]` have the same `top` (within 1 px) and different
      `left`.
- [ ] **FIX-19-AC02** The same two assertions hold at 390 on the same page, and on the
      cart line at `/penztar/kosar` at 1440 (reached by clicking, per "How to verify").
- [ ] **FIX-19-AC03** At 1440 on `/telefonok/demo-one-5g`, the bounding rects of
      `[data-testid="price-amount"]` and its sibling `.currency` span have the same `top`
      (within 2 px, allowing for the baseline offset between the two font sizes), and the
      amount and the currency are not separated by a line break: the parent element's
      `getBoundingClientRect().height` is not greater than the amount's own height plus
      2 px.
- [ ] **FIX-19-AC04** Both step buttons and the quantity input measure at least 44 × 44
      CSS px in the browser at 390 and at 1440 (R21).
- [ ] **FIX-19-AC05** `src/app/shared/ui/quantity-control/quantity-control.spec.ts`
      contains a test asserting that the decrement button, the input and the increment
      button share one parent whose `classList` contains `row`, and that the message
      element is not inside that parent.
- [ ] **FIX-19-AC06** `src/app/shared/ui/price-block/price-block.spec.ts` contains a test
      asserting that in the success state the amount element and the currency element
      share a parent that is not the component root.
- [ ] **FIX-19-AC07** `npm run build` exits 0, and the two specs this task adds assertions to
      are run and pass:
      ```bash
      npx ng test --include=src/app/shared/ui/quantity-control/quantity-control.spec.ts \
                  --include=src/app/shared/ui/price-block/price-block.spec.ts
      ```
      Both files must be reported as collected, and every test in them as passing. The
      whole-suite exit code of `npm run test` is **recorded, not gated**: a failure in a file
      this task does not touch belongs to **FIX-04** (the 14-of-14 baseline), **FIX-08** (the
      coverage thresholds) or the FIX number owning that screen, and is named in the commit
      body rather than repaired here.

      **This criterion requires FIX-04 to have landed.** Until it does, no command runs a
      `src/**` spec successfully: every one of the fourteen fails with
      `ReferenceError: document is not defined` because the suite has no DOM environment
      (`BASELINE.md:10`), and `npx vitest run src/…` collects nothing at all, because
      `vitest.config.ts:506` is `include: ['tests/**/*.spec.ts']` and a positional path is a
      filter over that glob rather than an override, so the run ends with
      `No test files found, exiting with code 1`. There is no fallback command and this file
      no longer offers one: if `FIX-04` has not landed, **stop and report**; do not commit
      AC05 and AC06 unverified.

## Commit

This task is exactly one commit covering both primitives, because it is one defect made
twice and the two components are verified together on the same screens. Do not bundle it
with any other FIX task. Commit only after every acceptance criterion above passes, and
include the two spec files.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: lay out QuantityControl and PriceBlock in a row instead of a column
```
