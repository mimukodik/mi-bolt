# FIX-67 — Move `AsyncStatus` out of the price-block primitive into a shared home

Status: PLANNED — not executed.
Severity: minor
Source: Decision **D15**, item 11 (the FIX-54..FIX-61 unowned-defect sweep); `docs/spec/components.md:7`; `src/app/shared/ui/price-block/price-block.ts:3`; `src/app/shared/ui/index.ts:5`.

## Why this is wrong

`docs/spec/components.md:7` declares `AsyncStatus` under the document's "## Shared types"
heading, in the same sentence as `CatalogFilters`, `CatalogQuery`, `UiProblem` and
`FilterIdentity` — types with no single owning component:

> `AsyncStatus = idle | loading | success | empty | error`

The implementation instead declares it inside one presentation primitive,
`src/app/shared/ui/price-block/price-block.ts:3`:

```ts
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';
```

and re-exports it from the primitives barrel, `src/app/shared/ui/index.ts:5`:

```ts
export { PriceBlock, type AsyncStatus, type Money } from './price-block/price-block';
```

`PriceBlock` needs `AsyncStatus` for exactly one of its own three inputs
(`components.md:150`: `money:Money|null; label:string; status:AsyncStatus`). Six
specification entries declare a `status` or `saveState` input of type `AsyncStatus`, and
`PriceBlock` is only one of them:

| Component | `components.md` line | Status of the component today |
|---|---|---|
| `PriceBlock` | `:150` | exists — declares `AsyncStatus` |
| `AsyncContent` | `:195` | does not exist yet — **FIX-60** builds it |
| `FeaturedProducts` | `:285` | signature drift — unowned |
| `CatalogToolbar` | `:375` | does not exist yet — **FIX-60** builds it |
| `ContactStep` | `:555` | signature drift — **FIX-63** owns it |
| `DeliveryStep` | `:570` | signature drift — **FIX-56** owns it |

A type five other component contracts need is declared inside the one primitive that
happens to have been built first. `UiProblem`, the shared type declared in the same
sentence of `components.md:7`, already has the home this task gives `AsyncStatus`:
**FIX-50** creates it at `src/app/shared/types/ui-problem.ts`, and **FIX-60** declares
`FilterIdentity` beside it in the same directory. This task is the third file in that
directory, not the first.

## Evidence

### Today's three touchpoints — every current importer, measured

```
$ grep -rln "AsyncStatus" src --include="*.ts"
src/app/shared/ui/index.ts
src/app/shared/ui/price-block/price-block.spec.ts
src/app/shared/ui/price-block/price-block.ts
```

No component outside `price-block/` imports `AsyncStatus` today — the five other
specification entries that need it are either not yet built (`AsyncContent`,
`CatalogToolbar`) or not yet given their declared inputs (`ProductGallery`, `ContactStep`,
`DeliveryStep`). That is exactly why this task has to land now: every one of those five is
either an in-flight task in this package or a future one, and each of them is one step
closer to importing `AsyncStatus` from `price-block.ts` — the wrong home — if this task
does not move it first.

Three files touch it directly and this task edits all three:

1. `src/app/shared/ui/price-block/price-block.ts:3` — the declaration.
2. `src/app/shared/ui/index.ts:5` — the barrel re-export.
3. `src/app/shared/ui/price-block/price-block.spec.ts:4` —
   `import type { AsyncStatus } from './price-block';`.

### `src/app/shared/types/` does not exist yet, and that is expected

```
$ ls src/app/shared/types/
ls: src/app/shared/types/: No such file or directory
```

**FIX-50** and **FIX-60** both plan to create this directory for their own files
(`ui-problem.ts`, then `FilterIdentity` beside it); neither has landed, so it does not
exist yet. This task also creates a file inside it. Whichever of the three lands first
creates the directory; the other two add a sibling file to it. The three files never
collide — `async-status.ts`, `ui-problem.ts` and the `FilterIdentity` declaration inside
`FIX-60`'s own new file are three different names — so no ordering constraint applies
between this task and either of them.

### `FIX-56`, `FIX-60` and `FIX-63` all import `AsyncStatus`, and this task lands first

Three sibling tasks import `AsyncStatus` into a component they are writing: **FIX-56**
(`DeliveryStep`), **FIX-60** (the extracted `AsyncContent` and `CatalogToolbar`,
`FIX-60.md:173` and `:218`) and **FIX-63** (`ContactStep`). **This task lands before all
three**, so each of them imports from `src/app/shared/types/async-status.ts` in its own
first commit and no second commit is needed to repair an import. `FIX-56.md:187-199`
already carries a two-branch instruction that resolves to exactly that path once this
task has landed, and needs no further change. Item 5 of "What to change" below stays as a
safety net for the case where the order was not held.

## What to change

### 1. `src/app/shared/types/async-status.ts` — the new shared home

Create the directory if `FIX-50` or `FIX-60` has not already created it, and add:

```ts
/** `docs/spec/components.md:7` — the async lifecycle shared by every component
 *  that renders a loading / success / empty / error surface. */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';
```

### 2. `src/app/shared/ui/price-block/price-block.ts` — consume, do not declare

Delete line 3 (`export type AsyncStatus = …`) and add an import at the top of the file:

```ts
import type { AsyncStatus } from '../../types/async-status';
```

`PriceBlock` keeps its own `status = input<AsyncStatus>('idle')` unchanged; only where the
type comes from changes. `Money` is `PriceBlock`'s own type (the OpenAPI-generated SDK
shape, kept local by the file's own comment at `:5-8`) and is **not** moved — only
`AsyncStatus` is a shared type under `components.md:7`.

### 3. `src/app/shared/ui/index.ts:5` — the barrel stops re-exporting it

```ts
export { PriceBlock, type Money } from './price-block/price-block';
```

**No compatibility re-export is added anywhere for the old path.** `AsyncStatus` never had
a published consumer outside this repository, every current importer is fixed in this same
commit (item 2 and item 4), and `.claude/rules/code-standards.md` ("A cut feature leaves
nothing behind") forbids a shim kept only so an old import keeps compiling. A future
component that needs `AsyncStatus` imports
`import type { AsyncStatus } from 'src/app/shared/types/async-status';` (or the matching
relative path), the same way `FIX-50` and `FIX-60` import `UiProblem` and declare
`FilterIdentity` — directly from `shared/types/`, not through the `shared/ui` barrel.
`UiProblem` is not re-exported from that barrel either; this brings `AsyncStatus` in line
with it.

### 4. `src/app/shared/ui/price-block/price-block.spec.ts:4` — the test's own import

```ts
import type { AsyncStatus } from '../../types/async-status';
```

### 5. If `FIX-56` has already landed when this task runs

Check first: `grep -n "AsyncStatus" src/app/features/checkout/delivery-step.ts`. If it
returns a line importing from `'../../shared/ui'`, that import now fails to compile once
item 3 above lands — `FIX-56.md:187-189` told its executor to write exactly that import
and forbade moving the type. Fix the one line in this task's own commit:

```ts
import type { AsyncStatus } from '../../shared/types/async-status';
```

This is a downstream consumer fix, not a second declaration and not a functional change to
`delivery-step.ts`, so it belongs in this task's commit rather than in a second one. If
`FIX-56` has not landed yet, do nothing here — its own executor reads the corrected
pointer in `docs/fix/README.md` section 4's one-file collision table (the
`src/app/shared/ui/index.ts` and `AsyncStatus`'s home row) and imports from the new
location directly.

## Out of scope

- **Building `AsyncContent`, `CatalogToolbar`, `ContactStep` or giving `ProductGallery` and
  `DeliveryStep` their declared inputs — `FIX-60`, `FIX-63`, `FIX-50`, `FIX-56`.** This task
  only relocates the type declaration; none of those five components is created or edited
  here beyond the one conditional line in item 5.
- **`UiProblem` and `FilterIdentity`.** Already own their files or their planned files
  (`FIX-50`, `FIX-60`). Not touched here.
- **`Money`.** Stays declared in `price-block.ts`; it is not a `components.md:7` shared
  type, it is the SDK's own wire shape kept local by that file's existing comment.
- **Any other member of `price-block.ts`** — `PriceBlock`'s inputs, its template, its
  styles, `formatHuf`. Unchanged.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`),
`npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41
failures (`FIX-09`).

No prerequisite of its own — its files are `price-block.ts`, `price-block.spec.ts`, the
barrel and one new file, so nothing has to land before it. **It lands before `FIX-56`,
`FIX-60` and `FIX-63`**, each of which imports `AsyncStatus` into a component it is
writing, so putting it first costs nothing and lets each of the three import from
`src/app/shared/types/async-status.ts` in its own first commit. `FIX-50` shares
`src/app/shared/types/` for an unrelated file (`ui-problem.ts`) and either order against
it is safe — see "Evidence" for why none of the three shared-directory writers collide.
See "What to change" item 5 for the one conditional repair if the order was not held and
`FIX-56` had already landed.

```bash
npm run build               # expected exit 0 — the real regression risk in this task:
                             # a broken relative import fails the whole build, not one test
npm run test                # record the exit code; a failure attributable to FIX-04 does
                             # not fail this task
grep -rn "AsyncStatus" src --include="*.ts"
                             # record the full list; compare against "Evidence" above
```

This task changes one type's file location and two import statements. Nothing it edits is
rendered: no template, no style, no selector, no input default and no output changes on
`PriceBlock` or on any component that consumes it. **The
`.claude/rules/browser-verification.md` exemption applies and is claimed here explicitly**:
there is no rendered difference to open a route and look at. The proof this task offers
instead is `npm run build` succeeding across every one of `PriceBlock`'s current consumers
(`product-card.ts`, `product-page.ts`, `order-receipt.ts`, `review-step.ts`,
`delivery-step.ts`, `order-summary.ts`, `cart-page.ts`, `cart-line.ts`) and
`npm run test` passing `price-block.spec.ts` unchanged.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R26 applies**: the commit body names the file moved, the two import edits, the
  directory-sharing note with `FIX-50`/`FIX-60`, and whether item 5's conditional
  `delivery-step.ts` fix was needed.
- R01–R25: N/A. This task moves a type declaration between two `.ts` files and edits two
  import statements. It introduces no brand asset, colour, dimension, font, layout, copy,
  data source, state machine, target size, breakpoint, dialog or handoff artefact, and it
  changes no page's rendered output.

## Acceptance criteria

- [ ] **FIX-67-AC01** `src/app/shared/types/async-status.ts` exists and
      `grep -c "export type AsyncStatus = 'idle' | 'loading' | 'success' | 'empty' | 'error';" src/app/shared/types/async-status.ts`
      prints `1`.
- [ ] **FIX-67-AC02** `grep -c "export type AsyncStatus" src/app/shared/ui/price-block/price-block.ts`
      prints `0`, and `grep -c "import type { AsyncStatus } from '../../types/async-status';" src/app/shared/ui/price-block/price-block.ts`
      prints `1`.
- [ ] **FIX-67-AC03** `grep -c "AsyncStatus" src/app/shared/ui/index.ts` prints `0`. The
      barrel still exports `PriceBlock` and `Money`:
      `grep -c "export { PriceBlock, type Money }" src/app/shared/ui/index.ts` prints `1`.
- [ ] **FIX-67-AC04** `src/app/shared/ui/price-block/price-block.spec.ts` imports
      `AsyncStatus` from `'../../types/async-status'`, not from `'./price-block'`:
      `grep -c "AsyncStatus.*from './price-block'" src/app/shared/ui/price-block/price-block.spec.ts`
      prints `0`.
- [ ] **FIX-67-AC05** `npm run build` exits `0`.
- [ ] **FIX-67-AC06** `npm run test` exits `0` and does not regress against whatever exit
      code was true immediately before this task's commit (`FIX-04` owns the 14/14 baseline
      failure; if it has not landed, record that verbatim and run this task's own spec with
      `npx vitest run src/app/shared/ui/price-block/price-block.spec.ts` instead).
- [ ] **FIX-67-AC07** `grep -rln "AsyncStatus" src --include="*.ts"` returns exactly three
      paths: `src/app/shared/types/async-status.ts` (the declaration),
      `src/app/shared/ui/price-block/price-block.ts` (the import and the `status` input)
      and `src/app/shared/ui/price-block/price-block.spec.ts` (the import and its own
      usage). This task lands before **FIX-56**, **FIX-60** and **FIX-63**, so no other
      file imports the type yet. If the grep returns a fourth path, one of those three
      landed first: record which, apply item 5's one-line repair to that file in this
      commit, and name it in the commit body. `grep -rln` is the file-listing form;
      `grep -rn` prints lines and cannot be counted as files.
- [ ] **FIX-67-AC08** The commit body records whether item 5's conditional
      `delivery-step.ts` fix was needed, and states the directory-sharing note with
      `FIX-50` and `FIX-60` from "Evidence".

## Commit

This task is exactly one commit: the new file, the two edits to `price-block.ts` and
`price-block.spec.ts`, the barrel edit, and — only if applicable — the one-line fix to
`delivery-step.ts`. Do not bundle it with **FIX-50**, **FIX-56**, **FIX-60** or **FIX-63**,
each of which is its own commit. **This task lands before `FIX-56`, `FIX-60` and
`FIX-63`**, each of which imports `AsyncStatus` into a component it is writing; landing
first is what lets all three import from `src/app/shared/types/async-status.ts` in their
own first commit. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
refactor: move AsyncStatus out of PriceBlock into shared/types
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.
