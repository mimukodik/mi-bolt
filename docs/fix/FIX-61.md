# FIX-61 — Wire `OrderSubmission` and `PaymentProgress`, and settle the idempotent-retry key

Status: PLANNED — not executed.
Severity: blocker
Source: Review round item N7, carried over from round one: `FIX-25`'s out-of-scope section (A4 findings F4 and F5). `docs/spec/screens.md:87`, `docs/spec/architecture.md:117` and `:121`, `docs/spec/components.md:626-635`. Decision **D1**.

## Why this is wrong

Two modules totalling 1265 lines — `src/app/features/checkout/order-submission.ts` (1044)
and `src/app/features/checkout/payment-progress.ts` (221) — implement the payment polling,
the declined and unknown outcomes, the retry and the replay that `docs/spec/screens.md:87`
requires. **Nothing in the running application imports either of them.** They are reachable
only from `tests/order-submission.spec.ts`, so the specification's payment behaviour is
tested and never shipped.

`docs/spec/screens.md:87` is the requirement:

> Pending stays on same view with meaningful text. Failed payment offers Retry/change
> method; stale quote offers refresh and re-review; stock loss links cart correction. An
> uncertain response says processing outcome not known, not definitive rejection. **Same
> request/key retry is mandatory.**

The review step implements none of it. `review-step.ts:428-453` calls
`createPaymentIntent()` and `commitOrder()` directly, returns silently on either failure —
the defect **FIX-25** makes visible — and never polls, never distinguishes an unknown
outcome from a rejection, and never offers a change of method.

And the last sentence of that requirement is broken in one line.
`checkout.facade.ts:723`:

```ts
    return this.commitOrderWithKey(freshIdempotencyKey(), body);
```

Every call to `commitOrder()` mints a **new** key, so a retry after an uncertain response
is a new request to the mock rather than a replay of the old one. That is the exact
failure mode `docs/spec/architecture.md:121` names: *"A timeout-after-commit retries the
same key/body."* With a fresh key it does not, and a commit that actually succeeded on the
server can be committed a second time.

## Evidence

### Nothing imports either module

```
$ grep -rn "order-submission\|payment-progress\|OrderSubmission\|PaymentProgress" src e2e tests --include='*.ts' --include='*.html'
```

outside the two files themselves, the only hits in `src/` are a comment
(`checkout.facade.ts:728`) and the component's own template
(`payment-progress.html:3`). Every other hit is in `tests/order-submission.spec.ts`.

`OrderSubmission`'s public surface is complete and unused:

```
order-submission.ts:399:  watchProgress(callback: (tick: PaymentProgressTick) => void): () => void {
order-submission.ts:424:  submitOrder(): Promise<SubmitOutcome> {
order-submission.ts:453:  async retryUnknownOutcome(): Promise<SubmitOutcome> {
order-submission.ts:501:  async recoverPersistedOrder(): Promise<RecoveredOrder | null> {
```

and it already models the five outcomes the screen needs (`:89-94`):

```ts
export type SubmitOutcome =
  | { readonly kind: 'committed'; readonly orderId: string; readonly orderNumber: string }
  | { readonly kind: 'declined'; readonly reason: string; readonly intentId: string }
  | { readonly kind: 'pending-timeout'; readonly safeKey: string; readonly intentId: string; readonly attempt: number }
  | { readonly kind: 'unknown'; readonly safeKey: string; readonly reason: string }
  | { readonly kind: 'recovered'; readonly orderId: string; readonly source: 'getOrder' | 'replay' };
```

### What the review step does instead

`review-step.ts:428-453`:

```ts
  async onSubmit(): Promise<void> {
    if (!this.canSubmit()) {
      this.submitted.set(true);
      return;
    }
    this.submitted.set(true);
    this.submitting.set(true);
    try {
      const paymentMethod = this.reviewForm().value().paymentMethod;
      if (paymentMethod === 'demo_card') {
        const intent = await this.checkoutFacade.createPaymentIntent();
        if (!intent.ok) {
          // Payment-decline is surfaced through the cart facade's
          // `error` signal; the form + cart are preserved.
          return;
        }
      }
      const order = await this.checkoutFacade.commitOrder();
      if (!order.ok) {
        return;
      }
      await this.router.navigate(['/penztar/siker', order.value.id]);
    } finally {
      this.submitting.set(false);
    }
  }
```

No polling, no pending view, no unknown-outcome branch.

### The key policy is settled by the repository, not open

This is the correction to the way the defect was recorded: **the idempotent-retry key
policy is not an open design question.** `docs/spec/architecture.md` §9 settles it in two
sentences.

`architecture.md:117`:

> For mutations use `If-Match: "<cart.version>"` and `Idempotency-Key`. Idempotency lookup
> happens before comparing current cart status/version: a replay after success must not
> become a conflict. **Scope key to session+method+path and canonical request fingerprint,
> including semantically relevant version precondition. A retry sends the identical
> body/precondition. Reusing a key with a different payload returns 409.** Store terminal
> success or domain-conflict outcome for replay; transport errors before execution have no
> commit; failed schema validation mutates nothing.

`architecture.md:121`:

> For order commit: revalidate quote/session/cart/stock… **A timeout-after-commit retries
> the same key/body.** Successful replay uses persisted receipt before examining cleared
> volatile draft.

So the policy is: **one key per canonical request fingerprint.** Mint a key the first time
a given body is submitted; reuse it byte-identically for every retry of that same body;
mint a new one only when the fingerprint changes — a new quote id, a different payment
intent, a different payment method. Nothing here is invented; the two sentences above are
the rule and `docs/api/openapi.yaml:717` states the mock's half of it: *"Replay
idempotency result before examining cart status or expiry."*

### The machinery for it already exists and is unused

`checkout.facade.ts:726-732` — the method written for exactly this, called from one place
that always hands it a fresh key:

```ts
  /**
   * Commit with an externally supplied idempotency key. Used by
   * `OrderSubmission` so the persisted safe-order record's key
   * matches the one the mock's idempotency cache actually stores
   * (T23-AC04). The body MUST match the wire contract — no PII.
   */
  async commitOrderWithKey(
```

Its docblock names `OrderSubmission` as the caller. `OrderSubmission` does not call it.

**The key generator is declared four times**, once per module, with two different
fallbacks:

```
src/app/features/checkout/checkout.routes.ts:66:function freshIdempotencyKey(): string {
src/app/features/checkout/order-submission.ts:1002:function freshIdempotencyKey(): string {
src/app/features/checkout/checkout.facade.ts:143:function freshIdempotencyKey(): string {
src/app/features/cart/cart.facade.ts:74:function freshIdempotencyKey(): string {
```

`checkout.facade.ts:143-145` returns `globalThis.crypto.randomUUID()` unguarded;
`order-submission.ts:1002-1007` guards the call and falls back to a timestamp-plus-random
string. Two of the four copies therefore produce different key shapes for one concept.

### `PaymentProgress` drifts from its own entry

`docs/spec/components.md:626-635` declares:

```
**Signal inputs:** `status:PaymentStatus; pollCount:number`.
**Outputs:** `retryRequested:void; changeMethodRequested:void`.
**Functions:** Explain simulated in-flight/declined/unknown; limit polling in orchestrator, never in template.
**Required states:** pending,succeeded,declined,unknown,error.
```

The implementation (`payment-progress.ts:146-150`) injects the orchestrator and takes one
input that is not in the entry:

```ts
export class PaymentProgress implements OnDestroy {
  private readonly submission = inject(OrderSubmission);

  /** Optional override for the max attempts; defaults to the constant. */
  readonly maxAttemptsOverride = input<number | null>(null);
```

It has no outputs, so the *"Retry/change method"* that `screens.md:87` requires has nothing
to emit through. Its internal `PaymentProgressState` (`:93-103`) is
`pending | attempt | succeeded | declined | timeout`, while `components.md:7` declares
`PaymentStatus = idle | pending | succeeded | declined | unknown | error`. Under **D1** the
declared type wins.

## What to change

### 1. `CheckoutFacade` — one key per fingerprint

Replace `checkout.facade.ts:723`'s unconditional mint with a held key.

- Add a private writable signal holding `{ fingerprint: string; key: string } | null`.
- Build the fingerprint from the canonical request body `commitOrder()` already assembles
  at `:713-722` — `cartId`, `quoteId`, `paymentIntentId`, `termsVersion`, `acceptedTerms`,
  `acknowledgedSimulation` — as a stable, key-sorted serialisation. `architecture.md:117`
  calls this the *"canonical request fingerprint"*.
- `commitOrder()` mints a key only when the stored fingerprint is absent or differs, and
  otherwise reuses the stored one. Either way it calls `commitOrderWithKey`.
- Clear the stored pair when the commit reaches a terminal success, so a genuinely new
  order never inherits the previous one's key.

**Use `JSON.stringify` over a key-sorted array of the six fields, not over the object
literal.** Object key order is a property of how the literal was written, and a
fingerprint that changes when someone reorders two lines in `:713-722` would mint a new key
for an identical request, which is the defect being fixed.

**Do not change `createPaymentIntent()` (`:642`) or the checkout session and quote
mutations at `:493` (`updateCheckout`, inside `saveSection()`) and `:547`
(`createCheckoutQuote`, inside `createQuote()`).** They mint a fresh key per call for the
same reason and the same rule reaches them, but `screens.md:87` is about the order commit
and widening this task to four operations puts three more screens in its diff.
**`FIX-66`** owns them. Record that in the commit body and leave them unchanged here.

**Consolidate the two copies this task already edits, and record the other two.** Keep
`checkout.facade.ts:143-145`, take `order-submission.ts:1002-1007`'s guarded body as its
implementation — the guarded one is the safer of the two — export it, and have
`order-submission.ts`'s callers import it. Two generators with different fallbacks for one
concept is the duplicate-declaration defect this package removes elsewhere.

**Leave `checkout.routes.ts:66` and `cart.facade.ts:74` alone.** They are the same
four-way duplication, in two files this task does not otherwise touch. **`FIX-66`** owns
consolidating all four declarations into one. Record both in the commit body.

### 2. `PaymentProgress` — the declared surface

```ts
  readonly status = input.required<PaymentStatus>();
  readonly pollCount = input.required<number>();

  readonly retryRequested = output<void>();
  readonly changeMethodRequested = output<void>();
```

Declare `PaymentStatus` in `src/app/shared/types/`, beside `ui-problem.ts`, exactly as
`components.md:7` declares it:
`'idle' | 'pending' | 'succeeded' | 'declined' | 'unknown' | 'error'`.

- Delete the `inject(OrderSubmission)` at `:147`, the `watchProgress` subscription in the
  constructor (`:194-198`), `ngOnDestroy`'s teardown, the `currentTick` signal and
  `maxAttemptsOverride`. `components.md:632` is explicit: *"limit polling in orchestrator,
  never in template"* — a presentation component that subscribes to the orchestrator is on
  the wrong side of that line.
- Map the internal `PaymentProgressState` onto `PaymentStatus` **at the call site**, not
  inside the component: `attempt` becomes `pending`, `timeout` becomes `unknown`.
- Render all five required states, and give `declined` and `unknown` the two controls the
  outputs name. `screens.md:87` fixes what the `unknown` state must say: *"An uncertain
  response says processing outcome not known, not definitive rejection."*
- The heading copy at `:168-183` moves with the states; keep the existing Hungarian
  strings verbatim and add one for `error`. `FIX-35` owns UI copy corrections and this is
  not one.
- **Delete `changeDetection: ChangeDetectionStrategy.OnPush` at `:142`** only if **FIX-59**
  has not yet landed; if it has, the line is already gone. Say which in the commit body.

### 3. `ReviewStep` — wire the orchestrator in

`onSubmit()` (`:428-453`) becomes: call `OrderSubmission.submitOrder()` and branch on the
five `SubmitOutcome` kinds.

- `committed` and `recovered` — navigate to `/penztar/siker/<orderId>`, as today.
- `declined` — stay on the view, render `PaymentProgress` with `status="declined"`, and
  wire its two outputs: `retryRequested` calls `submitOrder()` again, and
  `changeMethodRequested` navigates to `/penztar/szallitas`.
- `pending-timeout` and `unknown` — stay on the view with `status="unknown"`. **Retry is
  offered and it sends the same key**, which item 1 is what makes true.
- Render `PaymentProgress` inside the review step while a submission is in flight, with
  `status="pending"` and `pollCount` from the orchestrator's tick. `screens.md:87`:
  *"Pending stays on same view with meaningful text."*
- `ReviewStep` — not `PaymentProgress` — subscribes to `watchProgress` and maps each tick
  onto the two inputs. That is the orchestrator boundary `components.md:632` draws.

**Keep what `FIX-25` built.** FIX-25 lands first and adds the declined/failed surface with
the machinery already on the page, including `data-testid="review-submit-failure"` and
`data-testid="review-change-payment"`. This task replaces the *path* that reaches those
elements, not the elements. Where FIX-25's surface and `PaymentProgress` would render the
same message twice, `PaymentProgress` is the one that survives, because
`components.md:626` gives it that job; record the replacement in the commit body rather
than leaving two.

### 4. What `FIX-10` leaves behind in `OrderSubmission`

**`FIX-10` lands first** and deletes the bespoke localStorage safe-order store from
`order-submission.ts`, under decision **D5**: the app layer stores no business data. That
removes the backing for two things:

- `retryUnknownOutcome()`'s `safeKey` route (`:453`). Rebuild it on the key item 1 now
  holds in `CheckoutFacade`, which is the correct home for it anyway — the key belongs to
  the request, not to a storage record.
- `recoverPersistedOrder()` (`:501`). After FIX-10 the mock persists receipts, so recovery
  is a `getOrder` against the mock rather than a read of a local record. **If nothing calls
  it after this task, delete it** rather than leaving a method with no caller and no store:
  `.claude/rules/code-standards.md` — *"A cut feature leaves nothing behind."*

`FIX-10`'s "What to change" section says to keep `watchProgress` and everything it needs;
this task is what finally gives it a caller.

### 5. Tests

- `tests/order-submission.spec.ts` keeps its outcome tests. **Do not move it** — `FIX-06`
  owns relocating specs.
- A new test on the review step's spec file for each of the five `SubmitOutcome` kinds,
  asserting what the screen renders and where it navigates.
- **A test for the key policy, and it is the one that matters**: submit, force an unknown
  outcome, retry, and assert with an MSW request spy that **both requests carried the same
  `Idempotency-Key` header value**. Then change the payment method, submit again, and
  assert the key differs. Asserting that the facade holds a signal is not this test;
  asserting the header value on two intercepted requests is.
- A test per `PaymentStatus` value on `PaymentProgress`'s own spec file, setting the input
  and asserting the rendered difference, plus one per output.

## Out of scope

- **Making a failed commit visible with the page's existing machinery — `FIX-25`.** It
  lands first and this task builds on it.
- **`DeliveryStep.onConfirm()`'s silent save failure — `FIX-44`.** The same class of
  defect one screen earlier.
- **The cart and receipt persistence move — `FIX-10`.** It lands first. Do not re-introduce
  any app-layer storage of business data; **D5** forbids it.
- **`createPaymentIntent()` and the checkout session and quote mutations that also mint
  a fresh key per call — `FIX-66`.** (`checkout.facade.ts:642`, `:493`
  `updateCheckout`/`saveSection()`, `:547` `createCheckoutQuote`/`createQuote()`) — not
  `cart.facade.ts`'s five mutation call sites, a different file this task does not
  touch. Same rule, different operations, now owned by `FIX-66`. Change none of them
  here.
- **`src/app/features/checkout/checkout.routes.ts:66` and
  `src/app/features/cart/cart.facade.ts:74` — `FIX-66`.** The other two
  `freshIdempotencyKey` declarations. Same duplication, two files this task does not
  otherwise open; `FIX-66` owns consolidating all four.
- **`PaymentProgressConfig` (`payment-progress.ts:218`) and the two polling constants.**
  They stay; the orchestrator reads them, which is where `components.md:632` puts the
  limit.
- **The review step's quote banners and `QuoteState`** (`review-step.html:135-178`,
  `quote-state.ts`). `FIX-25` already fences these off; a commit failure never routes into
  the quote controller's state.
- **The review step's H1 and the "Szerkesztés" links — `FIX-35`.**
- **`ReviewStep`'s own signature drift — `FIX-63`.** Against `components.md:615`
  (`quote`, `cart`, `draft`, `state` inputs; the component has none). Do not fix it here.
- **`payment-progress.ts`'s `changeDetection` line beyond item 2 — `FIX-59`.** Same file;
  never concurrent.
- **The mock's idempotency cache** in `src/mocks/`. It already implements the replay
  (`openapi.yaml:717`); this task makes the client honour it. If the mock turns out not to
  replay, that is a finding for the report, not a change here.

## How to verify

Gate baseline (measured on commit `db6d295`): `npm run lint` never runs (`FIX-01`), `npm run test` (`ng test`) fails 14/14 files (`FIX-04`), `npx playwright test` has 41 failures (`FIX-09`).

**Prerequisites, in this order: `FIX-10`, then `FIX-25`, then this task.** FIX-10 removes
the storage this task must not rebuild and makes the mock the source of truth; FIX-25 adds
the surface this task routes into. If either is missing, stop and report.

```bash
npm run build               # expected exit 0
npm run test                # record the exit code; a failure attributable to FIX-04 does not
                            # fail this task, but tests/order-submission.spec.ts and
                            # PaymentProgress's own spec file must pass
grep -rn "function freshIdempotencyKey" src
                            # expected: 3 lines — down from 4; see AC03
```

`npm start` is not part of that block: it is `ng serve` and never exits, so a sequential
run that includes it hangs. Start it separately, in the background, before the browser
checks below, and stop it when finished.

Browser checks (mandatory — this is the moment a person pays):

1. At 1440, walk a full purchase by clicking to `/penztar/ellenorzes`, accept both
   confirmations, and submit. The pending view must stay on the review screen with visible
   text while the payment is in flight, then reach `/penztar/siker/<id>`.
2. Force a declined payment through the mock's scenario mechanism. The review screen must
   stay, explain the decline, and offer both a retry and a change of method. Take the
   change-of-method route and confirm it reaches `/penztar/szallitas` with the cart intact.
3. Force an uncertain outcome. The screen must say the outcome is not known and must not
   present it as a rejection.
4. **From state 3, retry, and read the network log.** Both `POST /api/v1/orders` requests
   must carry the **same** `Idempotency-Key` header value. Capture both request headers;
   that capture is the proof for AC04 and a screenshot is not.
5. Change the payment method, submit again, and confirm the header value is now different.
6. Repeat step 1 at 390.

Stop the dev server when finished.

### Design rules (mi-bolt-design R01–R26)

Skill provenance is stated once in `docs/fix/README.md` section 3, "Every task records
the design rules": the installed path, the version, and the fact that
`docs/mi-bolt/execution/skill-location.json` does not exist yet (**FIX-38** owns it).
Cite it from there; do not restate it here.

- **R14 applies and is the rule this task restores**: all five of `PaymentProgress`'s
  required states — pending, succeeded, declined, unknown, error — become reachable and
  each is set by an input. Screenshot all five.
- **R15 applies and is load-bearing here**: the `unknown` state must say the outcome is not
  known rather than that the order failed, per `screens.md:87`, and no backend detail
  reaches the user in any state.
- **R16 applies**: the pending state is an in-flight operation on the same view, with
  meaningful text rather than a bare spinner, and it must not block the page behind an
  opaque overlay.
- **R20 and R21 apply**: the retry and change-method controls have discernible accessible
  names, a visible focus ring, and a 44 px minimum target at 390 and at 1440.
- **R22 applies**: the state changes are announced, not indicated by colour alone. The
  pending, declined and unknown transitions reach an `aria-live` region.
- **R23 applies**: when the declined or unknown state replaces the submit control, focus
  moves to that surface rather than being lost to the document body.
- **R26 applies and is satisfied by the commit body**: a handoff-practice rule. Under
  **D23** the commit body is where this task's R01–R26 outcome is recorded, together with
  every file changed, every command run and its result.
- R01–R13, R17–R19, R24, R25: N/A — this change rewires three TypeScript modules and one
  template. It introduces no brand asset, colour, dimension, font, centerline, image, data
  source or handoff artefact, and the Hungarian copy it renders is carried over verbatim.

## Acceptance criteria

- [ ] **FIX-61-AC01** `grep -rn "OrderSubmission" src/app/features/checkout/review-step.ts`
      returns at least one line, and `PaymentProgress` appears in `ReviewStep`'s `imports`
      array. The two modules are reachable from the running application.
- [ ] **FIX-61-AC02** `PaymentProgress` declares exactly the inputs `status` and
      `pollCount` and the outputs `retryRequested` and `changeMethodRequested`, and
      `grep -c "inject(OrderSubmission)" src/app/features/checkout/payment-progress.ts`
      prints `0`.
- [ ] **FIX-61-AC03** `grep -c "function freshIdempotencyKey" src/app/features/checkout/order-submission.ts`
      prints `0`, and `grep -rn "function freshIdempotencyKey" src` returns exactly
      **three** lines — `src/app/features/checkout/checkout.facade.ts:143`
      (`export function freshIdempotencyKey`, the canonical declaration this task keeps),
      `src/app/features/checkout/checkout.routes.ts:66` and
      `src/app/features/cart/cart.facade.ts:74` — down from the four measured at baseline.
      The latter two are named in the commit body as a duplication owned by `FIX-66`, not
      silently left.
- [ ] **FIX-61-AC04** **Real-browser check: the same key on retry — this is the criterion
      the task exists for.** With an uncertain outcome forced, submit and then retry. The
      network log shows two `POST /api/v1/orders` requests carrying an **identical**
      `Idempotency-Key` header value. Both header values are pasted into the commit body.
- [ ] **FIX-61-AC05** **Real-browser check: a changed body gets a new key.** After changing
      the payment method and submitting again, the `Idempotency-Key` differs from the value
      in AC04. Paste it too.
- [ ] **FIX-61-AC06** A test in `tests/order-submission.spec.ts` or in the review step's
      spec file intercepts two retried commits through MSW and asserts their
      `Idempotency-Key` headers are equal, and asserts they differ after the body changes.
      A test that reads a signal on the facade does not satisfy this criterion.
- [ ] **FIX-61-AC07** **Real-browser check: the pending view.** During an in-flight
      submission the review screen stays mounted and shows meaningful text, and the URL
      does not change until the outcome is terminal. `list_console_messages` reports zero
      errors.
- [ ] **FIX-61-AC08** **Real-browser check: declined.** The declined state renders both a
      retry and a change-of-method control; the change-of-method control reaches
      `/penztar/szallitas` with the cart intact.
- [ ] **FIX-61-AC09** **Real-browser check: unknown.** The unknown state's visible text
      says the outcome is not known and does not present the order as rejected. Quote the
      rendered sentence in the commit body.
- [ ] **FIX-61-AC10** `PaymentProgress`'s spec file contains one test per `PaymentStatus`
      value asserting a rendered difference, and one test per output asserting it emits.
- [ ] **FIX-61-AC11** `npm run build` exits 0 and `npm run test` exits 0.
      **FIX-04** owns `ng test`'s baseline failure of 14 of 14 files; if it has not
      landed, record that verbatim and run this task's own spec with
      `npx vitest run tests/order-submission.spec.ts` plus `PaymentProgress`'s own spec
      file instead.
- [ ] **FIX-61-AC12** The commit body records: that `createPaymentIntent()` and the
      checkout session and quote mutations at `:493` and `:547` still mint a fresh key
      per call, owned by `FIX-66`; that
      `freshIdempotencyKey` is still declared in `checkout.routes.ts:66` and
      `cart.facade.ts:74`, also owned by `FIX-66`; whether
      `recoverPersistedOrder()` was rebuilt or deleted, and why; `ReviewStep`'s own
      signature drift against `components.md:615`, owned by `FIX-63`; and which of
      FIX-25's elements `PaymentProgress` replaced.

## Commit

This task is exactly one commit. The three parts are inseparable: the key policy is
unobservable without a retry path, the retry path is unreachable without the orchestrator
wired in, and the orchestrator has nothing to render through until `PaymentProgress` has
the declared surface. Do not bundle it with **FIX-10**, **FIX-25**, **FIX-44** or
**FIX-59**. Commit only after every acceptance criterion above passes.

Suggested subject line, in the repository's existing `type: summary` style:

```
fix: wire the order submission flow and reuse the idempotency key on retry
```
