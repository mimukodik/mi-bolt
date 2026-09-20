# Handover — mi-bolt fix backlog, state as of 2026-09-20

Written by the orchestrating session at the user's request so another session
can pick the work up cold. It is a snapshot, not a rule file: where it
disagrees with `.claude/CLAUDE.md` or anything under `.claude/rules/`, those
win. English, because that is what the repository and every rule file use; the
conversation with the user is Hungarian.

Read this top to bottom once. The first two sections are what you have to act
on; everything after them is context you will need but not immediately.

---

## 1. Read this first: one commit is finished and deliberately not landed

Branch **`run/deeplink-wait`** carries commit **`e172c9a`** ("let a checkout
deep-link wait for the cart instead of bouncing"). Both it and
`feat/mi-bolt-mvp-implementation` are pushed, so `git fetch origin` is all it
takes to get them. The commit is verified and is **not** cherry-picked.

Everything about the machine it was produced on is gone: the runner's worktree,
its `coder-agent.sh` session record and its scratchpad do not travel. Treat
`run/deeplink-wait` as an ordinary branch you fetch, and run the fix round below
with a **fresh** runner rather than trying to resume anything. The brief that
produced the commit is preserved at `docs/briefs/brief-deeplink-wait.md`, and
`docs/briefs/README.md` explains the shape.

The commit is held back because the verification found **one blocking finding**,
and the user has already decided what to do about it.

### The finding

Alongside the async-guard change it was briefed for, the runner also reordered
`redirectForCartSnapshot` in `src/app/features/checkout/checkout.guards.ts`.

Before (`e172c9a^`, which is what is on the branch today):

```ts
if (cartSnapshot === null) {
  if (existingOrder !== null) return redirectToSuccess(existingOrder.id);
  return redirectToStep('cart', 'deep-link');
}
if (cartSnapshot.items.length === 0) {
  if (existingOrder !== null) return redirectToSuccess(existingOrder.id);
  return redirectToStep('cart', 'empty-cart');
}
return null;
```

After (`e172c9a`):

```ts
if (existingOrder !== null) {
  return redirectToSuccess(router, existingOrder.id);
}
if (cartSnapshot === null) { return redirectToStep(router, 'cart', 'deep-link'); }
if (cartSnapshot.items.length === 0) { return redirectToStep(router, 'cart', 'empty-cart'); }
return null;
```

`existingOrder` is now consulted unconditionally instead of only inside the
null / empty branches. The user-visible effect: finish an order, press "Vissza a
kosárhoz" on the success page (which does **not** call `resetDraft()`), add an
item, head for checkout — the old code let you through because the cart has
items, the new code bounces you to the **old** receipt until you press "Új
vásárlás".

Three things make it a blocking finding rather than an improvement: the brief
never asked for it, no test covers the `existingOrder set AND cart has items`
combination, and the three guard docstrings the commit left untouched still say
the opposite ("When the cart has items the user is starting a fresh purchase …
and the wizard must proceed").

### The user's decision, 2026-09-20

**"Állítsuk vissza"** — restore the previous shape. `existingOrder` is consulted
only inside the `cartSnapshot === null` and `cartSnapshot.items.length === 0`
branches, as the docstrings prescribe. Zero behaviour change against what is on
the branch today; the deep-link fix lands independently of it.

### What to do

1. `git fetch origin`, then start a **new** runner whose worktree checks out the
   existing `run/deeplink-wait` branch (`coder-agent.sh start --worktree <name>
   --branch run/deeplink-wait` — an existing branch is checked out rather than
   created). The brief says: restore the nesting, keep the `router` parameter,
   keep everything else in `e172c9a` exactly as it is, add nothing, and commit
   as a **second** commit on the branch rather than amending.
2. Verify the fix round with a fresh `coder-sonnet` (mandatory, see §6).
3. Cherry-pick both commits onto `feat/mi-bolt-mvp-implementation`, then remove
   the worktree and delete the branch **in the same turn**.
4. Run the four gates yourself and read the exit codes. A subagent's green
   report is not a run.

### The rest of `e172c9a`, which is good and must survive the fix round

- `contactGuard`, `deliveryGuard` and `reviewGuard` are `async` and
  `await cart.ensureCart()` before reading the snapshot. `successGuard` stays
  synchronous.
- Every `inject()` sits above every `await` — verified line by line
  (contactGuard 150-152 vs await 153; deliveryGuard 181-183 vs 184; reviewGuard
  215-217 vs 218). `redirectToStep`, `redirectToSuccess` and
  `redirectForCartSnapshot` take `router: Router` as a parameter and inject
  nothing. This matters: `inject()` after an `await` throws NG0203, and it
  compiles perfectly.
- No guard returns `false` anywhere. A `CanMatch` returning `false` falls
  through to another matching route instead of redirecting.
- `ensureCart()` cannot reject — the mutation queue turns every settlement into
  a resolved `undefined` (`cart-mutation-queue.ts:167-170`), `dispatchCreate`
  wraps its whole body in try/catch, and `mapError` is total. So the guards need
  no `try`/`catch`; this was checked because the brief had not thought of it.
- `success-page.spec.ts` was edited although it was not on the file list. That
  edit is approved: making the guards async forces those tests to `await`, the
  `toBeInstanceOf(UrlTree)` assertions are unchanged, and the one
  `runInInjectionContext` call wrapping three guard calls had to become three.
- Reason semantics moved: `empty-cart` now only ever means a cart the server
  confirmed empty (including a freshly minted one for a brand-new visitor), and
  `deep-link` is what is left when `ensureCart()` could not produce a cart at
  all.
- Known, disclosed side effect: `ensureCart()` creates a cart when none exists,
  so route matching now issues a `POST /carts` for a visitor who had none. That
  is what the cart page would have done a moment later on the redirect.
  `T19-AC05` ("never submit an order or create a payment intent") is untouched.
- Cold-load window: `checkout.routes.ts` guards the **child** route, so
  `CheckoutLayout` (header, demo notice, step ribbon, footer) renders
  immediately and only the inner `<router-outlet>` is empty while the guard is
  pending. Not a blank page.

---

## 2. Read this second: the browser pass everything is waiting on

Four landed changes have **never been exercised in a real browser**, and
`.claude/rules/browser-verification.md` makes that mandatory before any of them
can be called done. They were deliberately batched rather than run one at a
time. Task **#24** ("Phase 1 close") is the entry that owns it.

The orchestrator starts `npm start` (`ng serve`) itself and stops it afterwards;
a `real-browser-sonnet` agent drives the browser and never touches the server.
There is no database — the backend is MSW, in-process.

What to check, per change:

**`8f1183e` — `NgOptimizedImage` removed.** `/telefonok` at 1280 and 375, and a
product page after a variant reload: `list_console_messages` must show **no
NG02955** and no other error. Images must still fill their boxes.

**`00baa22` — the checkout centreline.** At 1280, `main.layout-main` must
measure **left=48, right=1232** on all five checkout routes
(`/penztar/kosar`, `/penztar/adatok`, `/penztar/szallitas`,
`/penztar/ellenorzes`, `/penztar/siker/:id`). Before the fix, `kosar` was
177/1103 and `adatok` 185.66/1094.34. `/` and `/telefonok` must stay at 48/1232.
At 375, no new horizontal scrollbar.

**`06f4623` + `7b9a01e` — the focus hand-off.** On
`/telefonok?inStock=true&is5g=true`, activate each control with **Tab then
Enter/Space, not a synthetic click** — the browser's input-modality tracking is
the whole point, and a synthetic click does not exercise it. After each,
`document.activeElement` must be `[data-testid="result-count"]` with a **visible
focus ring**, at 1440 and below 1024:
1. `[data-testid="applied-chip-remove-inStock"]`
2. `[data-testid="applied-filters-clear"]`
3. the empty-state reset inside `[data-testid="catalog-empty"]` (reach it with
   `q=zzz-no-match`)
4. the retry inside `[data-testid="catalog-error"]` (force a 503) — and here
   **read the counter's text**: it must say "A katalógus betöltése nem
   sikerült.", never "Nincs találat.".

**`e172c9a`, once it lands.** Add two items, then hard-reload directly on
`/penztar/szallitas`: must **stay** there, console clean, cart badge reads 2.
Same on `/penztar/ellenorzes` with contact and delivery saved. With an empty
cart, must redirect to `/penztar/kosar?navigationReason=empty-cart`. During the
pending-guard window, screenshot to confirm the shell is visible around an empty
content area.

---

## 3. Where the repository stands

- Branch **`feat/mi-bolt-mvp-implementation`**, cut from `main`. HEAD
  **`fd06a1a`**. Working tree clean. The last commit that touched product code
  is `7b9a01e`; the three after it are this document and `docs/briefs/`.
- Pushed to `origin` at the user's direct instruction, so the work could be
  continued on another machine. Nothing is waiting locally. Pushing stays the
  orchestrator's own command, only under the `task-execute-workflow` entry that
  owns it or on the user's direct instruction — do not push on your own
  judgment, and no spawned agent ever pushes.
- Gates at `7b9a01e`, run by the orchestrator, not taken from any report:
  `npm run test` exit 0 at **67 test files / 986 tests**; `npm run lint` exit 0
  (27 pre-existing warnings, all in `src/app/api/generated/**`); `npm run build`
  exit 0; `npm run format:check` exit 0. Coverage sits around 85.9% statements,
  80.7% branches, 86.6% functions, 88.8% lines against a floor of 80/75/80/80.
- Two branches on `origin`: `feat/mi-bolt-mvp-implementation` and
  `run/deeplink-wait` (§1). Nothing else is left anywhere — no worktree to
  inherit, no background process, no runner to resume.

### Commits this session

| sha | what |
|---|---|
| `ac171e9` | `isRecord` guard, nine `as Record` casts out of `src/mocks/` |
| `457f998` | DemoNotice `'memory'` state wired through the `PERSISTENCE_MODE` token |
| `c63b992` | `hero-shortcuts` outer/inner wrapper |
| `468bf9a` `0cdfedb` `1d6ae56` `e22ad2d` `06f4142` | rule edits in `.claude/rules/orchestrated-coding.md` |
| `9cf3c21` | `isSort` + `isStorageBucket`, four casts out of `catalog-query.ts` |
| `e91d0d9` | `isCartSnapshot` + `isSortMode`, six casts out |
| `4329ff1` | `CartError.code` no longer typed `ProblemCode` while holding `'UNKNOWN'` |
| `8f1183e` | `NgOptimizedImage` → plain `<img>` in `ProductImage` and the featured grid |
| `00baa22` | `width: 100%` on the checkout `.layout-main` — the centreline fix |
| `827b259` | the guards tell an unloaded cart from an empty one |
| `aa6ba9d` | nine casts under `src/mocks/` replaced with type guards |
| `22d2ee2` | dead `guardForSegment` deleted |
| `06f4623` | focus hand-off to the results counter |
| `7b9a01e` | the counter stops calling a failed load an empty result |
| `b9cc20b` `5aa1346` `fd06a1a` | this document, and `docs/briefs/` — docs only |

---

## 4. Decisions the user has made that are not yet executed

Each of these is settled. Do not re-ask; execute.

1. **Revert the `redirectForCartSnapshot` reordering** — §1. ("Állítsuk vissza")
2. **Task #80 — the deep-link must not bounce.** Asked as three options
   (docstring only / build a banner / stop the bounce); the user chose **"Ne is
   dobjon vissza"**. `e172c9a` implements it.
3. **Task #79 — `guardForSegment` deleted.** Done, `22d2ee2`.
4. **Task #81 — the results counter needs a live region.** The user chose a
   **separate visually hidden region**: an `sr-only` element carries
   `aria-live="polite"` and `aria-atomic="true"`, the visible counter stays
   silent with no `role` and no `aria-live` of its own. That shape is what
   avoids a double announcement, because the visible div is now focusable and is
   focused from `CatalogPage.focusResultCount()`. `.sr-only` already exists in
   `src/styles/primitives.css` and `catalog-page.html:25` is the precedent.
   `resultCountLabel()` stays the single source of the text. Blocked on #80.
   A real screen-reader check is what settles whether the text is announced once
   or twice — unit tests cannot.

---

## 5. Known defects and open questions

### Carried, not fixed

- **The results counter has no live region** — #81 above. A screen-reader user
  who applies a filter is never told how many results are left.
- **`navigationReason` is written to the URL and nothing reads it.** Confirmed
  by grep across `*.ts` and `*.html`: every hit is in `checkout.guards.ts` and
  its spec. The user rejected building the banner. After `e172c9a` the
  parameter still travels; the guards' file header no longer claims a banner
  renders it.
- **Two deliberate wordings for one failure**: the counter says "A katalógus
  betöltése nem sikerült." while `ErrorState` above it says "Nem sikerült
  betölteni a katalógust." Chosen in the brief, on record so nobody later reads
  it as an oversight.
- **Two behaviours tightened in `aa6ba9d`**, both argued and both narrow: a
  present-but-malformed `globalThis.sessionStorage` is now rejected upfront and
  treated as absent, so `isDenied()` stays false where it used to flip true on
  first write (no real browser produces that object; Safari's private mode,
  whose `sessionStorage` has every method and throws on write, still reaches the
  same caught-exception path); and an array JSON body to the order endpoint now
  gets the top-level invalid-JSON 400 instead of per-field errors.

### Still need the user's decision — ask before acting

These were in the task list before this session and were never reached. Each
needs its own `AskUserQuestion`, not a line in a report.

### Open work with no blocking question

- **#46** — the remaining `as` casts. Measured at the start of this session as
  22 in hand-written source; `aa6ba9d` removed nine of them. What is left, by
  file: `cart.facade.ts` (4, on `inputs.intent.payload` — this one is invention
  rather than transcription, the fix being a discriminated union so the payload
  narrows), `contact-step.ts` (2), `price-block.ts` (2 — both false positives,
  the word "as" in prose), `variant-selection.ts` (1 — also prose),
  `order-submission.ts` (1), `checkout.routes.ts` (1), `checkout.facade.ts` (1),
  `filter-drawer.ts` (1). Re-measure rather than trusting this list.
- **#54** — three leftovers from the production-build fix: `environment.ts` is
  compiled by no configuration any more, four docblocks contradict the artifact,
  and `;variant=` matrix parameters are ignored while the app emits `?variant=`
  (that third one needs its own reproduction before anyone changes the reader).
- **#55** — the two cross-cutting fix docs no cluster can hold.
- **#24** — Phase 1 close, which owns the browser pass in §2.
- **#25 – #29** — Phase 2a to 2d and the final close, roughly 52 fix docs.

---

## 6. How this work is run — the parts that are easy to get wrong

The binding rules are in `.claude/CLAUDE.md` and `.claude/rules/`. What follows
is the subset this session kept tripping over or had to establish.

- **Only `coder-sonnet` subagents.** The user's instruction: "csak coder-sonnet
  agenttel dolgozhatsz barmit is csinaslz". Three agents in parallel at most.
- **At most two `coder-agent.sh` runners at once.**
- **Every runner's finished work is verified by a spawned `coder-sonnet` before
  the cherry-pick**, and a `blocking` finding goes back to the runner as a fix
  round rather than onto the branch. This session caught three real problems
  that way that the runners' own `/code-review xhigh --fix` passes had missed.
  The verifier writes nothing, commits nothing, and runs no gate.
- **The cherry-pick and the worktree's removal are one step.** The user had to
  ask twice about leftover worktrees: "worktree -ket megint nem kezeled ott
  vannak hagyva mint egy szemet!" and then "miert kell erte szolnom?".
  `git cherry <branch> <runner-branch>` settles whether a commit is already on
  the branch: `-` means yes, `+` means the worktree stays.
- **The orchestrator runs the gates itself** before every commit and reads the
  exit codes.
- **Unit tests only, no e2e.**
- **Never probe the framework.** Read angular.dev through
  `mcp__angular-cli__search_documentation` (`version: 22`, keywords not a
  sentence) and put the URL beside the claim. The user's words: "nem kell
  angular csapdakat merni!!! … tippelgetes helyett weben le van irva minden!"
- **No `NgOptimizedImage`.** "nem kell ngoptimizedimage!!!!!!!!!! sosem kertem
  ilyet".
- **A surgical, behaviour-identical out-of-scope change needs no question** —
  take it and say why it was safe. "ha neked megfelel es sebeszi pontossagu
  megoldasok akkor nem kell jelezned". A change that is *not* behaviour-identical
  is a different thing, and §1 is exactly that case.
- **`scripts/coder-agent/.env` is never read**, not even its key names with the
  values masked. It holds live production credentials.
- **No agent runs `git push`**, at any repository, including a local stand-in.

---

## 7. Traps measured this session — do not rediscover these

- **`npx vitest run <one spec file>` does not work here.** `npm run test` is
  `ng test`, and the `@angular/build:unit-test` builder is what supplies the
  jsdom environment and `tests/setup-msw.ts`. Calling vitest directly fails with
  `ReferenceError: window is not defined`. Two runners hit this; put the warning
  in every brief.
- **`inject()` after an `await` throws NG0203**, and a functional route guard is
  an injection context only for its synchronous part.
  https://angular.dev/guide/di/debugging-and-troubleshooting-di#when-this-error-occurs
- **A `CanMatchFn` may be async.** All four guard kinds share the same return
  types, `Promise<T>` and `Observable<T>` included; the router takes the first
  emitted value. https://angular.dev/guide/routing/route-guards#route-guard-return-types
  An earlier brief in this session asserted the opposite and was wrong.
- **`CanMatch` returning `false` falls through to another matching route**
  rather than redirecting. Return `true` or a `UrlTree`, never `false`.
- **A flex item with an `auto` cross-axis margin is never stretched.** MDN's
  `align-self` page: "If a flexbox item's cross-axis margin is `auto`, then
  `align-self` is ignored." That is why the centreline fix is `width: 100%` and
  not `align-self: stretch`.
- **A global stylesheet reaches into a component under emulated encapsulation**,
  so `primitives.css`'s global `:focus-visible` covers a component's elements
  and no component-level rule was needed.
  https://angular.dev/guide/components/styling#viewencapsulationemulated
- **`CatalogFacade`'s `'loading'` and `'error'` are mutually exclusive by
  construction** — `buildVm()` checks `error !== null` first, and every request
  start synchronously clears `errorSignal`. A failing refresh goes
  `'refreshing'` → `'error'`, never through `'loading'`.
- **`Element.textContent` is non-nullable** in the installed TypeScript's DOM
  lib (only `Document` and `DocumentType` return `null`), so `?.` on it is what
  `@typescript-eslint/no-unnecessary-condition` flags, and removing it is not a
  weakened null check.
- **The scope-watch monitor greps the runner's transcript**, so it fires on any
  line the runner merely *read* — including the launch-time copy of
  `.claude/rules/orchestrated-coding.md`, which contains the literal string
  `BUILD FAILED`, and the brief's own warning text. Filter to lines containing
  `"toolUseResult"` and start from the transcript's current end, or every re-arm
  replays old failures. The working script is in the session scratchpad as
  `watch-scope.sh`; it is not committed.
- **zsh quoting**: `npx eslint $FILES` passes one argument, not many — list the
  paths explicitly or use `${=FILES}`. `--include=*.ts` must be quoted.
  `xargs -a` does not exist on macOS.
- **Every path in a Bash call is absolute.** A `cd` in a compound command
  outlives the call in the main session and does not carry at all in a spawned
  agent.

---

## 8. Where the working files are

**Every brief written this session is committed at `docs/briefs/`**, with a
`README.md` there explaining the shape and listing which unit each one drove.
They were written in a session scratchpad that does not survive the session, and
the user asked for them to be kept; they are the worked examples of the
spoon-fed style the user asked for ("figyelj oda az erős promptolásra inkább
legyen szájbarágós"). `docs/briefs/brief-deeplink-wait.md` is the one the
pending work in §1 was built on.

`docs/briefs/watch-runner-scope.sh` is the monitor script each runner was
supervised with, alongside `coder-agent.sh watch-status`. Its README entry
records the two things in it that were learned the hard way: scan only lines
containing `"toolUseResult"`, because the transcript also holds everything the
runner *read* — including the rule file that contains the literal string
`BUILD FAILED` — and start from the transcript's current end, or every re-arm
replays failures already reported.

`scripts/coder-agent/sessions/<name>/` holds a runner's `claude.args`, `meta`
and per-turn results, and `coder-agent.sh result <name> --turn N` prints its
report. **That store is local to the machine the runner ran on, and
`coder-agent.sh rm` deletes it** — its last statement is `rm -rf` over the
session directory, so a runner's report and its exact `--allowedTools` tail go
with it. It does not delete the git branch. Nothing from this session's store
travels; what survives is the branches, the commits, and this directory.

Nothing in `e172c9a` can be taken over piecemeal, either. The async-guard change
and the reordering §1 rejects sit in the same file and the same function region;
`checkout-state.spec.ts`'s rewritten cases only pass with the new guards; and
`success-page.spec.ts` is meaningless without them. There is no file-level or
commit-level slice that delivers value without the defect, which is why §1 is a
fix round rather than a partial cherry-pick.
