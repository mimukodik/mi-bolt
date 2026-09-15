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
 *   - generates a fresh `Idempotency-Key` per intent and reuses the
 *     same key only on `retry()` (AC02);
 *   - waits for the authoritative server response before changing
 *     line totals so the UI never shows an unconfirmed state (AC03);
 *   - on 409 surfaces a `conflict` signal AND waits for an explicit
 *     `retry()` call. The failed intent is NOT auto-replayed; the
 *     user must consent (AC04);
 *   - on 404 / 410 raises `cartGone` / `cartExpired` so the UI can
 *     offer a fresh start. 401 is never invented for this
 *     unauthenticated demo (AC05).
 *
 * The T11 `CartCountFacade` token is preserved as a re-export so
 * the existing header binding needs no change.
 */

import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Service, computed, inject, signal, type Signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api } from '../../api/generated/api';
import { ApiConfiguration } from '../../api/generated/api-configuration';
import { withIfMatch } from '../../core/api/demo-session.interceptor';
import type { Cart } from '../../api/generated/models/cart';
import type { Money } from '../../api/generated/models/money';
import type { ProblemCode } from '../../api/generated/models/problem-code';

import {
  CartMutationQueue,
  type DispatchInputs,
  type DispatchResult,
  type MutationIntent,
} from './cart-mutation-queue';

/** Conflict payload surfaced to the UI when a 409 arrives. */
export interface CartConflict {
  readonly code: 'CART_VERSION_CONFLICT';
  readonly status: 409;
  readonly detail: string;
  /** Idempotency key the failed intent was issued under. */
  readonly idempotencyKey: string;
  /** Kind of intent that conflicted (the one retry() will resubmit). */
  readonly intentKind: MutationIntent['kind'];
  /** Server-reported version after the refetch. */
  readonly serverVersion: number;
}

/** Generic error payload surfaced to the UI for non-recoverable failures. */
export interface CartError {
  readonly code: ProblemCode;
  readonly status: number;
  readonly detail: string;
}

const ZERO_MONEY: Money = { amount: 0, currency: 'HUF' };

/**
 * Generates a fresh opaque idempotency key in the contract range
 * `^[a-zA-Z0-9_-]{8,80}$`. Each intent gets a NEW key; the only
 * path that reuses a key is the explicit `retry()` call after a
 * recorded 409 conflict.
 */
function freshIdempotencyKey(): string {
  const raw = globalThis.crypto.randomUUID();
  // randomUUID() emits 36 chars including dashes; the contract
  // requires 8–80 chars, so it already fits.
  return raw;
}

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

  /** Sum of all line quantities. 0 when no cart exists yet. */
  readonly itemCount: Signal<number> = computed(() => {
    const cart = this.cartWritable();
    if (cart === null) return 0;
    return cart.itemCount;
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
  /** Last 409 conflict, or null. Cleared on the next successful dispatch. */
  readonly conflict: Signal<CartConflict | null> = this.conflictWritable.asReadonly();

  private readonly cartGoneWritable = signal<boolean>(false);
  /** True after the server returned 404 for the active cart. */
  readonly cartGone: Signal<boolean> = this.cartGoneWritable.asReadonly();

  private readonly cartExpiredWritable = signal<boolean>(false);
  /** True after the server returned 410 for the active cart. */
  readonly cartExpired: Signal<boolean> = this.cartExpiredWritable.asReadonly();

  /**
   * Holds the most recent failed intent so `retry()` can resubmit it
   * with the SAME idempotency key. Cleared on the next successful
   * dispatch.
   */
  private lastFailedIntent: MutationIntent | null = null;

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
    this.destroyRef.onDestroy(() => this.queue.destroy());
  }

  /**
   * Returns the active cart id or null. Exposed so future flows
   * (e.g. checkout session create) can attach to it without
   * re-reading `cart()?.id` everywhere.
   */
  get cartId(): string | null {
    return this.cartWritable()?.id ?? null;
  }

  /**
   * Creates the cart if none exists. Safe to call multiple times; the
   * second call is a no-op when an active cart is already loaded. The
   * `cartWritable` snapshot is re-checked inside the dispatch callback
   * so two near-simultaneous calls collapse into a single server-side
   * `POST /carts` instead of leaking an orphan cart.
   */
  async ensureCart(): Promise<void> {
    if (this.cartWritable() !== null && this.cartWritable()?.status === 'active') {
      return;
    }
    const intent: MutationIntent = {
      kind: 'create',
      idempotencyKey: freshIdempotencyKey(),
      retry: false,
      payload: { providerId: 'mi-bolt' },
    };
    const result = await this.queue.enqueue(intent, (inputs) => {
      // Re-check inside the queue callback so a second ensureCart() that
      // landed in the same microtask sees the cart the first call
      // already created and short-circuits to a no-op dispatch.
      if (this.cartWritable() !== null && this.cartWritable()?.status === 'active') {
        return Promise.resolve({
          ok: true as const,
          cart: this.cartWritable()!,
          replayed: false,
        });
      }
      return this.dispatchCreate(inputs);
    });
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /**
   * Adds a variant to the cart. The intent is serialized behind
   * every other queued mutation, and its `If-Match` binds to the
   * version the PREVIOUS dispatch returned. Throws if no cart has
   * been created yet (call `ensureCart()` first).
   */
  async addItem(variantId: string, quantity: number): Promise<void> {
    const intent: MutationIntent = {
      kind: 'addItem',
      idempotencyKey: freshIdempotencyKey(),
      retry: false,
      payload: { variantId, quantity },
    };
    const result = await this.queue.enqueue(intent, (inputs) => this.dispatchAddItem(inputs));
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /**
   * Sets an absolute quantity on a line. The intent is serialized
   * behind every other queued mutation; its `If-Match` binds to the
   * latest server version. If the line disappears between enqueue
   * and dispatch the server returns 404, which the facade maps to
   * `cartGone`.
   */
  async setQuantity(itemId: string, quantity: number): Promise<void> {
    const intent: MutationIntent = {
      kind: 'setQuantity',
      idempotencyKey: freshIdempotencyKey(),
      retry: false,
      payload: { itemId, quantity },
    };
    const result = await this.queue.enqueue(
      intent,
      async (inputs) => this.dispatchSetQuantity(inputs),
    );
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /**
   * Removes a line from the cart. Serialized like every other
   * mutation. A 404 here means the cart itself disappeared between
   * enqueue and dispatch.
   */
  async removeItem(itemId: string): Promise<void> {
    const intent: MutationIntent = {
      kind: 'removeItem',
      idempotencyKey: freshIdempotencyKey(),
      retry: false,
      payload: { itemId },
    };
    const result = await this.queue.enqueue(
      intent,
      async (inputs) => this.dispatchRemoveItem(inputs),
    );
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /**
   * Re-submits the most recent failed intent with the SAME
   * idempotency key but the CURRENT expected version. No-op when
   * no conflict is recorded. The contract requires this be an
   * explicit user action; the facade never auto-replays.
   */
  async retry(): Promise<void> {
    const failed = this.lastFailedIntent;
    if (failed === null) {
      return;
    }
    // Clear the recorded conflict so a subsequent failure re-arms
    // retry() instead of letting stale state persist.
    this.lastFailedIntent = null;
    const retryIntent: MutationIntent = { ...failed, retry: true };
    const result = await this.queue.enqueue(retryIntent, (inputs) => {
      switch (inputs.intent.kind) {
        case 'create':
          return this.dispatchCreate(inputs);
        case 'addItem':
          return this.dispatchAddItem(inputs);
        case 'setQuantity':
          return this.dispatchSetQuantity(inputs);
        case 'removeItem':
          return this.dispatchRemoveItem(inputs);
        case 'refetch':
          return this.dispatchRefetch(inputs);
      }
    });
    if (result.ok) {
      this.applySuccess(result.cart);
    }
  }

  /**
   * Refetches the active cart without an `If-Match`. Called
   * internally after a 409 to bring the local snapshot into sync
   * with the server. Exposed for tests that need to simulate a
   * remote version bump.
   */
  async refetch(): Promise<void> {
    const cartId = this.cartWritable()?.id;
    if (cartId === undefined) {
      return;
    }
    const intent: MutationIntent = {
      kind: 'refetch',
      idempotencyKey: freshIdempotencyKey(),
      retry: false,
      payload: { cartId },
    };
    const result = await this.queue.enqueue(intent, (inputs) => this.dispatchRefetch(inputs));
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
   *   - clears conflict / cartGone / cartExpired / error overlays,
   *   - drops any pending intent that was queued against the ordered
   *     cart (the user has moved on; replaying them now would resurrect
   *     the just-ordered items),
   *   - clears the retry affordance so the success page never offers
   *     "Retry" against a server that already accepted the order.
   * No network call is issued — the server already owns the truth.
   */
  resetOrderedCart(): void {
    this.cartWritable.set(null);
    this.conflictWritable.set(null);
    this.cartGoneWritable.set(false);
    this.cartExpiredWritable.set(false);
    this.errorWritable.set(null);
    this.lastFailedIntent = null;
    this.queue.clearPending();
  }

  /**
   * Test seam: points the local cart snapshot at an id the server
   * has never seen, so the next mutation surfaces 404 and the
   * `cartGone` signal flips. Production code does not call this.
   */
  _seedMissingCart(): void {
    this.cartWritable.set({
      id: 'cart-missing-001',
      version: 1,
      items: [],
      itemCount: 0,
      subtotal: { ...ZERO_MONEY },
      status: 'active',
      expiresAt: '2026-12-31T23:59:59.000Z',
    });
  }

  /**
   * Test seam: replaces the local cart snapshot with one the unit
   * suite supplied. Production code does not call this; the layout
   * spec uses it to drive `itemCount` without standing up the full
   * create / mutate / refetch lifecycle.
   */
  _seedCart(snapshot: Partial<Cart> & { id: string; itemCount: number }): void {
    this.cartWritable.set({
      id: snapshot.id,
      version: snapshot.version ?? 1,
      items: snapshot.items ?? [],
      itemCount: snapshot.itemCount,
      subtotal: snapshot.subtotal ?? { ...ZERO_MONEY },
      status: snapshot.status ?? 'active',
      expiresAt: snapshot.expiresAt ?? '2026-12-31T23:59:59.000Z',
    });
  }

  // -------------------------------------------------------------------------
  // Dispatch helpers — wire the SDK + interceptor + Problem mapping into the
  // queue. Each helper returns a typed `DispatchResult` so the queue never
  // sees an `HttpErrorResponse` directly.
  // -------------------------------------------------------------------------

  private async dispatchCreate(inputs: DispatchInputs): Promise<DispatchResult> {
    try {
      const response = await firstValueFrom(
        this.api.invoke(
          (await import('../../api/generated/functions')).createCart,
          {
            'Idempotency-Key': inputs.intent.idempotencyKey,
            body: { providerId: 'mi-bolt' },
          },
        ),
      );
      return { ok: true, cart: response, replayed: false };
    } catch (err) {
      // Route the failure through `handleError` so a 409/410/404 on
      // create surfaces in the same `conflict` / `cartGone` /
      // `cartExpired` signals the rest of the mutation API uses.
      return this.handleError(inputs, err);
    }
  }

  private async dispatchAddItem(inputs: DispatchInputs): Promise<DispatchResult> {
    const cartId = this.cartWritable()?.id;
    if (cartId === undefined) {
      // Route the missing-cart path through recordFailure so the
      // `cartGone` signal flips the same way a 404 from the server
      // would; otherwise the caller silently rejects with a NOT_FOUND
      // result while the UI still believes the cart is alive.
      const result = mapMissingCart();
      this.recordFailure(inputs.intent, result);
      return result;
    }
    const payload = inputs.intent.payload as { variantId: string; quantity: number };
    const context = inputs.expectedVersion === null
      ? undefined
      : withIfMatch(inputs.expectedVersion);
    try {
      const response = await firstValueFrom(
        this.api.invoke(
          (await import('../../api/generated/functions')).addCartItem,
          {
            cartId,
            'Idempotency-Key': inputs.intent.idempotencyKey,
            body: { variantId: payload.variantId, quantity: payload.quantity },
          },
          context,
        ),
      );
      return { ok: true, cart: response, replayed: false };
    } catch (err) {
      return this.handleError(inputs, err);
    }
  }

  private async dispatchSetQuantity(inputs: DispatchInputs): Promise<DispatchResult> {
    const cartId = this.cartWritable()?.id;
    if (cartId === undefined) {
      const result = mapMissingCart();
      this.recordFailure(inputs.intent, result);
      return result;
    }
    const payload = inputs.intent.payload as { itemId: string; quantity: number };
    const context = inputs.expectedVersion === null
      ? undefined
      : withIfMatch(inputs.expectedVersion);
    try {
      const response = await firstValueFrom(
        this.api.invoke(
          (await import('../../api/generated/functions')).setCartItemQuantity,
          {
            cartId,
            'Idempotency-Key': inputs.intent.idempotencyKey,
            itemId: payload.itemId,
            body: { quantity: payload.quantity },
          },
          context,
        ),
      );
      return { ok: true, cart: response, replayed: false };
    } catch (err) {
      return this.handleError(inputs, err);
    }
  }

  private async dispatchRemoveItem(inputs: DispatchInputs): Promise<DispatchResult> {
    const cartId = this.cartWritable()?.id;
    if (cartId === undefined) {
      const result = mapMissingCart();
      this.recordFailure(inputs.intent, result);
      return result;
    }
    const payload = inputs.intent.payload as { itemId: string };
    const context = inputs.expectedVersion === null
      ? undefined
      : withIfMatch(inputs.expectedVersion);
    try {
      const response = await firstValueFrom(
        this.api.invoke(
          (await import('../../api/generated/functions')).removeCartItem,
          {
            cartId,
            'Idempotency-Key': inputs.intent.idempotencyKey,
            itemId: payload.itemId,
          },
          context,
        ),
      );
      return { ok: true, cart: response, replayed: false };
    } catch (err) {
      return this.handleError(inputs, err);
    }
  }

  private async dispatchRefetch(inputs: DispatchInputs): Promise<DispatchResult> {
    const payload = inputs.intent.payload as { cartId: string };
    try {
      const response = await firstValueFrom(
        this.api.invoke(
          (await import('../../api/generated/functions')).getCart,
          { cartId: payload.cartId },
        ),
      );
      return { ok: true, cart: response, replayed: false };
    } catch (err) {
      // Funnel refetch failures through `handleError` too: a 404 here
      // means the cart disappeared between the original conflict and
      // the refetch, which the UI must surface as `cartGone`.
      return this.handleError(inputs, err);
    }
  }

  // -------------------------------------------------------------------------
  // Centralized error mapping. Every dispatcher funnels through here so a
  // 409 always lands in the conflict signal, a 410 always in cartExpired,
  // and a 404 always in cartGone. Other Problems land in `error`.
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
        status: 409,
        detail: result.detail,
        idempotencyKey: intent.idempotencyKey,
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
      this.cartGoneWritable.set(false);
      this.cartExpiredWritable.set(false);
      // Fire-and-forget refetch so the next dispatch binds to a
      // fresh version. We do not await it here so the failed intent
      // resolves immediately and the queue can move on.
      void this.refetch();
      return;
    }
    if (result.code === 'CART_EXPIRED') {
      // Drop the local snapshot so the next ensureCart() actually
      // creates a fresh cart instead of seeing an "active" status the
      // server will reject. PRESERVE `lastFailedIntent`: the expired
      // cart may have been caused by the refetch that followed the
      // user's original conflict, not by the user's intent itself.
      // Clearing it here would discard the recoverable Retry button
      // the user is about to click (AC04).
      this.cartWritable.set(null);
      this.cartExpiredWritable.set(true);
      this.conflictWritable.set(null);
      this.errorWritable.set(null);
      this.cartGoneWritable.set(false);
      return;
    }
    if (result.code === 'NOT_FOUND') {
      // Same recovery rule: a 404 on any cart mutation means the cart
      // no longer exists on the server, so the local snapshot must
      // not block ensureCart() from starting over.
      this.cartWritable.set(null);
      this.cartGoneWritable.set(true);
      this.conflictWritable.set(null);
      this.cartExpiredWritable.set(false);
      this.errorWritable.set(null);
      this.lastFailedIntent = null;
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
    });
    if (this.conflictWritable() === null) {
      this.lastFailedIntent = null;
    }
    this.conflictWritable.set(null);
    this.cartGoneWritable.set(false);
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
    this.cartGoneWritable.set(false);
    this.cartExpiredWritable.set(false);
    this.errorWritable.set(null);
    if (!options.fromRefetch) {
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
    const body = err.error as { code?: ProblemCode; detail?: string } | null;
    const code = (body && body.code) || ('UNKNOWN' as ProblemCode);
    const detail = (body && body.detail) || err.message;
    if (err.status === 409 && code === 'CART_VERSION_CONFLICT') {
      return { ok: false, code: 'CART_VERSION_CONFLICT', status: 409, detail };
    }
    if (err.status === 409 && code === 'OUT_OF_STOCK') {
      return { ok: false, code: 'OUT_OF_STOCK', status: 409, detail };
    }
    if (err.status === 409 && code === 'IDEMPOTENCY_CONFLICT') {
      return { ok: false, code: 'IDEMPOTENCY_CONFLICT', status: 409, detail };
    }
    if (err.status === 410 && code === 'CART_EXPIRED') {
      return { ok: false, code: 'CART_EXPIRED', status: 410, detail };
    }
    if (err.status === 404 && code === 'NOT_FOUND') {
      return { ok: false, code: 'NOT_FOUND', status: 404, detail };
    }
    return { ok: false, code, status: err.status, detail };
  }
  return { ok: false, code: 'SERVICE_UNAVAILABLE', status: 0, detail: String(err) };
}

function mapMissingCart(): DispatchResult {
  return { ok: false, code: 'NOT_FOUND', status: 404, detail: 'A kosár nem található.' };
}