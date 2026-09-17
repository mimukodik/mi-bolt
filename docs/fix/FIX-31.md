# FIX-31 — Fix the secondary text that fails AA contrast on the cart page

Status: PLANNED — not executed.
Severity: major
Source: B2 F10 (diagnosis corrected below), B1 F4 (related), B3 R09

**Ordering: this task lands before FIX-21.** FIX-31's proof experiment (Step 1 below) expects
seven `color-contrast` violations on the cart page, which exist only because FIX-21's stuck-pending
defect (`src/app/features/cart/cart-page.ts:103-107`) is still live; once FIX-21 lands, every cart
line's `pendingItemIds` stops including every item unconditionally and there are no violations
left to reproduce this way — FIX-31's step 1 would have to be re-derived instead of run
(`docs/fix/README.md` §4).

## Why this is wrong

The repository's root `CLAUDE.md` requires the application to "follow all WCAG AA minimums,
including focus management, **color contrast**, and ARIA attributes", and to "pass all AXE checks".
`docs/spec/acceptance.md` **AC23** and **AC06** make readable colour a release gate, and
`docs/spec/screens.md` S4.1 constrains the pending state specifically: "**Pending disables only
affected controls** and contradictory continue."

On the cart page, seven pieces of support text render at **3.38:1** against white where WCAG AA
requires **4.5:1** for normal-weight 14 px text. The variant colour and storage labels, the
"Egységár" and "Részösszeg" row labels, both "Ft" suffixes and the quantity `<label>` are all below
the bar at once.

**The finding's diagnosis is wrong, and the correction is the point of this task.** B2 F10 reported
the failing grey as `#878c93`, called it "the app's support/metadata colour everywhere" and
concluded it was a single token value. It is neither a token value nor app-wide. The token is
`--color-text-secondary: #545B64`, which passes AA comfortably. `#878c93` is what `#545B64` looks
like **through an `opacity: 0.7` applied to the whole cart line** while that line is in its pending
state — and the line is stuck in that state, which is the defect **FIX-21** owns. Dimming an entire
card to signal pending is also the wrong affordance under `docs/spec/screens.md` S4.1, which asks
for the affected controls to be disabled and nothing else.

So this task owns one thing: **the presentation rule that destroys the contrast**, and the
confirmation that the token behind it is already correct.

## Evidence

Axe **4.13.0** was run on commit `db6d295` from the dev server's own `/@fs/` route, at 1x device
pixel ratio, light colour scheme. `axe-core@4.13.0` is installed in this repository, so the same
version is reproducible here.

### What axe measured

Seven distinct nodes on the cart page, all reporting the same foreground `#878c93` on background
`#ffffff` at **3.38:1** against a required 4.5:1. Axe reported **zero** violations on Home, Contact,
Review and 404, which already contradicts "the same grey is used app-wide".

### The token is not the problem

`src/styles/tokens.css:23`:

```css
  --color-text-secondary: #545B64;
```

`#545B64` on `#FFFFFF` is approximately **6.9:1** by the WCAG 2.x relative-luminance formula, and on
`--color-surface-section: #F5F6F7` (`src/styles/tokens.css:17`) approximately **6.4:1**. Both pass
AA for normal text with room to spare. Those two numbers are computed here, not measured; confirm
them with your own axe run in FIX-31-AC01 rather than taking them from this file.

### Where `#878c93` comes from — exact integer arithmetic

Compositing `#545B64` (R 84, G 91, B 100) at alpha **0.7** over white (255, 255, 255):

| Channel | Arithmetic | Result | Hex |
|---|---|---|---|
| R | 0.7 × 84 + 0.3 × 255 = 58.8 + 76.5 | 135.3 | `87` |
| G | 0.7 × 91 + 0.3 × 255 = 63.7 + 76.5 | 140.2 | `8C` |
| B | 0.7 × 100 + 0.3 × 255 = 70.0 + 76.5 | 146.5 | `93` |

`#878C93` — the exact value axe reported, on all three channels. There is exactly one CSS rule in
the repository that applies `opacity: 0.7` to text, and it is on the cart line.
`src/app/features/cart/cart-line.scss:16-18`:

```scss
.line[aria-busy='true'] {
  opacity: 0.7;
}
```

The other opacity declarations in the source do not produce this colour and are not involved:
`src/app/features/catalog/catalog-page.scss:258` (`0.85` → `#6E747C`),
`src/app/features/product/variant-selector.scss:70` (`0.6` → `#989CA2`), and the `stop-opacity` /
`opacity` attributes in `src/app/features/home/hero.html`, which are SVG paint on an illustration.

### Why all seven flagged nodes are inside that one element

`src/app/features/cart/cart-line.html:1` sets the attribute the rule keys on:

```html
<article class="line grid gap-4 p-4 rounded" [attr.aria-busy]="pending() ? 'true' : null" data-testid="cart-line">
```

and every flagged node is a descendant of it, coloured `--color-text-secondary`:

| Flagged text | Element | Colour rule |
|---|---|---|
| variant colour | `.variant-color` (`cart-line.html:13`) | `.variant` — `cart-line.scss:47-51` |
| variant storage | `.variant-storage` (`cart-line.html:15`) | same rule |
| "Egységár" | `app-price-block` `.label` (`cart-line.html:20-24`) | `price-block.scss:14` |
| "Ft" after the unit price | `.currency` (`price-block.html:11`) | `price-block.scss:34` |
| "Részösszeg" | `app-price-block` `.label` (`cart-line.html:43-47`) | `price-block.scss:14` |
| "Ft" after the line total | `.currency` (`price-block.html:11`) | `price-block.scss:34` |
| "Darabszám" | `.qty-label` (`cart-line.html:28`) | `cart-line.scss:68-71` |

Seven nodes, exactly the seven axe listed.

### Why the line is dimmed in the first place

`pending()` is meant to be transient. B1 F4 measured it stuck: "The line renders as `article busy`
with −, + and 'Törlés' all `disabled`; a click on '+' times out." So the dim is permanent in
practice, which is why a state that should flicker for a moment shows up in a static axe scan.
**That stuck state is `FIX-21`'s defect, not this one.** This task removes the contrast failure
whether or not the state is stuck: even a correctly transient pending state must not put text below
AA, because a user reading during the request is still a user reading.

### Two passing pairs that must not change

B2 spot-checked these and both pass. They are the brand's own contrast contract and
`docs/spec/screens.md` names them directly ("Orange#FF6A00 with dark#171B1F button text … #A83B00
accessible orange-toned links"):

- `--color-brand-accent: #FF6A00` background with `--color-text-primary: #171B1F` text — **6.03:1**
- `--color-brand-ink: #A83B00` link colour on white — **6.38:1**

Do not touch `--color-brand-accent`, `--color-text-primary` or `--color-brand-ink`.

## What to change

### `src/app/features/cart/cart-line.scss`

Delete the rule at lines 16-18 entirely:

```scss
.line[aria-busy='true'] {
  opacity: 0.7;
}
```

Nothing replaces it. This is the decision; do not weigh alternatives and do not invent a
substitute cue.

The reason it needs no replacement is that the pending affordance `docs/spec/screens.md` S4.1 asks
for — "Pending disables only affected controls" — is **already implemented on the controls
themselves** and stays untouched. `src/app/features/cart/cart-line.html:34-35` passes
`[disabled]="pending()"` and `[pending]="pending()"` into `app-quantity-control`,
`cart-line.html:52` passes `[disabled]="pending()"` to the remove button, and
`src/app/features/cart/cart-line.scss` gives `.remove:disabled` its own visible treatment at lines
107-112. The `aria-busy="true"` attribute itself stays on the `<article>`, so assistive technology
still hears that the region is busy. What goes is only the blanket dim over text that must stay
legible — which was never the spec's affordance and is what pushed seven nodes below AA.

**Do not lower the opacity somewhere else, do not switch the text to a darker grey to compensate,
and do not add a `!important`.** Any of those would re-introduce a contrast dependency on a
presentation rule, which is exactly the shape of the bug.

### `src/styles/tokens.css`

**No change.** `--color-text-secondary: #545B64` already passes AA on both surfaces it is used
against. Confirm it in FIX-31-AC01 and record the measured ratios; if your own axe run disagrees
with the computed figures above, stop, report the measured value, and raise it rather than
adjusting the token on the strength of this file.

### Regression test

No unit spec is added for this change. jsdom has no layout or compositing engine: it does not
apply component stylesheets, `getComputedStyle(...).opacity` returns nothing usable there, and it
cannot composite a colour against a background at all, and a `node:fs` read of the stylesheet's
text is a source-text assertion of exactly the kind **FIX-07** and **FIX-07b** remove from this
repository. Contrast is measured by axe in a real browser, which is what FIX-31-AC01 to
FIX-31-AC04 do — see **FIX-31-AC06**.

Also add the cart route to the axe Playwright suite **only if `FIX-29` has already landed** and
`e2e/a11y/axe.spec.ts` exists. If it does, add `{ id: 'cart', path: '/penztar/kosar' }` to that
file's full-scan loop, which `FIX-29` deliberately excluded because of the violations this task
fixes, and say in the commit body that you did. If that file does not exist yet, do not create it —
`FIX-29` owns it — and say in the commit body that the hand-off is still open.

## Out of scope

- **The stuck pending state.** `FIX-21` owns un-sticking the cart line's quantity and remove
  controls. Do not touch `cart-line.ts`, `cart-page.ts`, `cart.facade.ts` or
  `cart-mutation-queue.ts`. This task changes one stylesheet rule.
- **Replacing hardcoded colour literals with tokens.** `FIX-17` owns that, generally and everywhere.
  The one thing this task owns is the value and the effective rendering of
  `--color-text-secondary` on the cart page. Do not retokenise anything else while you are in these
  files.
- **The three tokens that pass.** `--color-brand-accent`, `--color-text-primary` and
  `--color-brand-ink` are measured correct; leave them exactly as they are.
- **The other two opacity declarations.** `catalog-page.scss:258` (0.85) and
  `variant-selector.scss:70` (0.6) were not flagged by axe and neither produces `#878c93`. Do not
  change them on suspicion; if your own axe run flags either, report it as a new finding rather than
  fixing it here.
- **The structural axe violations.** `FIX-29` owns `landmark-*`, `label`, `image-redundant-alt`,
  `heading-order`, `listitem` and `dlitem`.
- **The `PriceBlock` primitive's layout.** `FIX-19` owns its wrapped currency. You are reading
  `price-block.scss` for evidence only; change nothing in
  `src/app/shared/ui/price-block/`.
- **UI copy.** `FIX-35` owns it. This task adds and edits no string.

## How to verify

Run these in order, from the repository root. The package manager is **npm 11.17.0**; there is no
pnpm and no mise in this repository.

**Step 1 — confirm the diagnosis before editing.** Start the dev server, add an item to the cart
from `/telefonok/demo-one-5g`, open the cart **from the header link** (an SPA navigation, not a
reload), and at 1440 in a real browser:

1. Run axe and record every `color-contrast` violation, with each node's target selector, its
   reported foreground and background colours, and its reported ratio. Expect seven nodes at
   `#878c93` on `#ffffff`, 3.38:1.
2. Run `document.querySelector('[data-testid="cart-line"]').removeAttribute('aria-busy')`.
3. Run axe again and record the result. If the diagnosis in this file is right, the seven
   `color-contrast` violations are gone.

That experiment is the whole proof, and it is cheap. Record both axe outputs verbatim in the task
evidence. Note that `getComputedStyle(...).color` will **not** show a difference between the two
states: `opacity` composites at paint time and does not change the computed `color` value, which is
`rgb(84, 91, 100)` either way. Axe's effective-contrast walk is what sees it.

**Step 2 — build.**

```
npm run build
```

Expected exit code 0. This command was measured green on commit `db6d295`.

**Step 3 — unit tests.** This task adds no unit spec (see FIX-31-AC06). Run `npm run test`
before your first edit and again after your last,
and record both coverage figures in the commit body. There is no target number: the pair is the
evidence that this task did not reduce coverage, and **FIX-08** is what turns the thresholds into
a gate. Do not carry the 56.42 % figure forward — it was measured by `npm run test:unit:coverage`
over the 30 specs under `tests/` only, a runner and a denominator that no longer exist, so it
cannot be compared with anything `ng test` reports. `npm run test` fails 14 of 14 files at the
baseline for a reason **FIX-04** owns; record that rather than treating it as this task's
regression.

**Step 4 — real browser.** Mandatory, and it is what actually proves this task. See
FIX-31-AC01 to FIX-31-AC05. Reach the cart by **clicking the header cart link** after adding an
item, never by typing `/penztar/kosar` or reloading it: a full page load of any checkout route
currently discards the cart and shows the empty state, a defect **FIX-10** owns, and an empty cart
has no cart line to measure.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

Every browser criterion is checked at 1x device pixel ratio, light colour scheme, in a real browser
driven through `mcp__chrome-devtools__*`, with axe **4.13.0** loaded from the dev server's own
origin — not from a CDN, because `docs/spec/testing.md` §3 and `docs/spec/acceptance.md` **AC25**
forbid external traffic. Reading the diff, an HTTP 200, a green unit test and a file listing are
none of them a browser check (`.claude/rules/browser-verification.md`).

- [ ] **FIX-31-AC01** On the cart page with one line item, reached by clicking the header cart link,
      an axe run at 1440 reports **zero** `color-contrast` violations. Record the full violation
      list before and after the change; it contained seven nodes at `#878c93` on `#ffffff`,
      3.38:1, before.
- [ ] **FIX-31-AC02** The same holds at 390. Record the result separately; B2 measured only 1440,
      and `cart-line.scss:73-75` sets `.totals { display: none; }` with `cart-line.scss:114`
      bringing it back only from 640 up, so the "Részösszeg" label and its "Ft" — two of the seven
      flagged nodes — are not even rendered at 390. The two widths produce different node sets and
      one is not evidence for the other.
- [ ] **FIX-31-AC03** With the cart line in its pending state — set it with
      `document.querySelector('[data-testid="cart-line"]').setAttribute('aria-busy', 'true')` if the
      real pending window is too short to catch — axe still reports zero `color-contrast`
      violations, and `getComputedStyle(document.querySelector('[data-testid="cart-line"]')).opacity`
      returns `1`. It returned `0.7` before the fix.
- [ ] **FIX-31-AC04** The three passing pairs are unchanged. In the browser, record the computed
      values of `--color-brand-accent`, `--color-text-primary`, `--color-brand-ink` and
      `--color-text-secondary` from `getComputedStyle(document.documentElement)`, and confirm they
      read `#FF6A00`, `#171B1F`, `#A83B00` and `#545B64`. Confirm from the same axe run that the
      primary CTA and the links report no violation.
- [ ] **FIX-31-AC05** The pending affordance still exists and is still visible. Put the line in its
      pending state: this task runs before FIX-21 lands (see "Ordering" above), and while FIX-21's
      defect is live, `cart-page.ts:103-107`'s `pendingItemIds` already treats every item in the
      cart as pending, so simply adding an item and opening the cart puts the line in that state —
      no `setAttribute` call is needed or sufficient, because `[disabled]` is bound to `pending()`
      in `cart-line.html:34-35` and `:52`, not to the `aria-busy` attribute. Confirm in a screenshot
      that the `−`, `+` and "Törlés" controls render in their disabled treatment, and that
      `document.querySelector('[data-testid="cart-line-remove"]').disabled` is `true` and
      `document.querySelector('[data-testid="cart-line"]').getAttribute('aria-busy')` is `'true'`.
      Removing the dim must not remove the state.
- [ ] **FIX-31-AC06** No unit spec is added for this change, and the commit body says why:
      the change is an `opacity` declaration removed from one stylesheet rule, jsdom applies
      neither a component stylesheet nor compositing and returns nothing usable for
      `getComputedStyle(...).opacity`, and a `node:fs` read of the stylesheet's text is a
      source-text assertion of exactly the kind **FIX-07** and **FIX-07b** remove from this
      repository. The change is proved where it is observable: by the real-browser pass this
      file already requires and by the axe `color-contrast` run FIX-31-AC01 to FIX-31-AC04
      require.
- [ ] **FIX-31-AC07** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim.
- [ ] **FIX-31-AC08** `git diff --name-only` for this commit lists `cart-line.scss` and —
      only if `FIX-29` has already landed — `e2e/a11y/axe.spec.ts`. It does **not**
      list `src/styles/tokens.css`. If the executor believes the token must change after all, that
      is a finding to report, not an edit to make: the computed ratios above say it does not, and
      an edit there would contradict `FIX-17`'s ownership of the colour layer.
- [ ] **FIX-31-AC09** The corrected diagnosis is recorded in the commit body: that the failing
      `#878c93` is `--color-text-secondary` composited at `opacity: 0.7`, with the three-channel
      arithmetic, and that the token itself passes. B2 F10's own text says the opposite, and the
      next reader needs to be able to see which was right and why.

### Design rules (mi-bolt-design 1.0.1)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- [ ] **FIX-31-AC10** Applicable and asserted above: **R09** ("use the specified contrasting pairs"
      — AC01, AC02 and AC04 measure exactly that), **R04** ("use semantic tokens; look in the
      existing token set before introducing a new raw color" — AC08 requires that no token value
      changes and no new literal is introduced; the fix removes a presentation rule instead),
      **R19** ("no results, network error, loading, success and **disabled** are distinct states" —
      AC05 requires the pending state to remain distinguishable after the dim is removed),
      **R20** ("meaningful accessible name" and legibility for every interactive element — AC05
      confirms the disabled controls keep their names and their visible treatment), **R03**
      ("orange accents, charcoal text and neutral surfaces" — AC04 records that the palette is
      untouched).
- [ ] **FIX-31-AC11** Recorded as N/A with reasons: **R01, R02** — the change adds no imagery and
      alters no brand, shell or hero surface. **R05, R06, R07** — no width, spacing, radius, font or
      type-scale declaration is touched. **R08** — no primary or secondary action is added, removed
      or restyled. **R10, R11** — no image markup or aspect ratio is touched. **R12, R15** — the
      task adds and edits no string, so no Hungarian copy and no demo labelling changes. **R13,
      R14, R17, R18, R24, R25** — the change is one presentation rule and reaches no price field,
      variant logic, filter state, persistence or offer copy. **R16** — the application has exactly
      one provider. **R21** — no target size changes. **R22** — no responsive rule changes; `FIX-26`
      owns the narrow-layout failure. **R23** — no dialog behaviour changes; `FIX-30` owns dialog
      focus. **R26** — a handoff-practice rule, satisfied by the commit body and the recorded
      evidence rather than by runtime behaviour.

## Commit

This task is exactly one commit. Do not bundle it with another FIX task, and do not commit until
every acceptance criterion above has passed and its output is recorded. The commit carries the one
deleted rule in `cart-line.scss` and — only if `FIX-29` has already landed —
the one added route in `e2e/a11y/axe.spec.ts`. The commit body carries the corrected diagnosis
required by FIX-31-AC09 and the before/after axe output.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: cart line pending dim dropped support text below AA contrast
```
