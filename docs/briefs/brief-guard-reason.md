# Unit: stop the checkout guards calling an unloaded cart an empty cart

You are working in a git worktree of the mi-bolt Angular 22 workspace. Your
working directory is the worktree root. Every path below is relative to it.

**You MUST execute every command with the Bash tool and paste the real tool
result; invented output is a failure.**

## How this sandbox behaves — read this before your first command

- **No pipes, no output redirection, no `$(...)`, no heredocs, no `find`, no
  multi-operator chains** (`a | b; c`). Run one bare command and read the tool
  result, which already carries the output and the exit code. Each refusal
  costs a whole tool call.
- Use the native **Grep** and **Read** tools for anything you would have piped.
- `git checkout`, `git restore`, `git reset`, `git stash` and `git clean` are
  refused by the sandbox and forbidden by this workspace's rules.
- `git push` is not yours to run, ever.
- You may write to `/tmp` as well as to the worktree.
- **Do not run `npm start`, `ng serve` or any server**, and do not run
  `npm install`: `node_modules` is a symlink shared with other worktrees. You
  have no browser.

## Looking things up is mandatory

Your model is older than this stack — Angular 22, TypeScript 6 and ESLint 10
all post-date your training.

- Angular questions, including anything about `CanMatchFn`'s return types or
  guard execution order: `mcp__angular-cli__search_documentation`
  (`version: 22`, `includeTopContent: true`, **keywords not a sentence**) or
  `mcp__angular-cli__get_best_practices`.
- Anything angular.dev does not cover: `mcp__minimax-mcp-server`'s
  `web_search`, or `WebSearch` / `WebFetch`.
- **Never build a probe component to discover how the framework behaves.**
- Every URL goes in your report beside the claim it supports.
- If you cannot settle a fact, report `blocked` and say what you would have
  searched for. Never guess, never invent an output.

## The defect, measured rather than inferred

Deep-linking or hard-reloading `/penztar/szallitas` with a **non-empty** cart
redirects to `/penztar/kosar?navigationReason=empty-cart`. A real-browser pass
hit this and mistook it for a sequencing rule.

The cause is in the source. `src/app/features/cart/cart.facade.ts:86-89`:

```ts
  private readonly cartWritable = signal<Cart | null>(null);

  /** Public readonly cart signal. Null until `ensureCart()` lands. */
  readonly cart: Signal<Cart | null> = this.cartWritable.asReadonly();
```

The constructor's restore runs through `Repository.ensureCart` over the
network, so on a fresh document load the signal is still `null` when a guard
runs. A `CanMatchFn` is synchronous and cannot wait for it.

`src/app/features/checkout/checkout.guards.ts` then tests both states as one
condition, in **four** places — `contactGuard`, `deliveryGuard`, `reviewGuard`
and `guardForSegment`:

```ts
  if (cartSnapshot === null || cartSnapshot.items.length === 0) {
```

and answers both with `redirectToStep('cart', 'empty-cart')`.

Bouncing a deep link is right — the guard genuinely cannot know yet. **Writing
`empty-cart` into the URL is what is wrong**, because the cart is not empty; it
is unknown.

## The fix, decided — do not redesign it

Split the one condition into two at all four sites:

- `cartSnapshot === null` means **not known yet**, and takes the reason
  **`'deep-link'`**, which `redirectToStep`'s `reason` union already carries.
- a loaded snapshot with `items.length === 0` means **known empty**, and keeps
  `'empty-cart'`.

The redirect target does not change, the guards stay synchronous, and the
existing-order branch (`checkout.order() !== null` → `redirectToSuccess`) keeps
its current place in each guard — **read each guard and preserve exactly where
that check sits relative to the split**, because it differs between them.

Do not make any guard async, do not add a loading signal to `CartFacade`, and
do not touch `CartFacade` at all.

## Read these files first

- `src/app/features/checkout/checkout.guards.ts` — the whole file
- `src/app/features/cart/cart.facade.ts` lines 84-95 and 149-180
- `src/app/features/checkout/checkout-state.spec.ts` around line 534, the one
  existing test that asserts a `navigationReason` value
- `ls src/app/features/checkout/` — find every spec that exercises these guards

## Step 1 — the split

Apply it in all four functions. Each `cartSnapshot === null` branch becomes its
own `if` returning `redirectToStep('cart', 'deep-link')`, and the
`items.length === 0` branch keeps `'empty-cart'`.

Where a guard first checks `checkout.order()` inside the combined branch,
decide per guard whether that check belongs to the unknown case, the empty
case, or both, **from what the guard's own docstring says it is for**, and say
in your report what you decided for each of the four and why. The docstrings
are explicit about the order-in-memory case (T24-AC04); follow them.

Update each docstring so it describes the code as it now stands.

## Step 2 — a fact you must check and report, not act on

`redirectToStep`'s own docstring says the reason is written "so the destination
page can show a banner explaining why the deep link was redirected". Run:

```
grep -rn "navigationReason" --include=*.ts --include=*.html src/app
```

Report every hit. **If nothing outside `checkout.guards.ts` and the specs reads
that query parameter, say so plainly in your report** — it means the banner the
docstring promises does not exist. **Do not build it.** That is a separate
decision for the orchestrator's user, and a brief that quietly grew a feature
is a failed unit. Do correct `redirectToStep`'s docstring so it stops claiming
a banner that is not there, and say what you wrote.

## Step 3 — the tests

`checkout-state.spec.ts:534` already asserts `navigationReason=incomplete` for
one case. Add cases in the same style, in whichever spec file already drives
these guards — find it rather than assuming, and **touch no existing test**.

Cover exactly these four, each its own `it`, each asserting the **exact**
query-parameter value:

- `deliveryGuard` with `cart.cart()` still `null` and no order in memory →
  the UrlTree string contains `navigationReason=deep-link`
- `deliveryGuard` with a loaded cart whose `items` is empty and no order in
  memory → contains `navigationReason=empty-cart`
- `contactGuard` with `cart.cart()` still `null` and no order in memory →
  contains `navigationReason=deep-link`
- `reviewGuard` with a loaded cart whose `items` is empty and no order in
  memory → contains `navigationReason=empty-cart`

Use `toContain` on the UrlTree string exactly as the existing test at line 543
does, so the assertion matches the file's established style. If that harness
cannot express one of the four for a real reason, say which and why rather than
writing a weaker assertion.

## Step 4 — do not touch these files

- `src/app/features/cart/**`
- `src/app/layouts/**` — another unit owns `checkout-layout.scss` right now
- `src/mocks/**`, `src/app/features/catalog/**`, `src/app/features/home/**`
- `docs/**`, `.claude/**`, `scripts/**` (there is no end-to-end suite in this project by decision, 2026-09-20)

Your files are `src/app/features/checkout/checkout.guards.ts` and the one spec
you add the four cases to. If the change makes another file fail to compile,
**report it rather than editing that file**. A code review proposing a fix
outside your files is telling you about another unit's work: record it in
`code_review` and do not apply it.

## Step 5 — gates

Run each and paste the real output. Wait on each command's own exit; do not
background one and poll a log.

```
npm run test
```

```
npm run lint
```

```
npm run build
```

```
npm run format:check
```

Acceptance:

- `npm run test` exits 0. Before your change it reports **67 test files, 966
  tests**. After, it must report **67 test files** and **970 tests** (966 plus
  your 4). If either number differs, say so and why.
- `npm run lint`, `npm run build` and `npm run format:check` each exit 0.
- This must print `4`:
  `grep -c "deep-link" src/app/features/checkout/checkout.guards.ts`
  If your split puts a different number of `'deep-link'` literals in the file,
  say the number and why rather than forcing it to four.
- This must print nothing:
  `grep -n "cartSnapshot === null || cartSnapshot.items.length === 0" src/app/features/checkout/checkout.guards.ts`

## Step 6 — run the code review

Run the `/code-review xhigh --fix` skill with the Skill tool and report the
result in `code_review`. Apply nothing it proposes outside your files.

## Step 7 — open a task list

This workspace's Stop hook requires one. Open it with TaskCreate at the start
of your turn, one entry per step, statuses kept current.

## Step 8 — commit

Two commands, from the worktree root. Add the spec path to **both**.

```
git add -- src/app/features/checkout/checkout.guards.ts
```

```
git commit -m "fix: tell an unknown cart apart from an empty one in the guards" -m "Deep-linking or hard-reloading a checkout step with a full cart redirected to /penztar/kosar?navigationReason=empty-cart. CartFacade's cart signal is null until ensureCart lands, and that restore goes over the network, so a synchronous CanMatchFn always reads null on a fresh document load. All four guards tested cartSnapshot === null and items.length === 0 as one condition and answered both with empty-cart, which is false for the first: the cart is not empty, it is unknown. The condition is now split, a null snapshot takes the deep-link reason the redirect helper's union already carried, and a loaded empty cart keeps empty-cart. The redirect target is unchanged and the guards stay synchronous, so the cart page still hydrates and shows the real cart. redirectToStep's docstring no longer claims the destination renders a banner: nothing in src/app reads navigationReason at all." -- src/app/features/checkout/checkout.guards.ts
```

Do not use a heredoc, `$(...)`, `-F`, or `git -C`. Do not run `git push`. Do
not invoke the `git-commit` skill.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`
- `split_per_guard`: for each of the four functions, the new condition shape
  quoted, and where you put the `checkout.order()` check relative to it, with
  the docstring sentence that decided it.
- `navigation_reason_readers`: the full grep output from Step 2, and a plain
  yes or no on whether anything outside the guards and the specs reads it.
- `docstring_change`: what you wrote in `redirectToStep`'s docstring.
- `gates`: the four exit codes, with the before and after test counts.
- `acceptance`: each bullet from Step 5 with the command's real output.
- `tests_added`: the four cases, and any you could not express, with the reason.
- `behaviour_deltas`: what a user sees differently. Be precise: the URL changes,
  and nothing renders it today, so say whether anything visible changes at all.
- `lookups`: every lookup with its URL, or `none`.
- `self_check`:
  - `invariant_tests`: for each of the four new cases, the single production
    line whose removal makes it fail. Delete it, re-run, paste the failure,
    restore it.
  - `exact_value_assertions`: confirm every new assertion compares to an exact
    value rather than truthiness.
- `code_review`: the result of the `/code-review xhigh --fix` pass, including
  anything proposed outside your files that you did not apply.
- `commit`: the sha from `git log --oneline -1`.
- `tasks_done` and `open_tasks`.
