# FIX-70 — Give DemoNotice its persistenceMode input and its memory-warning state

Status: PLANNED — not executed.
Severity: major
Source: Split out of FIX-50 item 6 by RULINGS-B2 (finding S4a-D1): it shares no file, no
screen and no call site with FIX-50's other five items and carries a different
prerequisite chain.

## Why this is wrong

`docs/spec/components.md:101-113` declares `DemoNotice` as a real component, filed under
`shared / T10`:

```text
### DemoNotice — shared / T10

**Owner:** local presentation.

**Signal inputs:** `persistenceMode: durable|memory`.

**Outputs:** `none`.

**Functions:** Persistent Hungarian simulation disclosure; explain memory-only/reload
behavior without suggesting real order fulfillment.

**Required states:** default,memory-warning.
```

Nothing in `src/` answers to either name:

```
$ grep -rn "DemoNotice\|demo-notice\|persistenceMode" src/app
src/app/features/checkout/contact-step.html:9:    <p class="demo-notice m-0 p-3 px-4 rounded text-sm leading-relaxed" data-testid="contact-demo-notice" role="note">
src/app/features/checkout/contact-step.scss:57:.demo-notice {
src/app/features/checkout/contact-step.scss:68:.demo-notice strong {
src/app/features/checkout/contact-step.scss:175:  .demo-notice,
src/app/features/checkout/payment-method-selector.html:3:  <p class="hint my-2 mb-4 leading-relaxed" data-testid="payment-demo-notice">
src/app/features/checkout/success-step.html:28:        <p class="demo-notice" data-testid="success-demo-notice" role="note">
src/app/features/checkout/review-step.scss:61:      .demo-notice {
src/app/features/checkout/review-step.scss:72:      .demo-notice strong {
src/app/features/checkout/review-step.html:22:        <p class="demo-notice" data-testid="review-demo-notice" role="note">
src/app/features/checkout/success-step.scss:56:      .demo-notice {
```

Every hit is the string `demo-notice` used as a CSS class on four unrelated checkout
paragraphs (`contact-step.html:9`, `review-step.html:22`, `success-step.html:28`,
`payment-method-selector.html:3`). None of the four is the shared component the
specification describes, and no hit is `persistenceMode`. `docs/spec/screens.md:33`
requires a persistent demo strip on every screen, and decision **D6** restores it —
*"Vissza kell tenni"*. `FIX-33` is the task that restores the strip itself; this task is
the one that gives it the input and the second state the specification declares.

**Why this is its own task rather than part of `FIX-50`.** `FIX-50` reshapes `AddToCart`,
`ProductGallery`, `VariantSelector` and builds `MobileBuyRail` — four components composed
on one screen, the product page, which is why they are one commit. `DemoNotice` touches
none of those files, renders on every screen rather than one, and is blocked on two other
tasks (`FIX-33`, then `FIX-10`) that the other four items do not wait on at all. Landing it
inside `FIX-50`'s commit would let that commit claim five components conform to the
specification while permitting this fifth one to ship blocked — the shape
`.claude/rules/session-lifecycle.md` ("One commit, one logical change") and
`.claude/rules/planning-deliverables.md` ("One file per independently executable unit")
both rule out, and the shape decisions **D8**, **D13** and **D15** were written to close:
*"nem hagyunk hátra ismert hibát"* ("we do not leave a known bug behind").

## Evidence

**The persistence value this task needs to drive the `'memory'` state is not exposed
today.** `src/mocks/persistence.ts:94` declares `private denied = false;`, set at three
call sites (`:105`, `:117`, `:132`) when a `sessionStorage` operation throws, and read
internally at `:101`, `:112`, `:128`. Nothing outside the class reads it — `grep -rn
"\.denied" src/mocks` matches only those six lines, all inside
`persistence.ts`. The log line at `:142` —

```
'[mi-bolt] persistence: sessionStorage denied, using in-memory cache; reload will not restore snapshot.'
```

— is the mock's own diagnostic, printed to the console and read by nothing in the
application. Exposing this flag is decision **D5**'s persistence work, owned by **FIX-10**;
this task does not reach into `src/mocks/` to read it early.

**The Hungarian sentence for the `'memory'` state does not exist in either of the two
places `docs/spec/components.md:105` and FIX-50's original text pointed at, and that
absence is recorded here rather than filled by invention.**

- `docs/design/prototype.html`'s rendered demo strip carries exactly one sentence, found by
  locating the literal template string (the file is a single unminified line, so `grep -n`
  cannot isolate it — it was located with a substring search instead):

  ```html
  <div class="demo-strip"><div class="container"><span class="tag">DEMÓ</span>Fiktív
  termékek és árak. A vásárlás szimulált; nem történik valódi fizetés.</div></div>
  ```

  ("Fictional products and prices. The purchase is simulated; no real payment takes
  place.") That is the strip's **default** state — the one `FIX-33` builds under **D6** —
  and it says nothing about a reload or about memory-only persistence. A repository-wide
  search for every plausible Hungarian phrasing of "reload will not restore" —
  `nem tudja`, `nem áll vissza`, `visszaáll`, `nem menti`, `nem marad meg`, `törlődik`,
  `elveszik`, `tárol` — returns zero hits in `docs/design/prototype.html`.
- `docs/spec/architecture.md` §8, the paragraph at `:109`, carries the requirement only in
  English: *"Storage denied still supports a complete in-memory demo but explicitly warns
  that reload cannot restore it."* No Hungarian sentence accompanies it anywhere in that
  section (`:103-111`).

So neither of the two sources FIX-50's original item 6 named actually carries a usable
Hungarian sentence for this state. R14 (`.claude/skills/mi-bolt-design/SKILL.md:66`)
forbids inventing a value, so this is reported as a finding rather than papered over with
invented copy: **the executor who runs this task must ask for the sentence, or write it
under the same review this repair package itself went through, rather than composing it
unsupervised.** AC05 below is written so that a sentence with no cited source fails the
criterion outright.

## What to change

**Prerequisites, in this order: `FIX-33` (builds the demo strip decision D6 restores;
without it there is nothing to give an input to) and `FIX-10` (exposes the persistence mode
under D5).** If `FIX-33` has not landed, stop and report; do not build a demo strip here.
If `FIX-10` has not landed, this task still runs — see item 4.

### 1. Locate what FIX-33 built

```bash
grep -rn "demo-notice\|DemoNotice\|demo-strip" src/app
```

### 2. Give the component the `persistenceMode` input

```ts
readonly persistenceMode = input<'durable' | 'memory'>('durable');
```

An `input()` with a default, not `input.required()`, so this task can land before `FIX-10`
has exposed a real value — `docs/spec/components.md:3` allows either shape.

- **If `FIX-33` restored the strip as a component**, add the input directly to it.
- **If `FIX-33` restored it as inline markup in the shell**, extract it into
  `src/app/shared/ui/demo-notice/` with that input, and render the component where the
  markup was — `components.md:101` files `DemoNotice` under `shared / T10`, so the shared
  directory is where it belongs.

### 3. Render the second state

When `persistenceMode()` is `'memory'`, render a visibly distinct surface from the default
state, carrying the Hungarian sentence that a reload will not restore the demo. **The
wording is not this task's to invent** — see Evidence above. If the sentence has not been
supplied by the time this task runs, do not compose one: report the gap named in Evidence,
implement the branching and the distinct-surface structure with a placeholder that is
plainly marked as such in a code comment, and leave AC05 unmet with that reason recorded.
Do not claim data loss the application does not have — no order, cart or account is lost;
only the tab-scoped demo snapshot is not restored on reload.

### 4. Wire the value at the call site — only if FIX-10 has exposed it

`SessionStorageAdapter`'s `denied` flag (`src/mocks/persistence.ts:94`) is private today.
**If `FIX-10` has exposed a mode**, bind it at the call site. **If it has not**, leave the
input at its `'durable'` default at the call site, unit-test the `'memory'` state directly
(item 5), and record in the commit body that the state is **tested but not yet driven by
real state**, naming `FIX-10`. **Do not reach into `src/mocks/` to expose the flag
yourself** — that file belongs to `FIX-10`.

### 5. A spec asserting both arms against rendered DOM

`.claude/rules/code-standards.md` requires both arms of a new branch covered: with
`persistenceMode` `'durable'`, the default surface renders and the `'memory'` text is
absent; with `'memory'`, the distinct surface renders and its text differs from the
`'durable'` text.

## Out of scope

- **`src/mocks/**`.** `FIX-10` owns exposing the persistence mode. This task does not edit
  any file under `src/mocks/`.
- **The demo strip's existence, position and default-state copy.** `FIX-33`, under
  decision **D6**, builds the strip and its default state; this task only adds the second
  input and state to whatever `FIX-33` built.
- **`docs/spec/components.md`.** This task makes **no** specification edit.
  `components.md:101-113` already declares both the input and the two required states, so
  there is nothing to add.
- **Every other component `docs/spec/components.md` declares** — `AddToCart`,
  `ProductGallery`, `VariantSelector`, `MobileBuyRail` (`FIX-50`); `AsyncContent`,
  `AppliedFilters`, `CatalogToolbar`, `Pagination` (`FIX-60`); `AppFooter` (`FIX-64`);
  `DeliveryStep` (`FIX-56`).

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

```bash
npm run build                 # expected exit 0
npx vitest run <the DemoNotice spec>   # expected exit 0
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

- **R14 applies and is central**: no invented value. AC05 measures it — a sentence with no
  cited source fails the criterion.
- **R19 applies**: `'durable'` and `'memory'` are two distinct, drivable states. AC03 and
  AC04 measure it.
- **R26 applies**: the commit body names the grep that located `FIX-33`'s output, the
  Hungarian sentence with its source `file:line` (or the recorded absence), and whether the
  value is bound to real state or left at its default, naming `FIX-10`.
- R01–R13, R15–R18, R20–R25: N/A. The change adds no brand asset or imagery, no new colour,
  no new dialog, no filter or price behaviour, and reshapes no other component's signature.

## Acceptance criteria

- [ ] **FIX-70-AC01** `grep -nE "readonly [a-zA-Z]+ = input" <the DemoNotice component>.ts`
      shows `persistenceMode` with the union `'durable' | 'memory'` and the default
      `'durable'`. Record the file path the grep resolved to and how it was located.
- [ ] **FIX-70-AC02** **Real-browser check.** With the strip rendered on `/` at 1440, the
      default state renders and `list_console_messages` reports zero errors. Screenshot it.
- [ ] **FIX-70-AC03** **Real-browser or unit, and say which.** The `'memory'` state renders
      a visibly different surface from `'durable'` and its text differs. If **FIX-10** has
      exposed a persistence mode, drive the real state and screenshot both. If it has not,
      the state is **not reachable from the application** — name that, name FIX-10, and
      cover it with the unit case in FIX-70-AC04 instead. **Do not report this as passed on
      reasoning** and do not simulate the state by editing the component.
- [ ] **FIX-70-AC04** A spec asserts both arms against rendered DOM: `'durable'` renders no
      warning, `'memory'` renders one, and the two texts differ.
      `npx vitest run <that spec>` exits `0`; record the path, which depends on whether
      **FIX-06** has landed (see FIX-06's move table).
- [ ] **FIX-70-AC05** The Hungarian sentence is quoted in the commit body together with the
      source it came from — `docs/design/prototype.html` or `docs/spec/architecture.md` §8
      — by `file:line`. A sentence with no source fails this criterion. **Measured at the
      time this task was written: neither source carries a usable sentence** (see
      Evidence); if that is still true when this task runs, this criterion is reported
      unmet with that finding, not filled with invented copy.
- [ ] **FIX-70-AC06** `npm run build` exits `0`; `git status --short` lists only the paths
      this task's scope names and `docs/` lists nothing at all.
- [ ] **FIX-70-AC07** The `mi-bolt-design` R01–R26 record is in the commit body, per **D23**.
      **R14** (no invented value), **R19** (the two states are distinct) and **R26** are
      applicable and are what AC03 and AC05 measure; each N/A carries its one-sentence
      reason.

## Commit

This task is exactly one commit: the `DemoNotice` component's new input, its second
rendered state, the call-site binding (if `FIX-10` has landed) and the new spec. Do not
bundle it with `FIX-33`, `FIX-10`, `FIX-50` or any other FIX task.

**This task runs after `FIX-33`, then `FIX-10`.** If `FIX-33` has not landed, stop and
report rather than building a demo strip here. If `FIX-10` has not landed, this task still
lands, with the `'memory'` state unit-tested and not driven by real state, naming `FIX-10`
in the commit body.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```text
feat: give DemoNotice its persistenceMode input and memory-warning state
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.
