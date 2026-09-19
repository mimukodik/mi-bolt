# FIX-17 — Replace hardcoded colours and spacing with the existing tokens

Status: DONE — 0f8f900. Tokenises app.scss and payment-progress.scss per R04, 8 un-tokened literals left and recorded.
Severity: major
Source: A6 3.1, 3.2 and 3.3, with A6 3.2's count corrected against the repository — see
Evidence.

## Why this is wrong

Design rule **R04** (`.claude/skills/mi-bolt-design/SKILL.md:56`): *"Use semantic tokens;
look in the existing token set before introducing a new raw color or dimension."*
`.claude/CLAUDE.md` makes the R01–R26 table mandatory for every task in this workspace, and
for this task **R04 is a live criterion rather than an N/A** — it is the rule the task
exists to enforce.

`src/styles/tokens.css` is 151 lines of design tokens, copied from the approved skill
package (`:1-6`) and loaded globally by `angular.json:28-32`. Two stylesheets in the tree
ignore it completely and write colour, spacing, radius and a font stack as raw literals,
several of which are exact duplicates of a token and two of which are invented shades that
exist nowhere in the design system.

Under D1 the specification is right and the code is wrong.

## Evidence

### The whole population of hex literals in the tree

Measured on `db6d295`:
`find src -name '*.scss' -exec grep -ho "#[0-9a-fA-F]\{3,8\}" {} + | tr 'A-F' 'a-f' | sort | uniq -c | sort -rn`

| Literal | Count | Files | Exact token match in `src/styles/tokens.css`? |
|---|---|---|---|
| `#2c333a` | 7 | `core/navigation/header-nav.scss:14,103,137,178,190,201`; `core/navigation/footer-nav.scss:55` | **no** — nearest is `--color-shell-dark: #1B2024` (`:18`), a different colour |
| `#171b1f` | 3 | `app.scss:6,15,31` | yes — `--color-text-primary` (`:22`) |
| `#ffffff` | 2 | `app.scss:7,16` | yes — `--color-surface-light` (`:16`) / `--color-text-inverse` (`:24`) |
| `#ff6a00` | 1 | `app.scss:24` | yes — `--color-brand-accent` (`:10`) |
| `#fdecea` | 1 | `app.scss:30` | **no** — an invented light-red tint; the nearest token, `--color-brand-accent-soft: #FFF0E6` (`:12`), is a different hue |
| `#f5f6f7` | 1 | `features/checkout/payment-progress.scss:7` | yes — `--color-surface-section` (`:17`) |
| `#b3261e` | 1 | `app.scss:32` | **no** — a near-miss of `--color-status-error: #B42318` (`:33`) |
| `#2a3035` | 1 | `features/home/hero.scss:169` | **no** — same family as `#2c333a`, same absence of a token |

Seventeen literals in total, across **five** files — the table above names all five.

### The two fully-untokened stylesheets

`src/app/app.scss` in full — 47 lines, **zero** `var(--…)` references:

```scss
:host {
  display: block;
  min-height: 100dvh;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue',
    Arial, sans-serif;
  color: #171b1f;
  background: #ffffff;
}

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

app-fatal {
  display: block;
  padding: 1.5rem 1rem;
  background: #fdecea;
  color: #171b1f;
  border: 1px solid #b3261e;
}
```

`src/app/features/checkout/payment-progress.scss` in full — 12 lines, **zero**
`var(--…)` references:

```scss
.payment-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 8px;
  background: #f5f6f7;
}
.payment-progress progress {
  width: 100%;
  height: 8px;
}
```

`8px` is `--space-2` (`tokens.css:43`), `16px` is `--space-4` (`:45`) and the `8px` radius
is `--radius-card` (`:54`).

**A6 3.2's count is wrong and the correction matters for the sweep.** A6 says these are
*"the only two style files in the tree with **zero** `var(--…)` references"*. Measured,
**six** files have zero: the two above plus
`src/app/core/navigation/mobile-drawer-host.scss`,
`src/app/coverage-canary/canary-page.scss`, `src/app/home/home-page.scss` and
`src/app/shared/shell/app-shell.scss`. The first three are two-line `:host { display:
block; }` resets and the fourth is twelve lines of flex layout with `100dvh`; none of the
four contains a colour, spacing or radius value that a token exists for. So A6's *intent*
holds — `app.scss` and `payment-progress.scss` are the only two that hardcode design
values — and the executor should not be surprised to find four more files matching a naive
"zero `var(`" grep.

### The font stack is declared twice, with different values

`src/styles/primitives.css:16-21` is global and already tokenised:

```css
html {
  font-family: var(--font-family-base);
  font-size: var(--type-body);
  line-height: var(--line-height-body);
  color: var(--color-text-primary);
  background: var(--color-surface-light);
```

`app.scss:4-7` re-declares three of those five on `app-root`, with literals. Two of them
(`color`, `background`) resolve to exactly the same pixels. The third does not:
`--font-family-base` (`tokens.css:65`) is
`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` while `app.scss:4-5`
writes `system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`.
Two different stacks, one of which is the design system's and one of which is not.

### The pattern this task names: the same layout declared twice, in two languages

Three instances, none of which this task repairs and all of which it records so the pattern
has one place to be read:

**1 and 2 — the two shared primitives, which FIX-19 fixes.**
`src/app/shared/ui/quantity-control/quantity-control.html:1`:

```html
<div class="root inline-flex flex-col gap-1" [class.is-disabled]="disabled()" …>
```

`src/app/shared/ui/quantity-control/quantity-control.scss:3-7`:

```scss
.root {
  display: inline-flex;
  flex-direction: column;
  gap: var(--space-1);
}
```

The same three properties, declared as Tailwind utilities in the template and again as SCSS
on the same element, free to drift apart. `src/app/shared/ui/price-block/price-block.html:1`
and `price-block.scss:3-9` are the identical shape. And in the first of the two, the SCSS
describes a structure the template does not build: `quantity-control.scss:9-13` defines a
`.row` wrapper, and `grep -n "class=\"row" src/app/shared/ui/quantity-control/quantity-control.html`
returns nothing.

**3 — the catalogue page, now owned by `FIX-59`.**
`src/app/features/catalog/catalog-page.ts:67` applies
`class="catalog flex flex-col gap-7 mx-auto p-6"` and `:274-281` declares
`.catalog { display: flex; flex-direction: column; gap: var(--space-7); max-width: …;
margin: 0 auto; padding: …; }` for the same element. FIX-14 moves both halves into their
own files verbatim; **`FIX-59`** item 3, "Reconcile the `.catalog` double declaration — the
SCSS wins" (`FIX-59.md:251`), is what reconciles them.

**4 — the skip link, where the two copies already disagree.** `src/app/app.html:8` applies
`class="skip-link absolute left-0 top-0 z-50 no-underline"` while `app.scss:11-18` declares
`position: absolute; left: -9999px; top: 0; z-index: 1000; text-decoration: none`. The
Tailwind `left-0` and the SCSS `left: -9999px` are contradictory: one puts the skip link at
the left edge of every page and the other parks it off-screen until focus. Only one of them
wins, and which one is a **measurement**, not something to reason about from specificity —
FIX-17-AC03 measures it. This is what the pattern costs when nobody notices: an
accessibility affordance whose visibility is decided by a cascade accident.

## What to change

Two stylesheets. The rule that decides every individual substitution, stated once so the
executor never has to choose:

> **Substitute a token only where its value is exactly equal to the literal.** Where no
> token's value matches exactly, do **not** invent one, do **not** pick the nearest, and do
> **not** change the rendered colour: record the literal, its `file:line`, the role it
> plays and the nearest token, and hand the decision to the user.
> `.claude/rules/planning-deliverables.md` ("Where a threshold would be invented, measure
> and record instead") is the rule behind that, and the nearest-token deltas above are
> the measurement.

### 1. `src/app/app.scss` — delete the redundant block, then tokenise the rest

**`:1-8`, the `:host` rule.** Delete lines 4 to 7 entirely — the `font-family`, the
`color` and the `background`. They are not tokenised, they are **removed**, because
`src/styles/primitives.css:16-21` already sets all three on `html` from tokens and
`app-root` inherits `font-family` and `color` from it. Substituting tokens here would keep
a second copy of a declaration the global reset already owns, which is the drift this task
exists to remove. The rule is left as:

```scss
:host {
  display: block;
  min-height: 100dvh;
}
```

The `background: #ffffff` goes with them: `primitives.css:21` paints the page background
already, and an `app-root` background on top of it is a second writable copy of the same
decision.

**`:10-19`, `.skip-link`.** Substitute the exact matches and the spacing steps:

```scss
.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  padding: var(--space-2) var(--space-3);
  background: var(--color-text-primary);
  color: var(--color-text-inverse);
  text-decoration: none;
  z-index: 1000;
}
```

The `rem`-to-token conversion is exact at the browser's **default** font size, and the
reason is worth checking rather than trusting. Today `primitives.css:18` pins
`html { font-size: var(--type-body) }` and `tokens.css:66` sets `--type-body: 16px`, so
`0.5rem` is `8px` (`--space-2`, `tokens.css:43`) and `0.75rem` is `12px`
(`--space-3`, `:44`). **`FIX-52` removes that pin** — it replaces the declaration with
`font-size: 100%` so a user who has raised their default gets it — and this task lands
**before** it (Phase D before Phase F; see "Where this sits in the stream"). After
FIX-52 the equality still holds at the default setting, because `100%` resolves to
16 px there, and it stops holding once the user raises it: `--space-2` and `--space-3`
stay `px`, which `FIX-52.md:210-213` decides deliberately and puts out of its own
scope.

**That is the intended result and not a regression this task introduces.** All three
substituted values are padding and margin, not text size — `font-size: 1.25rem` at
`app.scss:41` is explicitly left a literal below — so nothing here decides whether text
resizes; and more than twenty component rules already express their spacing as
`var(--space-*)`, so what this task changes is three stragglers into the house form
rather than three scalable lengths into fixed ones. What the boxes do at a raised
default is measured and recorded by **FIX-52-AC03**, which lists the selectors that did
not scale and hands that list to the user. Do not convert `--space-*` to `rem` here:
that is a change to `tokens.css`, which this task records as the user's, and which
FIX-52 also refuses.

FIX-17-AC02 measures that the computed padding is unchanged **at the browser's default
font size**. `z-index: 1000` stays a literal: no token names a stacking level.

`background: var(--color-text-primary)` on a background is a semantic mismatch and it is
deliberate: `--color-text-primary` is the only token whose value is exactly `#171B1F`. The
semantically right token would be `--color-shell-dark` (`#1B2024`), which is a **different**
colour, so choosing it would change the rendered pixel. Record both facts in the commit body
and hand the naming decision to the user, per the rule above.

**`:21-25`, `.skip-link:focus`.**

```scss
.skip-link:focus {
  left: var(--space-2);
  top: var(--space-2);
  outline: 2px solid var(--color-brand-accent);
}
```

Record a second item for the user: `src/styles/primitives.css:46-49` already defines the
project focus ring as `outline: 2px solid var(--color-focus-light)` (`#174EB5`, blue) on
`:focus-visible`, and this rule overrides it with the orange brand accent on `:focus`. Two
focus systems. Changing which one wins is an accessibility and contrast decision that
**FIX-31** (the AA contrast task) and **FIX-29** (the axe task) are closer to; this task
substitutes the exact-matching token and changes nothing else.

**`:27-47`, the `app-fatal` rules.** These carry the two literals with no exact token,
`#fdecea` (`:30`) and `#b3261e` (`:32`). Leave both as literals, record them for the user,
and substitute only `color: #171b1f` → `var(--color-text-primary)` (`:31`) and the padding
`1.5rem 1rem` → `var(--space-6) var(--space-4)` (`:29`), plus `margin: 0 0 0.5rem` →
`0 0 var(--space-2)` at `:40`. `font-size: 1.25rem` at `:41` is `20px` and no type token
equals it (`--type-card-title` is `18px`, `--type-section-title-mobile` is `24px`), so it
stays a literal and is recorded.

> **Collision with FIX-12, and how it is settled.** FIX-12 moves `app.scss:27-47` out of
> this component stylesheet into `src/styles/primitives.css`, renaming the selectors to
> `.app-fatal`, `.app-fatal__title` and `.app-fatal__body`. **Whichever of the two tasks
> runs second applies its change to wherever the rules then live, and neither re-does the
> other's work.** Before starting, run
> `grep -n "app-fatal" src/app/app.scss src/styles/primitives.css`: hits in `app.scss` mean
> FIX-12 has not landed and the rules are edited here; hits in `primitives.css` mean it has,
> and the same three substitutions are applied there instead. Say which branch was taken in
> the commit body.

### 2. `src/app/features/checkout/payment-progress.scss` — tokenise all four values

```scss
.payment-progress {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-4);
  border-radius: var(--radius-card);
  background: var(--color-surface-section);
}
.payment-progress progress {
  width: 100%;
  height: 8px;
}
```

`height: 8px` on the progress bar **stays a literal**. `--space-2` has the same value, but
it is a spacing step and this is the height of a control; substituting it would make the
declaration say something it does not mean, and R04 asks for the token that names the
role. Record it for the user as a dimension with no token.

`--radius-card` is the right token for the panel: R06
(`.claude/skills/mi-bolt-design/SKILL.md:58`) says *"card radius is 8 px and button radius
is 6 px"*, and this element is a panel rather than a control.

### 3. Nothing else is touched

In particular, `#2c333a` (7 occurrences across `header-nav.scss` and `footer-nav.scss`) and
`#2a3035` (`hero.scss:169`) are **left exactly as they are**. Neither has a matching token,
both are shell-chrome borders and backgrounds, and deciding whether they should become a
new token or be folded into `--color-shell-dark` is a design decision for the user.
Introducing a new token is what R04's second clause tells this task not to do on its own
judgment. Record all eight occurrences in the commit body with their `file:line` and the
role each plays.

## Out of scope

- **`src/app/shared/ui/quantity-control/*` and `src/app/shared/ui/price-block/*` — FIX-19.**
  This task names the double-declaration pattern; FIX-19 fixes those two components. Do not
  edit either.
- **The catalogue page's duplicated `.catalog` layout — `FIX-59`.** Recorded above.
  **FIX-14** moves both halves verbatim and does not reconcile them; **FIX-59** item 3 does.
- **The skip link's off-screen-versus-`left-0` contradiction — `FIX-52`.** FIX-17-AC03
  measures which one wins and the commit body records the answer; **repairing** it is not
  this task's. **`FIX-52`** owns it and has already decided the answer — its title is
  "…and settle the skip link" and its Source line reads *"Recorded as unowned in `FIX-17`'s
  out-of-scope section; this task is its owner."*
- **`#2c333a` and `#2a3035`.** Recorded, not changed.
- **Introducing any new custom property into `src/styles/tokens.css`.** That file is a copy
  of the approved skill package (`:1-6`); adding to it is a design decision for the user.
- **`src/styles/primitives.css`'s own rules**, except the `app-fatal` block if FIX-12 has
  already moved it there.
- **The AA contrast failures — FIX-31**, and the axe structural violations — **FIX-29**.
- **Putting every page on one centerline and one spacing scale — FIX-34.** That is the
  layout-wide version of this problem; this task is the two fully-untokened stylesheets.

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

1. `npm run build` — must exit `0`. Green at the `db6d295` baseline. This catches a
   mistyped custom-property name only insofar as it is a syntax error; a misspelled
   `var(--colour-…)` builds fine and renders as nothing, which is why the browser
   measurements below are the real check.

2. `find src -name '*.scss' -exec grep -ho "#[0-9a-fA-F]\{3,8\}" {} + | tr 'A-F' 'a-f' | sort | uniq -c | sort -rn`
   — must now list exactly **four** rows and no others: `#2c333a` ×7, `#2a3035` ×1,
   `#fdecea` ×1 and `#b3261e` ×1. Those are precisely the four literals with no
   exact-value token. At the baseline the same command printed eight rows totalling 17
   literals. Paste the before and after output into the commit body.

3. Run `npm run test` before your first edit and again after your last, and record both
   coverage figures in the commit body. There is no target number: the pair is the
   evidence that this task did not reduce coverage, and **FIX-08** is what turns the
   thresholds into a gate. Do not carry the 56.42 % figure forward — it was measured by
   `npm run test:unit:coverage` over the 30 specs under `tests/` only, a runner and a
   denominator that no longer exist, so it cannot be compared with anything `ng test`
   reports.

4. The browser runs described in FIX-17-AC01 to FIX-17-AC04. Start the app with `npm start`
   and drive it through a real browser per `.claude/rules/browser-verification.md`; the
   agent takes the screenshots and the computed-style reads, and the orchestrator starts
   and stops the server.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-17-AC01** **Real-browser check, mandatory — nothing a person sees changes.** At
      viewport width 1440, screenshot `/`, `/telefonok` and `/penztar/ellenorzes` **before**
      the change and again **after**, and compare each pair. The rendered result is
      identical. Additionally, on `/` read three computed values and record them before and
      after: `getComputedStyle(document.querySelector('app-root')).color` returns
      `rgb(23, 27, 31)` both times, inherited from `src/styles/primitives.css:20` once the
      `:host` copy is gone; `getComputedStyle(document.documentElement).backgroundColor`
      returns `rgb(255, 255, 255)` both times, from `primitives.css:21`; and
      `getComputedStyle(document.querySelector('app-root')).fontFamily` is unchanged in the
      sense that the **rendered text is identical in the screenshots** — the declared stack
      does change, from the seven-family list at the old `app.scss:4-5` to the five-family
      `--font-family-base` at `src/styles/tokens.css:65`, and the screenshots are what
      prove the resolved face did not. Note that `app-root`'s own computed
      `backgroundColor` becomes `rgba(0, 0, 0, 0)` after the change, which is correct: the
      page background is painted by `html`, not by `app-root`, and removing the second
      writable copy is the point. `list_console_messages` reports zero errors on each route.
- [ ] **FIX-17-AC02** **Real-browser check, at the browser's default font size** — do not
      change it for this criterion, and record that it was at the default.
      Focus the skip link with Tab on `/` and read
      `getComputedStyle` on it: `paddingTop` is `8px`, `paddingLeft` is `12px`,
      `outlineColor` is `rgb(255, 106, 0)`, `backgroundColor` is `rgb(23, 27, 31)` and
      `color` is `rgb(255, 255, 255)`. Every one of those five is the same value the
      literals produced at the baseline; record the before and after side by side.
- [ ] **FIX-17-AC03** **Real-browser check, a measurement rather than a change.** On `/`
      before the skip link is focused, read
      `getComputedStyle(document.querySelector('.skip-link')).left` and record the value
      verbatim. `-9999px` means the SCSS rule wins and the affordance behaves; `0px` means
      the Tailwind `left-0` utility from `src/app/app.html:8` wins and the skip link is
      visible at the top-left of every page. **Record whichever it is in the commit body and
      do not change it in this task.** If it is `0px`, name it as a defect in the commit
      body so the orchestrator can decide who fixes it.
- [ ] **FIX-17-AC04** **Real-browser check.** Reach the payment-progress panel — complete a
      checkout with the `demo_card` payment method so the pending-payment surface renders —
      and read `getComputedStyle` on `.payment-progress`: `gap` is `8px`, `padding` is
      `16px`, `borderRadius` is `8px` and `backgroundColor` is `rgb(245, 246, 247)`. All
      four are the values the literals produced. Screenshot the panel. If the pending state
      cannot be reached because a payment scenario is needed, use the `?mi-scenario=` query
      parameter `src/mocks/scenarios.ts` provides and say in the commit body which scenario
      was used.
- [ ] **FIX-17-AC05** **R04 is applicable and met, and this is its criterion.** Every hex
      literal remaining anywhere under `src/**/*.scss` has **no** exact-value token in
      `src/styles/tokens.css`. Verified by the command in "How to verify" step 2 and by a
      table in the commit body listing each remaining literal, its `file:line`, the role it
      plays and the nearest token with the numeric difference. No new custom property was
      added to `src/styles/tokens.css`: check with
      `git diff --stat -- src/styles/tokens.css`, which must print nothing.
- [ ] **FIX-17-AC06** `grep -c "var(--" src/app/app.scss` returns at least `5` and
      `grep -c "var(--" src/app/features/checkout/payment-progress.scss` returns exactly
      `4`. At the baseline both returned `0`.
- [ ] **FIX-17-AC07** `grep -n "font-family" src/app/app.scss` returns nothing. The stack
      is not tokenised in place; it is deleted, because `src/styles/primitives.css:17`
      already sets it from `--font-family-base`.
- [ ] **FIX-17-AC08** The FIX-12 collision was evaluated: the output of
      `grep -n "app-fatal" src/app/app.scss src/styles/primitives.css` is pasted into the
      commit body and the branch taken is named in one sentence.
- [ ] **FIX-17-AC09** `npm run build` exits `0` and `npm run test` exits `0`,
      both unchanged from the `db6d295` baseline. **FIX-04** owns `ng test`'s baseline
      failure of 14 of 14 files; this task names no spec file of its own, so if it has
      not landed, record that verbatim. `git status --short` lists at most
      `src/app/app.scss`, `src/app/features/checkout/payment-progress.scss` and — only if
      FIX-12 has already landed — `src/styles/primitives.css`. Nothing under
      `src/app/shared/ui/`, nothing under `src/app/core/navigation/`, nothing under
      `src/app/features/home/`.
- [ ] **FIX-17-AC10** Design rules recorded in the commit body. **Applicable and met:
      R04** — see FIX-17-AC05, the criterion this whole task exists for; **R03** (`Use
      orange accents, charcoal text and neutral surfaces; do not introduce a beige, purple
      or glass-style redesign without a separate decision`) — the before/after screenshots
      in FIX-17-AC01 show no colour changed at all, which is the strongest possible evidence
      for it; **R06** (`Use a 4 px spacing system, generally in 8 px increments; card radius
      is 8 px and button radius is 6 px`) — the spacing steps and `--radius-card`
      substitutions, measured in FIX-17-AC02 and FIX-17-AC04; **R07** (`Use a system font or
      an approved, licensed brand font; use 16 px body text`) — the duplicate font stack is
      removed in favour of `--font-family-base`; **R20** (`visible focus`) — FIX-17-AC02
      measures the focus ring still renders at the same colour, and FIX-17-AC03 records
      whether the skip link is reachable at all; **R26** — the commit body names every file,
      the before and after hex-literal census, the commands with their exit codes, and the
      four stated remaining limitations: the four un-tokened literals handed to the user,
      the `--color-text-primary`-as-background naming mismatch, the two competing focus
      systems, and the skip-link contradiction measured in FIX-17-AC03. R01, R02, R05,
      R08–R19 and R21–R25 are **N/A: this task substitutes custom properties for literals of
      identical value in two stylesheets, so no layout, image, copy, price, state, target
      size or cart behaviour is introduced or changed**, and the identical before/after
      screenshots are what makes that an observation rather than a claim. Skill provenance
      is stated once in `docs/fix/README.md` section 3, "Every task records the design
      rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with FIX-12, FIX-14, FIX-19, FIX-34 or
any other FIX task, however adjacent the stylesheets look. Commit only after every
acceptance criterion above passes, including all four browser checks.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`, for example `refactor: extract inline templates/styles into
HTML/SCSS files`):

```text
refactor: use design tokens in app.scss and payment-progress.scss
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

Nothing has to land before this one, and the FIX-12 conditional in "What to change" step 1
makes either order safe with that task.

**FIX-19 should land after it**, because this task names the double-declaration pattern in
the two shared primitives and FIX-19 is what repairs them; running FIX-19 first costs
nothing, but the commit body here is where the pattern is written down and FIX-19's
executor benefits from reading it.

**FIX-52 must land after it.** FIX-52 replaces `primitives.css:18`'s
`font-size: var(--type-body)` with `font-size: 100%`, which is the declaration the
`rem`-to-token arithmetic in "What to change" step 1 is derived from. Landing this task
first means that arithmetic is checked against the state it describes, and
**FIX-17-AC02**'s `8px` / `12px` are read with the pin still in place. The two tasks
also meet on the skip link from opposite sides — this one substitutes its colours and
spacing, FIX-52 settles its off-screen-versus-`left-0` contradiction and `app.html:8`'s
utility classes — and `FIX-52.md:217-222` already carries the instruction for the other
order. Nothing here is written so as to be undone there.
