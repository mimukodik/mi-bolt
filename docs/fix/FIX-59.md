# FIX-59 — Finish the Angular-idiom sweep the earlier tasks left behind

Status: PARTIAL — all four prerequisites (`FIX-02`, `FIX-04`, `FIX-06`, `FIX-07`, `FIX-07b`,
`FIX-14`) had landed; items 1, 3 and 4 land exactly as specified, item 2 lands for the two named
images with one measured deviation, and item 6's two refutations are recorded without any file
change; worktree commit (sha filled in by the orchestrator after cherry-pick). Per-item detail:

- **Item 1** — the third `ChangeDetectionStrategy.OnPush` (`payment-progress.ts`) was already gone
  before this task ran, removed as a side effect of **FIX-61** landing (confirmed —
  `grep -n "ChangeDetectionStrategy" src/app/features/checkout/payment-progress.ts` returns
  nothing). The other two (`success-step.ts`, `order-receipt.ts`) are removed here, decorator line
  and import both. `grep -rn "ChangeDetectionStrategy" src` now prints nothing (AC01).
- **Item 2 — one measured deviation from AC02's exact count.** A third `<img>` has appeared since
  this document was written: `product-gallery.html:66`, a 20×20 thumbnail icon inside the gallery's
  index-image list, built by `FIX-45`/`FIX-50` after this document's evidence was gathered. It is
  **not migrated and not in this document's named scope** ("the two `<img>` elements" — only
  `product-image.html` and `featured-products.html` are named in "What to change"); reported as a
  finding rather than absorbed into this task or silently left unmentioned. `grep -rn "<img" src
  --include='*.html' --include='*.ts'` now returns **three** real elements, not the two AC02 states,
  because AC02 was written before that gallery markup existed. Both of the two the document does
  name are migrated to `[ngSrc]`/`fill`, per the Angular documentation's fill-mode contract
  (`position: relative` on the containing block, `object-fit` retained, no `width`/`height`) —
  verified against `https://angular.dev/guide/image-optimization#using-fill-mode` rather than
  assumed. `firstImageWidth`/`firstImageHeight` are deleted from `featured-products.ts`; `grep -rn
  "firstImageWidth\|firstImageHeight" src` prints nothing.
- **Item 3** — `catalog-page.html`'s `<section class="catalog">` now carries no Tailwind utility;
  `catalog-page.scss`'s `.catalog` block is the surviving declaration. **FIX-34 had already landed**
  and changed that block's values (padding split onto `:host`, `.catalog` left at `padding: 0`); per
  this document's own instruction ("If FIX-34 has already landed and set different values on
  `.catalog`, keep FIX-34's values and remove only the utilities"), FIX-34's SCSS is kept unchanged
  and only the HTML class attribute is edited here.
- **Item 4** — `resolveLazyResources()`, its docblock paragraphs and its three call sites are
  deleted from `src/app/app.routes.ts`. `grep -c "resolveComponentResources"` and `grep -c
  "resolveLazyResources"` both print `0`; `npm run test` exits `0` with the function gone (925
  tests across 62 files, measured directly, not assumed).
- **Item 6** — both refutations are recorded without touching either file: `src/core/bootstrap-demo.ts`
  is not relocated (`docs/spec/architecture.md:76` states it belongs there); `grep -rn "@ViewChild"
  src` returns nothing at all today, so **FIX-02** has already fully closed that item (the decorator
  this document expected to still find at `accessible-dialog.ts:78` is gone); and `FIX-14`'s
  out-of-scope section wrongly assigns `src/app/app.routes.ts:44-105` to `FIX-04` (`grep -n
  "app.routes\|resolveLazyResources" docs/fix/FIX-04.md` returns nothing, confirmed again here).

Open: **FIX-59-AC03, AC04 and AC06** are real-browser measurements deferred to the orchestrator's
batched browser-verification pass. AC02 is reported **not fully met** for the reason above (a third,
newer `<img>` exists and is out of this document's named scope) rather than silently marked passed.
Severity: major
Source: Review round item N7, carried over from round one. Recorded and deliberately not repaired in the out-of-scope sections of `FIX-14` and `FIX-15` and in `FIX-17`'s Evidence; this task is the owner of what survives a re-measurement.

## Why this is wrong

Four earlier tasks each found an idiom defect that sat outside their own boundary, wrote it
down, and said so in their out-of-scope sections — correctly, under `.claude/CLAUDE.md`
("Surgical changes"). Nobody was given them. This task is where they land.

The rules they break are the project's own, in the root `CLAUDE.md`:

- *"Do NOT set `changeDetection: ChangeDetectionStrategy.OnPush` explicitly. `OnPush` is
  the default in Angular v22+."* — three components set it.
- *"Use `NgOptimizedImage` for all static images."* — two `<img>` elements do not, and a
  third file's docblock already claims one of them does.

and two more the package's own findings name: a layout declared twice on one element, free
to drift apart, and a test-only compiler workaround living in production routing code.

**Two of the six recorded items are not repaired here, and the reason is measured, not
deferred.** Both are in "What to change" item 6.

## Evidence

### 1. Three explicit `ChangeDetectionStrategy.OnPush` declarations

```
src/app/features/checkout/success-step.ts:75:  changeDetection: ChangeDetectionStrategy.OnPush,
src/app/features/checkout/payment-progress.ts:142:  changeDetection: ChangeDetectionStrategy.OnPush,
src/app/features/checkout/order-receipt.ts:55:  changeDetection: ChangeDetectionStrategy.OnPush,
```

with the matching imports at `success-step.ts:42`, `payment-progress.ts:26` and
`order-receipt.ts:29`.

The installed Angular says the same thing the root `CLAUDE.md` says. `@angular/core`
**22.1.6**, `node_modules/@angular/core/types/_debug_node-chunk.d.ts:6721`, in the
`changeDetection` field's own documentation:

```
     * NOTE: OnPush is enabled by default.
```

The application is zoneless (`app.config.ts:25`, `provideZonelessChangeDetection()`), so
these three lines restate a default in three files and nowhere else, which is the
inconsistency that makes a reader wonder what is different about the other components.

### 2. Two `<img>` elements without `NgOptimizedImage`

`grep -rn "<img" src --include='*.html' --include='*.ts'` returns exactly two, and
`grep -rn "NgOptimizedImage\|ngSrc" src` returns exactly one line, which is a comment
claiming a behaviour that does not exist:

```
src/app/features/cart/cart-line.ts:6: *   - Product image (ProductImage primitive, lazy via NgOptimizedImage
```

`src/app/shared/ui/product-image/product-image.html:13-23`:

```html
      <img
        class="photo absolute inset-0 w-full h-full object-contain block"
        [src]="image().src"
        [alt]="image().alt"
        [attr.width]="image().width ?? null"
        [attr.height]="image().height ?? null"
        decoding="async"
        loading="lazy"
        data-testid="image-photo"
        (error)="onError()"
      />
```

`src/app/features/home/featured-products.html:48-56`:

```html
                            <img
                              [src]="src"
                              [alt]="firstImageAlt(slot.product)"
                              [attr.width]="firstImageWidth(slot.product)"
                              [attr.height]="firstImageHeight(slot.product)"
                              decoding="async"
                              loading="lazy"
                              data-testid="image-photo"
                            />
```

Both containers already establish a fixed box, which is what makes `fill` the right mode
rather than a guess. `product-image.html:1-3` sets `[style.aspect-ratio]` on a `relative`
root, and `featured-products.scss:71-83` does the same in CSS:

```scss
.featured__image {
  display: block;
  aspect-ratio: 4 / 5;
  position: relative;
  overflow: hidden;
}

.featured__image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
```

`fill` and `priority` are both inputs of the installed directive
(`node_modules/@angular/common/types/common.d.ts`, the `NgOptimizedImage` class: `fill:
boolean` and `priority: boolean`).

The `?? null` guards at the two helpers in `featured-products.ts:82-90` defend against a
value the wire contract makes mandatory: `src/app/api/generated/models/image.ts` declares
`width: number` and `height: number` as required, not optional. `product-image.html:17-18`'s
guards defend against a different, locally-declared type instead — `product-image.ts:13-18`
declares its own `ImageLike` with `readonly width?: number; readonly height?: number`, both
genuinely optional there rather than a wire-contract mismatch. Either way, `fill` mode
retires both guards.

### 3. One layout declared twice on one element

`FIX-17`'s Evidence records it and says neither it nor `FIX-14` reconciles it. Today, in
the inline template and inline styles of `catalog-page.ts`:

```
src/app/features/catalog/catalog-page.ts:67:    <section class="catalog flex flex-col gap-7 mx-auto p-6" data-layout-mode="sidebar">
```

```
src/app/features/catalog/catalog-page.ts:274-281:
      .catalog {
        display: flex;
        flex-direction: column;
        gap: var(--space-7);
        max-width: var(--layout-container-max);
        margin: 0 auto;
        padding: var(--space-6) var(--space-4);
      }
```

**The two do not agree**, which is why this is a defect and not a tidiness question.
`src/styles/tokens.css:45-48` gives `--space-6: 24px` and `--space-7: 32px`, while
Tailwind's `gap-7` is `1.75rem` and `p-6` is `1.5rem` on all four sides. The rendered
result therefore depends on which declaration the cascade picks, and nothing in either
file records which was intended.

**FIX-14 moves both halves into their own files verbatim**, so after it lands the same
pair lives at `catalog-page.html:1` and `catalog-page.scss:7-14`, plus the `1024px` media
query that follows the SCSS block (`catalog-page.ts:283-287` today).

### 4. A test-only compiler workaround in production routing code

`src/app/app.routes.ts:44-105` is `resolveLazyResources()`, a Node-only function that
walks the working directory from `process.cwd()` looking for template and stylesheet files
and feeds them to a private Angular API at `:104`:

```ts
  await core.ɵresolveComponentResources(resolver);
```

It is called from three lazy route callbacks (`:117`, `:132`, `:141`). The paragraph of
the file's leading docblock that describes it (`:30-42`) says why it exists: *"so vitest's Angular JIT compiler can drain the
`templateUrl` / `styleUrl` queue from disk after a dynamic import."* A `ɵ`-prefixed symbol
is Angular's marker for a private API with no compatibility guarantee, and this one is
reached by production routing code so that a test runner can work.

**Measured while this task was written, `FIX-14`'s out-of-scope section states that
`FIX-04` owns this. It does not.**
`grep -n "app.routes\|resolveLazyResources" docs/fix/FIX-04.md` returns nothing: FIX-04
rewrites `vitest.config.ts`, leaves the `test` target alone, edits two spec files and two
`package.json` scripts, and never touches `app.routes.ts`. That cross-reference is wrong
and is reported to the review round rather than corrected here.

## What to change

### 1. Delete the three `changeDetection` lines

In `src/app/features/checkout/success-step.ts`, `payment-progress.ts` and
`order-receipt.ts`: delete the `changeDetection: ChangeDetectionStrategy.OnPush,` line
from the `@Component` decorator, and delete `ChangeDetectionStrategy` from that file's
`@angular/core` import list. In `order-receipt.ts:29` the import is a single line holding
four symbols; remove only that one name.

Change nothing else in those three files. The runtime behaviour is identical, which is
what AC03 measures.

### 2. Migrate the two `<img>` elements to `NgOptimizedImage`, in `fill` mode

**`src/app/shared/ui/product-image/product-image.ts`** — add `NgOptimizedImage` to the
`imports` array, imported from `@angular/common`.

**`src/app/shared/ui/product-image/product-image.html:13-23`**:

```html
      <img
        class="photo object-contain"
        [ngSrc]="image().src"
        [alt]="image().alt"
        fill
        decoding="async"
        loading="lazy"
        data-testid="image-photo"
        (error)="onError()"
      />
```

**`src/app/features/home/featured-products.ts`** — add `NgOptimizedImage` the same way,
and **delete the now-unused `firstImageWidth` and `firstImageHeight` methods at `:82-90`**.
`grep -rn "firstImageWidth\|firstImageHeight" src tests e2e` shows their only callers are
the two template lines this change removes, so they are orphans this change creates and
`.claude/CLAUDE.md` ("Surgical changes") requires removing them.

**`src/app/features/home/featured-products.html:48-56`**:

```html
                            <img
                              [ngSrc]="src"
                              [alt]="firstImageAlt(slot.product)"
                              fill
                              decoding="async"
                              loading="lazy"
                              data-testid="image-photo"
                            />
```

Each decision, with its reason:

- **`fill`, not `width`/`height`.** `NgOptimizedImage` requires one or the other and
  rejects both together. Both containers already fix the box —
  `product-image.html:1-3`'s `[style.aspect-ratio]` on a `relative` root, and
  `featured-products.scss:71-76`'s `aspect-ratio: 4 / 5; position: relative` — so `fill`
  is the mode that matches what is already built, and it retires the `?? null` guards
  against a value the wire contract makes mandatory.
- **`object-contain` stays, the positioning utilities go.** With `fill`, the directive
  supplies the absolute positioning and the 100 % box; leaving `absolute inset-0 w-full
  h-full` beside it would be a third copy of a declaration something else already makes,
  which is the defect item 3 exists to remove. `object-contain` is not supplied by the
  directive and must stay.
- **`featured-products.scss:78-83` is left exactly as it is.** Plain CSS that agrees with
  the directive's inline styles is not the duplicate-declaration defect; it is a lower
  specificity fallback and removing it risks a layout change for no rule.
- **No `priority` is added.** The directive may log a console warning when it detects that
  an unmarked image is the page's largest contentful paint. A warning is not an error and
  does not fail this task. If one appears in the browser pass, add `priority` to the
  **first** featured slot only, re-measure, and record which image carries it in the
  commit body. Do not add it to `product-image.ts`, which renders in many contexts.

**`src/app/features/cart/cart-line.ts:6`** becomes true as a side effect. Leave the
comment alone — it was already describing the intended behaviour.

### 3. Reconcile the `.catalog` double declaration — the SCSS wins

**This task runs after `FIX-14`**, so the two halves are in their own files. In
`src/app/features/catalog/catalog-page.html:1`, reduce the class attribute to the semantic
class and the one attribute that is not layout:

```html
<section class="catalog" data-layout-mode="sidebar">
```

Leave `src/app/features/catalog/catalog-page.scss` untouched: its `.catalog` block and the
`1024px` media query below it are the surviving declaration.

**The SCSS wins and the utilities go, for three measured reasons.** The SCSS carries
`max-width: var(--layout-container-max)` and a `1024px` media query that no utility in the
class attribute expresses, so keeping the utilities instead would lose them. It is written
in the design system's own tokens, which `FIX-17` is moving the whole repository toward,
while `gap-7` (28 px) and `p-6` (24 px on all four sides) are raw Tailwind scale values
that match no token in `src/styles/tokens.css`. And `docs/spec/screens.md` and the
`mi-bolt-design` R06 rhythm are stated in those tokens, not in Tailwind's scale.

**This can change the rendered result, and that is expected.** AC06 requires the computed
values to be measured before and after and recorded. If **FIX-34** has already landed and
set different values on `.catalog`, keep FIX-34's values and remove only the utilities.

### 4. Remove the JIT resource workaround from `src/app/app.routes.ts`

Delete `resolveLazyResources()` (`:44-105`), the paragraphs of the file's leading
docblock that describe it (`:30-42`, leaving the `*/` at `:43` and the rest of the block
intact), and the three
`await resolveLazyResources();` calls at `:117`, `:132` and `:141`, leaving each lazy
`loadComponent` callback as the plain dynamic import it wraps.

**This runs after `FIX-04`, `FIX-06`, `FIX-07` and `FIX-07b`.** The function exists so the
node-environment `tests/**` suite can compile components with `templateUrl`; FIX-04 moves
the unit suite onto the official `@angular/build:unit-test` builder and FIX-06 co-locates
the specs under `src/`, at which point nothing needs the drain. **The proof is a
measurement, not an argument**: remove the call, run `npm run test`, and require exit 0.
If the suite goes red, the prerequisite has not actually landed — stop and report rather
than putting the function back with a comment.

`tests/setup-msw.ts:57-130` holds the same workaround for the other suite. It is not this
task's: `FIX-06` and `FIX-07b` own what happens to `tests/`.

### 5. The tests

- For item 1, no new test. Deleting a line that restates a default has no observable
  behaviour to assert, and the proof is the browser pass in AC03 plus a green suite.
- For item 2, in `src/app/shared/ui/product-image/product-image.spec.ts`, assert that the
  rendered `img` element carries a non-empty `src` attribute resolved from the input's
  value. `NgOptimizedImage` writes `src` from `ngSrc`, so asserting `src` proves the
  directive ran; asserting that the template contains the string `ngSrc` does not, and is
  the pattern `FIX-07` exists to remove.
- For item 4, no new test: `npm run test` exiting 0 with the function gone **is** the
  test, and AC07 records it.

### 6. Two recorded items that are NOT repaired here, and why

- **The `@ViewChild` at `src/app/shared/ui/accessible-dialog/accessible-dialog.ts:78` is
  `FIX-02`'s, not this task's.** `FIX-14`'s out-of-scope section lists it with the OnPush
  declarations and the images, but FIX-02 already owns the migration in detail — its own
  "What to change" replaces the decorator with `viewChild.required`, and its verification
  step requires `grep -rn "@ViewChild" src/` to print nothing. `grep -rn "@ViewChild" src`
  returns three lines today and all three are in that one file — the declaration at `:78`
  and two mentions of the decorator inside its own docblock at `:71` and `:73` — and
  `FIX-02` rewrites `:70-79` as a block, so it closes the item completely.
  **Touch it here and the two tasks collide over one line.**
- **`src/core/bootstrap-demo.ts` is NOT relocated, because the specification puts it
  there.** `FIX-15`'s out-of-scope section records A3 finding 11 as a live, unowned
  defect. It is not one. `docs/spec/architecture.md:76`, inside §7's source-structure
  listing, reads:

  ```text
  src/core/bootstrap-demo.ts      await mock hydrate/start, then Angular
  ```

  Under decision **D1** the specification is right and the code is right with it. Moving
  the file into `src/app/core/` would be a task overruling a spec document, which D1
  forbids. Record this in the commit body and report it: the finding is refuted, and
  the sentence in `FIX-15`'s out-of-scope section is one the review round should correct.

## Out of scope

- **`src/app/shared/ui/accessible-dialog/accessible-dialog.ts` — `FIX-02`.** See item 6.
- **`src/core/bootstrap-demo.ts` — nothing.** See item 6. Do not move it, do not
  "improve" it.
- **`tests/setup-msw.ts:57-130` — `FIX-06` and `FIX-07b`.** The same workaround for the
  other suite.
- **`vitest.config.ts` — `FIX-04`.** This task removes a caller of the JIT drain; it does
  not touch the runner configuration.
- **Every other hardcoded colour, spacing value and double declaration — `FIX-17`.** This
  task reconciles one element on one page, the one `FIX-17`'s Evidence recorded as owned
  by nobody. It introduces no new convention and it does not sweep the rest.
- **The centerline and the spacing scale — `FIX-34`.** If it has landed, keep its values.
- **`src/app/features/catalog/catalog-page.scss` and `catalog-page.ts`'s inline halves
  before `FIX-14` lands.** If FIX-14 has not landed, stop and report: editing the orphaned
  `.html` would change nothing, and editing the inline copy would collide with FIX-14.
- **`ProductImage`'s and `FeaturedProducts`' component contracts — `FIX-50` and
  `FIX-60`.** This task changes two `<img>` elements inside them; it changes no input,
  output or call site.
- **`src/app/features/checkout/payment-progress.ts` beyond its one `changeDetection`
  line — `FIX-61`.** That task wires the component in and reshapes it to
  `components.md:630-632`. Same file; never concurrent. Whichever lands second keeps both
  changes and says so in its commit body.
- **Any other idiom defect this sweep notices that is not named above.**
  `.claude/CLAUDE.md` ("Surgical changes"): *"Unrelated dead code gets mentioned, not
  deleted."* Put it in the commit body and stop.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

**Prerequisites: `FIX-02`, `FIX-04`, `FIX-06`, `FIX-07`, `FIX-07b` and `FIX-14` have all
landed.** Items 3 and 4 cannot be verified without them, and item 6 depends on FIX-02
having taken the `@ViewChild`. If any is missing, stop and report; do not work around it.

```bash
npm run build                # expected exit 0
npm run test                 # record the exit code; a failure attributable to FIX-04 does not
                             # fail this task, but item 4's proof is that this exits 0 once the
                             # JIT drain call is removed, and this task names no spec file of
                             # its own to fall back on
grep -rn "ChangeDetectionStrategy" src
                             # expected: no lines
grep -c "resolveComponentResources" src/app/app.routes.ts
                             # expected: 0
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Browser checks (mandatory — items 2 and 3 change what a person sees):

1. **Before changing item 3**, at 1440 open `http://localhost:4200/telefonok` and record
   `getComputedStyle(document.querySelector('.catalog'))` for `display`,
   `flexDirection`, `gap`, `maxWidth`, `margin` and `padding`. Repeat at 390. These are
   the "before" numbers AC06 compares against.
2. After the change, repeat step 1 and record the "after" numbers.
3. At 1440 open `/` and `/telefonok/demo-one-5g` and confirm every product image renders,
   that `list_console_messages` shows zero errors, and that the network log shows each
   image requested once.
4. Repeat step 3 at 390.

Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R04 applies and is the rule item 3 restores**: after the change `.catalog` is declared
  once, in tokens, and no raw scale value describes the page's layout.
- **R06 applies**: the surviving `.catalog` block uses `--space-6`, `--space-7` and
  `--space-4`, which are the rhythm's own values. Introduce no new number; AC06 records
  what the removal of the utilities changed.
- **R09 applies to item 2**: every product image keeps its intrinsic aspect ratio and its
  `object-contain` behaviour after the migration, and no image is stretched or cropped.
  Measure the rendered rects, not the CSS.
- **R12 applies to item 2**: the `alt` text on both images is unchanged, so the
  non-visual presentation of each product is exactly what it was.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R03, R05, R07, R08, R10, R11, R13–R25: N/A — beyond the two images and the one
  layout element, this change deletes three lines that restate an Angular default and one
  Node-only function from a routing file. It introduces no brand asset, font, copy, data
  source, state machine, focus behaviour or handoff artefact.

## Acceptance criteria

- [ ] **FIX-59-AC01** `grep -rn "ChangeDetectionStrategy" src` prints nothing.
- [ ] **FIX-59-AC02** `grep -rn "<img" src --include='*.html' --include='*.ts'` returns two
      lines, and each of those two elements carries `[ngSrc]` and `fill` and carries
      neither a `width` nor a `height` binding. `grep -rn "firstImageWidth\|firstImageHeight" src`
      prints nothing.
- [ ] **FIX-59-AC03** **Real-browser check: the three components still update.** At 1440,
      reach the review step and the success page by clicking through a purchase. The
      payment progress surface, the order receipt and the success step all render their
      live values, and `list_console_messages` reports zero errors. This is what proves
      deleting the three `changeDetection` lines changed no behaviour.
- [ ] **FIX-59-AC04** **Real-browser check: every image renders.** At 1440 and at 390, on
      `/` and on `/telefonok/demo-one-5g`, every product image element has a
      `naturalWidth` greater than 0 and a rendered `getBoundingClientRect().height`
      greater than 0. Zero console errors. Any `NgOptimizedImage` console **warning** is
      recorded in the commit body rather than ignored.
- [ ] **FIX-59-AC05** `grep -c "class=\"catalog\"" src/app/features/catalog/catalog-page.html`
      prints `1` and that attribute contains no Tailwind utility;
      `src/app/features/catalog/catalog-page.scss`'s `.catalog` block is byte-for-byte
      unchanged.
- [ ] **FIX-59-AC06** **Real-browser check: the catalogue layout, before and after.** The
      computed `display`, `flexDirection`, `gap`, `maxWidth`, `margin` and `padding` of
      `.catalog` at 1440 and at 390 are recorded from before and after the change, and the
      "after" values match the declarations in `catalog-page.scss`. Both sets go in the
      commit body. A difference is an accepted, recorded outcome; an unrecorded difference
      fails this criterion.
- [ ] **FIX-59-AC07** `grep -c "resolveComponentResources" src/app/app.routes.ts` prints
      `0`, `grep -c "resolveLazyResources" src/app/app.routes.ts` prints `0`, and
      `npm run test` exits **0** with the function gone.
- [ ] **FIX-59-AC08** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; this task names
      no spec file of its own, so if it has not landed, record that verbatim.
- [ ] **FIX-59-AC09** `src/app/shared/ui/product-image/product-image.spec.ts` contains a
      test asserting that the rendered `img` element's `src` attribute is non-empty and
      derives from the component's `image()` input.
- [ ] **FIX-59-AC10** The commit body states that `src/core/bootstrap-demo.ts` was **not**
      relocated, quotes `docs/spec/architecture.md:76` as the reason, and names
      the sentence in `FIX-15`'s out-of-scope section as one the review round should
      correct. It also states that the `@ViewChild` belongs to `FIX-02`, and that
      `FIX-14`'s out-of-scope section wrongly assigns `src/app/app.routes.ts:44-105` to
      `FIX-04`.
## Commit

This task is exactly one commit. The four items are one subject — the Angular idiom the
earlier tasks recorded and could not reach — and each is small enough that splitting them
would produce four commits a reviewer could not distinguish from one another. Do not
bundle it with any other FIX task, and in particular not with **FIX-02**, **FIX-14**,
**FIX-17**, **FIX-34** or **FIX-61**, each of which works in a file this task also touches.
Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
refactor: finish the Angular idiom sweep (OnPush, images, JIT shim)
```
