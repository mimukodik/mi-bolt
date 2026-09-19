# FIX-55 — Make the checkout breadcrumbs navigate without a full page load

Status: DONE — the delivery step's three breadcrumbs use `routerLink`
instead of a plain `href`; `grep -rn 'href="/' src --include='*.html'`
now prints only `src/index.html`'s `<base>` tag.
Severity: blocker
Source: Review round item N3 (orchestrator-measured), confirmed at source and swept across the whole application by this task.

## Why this is wrong

`src/app/features/checkout/delivery-step.html:5`, `:7` and `:9` render the three
navigable breadcrumbs as plain `<a href="…">`. A plain `href` to a same-origin path is a
document navigation: the browser tears the application down and boots it again. Angular's
own router is bypassed, and every piece of in-memory state goes with it.

On this screen that is not a performance complaint, it is data loss. A full reload
currently empties the cart — the defect **FIX-10** owns and fixes in four ordered parts —
so a user on the delivery step who clicks "Kosár" to check what they are buying arrives at
an empty cart and has lost the order they were three steps into. Even after FIX-10 lands
and the cart survives, the reload still discards everything this step holds in signals:
the selected delivery option, the typed address and the chosen payment method
(`delivery-step.ts:126-137`), none of which is persisted anywhere.

`docs/spec/architecture.md:109` is the rule: *"Within one SPA session an HTTP/validation
failure preserves all typed fields."* A breadcrumb click is not even a failure, and it
ends the SPA session. `docs/spec/architecture.md:7` fixes the approach as *"one
feature-oriented Angular 22 SPA"*, and `:15` calls the purchase family's steps *"routeable
states, not additional unrelated visual systems"* — a plain `href` turns each of them back
into a page load.

## Evidence

**The three links.** `src/app/features/checkout/delivery-step.html:3-11`:

```html
      <header class="heading">
        <nav class="breadcrumbs" aria-label="Navigáció">
          <a href="/" class="breadcrumb">Főoldal</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a href="/penztar/kosar" class="breadcrumb">Kosár</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a href="/penztar/adatok" class="breadcrumb">Adatok</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <span class="breadcrumb is-current" aria-current="page">Szállítás</span>
        </nav>
```

**The sweep, which is what sets this task's scope.** The finding named one file. Run
across the whole of `src/`, these three lines are the only internal `href` links in the
application:

```
$ grep -rn 'href="/' src --include='*.html' --include='*.ts'
src/index.html:6:  <base href="/">
src/app/features/checkout/delivery-step.html:5:          <a href="/" class="breadcrumb">Főoldal</a>
src/app/features/checkout/delivery-step.html:7:          <a href="/penztar/kosar" class="breadcrumb">Kosár</a>
src/app/features/checkout/delivery-step.html:9:          <a href="/penztar/adatok" class="breadcrumb">Adatok</a>
```

`src/index.html:6` is the document's `<base>` tag, not a link. **FIX-54** owns that line
and keeps it; it is not touched here.

**Every sibling checkout step already does it correctly**, which is what makes this one
file an oversight rather than a pattern:

```
src/app/features/checkout/contact-step.html:4:      <a routerLink="/penztar/kosar" class="breadcrumb no-underline">Kosár</a>
src/app/features/checkout/review-step.html:9:          <a routerLink="/" class="breadcrumb">Főoldal</a>
src/app/features/checkout/review-step.html:11:          <a routerLink="/penztar/kosar" class="breadcrumb">Kosár</a>
src/app/features/checkout/review-step.html:13:          <a routerLink="/penztar/adatok" class="breadcrumb">Adatok</a>
src/app/features/checkout/review-step.html:15:          <a routerLink="/penztar/szallitas" class="breadcrumb">Szállítás</a>
src/app/features/checkout/success-step.html:5:          <a routerLink="/" class="breadcrumb">Főoldal</a>
src/app/features/checkout/success-step.html:7:          <a routerLink="/penztar/kosar" class="breadcrumb">Kosár</a>
src/app/features/catalog/catalog-page.ts:70:          <a routerLink="/" class="breadcrumb no-underline">Főoldal</a>
```

The catalogue's breadcrumb lives in `catalog-page.ts`'s inline `template:`, not in
`src/app/features/catalog/catalog-page.html`: that extracted file (and its `.scss`
sibling) exist but are orphaned — `catalog-page.ts` still declares its template and
styles inline with no `templateUrl`/`styleUrl`, so neither compiled file is live.
**FIX-14** owns wiring the extracted pair in.

**The component cannot use `routerLink` today.** `delivery-step.ts:59` imports only
`Router`, and the `imports` array at `:100-107` lists `AddressForm`, `Button`,
`ErrorState`, `LoadingState`, `PaymentMethodSelector` and `PriceBlock` — no `RouterLink`.
A standalone component's template can only use a directive its own `imports` array names,
so adding `routerLink` to the template without the import is a build failure, not a silent
no-op.

**The three targets all exist.** `src/app/features/checkout/checkout.routes.ts` declares
`kosar` (`:194`), `adatok` (`:200`), `szallitas` (`:220`), `ellenorzes` (`:228`) and
`siker/:orderId` (`:236`) under the `penztar` prefix, which is the prefix the sibling
templates quoted above already use.

## What to change

### 1. `src/app/features/checkout/delivery-step.ts` — import the directive

At `:59`, extend the existing router import:

```ts
import { Router, RouterLink } from '@angular/router';
```

and add `RouterLink` to the `imports` array at `:100-107`, in the alphabetical position
the existing list already uses (between `PriceBlock` and the end, or wherever the file's
own ordering puts it — match the file, do not re-sort it).

### 2. `src/app/features/checkout/delivery-step.html` — three attributes

Replace `href` with `routerLink` on lines `:5`, `:7` and `:9`. Change nothing else on
those lines: the `class`, the link text and the surrounding separators stay exactly as
they are.

```html
          <a routerLink="/" class="breadcrumb">Főoldal</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a routerLink="/penztar/kosar" class="breadcrumb">Kosár</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a routerLink="/penztar/adatok" class="breadcrumb">Adatok</a>
```

**Use the string form, not `[routerLink]="['/penztar','kosar']"`.** Three of the four
sibling templates use the string form for the same paths, and matching them is what
`.claude/CLAUDE.md` ("Surgical changes") asks for. `RouterLink` still renders a real
`href` attribute into the DOM, so the links stay copyable, middle-clickable and readable
by assistive technology exactly as before.

### 3. A test in the spec file that covers this component

`delivery-step` has no co-located spec file today; `grep -rln "DeliveryStep" src tests`
tells you which file covers it, and the assertion goes there. If the only coverage is
under `tests/`, put the assertion in that file and **do not move the file** — `FIX-06`
owns relocating specs.

Assert the **structure**, not the source text:

- render the component, query `nav.breadcrumbs a`, and assert there are three of them;
- assert that each one's `getAttribute('href')` is `/`, `/penztar/kosar` and
  `/penztar/adatok` in order — `RouterLink` writes the resolved `href` back onto the
  anchor, so this asserts the directive actually bound rather than that a literal string
  is present;
- assert that clicking one calls the router rather than the browser: spy on `Router`'s
  navigation and assert it was invoked, or assert that the click event's
  `defaultPrevented` is `true`, which is how `RouterLink` stops the document navigation.

A test that greps `delivery-step.html` for the string `routerLink` is not a test of this
change. `FIX-07` and `FIX-07b` exist because that pattern is already in this repository;
do not add another instance of it.

## Out of scope

- **`src/index.html:6` — `FIX-54`.** It is a `<base>` tag, not a link, and FIX-54 keeps
  it.
- **The cart being lost on reload — `FIX-10`.** This task stops one screen from
  triggering the reload; it does not make a reload survivable. Both are needed and
  neither closes the other. If FIX-10 has already landed, this change is still required:
  the delivery step's own selection, address and payment method are signals that no
  persistence restores.
- **`DeliveryStep`'s missing `options` / `fields` / `saveState` inputs and its missing
  `continueRequested` / `retryOptions` outputs — `FIX-56`.** That task reshapes the
  component's public surface; this one changes three attributes in its template. If
  FIX-56 has already landed, apply the same three attribute changes to whatever the
  template looks like then.
- **The inert continue button and the raw internal-state copy — `FIX-22`.** Same file,
  different elements. Never run the two at the same time; whichever lands second keeps
  both changes and says so in its commit body.
- **`DeliveryStep.onConfirm()` swallowing a save failure — `FIX-44`.** Same file, the
  `.ts` this time. Same rule: never concurrent.
- **The breadcrumb styling.** `delivery-step.scss:22-47` already styles `.breadcrumbs`,
  `.breadcrumb`, `:hover`, `:focus-visible`, `.is-current` and `.breadcrumb__sep`. Change
  no rule in it. Note that `contact-step.html:4` and `catalog-page.html:4` carry an extra
  `no-underline` utility that this file does not; that inconsistency is a
  duplicate-declaration question **FIX-17** and **FIX-59** work on, not this task's.
- **Router fragment navigation, the missing target ids and the dead header and footer
  links — `FIX-42`.** A different navigation defect in different files.
- **The contact step's breadcrumb starting at "Kosár" while the other three start at
  "Főoldal".** That is a copy and information-architecture question; `FIX-35` owns UI
  copy. Record it in the commit body and change nothing.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`). If the spec file you add the assertion
to is one of the 14, **do not gate on `npm run test`'s exit code**; write the assertion in
the right file anyway and let `FIX-04` turn the command green.

```bash
npm run build               # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does not
                            # fail this task, since this task names no spec file of its own
grep -rn 'href="/' src --include='*.html'
                            # expected: only src/index.html:6
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Browser checks (mandatory — this change is a navigation a person performs):

1. At 1440, open the home page, add a device to the cart, and walk the checkout to
   `/penztar/szallitas` **by clicking**, never by typing a URL. A typed URL is a fresh
   load and would destroy the very state this task protects.
2. On the delivery step, select a delivery option and, if it is home delivery, fill the
   address. This is the state that must survive.
3. Click the "Kosár" breadcrumb. Measure what happens, per AC03 and AC04.
4. Navigate back to the delivery step by clicking, and repeat with the "Adatok"
   breadcrumb and then with "Főoldal".

Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R20 applies**: the three breadcrumbs keep a visible focus ring and a discernible
  accessible name after the change. `RouterLink` renders a real `href`, so the anchors
  stay in the tab order and `delivery-step.scss:35-38`'s `:focus-visible` rule keeps
  matching. Verify the focus ring in the browser, not in the stylesheet.
- **R21 applies**: the breadcrumb hit targets are unchanged by this edit; confirm the
  measured rects are no smaller than before.
- **R23 applies**: focus after an in-app navigation is not the browser's document-load
  reset any more. Check that the destination page is reachable by keyboard from the
  breadcrumb without a focus trap; `FIX-30` owns dialog and drawer focus restoration and
  is not this task's.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R19, R22, R24, R25: N/A — this change replaces three attribute names in one
  template and adds one directive to one `imports` array. It introduces no brand asset,
  colour, dimension, font, copy, layout, data source, state machine or handoff artefact.

## Acceptance criteria

- [ ] **FIX-55-AC01** `grep -rn 'href="/' src --include='*.html'` prints exactly one line,
      `src/index.html:6`, the `<base>` tag.
- [ ] **FIX-55-AC02** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; this task names
      no spec file of its own, so if it has not landed, record that verbatim.
- [ ] **FIX-55-AC03** **Real-browser check: no document navigation.** At 1440, with a
      delivery option selected and the address filled on `/penztar/szallitas`, click the
      "Kosár" breadcrumb. The network log shows **no** request for the document
      (`index.html`) and no re-request of the application's JavaScript chunks, and
      `list_console_messages` reports zero errors. Capture the network log; that log is
      the proof, and a screenshot of the cart page alone is not.
- [ ] **FIX-55-AC04** **Real-browser check: the step's state survives.** Navigate back
      from the cart to `/penztar/szallitas` by clicking. The delivery option selected in
      step 2 of "How to verify" is still selected, and the address fields still hold the
      typed values.
- [ ] **FIX-55-AC05** **Real-browser check: the other two crumbs.** Repeat AC03 for
      "Adatok" and for "Főoldal". Each lands on `/penztar/adatok` and `/` respectively,
      with no document request and no console error.
- [ ] **FIX-55-AC06** **Real-browser check at 390.** Repeat AC03 once at a 390 px
      viewport. The breadcrumb row wraps rather than overflowing, and
      `document.documentElement.scrollWidth` is not greater than
      `document.documentElement.clientWidth`.
- [ ] **FIX-55-AC07** The spec file covering `DeliveryStep` contains a test asserting that
      the three breadcrumb anchors resolve to `href` values `/`, `/penztar/kosar` and
      `/penztar/adatok`, and that a click on one is handled by the router rather than by
      the browser (the router was called, or the click's `defaultPrevented` is `true`).
      `grep -c "routerLink" <that spec file>` returning a non-zero number does not satisfy
      this criterion.

## Commit

This task is exactly one commit: one import, three attributes and the test that holds
them. Do not bundle it with any other FIX task, and in particular not with **FIX-22**,
**FIX-44** or **FIX-56**, all three of which edit this same component and each of which is
its own commit. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: route the delivery step breadcrumbs through the router
```
