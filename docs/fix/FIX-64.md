# FIX-64 — Give HeroSection, CheckoutLayout and AppFooter the signal inputs the specification declares

Status: PLANNED — not executed.
Severity: major
Source: D15 items 3, 4 and 5 (the FIX-54..FIX-61 author's audit, user-approved: "Mind kapjon taskot"), `docs/spec/components.md:255`, `:60` and `:90`, decisions D1 and D15.

## Why this is wrong

`docs/spec/components.md` is the component contract: for each component it fixes the
owner, the signal inputs, the outputs, the functions and the required states. Decision
**D1** settles what happens when the code disagrees — *"`docs/` is the specification.
Where the code differs from it, the code is wrong and the fix task changes the code,
never the spec."* Three components across two different areas of the app share the same
defect class `FIX-56` already fixed for `DeliveryStep`: the specification declares a
signal-input surface and the component has none.

## Evidence

**HeroSection.** `docs/spec/components.md:251-257`:

```
### HeroSection — home / T14

**Owner:** local presentation.

**Signal inputs:** `title:string; subtitle:string; artwork:Image`.

**Outputs:** `none`.
```

`src/app/features/home/hero.ts`, the class body, in full; the leading docblock is
unchanged:

```ts
@Component({
  selector: 'app-hero',
  imports: [RouterLink],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {}
```

```
$ grep -cE "=\s*(input|model)[.<(]" src/app/features/home/hero.ts
0
```

Every string the spec names as an input is hardcoded into `hero.html` instead: the H1 at
`hero.html:4-6` ("Mobiltelefonok a MiBolt demóban"), the lead paragraph at `:7-10`, and the
illustration as inline SVG markup at `:19-83` with no `Image`-typed source at all.

**CheckoutLayout.** `docs/spec/components.md:56-62`:

```
### CheckoutLayout — purchase / T11

**Owner:** checkout route.

**Signal inputs:** `step: CheckoutStep`.

**Outputs:** `none`.
```

`src/app/layouts/checkout-layout.ts` declares zero inputs:

```
$ grep -cE "=\s*(input|model)[.<(]" src/app/layouts/checkout-layout.ts
0
```

It derives its own `currentStep` by parsing `Router.url`
(`checkout-layout.ts:54-61`, the computed itself), and its own doc comment
(`:47-53`) explains why, candidly recording the constraint this task has to solve
rather than hiding it:

```ts
  /**
   * Active step in the flow. Derived from the current URL rather than
   * a `data` input: the `data: { step }` is attached to each child
   * route, but withComponentInputBinding() cannot reach the parent
   * component from child routes, and the key name would not match the
   * `currentStep` input. Walking the URL is robust to both.
   */
```

That claim is verified, not assumed: `withComponentInputBinding()`'s binder
(`node_modules/@angular/router/fesm2022/_router-chunk.mjs`, class
`RoutedComponentInputBinder`) walks each **outlet's own** `activatedComponentRef` and
binds using **that outlet's own** `activatedRoute` data — it has no path from a child
route's data up to an ancestor layout component. `CheckoutLayout` is mounted once, by the
parent `penztar` route (`src/app/app.routes.ts:167-176`), with the five step routes as its
children (`src/app/features/checkout/checkout.routes.ts`); `data: { step: 'contact' }`
etc. lives on those children (`checkout.routes.ts:197,217,225,233,241`) and cannot bind to
`CheckoutLayout` as things are routed today. Section "What to change" below restructures
the route tree so it can.

**AppFooter.** `docs/spec/components.md:86-92`:

```
### AppFooter — shared / T11

**Owner:** local presentation.

**Signal inputs:** `compact:boolean`.

**Outputs:** `demoInfoRequested:void`.
```

`src/app/core/navigation/footer-nav.ts`, the class body, in full; the leading docblock is
unchanged:

```ts
@Component({
  selector: 'app-footer-nav',
  imports: [RouterLink],
  templateUrl: './footer-nav.html',
  styleUrl: './footer-nav.scss',
})
export class FooterNav {}
```

Zero inputs, zero outputs. Its own owner, `AppShell`, has a `showFooter:boolean` input
(`src/app/shared/shell/app-shell.ts:36`) whose own doc comment (`:35`) claims *"Checkout
uses a compact footer"*, while the template it drives, `app-shell.html:3-5`, is a binary
`@if (showFooter()) { <app-footer-nav /> }` — checkout sets `showFooter` to `false`
(`checkout-layout.html:1`) and the footer is **suppressed entirely**, not rendered
compact. `AppShell`'s class-level doc comment (`:18-19`) is more careful and says exactly
what happens today — *"The checkout variant hides the standard footer"* — so the wrong
claim is `:35`'s alone. `docs/spec/components.md:64`'s "Functions" line for
`CheckoutLayout` itself lists *"shorter footer"* as something the layout is supposed to
produce, which today's suppression does not do either. This task makes both the spec's
description and `:35`'s comment true.

## What to change

### 1. `src/app/features/home/hero.ts` and `hero.html` — the declared surface

```ts
import type { Image } from '../../api/generated/models/image';

@Component({
  selector: 'app-hero',
  imports: [RouterLink],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
  readonly artwork = input<Image | null>(null);
}
```

`title`/`subtitle` are `input.required` because the H1 and lead paragraph cannot render
without them. `artwork` is a plain, optional `input` defaulting to `null` — **no real
`Image` asset exists in this repository for the hero illustration today**, and
`FIX-33` (the home-page rebuild — see "Out of scope" below) keeps the illustration as inline
decorative SVG, unchanged: *"the illustration block, unchanged except that it keeps the
caption"*. Forcing `artwork` to be required would force `HomePage` to synthesize a fake
`Image` object just to satisfy the type, which is itself an invention design rule **R25**
forbids. `hero.html:4-10`'s hardcoded H1 and paragraph become
`{{ title() }}` / `{{ subtitle() }}`; the inline SVG at `:19-83` is untouched — when
`artwork()` is non-null in a future task that supplies a real asset, it renders instead of
the SVG, but wiring that branch is not this task's job because no asset exists to wire it
to. Record this as the finding it is; do not invent hero artwork.

### 2. `src/app/features/home/home-page.ts` — becomes the owner

`HomePage` already is a real container (it fetches config and featured products through
`Api`, `home-page.ts:68`); it is not a re-export like the checkout steps were. Add two
`readonly` string constants (or signals, if `FIX-33`'s rebuild makes the copy
config-derived — it does not; `FIX-33` hardcodes the spec's exact strings into the
rebuilt template) holding the title and subtitle text, and bind them:

```html
<app-hero
  data-testid="hero"
  [title]="heroTitle"
  [subtitle]="heroSubtitle"
/>
```

**Do not invent new copy.** Whatever `FIX-33` establishes as the hero's H1 and lead
paragraph text (or, if `FIX-33` has not yet landed, whatever `hero.html`'s current H1 and
paragraph say) is what moves into `HomePage`'s two constants, character for character —
this task relocates the strings, it does not author them.

### 3. `src/app/core/navigation/footer-nav.ts` — the declared surface

```ts
@Component({
  selector: 'app-footer-nav',
  imports: [RouterLink],
  templateUrl: './footer-nav.html',
  styleUrl: './footer-nav.scss',
})
export class FooterNav {
  readonly compact = input<boolean>(false);
  readonly demoInfoRequested = output<void>();

  onDemoInfo(): void {
    this.demoInfoRequested.emit();
  }
}
```

`compact` defaults to `false` (the marketing/shop chrome's existing behaviour); a plain
`input`, not required, because every current caller except the checkout layout wants the
default. In `footer-nav.html`, add `[class.footer--compact]="compact()"` on the root
`<footer>` so the two states are visually distinct (R14/R19), using only existing tokens
for whatever the compact rule reduces — vertical padding and/or the group count are the
two candidates already visible in the file; no new colour or font is introduced (R04). No
specific pixel value is prescribed here because none is given anywhere in the source
material; measure whatever the executor implements and record it, per
`.claude/rules/planning-deliverables.md` ("where a threshold would be invented, measure
and record instead").

**The "explain the demo" affordance becomes the output, not a self-navigating anchor.**
After `FIX-33` lands (see "Out of scope"), the footer's one surviving explanatory link is
`Hogyan működik a demó?` (`FIX-33`'s own "What to change" item 7, replacing the current
three-column footer and its "A demóról" link entirely). Whatever element carries that
affordance in the rebuilt footer, remove its own `routerLink`/`fragment` navigation and
replace it with `(click)="onDemoInfo()"` — the component must not navigate itself,
matching `components.md:3`'s *"intents use output()"* rule and the same pattern `FIX-56`
established for `DeliveryStep`'s CTA.

**The fragment the handler navigates to is the branch's own, and it is not the same in
both.** After `FIX-33` the footer's one surviving explanatory link is
*"Hogyan működik a demó?"*, whose destination is the how-it-works section, so the
handler navigates to `{ fragment: 'how' }` — the id **`FIX-42`** adds at
`FIX-42.md:169-174`.

If `FIX-33` has **not** landed when this task runs, the anchor to convert is the
current *"A demóról"* link, `footer-nav.html:13` today, whose destination is
`fragment="demo"` — the id **`FIX-42`** places on the restored demo strip
(`FIX-42.md:199-210`). In that branch the handler navigates to `{ fragment: 'demo' }`,
**not** `how`: retargeting it would change a destination for no stated reason, and
`footer-nav.html:14` already carries a separate `fragment="how"` anchor
(*"Hogyan működik?"*), so the two footer links would point at the same place. Leave
`:14` exactly as it is in this branch — it is an anchor that navigates itself, which is
what the rest of this item removes, but it is **`FIX-33`**'s to delete and not this
task's to convert. Record in the commit body which of the two shapes was present and
which fragment the handler was given.

### 4. `src/app/shared/shell/app-shell.ts` and `app-shell.html` — thread `compact` to its one real consumer

`AppShell.showFooter` (`:36`) is removed. In its place:

```ts
  /** Whether the footer renders in its compact form. The checkout layout is
   *  the only caller that sets this; every other shell uses the default. */
  readonly compact = input<boolean>(false);

  private readonly router = inject(Router);

  /**
   * Destination of the footer's demo explainer. `'how'` is the post-FIX-33
   * shape, where the surviving link is "Hogyan működik a demó?"; if FIX-33
   * has not landed the converted link is "A demóról" and this is `'demo'`,
   * which is its own destination today (footer-nav.html:13) and is a real
   * id after FIX-42. Both ids are FIX-42's to create.
   */
  onDemoInfo(): void {
    void this.router.navigate(['/'], { fragment: 'how' });
  }
```

**Write `'demo'` in place of `'how'` if `FIX-33` has not landed**, per item 3's two
branches. One handler, one fragment, chosen by the branch — the two shapes never
coexist, so the handler takes no argument.

`app-shell.html:3-5` changes from

```html
@if (showFooter()) {
  <app-footer-nav />
}
```

to

```html
<app-footer-nav [compact]="compact()" (demoInfoRequested)="onDemoInfo()" />
```

The footer now always renders — the checkout screen gets the compact form instead of no
footer at all, which is what `AppShell`'s own doc comment (`:35`) and
`components.md:64`'s "shorter footer" already claimed happens. `marketing-layout.html:1`
and `shop-layout.html:1` are unchanged (they never set `showFooter` or `compact`, so both
keep today's non-compact footer).

### 5. `src/app/layouts/checkout-layout.html` — consume the two changes above

```html
<app-app-shell variant="checkout" [compact]="true">
```

replacing `[showFooter]="false"`.

### 6. Restructure `checkout.routes.ts` and `app.routes.ts` so `step` can be a real input

This is the part of the task with the widest blast radius, and it is the one place in
this batch where the fix is a routing restructure rather than a data-ownership move. The
constraint verified above — `withComponentInputBinding()` binds a route's data only to
that same route's own component — means `step` can become a genuine `input()` only if
`CheckoutLayout` is the component **each of the five step routes itself resolves**,
carrying `data: { step }` on that same route entry, rather than being the single parent
that hosts a nested `<router-outlet>` for all five.

**`checkout.routes.ts`.** Wrap each of the five existing entries so `CheckoutLayout`
becomes that entry's own `component`, `data.step` stays on the same entry, and the
existing `loadComponent`/`canMatch`/`canActivate`/`providers`/`title` move one level down
into a single empty-path child. The cart entry, fully, as the pattern the other four
follow:

```ts
  {
    path: 'kosar',
    component: CheckoutLayout,
    data: { step: 'cart' },
    children: [
      {
        path: '',
        loadComponent: () => import('../cart/cart-page').then((m) => m.CartPage),
        title: 'MiBolt — Kosár',
      },
    ],
  },
```

Apply the identical wrapping to `adatok` (`data: { step: 'contact' }`, keeping
`canMatch: [contactGuard]` and the `providers: [...]` array on the nested child — both
stay exactly where they are relative to the route they guard/provide for, they only move
one nesting level deeper), `szallitas` (`data: { step: 'delivery' }`,
`canMatch: [deliveryGuard]`), `ellenorzes` (`data: { step: 'review' }`,
`canMatch: [reviewGuard]`) and `siker/:orderId` (`data: { step: 'success' }`,
`canActivate: [successGuard]`). Every `loadComponent` stays a dynamic `import()` — this
restructuring must not turn any step into an eagerly-loaded chunk.

**`app.routes.ts:167-176`.** Remove `component: CheckoutLayout` from the `penztar` route.
`loadChildren` stays exactly as it is — Angular renders a route's children directly when
the route itself has no `component`, so `/penztar/*` keeps resolving through
`checkout.routes.ts` exactly as before; only the identity of which route carries
`CheckoutLayout` changes.

**`checkout-layout.ts`.** Replace the URL-parsing `currentStep` computed and the doc
comment above it (`:47-61`) with the declared input:

```ts
  readonly step = input.required<CheckoutStep>();
```

**`input.required`, not a default.** `components.md:60` writes `step: CheckoutStep`,
and the same document spells an optional member with `?` where it means one
(`minPrice?:number` and `value?:string|number` at `:7`), so the declared contract is a
required input and D1 makes that reading binding. A default of `'cart'` would also be an
invented value, which R14 forbids. The cost is that every `TestBed.createComponent(
CheckoutLayout)` must now bind it or Angular throws NG0950
(`node_modules/@angular/core/types/core.d.ts:4021`,
`REQUIRED_INPUT_NO_VALUE = -950`); item 7 below pays that cost in the one spec file that
does it.

Delete `urlSignal` (`:45`), the `Router`/`ActivatedRoute` injections that existed only to
compute it (`:35-36`), and the constructor's navigation subscription that updated
`urlSignal` (`:72-77`, inside the `constructor()` that starts at `:71`) — keep the
`routeFocus.scheduleFocus()` call the same subscription makes, since focus management on
navigation is unrelated to this restructuring; only the `this.urlSignal.set(...)` line
goes. **Keep `RouteFocusService` and its `DestroyRef` wiring** (`:34,37`) unchanged.

**`checkout-layout.html`.** Every template read of `currentStep()` (`:7,8`) becomes
`step()`. **Rename the `@for` loop variable first** (`:4`, `@for (step of steps; …)`):
the loop already binds a local named `step` (`{ key: CheckoutStep; label: string }`) over
the same template this task adds a `step()` **input signal** to — `step.key` (the loop
item) and `step()` (the new input) are syntactically distinct but read as the same word
twice in the same block. Rename the loop variable to `item` (`@for (item of steps; track
item.key)`, `item.key`, `item.label`) so `step()` unambiguously means the input.

### 7. `tests/layouts.spec.ts` — bind the new required input at its four render sites

`CheckoutLayout` is rendered four times in this file and never with an input. Once
`step` is `input.required`, `checkout-layout.html`'s `step()` reads throw NG0950 and all
four cases fail. Bind it with `componentRef.setInput`, which this file already uses for
`AppShell`'s `variant` at `:400` and `:409`.

`:184-194`, the case `it('CheckoutLayout removes search but retains return-to-shop
navigation', …)` — insert one line after `createComponent`:

```ts
    const f = TestBed.createComponent(CheckoutLayout);
    f.componentRef.setInput('step', 'cart');
    f.detectChanges();
```

`:196-205`, the case `it('CheckoutLayout shows the four numbered step labels', …)` —
the identical insertion:

```ts
    const f = TestBed.createComponent(CheckoutLayout);
    f.componentRef.setInput('step', 'cart');
    f.detectChanges();
```

`:236-245` and `:247-256`, the two `layouts.forEach` loops, each of which renders all
three shells through one variable. Guard the call so the two shells that have no `step`
input are untouched:

```ts
    const layouts = [MarketingLayout, ShopLayout, CheckoutLayout];
    layouts.forEach((L) => {
      const f = TestBed.createComponent(L);
      if (L === CheckoutLayout) {
        f.componentRef.setInput('step', 'cart');
      }
      f.detectChanges();
```

The rest of each loop body is unchanged. `setInput` is declared
`setInput(name: string, value: unknown): void`
(`node_modules/@angular/core/types/core.d.ts:5044`), so the union element type of
`layouts` raises no error at the call.

`'cart'` is the value at all four sites: it is the first `CheckoutStep` member and the
one whose label set the two assertions already read.

Do not add `// @vitest-environment jsdom`, `import '@angular/compiler'` or an
`initTestEnvironment` call — this file already carries all three (`:11`, `:12`,
`:38-44`).

**Caution proportional to the risk.** This is a bigger, more novel change than the other
four components in this batch: it touches route matching, not just component wiring. Run
the "How to verify" checks for every one of the five URLs before committing. If any guard
redirect, any lazy-chunk boundary, or the `/kosar` → `/penztar/kosar` redirect
(`app.routes.ts:154-164`, unaffected by this change but adjacent to it — do not touch it)
stops behaving exactly as it does today, stop and report rather than committing a routing
regression.

## Out of scope

- **Sequencing with `FIX-33`, which lands first for both `HeroSection` and `AppFooter`.**
  It rebuilds `hero.html`'s heading, lead copy and CTA to match `docs/spec/screens.md` S1,
  and it replaces `footer-nav.html`'s three-column footer with the single dark bar
  (`FIX-33`'s own "Files this change touches" list names `hero.html`, `hero.scss`,
  `hero.ts` and `footer-nav.html`, `footer-nav.scss`). This task converts whatever
  `FIX-33` leaves into signal inputs; it does not re-derive or second-guess the copy or the
  footer layout `FIX-33` establishes. If `FIX-33` has not landed when this task runs,
  apply this task's input/output wiring to the **current** `hero.html`/`footer-nav.html`
  content instead, and say so in the commit body — do not block on `FIX-33` for the parts
  of this task that do not depend on its content (the input/output declarations
  themselves).
- **The three home-page quick-filter shortcuts — `FIX-18`.** Their `routerLink` defect
  (`hero.html:99-113`, `routerLink="/telefonok?is5g=true"` and its two siblings — a string
  `routerLink` containing a query string percent-encodes into a URL that 404s) and their
  content mismatch (`FIX-33`, `FIX-35`) are untouched here. `FIX-33` deletes that shortcut
  nav entirely and replaces it with the spec's own three categories, and `FIX-18`'s own
  text anticipates that: *"If FIX-33 lands before this task and rewrites hero.html,
  re-check the rewritten file against this task."*
- **Correction to this task's brief: `FIX-41` does not own a `hero.html` `routerLink`
  defect.** `FIX-41` is entirely about `NotFoundPage`'s missing stylesheet and its missing
  catalogue link (`docs/fix/FIX-41.md`, in full) and never mentions `hero.html`. The
  `routerLink`-with-a-query-string defect in `hero.html` is owned by **`FIX-18`**, not
  `FIX-41`; this bullet corrects the citation rather than repeating it.
- **The rest of the home page's fidelity to the prototype — `FIX-33`.** The demo strip,
  the featured grid, the how-it-works tiles, the `how`/`demo` fragment targets. This task
  only adds `Hero`'s three inputs and reads `FIX-33`'s established copy into them.
- **The 404 page — `FIX-41`.** Named above only to correct a citation; this task changes
  nothing in `src/app/features/not-found/`.
- **UI copy — `FIX-35`.** No string in `hero.html` or `footer-nav.html` is authored by
  this task; every string it touches is relocated character-for-character from wherever it
  already lives — including the two footer fragments: neither branch of item 3 changes
  where a link goes, which is why the handler's fragment is the branch's own rather than a
  single hardcoded value.
- **`checkout.guards.ts` itself.** The four guards (`contactGuard`, `deliveryGuard`,
  `reviewGuard`, `successGuard`) and `successGuard`'s `canActivate` are relocated one
  nesting level deeper, unchanged in substance.
- **`RouteFocusService`.** Consumed unchanged by `CheckoutLayout`.
- **`ContactStep`, `DeliveryStep`, `ReviewStep`'s own signal inputs — `FIX-56` and
  `FIX-63`.** This task moves where their route entries sit in the tree; it does not
  change what they receive as inputs.
- **`AppHeader`.** `components.md:32-40` is a separate contract; not measured here.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`),
`npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41
failures (`FIX-09`).

```bash
npm run build               # expected exit 0
npm run test                 # record the exit code; FIX-64-AC07 carries the FIX-04 escape clause
grep -c "input.required<string>()" src/app/features/home/hero.ts        # expected: 2
grep -c "component: CheckoutLayout" src/app/app.routes.ts               # expected: 0
grep -c "component: CheckoutLayout" src/app/features/checkout/checkout.routes.ts
                                                                          # expected: 5
grep -c "showFooter" src/app/shared/shell/app-shell.ts src/app/layouts/checkout-layout.html
                                                                          # expected: 0
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Browser checks (mandatory — all three are rendered chrome/page surfaces):

1. At 1440, open `http://localhost:4200/`. The hero's H1 and lead paragraph render the
   same text as before this task (moved, not reworded); the illustration renders
   unchanged. `list_console_messages` reports zero errors.
2. Reach each of the five checkout URLs in turn by clicking through the flow (build a
   cart, proceed to checkout, advance through each step): `/penztar/kosar`,
   `/penztar/adatok`, `/penztar/szallitas`, `/penztar/ellenorzes`, and the success page
   reached after submitting. At each, `[data-testid="checkout-steps"]`'s current-step
   marker matches the URL, and the guard behaviour is unchanged — attempting
   `/penztar/ellenorzes` directly with an empty cart still redirects the same way it does
   on `main` before this task.
3. On any non-checkout page (`/`, `/telefonok`), the footer renders in its default
   (non-compact) form. On any checkout screen, it renders in its compact form and is
   **visible**, not absent — screenshot both for comparison.
4. Click the footer's demo-explainer affordance from a checkout screen; confirm
   `window.location` navigates to `/` with the fragment the branch taken in item 3
   prescribes — `how` if **FIX-33** has landed, `demo` if it has not — and that the page
   does not throw. Record which branch was taken and read `window.location.hash` back
   verbatim. If **FIX-42** has not landed either, the fragment is in the URL and
   nothing scrolls, because neither target id exists yet (`FIX-42.md:30`): that is
   FIX-42's to fix, so record the observation and name it rather than adding an id
   here.
5. Repeat checks 1 and 3 at 390.

Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R14 applies**: the footer's `compact`/default states must be reachable and visibly
  distinct, and the checkout step indicator must reflect the real active step for every
  one of the five URLs.
- **R05 applies**: the compact footer stays on the same centreline as the standard one.
- **R06 applies**: any spacing change the compact rule makes uses `--space-*` tokens only.
- **R10/R11 apply**: the hero illustration stays `aria-hidden`, decorative-only SVG; no
  functional text moves into it.
- **R12 applies**: every relocated string keeps its exact Hungarian text and accents.
- **R20/R21 apply**: the footer's demo-explainer control and every checkout step-indicator
  item keep their accessible names and 44 px minimum targets.
- **R25 applies and is central to the `artwork` decision**: no hero artwork asset is
  invented to fill a type the spec names but no asset exists for.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R04, R07–R09, R13, R15–R19, R22–R24: N/A — this task moves data ownership and
  route structure; it introduces no new colour, dimension, font, price, filter, loading,
  success or error state, and no new modal or handoff artefact.

## Acceptance criteria

- [ ] **FIX-64-AC01** `src/app/features/home/hero.ts` declares exactly `title`,
      `subtitle` (both `input.required<string>()`) and `artwork`
      (`input<Image | null>(null)`). No fourth input is added, and `Hero` declares no
      output.
- [ ] **FIX-64-AC02** `src/app/features/home/home-page.ts`'s template binds
      `[title]`/`[subtitle]` on `<app-hero>`, and `grep -c "app-hero" src/app/features/home/home-page.ts`
      shows one usage carrying both bindings.
- [ ] **FIX-64-AC03** `src/app/layouts/checkout-layout.ts` declares exactly
      `step = input.required<CheckoutStep>()`; `grep -c "urlSignal\|currentStep" src/app/layouts/checkout-layout.ts`
      prints `0`.
- [ ] **FIX-64-AC04**
      `grep -c "component: CheckoutLayout" src/app/features/checkout/checkout.routes.ts`
      prints `5`, and `grep -c "component: CheckoutLayout" src/app/app.routes.ts` prints
      `0`.
- [ ] **FIX-64-AC05** `src/app/core/navigation/footer-nav.ts` declares exactly
      `compact = input<boolean>(false)` and `demoInfoRequested = output<void>()`.
- [ ] **FIX-64-AC06** `src/app/shared/shell/app-shell.ts` declares no `showFooter`
      input (`grep -c "showFooter" src/app/shared/shell/app-shell.ts` prints `0`) and
      declares `compact = input<boolean>(false)`, threaded to `<app-footer-nav [compact]>`.
- [ ] **FIX-64-AC06b** `grep -c "setInput('step'" tests/layouts.spec.ts` prints `4`,
      and `npx vitest run tests/layouts.spec.ts` exits `0`. Before this task the same
      grep printed `0`; after the input is made required and before item 7 is applied
      the run fails with NG0950, so this criterion can fail and is the proof item 7
      landed.
- [ ] **FIX-64-AC07** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own specs
      (**`tests/layouts.spec.ts`**, `tests/home-page.spec.ts`, and a new
      `tests/checkout-layout.spec.ts` / `tests/footer-nav.spec.ts` if neither exists
      yet — `FIX-06` owns spec placement, and these follow it from the start) with
      `npx vitest run <files>` instead. `tests/layouts.spec.ts` is not optional here:
      it is the file item 7 edits, and it is the only existing proof that
      `CheckoutLayout` still renders.
- [ ] **FIX-64-AC08** **Real-browser check, the hero.** "How to verify" step 1 passes and
      is screenshotted.
- [ ] **FIX-64-AC09** **Real-browser check, the checkout step indicator.** "How to verify"
      step 2 passes for all five URLs; record the five screenshots and confirm the
      pre-existing guard redirect (empty-cart → `/penztar/kosar` from `/penztar/ellenorzes`)
      still fires.
- [ ] **FIX-64-AC10** **Real-browser check, the footer.** "How to verify" steps 3 and 4
      pass; record both footer screenshots side by side, and record
      `window.location.hash` after step 4's click together with which branch of item 3
      was taken. In the **FIX-33-has-not-landed** branch, also record that
      `footer-nav.html:14`'s *"Hogyan működik?"* anchor is unchanged and still carries
      `fragment="how"`, so the two footer links have two destinations and not one.
- [ ] **FIX-64-AC11** **Real-browser check at 390.** "How to verify" step 5 passes and
      `document.documentElement.scrollWidth` is not greater than `window.innerWidth + 1`
      on both the home page and one checkout screen.
- [ ] **FIX-64-AC12** The commit body states that `FIX-33` landed first (or, if it had
      not, which of the two `hero.html`/`footer-nav.html` shapes this task actually
      wired), names `FIX-18` as the shortcut links' separate owner, and corrects the
      `FIX-41` citation from this task's own brief.

## Commit

This task is exactly one commit covering `hero.ts`, `hero.html`, `home-page.ts`,
`checkout-layout.ts`, `checkout-layout.html`, `checkout.routes.ts`, `app.routes.ts`,
`footer-nav.ts`, `footer-nav.html`, `app-shell.ts`, `app-shell.html`,
`tests/layouts.spec.ts` (item 7 — the four `createComponent(CheckoutLayout)` sites
that must now bind `step`), `marketing-layout.html`/`shop-layout.html` only if either
needs a no-op-compatible binding, and the new/updated spec files. All three components
land together because the
footer and layout halves share one file (`app-shell.ts`) that both `CheckoutLayout` and
`AppFooter` depend on, and splitting the route restructuring from the input declaration it
exists to serve would leave a `CheckoutLayout` with a `step` input nothing supplies. Do not
bundle it with **FIX-33**, **FIX-18** or **FIX-35**, each of which is its own commit in the
same area. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
refactor: give HeroSection, CheckoutLayout and AppFooter the inputs components.md declares
```
