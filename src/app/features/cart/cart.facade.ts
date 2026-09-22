/**
 * T17 — global cart signal facade.
 *
 * One root-provided service owns the authoritative cart snapshot
 * for the header (T11), the product-add surface (T15/T18), and the
 * checkout flow (T19+). The facade exposes a read-only signal
 * surface for views, and a small mutation API that:
 *
 *   - serializes every write through a single queue so two clicks
 *     cannot race (E039 — slow-cart-write);
 *   - binds `If-Match` to the version returned by the PREVIOUS
 *     dispatch, never the version visible at click time (AC02);
 *   - waits for the authoritative server response before changing
 *     line totals so the UI never shows an unconfirmed state (AC03);
 *   - on 412 surfaces a `conflict` signal, refetches in the background
 *     AND waits for an explicit `retry()` call; the failed intent is
 *     NOT auto-replayed (AC04);
 *   - on 410 raises `cartExpired` and drops the snapshot; the next
 *     `refetch()` gets a fresh cart because `GET /cart` creates one.
 *     404 is an ordinary error (unknown variant). 401 is never invented
 *     for this unauthenticated demo (AC05);
 *   - fetches the session's cart once on construction so a reload
 *     restores it on every screen, not only on the cart page.
 *
 * The T11 `CartCountFacade` token is preserved as a re-export so
 * the existing header binding needs no change.
 */

import { HttpClient, HttpErrorResponse, type HttpContext } from '@angular/common/http';
import { DestroyRef, Service, computed, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';

import { Api } from '../../api/generated/api';
import { ApiConfiguration } from '../../api/generated/api-configuration';
import { addCartItem, clearCart, getCart, removeCartItem } from '../../api/generated/functions';
import { withIfMatch } from '../../core/api/demo-session.interceptor';
import type { Cart } from '../../api/generated/models/cart';
import type { Money } from '../../api/generated/models/money';
import { isRecord } from '../../shared/utils/is-record';

import {
  CartMutationQueue,
  type DispatchInputs,
  type DispatchResult,
  type MutationIntent,
  type MutationIntentKind,
} from './cart-mutation-queue';

/** Conflict payload surfaced to the UI when a 412 arrives. */
export interface CartConflict {
  readonly code: 'CART_VERSION_CONFLICT';
  readonly status: 412;
  readonly detail: string;
  /** Kind of intent that conflicted (the one retry() will resubmit). */
  readonly intentKind: MutationIntentKind;
  /** Server-reported version after the refetch. */
  readonly serverVersion: number;
}

/** Generic error payload surfaced to the UI for non-recoverable failures. */
export interface CartError {
  /** Server-reported code or the local `'UNKNOWN'` sentinel; `'UNKNOWN'`
   *  is not a member of the generated `ProblemCode` union, so the field is
   *  typed as `string` rather than casting. */
  readonly code: string;
  readonly status: number;
  readonly detail: string;
  /** Problem `params` as sent, e.g. `{ max, requested }` on QUANTITY_LIMIT. */
  readonly params?: Readonly<Record<string, unknown>>;
}

const ZERO_MONEY: Money = { amount: 0, currency: 'HUF' };

/**
 * Root-provided cart owner. `TestBed.inject(CartFacade)` returns the
 * same instance for every consumer so totals, itemCount, and the
 * pending state are identical across the header, the product page,
 * and the checkout flow.
 */
@Service()
export class CartFacade {
  private readonly api: Api;
  private readonly destroyRef = inject(DestroyRef);
  private readonly queue = new CartMutationQueue();

  /** Internal writable snapshot of the authoritative cart state. */
  private readonly cartWritable = signal<Cart | null>(null);

  /** Public readonly cart signal. Null until `ensureCart()` lands. */
  readonly cart: Signal<Cart | null> = this.cartWritable.asReadonly();

  /** Sum of all line quantities (`Cart.totalQuantity`, the header badge number). 0 when no cart is loaded. */
  readonly itemCount: Signal<number> = computed(() => {
    const cart = this.cartWritable();
    if (cart === null) return 0;
    return cart.totalQuantity;
  });

  /** Authoritative subtotal in whole HUF. */
  readonly subtotal: Signal<Money> = computed(() => {
    const cart = this.cartWritable();
    if (cart === null) return ZERO_MONEY;
    return cart.subtotal;
  });

  /** Number of intents currently queued or dispatching. */
  readonly pending: Signal<number> = this.queue.pendingCount;

  private readonly errorWritable = signal<CartError | null>(null);
  /** Last non-recoverable error, or null. */
  readonly error: Signal<CartError | null> = this.errorWritable.asReadonly();

  private readonly conflictWritable = signal<CartConflict | null>(null);
  /** Last 412 conflict, or null. Cleared on the next successful dispatch. */
  readonly conflict: Signal<CartConflict | null> = this.conflictWritable.asReadonly();

  private readonly cartExpiredWritable = signal<boolean>(false);
  /** True after the server returned 410 for the active cart. */
  readonly cartExpired: Signal<boolean> = this.cartExpiredWritable.asReadonly();

  /**
   * Holds the most recent failed intent so `retry()` can resubmit it
   * with the CURRENT version. Cleared on the next successful dispatch.
   */
  private lastFailedIntent: MutationIntent | null = null;

  /**
   * Monotonic counter incremented before every mutation is enqueued.
   * Each dispatch captures its token locally and only applies the
   * result when the token is still strictly newer than
   * `postOrderToken` — otherwise the result belongs to the cart that
   * was just ordered and must NOT be written back to the in-memory
   * snapshot. See `resetOrderedCart` for the sentinel and
   * `shouldApplyResult` for the comparison.
   */
  private dispatchToken = 0;
  /**
   * Snapshot of `dispatchToken` at the moment `resetOrderedCart` runs.
   * Dispatches that started before this value resolve against the
   * ordered cart and are discarded; dispatches that start after the
   * reset belong to a fresh purchase and are applied normally.
   */
  private postOrderToken = -1;

  constructor() {
    // The generated `Api` class relies on Angular decorator metadata
    // for constructor injection. Vitest's esbuild pipeline does not
    // emit that metadata, so we wire it manually from the two
    // primitives that ARE injectable: `HttpClient` and
    // `ApiConfiguration`. In a real browser the same `new Api(...)`
    // call sees the live `HttpClient` produced by
    // `provideHttpClient(withFetch(), withInterceptors(...))`.
    this.api = new Api(inject(ApiConfiguration), inject(HttpClient));
    this.queue.setVersionProvider(() => this.cartWritable()?.version ?? null);
    this.destroyRef.onDestroy(() => {
      this.queue.destroy();
    });
    // A full page load starts this facade with an empty snapshot while
    // the backend still holds the session's cart, so every screen that
    // does not open the cart itself — the header badge above all —
    // reads 0 until the user navigates to `/penztar/kosar`.
    // `docs/spec/architecture.md:109` requires the CART to restore
    // across a reload, not the cart page to restore it, so the facade
    // acquires its own cart once here instead of waiting to be asked.
    // `ensureCart()` issues `GET /cart`, which returns the session's
    // cart and creates an empty one when the session has none.
    // Failures land on the `error` signal exactly as a user-triggered
    // call's would; the facade never throws on an HTTP error.
    void this.ensureCart();
  }

  /**
   * Loads the session cart once. Safe to call multiple times: a
   * loaded snapshot makes it a no-op, and the snapshot is re-checked
   * inside the queue callback so two near-simultaneous calls collapse
   * into a single `GET /cart`.
   */
  async ensureCart(): Promise<void> {
    if (this.cartWritable() !== null) {
      return;
    }
    const token = ++this.dispatchToken;
    const intent: MutationIntent = { kind: 'refetch', retry: false };
    const result = await this.queue.enqueue(intent, (inputs) => {
      const existing = this.cartWritable();
      if (existing !== null) {
        return Promise.resolve({ ok: true as const, cart: existing });
      }
      return this.dispatchRefetch(inputs);
    });
    if (!this.shouldApplyResult(token)) return;
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /**
   * Adds a variant to the cart. The intent is serialized behind
   * every other queued mutation, and its `If-Match` binds to the
   * version the PREVIOUS dispatch returned. Throws if no cart has
   * been loaded yet (call `ensureCart()` first).
   */
  async addItem(variantId: string, quantity: number): Promise<void> {
    const token = ++this.dispatchToken;
    const intent: MutationIntent = { kind: 'addItem', retry: false, variantId, quantity };
    const result = await this.queue.enqueue(intent, (inputs) => this.dispatch(inputs));
    if (!this.shouldApplyResult(token)) return;
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /**
   * Removes the line keyed by `variantId`; the server answers 200
   * when the line is already gone. Serialized like every other
   * mutation.
   */
  async removeItem(variantId: string): Promise<void> {
    const token = ++this.dispatchToken;
    const intent: MutationIntent = { kind: 'removeItem', retry: false, variantId };
    const result = await this.queue.enqueue(intent, (inputs) => this.dispatch(inputs));
    if (!this.shouldApplyResult(token)) return;
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /** Empties the cart (`DELETE /cart/items`). A no-op on the server when already empty. */
  async clear(): Promise<void> {
    const token = ++this.dispatchToken;
    const intent: MutationIntent = { kind: 'clear', retry: false };
    const result = await this.queue.enqueue(intent, (inputs) => this.dispatch(inputs));
    if (!this.shouldApplyResult(token)) return;
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /**
   * Re-submits the most recent failed intent with the CURRENT
   * expected version. No-op when no conflict is recorded. The
   * contract requires this be an explicit user action; the facade
   * never auto-replays.
   */
  async retry(): Promise<void> {
    const failed = this.lastFailedIntent;
    if (failed === null) {
      return;
    }
    // Clear the recorded conflict so a subsequent failure re-arms
    // retry() instead of letting stale state persist.
    this.lastFailedIntent = null;
    const token = ++this.dispatchToken;
    const retryIntent: MutationIntent = { ...failed, retry: true };
    const result = await this.queue.enqueue(retryIntent, (inputs) => this.dispatch(inputs));
    if (!this.shouldApplyResult(token)) return;
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /**
   * Refetches the active cart without an `If-Match`. Called
   * internally after a 412 to bring the local snapshot into sync
   * with the server. Exposed for tests that need to simulate a
   * remote version bump.
   */
  async refetch(): Promise<void> {
    const token = ++this.dispatchToken;
    const intent: MutationIntent = { kind: 'refetch', retry: false };
    const result = await this.queue.enqueue(intent, (inputs) => this.dispatchRefetch(inputs));
    if (!this.shouldApplyResult(token)) return;
    if (result.ok) {
      // A post-conflict refetch must NOT clear `lastFailedIntent` —
      // the user has not yet pressed Retry, and clearing it would
      // turn the Retry button into a no-op as soon as the refetch
      // settles. See cart.facade.ts:577 (applySuccess).
      this.applySuccess(result.cart, { fromRefetch: true });
    }
  }

  /**
   * Drops the in-memory cart snapshot the moment an order lands, so
   * the header badge reads 0 even though past-receipt replay remains
   * available through the URL (T24-AC03). Synchronous and idempotent:
   *   - clears the local cart snapshot,
   *   - clears conflict / cartExpired / error overlays,
   *   - drops any pending intent that was queued against the ordered
   *     cart (the user has moved on; replaying them now would resurrect
   *     the just-ordered items),
   *   - clears the retry affordance so the success page never offers
   *     "Retry" against a server that already accepted the order.
   * No network call is issued — the server already owns the truth.
   */
  resetOrderedCart(): void {
    // Freeze the token at the moment the order lands so any dispatch
    // that is still in flight against the just-ordered cart is
    // discarded by `shouldApplyResult`. Without this the in-flight
    // `addItem` the user issued before pressing "Demórendelés
    // véglegesítése" would resolve after `cartWritable.set(null)` and
    // resurrect the ordered cart — defeating T24-AC03's header-badge
    // contract.
    this.postOrderToken = this.dispatchToken;
    this.cartWritable.set(null);
    this.conflictWritable.set(null);
    this.cartExpiredWritable.set(false);
    this.errorWritable.set(null);
    this.lastFailedIntent = null;
    this.queue.clearPending();
  }

  /**
   * Adopt a version the server bumped through a non-cart mutation
   * (`PATCH /checkout`, the shared session counter, openapi.yaml:16-19).
   * The lines did not change, only the version, so nothing is refetched,
   * and no cart-side failure signal is touched: a cart error the bump
   * did not resolve (an `OUT_OF_STOCK` rejection never bumps the
   * version) stays on screen until the cart itself clears it
   * (design §2.1, "four lines").
   */
  acceptServerVersion(version: number): void {
    const cart = this.cartWritable();
    if (cart === null || cart.version === version) return;
    this.cartWritable.set({ ...cart, version });
  }

  /**
   * True when a dispatch captured `token` BEFORE the most recent
   * `resetOrderedCart()`. Such a dispatch belongs to the cart that
   * was just ordered; the result must not be written back to the
   * in-memory snapshot, otherwise the user would see the items they
   * already ordered reappear in the header badge.
   */
  private shouldApplyResult(token: number): boolean {
    return token > this.postOrderToken;
  }

  /**
   * Test seam: replaces the local cart snapshot with one the unit
   * suite supplied. Production code does not call this; the layout
   * spec uses it to drive `itemCount` without standing up the full
   * create / mutate / refetch lifecycle.
   */
  _seedCart(snapshot: Partial<Cart> & { id: string; totalQuantity: number }): void {
    this.cartWritable.set({
      id: snapshot.id,
      version: snapshot.version ?? 1,
      items: snapshot.items ?? [],
      lineCount: snapshot.lineCount ?? snapshot.items?.length ?? 0,
      totalQuantity: snapshot.totalQuantity,
      subtotal: snapshot.subtotal ?? { ...ZERO_MONEY },
      expiresAt: snapshot.expiresAt ?? '2026-12-31T23:59:59.000Z',
      notices: snapshot.notices ?? [],
    });
  }

  // -------------------------------------------------------------------------
  // Dispatch helpers — wire the SDK + interceptor + Problem mapping into the
  // queue. Each helper returns a typed `DispatchResult` so the queue never
  // sees an `HttpErrorResponse` directly.
  // -------------------------------------------------------------------------

  private async dispatch(inputs: DispatchInputs): Promise<DispatchResult> {
    const { intent, expectedVersion } = inputs;
    if (intent.kind === 'refetch') {
      return this.dispatchRefetch(inputs);
    }
    if (expectedVersion === null) {
      // A write needs the version GET /cart returned; callers run
      // ensureCart() first, so this only fires when that fetch failed.
      const result: DispatchResult = {
        ok: false,
        code: 'CART_NOT_LOADED',
        status: 0,
        detail: 'The cart has not been loaded; ensureCart() did not succeed.',
      };
      this.recordFailure(intent, result);
      return result;
    }
    const context = withIfMatch(expectedVersion);
    try {
      const cart = await firstValueFrom(this.invokeWrite(intent, context));
      return { ok: true, cart };
    } catch (err) {
      return this.handleError(inputs, err);
    }
  }

  /** Picks the SDK call for a write intent; `refetch` never reaches here. */
  private invokeWrite(
    intent: Exclude<MutationIntent, { kind: 'refetch' }>,
    context: HttpContext,
  ): Observable<Cart> {
    switch (intent.kind) {
      case 'addItem':
        return this.api.invoke(
          addCartItem,
          { body: { variantId: intent.variantId, quantity: intent.quantity } },
          context,
        );
      case 'removeItem':
        return this.api.invoke(removeCartItem, { variantId: intent.variantId }, context);
      case 'clear':
        return this.api.invoke(clearCart, {}, context);
    }
  }

  private async dispatchRefetch(inputs: DispatchInputs): Promise<DispatchResult> {
    try {
      const cart = await firstValueFrom(this.api.invoke(getCart, {}));
      return { ok: true, cart };
    } catch (err) {
      return this.handleError(inputs, err);
    }
  }

  // -------------------------------------------------------------------------
  // Centralized error mapping. Every dispatcher funnels through here so a
  // 412 always lands in the conflict signal, a 410 always in cartExpired,
  // and other Problems land in `error`.
  // -------------------------------------------------------------------------

  private handleError(inputs: DispatchInputs, err: unknown): DispatchResult {
    const result = mapError(err);
    this.recordFailure(inputs.intent, result);
    return result;
  }

  private recordFailure(intent: MutationIntent, result: DispatchResult): void {
    if (result.ok) return;
    if (result.code === 'CART_VERSION_CONFLICT') {
      // A back-to-back conflict must keep the FIRST failed intent so
      // `retry()` replays the user's original operation, not the
      // second one. Only the first recordFailure for a fresh
      // conflict surface gets to overwrite `lastFailedIntent`.
      if (this.conflictWritable() === null) {
        this.lastFailedIntent = intent;
      }
      const conflict: CartConflict = {
        code: 'CART_VERSION_CONFLICT',
        status: 412,
        detail: result.detail,
        intentKind: intent.kind,
        // The refetch runs in the background and will overwrite this
        // with the post-refetch version. We report the last known
        // version here so a synchronous UI consumer has a value, but
        // the doc on `CartConflict.serverVersion` warns it lags the
        // server until the refetch settles.
        serverVersion: this.cartWritable()?.version ?? 0,
      };
      this.conflictWritable.set(conflict);
      // A subsequent failure of a different kind must clear the
      // stale conflict overlay; we keep `lastFailedIntent` set so the
      // user still has a retry affordance.
      this.errorWritable.set(null);
      this.cartExpiredWritable.set(false);
      // Fire-and-forget refetch so the next dispatch binds to a
      // fresh version. We do not await it here so the failed intent
      // resolves immediately and the queue can move on.
      void this.refetch();
      return;
    }
    if (result.code === 'CART_EXPIRED') {
      // Drop the local snapshot so the next ensureCart() or
      // refetch() issues `GET /cart`, which creates a fresh cart
      // after the server forgot the expired one. PRESERVE
      // `lastFailedIntent`: the expired cart may have been caused
      // by the refetch that followed the user's original conflict,
      // not by the user's intent itself. Clearing it here would
      // discard the recoverable Retry button the user is about to
      // click (AC04).
      this.cartWritable.set(null);
      this.cartExpiredWritable.set(true);
      this.conflictWritable.set(null);
      this.errorWritable.set(null);
      return;
    }
    // Generic failure branch: keep the lastFailedIntent if a conflict
    // is currently surfaced so the retry affordance survives a
    // transient error; otherwise discard it. Clear the stale conflict
    // overlay so the UI doesn't accumulate error states.
    this.errorWritable.set({
      code: result.code,
      status: result.status,
      detail: result.detail,
      params: result.params,
    });
    if (this.conflictWritable() === null) {
      this.lastFailedIntent = null;
    }
    this.conflictWritable.set(null);
    this.cartExpiredWritable.set(false);
  }

  /**
   * Commits the authoritative cart snapshot. Clears transient
   * failure signals so the UI returns to a clean state on the
   * next successful dispatch. The `lastFailedIntent` is preserved
   * when this is a post-conflict refetch: the user has not yet
   * pressed Retry, and clearing it now would make the Retry button
   * a no-op as soon as the refetch settles.
   */
  private applySuccess(cart: Cart, options: { fromRefetch?: boolean } = {}): void {
    this.cartWritable.set(cart);
    this.conflictWritable.set(null);
    this.cartExpiredWritable.set(false);
    this.errorWritable.set(null);
    if (options.fromRefetch !== true) {
      this.lastFailedIntent = null;
    }
  }
}

// ---------------------------------------------------------------------------
// Pure helpers — kept module-local so tests can exercise the mapping
// without instantiating the facade.
// ---------------------------------------------------------------------------

function mapError(err: unknown): DispatchResult {
  if (err instanceof HttpErrorResponse) {
    const body: unknown = err.error;
    let code = 'UNKNOWN';
    let detail = err.message;
    let params: Readonly<Record<string, unknown>> | undefined;
    if (isRecord(body)) {
      if (typeof body['code'] === 'string') {
        code = body['code'];
      }
      if (typeof body['detail'] === 'string') {
        detail = body['detail'];
      }
      if (isRecord(body['params'])) {
        params = body['params'];
      }
    }
    if (err.status === 412 && code === 'CART_VERSION_CONFLICT') {
      return { ok: false, code: 'CART_VERSION_CONFLICT', status: 412, detail, params };
    }
    if (err.status === 410 && code === 'CART_EXPIRED') {
      return { ok: false, code: 'CART_EXPIRED', status: 410, detail, params };
    }
    if (err.status === 404 && code === 'NOT_FOUND') {
      return { ok: false, code: 'NOT_FOUND', status: 404, detail, params };
    }
    return { ok: false, code, status: err.status, detail, params };
  }
  return { ok: false, code: 'SERVICE_UNAVAILABLE', status: 0, detail: String(err) };
}
