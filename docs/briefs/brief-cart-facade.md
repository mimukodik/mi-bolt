# Unit: stop the cart error type lying about `'UNKNOWN'`

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
  file outside your list, leave it edited and say so in your report.
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

## Why this unit exists — this is a defect, not a tidy-up

`src/app/features/cart/cart.facade.ts:680` reads:

```ts
    const code = body?.code ?? ('UNKNOWN' as ProblemCode);
```

`'UNKNOWN'` is **not a member of `ProblemCode`**. That generated union
(`src/app/api/generated/models/problem-code.ts`) has fifteen members and
`'UNKNOWN'` is not one of them. The cast makes the type system accept a value
the code really produces and really returns: line 698 returns `{ ok: false, code, ... }`,
and line 640 writes that same `code` into `CartError`.

The same sentinel already stands **without a cast** at three other sites, so
the convention exists and only these declarations are too narrow:

- `src/app/features/product/product-page.ts:331` — `this.cartFacade.error()?.code ?? 'UNKNOWN'`
- `src/app/features/checkout/order-submission.ts:717` — `body.code ?? 'UNKNOWN'`
- `src/app/features/checkout/checkout.facade.ts:151` — `body.code ?? 'UNKNOWN'`

The second cast on the line above it is the other half of the same problem:

```ts
    const body = err.error as { code?: ProblemCode; detail?: string } | null;
```

`err.error` is `unknown` and nothing checked it. `.claude/rules/code-standards.md`
says: "`any` is forbidden; use `unknown` plus a type guard" — a cast asserts, a
guard proves.

## Read these files first

- `src/app/features/cart/cart.facade.ts` — the `CartError` interface around
  line 62, and the whole `mapError` function from line 677 to its end.
- `src/app/features/cart/cart-mutation-queue.ts` — `FailedDispatch`,
  `SuccessfulDispatch` and `export type DispatchResult` at line 101, plus the
  `} as DispatchResult);` cast at line 157.
- `src/app/api/generated/models/problem-code.ts` — the union, so you can see
  for yourself that `'UNKNOWN'` is absent.
- `src/app/features/cart/cart-page.ts:52` — `describeCartError`, which reads
  `error.detail` and not `error.code`, so widening the code type does not reach
  it. Confirm that rather than taking my word for it.

## Step 1 — widen the two declarations

Add, near the top of `src/app/features/cart/cart-mutation-queue.ts` beside the
types it already exports, one exported alias with a short docblock saying why
it exists:

```ts
/**
 * A problem code as the API may report it, plus the local `'UNKNOWN'`
 * sentinel the client substitutes when a failure carries no code. The
 * sentinel is not part of the generated `ProblemCode` union, so a type that
 * can hold it has to say so rather than casting.
 */
export type CartProblemCode = ProblemCode | 'UNKNOWN';
```

Import `ProblemCode` there as a type import if it is not imported already,
matching how the file imports its other types.

Then change the `code` field of `FailedDispatch` in that same file from
`ProblemCode` to `CartProblemCode`, and change `CartError`'s `code` field in
`src/app/features/cart/cart.facade.ts` from `ProblemCode` to
`CartProblemCode`, importing the alias from `'./cart-mutation-queue'` beside
the types the facade already imports from there.

**Change nothing else about either interface.**

## Step 2 — rewrite `mapError`'s first three lines

Current text at `src/app/features/cart/cart.facade.ts:677-681`:

```ts
function mapError(err: unknown): DispatchResult {
  if (err instanceof HttpErrorResponse) {
    const body = err.error as { code?: ProblemCode; detail?: string } | null;
    const code = body?.code ?? ('UNKNOWN' as ProblemCode);
    const detail = body?.detail ?? err.message;
```

becomes, with no cast anywhere:

```ts
function mapError(err: unknown): DispatchResult {
  if (err instanceof HttpErrorResponse) {
    const body: unknown = err.error;
    let code: CartProblemCode = 'UNKNOWN';
    let detail = err.message;
    if (typeof body === 'object' && body !== null) {
      if ('code' in body && typeof body.code === 'string') {
        code = body.code;
      }
      if ('detail' in body && typeof body.detail === 'string') {
        detail = body.detail;
      }
    }
```

`'code' in body` narrows `body` for TypeScript without a cast — the `in`
operator is a narrowing form, which is exactly why this shape is used here.

**If `code = body.code;` does not typecheck** because `body.code` is `string`
and `CartProblemCode` is narrower, do **not** reach for a cast. Report the
exact TypeScript error and stop on that item, and say in your report which of
these you would do: widen `CartProblemCode` to include `string`, or write an
`isCartProblemCode` guard over a constant list. I will decide.

Everything below those lines in `mapError` — every `if (err.status === ... && code === '...')` branch, the final `return { ok: false, code, status: err.status, detail };`, and the trailing `SERVICE_UNAVAILABLE` return — stays exactly as it is.

If `ProblemCode` is left unused in `cart.facade.ts` after this change, remove
its import. If it is still used, leave the import alone.

## Step 3 — the `as DispatchResult` cast at line 157

`src/app/features/cart/cart-mutation-queue.ts:157` reads `} as DispatchResult);`.
Read the whole expression it closes. If the object literal already satisfies
`DispatchResult` structurally, replace `as DispatchResult` with
`satisfies DispatchResult`, which `.claude/rules/code-standards.md` names as
the replacement for a cast. **If it does not** — if the cast is load-bearing
because the literal is missing a field or has a wider one — leave it alone and
say so in your report with the compiler error that proves it. Do not force it.

## Step 4 — the test

`src/app/features/cart/cart.facade.spec.ts` already exists. Add a `describe`
block to it — do not touch any existing test in that file — with exactly these
three cases, each its own `it`, each an exact-value assertion:

- An `HttpErrorResponse` whose `error` is `{ code: 'OUT_OF_STOCK', detail: 'nincs raktáron' }` and whose `status` is 409 produces a result whose `code` is exactly `'OUT_OF_STOCK'` and whose `detail` is exactly `'nincs raktáron'`.
- An `HttpErrorResponse` whose `error` is `null` produces a result whose `code` is exactly `'UNKNOWN'`.
- An `HttpErrorResponse` whose `error` is the string `'boom'` produces a result whose `code` is exactly `'UNKNOWN'` — this is the case the old cast silently mishandled, because a string body made `body?.code` `undefined` only by luck of property access.

`mapError` is module-local, so reach it the way the existing spec reaches the
facade's error path: drive a failing request through the facade and read
`facade.error()`. Read the existing spec first and follow its setup exactly
rather than inventing a second harness. If you genuinely cannot reach these
three cases through the existing harness, say so in your report with what you
tried, and do **not** export `mapError` just to test it.

## Step 5 — do not touch these files

Another session owns these right now. Writing any of them is a failure of this
unit:

- `src/mocks/**` (every file)
- `src/app/features/catalog/**`
- `src/app/features/checkout/**` and `src/app/features/product/**` — the three
  sites listed above are evidence, not scope; do not edit them
- `docs/**`, `.claude/**`, `scripts/**` (there is no end-to-end suite in this project by decision, 2026-09-20)

Your files are exactly: `src/app/features/cart/cart-mutation-queue.ts`,
`src/app/features/cart/cart.facade.ts`, `src/app/features/cart/cart.facade.spec.ts`.
If the change makes any other file fail to compile, **report it rather than
editing that file**.

A code review that proposes a fix outside those three files is telling you
about work for another unit: record it in your `code_review` field and do not
apply it. The previous runner on this branch let a review's `--fix` pass edit
two files its brief had ruled out, and the orchestrator had to decide
afterwards whether to keep them.

## Step 6 — gates

Run each and paste the real output. Wait on each command's own exit; do not
background one and poll a log.

```
npm run test
```

```
npx eslint src/app/features/cart/cart-mutation-queue.ts src/app/features/cart/cart.facade.ts src/app/features/cart/cart.facade.spec.ts
```

```
npx prettier --check src/app/features/cart/cart-mutation-queue.ts src/app/features/cart/cart.facade.ts src/app/features/cart/cart.facade.spec.ts
```

```
npm run build
```

Acceptance, each measurable:

- `npm run test` exits 0. Before your change it reports **65 test files, 944
  tests**. After, it must report **65 test files** and **947 tests** (944 plus
  your 3 new cases, added to an existing file so the file count does not move).
  If either number differs, say so and say why.
- `npx eslint` over the three files exits 0.
- `npx prettier --check` over the same three exits 0.
- `npm run build` exits 0.
- This command must print nothing:
  `grep -n "as ProblemCode" src/app/features/cart/cart.facade.ts`
- This command must print nothing:
  `grep -n "err.error as" src/app/features/cart/cart.facade.ts`
- This command must print `1`:
  `grep -c "export type CartProblemCode" src/app/features/cart/cart-mutation-queue.ts`

## Step 7 — run the code review

Before you report done, run the `/code-review xhigh --fix` skill over your
change with the Skill tool. Report its result in the `code_review` field. A
report claiming this ran without the Skill call having happened is a failure.
Apply nothing it proposes outside your three files.

## Step 8 — commit

Exactly two commands, from the worktree root.

```
git add -- src/app/features/cart/cart-mutation-queue.ts src/app/features/cart/cart.facade.ts src/app/features/cart/cart.facade.spec.ts
```

```
git commit -m "fix: stop the cart error type lying about UNKNOWN" -m "CartError.code and FailedDispatch.code were declared ProblemCode, and mapError wrote 'UNKNOWN' into them through a cast. 'UNKNOWN' is not one of the fifteen members of the generated ProblemCode union, so the declaration excluded a value the code really produces and really returns to the UI. A new CartProblemCode alias in cart-mutation-queue.ts says ProblemCode | 'UNKNOWN', which is the convention product-page.ts, order-submission.ts and checkout.facade.ts already follow without a cast. mapError's second cast goes with it: err.error is unknown and nothing checked it, so the body is now narrowed with typeof and the in operator instead of asserted. describeCartError reads only error.detail, so no message changes. Three cases in cart.facade.spec.ts cover a coded failure, a null body and a string body." -- src/app/features/cart/cart-mutation-queue.ts src/app/features/cart/cart.facade.ts src/app/features/cart/cart.facade.spec.ts
```

Do not use a heredoc, `$(...)`, `-F`, or `git -C`. Do not run `git push`. Do
not invoke the `git-commit` skill.

## Step 9 — open a task list

This workspace's Stop hook requires one. Open it with TaskCreate at the start
of your turn, one entry per step above, and keep the statuses current. The
previous runner skipped it and was stopped by the hook.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`: the number of Bash tool calls you made this turn.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet from Step 6, with the command's real output.
- `declarations_changed`: the two `code` fields and the new alias, quoted.
- `map_error`: the new first lines of `mapError`, quoted.
- `dispatch_result_cast`: what you did with line 157 and why, with the compiler
  error if you left it alone.
- `behaviour_deltas`: name any input for which the new `mapError` behaves
  differently from the old one, or `none`. A string body and an array body are
  the two worth checking. Be honest: a previous unit on this branch claimed
  "behaviour unchanged" and a review found an input where it was not.
- `lookups`: every documentation or web lookup you made, with the URL, or
  `none`.
- `self_check`:
  - `invariant_tests`: for each of your three new cases, name the single
    production line whose removal makes it fail. Actually delete the line,
    re-run, paste the failure, then restore it.
  - `exact_value_assertions`: confirm every new assertion compares to an exact
    value rather than truthiness.
- `code_review`: the result of the `/code-review xhigh --fix` pass, including
  anything it proposed outside your three files that you did not apply.
- `commit`: the sha, from `git log --oneline -1`.
- `tasks_done`: your own task list entries completed this turn, by id and
  subject.
- `open_tasks`: every entry still pending or in progress, or `none`.
