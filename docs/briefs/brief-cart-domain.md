# Unit: replace six casts under `src/mocks/` with two type guards

You are working in a git worktree of the mi-bolt Angular 22 workspace. Your
working directory is the worktree root. Every path below is relative to it.

**You MUST execute every command with the Bash tool and paste the real tool
result; invented output is a failure.**

## How this sandbox behaves — read this before your first command

Each refused command costs a whole tool call, so do not discover these by
trying:

- **No pipes, no output redirection, no `$(...)`, no heredocs, no `find`, no
  multi-operator chains** (`a | b; c`). Run one bare command and read the tool
  result, which already carries the output and the exit code.
- Use the native **Grep** and **Read** tools for anything you would have piped.
- `git checkout`, `git restore`, `git reset`, `git stash` and `git clean` are
  refused by the sandbox and forbidden by this workspace's rules. If you edit a
  file outside your list, leave it edited and say so in your report: staging by
  explicit pathspec keeps it out of the commit.
- `git push` is not yours to run, ever.
- You may write to `/tmp` as well as to the worktree.
- **Do not run `npm start`, `ng serve`, or any server.** Another agent is
  driving the app on port 4200 right now and a second server would break its
  run. Do not run `npm install` either: `node_modules` is a symlink shared with
  other worktrees.

## Looking things up is mandatory

Your model is older than this stack — Angular 22, TypeScript 6, ESLint 10 all
post-date your training, so anything you *recall* about them is a guess.

- Any question about how Angular, the Angular CLI or the builder behaves goes
  to `mcp__angular-cli__search_documentation` (pass `version: 22`,
  `includeTopContent: true` for the page text, and **keywords, not a
  sentence**) or to `mcp__angular-cli__get_best_practices`.
- Anything angular.dev does not cover goes to `mcp__minimax-mcp-server`'s
  `web_search`, or to `WebSearch` / `WebFetch`.
- **Never build a probe component or a throwaway app to discover how the
  framework behaves.** Read the documentation instead.
- Put the URL in your report beside any claim it supports.
- If you still cannot settle a fact, report `blocked` and say exactly what you
  would have searched for. Do not guess and do not invent an output.

## Why this unit exists

`.claude/rules/code-standards.md` says: "Strict generics. `as` is forbidden;
use `satisfies`. `any` is forbidden; use `unknown` plus a type guard." and
"Always use the type guards that already exist in the project. If none fits
and one is needed, write it."

Six places under `src/mocks/` assert a shape with a bare cast. A cast asserts;
a guard proves.

## Read these files first

- `src/mocks/is-record.ts` — the `isRecord` guard landed on this branch
  yesterday. It is the precedent for this unit's file shape and docblock style,
  and your new cart guard builds on it.
- `src/mocks/business-route-predicates.ts` — the older precedent for a small
  predicate module in `src/mocks/`.
- `src/mocks/repository.ts` lines 76-84 — the `Cart` interface, which is what
  `CartSnapshot` aliases.
- `src/mocks/cart/cart-domain.ts` — line 49 (`export type CartSnapshot = Cart;`)
  and the four replay sites at roughly lines 155, 202, 276 and 345.
- `src/mocks/catalog/filter-products.ts` — lines 26, 70 and 410-430.

## Step 1 — write `isCartSnapshot`

Create `src/mocks/cart/is-cart-snapshot.ts` with exactly this one export, plus
a short module docblock and a short function docblock in the style of
`src/mocks/is-record.ts`:

```ts
export function isCartSnapshot(value: unknown): value is CartSnapshot {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['version'] === 'number' &&
    (value['status'] === 'active' || value['status'] === 'ordered') &&
    typeof value['sessionId'] === 'string' &&
    Array.isArray(value['items']) &&
    typeof value['createdAt'] === 'string' &&
    typeof value['expiresAt'] === 'string'
  );
}
```

It imports `isRecord` from `'../is-record'` and `CartSnapshot` from
`'./cart-domain'`. Add no other export to that file.

**Write the docblock so that every sentence in it is true of the code as it
stands.** Do not write that something "falls back to the existing X" unless an
existing X is there to point at. A review on this branch caught exactly that:
a comment claimed precedent for a shape that had never existed in the file.

The guard checks the seven fields above and does not walk `items`, because the
only values that reach it were produced by this same mock layer.

## Step 2 — write its test

Create `src/mocks/cart/is-cart-snapshot.spec.ts`. A plain Vitest spec, no
TestBed: `import { describe, expect, it } from 'vitest';` Build one valid cart
object in the spec and derive the invalid cases from it. Assert exactly these
seven cases, each its own `it`, each with an exact-value `toBe`:

- a complete valid cart object is `true`
- the same object with `id` deleted is `false`
- the same object with `version` set to `'1'` (a string) is `false`
- the same object with `status` set to `'pending'` is `false`
- the same object with `items` set to `{}` is `false`
- `null` is `false`
- `'cart'` is `false`

A truthiness check does not settle a boolean; use `toBe(true)` / `toBe(false)`.

## Step 3 — route the four replay sites through it

All four are in `src/mocks/cart/cart-domain.ts`. Find each by its exact text,
not by the line number.

| Current text | Count |
|---|---|
| `const replayedCart = replay.body as CartSnapshot;` | 1 (around line 155) |
| `if (replay) return ok(replay.body as CartSnapshot);` | 3 (around lines 202, 276, 345) |

For the three one-liners, write:

```ts
if (replay && isCartSnapshot(replay.body)) return ok(replay.body);
```

For the one around line 155, the cast sits inside an `if (replay) { ... }`
block that does an expiry check. Widen that block's condition to
`if (replay && isCartSnapshot(replay.body))` and then use `replay.body`
directly where `replayedCart` was used, or keep a local named `replayedCart`
assigned from the narrowed `replay.body` — whichever reads closer to the
existing code. Leave the long comment above it exactly as it is.

**What the false branch means, and say this in one comment, once:** a replay
whose body is not a cart snapshot is treated as no replay at all, so execution
falls through to the normal path. That is the only branch that keeps these
functions returning a well-formed cart. It is unreachable today — `idempotency`
stores only carts this same module produced — so write the comment as "cannot
happen today" rather than inventing a fallback and claiming precedent for it.

Import it as `import { isCartSnapshot } from './is-cart-snapshot';`.

## Step 4 — route the two sort sites through a `isSortMode` guard

In `src/mocks/catalog/filter-products.ts`, add this export next to `SORT_MODES`
(around line 70), with a one-line docblock:

```ts
export function isSortMode(value: unknown): value is SortMode {
  return typeof value === 'string' && SORT_MODES.some((mode) => mode === value);
}
```

If that body does not typecheck, report the exact TypeScript error rather than
reaching for a cast to make it compile.

Then rewrite the block at roughly lines 414-427. Current text:

```ts
  const sortRaw = params.get('sort');
  if (sortRaw !== null) {
    if (!SORT_MODES.includes(sortRaw as SortMode)) {
      return {
        ok: false,
        error: {
          code: 'INVALID_SORT',
          field: 'sort',
          detail: `Ismeretlen rendezési mód: ${sortRaw}.`,
        },
      };
    }
    filter.sort = sortRaw as SortMode;
  }
```

becomes the same block with `if (!isSortMode(sortRaw)) {` and
`filter.sort = sortRaw;`. The error object, its code, its field and its
Hungarian detail string stay byte for byte as they are.

## Step 5 — two comment corrections a review asked for

These are cosmetic and each is one edit.

1. `src/mocks/payment/payment.handlers.ts`, the comment immediately above
   `if (!isRecord(replay.body)) {` (around line 245). It currently reads:

   ```
        // Replay body is stored verbatim by `idempotency.record(...)` and is
        // expected to be an object; guard it so we hand `HttpResponse.json`
        // the narrowed record and fall back to the existing empty-object
        // shape otherwise.
   ```

   "the existing empty-object shape" is false — no such shape existed in this
   file before that guard was added. Replace the comment with an accurate one
   of your own saying: the body is stored verbatim by `idempotency.record(...)`
   and is always an object today, because the only call that records one passes
   `serializeIntent(intent)`; the guard is what lets `HttpResponse.json` receive
   a narrowed record, and its branch cannot be reached with the current call
   sites. **Change no code in that function** — only the comment.

2. `src/mocks/is-record.ts`, first line of the module docblock. It reads
   `Pure object-shape predicate for the mocks layer (FIX-…, T… — see` with
   literal ellipses, which looks like an unfilled placeholder. Delete the
   `(FIX-…, T… — ` fragment so the sentence reads naturally and the parenthesis
   opens on `see \`src/mocks/business-route-predicates.ts\`, …`. Change nothing
   else in that file.

## Step 6 — do not touch these files

Another session owns these right now. Writing any of them is a failure of this
unit:

- `src/app/**` (every file — this unit is `src/mocks/` only)
- `src/mocks/persistence.ts`
- `src/mocks/idempotency.ts`
- `docs/**`
- `.claude/**`
- `scripts/**`
- anything under `e2e/`

## Step 7 — gates

Run each and paste the real output. Wait on each command's own exit; do not
background one and poll a log.

```
npm run test
```

```
npx eslint src/mocks/cart/is-cart-snapshot.ts src/mocks/cart/is-cart-snapshot.spec.ts src/mocks/cart/cart-domain.ts src/mocks/catalog/filter-products.ts src/mocks/payment/payment.handlers.ts src/mocks/is-record.ts
```

```
npx prettier --check src/mocks/cart/is-cart-snapshot.ts src/mocks/cart/is-cart-snapshot.spec.ts src/mocks/cart/cart-domain.ts src/mocks/catalog/filter-products.ts src/mocks/payment/payment.handlers.ts src/mocks/is-record.ts
```

```
npm run build
```

Acceptance, each measurable:

- `npm run test` exits 0. Before your change it reports **65 test files, 944
  tests**. After, it must report **66 test files** and **951 tests** (944 plus
  your 7 new cases). If either number differs, say so and say why.
- `npx eslint` over the six files exits 0.
- `npx prettier --check` over the same six exits 0.
- `npm run build` exits 0.
- This command must print nothing:
  `grep -n "as CartSnapshot" src/mocks/cart/cart-domain.ts`
- This command must print nothing:
  `grep -n "as SortMode" src/mocks/catalog/filter-products.ts`
- This command must print `1`:
  `grep -c "^export function isCartSnapshot" src/mocks/cart/is-cart-snapshot.ts`
- This command must print nothing:
  `grep -n "existing empty-object" src/mocks/payment/payment.handlers.ts`
- This command must print nothing:
  `grep -n "FIX-…" src/mocks/is-record.ts`

## Step 8 — run the code review

Before you report done, run the `/code-review xhigh --fix` skill over your
change with the Skill tool. Report its result in the `code_review` field. A
report claiming this ran without the Skill call having happened is a failure.
If the review proposes a fix that breaks the build or the types, say so, do not
apply it, and explain why in that field.

## Step 9 — commit

Exactly two commands, from the worktree root.

```
git add -- src/mocks/cart/is-cart-snapshot.ts src/mocks/cart/is-cart-snapshot.spec.ts src/mocks/cart/cart-domain.ts src/mocks/catalog/filter-products.ts src/mocks/payment/payment.handlers.ts src/mocks/is-record.ts
```

```
git commit -m "refactor: prove the cart and sort shapes with guards" -m "Six call sites under src/mocks/ asserted a shape with a bare cast, which .claude/rules/code-standards.md forbids: a cast asserts, a guard proves. isCartSnapshot lands in src/mocks/cart/is-cart-snapshot.ts, built on the isRecord guard already there, and the four idempotency replay sites in cart-domain.ts now treat a replay whose body is not a cart snapshot as no replay at all, falling through to the normal path. That branch cannot be reached with today's call sites, which only ever record carts this module produced. isSortMode lands beside SORT_MODES in filter-products.ts and replaces the two casts in the sort query parser, leaving the error object and its Hungarian detail string untouched. Two comments a review found inaccurate are corrected: payment.handlers.ts claimed precedent for an empty-object shape that never existed in that file, and is-record.ts's docblock carried an unfilled FIX/T placeholder." -- src/mocks/cart/is-cart-snapshot.ts src/mocks/cart/is-cart-snapshot.spec.ts src/mocks/cart/cart-domain.ts src/mocks/catalog/filter-products.ts src/mocks/payment/payment.handlers.ts src/mocks/is-record.ts
```

Do not use a heredoc, `$(...)`, `-F`, or `git -C`. Do not run `git push`. Do
not invoke the `git-commit` skill.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`: the number of Bash tool calls you made this turn.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet from Step 7, with the command's real output.
- `sites_changed`: the six, one line each, saying which guard shape you used.
- `sites_left_alone`: any site you could not convert without changing
  behaviour, with file, line and reason, or `none`.
- `behaviour_deltas`: for each of the six, name any input for which the new
  code behaves differently from the old, or say `none` for that site. Be
  honest here: the previous unit on this branch claimed "behaviour unchanged"
  and a review found an input where it was not.
- `comments_fixed`: the two from Step 5, with the new text quoted.
- `lookups`: every documentation or web lookup you made, with the URL, or
  `none`.
- `self_check`:
  - `invariant_tests`: for `isCartSnapshot` and for `isSortMode`, name the test
    that proves it and the single production line whose removal makes that test
    fail. Actually delete the line, re-run, paste the failure, then restore it.
  - `exact_value_assertions`: confirm every new assertion compares to an exact
    value rather than truthiness.
- `code_review`: the result of the `/code-review xhigh --fix` pass.
- `commit`: the sha, from `git log --oneline -1`.
- `tasks_done`: your own task list entries completed this turn, by id and
  subject.
- `open_tasks`: every entry still pending or in progress, or `none`.
