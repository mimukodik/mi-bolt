# FIX-65 — Rename SortMode to Sort, the name the specification gives it

Status: DONE — `SortMode` renamed to `Sort` at every site under `src/app/features/catalog/` and its one spec file; `src/mocks/` untouched.
Severity: major
Source: Decision **D15** item 6. `docs/spec/components.md:7` and `:375`. Decisions **D1**
and **D10**.

## Why this is wrong

`src/app/features/catalog/catalog-query.ts` declares the catalogue's sort union under the
wrong name. `components.md:7` and `:375` declare it `Sort`; the code declares an identical
union named `SortMode`. Decision **D10** — "A spec neve nyer" ("the spec's name wins") —
settles this as a pure rename with no behavioural change: the union's members are
identical, only the identifier differs.

## Evidence

`docs/spec/components.md:7`:

> `CatalogQuery = CatalogFilters & {q:string; sort:Sort; page:number; pageSize:12|24}`.
> `Sort = recommended | price_asc | price_desc | name_asc`.

`docs/spec/components.md:375` (the `CatalogToolbar` entry):

> **Signal inputs:** `total:number; sort:Sort; pageSize:12|24; status:AsyncStatus`.

`src/app/features/catalog/catalog-query.ts:22` declares the same union under a different
name:

```ts
export type SortMode = 'recommended' | 'price_asc' | 'price_desc' | 'name_asc';
```

**Decision D10 — "A spec neve nyer" ("the spec's name wins") — settles this: the type is
renamed to `Sort` in the code.** This is a pure rename with no behavioural change: the
union's members are identical, only the identifier differs.

## What to change

### Rename `SortMode` to `Sort`, everywhere it is declared or imported

Every one of these was grepped and confirmed present before writing this list; there are
no others under `src/` or `tests/` that import this symbol (a **separate**, independently
declared `SortMode` exists in `src/mocks/catalog/filter-products.ts:26`, re-exported by
`src/mocks/catalog/catalog.handlers.ts:276` — that is the mock/wire layer's own type,
mirrors the OpenAPI enum directly, is never imported from `catalog-query.ts`, and is
**not** part of this rename; see "Out of scope").

- `src/app/features/catalog/catalog-query.ts:22` — the declaration:
  `export type SortMode = …` becomes `export type Sort = …`.
- `src/app/features/catalog/catalog-query.ts:29` — `satisfies readonly SortMode[]`
  becomes `satisfies readonly Sort[]`.
- `src/app/features/catalog/catalog-query.ts:61` — `readonly sort?: SortMode;` becomes
  `readonly sort?: Sort;`.
- `src/app/features/catalog/catalog-query.ts:122` — the parse accumulator's
  `sort?: SortMode;` becomes `sort?: Sort;`.
- `src/app/features/catalog/catalog-query.ts:188` — `query.sort = trimmed as SortMode;`
  becomes `query.sort = trimmed as Sort;`.
- `src/app/features/catalog/catalog-page.ts:19` — the `import { …, type SortMode } from
  './catalog-query';` becomes `type Sort`.
- `src/app/features/catalog/catalog-page.ts:616` — `computed<SortMode>` becomes
  `computed<Sort>`.
- `src/app/features/catalog/catalog-page.ts:643` — `readonly sortModes: readonly
  SortMode[]` becomes `readonly Sort[]`.
- `src/app/features/catalog/catalog-page.ts:705` — `as SortMode` becomes `as Sort`.
- `src/app/features/catalog/catalog-page.ts:781` — `sortLabel(mode: SortMode): string`
  becomes `sortLabel(mode: Sort): string`.
- `src/app/features/catalog/catalog.facade.ts:57` — the `type SortMode` import becomes
  `type Sort`.
- `src/app/features/catalog/catalog.facade.ts:294` — `setSort(value: SortMode): void`
  becomes `setSort(value: Sort): void`.
- `src/app/features/catalog/filter-panel.ts:3` — `import type { CatalogQuery, SortMode }
  from './catalog-query';` becomes `type Sort`.
- `src/app/features/catalog/filter-panel.ts:207` — the comment line
  `// Keep \`SortMode\` and \`SORT_MODES\` imports live so future sort controls can`
  becomes `// Keep \`Sort\` and \`SORT_MODES\` imports live so future sort controls can`.
  It is a comment, not code, and nothing compiles differently; it is in this list because
  it names an identifier this rename removes, and because **FIX-65-AC01**'s grep sees it.
- `src/app/features/catalog/filter-panel.ts:210` — `export const _sortMarker: readonly
  SortMode[] = SORT_MODES;` becomes `readonly Sort[]`. `SORT_MODES` itself (the runtime
  array) is **not** renamed — only the type name changes; `components.md` names no
  runtime constant, so there is nothing for this identifier to conform to.
- `src/app/features/catalog/catalog.facade.spec.ts:40` — the `type SortMode` import becomes `type Sort`.
- `src/app/features/catalog/catalog.facade.spec.ts:298` — `toBe<SortMode>('price_desc')` becomes
  `toBe<Sort>('price_desc')`.
- `src/app/features/catalog/catalog.facade.spec.ts:465` — `toBe<SortMode>('price_asc')` becomes
  `toBe<Sort>('price_asc')`.
- `src/app/features/catalog/catalog.facade.spec.ts:829` — `toBe<SortMode>('price_desc')` becomes
  `toBe<Sort>('price_desc')`.

Do not touch `src/mocks/catalog/filter-products.ts:26`, `:38`, `:70`, `:176`, `:424`,
`:434` or `src/mocks/catalog/catalog.handlers.ts:47`, `:276`, and do not touch
`src/mocks/catalog/catalog-mock.spec.ts:970` (a comment referring to the mock's own `SortMode`, not
this one — confirmed by reading its imports, which pull from
`src/mocks/catalog/filter-products.ts`, never from `catalog-query.ts`).

## Out of scope

- **`src/mocks/`, in full.** `filter-products.ts` declares its own `SortMode`, independent
  of `catalog-query.ts`'s, and `catalog.handlers.ts:276` re-exports it. That is the
  mock/wire layer's own type; this task's rename does not touch it. Do not touch either
  file.
- **`docs/spec/components.md`.** No line of it changes. `D1` reserves a specification edit
  for the user; the only edits this package makes to `components.md` are the ones the user
  already decided — **D11**, **D14**, **D16**, **D17**, **D19**, **D20**, **D21** — and this
  task adds none. `components.md:7` gains `featured?: boolean` on `CatalogQuery` under
  **D21** ("`featured` stays, and `components.md:7` gains it"), and **FIX-60** carries that
  edit in its own commit — **D21** makes `FIX-60` the sole owner of that line, because two
  decisions (**D16** and **D21**) now edit the same physical line and one-commit-per-task
  cannot split it. This task does not touch `components.md`.
- **Any component or type not named above.** `AsyncStatus`, `FilterIdentity`,
  `AppliedChip`'s extraction, and every other drift `FIX-60` and `FIX-50` own stay with
  those tasks.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (**FIX-01**),
`npm run test` (`ng test`) fails 14/14 files (**FIX-04**), `npx playwright test` has 41
failures (**FIX-09**).

```bash
grep -rn "SortMode" src tests
                              # expected: matches only inside src/mocks/ and the one
                              # tests/catalog-mock.spec.ts comment — zero elsewhere
npm run build                # expected exit 0
npm run test                 # record the exit code; a failure attributable to FIX-04 does not
                             # fail this task — see the fallback below
```

`npm run test` runs `ng test`, which fails 14/14 files at baseline (**FIX-04**). If
`FIX-04` has not landed, record that verbatim and instead run:

```bash
npx vitest run tests/catalog.facade.spec.ts
```

**Browser-verification exemption.** This task renames one TypeScript type identifier
across its declaration and every import site; the union's members, and every value that
flows through the application, are unchanged. No rendered surface, DOM structure, style or
behaviour differs before and after this task, so there is nothing for a browser to observe
that the grep and test commands above do not already prove.
`.claude/rules/browser-verification.md` — "A change is exempt only when it cannot reach a
browser at all" — applies, and this is why.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R25: N/A — this task renames one TypeScript type identifier (`SortMode` → `Sort`)
  across its declaration and every import site, with no behavioural change. It introduces
  no brand asset, colour, dimension, font, image, new interactive control, promotional
  content, or filter-state change, and changes no rendered state at all.

## Acceptance criteria

- [ ] **FIX-65-AC01** `grep -rn "SortMode" src tests` returns matches only under
      `src/mocks/` and the one comment at `src/mocks/catalog/catalog-mock.spec.ts:970`. Every site
      listed under "What to change" now reads `Sort`.
- [ ] **FIX-65-AC02** `grep -n "^export type Sort " src/app/features/catalog/catalog-query.ts`
      prints exactly one line, and it matches `Sort = recommended | price_asc |
      price_desc | name_asc` verbatim against `components.md:7`'s `Sort` definition.
- [ ] **FIX-65-AC03** `npx vitest run tests/catalog.facade.spec.ts` (or `npm run test` if
      **FIX-04** has landed) exits 0, and the four test edits listed under "What to
      change" — `src/app/features/catalog/catalog.facade.spec.ts:40`, `:305`, `:443`, `:807` — now read
      `Sort` in place of `SortMode`.
- [ ] **FIX-65-AC04** `npm run build` exits 0.

## Commit

This task is exactly one commit: a type rename across its declaration and every import
site. Do not bundle it with **FIX-24**, **FIX-60**, or any other task. **It lands before
`FIX-60`**, which extracts two new components carrying this type and is written against
`Sort` on that basis (`FIX-60.md:216`, `:221`, `:476-478`); landing after FIX-60 would put
two new `SortMode` sites outside this task's closed change list and fail **FIX-65-AC01**.
It must also never run concurrently with **FIX-24**, which edits
`src/app/features/catalog/catalog-query.ts` for a different reason; either order is safe
because the lines are disjoint. Commit only after every acceptance criterion above has
passed and its output is recorded.

Suggested subject line, in the repository's existing `type: summary` style:

```
refactor: rename catalogue SortMode to Sort per components.md
```
