# FIX-66 — Consolidate the four idempotency-key generators and stop minting a fresh key per retry

Status: DONE (unit-verified; browser pass owed) — `freshIdempotencyKey` now has exactly one declaration, `src/app/shared/utils/idempotency-key.ts` (`grep -rln "function freshIdempotencyKey" src` prints only that path); `checkout.facade.ts`, `order-submission.ts`, `checkout.routes.ts` and `cart.facade.ts` all import it. AC02's two counts: `checkout.routes.ts` prints `2` (the import plus the one call at the contact-draft-saver site), `cart.facade.ts` prints `6` (the import plus its five mutation call sites) — both match the doc's prediction exactly. `saveSection()`, `createQuote()` and `createPaymentIntent()` now hold the key per canonical request fingerprint as items 2–4 specify, `createPaymentIntent()` deliberately with the narrower openapi.yaml policy (held only across a `status === 0` transport failure, cleared on every definitive response including a decline). `checkout-idempotency.spec.ts` is new and covers AC03/AC04/AC05 (four tests: saveSection same/changed body, createQuote same/bumped version, createPaymentIntent transport-failure-retry-same-key and declined-retry-different-key); measured red before the fix (reverting `saveSection()`'s held-key line back to a bare `freshIdempotencyKey()` call fails that test with two different UUIDs) and green after. AC10's required record: `checkout.facade.ts:493` and `:547` (now shifted a few lines by this task's own edits) are the checkout **session** and **quote** mutations, not `cart.facade.ts`'s cart mutations — the framing this task was given named them "the two cart mutations", which is corrected here; `checkout.routes.ts`'s parallel `updateCheckout` call inside `buildContactDraftSaver` was left untouched with its existing always-fresh-key-per-intent policy, which is the same wire operation `saveSection()` drives through a separate code path (`ContactStep` injects `CONTACT_DRAFT_SAVER` rather than calling `CheckoutFacade.saveContactSection()`); reconciling the two parallel implementations remains unreconciled and unowned by this task — `ContactStep`'s own signature drift against `components.md:551-557` is `FIX-63`'s (now landed in this same session). `npm run build` exits 0. Open: the four real-browser acceptance criteria (AC06–AC08, which read live `Idempotency-Key` network headers) are unverified in this session (unit tests only, per the session's no-e2e mandate); deferred to the batched browser pass.
Severity: blocker
Source: Decision **D15** items 9 and 10. `docs/spec/architecture.md:117` and `:121`, `docs/api/openapi.yaml:717` and `:628-635`. `FIX-61` (direct precedent and partial owner).

## Why this is wrong

Two related defects, one commit, because the second cannot be tested without the first
being settled: a request spy has to assert on **one** canonical key generator's output,
not on whichever of several near-duplicate implementations happened to run.

**`freshIdempotencyKey` is declared four times.** `FIX-61` already merges two of the four
(`checkout.facade.ts` and `order-submission.ts`) and hands the remaining two —
`checkout.routes.ts:66` and `cart.facade.ts:74` — to this task by name. This task finishes
the consolidation and relocates the result to avoid a circular import between the two
feature facades; see "Evidence" item 1 and "What to change" item 1.

**A fresh key is minted per call, on three operations `FIX-61` explicitly left unowned:**
`createPaymentIntent()`, `saveSection()` and `createQuote()`, all in `checkout.facade.ts`.
This is the same class of defect `FIX-61` already fixed for `commitOrder()`, against the
same specification rule — but `createPaymentIntent()` carries its own, narrower rule from
`docs/api/openapi.yaml` that this task must not conflate with the general one; see
"Evidence" items 2 and 3.

## Evidence

### 1. `freshIdempotencyKey` is declared four times, and `FIX-61` owns only two of them

```
$ grep -rn "^function freshIdempotencyKey" src
src/app/features/checkout/checkout.routes.ts:66:function freshIdempotencyKey(): string {
src/app/features/checkout/order-submission.ts:1002:function freshIdempotencyKey(): string {
src/app/features/checkout/checkout.facade.ts:143:function freshIdempotencyKey(): string {
src/app/features/cart/cart.facade.ts:74:function freshIdempotencyKey(): string {
```

Two different fallbacks: `checkout.facade.ts:143-145` (pre-`FIX-61`) returns
`globalThis.crypto.randomUUID()` unguarded; `order-submission.ts:1002-1007` and
`cart.facade.ts:74-78` each guard the call — `order-submission.ts`'s guard falls back to
a timestamp-plus-random string, `cart.facade.ts`'s falls back to the unguarded value
anyway (it comments that `randomUUID()` already fits the contract range, so its "guard"
is a length note, not a second code path).

**`FIX-61` already merges two of the four**, and says so explicitly in its own text:
*"Consolidate the two copies this task already edits... Keep `checkout.facade.ts:143-145`,
take `order-submission.ts:1002-1007`'s guarded body as its implementation... export it,
and have `order-submission.ts`'s callers import it."* Its own "Out of scope" section
names the remaining two and hands them here by name: *"Leave `checkout.routes.ts:66` and
`cart.facade.ts:74` alone. They are the same four-way duplication, in two files this task
does not otherwise touch and that other FIX numbers do."*

**This task's ordering relative to `FIX-61` is explicit: `FIX-61` lands first.** This
task does not redo `FIX-61`'s merge of the `checkout.facade.ts` / `order-submission.ts`
pair; it picks up the exported result and finishes the consolidation, then relocates the
result — see item 1 below for why the destination changes.

### 2. A fresh key is minted per call, against the rule the specification states twice

`docs/spec/architecture.md:117`:

> For mutations use `If-Match: "<cart.version>"` and `Idempotency-Key`. Idempotency
> lookup happens before comparing current cart status/version: a replay after success
> must not become a conflict. **Scope key to session+method+path and canonical request
> fingerprint, including semantically relevant version precondition. A retry sends the
> identical body/precondition. Reusing a key with a different payload returns 409.**
> Store terminal success or domain-conflict outcome for replay; transport errors before
> execution have no commit; failed schema validation mutates nothing. A PRICE_CHANGED
> quote response may atomically update cart/version and stores that conflict outcome so a
> retry cannot update it again.

`docs/spec/architecture.md:121`:

> For order commit: revalidate quote/session/cart/stock… **A timeout-after-commit
> retries the same key/body.**

`FIX-61` already applies this rule to `commitOrder()` (`checkout.facade.ts:723`) and its
own text records the rest as unowned: *"`createPaymentIntent()` and the two cart
mutations that also mint a fresh key per call (`checkout.facade.ts:642`, `:493`,
`:547`). Same rule, different operations, no owner. Record and report; change none of
them."* This task is that owner, for those three call sites — **only** those three;
`commitOrder()` itself is not touched again.

**`saveSection()`, `checkout.facade.ts:459-514`** — the generic `PUT /checkout/{cartId}`
driver behind `saveContactSection()`, `saveDeliverySection()` and `savePaymentMethod()`.
Called this **"the two cart mutations"** in the source material this task was given, but
measured directly, `:493` and `:547` are the checkout **session** and **quote**
mutations, not the cart's own — `cart.facade.ts`'s five mutation call sites are a
different file this task does not touch (see "Out of scope"). This correction is
recorded so the next reader does not go looking in the wrong file.

`checkout.facade.ts:493`:

```ts
      const session = await firstValueFrom(
        this.api.invoke(
          functions.updateCheckout,
          {
            cartId,
            'Idempotency-Key': freshIdempotencyKey(),
            body,
          },
          withIfMatch(cartVersion),
        ),
      );
```

**`createQuote()`, `checkout.facade.ts:526-562`.** `:547`:

```ts
      const quote = await firstValueFrom(
        this.api.invoke(
          functions.createCheckoutQuote,
          {
            cartId,
            'Idempotency-Key': freshIdempotencyKey(),
          },
          withIfMatch(cartVersion),
        ),
      );
```

**`createPaymentIntent()`, `checkout.facade.ts:642-689`.** `:672`:

```ts
      const intent = await firstValueFrom(
        this.api.invoke(functions.createPaymentIntent, {
          'Idempotency-Key': freshIdempotencyKey(),
          body: { cartId, quoteId: quote.id },
        }),
      );
```

All three mint a brand-new key on every call. A retry of any of them — the same section
save, the same quote request, the same payment-intent attempt — is therefore a **new**
request to the mock rather than a replay of the old one, which is the exact failure mode
`architecture.md:117` names: *"A retry sends the identical body/precondition."*

### 3. `createPaymentIntent()` has its own, more specific rule, and it is not the same rule as `commitOrder()`'s

`docs/api/openapi.yaml:628-635`, the `POST /payment-intents` operation:

> Only permitted for demo_card and a current unexpired quote. Never request PAN, CVV,
> card expiry, bank redirect or external API. Declined/pending are valid states with
> 201, not server errors. **New approved retry uses a new payment key; ambiguous network
> retry retains original key.**

This is narrower than the general mutation rule and this task follows it literally, not
`FIX-61`'s "hold until terminal success" pattern:

- `createPaymentIntent()` **never throws** for a declined or pending outcome — the
  generated `PaymentIntent` model (`src/app/api/generated/models/payment-intent.ts`) puts
  the verdict inside the 201 body: `status: 'succeeded' | 'declined' | 'pending'`.
  `checkout.facade.ts:642-689` does not branch on `intent.status` at all today; it
  returns `{ok: true, value: intent}` for every one of the three.
- So **every response the server actually sends back — succeeded, declined or
  pending — is a definitive, acknowledged outcome**, not an ambiguous one. Calling
  `createPaymentIntent()` again after any of them (a user-visible "try again", including
  after a decline) is a **"new approved retry"**: a deliberate new attempt, and it must
  get a **new** key. Reusing the old key would make the mock's idempotency cache replay
  the **same recorded outcome forever** — a declined payment could never be tried again
  through this endpoint.
- The **only** case that is genuinely **"ambiguous"** is a transport-level failure: the
  request never reached the server, or no response came back at all, so the client does
  not know what happened. That is the one case where the **same** key must be reused, so
  a resend can resolve to whatever the server actually did (or didn't) commit.
  `checkout.facade.ts`'s own `mapError` (`:193-215`) already distinguishes this:
  `err instanceof HttpErrorResponse` with `status !== 0` is a definitive server response
  (a 4xx/5xx Problem body); the fallback branch, reached for anything that is not an
  `HttpErrorResponse` — a genuine network failure — maps to `status: 0`. **`status === 0`
  is this task's operational test for "ambiguous".**

This is why item 2 below gives `createPaymentIntent()` a different rule from
`saveSection()` and `createQuote()`: those two follow the general "hold per fingerprint"
policy `FIX-61` already used for `commitOrder()`; `createPaymentIntent()` holds the key
**only** across a `status === 0` failure and clears it on every definitive response.

## What to change

### 1. One declaration, in a new shared module — not inside `checkout.facade.ts`

**Why not simply keep `FIX-61`'s export and import it into the other two files:**
`checkout.facade.ts:67` already does `import { CartFacade } from '../cart/cart.facade';`.
If `cart.facade.ts` were made to import `freshIdempotencyKey` back out of
`checkout.facade.ts`, the two feature facades would import from each other —
a circular module dependency. `checkout.routes.ts` sits in the same directory as
`checkout.facade.ts` and would not have this problem, but a single generator with one
consumer that has to reach across a feature boundary and one that does not is not a
single decision; extracting it once, to a plain, dependency-free module, is.

**First, confirm `FIX-61` has landed:**

```bash
grep -n "freshIdempotencyKey" src/app/features/checkout/checkout.facade.ts
grep -c "function freshIdempotencyKey" src/app/features/checkout/order-submission.ts
```

Expect an **exported** declaration in `checkout.facade.ts` and `0` in
`order-submission.ts`. If `order-submission.ts` still declares its own copy, `FIX-61` has
not landed — stop and report; this task's item 1 depends on that merge already having
happened, and redoing it here would fork `FIX-61`'s own commit.

**Create `src/app/shared/utils/idempotency-key.ts`:**

```ts
/**
 * Canonical opaque idempotency key generator, in the contract range
 * `^[a-zA-Z0-9_-]{8,80}$`. The single declaration for the whole
 * application (`FIX-66`) — every mutating call that needs a fresh
 * key imports this rather than declaring its own copy.
 */
export function freshIdempotencyKey(): string {
  if (
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.randomUUID === 'function'
  ) {
    return globalThis.crypto.randomUUID();
  }
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
```

This is the same guarded body `FIX-61` already chose as "the safer of the two" — this
task does not re-litigate that choice, only relocates it. No import for this file: it
depends on nothing but the global `crypto` object.

**`checkout.facade.ts`** — delete whatever declaration `FIX-61` left at (or near) `:143`
and add, beside the other relative imports near the top of the file:

```ts
import { freshIdempotencyKey } from '../../shared/utils/idempotency-key';
```

Every existing call inside this file — `commitOrder()` and the three this task's item 2
changes — keeps working unchanged; only where the name resolves from changes.

**`order-submission.ts`** — `FIX-61` already repointed this file's callers at
`checkout.facade.ts`'s export. Repoint that same import at the new shared module instead:
replace whatever import `FIX-61` added with
`import { freshIdempotencyKey } from '../../shared/utils/idempotency-key';`. No call site
in this file changes.

**`checkout.routes.ts`** — delete the declaration at `:59-68` (the function and its
doc comment, which describes it as "Mirrors the `freshIdempotencyKey()` helper used by
`CartFacade` / `CheckoutFacade`" — a description this task makes literally true), and add
the same import. The one call site, `:164`, is unchanged: this file's own policy — *"each
intent gets a NEW key (no retries here, the contact-step surfaces a Retry button that
re-issues a fresh draft through the same factory)"* — is untouched. Item 2 below does not
reach this file; see "Out of scope".

**`cart.facade.ts`** — delete the declaration at `:68-78` and its doc comment, and add
the same import. The five call sites (`:193`, `:226`, `:248`, `:271`, `:335`) are
unchanged: `cart.facade.ts`'s own `retry()` mechanism (`:291-319`), which explicitly
reuses the failed intent's key on an explicit user retry and mints a fresh one for every
new intent otherwise, is untouched — it is a correct, already-working instance of the
same policy this task gives the three checkout operations, and this task does not
re-derive it.

After this item: exactly **one** declaration in the whole tree.

```bash
grep -rln "function freshIdempotencyKey" src
                            # expected: src/app/shared/utils/idempotency-key.ts only
grep -c "freshIdempotencyKey" src/app/features/checkout/checkout.routes.ts \
                                src/app/features/cart/cart.facade.ts
                            # expected: each file's import line plus its own call sites,
                            # zero declarations
```

### 2. `saveSection()` — one key per canonical request fingerprint

`checkout.facade.ts`, add a private field near the class's other private state
(`cart.facade.ts:137`'s `private lastFailedIntent` is the precedent for a plain mutable
field over a signal — this state is never read by a template):

```ts
  /** Held idempotency key for the last `saveSection()` fingerprint. */
  private savedSectionKey: { fingerprint: string; key: string } | null = null;
```

Inside `saveSection()`, after the two existing guard clauses (`cartId`/`cartVersion`
checks) and before the `try`:

```ts
    const fingerprint = JSON.stringify([
      cartId,
      cartVersion,
      body.contact ?? null,
      body.delivery ?? null,
      body.paymentMethod ?? null,
    ]);
    const held = this.savedSectionKey;
    const key = held !== null && held.fingerprint === fingerprint ? held.key : freshIdempotencyKey();
    this.savedSectionKey = { fingerprint, key };
```

**Use the array form, not the bare `body` object literal**, for the same reason `FIX-61`
gives for `commitOrder()`'s fingerprint: an array's element order is fixed by this code,
not by how `body` happened to be constructed at the call site, so reordering
`toContactPayload`'s own object literal later cannot silently mint a new key for an
identical request.

Then use `key` where `freshIdempotencyKey()` was called at `:493`:

```ts
            'Idempotency-Key': key,
```

**`this.savedSectionKey` is assigned once, before the `try`, so it holds on both the
success and the catch path** — whether this specific call succeeds or fails, the key now
assigned to this exact fingerprint is the one any retry of the identical body must reuse.
There is no "clear on
success" step here, unlike `commitOrder()`: a section save is a repeatable operation
across the whole session (the user edits and saves contact, then delivery, then payment
method, and may return to any of them later), and the specification's own rule — *"A
retry sends the identical body/precondition"* — does not carve out an exception for a
retry that happens to follow a success. If the exact same section is saved again with the
exact same content, replaying the prior outcome is the **correct** behaviour, not a bug.

### 3. `createQuote()` — the same policy, no request body to fingerprint

Add a second private field:

```ts
  /** Held idempotency key for the last `createQuote()` fingerprint. */
  private heldQuoteKey: { fingerprint: string; key: string } | null = null;
```

`createCheckoutQuote` (`docs/api/openapi.yaml`, the `/checkout/{cartId}/quote` operation)
carries **no request body** — the description says so explicitly: *"No request body."*
The only two values that distinguish one request from the next are `cartId` and the
`If-Match` precondition, `cartVersion`. `architecture.md:9` is explicit that this is
sufficient: *"Draft updates invalidate quote/intent without changing cart version"* — a
contact/delivery/payment edit between two quote requests does **not** change `cartVersion`
and does **not** change what the quote computes, because a quote prices the **cart's**
contents against the catalogue, not the draft. Two `createQuote()` calls with the same
`cartId` and the same `cartVersion` are, from the wire's own point of view, the identical
request, whatever happened to the draft in between — so the fingerprint is exactly those
two values:

```ts
    const fingerprint = JSON.stringify([cartId, cartVersion]);
    const held = this.heldQuoteKey;
    const key = held !== null && held.fingerprint === fingerprint ? held.key : freshIdempotencyKey();
    this.heldQuoteKey = { fingerprint, key };
```

placed after the existing `cartId`/`cartVersion` guard clause and before the `try`, and
`key` replaces the inline `freshIdempotencyKey()` call at `:547`. Set unconditionally, for
the same reason as item 2: a `PRICE_CHANGED` 409 bumps `cartVersion` server-side
(`architecture.md:117`'s last sentence: *"A PRICE_CHANGED quote response may atomically
update cart/version and stores that conflict outcome so a retry cannot update it
again"*), so the **next legitimate** quote request already gets a new fingerprint and a
new key automatically — no manual clearing is needed for that case to self-correct.

### 4. `createPaymentIntent()` — held only across an ambiguous (transport) failure

Add a third private field:

```ts
  /** Held idempotency key for the last `createPaymentIntent()` fingerprint,
   *  kept only while the last attempt's outcome is unknown (openapi.yaml:
   *  "ambiguous network retry retains original key"). */
  private heldPaymentIntentKey: { fingerprint: string; key: string } | null = null;
```

Replace the body of `createPaymentIntent()` (`:642-689`) from after the two existing
guard clauses:

```ts
    const fingerprint = JSON.stringify([cartId, quote.id]);
    const held = this.heldPaymentIntentKey;
    const key = held !== null && held.fingerprint === fingerprint ? held.key : freshIdempotencyKey();

    this.busyWritable.set(true);
    try {
      const intent = await firstValueFrom(
        this.api.invoke(functions.createPaymentIntent, {
          'Idempotency-Key': key,
          body: { cartId, quoteId: quote.id },
        }),
      );
      this.paymentIntentWritable.set(intent);
      this.errorWritable.set(null);
      // A response was received — succeeded, declined or pending are all
      // definitive per openapi.yaml. The next call is a new attempt and
      // must mint a fresh key ("New approved retry uses a new payment key").
      this.heldPaymentIntentKey = null;
      return { ok: true, value: intent };
    } catch (err) {
      const mapped = mapError(err);
      this.recordFailure(mapped);
      // status === 0 is a transport failure: no response was received, so
      // the outcome is genuinely ambiguous and the retry must carry the
      // identical key ("ambiguous network retry retains original key").
      // Any other status is a definitive server response (a Problem body);
      // the next attempt is a new one and gets a fresh key.
      this.heldPaymentIntentKey = mapped.status === 0 ? { fingerprint, key } : null;
      return { ok: false, error: mapped };
    } finally {
      this.busyWritable.set(false);
    }
```

**This is deliberately not the same shape as items 2 and 3.** Do not "simplify" it into
the same hold-until-success pattern; that would replay a declined payment's key forever,
which is the specific failure `openapi.yaml:628-635` calls out by name.

### 5. Tests

- `saveSection()`: through the three public wrappers (`saveContactSection`,
  `saveDeliverySection`, `savePaymentMethod`), submit the same section body twice via an
  MSW request spy and assert both requests carried the **same** `Idempotency-Key` header
  value; then submit a **different** body (a changed field) and assert the header value
  differs from the first.
- `createQuote()`: call it twice with an unchanged cart version and assert the same
  header value on both requests; then simulate a version bump (a mutation between the two
  calls) and assert the header value differs.
- `createPaymentIntent()`: force a **transport failure** (the MSW handler throws /
  network-errors, not a 4xx/5xx response) and assert a retry carries the **same** header
  value; separately, force a **declined** 201 response and assert a subsequent call
  carries a **different** header value from the first. Both cases in the same spec file,
  named so the distinction is visible in the test titles — this is the criterion the
  `openapi.yaml` nuance exists for, and a single "reuses the key" test would not catch a
  regression that reused it after a decline.
- Declaration count: a repository-wide `grep` inside the test (or a small unit test
  importing `src/app/shared/utils/idempotency-key.ts` directly) is not required; the
  acceptance criteria below check this with `grep`, not with a unit test.

## Out of scope

- **`commitOrder()` itself** (`checkout.facade.ts:697-724`) and everything `FIX-61`
  builds around it — `OrderSubmission`, `PaymentProgress`, the review step's retry/decline
  surface. `FIX-61` already gives it the fingerprint-based key and this task does not
  touch that method again.
- **`checkout.routes.ts`'s `updateCheckout` call** (`:164`, inside
  `buildContactDraftSaver`). This hits the **same wire operation** as `saveSection()`
  through a separate, parallel code path — `ContactStep` injects `CONTACT_DRAFT_SAVER`
  rather than calling `CheckoutFacade.saveContactSection()`, which is **`ContactStep`'s
  own signature drift against `components.md:555-557`, D15 item 1, and `FIX-63` owns
  it** ("Give `ContactStep` and `ReviewStep` the signal inputs the specification
  declares"). This task only moves that file's key-generator *declaration* (item 1); its
  calling policy — a new key per intent, by its own documented design, because "the
  contact-step surfaces a Retry button that re-issues a fresh draft through the same
  factory" — is untouched. Reconciling the two parallel implementations of the same
  operation is a defect for the user to weigh, not a rename this task can fold in; record
  it in the commit body and report it.
- **`cart.facade.ts`'s five mutation call sites** and its `retry()` method. They already
  implement the correct policy (fresh key per new intent, the same key reused only on an
  explicit user-triggered `retry()` after a recorded 409) — this task moves their
  generator's *declaration* only (item 1). Do not change `retry()`, `ensureCart()`,
  `addItem()`, `setQuantity()`, `removeItem()` or `refetch()`.
- **Anything under `src/mocks/`.** The mock's `IdempotencyStore` (`src/mocks/idempotency.ts`)
  already implements the replay this task's client-side fix makes reachable; this task
  does not change the mock.
- **`OrderSubmission`'s own key handling** (`order-submission.ts`, beyond the import
  relocation in item 1). `FIX-61` owns that file's behaviour.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (**FIX-01**),
`npm run test` (`ng test`) fails 14/14 files (**FIX-04**), `npx playwright test` has 41
failures (**FIX-09**).

**Prerequisite: `FIX-61` lands first.** Item 1 depends on its merge of the
`checkout.facade.ts` / `order-submission.ts` pair already having happened. If it has not,
stop and report per item 1's precondition check.

```bash
npm run build                # expected exit 0
npm run test                 # record the exit code; a failure attributable to FIX-04 does not
                             # fail this task, but the spec file item 5 added its tests to must
                             # pass
grep -rln "function freshIdempotencyKey" src
                              # expected: src/app/shared/utils/idempotency-key.ts, alone
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Browser checks (mandatory — this task changes what a network retry actually sends):

1. At 1440, on `/penztar/adatok`, fill and save the contact section twice in a row with
   no changes (click "Tovább" and go back, or resubmit the same form). Capture the
   `Idempotency-Key` header on both `PUT /api/v1/checkout/{cartId}` requests in the
   network panel and confirm they match.
2. Change one field and save again. Confirm the header value now differs from step 1's.
3. Reach `/penztar/ellenorzes` and trigger a quote twice with no intervening cart change
   (for example by navigating back to review without editing anything). Confirm both
   `POST /api/v1/checkout/{cartId}/quote` requests carry the same header value.
4. Force a declined payment through the mock's scenario mechanism, then retry. Confirm
   the two `POST /api/v1/payment-intents` requests carry **different** `Idempotency-Key`
   values — this is the opposite of `FIX-61`'s AC04 for `commitOrder()`, and that
   difference is the point: paste both values into the commit body and say explicitly
   that they differ on purpose.
5. `list_console_messages` reports zero errors across steps 1–4.
6. Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

This task changes network request headers inside three existing facade methods and
relocates one pure function; it renders nothing and changes no visible state, control, or
copy.

- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R25: N/A — no rendered surface changes. The four browser checks above exist to
  read network request headers, not to observe a visual or interactive change, which is
  why no R-rule applies; `.claude/rules/browser-verification.md`'s network-inspection
  criterion is satisfied by the browser checks themselves, independent of the R-rule
  table.

## Acceptance criteria

- [ ] **FIX-66-AC01** `grep -rln "function freshIdempotencyKey" src` prints exactly one
      path: `src/app/shared/utils/idempotency-key.ts`.
- [ ] **FIX-66-AC02** `grep -c "freshIdempotencyKey" src/app/features/checkout/checkout.routes.ts`
      and the same for `src/app/features/cart/cart.facade.ts` each print a count equal to
      one import line plus that file's own call sites (**2** for `checkout.routes.ts`:
      the import plus the one call at `:164`; **6** for `cart.facade.ts`: the import plus
      the five calls) — record both counts in the commit body.
- [ ] **FIX-66-AC03** A test asserts that two `saveContactSection()` (or
      `saveDeliverySection()` / `savePaymentMethod()`) calls with an unchanged body carry
      the same `Idempotency-Key` header, and that changing the body before a third call
      changes the header value.
- [ ] **FIX-66-AC04** A test asserts that two `createQuote()` calls with an unchanged cart
      version carry the same `Idempotency-Key` header, and that a version bump between
      calls changes it.
- [ ] **FIX-66-AC05** A test asserts that a `createPaymentIntent()` retry after a
      **transport failure** (no response received) carries the **same**
      `Idempotency-Key` header, and a separate test asserts that a call following a
      **declined** 201 response carries a **different** header value from the call that
      produced the decline.
- [ ] **FIX-66-AC06** **Real-browser check: section-save replay.** Steps 1–2 above.
      Capture both header values for each step and paste all four into the commit body.
- [ ] **FIX-66-AC07** **Real-browser check: quote replay.** Step 3 above. Capture both
      header values.
- [ ] **FIX-66-AC08** **Real-browser check: payment-intent retry after a decline mints a
      new key — this is the criterion the `openapi.yaml` nuance exists for.** Step 4
      above. Capture both header values and state explicitly in the commit body that they
      are expected to differ, citing `openapi.yaml:628-635`.
- [ ] **FIX-66-AC09** `npm run build` exits 0 and `npm run test` exits 0. **FIX-04** owns
      `ng test`'s baseline failure of 14 of 14 files; if it has not landed, record that
      verbatim and instead run `npx vitest run` against whichever spec file the tests
      from item 5 were added to.
- [ ] **FIX-66-AC10** The commit body records, as named items: that `checkout.facade.ts:493`
      and `:547` are the checkout session and quote mutations, not `cart.facade.ts`'s
      cart mutations, correcting the framing this task was given; that
      `checkout.routes.ts`'s parallel `updateCheckout` call (`buildContactDraftSaver`) was
      left with its existing always-fresh-key policy and is the same wire operation as
      `saveSection()`; `ContactStep`'s own signature drift (D15 item 1) is owned by
      **`FIX-63`**, and reconciling the two parallel implementations remains
      unreconciled and unowned; and the two declaration counts from AC02.

## Commit

This task is exactly one commit. The declaration consolidation (item 1) and the three
retry fixes (items 2–4) are inseparable: the retry fixes cannot be tested against one
canonical key generator until the declarations are consolidated, and consolidating the
declarations with no caller yet exercising the held-key behaviour would leave a commit in
the history that imports a shared module for no reason. Do not bundle it with **FIX-61**
or any other task. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: consolidate the idempotency-key generator and stop reissuing keys on retry
```
