import {
  SNAPSHOT_SCHEMA_VERSION,
  type MockSnapshot,
  type PersistedCart,
  type PersistedReceipt,
} from './persistence';
import { Repository } from './repository';

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
 * Builds the allowlisted snapshot Persistence.save() writes. The
 * shape is the one isValidSnapshot in ./persistence accepts: an
 * unknown top-level key makes the next hydrate() discard the entry,
 * so this builder is the only place the snapshot is composed.
 */
export function buildSnapshot(
  repository: Repository,
  sessionId: string,
  nowMs: number,
): MockSnapshot {
  const savedAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
  const cartObj = repository.findCartBySession(sessionId);

  let cart: PersistedCart | undefined = undefined;
  if (cartObj) {
    cart = {
      id: cartObj.id,
      version: cartObj.version,
      items: cartObj.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      lastUpdatedAt: cartObj.createdAt,
    };
  }

  const receipts: PersistedReceipt[] = repository.listOrders().map((o) => {
    const orderRec = o as unknown as Record<string, unknown>;
    const itemsRaw = Array.isArray(orderRec['items']) ? orderRec['items'] : [];
    const items = itemsRaw.map((it: Record<string, unknown>) => ({
      variantId: typeof it['variantId'] === 'string' ? it['variantId'] : '',
      quantity: typeof it['quantity'] === 'number' ? it['quantity'] : 1,
      unitPrice: toMoney(it['unitPrice']),
      lineTotal: toMoney(it['lineTotal']),
    }));
    const paymentMethod = (
      orderRec['paymentMethod'] === 'demo_cod' ? 'demo_cod' : 'demo_card'
    ) satisfies 'demo_card' | 'demo_cod';
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
