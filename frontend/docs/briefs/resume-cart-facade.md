# Decision on the typecheck error, and the rest of the unit

You reported the typecheck error and stopped, which is exactly right. Here is
the decision. Everything else in the original brief still stands: the same
three files, the same gates, the same acceptance list, the same commit
commands, the same report fields.

## The decision: the type is `string`, and there is no `CartProblemCode` alias

I measured the sibling facade rather than inventing a rule. `src/app/features/checkout/checkout.facade.ts:88`
declares `readonly code: string;` on `CheckoutError`, and its own `mapError`
at line 151 does `const code = body.code ?? 'UNKNOWN';` with `body.code` typed
`code?: string`. So `string` is already this codebase's convention for a
server-reported problem code that the client may replace with the `'UNKNOWN'`
sentinel, and the cart facade is the odd one out.

Do this instead of Step 1 of the brief:

- **Do not add a `CartProblemCode` alias.** Delete it if you already wrote one.
- In `src/app/features/cart/cart-mutation-queue.ts`, change `FailedDispatch`'s
  `code` field from `ProblemCode` to `string`. Give it a one-line comment
  saying it carries a server-reported code or the local `'UNKNOWN'` sentinel,
  and that `'UNKNOWN'` is not a member of the generated `ProblemCode` union,
  which is why the field is not typed as one.
- In `src/app/features/cart/cart.facade.ts`, change `CartError`'s `code` field
  from `ProblemCode` to `string`, with the same one-line comment.
- Leave `CartConflict`'s `code: 'CART_VERSION_CONFLICT'` exactly as it is. It
  really is that one literal and nothing else.

Step 2's `mapError` rewrite then typechecks as written, because `body.code`
narrowed to `string` is assignable to a `string` field:

```ts
function mapError(err: unknown): DispatchResult {
  if (err instanceof HttpErrorResponse) {
    const body: unknown = err.error;
    let code = 'UNKNOWN';
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

Note `let code = 'UNKNOWN';` with no annotation now, since the field is
`string` — TypeScript infers `string` from a `let`. Everything below those
lines in `mapError` stays exactly as it is, including every
`code === 'CART_VERSION_CONFLICT'` style comparison, which still works against
a `string`.

If `ProblemCode` ends up unused in either file, remove its import. If it is
still used, leave the import alone.

## What changes in the acceptance list

The third and fourth greps from Step 6 change, because there is no alias any
more. The new list:

- `npm run test` exits 0, **65 test files** and **947 tests** (944 plus your 3
  new cases).
- `npx eslint` over the three files exits 0.
- `npx prettier --check` over the same three exits 0.
- `npm run build` exits 0.
- This must print nothing: `grep -n "as ProblemCode" src/app/features/cart/cart.facade.ts`
- This must print nothing: `grep -n "err.error as" src/app/features/cart/cart.facade.ts`
- This must print nothing: `grep -n "CartProblemCode" src/app/features/cart/cart-mutation-queue.ts src/app/features/cart/cart.facade.ts`

## The commit body changes too

Use this one, which drops the alias sentence:

```
git commit -m "fix: stop the cart error type lying about UNKNOWN" -m "CartError.code and FailedDispatch.code were declared ProblemCode, and mapError wrote 'UNKNOWN' into them through a cast. 'UNKNOWN' is not one of the fifteen members of the generated ProblemCode union, so the declaration excluded a value the code really produces and really returns to the UI. Both fields are now string, which is what the sibling CheckoutError already declares at checkout.facade.ts:88 for the same reason. mapError's second cast goes with it: err.error is unknown and nothing checked it, so the body is now narrowed with typeof and the in operator instead of asserted. describeCartError reads only error.detail, so no message changes. Three cases in cart.facade.spec.ts cover a coded failure, a null body and a string body." -- src/app/features/cart/cart-mutation-queue.ts src/app/features/cart/cart.facade.ts src/app/features/cart/cart.facade.spec.ts
```

## Two things your last turn did not do

- **Paste the real command output.** Your report said a typecheck error was
  found but did not quote it. Every claim about repository state quotes the
  command run in that same turn; quote the error this time if one appears.
- **Open the task list with TaskCreate** at the start of this turn, one entry
  per step, statuses kept current. The Stop hook asked for it last turn.

Answer every field of the report the original brief lists, plus one more:
`decision_applied`, saying in one line which shape you used and confirming the
alias is absent.
