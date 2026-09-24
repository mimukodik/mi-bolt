/**
 * T19+ — checkout idempotency keys and the active payment intent id.
 *
 * Four namespaced entries live in `sessionStorage` so they survive a
 * reload of the same tab (the SPA is destroyed by the payment redirect
 * — `contracts/commerce/kommunikacio.md` §8.3 — and is rebuilt cold on return). A new
 * tab gets fresh keys because sessionStorage is not shared across
 * tabs. A storage-denied context (private browsing, Node unit runner)
 * degrades to page-local: the key is generated and used once, never
 * stored, which is the same fallback the demo session interceptor
 * applies (`projects/core-api/src/demo-session.interceptor.ts:40-46`). The fourth is
 * the review step's demo-terms tick, kept so the cold return from the
 * payment page does not untick it (owner's decision, 2026-09-22).
 *
 * Rotation policy is `uncertain retains, definite rotates` (design
 * §3.6). The only call that mints a fresh key is the matching
 * `rotate*` helper; the only call that wipes state is `clearAll()`,
 * used on the success page after a 201 lands.
 */
import { freshIdempotencyKey } from '../../shared/utils/idempotency-key';
import { isRecord } from '../../shared/utils/is-record';

import type { Cart } from '@mi-bolt/api/models/cart';

const INTENT_KEY_STORAGE = 'mi-bolt.checkout.intent-key';
const ORDER_KEY_STORAGE = 'mi-bolt.checkout.order-key';
const INTENT_ID_STORAGE = 'mi-bolt.checkout.intent-id';
const TERMS_ACCEPTED_STORAGE = 'mi-bolt.checkout.terms-accepted';

/** The cart's lines as one string (`variantId:quantity`, sorted, comma
 *  joined): the key the demo-terms tick is stored under, so the tick
 *  reads false once the lines change (owner, 2026-09-23). */
export function cartLinesKey(cart: Cart): string {
  return cart.items
    .map((item) => `${item.variantId}:${String(item.quantity)}`)
    .sort((a, b) => a.localeCompare(b))
    .join(',');
}

interface KeyedRecord {
  readonly fingerprint: string;
  readonly key: string;
}

/** sessionStorage when available, null when denied or absent. */
function readableStorage(): Storage | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function readRecord(storage: Storage | null, slot: string): KeyedRecord | null {
  const raw = storage?.getItem(slot) ?? null;
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isKeyedRecord(parsed)) {
      return parsed;
    }
  } catch {
    // Corrupt entry — drop the slot and pretend it was empty, so
    // a single bad payload cannot break checkout.
  }
  return null;
}

/** Narrows an unknown JSON value into the stored key shape without a cast.
 *  Bracket access is required because `isRecord` widens to
 *  `Record<string, unknown>` and tsconfig sets
 * `noPropertyAccessFromIndexSignature`. */
function isKeyedRecord(value: unknown): value is KeyedRecord {
  if (!isRecord(value)) return false;
  const fp = value['fingerprint'];
  const key = value['key'];
  return typeof fp === 'string' && typeof key === 'string';
}

function writeRecord(storage: Storage | null, slot: string, record: KeyedRecord): void {
  try {
    storage?.setItem(slot, JSON.stringify(record));
  } catch {
    // Storage denied between the read and the write; the in-memory
    // record still satisfies this call but is lost on reload.
  }
}

/**
 * Returns the stored key when its fingerprint matches the caller's,
 * otherwise mints a fresh one, stores it under the new fingerprint,
 * and returns the new value. A read-only `fingerprint` makes the
 * cache impossible to confuse across versions.
 */
function keyed(slot: string, fingerprint: string): string {
  const storage = readableStorage();
  const existing = readRecord(storage, slot);
  if (existing !== null && existing.fingerprint === fingerprint) {
    return existing.key;
  }
  const key = freshIdempotencyKey();
  writeRecord(storage, slot, { fingerprint, key });
  return key;
}

/** Drops the stored key without minting a replacement. */
function rotate(slot: string): void {
  const storage = readableStorage();
  try {
    storage?.removeItem(slot);
  } catch {
    // Storage denied — nothing to drop on this page reload.
  }
}

export const checkoutKeys = {
  /**
   * Payment-intent key, scoped to the cart version that minted it.
   * `version` is the `If-Match` value the create call will send, so
   * a fresh cart bumps the fingerprint and the next "Fizetés indítása"
   * mints a new key rather than replaying an orphan intent.
   */
  intentKey(version: number): string {
    return keyed(INTENT_KEY_STORAGE, JSON.stringify(['intent', version]));
  },

  /**
   * Drops the stored intent key so the next `intentKey()` mints a
   * fresh one. Called on every definite outcome (success or refusal);
   * uncertain outcomes (transport failure, 503) retain.
   */
  rotateIntentKey(): void {
    rotate(INTENT_KEY_STORAGE);
  },

  /**
   * Order key, scoped to the wire termsVersion plus the body shape
   * the review step assembles. A different payment method, intent id
   * or accepted-terms state bumps the fingerprint.
   */
  orderKey(args: {
    readonly version: number;
    readonly paymentMethod: string;
    readonly paymentIntentId: string | null;
    readonly termsVersion: string;
    readonly acceptedTerms: boolean;
  }): string {
    return keyed(
      ORDER_KEY_STORAGE,
      JSON.stringify([
        'order',
        args.version,
        args.paymentMethod,
        args.paymentIntentId,
        args.termsVersion,
        args.acceptedTerms,
      ]),
    );
  },

  /** Drops the stored order key so the next `orderKey()` mints a fresh one. */
  rotateOrderKey(): void {
    rotate(ORDER_KEY_STORAGE);
  },

  /**
   * Reads the active payment intent id, persisted on a successful
   * intent create so the cold return from the payment page can find
   * it without a query parameter.
   */
  activeIntentId(): string | null {
    const storage = readableStorage();
    if (storage === null) return null;
    try {
      return storage.getItem(INTENT_ID_STORAGE);
    } catch {
      // Storage read denied — the page proceeds without a cold-start id.
      return null;
    }
  },

  /** Persists the active payment intent id for the cold return. */
  setActiveIntentId(id: string): void {
    const storage = readableStorage();
    try {
      storage?.setItem(INTENT_ID_STORAGE, id);
    } catch {
      // Storage denied — the in-memory id satisfies this page but is
      // lost on reload.
    }
  },

  /** Whether the shopper ticked the demo terms for these cart lines
   *  (`cartLinesKey`); false when nothing is stored, when the lines
   *  differ (a tick stored for other lines is removed), or when storage
   *  is denied. */
  termsAccepted(cartLines: string): boolean {
    const storage = readableStorage();
    try {
      const stored = storage?.getItem(TERMS_ACCEPTED_STORAGE) ?? null;
      if (stored !== null && stored !== cartLines) {
        // A tick given for other lines is dropped, so it does not come
        // back when the cart returns to those lines (owner, 2026-09-23:
        // the tick clears when the cart changes).
        storage?.removeItem(TERMS_ACCEPTED_STORAGE);
        return false;
      }
      return stored === cartLines;
    } catch {
      // Storage read denied — the review step starts unticked.
      return false;
    }
  },

  /** Persists the demo-terms tick for the cold return from the payment
   *  page, under the cart lines it was given for; `null` removes it. */
  setTermsAccepted(cartLines: string | null): void {
    const storage = readableStorage();
    try {
      if (cartLines === null) {
        storage?.removeItem(TERMS_ACCEPTED_STORAGE);
      } else {
        storage?.setItem(TERMS_ACCEPTED_STORAGE, cartLines);
      }
    } catch {
      // Storage denied — the in-memory tick satisfies this page but is
      // lost on reload.
    }
  },

  /**
   * Wipes every checkout-namespaced entry. Called by the facade
   * after a 201 order lands, so the next checkout starts clean.
   */
  clearAll(): void {
    const storage = readableStorage();
    try {
      storage?.removeItem(INTENT_KEY_STORAGE);
      storage?.removeItem(ORDER_KEY_STORAGE);
      storage?.removeItem(INTENT_ID_STORAGE);
      storage?.removeItem(TERMS_ACCEPTED_STORAGE);
    } catch {
      // Storage denied — nothing to drop on this page reload.
    }
  },
};
