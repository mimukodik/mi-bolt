/**
 * T05 — snapshot builder.
 *
 * Reads the cart, the checkout draft, the payment intents and the
 * order receipts from the three live mock stores and shapes them into
 * the allowlisted snapshot `Persistence.save()` writes. Adding an
 * unknown top-level key would make the next `hydrate()` discard the
 * entry, so this builder is the only place the snapshot is composed.
 */
import { MAX_AGE_MS, SNAPSHOT_SCHEMA_VERSION, type MockSnapshot } from './persistence';
import type { CartStore } from './cart/cart-store';
import type { CheckoutStore } from './checkout/checkout-store';
import type { OrderStore } from './orders/order-store';

export interface SnapshotStores {
  cart: CartStore;
  checkout: CheckoutStore;
  order: OrderStore;
}

/**
 * Builds the allowlisted snapshot `Persistence.save()` writes. The
 * shape is the one `isValidSnapshot` in `./persistence` accepts: an
 * unknown top-level key makes the next `hydrate()` discard the entry,
 * so this builder is the only place the snapshot is composed.
 */
export function buildSnapshot(
  stores: SnapshotStores,
  sessionId: string,
  nowMs: number,
): MockSnapshot {
  const savedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + MAX_AGE_MS).toISOString();
  const persistedCart = stores.cart.toPersistedCart(sessionId);
  const persistedDraft = stores.checkout.toPersistedDraft(sessionId);
  const persistedOrders = stores.order.toPersistedOrderState(sessionId);
  const snapshot: MockSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    providerId: 'mi-bolt',
    simulatedSessionId: sessionId,
    savedAt,
    expiresAt,
    paymentIntents: persistedOrders.intents,
    receipts: persistedOrders.receipts,
  };
  if (persistedCart !== undefined) snapshot.cart = persistedCart;
  if (persistedDraft !== undefined) snapshot.checkoutDraft = persistedDraft;
  return snapshot;
}
