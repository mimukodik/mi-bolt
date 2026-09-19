# FIX-18 — Home quick-filter links 404 instead of filtering the catalogue

Status: PARTIAL — the three shortcuts now use `[queryParams]`; AC03 (href carries no `%3F`/`%3D`), AC05 (unit-test assertion, measured red against the old markup and green after), AC06 (`npm run build` exit 0) and AC07 (docblock corrected) all pass. Open: AC01, AC02 and AC04 are real-browser click-through criteria and this execution had no browser tool; deferred to the orchestrator's batched browser-verification pass.
Severity: blocker
Source: B3 F1 (orchestrator-confirmed at source), A3 finding 2, B1 F10.

## Why this is wrong

The three quick-filter links in the home hero are written as a string `routerLink`
that contains a query string. Angular treats a string `routerLink` as a URL **path**,
so it percent-encodes `?` and `=`; the rendered `href` is `/telefonok%3Fis5g%3Dtrue`,
which matches no route and lands on the application's own 404 page
(`src/app/features/not-found/not-found-page.html:3`, "Az oldal nem található").
`docs/spec/screens.md:41` requires "Shortcuts→canonical filters", and
`docs/spec/test-scenarios.md:25` (E019, `home` / `default`) expects "Use 5G then stock
shortcut → Expected query and matching results appear". This is also the most direct
possible failure of design rule R18 ("Keep list filtering, sorting, result count and
URL state consistent"): the link does not reach the list at all.

An earlier audit recorded these three shortcuts only as a **label** mismatch and never
clicked them. That is the lesson for the executor: the acceptance criterion for this
task is a **click**, not a read of the markup.

## Evidence

`src/app/features/home/hero.html:99-113` — the three links as they are today
(attributes reflowed here exactly as the file has them):

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

`src/app/features/home/home-page.ts:34-36` — a docblock that asserts a correctness the
code does not have:

```ts
 *   - `Hero` — dark charcoal hero (R02) with the H1, the lead copy,
 *     the primary CTA that opens the catalogue and three category
 *     shortcuts that set valid 5G / inStock URL filters.
```

The catalogue codec does accept those two parameter names, so the destination is right
and only the link form is wrong — `src/app/features/catalog/catalog-query.ts:166-176`
reads `inStock` and `is5g` and accepts exactly the strings `true` / `false`
(`parseBoolean`, `catalog-query.ts:95-100`).

`src/app/features/home/hero.ts:30` already imports `RouterLink`, so the corrected form
needs no new import: `queryParams` is an input of that same directive.

## What to change

**1. `src/app/features/home/hero.html`** — three links, three edits. Keep every class,
every `data-testid` and every label exactly as they are; change only the routing form.

```html
          <a
            routerLink="/telefonok"
            [queryParams]="{ is5g: true }"
            class="hero__shortcut"
            data-testid="shortcut-5g"
          >5G készülékek</a>
          <a
            routerLink="/telefonok"
            [queryParams]="{ inStock: true }"
            class="hero__shortcut"
            data-testid="shortcut-instock"
          >Készleten</a>
          <a
            routerLink="/telefonok"
            [queryParams]="{ is5g: true, inStock: true }"
            class="hero__shortcut"
            data-testid="shortcut-5g-instock"
          >5G + készleten</a>
```

The boolean `true` is serialised by the router as the string `true`, which is what
`parseBoolean` accepts. Do not write `'true'` as a quoted string and do not build the
URL by hand.

**2. `src/app/features/home/home-page.ts:34-36`** — correct the claim in the same
commit, so the comment describes what the code now does. Replace "three category
shortcuts that set valid 5G / inStock URL filters" with a sentence that names the
mechanism, for example: "three category shortcuts that navigate to `/telefonok` with
`is5g` / `inStock` query parameters". A comment that asserts a behaviour is part of the
defect when the behaviour is absent.

**3. Test.** `src/app/features/home/` has no spec file today; `tests/home-page.spec.ts` is
the file that covers this screen, and it already concatenates the hero's three files into a
`heroSource` constant (`tests/home-page.spec.ts:109-113`). Add one assertion there, in the
style that file already uses: `heroSource` matches `[queryParams]` three times and does not
match `/routerLink="[^"]*\?/` — a `routerLink` string containing a query. Do not create a
new spec file and do not move anything — `FIX-06` owns spec placement.

## Out of scope

- **The shortcut set and its labels.** `docs/spec/screens.md:35` requires the three
  shortcuts to be "Összes telefon, 5G készülékek, Raktáron"; the shipped set is
  "5G készülékek / Készleten / 5G + készleten". That content mismatch belongs to the
  home-page rebuild (`FIX-33`) and the UI-copy correction (`FIX-35`). Change no label
  here.
- Everything else in `hero.html` and in `home-page.ts`: the H1, the CTAs, the SVG, the
  missing demo banner, the featured grid. `FIX-33` owns the home page's fidelity.
- `home-page.ts` carries an inline `template:` and inline `styles:`. Do not extract them
  — `FIX-14` owns that. Touch only the docblock lines named above.
- The catalogue's own URL handling (`FIX-24`).

**This task must land before `FIX-33`, or be closed as moot by the orchestrator.**
`FIX-33` deletes the element that carries these three shortcuts and rebuilds two of the
three (`5G készülékek`, `Raktáron`) in a working `[queryParams]` form; the third,
`5G + készleten`, is not in `screens.md:35` and does not come back (`FIX-33.md:376-383`).
If this task has already landed by the time `FIX-33` runs, `FIX-33` keeps whatever
`[queryParams]` form this task used for the two surviving shortcuts and does not
re-invent it.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

```bash
npm run build              # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does
                            # not fail this task
```

Browser check (this is mandatory — the change is a link a person clicks):
`npm start` is not part of a sequential block — it is `ng serve` and never exits, so a
literal run of a block that includes it hangs. Start it separately, in the background,
before the checks below, and stop it when finished.

Then, at viewport width 1440, open `http://localhost:4200/`, click each of the three
shortcuts in turn (`[data-testid="shortcut-5g"]`, `[data-testid="shortcut-instock"]`,
`[data-testid="shortcut-5g-instock"]`), and after each click read `window.location.href`
and the visible result count. Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R18 applies and is the rule this task restores** — filtering, result count and URL
  state must agree.
- **R20 applies**: the three shortcuts are anchors and must stay keyboard-operable with a
  visible focus ring after the edit.
- **R12 applies**: the Hungarian labels are unchanged by this task.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R11, R13–R17, R19, R21–R25: N/A — this change alters no colour, spacing, type,
  image, price, state surface or target size; it replaces one routing expression.

## Acceptance criteria

- [ ] **FIX-18-AC01** At 1440, clicking `[data-testid="shortcut-5g"]` on `/` leaves the
      browser at a URL whose path is `/telefonok` and whose query contains `is5g=true`;
      `[data-testid="catalog-grid"]` is present in the DOM and the page does **not**
      contain the text "Az oldal nem található".
- [ ] **FIX-18-AC02** The same click test passes for `[data-testid="shortcut-instock"]`
      (query contains `inStock=true`) and for `[data-testid="shortcut-5g-instock"]`
      (query contains both `is5g=true` and `inStock=true`).
- [ ] **FIX-18-AC03** For each of the three links, the rendered `href` read from the DOM
      (`document.querySelector('[data-testid="shortcut-5g"]').getAttribute('href')`)
      contains no `%3F` and no `%3D`.
- [ ] **FIX-18-AC04** After each of the three clicks the visible result count
      (`[data-testid="result-count"]`) is present and reports a number, and that number is
      less than or equal to the unfiltered count shown at `/telefonok` with no query.
      Record all four numbers in the commit body; no expected value is fixed here because
      none is stated in the specification or measured in the baseline.
- [ ] **FIX-18-AC05** `tests/home-page.spec.ts` contains an assertion over its existing
      `heroSource` constant that `[queryParams]` appears three times and that no
      `routerLink` string value contains `?`; `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/home-page.spec.ts` instead.
- [ ] **FIX-18-AC06** `npm run build` exits 0.
- [ ] **FIX-18-AC07** The docblock at `src/app/features/home/home-page.ts:34-36` no longer
      claims the shortcuts "set valid ... URL filters" in the old wording, and describes
      the query-parameter mechanism actually used.

## Commit

This task is exactly one commit. Do not bundle it with any other FIX task. Commit only
after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style
(`git log --oneline -20`):

```
fix: home quick-filter shortcuts use queryParams instead of an encoded path
```
