import {
  SNAPSHOT_SCHEMA_VERSION,
  type MockSnapshot,
  type PersistedCart,
  type PersistedReceipt,
  type PersistedReceiptItem,
} from './persistence';
import type { Repository as Repo } from './repository';

function toMoney(value: unknown): { amount: number; currency: string } {
  if (typeof value === 'object' && value !== null) {
    const amount = 'amount' in value && typeof value.amount === 'number' ? value.amount : 0;
    const currency =
      'currency' in value && typeof value.currency === 'string' ? value.currency : 'HUF';
    return { amount, currency };
  }
  return { amount: 0, currency: 'HUF' };
}

/**
Narrows an unknown order item to a receipt line, degrading a malformed one.
*/
function toReceiptItem(value: unknown): PersistedReceiptItem {
  if (typeof value === 'object' && value !== null) {
    const variantId =
      'variantId' in value && typeof value.variantId === 'string' ? value.variantId : '';
    const quantity = 'quantity' in value && typeof value.quantity === 'number' ? value.quantity : 1;
    const unitPrice = toMoney('unitPrice' in value ? value.unitPrice : undefined);
    const lineTotal = toMoney('lineTotal' in value ? value.lineTotal : undefined);
    return { variantId, quantity, unitPrice, lineTotal };
  }
  return {
    variantId: '',
    quantity: 1,
    unitPrice: toMoney(undefined),
    lineTotal: toMoney(undefined),
  };
}

/**
 * Builds the allowlisted snapshot Persistence.save() writes. The
 * shape is the one isValidSnapshot in ./persistence accepts: an
 * unknown top-level key makes the next hydrate() discard the entry,
 * so this builder is the only place the snapshot is composed.
 */
export function buildSnapshot(repo: Repo, sessionId: string, nowMs: number): MockSnapshot {
  const savedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
  const cartObject = repo.findCartBySession(sessionId);

  let cart: PersistedCart | undefined = undefined;
  if (cartObject !== undefined) {
    cart = {
      id: cartObject.id,
      version: cartObject.version,
      items: cartObject.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      lastUpdatedAt: cartObject.createdAt,
    };
  }

  const receipts: PersistedReceipt[] = repo.listOrders().map((o) => {
    const items = (o.items ?? []).map((it) => toReceiptItem(it));
    const paymentMethod = (o.paymentMethod === 'demo_cod' ? 'demo_cod' : 'demo_card') satisfies
      'demo_card' | 'demo_cod';
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      total: o.total,
      paymentMethod,
      createdAt: o.createdAt,
      items,
    };
  });

  const snapshot: MockSnapshot = {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    providerId: 'mi-bolt',
    simulatedSessionId: sessionId,
    savedAt,
    expiresAt,
    receipts,
  };

  if (cart !== undefined) {
    snapshot.cart = cart;
  }

  return snapshot;
}
