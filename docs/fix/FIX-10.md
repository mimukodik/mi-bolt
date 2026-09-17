# FIX-10 — Make a reload restore the cart

Status: PLANNED — not executed.
Severity: blocker
Source: A2 finding 1, A2 "Adjacent uncoordinated workaround", B1 (reload of a filled cart),
plus two gaps the orchestrator measured directly and named in Evidence below.

## Why this is wrong

`docs/spec/architecture.md:109` states the required behaviour in one clause: *"Before
ordinary full reload, contact/address remain volatile by design: **the cart restores**,
earliest incomplete checkout step reopens and explains the reset."* Line 105 of the same
section says why the mock has to do that work itself — *"MSW browser handlers run on the
page side; the MSW service worker is an interception bridge, not a persistent backend
database. Never assume its memory survives page reload"* — and line 107 names the
mechanism: *"Use a minimal dependency-free sessionStorage snapshot adapter for tab-scoped
demo persistence, behind a typed interface."* The state-owner table in section 5 settles
the layer: `docs/spec/architecture.md:52` gives `CartFacade` the source of truth *"current
mock Cart DTO"*, and `:55` gives `MockRepository` the lifetime *"each demo tab/test
context"* over the *"domain catalogue/cart/draft/intents/orders/idempotency maps"*. No
app-layer service is entitled to keep a second copy. Design rule R24
(`.claude/skills/mi-bolt-design/SKILL.md:76`) adds *"Preserve the cart, filters and
previously entered non-sensitive data after an error."*

Today a reload loses the cart, and two app-layer services have each hand-rolled their own
browser store to paper over parts of the same hole. Under D1 the specification is right
and the code is wrong.

### The context the executor needs before reading any of this

**MSW is a service worker running inside the browser, not a server.** There is no backend
process anywhere in this repository. `src/mocks/repository.ts` is ordinary page-side
JavaScript memory — a handful of `Map` objects — and **every reload destroys it**. There
is nothing to ask for the cart after a reload. That is exactly why
`docs/spec/architecture.md:107` mandates one tab-scoped `sessionStorage` snapshot adapter
behind a typed interface, and why the fix belongs in the mock layer rather than in the
Angular app.

The user settled the direction themselves, and the reasoning is theirs:

> "a cart bongeszo storage csak cache, mert backendnek kene vissza adnia ami most mock msw
> server"

("the cart's browser storage is only a cache, because the backend should be returning it,
and right now that is the mock MSW server.")

They then chose **"app-ból ki, mockba be"** ("out of the app, into the mock"). That is
decision D5 and it is not reopened here.

### Why all four parts below are needed together

Removing the app-side stores alone leaves a reload with nothing to restore. Calling
`Persistence.save()` alone writes a snapshot the next page load cannot find, because the
page load sends a different session namespace. Making the session id survive alone gives
the page a stable namespace with nothing written into it. And even with all three, the
restored cart is still unreachable, because the restore path never registers the cart
against a session and `POST /carts` always mints a fresh empty one.

**Part 1 is the root cause nobody found until the orchestrator went looking.** It is what
makes parts 2 and 3 observable at all, so it is done first. Part 4 is the cleanup and it
is done **last**: deleting the receipt fallback before the mock persists receipts would
regress the behaviour commit `e8f5b3f` ("fix: F3 success page receipt fallback
(sessionStorage)") was made to deliver.

## Evidence

### 1. The demo session id is regenerated on every reload — by design

`src/app/core/api/demo-session.interceptor.ts:22`:

```ts
const sessionId: string = sanitizeSessionId(globalThis.crypto.randomUUID());
```

That statement runs at **module evaluation**, once per page load. The file's own header
comment, `src/app/core/api/demo-session.interceptor.ts:3-7`, states the intent in full:

```ts
// Adds the X-Demo-Session header to every outgoing HTTP request so MSW can
// namespace state per browser tab. The session id is generated once when the
// module is first evaluated and reused for the rest of the process, matching
// the spec's "process-local" wording (a fresh tab = fresh reload = fresh
// module instance, so a new session id is created per session).
```

This is quoted in full because it shows the behaviour is **deliberate** and has to be
argued with rather than treated as a slip. The argument against it is
`docs/spec/architecture.md:111`: *"X-Demo-Session is an opaque namespace, NOT security.
Distinct browser **contexts** have separate sessionStorage and repositories."* The
specification scopes the namespace to the browser context — the tab — and a tab survives
its own reload; `sessionStorage` is the storage whose lifetime matches that scope exactly,
which is why line 107 names it. The comment's equation *"a fresh tab = fresh reload"* is
the error: a reload is the same tab.

Consequence: after F5 the app sends a different `X-Demo-Session` header, the mock looks in
a different namespace, and the snapshot on disk is unreachable even when one exists.

### 2. `Persistence.save()` is never called by the running application

`src/mocks/persistence.ts:189-194` is the only `save()` in the mock layer:

```ts
  /** Persists a snapshot for the given scenario. */
  save(scenarioName: ScenarioName, snapshot: MockSnapshot): { ok: boolean } {
    const key = snapshotKey(scenarioName);
    const result = this.adapter.write(key, JSON.stringify(snapshot));
    this.lastSnapshot = snapshot;
    return result;
  }
```

Measured on commit `db6d295`: `grep -rn "\.save(" src` returns **no matches at all**. The
only callers in the repository are four lines in one spec,
`tests/mocks-handlers.spec.ts:136,190,193,217`, which construct a `Persistence` instance
directly.

The read half is wired and works: `src/core/bootstrap-demo.ts:62-63` calls
`persistence.hydrate(scenario.name)` and forwards the result into `startMockWorker`, and
`src/mocks/browser.ts:114-118` seeds the repository from it. There is simply never
anything in storage to hydrate.

### 3. The restore path cannot reconnect a hydrated cart to a session

This is a second gap, measured by the orchestrator, that A2 did not report.
`src/mocks/repository.ts:264-300` (`loadPersistedCart`) ends with:

```ts
    const cart: Cart = {
      id: persisted.id,
      version: persisted.version,
      status: 'active',
      sessionId: '',
      items,
      createdAt: persisted.lastUpdatedAt,
      expiresAt: new Date(Date.parse(persisted.lastUpdatedAt) + 24 * 60 * 60 * 1000).toISOString(),
    };
    this.carts.set(cart.id, cart);
```

`sessionId` is the empty string and `cartsBySession` is never touched. Meanwhile
`src/mocks/cart/cart-domain.ts:166` — the `POST /carts` path — is:

```ts
    const cart = this.repository.createCart(input.sessionId);
```

`Repository.createCart` (`src/mocks/repository.ts:169-187`) always mints a **new** cart.
The repository already carries the method that would return an existing one,
`Repository.ensureCart` (`src/mocks/repository.ts:190-196`, docstring: *"Returns the cart
associated with a session, creating one if absent"*), and nothing in `src/` calls it.

So even with parts 1 and 2 in place, the first request after a reload —
`CartFacade.ensureCart()` at `src/app/features/cart/cart.facade.ts:186-213`, which fires
`POST /carts` because `cartWritable` is null on a fresh page — returns a brand-new empty
cart, and the hydrated one sits in `carts` forever unreachable, because
`src/mocks/cart/cart-domain.ts:176` rejects any `getCart` whose
`cart.sessionId !== input.sessionId`.

### 4. Two app-layer services hand-roll their own browser stores

`src/app/features/checkout/checkout.facade.ts:80-105`:

```ts
const ORDER_RECEIPT_STORAGE_KEY = 'mi-bolt.lastOrderReceipt';

function persistReceipt(receipt: OrderReceipt): void {
  if (typeof globalThis.sessionStorage === 'undefined') return;
  try {
    globalThis.sessionStorage.setItem(ORDER_RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
  } catch {
```

Called at `:602` and `:753`, consumed at `:612-616`. Its justifying comment at `:69-78`
says the mock's repository "is rebuilt whenever MSW re-registers its service worker" —
which is true, and is the problem this task fixes at its source rather than beside it.

`src/app/features/checkout/order-submission.ts:212`:

```ts
export const SAFE_ORDER_STORAGE_PREFIX = 'mi-bolt:checkout:safe-order:';
```

with a whole `localStorage`-backed store at `:160-217` (`SafeOrderStorage`,
`LocalStorageBackedStore`, `InMemoryStore`, `storageKeyForCart`) and the binding hooks at
`:380-387`. Note that this one uses **`localStorage`**, which outlives the tab —
`docs/spec/architecture.md:107` says tab-scoped `sessionStorage`, so the storage class
itself is wrong as well as the layer.

Measured: the only live consumer of `OrderSubmission` anywhere in `src/` is
`src/app/features/checkout/payment-progress.ts:147,195`, and it calls exactly one method,
`watchProgress`. The checkout flow commits through
`CheckoutFacade.commitOrderWithKey` (`checkout.facade.ts:732`), not through
`OrderSubmission`, so the safe-order store is **unreachable from the running
application** — it is exercised only by `tests/order-submission.spec.ts`.

### 5. What the user sees today

Browser run on the baseline: add an item to the cart, press F5. The cart page renders the
empty state — `src/app/features/cart/cart-page.html:42`, `[title]="'A kosarad üres'"` —
and the network log carries a fresh `POST /api/v1/carts` returning `201`. That request is
the proof: the app asked for a new cart because it had none, and the mock gave it one
because it had none either.

## What to change

Four parts, in this order. Do not reorder them; the reason each sits where it does is
given under "Why this is wrong" above.

### Part 1 — `src/app/core/api/demo-session.interceptor.ts`: the id survives the reload

Replace line 22 and rewrite the header comment's third sentence so the file no longer
documents the behaviour being removed.

Delete line 22 entirely and add, below the `DEMO_SESSION_PATTERN` constant:

```ts
/** sessionStorage key holding the tab-scoped demo session id. */
const DEMO_SESSION_STORAGE_KEY = 'mi-bolt.demo-session';

/** Cached id for this page. Resolved on the first intercepted request. */
let cachedSessionId: string | null = null;

/**
 * Returns the sessionStorage object, or null when the environment has
 * none (the Node unit runner) or denies access (private browsing).
 */
function readableStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Resolves the tab-scoped demo session id. `architecture.md` section 8
 * scopes the demo namespace to the browser context, and a reload is the
 * same context, so the id is read back from sessionStorage when one is
 * already stored and generated once otherwise. A storage-denied context
 * falls back to a page-local id, which is exactly the behaviour every
 * context had before this change.
 */
function resolveSessionId(): string {
  const storage = readableStorage();
  const existing = storage?.getItem(DEMO_SESSION_STORAGE_KEY) ?? null;
  if (existing !== null && DEMO_SESSION_PATTERN.test(existing)) {
    return existing;
  }
  const fresh = sanitizeSessionId(globalThis.crypto.randomUUID());
  try {
    storage?.setItem(DEMO_SESSION_STORAGE_KEY, fresh);
  } catch {
    // Storage denied between the read and the write. The id stays
    // page-local, which is the pre-existing behaviour rather than a
    // new failure mode.
  }
  return fresh;
}

function currentSessionId(): string {
  if (cachedSessionId === null) {
    cachedSessionId = resolveSessionId();
  }
  return cachedSessionId;
}
```

Then change line 40 from `req.headers.set('X-Demo-Session', sessionId)` to
`req.headers.set('X-Demo-Session', currentSessionId())`.

**Do not touch `sanitizeSessionId` or `quoteVersion`.** The contract guard at `:55-63`
stays exactly as it is; the stored value is re-tested against `DEMO_SESSION_PATTERN`
before it is trusted so a hand-edited storage entry cannot widen the contract.

Rewrite the header comment at `:4-7` to say what the code now does. Replace those four
lines with:

```ts
// namespace state per browser tab. The id is stored in sessionStorage,
// which is scoped to the browser context exactly as architecture.md
// section 8 requires, so a reload of the same tab keeps the namespace
// and the mock's persisted snapshot stays reachable. A new tab gets a
// new id because sessionStorage is not shared between tabs.
```

Ten spec files import `demoSessionInterceptor` (`tests/order-submission.spec.ts:50`,
`tests/variant-selection.spec.ts:52`, `tests/checkout-f6.spec.ts:56`,
`tests/success-page.spec.ts:65`, `tests/checkout-f2.spec.ts:36`,
`tests/checkout-f8.spec.ts:58`, `tests/checkout-state.spec.ts:64`,
`tests/cart.facade.spec.ts:43`, `tests/contract/sdk-transport.spec.ts:32`,
`tests/contract/operation-matrix.spec.ts:68`). They run under `environment: 'node'`
(`vitest.config.ts:507`), where `globalThis.sessionStorage` is undefined, so
`readableStorage()` returns null and the behaviour is byte-for-byte what it is today: one
id per worker process. None of them should need an edit. If one does, that is a
finding to report, not a test to loosen.

### Part 2 — reconnect a restored cart to its session

Three files: `src/mocks/repository.ts`, `src/mocks/browser.ts` and
`src/mocks/cart/cart-domain.ts`.

**`src/mocks/repository.ts`.** Change `loadPersistedCart` (`:264`) to take the session id
and register the cart against it. Change the signature to:

```ts
  loadPersistedCart(persisted: import('./persistence').PersistedCart, sessionId: string): void {
```

and in the `const cart: Cart = { … }` literal replace `sessionId: '',` with
`sessionId,`. Immediately after `this.carts.set(cart.id, cart);` add:

```ts
    this.cartsBySession.set(sessionId, cart.id);
```

In the same file, add a **read-only** session lookup beside `ensureCart`, which Part 3's
snapshot builder needs:

```ts
  /**
   * Returns the session's cart, or undefined when it has none. Unlike
   * `ensureCart` this never creates one, so a caller that is only
   * reading — the snapshot builder — cannot mint a cart as a side
   * effect of persisting.
   */
  findCartBySession(sessionId: string): Cart | undefined {
    const cartId = this.cartsBySession.get(sessionId);
    if (cartId === undefined) return undefined;
    return this.carts.get(cartId);
  }
```

**`src/mocks/browser.ts`.** At `:116-118` pass the session id the snapshot was written
under:

```ts
  if (snapshot?.cart) {
    options.repository.loadPersistedCart(snapshot.cart, snapshot.simulatedSessionId);
  }
```

`simulatedSessionId` is already a required field of `MockSnapshot`
(`src/mocks/persistence.ts:71`) and is on the allowlist at `:274`; Part 3 is what starts
writing a real value into it.

**`src/mocks/cart/cart-domain.ts`.** At `:166`, replace

```ts
    const cart = this.repository.createCart(input.sessionId);
```

with

```ts
    const cart = this.repository.ensureCart(input.sessionId);
```

**This is the decision, so the executor does not have to make it.** `POST /carts` now
returns the session's existing cart when there is one, which is what
`Repository.ensureCart`'s own docstring (`src/mocks/repository.ts:189`) already describes
and what makes the restored cart reachable. It is also the only behaviour consistent with
`src/app/features/cart/cart.facade.ts:179-185`, whose docstring already promises *"Creates
the cart if none exists. Safe to call multiple times."* The handler keeps returning `201`;
the wire contract is unchanged.

### Part 3 — the mock writes the snapshot after every successful mutation

**New file `src/mocks/snapshot.ts`.** One exported function that turns repository state
into the allowlisted `MockSnapshot` shape. It must produce only the fields
`src/mocks/persistence.ts:254-283` accepts — any extra top-level key makes `hydrate()`
reject the whole entry:

```ts
/**
 * Builds the allowlisted snapshot `Persistence.save()` writes. The
 * shape is the one `isValidSnapshot` in `./persistence` accepts: an
 * unknown top-level key makes the next `hydrate()` discard the entry,
 * so this builder is the only place the snapshot is composed.
 */
export function buildSnapshot(
  repository: Repository,
  sessionId: string,
  nowMs: number,
): MockSnapshot { … }
```

Rules the builder follows, all of them already stated in
`src/mocks/persistence.ts:1-21` and `docs/spec/architecture.md:107`:

- `schemaVersion` is `SNAPSHOT_SCHEMA_VERSION` imported from `./persistence`, never a
  literal.
- `providerId` is `'mi-bolt'`.
- `simulatedSessionId` is the `X-Demo-Session` value of the request being handled.
- `savedAt` is `new Date(nowMs).toISOString()`; `expiresAt` is `nowMs` plus the cart TTL
  `docs/spec/architecture.md:109` names, 24 hours.
- `cart` is the session's cart, looked up with the read-only
  `repository.findCartBySession(sessionId)` added in Part 2 — **never** with `ensureCart`,
  which would create a cart as a side effect of persisting — reduced to
  `{ id, version, items, lastUpdatedAt }` with each item reduced to
  `{ id, variantId, quantity }`. Nothing else survives the allowlist. When the lookup
  returns `undefined`, omit the `cart` key entirely; it is optional at
  `src/mocks/persistence.ts:74`.
- `receipts` is every committed `OrderReceipt` reduced to the `PersistedReceipt` shape at
  `src/mocks/persistence.ts:58-65`. Nothing else. `Repository` has no orders listing today
  — `src/mocks/repository.ts:117` keeps them in a private `Map` exposed only through
  `getOrder(id)` at `:233` — so add one beside `saveOrder`, in the same shape as the
  existing `listCarts()` at `:223`:

  ```ts
    /** Lists every committed receipt. The snapshot builder reads it. */
    listOrders(): readonly OrderReceipt[] {
      return Array.from(this.orders.values());
    }
  ```
- No contact, address, draft, payment-intent body or idempotency payload, per T05-AC04
  (`docs/tasks/T05.md:48`).

**`src/mocks/create-handlers.ts`.** Add one optional field to `CreateHandlersOptions`
(`:23-29`):

```ts
  /**
   * Called by a handler after a successful mutating response so the
   * browser worker can write the sessionStorage snapshot. Absent in the
   * Node and unit paths, which keeps this factory side-effect-free as
   * the module header promises.
   */
  persist?: (sessionId: string) => void;
```

Leaving it optional is what keeps the promise in the file's own header at `:12-15`
("deliberately side-effect-free: it never touches `globalThis`, never reads from
`sessionStorage`") true for every caller that does not supply it.

**`src/mocks/browser.ts`.** Build one `Persistence` instance and supply the callback.
`resolveBrowserHandlerOptions()` (`:76-89`) already has the scenario, the clock and the
repository in scope; add:

```ts
  const persistence = createBrowserPersistence({ nowMs: () => Date.parse(clock.now()) });
  return {
    repository,
    clock,
    ids,
    scenario,
    apiRoot: '/api/v1',
    persist: (sessionId: string) => {
      persistence.save(scenario.name, buildSnapshot(repository, sessionId, Date.parse(clock.now())));
    },
  };
```

`createBrowserPersistence` is already imported by `src/core/bootstrap-demo.ts:21`; import
it here from `./persistence` the same way. The bootstrap's own `hydrate()` call at
`src/core/bootstrap-demo.ts:53-62` stays exactly as it is — read and write stay on
separate instances and that is fine, because both address the same `sessionStorage` key
through `snapshotKey(scenario.name)`.

**`src/mocks/cart/cart.handlers.ts`.** Destructure `persist` from `options` at `:255` and
call it on the success path of the four mutating handlers only — `createCart` (`:267-272`),
`addCartItem` (`:300-312`), `setCartItemQuantity` (`:328-340`), `removeCartItem`
(`:353-364`). In each, insert one line immediately after the `if (!result.ok) return …`
guard and before the `HttpResponse.json(…)` return:

```ts
      persist?.(sessionId);
```

Do **not** call it in `getCart` (`:275-284`). A read writes nothing.

**`src/mocks/orders/order.handlers.ts`.** Same one line on the `createOrder` success path,
after the `if (!result.ok) return problemResponse(...)` guard at `:257` and before the
`HttpResponse.json(serializeReceipt(result.value), …)` return at `:258`. Not in
`getOrder` (`:265`).

### Part 4 — the app layer stops storing business data

**`src/app/features/checkout/checkout.facade.ts`.**

- Delete `:69-105` in one block: the comment, `ORDER_RECEIPT_STORAGE_KEY`,
  `persistReceipt` and `readPersistedReceipt`.
- Delete the call at `:602` and the call at `:753`.
- At `:606-616`, delete the `readPersistedReceipt` branch so the 404 path returns the
  Problem it already builds at `:617-625`. The whole `if (mapped.status === 404) { … }`
  block collapses to that return, and the comment at `:607-611` goes with it.
- Delete the now-unused `OrderReceipt` type import only if nothing else in the file uses
  it. It is used elsewhere (`commitOrderWithKey` at `:742` returns it), so it stays.
- Fix the factually wrong comment at `:19-21`, which claims *"the cart survives because
  `CartFacade` owns it through `localStorage` (T17)"*. `src/app/features/cart/cart.facade.ts`
  contains no storage reference of any kind — measured with
  `grep -n "Storage" src/app/features/cart/cart.facade.ts`, which returns nothing. Replace
  that clause with one sentence saying the cart survives because the mock persists its own
  snapshot, and name `docs/spec/architecture.md:107`.

The F3 behaviour — a reload of `/penztar/siker/:orderId` still showing the receipt — is preserved by
Part 3, which persists `receipts` in the snapshot so `GET /orders/{id}` finds the order
after the reload instead of 404ing. That is the whole reason Part 4 runs last.

**`src/app/features/checkout/order-submission.ts`.** Delete the bespoke store and every
member that exists only to serve it. **Nothing in `src/` calls the three public members
that lose their backing** — `grep -rn "retryUnknownOutcome\|recoverPersistedOrder\|readPersistedSafeOrder\|bindStorage\|currentStorage" src tests e2e`
returns hits only inside this file and inside `tests/order-submission.spec.ts`, and the
one production consumer of the whole service, `payment-progress.ts:195`, calls only
`watchProgress`. So this is a deletion, not a rewrite, and it needs no prerequisite.

Work the table, not a line range: the four ranges below are the store itself, and the
sixteen call sites after them are what the ranges leave dangling. An executor who deletes
only the ranges gets a file that does not compile.

**The store (delete outright):**

| Lines | What |
|---|---|
| `:113-121` | `SafeOrderRecord` — the whole interface. Nothing returns it after the table below. |
| `:151-210` | `SafeOrderStorage` (`:160`), `LocalStorageBackedStore` (`:166`) and `InMemoryStore` (`:198`), each with the docblock above it |
| `:211-217` | `SAFE_ORDER_STORAGE_PREFIX` (`:212`) and `storageKeyForCart` (`:214-217`) |
| `:278-284` | the `storage` field and its docblock |
| `:374-387` | `bindStorage` and `currentStorage` |
| `:966-981` | `readStorage` (`:967-973`) and `writeStorage` (`:975-981`) |
| `:1021` onward | `isSafeOrderRecord`, the module-level type guard. Delete the whole function. |

**The call sites, and what each becomes:**

| Site | Member | What it becomes |
|---|---|---|
| `:453-472` | `retryUnknownOutcome()` | **Delete the whole method.** It reads the persisted record at `:454` and has no other source for one. `FIX-61` §4 rebuilds it on the key `CheckoutFacade` will hold, and says so. |
| `:480-492` | `readPersistedSafeOrder()` | **Delete the whole method.** It is the store's only reader. |
| `:501-545` | `recoverPersistedOrder()` | **Delete the whole method.** `FIX-61` §4 already rules that after this change "recovery is a `getOrder` against the mock rather than a read of a local record" and instructs its own executor to delete it if nothing calls it — nothing does. |
| `:888-920` | `runReplay()` | **Delete the whole method.** Its only caller is `retryUnknownOutcome()` at `:466`, and its parameter is a `SafeOrderRecord`. |
| `:945-953` | `persistSafeOrder()` | **Delete the whole method.** |
| `:531` | `this.persistSafeOrder({ …, orderId: receipt.id, … })` | goes with `recoverPersistedOrder()`. |
| `:647-656` | `this.persistSafeOrder({ orderKey, orderId: null, … })` in `commitDirectly()` | **Delete the call only.** `const orderKey = freshIdempotencyKey();` on the line above stays: it is the key the `commitOrderWithKey()` call at `:657` sends. |
| `:661-664` | `const previous = this.readPersistedSafeOrder();` and the `if (previous !== null && previous.cartId === cartId) { this.persistSafeOrder(…); }` block | **Delete all four lines.** They exist only to stamp the receipt id into the record. |
| `:766-775` | `const safeKey = this.persistSafeOrder({ orderKey: freshIdempotencyKey(), … });` on the timeout path | **Replace with `const safeKey = freshIdempotencyKey();`.** The value bound as `safeKey` was always `record.orderKey`, which was a key minted on that same line; the reads at `:780` (`lastOutcomeWritable`, `kind: 'pending-timeout'`) and `:788` (`emitProgress`) are unchanged and still get a key. |
| `:891` | `this.persistSafeOrder({ ...persisted, attempt: … })` in `runReplay()` | goes with `runReplay()`. |
| `:979` | the comment `// Ignore — see `persistSafeOrder`.` inside `writeStorage` | goes with `writeStorage`. |

**After the deletions**, `grep -n "storage\|Storage\|SafeOrderRecord\|persistSafeOrder\|runReplay\|isSafeOrderRecord" src/app/features/checkout/order-submission.ts`
must return nothing at all — not "no hit outside a prose comment": there is no prose
comment left that names the store once the docblocks above go with their members.
Check for orphaned imports afterwards; `.claude/CLAUDE.md` ("Surgical changes") requires
removing the ones this change creates and nothing else.

**Keep `watchProgress` and everything it needs.** It is the one method the running
application calls (`src/app/features/checkout/payment-progress.ts:195`) and it is not
part of this change.

**`tests/order-submission.spec.ts` loses the persistence tests with the code they cover.**
This is fifteen edits, not one. Delete `makeInMemoryStorage` (`:147-161`) and
`bindInMemoryStorageOn` (`:162-164`), **and the fourteen calls to
`bindInMemoryStorageOn(submission);`** at `:283`, `:319`, `:337`, `:401`, `:455`, `:509`,
`:557`, `:613`, `:665`, `:691`, `:777`, `:820`, `:892` and `:970` — every one of them a
setup line inside an otherwise surviving test. Then:

- **Delete the whole `describe('T23-AC04 unknown outcome retains identical order key and
  normalized request', …)` at `:656`** and all four of its cases (`:661`, `:686`, `:773`,
  `:816`). Each one asserts on the persisted record. See the traceability note below.
- **Delete three assertions from surviving cases**, and only those lines: `:439`
  (`const persisted = submission.readPersistedSafeOrder();` plus the `expect` that
  follows it and the comment above it) inside the case at `:396`; `:640`
  (`const recover = await submission.recoverPersistedOrder();` and the two `expect`s
  reading `recover?.source` and `recover?.orderId`) inside the case at `:609`; and `:927`
  (`expect(submission.readPersistedSafeOrder()).toBeNull();` and the comment above it)
  inside the case at `:887`. The rest of all three cases survives unchanged.
- Check the `SafeOrderStorage` / `InMemoryStore` names in the import block at `:66-73`
  and remove the ones nothing uses afterwards.

Do not replace any of this with a test of the mock's snapshot — that belongs in the new
spec named below, which is a different file.

**One acceptance criterion loses its only implementation, and it is routed rather than
dropped.** The deleted `describe` at `:656` is this repository's only coverage of
`docs/tasks/T23.md`'s AC04 ("unknown outcome retains identical order key and normalized
request"). `FIX-61` §5 already carries the replacement — *"A test for the key policy, and
it is the one that matters: submit, force an unknown outcome, retry, and assert with an
MSW request spy that both requests carried the same `Idempotency-Key` header value"* — so
record in this commit's body that T23-AC04's coverage is uncovered between this task and
`FIX-61`, and name `FIX-61` as the task that restores it.

**One half of `T05-AC04` has no implementation after this deletion, and no task in the
package builds one.** `docs/tasks/T05.md:48` reads *"Persist privacy-minimized committed
order receipts **and order-key digests for uncertain-response recovery**"*, and
`docs/spec/architecture.md:107`'s snapshot allowlist names *"safe order intent
references/key digests and terminal order replay result"*. Part 3 of this task persists
the receipts half. The digest half was implemented only by the store this part deletes,
and the mock's own allowlist does not carry it: `src/mocks/persistence.ts:271-279`
enumerates exactly seven keys — `schemaVersion`, `providerId`, `simulatedSessionId`,
`savedAt`, `expiresAt`, `cart`, `receipts` — and `MockSnapshot` (`:67-76`) declares the
same seven, which **FIX-10-AC07** then freezes as a criterion. `FIX-61` §4 rebuilds the
key in `CheckoutFacade`, in memory, which does not survive a reload and so does not close
this line either.

**Record this in the commit body as an open specification line with no owner.** Do not
close it here by widening the allowlist: an eighth snapshot key is a design change to the
mock's persistence contract, and under D1 what it should hold is the user's call, not an
executor's. Under no circumstances close it by keeping any part of the app-layer store —
D5 forbids it in as many words.

### The spec file that must gain a test

`tests/mocks-handlers.spec.ts` is the owner of the mock persistence behaviour: it already
constructs `Persistence` directly at `:136,190,193,217` and already has a snapshot fixture
at `:46`. The new cases go there:

1. A mutating cart handler invoked with a `persist` callback calls it exactly once with
   the request's `X-Demo-Session` value; `getCart` does not call it.
2. `buildSnapshot` output passes `Persistence.hydrate` round-trip: `save(name, built)`
   followed by `hydrate(name)` returns a snapshot whose `cart.items` match the repository's
   cart line ids, variant ids and quantities.
3. `buildSnapshot` emits no key outside the allowlist — assert
   `Object.keys(built).sort()` equals the seven names at `src/mocks/persistence.ts:272-278`.
4. A repository seeded through `loadPersistedCart(cart, 'sess-x')` answers
   `ensureCart('sess-x')` with that same cart id rather than a new one.

## Out of scope

- **`npm run test` (`ng test`) is red at the baseline with 14/14 files failing on
  `ReferenceError: document is not defined` — FIX-04 owns that.** Verify with
  `npx vitest run <file>` instead, exactly as steps 2 and 3 below do; that is vitest's own
  direct invocation and needs no package script to prove it works.
- **The coverage threshold over `src/mocks/**` — FIX-08.** `src/mocks/snapshot.ts` is a
  new runtime file. `angular.json`'s `coverageInclude` (`"src/**/*.ts"`) already reaches
  it once FIX-08 lands, so no classification edit is needed anywhere; name the new file in
  this task's commit body so whoever writes its coverage is aware of it.
- **The tests that assert on source text rather than behaviour — FIX-07 and FIX-07b.** Several of the
  specs touched here are of that kind. Delete only the ones whose subject this task
  removes; do not start converting the rest.
- **`src/main.ts`'s swallowed bootstrap failure — FIX-12.** This task does not touch
  `src/main.ts`.
- **`src/mocks/node.ts` — FIX-13.** The `persist` callback is deliberately left undefined
  on every non-browser path; do not wire one there.
- **The checkout draft, contact and address fields.** `docs/spec/architecture.md:109`
  makes them volatile by design and T05-AC04 (`docs/tasks/T05.md:48`) forbids serializing
  them. Nothing in this task may put them in the snapshot.
- **The empty-cart and cart-line UI — FIX-21.** This task changes what the cart page
  receives, never how it renders it.
- **`src/mocks/browser.ts:98-104` (`installBusinessRouteBypass`), which A2 flagged for
  checking only the pathname.** Not this task's subject; **FIX-51** owns it.

## How to verify

Run these from the repository root, in order. The package manager is **npm**; there is no
pnpm and no mise in this repository.

1. `npm run build` — must exit `0`. Green at the `db6d295` baseline and must stay green.

2. `npx vitest run tests/mocks-handlers.spec.ts` — must exit `0`, with the four new cases
   listed above passing by name.

3. `npx vitest run tests/order-submission.spec.ts tests/success-page.spec.ts tests/checkout-state.spec.ts tests/cart.facade.spec.ts`
   — must exit `0`. These are the suites whose subject Part 1 and Part 4 change.

3b. `npx vitest run tests/cart-mock.spec.ts tests/order-mock.spec.ts tests/checkout-mock.spec.ts`
   — must exit `0`. These are the three suites that call **`CartDomain.createCart`**
   directly, which is the method Part 2 re-points at `ensureCart`:
   `grep -rn "cartDomain.createCart\|domain.createCart" tests/` returns 24 calls in the
   first file, 3 in the second and 2 in the third, and no calls anywhere else. **What a
   failure here means**: after Part 2, two `createCart` calls with the **same**
   `sessionId` inside one environment return the **same** cart instead of two. A spec
   that seeded twice under one session and expected two distinct cart ids is the
   failure to expect — `tests/order-mock.spec.ts:763` and `:1002` both seed with
   `sessionId: 'session-cccccccccccc'`, so read those two first. Repair the spec to
   use distinct session ids, not the mock: the new behaviour is the decision
   "What to change" item 2 states, and `src/app/features/cart/cart.facade.ts:179-185`
   already promises it (*"Creates the cart if none exists. Safe to call multiple
   times."*).

`tests/add-to-cart.spec.ts` and `tests/cart-page.spec.ts` are deliberately **not** in
either list. Both are source-text specs — `add-to-cart.spec.ts:84` and
`cart-page.spec.ts:203` each `readFileSync` the component and assert
`toMatch(/facade\.ensureCart/)` — so neither constructs a repository, issues a request
or can observe `POST /carts`. **FIX-07 / FIX-07b** own converting them.

4. `npx vitest run --config vitest.contract.config.ts` — must exit `0`. Green at the
   baseline's equivalent check and this task must not change it.

5. **Do not run `npm run api:drift` or `npx playwright test` while working on this task.**
   Both rewrite tracked files and leave the working tree dirty: `api:drift` regenerates 27
   files under `src/app/api/generated/` (FIX-11 owns that) and `npx playwright test`
   rewrites 49 screenshots under `e2e/design/screenshots/` (FIX-09).

6. The browser run described in FIX-10-AC01. Start the app with `npm start` and drive it
   through a real browser per `.claude/rules/browser-verification.md`; the agent takes the
   snapshot, the screenshots and the console and network reads, and the orchestrator
   starts and stops the server.

Gates that are red for reasons this task does not fix, so the executor does not chase
them: `npm run lint` (**FIX-01**), `npm run test` — that is `ng test`, and it carries the
coverage thresholds (**FIX-04**, **FIX-08**) — and `npx playwright test` (**FIX-09**).
`npm run api:drift` leaving the tree dirty is **FIX-11**'s to fix.

## Acceptance criteria

- [ ] **FIX-10-AC01** **Real-browser check, mandatory — this is the criterion that proves
      the whole task.** At viewport width 1440, open `/telefonok`, open any product, click
      `Kosárba teszem`, then open `/kosar` (which `src/app/app.routes.ts:156-162` redirects
      to `/penztar/kosar`) and record the product name, the colour, the
      storage, the quantity and the subtotal shown. Press **F5**. After the reload the same
      line is present with the same variant, the same quantity and the same total, and the
      page does **not** render `A kosarad üres`. In the network log of the reloaded page
      there is no `POST /api/v1/carts` that returns `201`; the cart arrives from a request
      that returns the existing cart. `list_console_messages` reports zero errors. Capture a
      screenshot before and after the reload.
- [ ] **FIX-10-AC02** **Real-browser check.** In the same tab after the reload,
      `sessionStorage.getItem('mi-bolt.demo-session')` returns a non-empty string, and it is
      the same string it returned before the reload. The `X-Demo-Session` request header on
      any `/api/v1/` request after the reload equals that value.
- [ ] **FIX-10-AC03** **Real-browser check.** Open a **second** tab on the same origin and
      open `/kosar`. It shows `A kosarad üres`. This proves the namespace is still
      tab-scoped, which `docs/spec/architecture.md:111` requires, and that the fix did not
      reach for `localStorage`.
- [ ] **FIX-10-AC04** **Real-browser check.** Complete a demo order through
      `/penztar/siker/:orderId`, record the order number, then press F5 on that route. The same order
      number and the same final amount are still rendered and no new order is created
      (no `POST /api/v1/orders` in the reloaded page's network log). This is the F3
      behaviour `e8f5b3f` delivered, now carried by the mock instead of by
      `checkout.facade.ts`.
- [ ] **FIX-10-AC05** `grep -rn "sessionStorage\|localStorage" src/app` returns matches in
      `src/app/core/api/demo-session.interceptor.ts` **and in no other file**. At the
      baseline it returned 7 matches in `src/app/features/checkout/checkout.facade.ts` and
      14 in `src/app/features/checkout/order-submission.ts`; both counts must be zero. The
      interceptor is the one permitted holder because what it stores is an opaque namespace
      id, not business data. `grep -rn "localStorage" src` must return nothing at all —
      `docs/spec/architecture.md:107` says tab-scoped `sessionStorage`.
- [ ] **FIX-10-AC06** `grep -rn "\.save(" src` returns at least one match inside
      `src/mocks/`. At the baseline it returned nothing.
- [ ] **FIX-10-AC07** Unit test, in `tests/mocks-handlers.spec.ts`: a case named for the
      allowlist asserts that `Object.keys(buildSnapshot(...)).sort()` equals exactly
      `['cart','expiresAt','providerId','receipts','savedAt','schemaVersion','simulatedSessionId']`,
      and a second case asserts `save()` then `hydrate()` returns a snapshot whose
      `cart.items` match the repository cart's line ids, variant ids and quantities.
      `npx vitest run tests/mocks-handlers.spec.ts` exits `0`.
- [ ] **FIX-10-AC08** Unit test, in `tests/mocks-handlers.spec.ts`: a repository seeded via
      `loadPersistedCart(persistedCart, 'sess-x')` answers `ensureCart('sess-x')` with the
      persisted cart's id, and `getCart` for that id with `sessionId: 'sess-x'` succeeds.
- [ ] **FIX-10-AC09** `npm run build` exits `0` and
      `npx vitest run --config vitest.contract.config.ts` exits `0`, both unchanged from
      the `db6d295` baseline's equivalent state.
- [ ] **FIX-10-AC10** Design rules recorded in the commit body. **Applicable and met:
      R24** (`Preserve the cart, filters and previously entered non-sensitive data after an
      error`) — the browser evidence from FIX-10-AC01 is its evidence. **R15**
      (`Clearly label demo data as demo data; do not claim a real order, payment or sent
      email after a simulation`) — the restored receipt in FIX-10-AC04 must still carry the
      demo notice, unchanged. **R26** — the commit body names every file changed, the
      commands run with their exit codes, and the remaining limitation that
      `src/mocks/snapshot.ts` is not yet inside the coverage gate (FIX-08). R01–R14,
      R16–R23 and R25 are **N/A: this task changes the transport and persistence of data
      the existing screens already render, and adds no visual element, no copy and no
      layout.** Skill provenance is stated once in `docs/fix/README.md` section 3, "Every
      task records the design rules": the installed path, the version, and the fact that
      `docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
      Cite it from there; do not restate it here.

## Commit

This task is exactly one commit. Do not bundle it with FIX-11, FIX-12, FIX-13 or any other
FIX task, however related the files look. Commit only after every acceptance criterion
above passes, including the four browser checks.

Suggested subject line, in the repository's existing `type: summary` style (see
`git log --oneline -20`, for example `fix: F3 success page receipt fallback
(sessionStorage)`):

```text
fix: restore the cart across reload from the mock snapshot
```

Nothing in this package is pushed by the executor. The push and the pull request belong to
the orchestrating session.

## Where this sits in the stream

**FIX-06 must land before this one's "How to verify" step 4 can run**, because
`vitest.contract.config.ts` does not exist until FIX-06 creates it. The four parts inside
this task are otherwise ordered and that ordering is the rest of the dependency.

FIX-12 also edits the bootstrap path (`src/main.ts`) and FIX-13 also edits the mock layer
(`src/mocks/node.ts`); neither touches a file this task touches, so they may land in any
order relative to it. FIX-08 may land before or after this one: `angular.json`'s
`coverageInclude` glob (`"src/**/*.ts"`) reaches `src/mocks/snapshot.ts` automatically
once it exists, with no per-file classification to keep in step.

`src/mocks/browser.ts` is also touched by two other tasks: **FIX-51** edits
`installBusinessRouteBypass()` in the same file (`FIX-51.md:369-372` — "the two tasks must
not run at the same time"), and **FIX-62** edits `src/mocks/browser.ts:8`. **FIX-61** also
depends on this task landing first (`FIX-61.md:288-300` — "`FIX-10` lands first") and
inherits `retryUnknownOutcome()`'s key and `recoverPersistedOrder()`'s removal from Part 4.
