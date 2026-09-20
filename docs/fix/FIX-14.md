# FIX-14 — Move the three inline templates and styles into their own files

Status: DONE — c37def1. The extraction landed and is byte-faithful; AC05's stale line ranges were a defect in this document's own verification text, not in the code, verified against the tree 2026-09-20.
Severity: major
Source: A6 group 1 (1.1, 1.2, 1.3), with two of A6's claims corrected against the
repository — see Evidence.

## Why this is wrong

The project's own rule, restated by the user in this run:

> "angular component 3 fájlból álljon html, ts, scss(ha szükséges)"

("an Angular component should consist of 3 files: html, ts, scss (if needed)").

Exactly **3** production components out of 48 carry an inline `template:` or `styles:`
block; the other 45 use `templateUrl` / `styleUrl`. Two of those three have a `.html` and a
`.scss` file already sitting beside them, written, drifted and never referenced — the
repository is carrying both forms of the same component at once. Under D1 the rule is right
and the code is wrong.

This task moves the markup. It changes no rendered output, and that is its own acceptance
criterion.

## Evidence

### The count

Measured on `db6d295`: 48 production components, of which 3 declare `template:` or
`styles:` inline. Every other `template:` / `styles:` hit in `src/` is inside a `.spec.ts`
test host and is out of scope.

### Violation 1 — `src/app/home/home-page.ts:15-50`

```ts
@Component({
  selector: 'app-home-page',
  template: `
    <main class="home">
      <h1>MiBolt</h1>
      <p>Üdvözöl a MiBolt demó.</p>
    </main>
  `,
  styles: [
```

`src/app/home/home-page.html` (4 lines) and `src/app/home/home-page.scss` (2 lines) exist
beside it and are never referenced.

**This component is also entirely dead, and FIX-15 owns deleting it.** Do not extract it,
do not touch `src/app/home/` at all in this task. It is listed here only so the executor
knows why the sweep leaves one of the three violations behind: a file that is about to be
deleted does not need its template extracted first. Say so in the commit body.

### Violation 2 — `src/app/features/home/home-page.ts:45-66`

```ts
@Component({
  selector: 'app-home-page',
  imports: [Hero, FeaturedProducts, HowDemoWorks],
  template: `
    <app-hero data-testid="hero" />
    <app-featured-products
      data-testid="featured"
      [slots]="slots()"
      (retryRequested)="retryFeatured()"
    />
    <app-how-demo-works data-testid="how-demo-works" />
  `,
  styles: [
    `
      :host {
        display: block;
        background: var(--color-surface-light);
        color: var(--color-text-primary);
      }
    `,
  ],
})
```

This is the **live route target**: `src/app/app.routes.ts:115-119` lazy-loads
`./features/home/home-page` for `path: ''`. It has no `.html` and no `.scss` beside it —
`ls src/app/features/home/` lists `featured-products.{ts,html,scss}`, `hero.{ts,html,scss}`,
`how-demo-works.{ts,html,scss}` and `home-page.ts` alone. Both files have to be created.

**A6's claim about this file is wrong and the correction matters.** A6 1.2 reports that
*"Its doc comment (9-14) justifies the inlining as needed 'so the JIT compiler can resolve
this component during vitest runs'."* That sentence is not in this file. Lines 1-44 of
`src/app/features/home/home-page.ts` are imports, the `DOCUMENTED_FEATURED_SLUGS` constant
and a docblock describing the three child components; the words "JIT" and "vitest" do not
appear anywhere in it. The justification A6 quoted lives in a **different file**,
`src/app/home/home-page.ts:9-13` — the dead placeholder of violation 1:

```ts
 * The template and styles live inline so the JIT compiler can resolve
 * this component during vitest runs (the lazy import queues the
 * component after `tests/setup-msw.ts` has already drained the
 * templateUrl resolution queue, so external `templateUrl` /
 * `styleUrl` references cannot be fetched).
```

So the live home page carries **no justification at all** for being inline. That makes the
extraction easier to argue, not harder. A6's counter-argument stands on its own either way:
every other lazy-loaded route component — `CatalogPage`, `ProductPage`, `CartPage` and all
of `checkout.routes.ts` — uses `templateUrl` / `styleUrl` and is equally lazy, with no
special-casing. And **FIX-04** removes the basis for that justification entirely, since it
owns the hand-rolled vitest resource-resolution machinery the quoted sentence depends on
(`tests/setup-msw.ts:57-130` and the `ɵresolveComponentResources` call at
`src/app/app.routes.ts:104`).

### Violation 3 — `src/app/features/catalog/catalog-page.ts:55-596`

The largest in the tree: a 198-line inline `template:` (`:66-265`) and a 326-line inline
`styles:` block (`:266-595`), inside an 859-line file. `catalog-page.html` (197 lines) and
`catalog-page.scss` (325 lines) exist, are never referenced by the component, and **have
drifted from the inline copies**.

**The drift is measured, not asserted.** Comparing the inline template at `:67-264`
(de-indented by four spaces) against `catalog-page.html`:

```
12c12
<   <div class="layout gap-6">
---
>   <div class="layout grid gap-6">
198c198
< </section>
---
> </section>
\ No newline at end of file
```

Four differing lines in total: **one real difference** — the orphaned file's element also
carries the Tailwind `grid` utility, the inline one does not — plus a missing trailing
newline.

Comparing the inline `styles:` block at `:268-593` (de-indented by six spaces) against
`catalog-page.scss`: 28 differing lines, **all of them re-ordering rather than content**.
The `.grid` and `.grid--refreshing` rules sit before the media queries inline and after
them in the file; the `.sidebar { display: block; }` rule moves by seven lines. Rule order
decides the cascade between equal-specificity selectors, so this is not a cosmetic
difference and the files are **not** a drop-in replacement.

## What to change

Two components. `src/app/home/` is deliberately not one of them.

### Decision, made here so the executor does not have to make it

**The inline copy is the source of truth in every case.** It is what the running
application renders today, and the whole point of this task is that nothing a person sees
changes. Where an orphaned file already exists, it is **overwritten** with the extracted
inline content rather than reconciled by hand or adopted as-is. The orphaned files are a
starting point for reading, not for copying.

**This task also owns the orphaned-pair defect the review round found separately, and the
user ruled on it as `DECISIONS.md` D24: "FIX-14 kapja meg" ("FIX-14 takes it").** Commit
`1ae1b1c` created `catalog-page.html` (197 lines) and `catalog-page.scss` (325 lines)
without ever wiring them in — `catalog-page.ts` still declares an inline `template:` at
`:66` and `styles:` at `:266` and no `templateUrl` / `styleUrl`, so neither file compiles
into anything, and the live markup and styles are the inline copies at `:69-73` and
`:295-320`. Section 2 below, which overwrites both orphaned files and points
`catalog-page.ts` at them, is what closes this defect; no separate step is needed. Two other
task files cited the dead copy as evidence — `FIX-55.md:72` and `FIX-45.md:408-410` — and
are corrected by the same review round, outside this task.

### 1. `src/app/features/home/home-page.ts` — create both files

Create `src/app/features/home/home-page.html` containing exactly the template body from
`:49-55`, de-indented so the first element starts at column 0:

```html
<app-hero data-testid="hero" />
<app-featured-products
  data-testid="featured"
  [slots]="slots()"
  (retryRequested)="retryFeatured()"
/>
<app-how-demo-works data-testid="how-demo-works" />
```

Create `src/app/features/home/home-page.scss` containing exactly the style body from
`:59-63`, de-indented:

```scss
:host {
  display: block;
  background: var(--color-surface-light);
  color: var(--color-text-primary);
}
```

In `home-page.ts`, replace the `template:` and `styles:` properties (`:48-65`) with:

```ts
  templateUrl: './home-page.html',
  styleUrl: './home-page.scss',
```

The `./`-relative form is what all 45 clean components use; A6 1.4 records zero violations
of it. Keep `selector`, `imports` and the class body untouched.

### 2. `src/app/features/catalog/catalog-page.ts` — overwrite both files

Write `src/app/features/catalog/catalog-page.html` with the template body from `:67-264`,
de-indented by the four spaces the inline literal carries, ending with a trailing newline.
The one line that differs from the current file content is line 12: keep the **inline**
form, `<div class="layout gap-6">`, not the orphaned file's `<div class="layout grid gap-6">`.

Write `src/app/features/catalog/catalog-page.scss` with the style body from `:268-593`,
de-indented by the six spaces the inline literal carries, ending with a trailing newline.
Keep the **inline** rule order, which puts `.grid` and `.grid--refreshing` before the media
queries.

In `catalog-page.ts`, replace the `template:` and `styles:` properties (`:66-595`) with:

```ts
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.scss',
```

Keep `selector` and the `imports` array exactly as they are. The file drops from 859 lines
to roughly 330; that number is an observation, not a target, and nothing checks it.

**Do not edit the extracted markup while moving it.** Not the Tailwind utility classes, not
the duplicated `.catalog` layout declaration (the template carries
`class="catalog flex flex-col gap-7 mx-auto p-6"` and the styles declare the same layout
again as `.catalog { display: flex; flex-direction: column; gap: var(--space-7); … }`), not
the `data-testid` attributes, not a single whitespace beyond the de-indent. That duplicated
layout is a real defect, it is named in **FIX-17**'s evidence as an instance of a pattern,
and it is not this task's to fix. A move that also edits is a move nobody can verify.

### How to check the extraction was faithful, before running anything

The de-indent is the only transformation. Verify it with a diff rather than by eye, from
the repository root, using the line ranges of the **pre-change** `catalog-page.ts`:

```bash
diff <(git show HEAD:src/app/features/catalog/catalog-page.ts | sed -n '67,264p' | sed 's/^    //') \
     src/app/features/catalog/catalog-page.html
```

That must report nothing. Writing the file with a trailing newline, as "What to change"
requires, makes the pre-change extraction and the file on disk byte-identical, so an empty
diff — not a trailing-newline-only diff — is the correct, passing result. The same shape
works for the styles with `'268,593p'` and `sed 's/^      //'`, and for the home page with
`'49,55p'` / `'59,63p'`.

## Out of scope

- **`src/app/home/` — FIX-15.** Three dead files. Do not extract, do not delete, do not
  touch.
- **Deleting the now-superseded orphaned files.** There is nothing left to delete after
  this task: `catalog-page.html` and `catalog-page.scss` stop being orphans the moment
  `catalog-page.ts` points at them. FIX-15's line about deleting them applies only if this
  task has **not** run; the two tasks must not both act on those two files. If FIX-15 has
  already deleted them, recreate them here from the inline content — the extraction is the
  same either way.
- **The duplicated Tailwind-and-SCSS layout declarations — FIX-17** names the pattern and
  **FIX-19** fixes the two shared primitives that show it worst.
- **The `ɵresolveComponentResources` machinery at `src/app/app.routes.ts:44-105` —
  `FIX-59`.** And the JIT resource resolver at `tests/setup-msw.ts:57-130` — `FIX-06`.
  This task does not remove either and does not depend on their removal.
- **`src/app/features/not-found/not-found-page.ts`, which has a `.ts` and a `.html` but no
  `.scss`.** A different shape of the same rule; FIX-15 flags it and **FIX-41** owns
  fixing it. Do not create a stylesheet for it here.
- **The three explicit `ChangeDetectionStrategy.OnPush` declarations and the two `<img>`
  tags without `NgOptimizedImage`** that A6 group 2 records — **FIX-59** owns them. **The
  one `@ViewChild`** that A6 group 2 also records — **FIX-02** owns it. Angular idiom, not
  file structure; this task does not touch either.
- **Any behaviour, any binding, any class member.** This task moves text between files.
- **The catalogue's 1×1 search input and hidden commit button — `FIX-43`.** They are
  inside the block this task moves and they move with it, unedited. `FIX-43` deletes
  them from wherever they then live, which is `catalog-page.html:183-197` once this
  task has run. Do not delete them here and do not "tidy" them on the way: a move that
  also edits is a move nobody can verify, which is this task's own rule.

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

1. The two `diff` commands above — must report nothing; an empty diff is what a
   byte-faithful extraction ending in a trailing newline produces.

2. `npm run build` — must exit `0`. Green at the `db6d295` baseline. This is the check that
   catches a broken `templateUrl` path or a template that no longer parses.

3. `npx vitest run tests/home-page.spec.ts tests/layouts.spec.ts` — must exit `0`.

4. Run `npm run test` before your first edit and again after your last, and record both
   coverage figures in the commit body. There is no target number: the pair is the
   evidence that this task did not reduce coverage, and **FIX-08** is what turns the
   thresholds into a gate. Do not carry the 56.42 % figure forward — it was measured by
   `npm run test:unit:coverage` over the 30 specs under `tests/` only, a runner and a
   denominator that no longer exist, so it cannot be compared with anything `ng test`
   reports.

   (`src/app/features/catalog/catalog-page.spec.ts` covers the catalogue component and
   is one of the specs `npm run test` executes. That command fails 14/14 at the baseline
   for a reason **FIX-04** owns. Do not treat its red as this task's.)

5. The browser run described in FIX-14-AC01. Start the app with `npm start` and drive it
   through a real browser per `.claude/rules/browser-verification.md`; the agent takes the
   screenshots, the snapshots and the console reads, and the orchestrator starts and stops
   the server.

Gates that are red for reasons this task does not fix, so the executor does not chase them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**). Do not run `npm run api:drift` or `npx playwright test` while working on this task: both rewrite tracked files and leave the working tree dirty.

## Acceptance criteria

- [ ] **FIX-14-AC01** **Real-browser check, mandatory — this is the criterion that proves
      the move changed nothing.** At viewport width 1440, screenshot `/` and `/telefonok`
      **before** the change and again **after** it, and compare the two pairs. The rendered
      result is identical: same hero, same four featured cards, same filter sidebar, same
      three-column product grid, same applied-filter chips. On `/telefonok`, exercise the
      change's surface rather than only looking at it — type into the search field, toggle a
      filter, change the sort — and confirm the grid updates and the URL query string
      changes as it did before. `list_console_messages` reports zero errors on both routes.
- [ ] **FIX-14-AC02** **Real-browser check.** On `/telefonok` at viewport width 1440,
      `getComputedStyle(document.querySelector('.catalog')).display` returns `flex` and
      `.gap` returns `32px` (the `--space-7` value at `src/styles/tokens.css:48`). This is
      the measurement that catches a lost or re-ordered SCSS rule, which is the specific
      risk the drift in Evidence created.
- [ ] **FIX-14-AC03** `grep -rn "template:\|styles:" src/app --include=*.ts` returns
      matches only in `.spec.ts` files and in `src/app/home/home-page.ts`. Two of the three
      production violations are gone; the third is FIX-15's to delete and is named in the
      commit body.
- [ ] **FIX-14-AC04** `src/app/features/home/home-page.ts` and
      `src/app/features/catalog/catalog-page.ts` each contain exactly one `templateUrl:`
      and one `styleUrl:`, both using the `./`-relative form, and
      `src/app/features/home/home-page.html`, `src/app/features/home/home-page.scss`,
      `src/app/features/catalog/catalog-page.html` and
      `src/app/features/catalog/catalog-page.scss` all exist.
- [ ] **FIX-14-AC05** The extracted content is byte-faithful after the de-indent. Both
      `diff` commands from "How to verify" step 1 report nothing at all, and that empty
      output is recorded in the commit body.
- [ ] **FIX-14-AC06** `npm run build` exits `0` and `npm run test` exits `0`,
      both unchanged from the `db6d295` baseline.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/home-page.spec.ts tests/layouts.spec.ts` instead.
- [ ] **FIX-14-AC07** `git status --short` lists exactly six paths: the two modified `.ts`
      files, the two new home-page files, and the two overwritten catalogue files. Nothing
      under `src/app/home/`, nothing under `tests/`.
- [ ] **FIX-14-AC08** Design rules recorded in the commit body. **Applicable and met, by
      the before/after screenshot pair in FIX-14-AC01 rather than by assertion: R02**
      (dark header and footer with light shopping surfaces), **R05** (shared centerline,
      desktop content width not exceeding 1320 px — `--layout-container-max` at
      `src/styles/tokens.css:83` is the value the `.catalog` rule uses and it must survive
      the move), **R06** (4 px spacing system in 8 px increments — FIX-14-AC02 measures it),
      **R11** (product images not stretched or cropped; the catalogue grid is the surface
      that shows it), **R18** (list filtering, sorting, result count and URL state
      consistent — exercised in FIX-14-AC01), **R19** (loading, error, empty and success
      remain distinct states, which the moved `LoadingState` / `ErrorState` / `EmptyState`
      branches must still render), and **R26** (the commit body names every file, the diff
      output, the commands and their exit codes, and the two limitations: the third inline
      violation is left for FIX-15, and the duplicated layout declarations were moved
      unchanged for FIX-17). R01, R03, R04, R07–R10, R12–R17 and R20–R25 are **N/A: this
      task relocates markup and styles verbatim, so no colour, token, copy, price, state
      machine or interaction is introduced, removed or altered** — and the identical
      screenshots are what makes that an observation rather than a claim. Skill provenance
      is stated once in `docs/fix/README.md` section 3, "Every task records the design
      rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.
- [ ] **FIX-14-AC09** The orphaned-pair defect (`DECISIONS.md` D24) is closed:
      `grep -c "templateUrl\|styleUrl" src/app/features/catalog/catalog-page.ts` returns
      `2`, and `grep -c "template:\|styles:" src/app/features/catalog/catalog-page.ts`
      returns `0`. `catalog-page.html` and `catalog-page.scss` are the files those two
      properties point at — the same two files that were orphaned before this task ran,
      not new ones.

## Commit

This task is exactly one commit. Do not bundle it with FIX-15, FIX-16, FIX-17 or any other
FIX task, even though FIX-15 touches files in the same two directories. Commit only after
every acceptance criterion above passes, including the browser check.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`, for example `refactor: extract inline templates/styles into
HTML/SCSS files`, which is commit `1ae1b1c` and did this same work for other components):

```text
refactor: move home and catalogue templates/styles out of the TS files
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

Nothing has to land before this one.

**FIX-15 must land after it**, because FIX-15 deletes `catalog-page.html` and
`catalog-page.scss` as orphans and this task makes them live. If the two run in the wrong
order, FIX-15 deletes the files FIX-14 needs. Both files say so.

**FIX-43 must land after it**, and this is the harder of the two orderings to see.
FIX-43 deletes the catalogue's 1×1 search input and hidden commit button from
`catalog-page.ts:249-263`, plus the blank line at `:248`. This task's extraction diff
(`FIX-14-AC05`) is pinned to the pre-change range `sed -n '67,264p'`, and with those
sixteen lines gone the inline template ends at `:248` and its closing backtick sits at
`:249`, so the range would drag the backtick, `styles: [` and fourteen lines of SCSS
into `catalog-page.html`. `npm run build` would very likely still pass; only
`FIX-14-AC01`'s before/after screenshot and `FIX-14-AC05`'s empty diff would catch it.
Landing this task first also removes the reason FIX-43 was written to edit two copies
of the same markup: afterwards there is one. Confirm before starting:
`grep -c 'data-testid="catalog-search"' src/app/features/catalog/catalog-page.ts` must
print `1`. If it prints `0`, FIX-43 has already landed — stop and report rather than
guessing a new range.
