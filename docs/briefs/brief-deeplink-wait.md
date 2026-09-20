# Unit: a checkout deep-link with a full cart must stay put, not bounce to the cart page

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
  have no browser; the rendered result is checked by another agent afterwards.
- **`npx vitest run <one spec file>` does not work here.** `npm run test` is
  `ng test`, and the `@angular/build:unit-test` builder supplies the jsdom
  environment and `tests/setup-msw.ts`; calling vitest directly fails with
  `ReferenceError: window is not defined`. Run the whole suite, every time.

## Looking things up

Your model is older than this stack. Two facts this unit turns on are already
measured and given below **with their URLs** — do not re-derive them, and do
not contradict them from memory. Anything else about Angular you need:
`mcp__angular-cli__search_documentation` (`version: 22`,
`includeTopContent: true`, **keywords not a sentence**). Never build a probe
component to discover how the framework behaves. If you cannot settle a fact,
report `blocked` and say what you would have searched for.

## The defect

With items in the cart, pasting `/penztar/szallitas` into the address bar, or
pressing F5 while on it, redirects to `/penztar/kosar?navigationReason=deep-link`.
The user lands on the cart page, sees their full cart, and is given no reason.

The cause: `CartFacade.cart` is `signal<Cart | null>(null)` and the
constructor's restore (`void this.ensureCart()`, `cart.facade.ts:174`) goes
over the network, so on a fresh document load the guard reads `null`. Commit
`827b259` made the guard tell that `null` apart from a confirmed empty cart and
write a truthful reason into the URL, but the bounce itself remained.

**The user's decision, 2026-09-20, after being shown three options (fix only
the stale docstring / build an explanatory banner / stop the bounce): "Ne is
dobjon vissza" — "it should not bounce back at all".** That is what this unit
implements. Do not build a banner and do not propose one.

## Two measured facts you are given

**1. A functional route guard may be async.** Angular 22, "Route guard return
types", says all four guard kinds share the same return types and lists:

> "`Promise<T>` or `Observable<T>` — Router uses the first emitted value and
> then unsubscribes"

https://angular.dev/guide/routing/route-guards#route-guard-return-types

The same page warns about one `CanMatch` speciality, which does **not** bite us
because these guards return a `UrlTree` rather than `false`:

> "NOTE: `CanMatch` behaves differently— when it returns `false`, Angular tries
> other matching routes instead of completely blocking navigation."

Keep returning `true` or a `UrlTree`. Never return `false`.

**2. `inject()` after an `await` throws NG0203.** A functional route guard is
listed as a valid injection context, but only for its synchronous part. The
Angular 22 DI troubleshooting page lists, under when NG0203 occurs:

> "Calling `inject()` after `await` in async functions"

https://angular.dev/guide/di/debugging-and-troubleshooting-di#when-this-error-occurs

**This is the whole difficulty of the unit.** `redirectToStep` and
`redirectToSuccess` in `checkout.guards.ts` each call `inject(Router)`
internally, so calling either one after the `await` throws at runtime while
compiling perfectly. Step 2 below is how that is dealt with; do not solve it
with `runInInjectionContext`, which would work but hides the dependency inside
a closure for no gain over passing it.

## Read these files first

- `src/app/features/checkout/checkout.guards.ts` — the whole file, 226 lines
- `src/app/features/checkout/checkout.routes.ts` — how the four guards are wired
- `src/app/features/cart/cart.facade.ts` lines 84-100 (the `cart` signal), 149-180
  (the constructor's restore) and 186-221 (`ensureCart`)
- `src/app/features/checkout/checkout-state.spec.ts` — the whole guard section,
  including the four cases `827b259` added

## Step 1 — make the three `CanMatchFn` guards async

`contactGuard`, `deliveryGuard` and `reviewGuard` each become
`async (…): Promise<boolean | UrlTree>` and `await cart.ensureCart()` before
reading `cart.cart()`. `successGuard` stays a synchronous `CanActivateFn`.

`ensureCart()` is `async ensureCart(): Promise<void>`, idempotent by its own
docstring ("Safe to call multiple times; the second call is a no-op when an
active cart is already loaded"), and its mutation queue collapses a second
concurrent call onto the first, so awaiting it from a guard while the
constructor's own call is still in flight resolves after that one lands rather
than issuing a duplicate `POST /carts`. **Read those lines and confirm that in
your report** rather than taking my word for it.

## Step 2 — thread the Router through, so nothing injects after the await

Give `redirectToStep`, `redirectToSuccess` and `redirectForCartSnapshot` a
`router: Router` first parameter and delete the `inject(Router)` call from the
body of the first two. Each guard then calls `inject(Router)`, `inject(CheckoutFacade)`
and `inject(CartFacade)` **as its first statements, before any `await`**, and
passes the router down.

`successGuard` is synchronous and could keep injecting inside the helper, but
the helper is shared, so it takes the router as well and injects it at the top
like the others. One shape, not two.

Leave `stepPath` alone: it injects nothing.

## Step 3 — what the reasons now mean

After `await cart.ensureCart()` the snapshot is non-null whenever the request
succeeded, so `redirectForCartSnapshot`'s branches change meaning:

- **non-null with items** → `null`, the guard proceeds. This is the fix: a full
  cart deep-link now stays on the step it asked for.
- **non-null, `items.length === 0`** → `redirectToStep('cart', 'empty-cart')`.
  Unchanged, and now always truthful, because the cart really has been
  confirmed empty.
- **still null** → `redirectToStep('cart', 'deep-link')`. This branch is no
  longer "not loaded yet": it is now only reachable when `ensureCart()` failed
  to produce a cart, for example a network error. **Keep the branch** and
  rewrite its comment to say that.

The existing-order branches (`existingOrder !== null` → `redirectToSuccess`)
keep their current positions exactly.

**Say in your report** whether `ensureCart()` can return without setting the
cart signal — read `shouldApplyResult` and the `if (result.ok)` at the end of
`ensureCart` — so the third bullet is a real path rather than a guess.

## Step 4 — the side effect, to document rather than remove

`ensureCart()` **creates** a cart when none exists, so a visitor with no cart
who deep-links to a checkout step now causes a `POST /carts` from the guard.
That is the same thing the cart page does a moment later on the redirect, so it
creates nothing the user would not have had, but it is a real change: the
guards used to touch no network at all.

Do not try to avoid it — there is no restore-without-create method on the
facade, and inventing one is outside this unit. Document it, and say in your
report what it means for `T19-AC05` ("never submit an order or create a payment
intent"), which is about orders and payment intents and is unaffected.

## Step 5 — the file header docblock

`checkout.guards.ts:1-23` is now wrong in three ways. Rewrite it:

- "Each guard is a synchronous `CanMatchFn`" — three of them are now async.
- "never call the network" — they now await `ensureCart()`.
- "with a `navigationReason` query param the page renders as a banner" — **no
  page reads that param at all**; confirm with
  `grep -rn "navigationReason" src/app` and say what the hits are. The user
  decided against building the banner, so the header must stop claiming one.

Keep the rest of the header's content: the T19 reference, the T19-AC02 and
T19-AC05 points, and the note about `loadSession` clearing contact/address/
paymentMethod on `?reload=1`.

Update each guard's own docstring too, wherever it says the cart "has not
loaded yet" or that a synchronous guard "always reads `null` on a fresh
document load". Those sentences describe the code this unit removes.

## Step 6 — the tests

In `src/app/features/checkout/checkout-state.spec.ts`.

**Two existing tests now assert the old behaviour and must change.** `827b259`
added four cases; the two asserting `navigationReason=deep-link` for
`deliveryGuard` and `contactGuard` set `cart.cart()` to null and call the guard
synchronously. With the fix, awaiting the guard hydrates the cart, so those two
can no longer produce `deep-link`. Rewrite them to assert the new behaviour,
and **say plainly in your report that you changed two existing tests, which two,
and that it is a test following a deliberate behaviour change rather than a
weakened assertion.** Do not delete them and do not replace an exact-value
assertion with a truthiness one.

The suite must end with these five facts pinned, each its own `it`, each
awaiting the guard's promise:

1. `deliveryGuard` with a **non-empty** cart on a fresh load returns `true` —
   the deep-link stays. Set up so `cart.cart()` is null before the call and the
   MSW-backed `ensureCart()` resolves to a cart with at least one item, then
   assert the resolved value is exactly `true` and that `cart.cart()` is no
   longer null. This is the case the unit exists for; if the harness cannot
   express it, say so plainly rather than writing something weaker.
2. `contactGuard` in the same situation returns `true`.
3. `deliveryGuard` with a cart the server confirms is **empty** returns a
   `UrlTree` whose string contains `navigationReason=empty-cart`.
4. `reviewGuard` with an empty cart does the same.
5. `successGuard` with neither an order in memory nor an `orderId` still
   returns a `UrlTree` containing `navigationReason=deep-link`, proving the
   reason survives in the union and that `successGuard` still works after the
   router was threaded through.

Use `toContain` on the `UrlTree` string exactly as the file's existing guard
tests do. Read those first rather than inventing a harness.

## Step 7 — one thing to check and report, not act on

An async `canMatch` delays route matching, so on a cold deep-link the router
outlet stays empty until `ensureCart()` resolves. Read `src/app/app.html` and
`src/app/shared/shell/app-shell.html` and say what is on screen during that
window — whether the header and footer render around an empty outlet, or the
page is blank. MSW is served in-process so the wait is short, but the answer
belongs in the report. **Do not add a loading state**; that is a separate
decision for the orchestrator's user.

## Step 8 — do not touch these files

- `src/app/features/cart/**` — `CartFacade` is not yours; if the unit seems to
  need a change there, report it rather than making it
- `src/app/features/catalog/**` — another runner owns four files there
- `src/app/features/checkout/**` except `checkout.guards.ts` and
  `checkout-state.spec.ts`
- `src/mocks/**`, `src/styles/**`, `src/app/shared/**`, `src/app/api/**`
- `docs/**`, `.claude/**`, `scripts/**` (there is no end-to-end suite in this project by decision, 2026-09-20)

Your files are exactly `src/app/features/checkout/checkout.guards.ts` and
`src/app/features/checkout/checkout-state.spec.ts`. If the change makes another
file fail to compile — `checkout.routes.ts` is the one to watch, since the
guard types change — **report it rather than editing it**, because a route file
that no longer type-checks means the guard signature is wrong.

## Step 9 — gates

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

- `npm run test` exits 0. Before your change it reports **67 test files, 979
  tests**. Say the after numbers and account for every one of them: two
  existing tests rewritten in place add nothing, and each genuinely new `it`
  adds one.
- `npm run lint`, `npm run build` and `npm run format:check` each exit 0.
- This must print `3`:
  `grep -c "await cart.ensureCart()" src/app/features/checkout/checkout.guards.ts`
- This must print nothing:
  `grep -n "renders as a" src/app/features/checkout/checkout.guards.ts`
- This must print nothing — no `inject(` may survive inside a helper that runs
  after an await:
  `grep -n "inject(Router)" src/app/features/checkout/checkout.guards.ts`
  If it prints the guards' own top-of-body injections, that is correct and
  expected; quote the lines and say which function each sits in, and confirm
  none of them is below an `await`.

## Step 10 — run the code review

Run `/code-review xhigh --fix` with the Skill tool and report the result in
`code_review`. Apply nothing it proposes outside your two files. If it proposes
reverting the async change or restoring the bounce, record it and **do not
apply it** — that is the user's decision, not the review's.

## Step 11 — open a task list

This workspace's Stop hook requires one. Open it with TaskCreate at the start
of your turn, one entry per step.

## Step 12 — commit

Two commands, from the worktree root.

```
git add -- src/app/features/checkout/checkout.guards.ts src/app/features/checkout/checkout-state.spec.ts
```

```
git commit -m "fix: let a checkout deep-link wait for the cart instead of bouncing" -m "Pasting a checkout step into the address bar with a full cart redirected to the cart page. CartFacade's cart signal is null until ensureCart lands and that restore goes over the network, so a synchronous guard always read null on a fresh document load and treated a real cart as absent. The previous commit only made the reason in the URL truthful; the bounce itself stayed. The three CanMatch guards now await ensureCart before reading the snapshot, which Angular supports: all guard kinds may return a Promise and the router takes the first emitted value. They still return true or a UrlTree, never false, so CanMatch never falls through to another route. Because inject throws NG0203 after an await, each guard injects the Router, CheckoutFacade and CartFacade as its first statements and the three redirect helpers take the router as a parameter instead of injecting it themselves. The reasons change meaning with the wait: empty-cart is now only ever a cart the server confirmed empty, and deep-link is what is left when ensureCart could not produce a cart at all. The guards now touch the network, and ensureCart creates a cart for a visitor who has none, which is what the cart page would have done a moment later on the redirect; T19-AC05 is untouched, since no order and no payment intent is created. The file header no longer claims a banner renders the navigationReason param: nothing in src/app reads it." -- src/app/features/checkout/checkout.guards.ts src/app/features/checkout/checkout-state.spec.ts
```

No heredoc, no `$(...)`, no `-F`, no `git -C`, no `git push`, and do not invoke
the `git-commit` skill.

## Your report

Answer every field. A missing field sends the report back.

- `bash_tool_calls_made`
- `ensure_cart_reading`: what you read in `cart.facade.ts` about idempotency,
  the queue collapsing a concurrent call, and whether `ensureCart()` can return
  without setting the signal. Quote the lines.
- `guards_after`: the three async guards and `successGuard` quoted whole.
- `helpers_after`: the three redirect helpers quoted whole, with their new
  signatures.
- `injection_order`: for each guard, the line numbers of its `inject(` calls
  and of its `await`, proving every injection is above every await.
- `reason_semantics`: what each of the three `redirectForCartSnapshot` branches
  now means, and the comment you wrote for the third.
- `header_rewrite`: the old header and the new one, quoted, plus the
  `grep -rn "navigationReason" src/app` output.
- `side_effect`: the cart-creation consequence and what it means for T19-AC05.
- `routes_file`: whether `checkout.routes.ts` still type-checks unchanged, with
  the build output that proves it.
- `tests_changed`: the two existing cases you rewrote, quoted before and after,
  and why that is not a weakened assertion.
- `tests_added`: the new cases, and any you could not express, with the reason.
- `gates`: the four exit codes, with the before and after test counts and the
  arithmetic that accounts for the difference.
- `acceptance`: each bullet from Step 9 with the command's real output.
- `cold_load_window`: the Step 7 answer.
- `self_check`:
  - `invariant_tests`: delete `await cart.ensureCart()` from `deliveryGuard`,
    re-run, paste the failure, restore it. Then change `'empty-cart'` to
    `'deep-link'` in the second branch, re-run, paste the failure, restore it.
    Say which tests each break.
  - `exact_value_assertions`: confirm every new and rewritten assertion
    compares to an exact value.
- `behaviour_deltas`: what a user sees differently, for a full cart, an empty
  cart, no cart at all, and a failed cart request.
- `lookups`: every lookup with its URL, or `none`.
- `code_review`: the result, including anything proposed outside your two files
  that you did not apply.
- `commit`: the sha from `git log --oneline -1`.
- `tasks_done` and `open_tasks`.
- `browser_watch`: three or four lines for the browser pass — which routes to
  hard-reload in which cart state, what URL must result, and what must be on
  screen.
