/**
 * T07 - cart mock focused unit suite.
 *
 * Each acceptance criterion has at least one named assertion in the
 * file. The suite exercises every line of `cart-domain.ts` and
 * `idempotency.ts` and the cart handler dispatch path so the
 * coverage gate stays green on the owned runtime surface.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHandlers } from '../../mocks/create-handlers';
// Side-effect import - registers cart handlers in the T05 registry.
import { DEMO_PRODUCT } from '../../mocks/cart/cart.handlers';
import {
  CART_DURATION_MS,
  CartDomain,
  MAX_LINE_QUANTITY,
} from '../../mocks/cart/cart-domain';
import {
  IDEMPOTENCY_WINDOW_MS,
  IdempotencyStore,
  deriveIdempotencyKey,
  hashPayload,
} from '../../mocks/idempotency';
import { Repository } from '../../mocks/repository';
import {
  createDeterministicIds,
  createFixedClock,
} from '../../mocks/scenarios';
import { server } from '../../../tests/setup-msw';

const SESSION_A = 'session-aaaaaaaaaaaa';
const SESSION_B = 'session-bbbbbbbbbbbb';
const VARIANT_G256 = 'demo-one-5g-graphite-256';
const VARIANT_G512 = 'demo-one-5g-graphite-512';
const VARIANT_S256 = 'demo-one-5g-silver-256';
const IDEMPOTENCY_KEY_BASE = 'idem-key-12345678';

function quoteEtag(version: number): string {
  return `"${String(version)}"`;
}

function makeEnv(initialClockMs = Date.parse('2026-09-14T10:00:00.000Z')) {
  const clock = createFixedClock(new Date(initialClockMs).toISOString());
  const ids = createDeterministicIds(7);
  const scenario = {
    name: 'cart-mock-suite',
    seed: 7,
    clockOffsetMs: 0,
    isolated: true,
  };
  const repository = new Repository(scenario, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
  const idempotency = new IdempotencyStore(clock);
  const domain = new CartDomain(repository, clock, ids, idempotency);
  return { clock, ids, repository, idempotency, domain };
}

describe('T07-AC01: variant merging and quantity boundary', () => {
  it('merges repeated adds of the same variant into one line and accumulates quantity', () => {
    const env = makeEnv();
    const cart = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-1` });
    expect(cart.ok).toBe(true);
    if (!cart.ok) throw new Error('createCart failed');
    const cartId = cart.value.id;
    const ifMatch1 = quoteEtag(cart.value.version);
    const first = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId,
      ifMatch: ifMatch1,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-2`,
      variantId: VARIANT_G256,
      quantity: 3,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('first add failed');
    const ifMatch2 = quoteEtag(first.value.version);
    const second = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId,
      ifMatch: ifMatch2,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-3`,
      variantId: VARIANT_G256,
      quantity: 2,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('second add failed');
    expect(second.value.items).toHaveLength(1);
    expect(second.value.items[0]?.quantity).toBe(5);
    expect(second.value.version).toBe(3);
    expect(second.value.items[0]?.lineTotal).toEqual({ amount: 339_990 * 5, currency: 'HUF' });
    expect(second.value.items[0]?.unitPrice).toEqual({ amount: 339_990, currency: 'HUF' });
  });

  it('keeps different variants on separate lines and computes subtotals per line', () => {
    const env = makeEnv();
    const cart = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-4` });
    if (!cart.ok) throw new Error('createCart failed');
    const ifMatch1 = quoteEtag(cart.value.version);
    const a = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: cart.value.id,
      ifMatch: ifMatch1,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-5`,
      variantId: VARIANT_G256,
      quantity: 2,
    });
    if (!a.ok) throw new Error('add G256 failed');
    const ifMatch2 = quoteEtag(a.value.version);
    const b = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: cart.value.id,
      ifMatch: ifMatch2,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-6`,
      variantId: VARIANT_S256,
      quantity: 1,
    });
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error('add S256 failed');
    expect(b.value.items).toHaveLength(2);
    const graphite = b.value.items.find((line) => line.variantId === VARIANT_G256);
    const silver = b.value.items.find((line) => line.variantId === VARIANT_S256);
    expect(graphite?.quantity).toBe(2);
    expect(graphite?.lineTotal).toEqual({ amount: 339_990 * 2, currency: 'HUF' });
    expect(silver?.quantity).toBe(1);
    expect(silver?.lineTotal).toEqual({ amount: 344_990, currency: 'HUF' });
  });

  it('rejects quantity above max (5) with 422 QUANTITY_LIMIT and never silently clamps', () => {
    const env = makeEnv();
    const cart = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-7` });
    if (!cart.ok) throw new Error('createCart failed');
    const tooHigh = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: cart.value.id,
      ifMatch: quoteEtag(cart.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-8`,
      variantId: VARIANT_G256,
      quantity: MAX_LINE_QUANTITY + 1,
    });
    expect(tooHigh.ok).toBe(false);
    if (tooHigh.ok) throw new Error('expected rejection');
    expect(tooHigh.problem.status).toBe(422);
    expect(tooHigh.problem.code).toBe('QUANTITY_LIMIT');
    // Cart unchanged.
    expect(env.repository.getCart(cart.value.id)?.items).toHaveLength(0);
    expect(env.repository.getCart(cart.value.id)?.version).toBe(1);
  });

  it('rejects quantity below 1 with 422 QUANTITY_LIMIT', () => {
    const env = makeEnv();
    const cart = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-9` });
    if (!cart.ok) throw new Error('createCart failed');
    const tooLow = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: cart.value.id,
      ifMatch: quoteEtag(cart.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-10`,
      variantId: VARIANT_G256,
      quantity: 0,
    });
    expect(tooLow.ok).toBe(false);
    if (tooLow.ok) throw new Error('expected rejection');
    expect(tooLow.problem.status).toBe(422);
    expect(tooLow.problem.code).toBe('QUANTITY_LIMIT');
  });

  it('rejects merged total above variant maxQuantity with 422 QUANTITY_LIMIT', () => {
    const env = makeEnv();
    const cart = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-11` });
    if (!cart.ok) throw new Error('createCart failed');
    const first = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: cart.value.id,
      ifMatch: quoteEtag(cart.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-12`,
      variantId: VARIANT_G256,
      quantity: 4,
    });
    if (!first.ok) throw new Error('first add failed');
    const tooMuch = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: cart.value.id,
      ifMatch: quoteEtag(first.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-13`,
      variantId: VARIANT_G256,
      quantity: 2,
    });
    expect(tooMuch.ok).toBe(false);
    if (tooMuch.ok) throw new Error('expected rejection');
    expect(tooMuch.problem.status).toBe(422);
    expect(tooMuch.problem.code).toBe('QUANTITY_LIMIT');
    // Cart preserved.
    const stored = env.repository.getCart(cart.value.id);
    expect(stored?.items[0]?.quantity).toBe(4);
    expect(stored?.version).toBe(2);
  });

  it('rejects unknown variant ids with 404 NOT_FOUND', () => {
    const env = makeEnv();
    const cart = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-14` });
    if (!cart.ok) throw new Error('createCart failed');
    const missing = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: cart.value.id,
      ifMatch: quoteEtag(cart.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-15`,
      variantId: 'demo-one-5g-graphite-9999',
      quantity: 1,
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error('expected rejection');
    expect(missing.problem.status).toBe(404);
    expect(missing.problem.code).toBe('NOT_FOUND');
  });
});

describe('T07-AC02: version increments and stale-version guard', () => {
  it('increments cart version by exactly one on every successful mutation', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-16` });
    if (!created.ok) throw new Error('createCart failed');
    expect(created.value.version).toBe(1);
    const firstAdd = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-add1`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    if (!firstAdd.ok) throw new Error('first add failed');
    expect(firstAdd.value.version).toBe(2);
    const secondAdd = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(firstAdd.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-add2`,
      variantId: VARIANT_S256,
      quantity: 1,
    });
    if (!secondAdd.ok) throw new Error('second add failed');
    expect(secondAdd.value.version).toBe(3);
    const itemId = secondAdd.value.items[0]?.id ?? '';
    const set = env.domain.setCartItemQuantity({
      sessionId: SESSION_A,
      cartId: created.value.id,
      itemId,
      ifMatch: quoteEtag(secondAdd.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-set1`,
      quantity: 3,
    });
    if (!set.ok) throw new Error('set failed');
    expect(set.value.version).toBe(4);
    const removed = env.domain.removeCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      itemId,
      ifMatch: quoteEtag(set.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-rm1`,
    });
    if (!removed.ok) throw new Error('remove failed');
    expect(removed.value.version).toBe(5);
  });

  it('returns 409 CART_VERSION_CONFLICT on stale If-Match without mutating the cart', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-17` });
    if (!created.ok) throw new Error('createCart failed');
    // First successful add -> v2.
    const first = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-18`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    if (!first.ok) throw new Error('first add failed');
    // Second attempt uses the stale (initial) version -> conflict.
    const stale = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-19`,
      variantId: VARIANT_G512,
      quantity: 2,
    });
    expect(stale.ok).toBe(false);
    if (stale.ok) throw new Error('expected rejection');
    expect(stale.problem.status).toBe(409);
    expect(stale.problem.code).toBe('CART_VERSION_CONFLICT');
    const stored = env.repository.getCart(created.value.id);
    expect(stored?.version).toBe(2);
    expect(stored?.items).toHaveLength(1);
    expect(stored?.items[0]?.variantId).toBe(VARIANT_G256);
  });

  it('totals are whole HUF derived from catalogue prices', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-20` });
    if (!created.ok) throw new Error('createCart failed');
    const result = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-21`,
      variantId: VARIANT_G256,
      quantity: 3,
    });
    if (!result.ok) throw new Error('add failed');
    expect(result.value.items[0]?.unitPrice).toEqual({ amount: 339_990, currency: 'HUF' });
    expect(result.value.items[0]?.lineTotal).toEqual({ amount: 339_990 * 3, currency: 'HUF' });
    expect(Number.isInteger(result.value.items[0]?.unitPrice.amount)).toBe(true);
    expect(Number.isInteger(result.value.items[0]?.lineTotal.amount)).toBe(true);
  });
});

describe('T07-AC03: idempotency replay and conflict', () => {
  it('replays the cached response before the version check', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-22` });
    if (!created.ok) throw new Error('createCart failed');
    const initialAdd = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-23`,
      variantId: VARIANT_G256,
      quantity: 2,
    });
    if (!initialAdd.ok) throw new Error('add failed');
    // Replay uses a stale If-Match - replay must win over the version
    // check, returning the original cart body without mutating.
    const replay = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: '"1"',
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-23`,
      variantId: VARIANT_G256,
      quantity: 2,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error('expected replay');
    expect(replay.value.version).toBe(initialAdd.value.version);
    expect(env.repository.getCart(created.value.id)?.version).toBe(2);
  });

  it('returns 409 IDEMPOTENCY_CONFLICT when the same key carries a different payload', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-24` });
    if (!created.ok) throw new Error('createCart failed');
    const first = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-25`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    if (!first.ok) throw new Error('first add failed');
    const conflict = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(first.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-25`,
      variantId: VARIANT_G512,
      quantity: 2,
    });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) throw new Error('expected conflict');
    expect(conflict.problem.status).toBe(409);
    expect(conflict.problem.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(env.repository.getCart(created.value.id)?.version).toBe(2);
  });

  it('expires idempotency cache entries after the 24-hour window', () => {
    const env = makeEnv();
    // We exercise the cache boundary by clearing the entry directly so
    // the cart and idempotency expiry timelines (both 24h) do not
    // collapse into a 410. The IdempotencyStore's expiry logic is
    // covered by the next test; this one proves the cart-domain wires
    // a missing replay into a fresh execution path.
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-26` });
    if (!created.ok) throw new Error('createCart failed');
    const first = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-27`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    if (!first.ok) throw new Error('first add failed');
    env.idempotency.clear();
    const after = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(first.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-27`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    expect(after.ok).toBe(true);
    if (!after.ok) throw new Error('expected success after expiry');
    expect(after.value.version).toBe(first.value.version + 1);
  });

  it('keeps the replay inside the 24-hour window when the clock advances partially', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-26b` });
    if (!created.ok) throw new Error('createCart failed');
    const first = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-27b`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    if (!first.ok) throw new Error('first add failed');
    env.clock.advanceMs(IDEMPOTENCY_WINDOW_MS - 1);
    const replay = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: '"99"',
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-27b`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw new Error('expected replay');
    expect(replay.value.version).toBe(first.value.version);
  });

  it('hashPayload canonicalizes object property order', () => {
    expect(hashPayload({ b: 1, a: 2 })).toBe(hashPayload({ a: 2, b: 1 }));
    expect(hashPayload({ a: [3, 1, 2] })).not.toBe(hashPayload({ a: [1, 2, 3] }));
    expect(hashPayload({ nested: { b: 2, a: 1 } })).toBe(hashPayload({ nested: { a: 1, b: 2 } }));
  });

  it('deriveIdempotencyKey normalizes method casing', () => {
    expect(deriveIdempotencyKey('POST', '/x', 's', 'k')).toBe(
      deriveIdempotencyKey('post', '/x', 's', 'k'),
    );
    expect(deriveIdempotencyKey('POST', '/x', 's', 'k')).not.toBe(
      deriveIdempotencyKey('POST', '/x', 't', 'k'),
    );
  });

  it('IdempotencyStore returns cached outcomes and clears expired entries', () => {
    const env = makeEnv();
    env.idempotency.record('k', 'hash-a', { status: 201, body: { hello: 'world' } });
    expect(env.idempotency.find('k', 'hash-a')).toEqual({
      status: 201,
      body: { hello: 'world' },
    });
    expect(env.idempotency.find('k', 'hash-b')).toBeNull();
    expect(env.idempotency.hasConflictingPayload('k', 'hash-b')).toBe(true);
    env.clock.advanceMs(IDEMPOTENCY_WINDOW_MS + 1);
    expect(env.idempotency.find('k', 'hash-a')).toBeNull();
    expect(env.idempotency.hasConflictingPayload('k', 'hash-b')).toBe(false);
  });

  it('IdempotencyStore.clear and size expose the test-only contract', () => {
    const env = makeEnv();
    expect(env.idempotency.size()).toBe(0);
    env.idempotency.record('k', 'hash', { status: 200, body: null });
    expect(env.idempotency.size()).toBe(1);
    env.idempotency.clear();
    expect(env.idempotency.size()).toBe(0);
  });
});

describe('T07-AC04: 410 expiry and 409 cart preservation', () => {
  it('returns 410 CART_EXPIRED once now >= expiresAt and preserves cart content', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-28` });
    if (!created.ok) throw new Error('createCart failed');
    const initialAdd = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-29`,
      variantId: VARIANT_G256,
      quantity: 2,
    });
    if (!initialAdd.ok) throw new Error('add failed');
    env.clock.advanceMs(CART_DURATION_MS);
    const get = env.domain.getCart({ sessionId: SESSION_A, cartId: created.value.id });
    expect(get.ok).toBe(false);
    if (get.ok) throw new Error('expected expiry');
    expect(get.problem.status).toBe(410);
    expect(get.problem.code).toBe('CART_EXPIRED');
    const addAfterExpiry = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(initialAdd.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-30`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    expect(addAfterExpiry.ok).toBe(false);
    if (addAfterExpiry.ok) throw new Error('expected expiry');
    expect(addAfterExpiry.problem.status).toBe(410);
    // Visible cart content unchanged on 410 (still v2 with two units).
    const stored = env.repository.getCart(created.value.id);
    expect(stored?.version).toBe(2);
    expect(stored?.items[0]?.quantity).toBe(2);
  });

  it('keeps cart content + version unchanged when a 409 CART_VERSION_CONFLICT is raised', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-31` });
    if (!created.ok) throw new Error('createCart failed');
    const first = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-32`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    if (!first.ok) throw new Error('first add failed');
    const stale = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-33`,
      variantId: VARIANT_S256,
      quantity: 2,
    });
    expect(stale.ok).toBe(false);
    const stored = env.repository.getCart(created.value.id);
    expect(stored?.version).toBe(2);
    expect(stored?.items).toHaveLength(1);
    expect(stored?.items[0]?.variantId).toBe(VARIANT_G256);
    expect(stored?.items[0]?.quantity).toBe(1);
  });
});

describe('T07-AC05: session isolation', () => {
  it('rejects cross-session reads with 404 NOT_FOUND', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-34` });
    if (!created.ok) throw new Error('createCart failed');
    const wrongSession = env.domain.getCart({
      sessionId: SESSION_B,
      cartId: created.value.id,
    });
    expect(wrongSession.ok).toBe(false);
    if (wrongSession.ok) throw new Error('expected 404');
    expect(wrongSession.problem.status).toBe(404);
    expect(wrongSession.problem.code).toBe('NOT_FOUND');
  });

  it('rejects cross-session mutations with 404 NOT_FOUND', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-35` });
    if (!created.ok) throw new Error('createCart failed');
    const wrongSession = env.domain.addCartItem({
      sessionId: SESSION_B,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-36`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    expect(wrongSession.ok).toBe(false);
    if (wrongSession.ok) throw new Error('expected 404');
    expect(wrongSession.problem.status).toBe(404);
    expect(wrongSession.problem.code).toBe('NOT_FOUND');
    // Visible cart unchanged.
    const stored = env.repository.getCart(created.value.id);
    expect(stored?.items).toHaveLength(0);
    expect(stored?.version).toBe(1);
  });

  it('treats idempotency keys as session-scoped', () => {
    const env = makeEnv();
    // Session A creates a cart and records an idempotent create result.
    const a = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-37` });
    if (!a.ok) throw new Error('a failed');
    // Session B uses the same Idempotency-Key and gets a fresh cart.
    const b = env.domain.createCart({ sessionId: SESSION_B, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-37` });
    expect(b.ok).toBe(true);
    if (!b.ok) throw new Error('b failed');
    expect(b.value.id).not.toBe(a.value.id);
  });
});

describe('CartDomain header validation', () => {
  it('rejects malformed session, If-Match, and Idempotency-Key with 400', () => {
    const env = makeEnv();
    const badSession = env.domain.createCart({ sessionId: 'short', idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-38` });
    expect(badSession.ok).toBe(false);
    if (badSession.ok) throw new Error('expected rejection');
    expect(badSession.problem.status).toBe(400);
    expect(badSession.problem.code).toBe('VALIDATION_FAILED');

    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-39` });
    if (!created.ok) throw new Error('createCart failed');
    const missingKey = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: '"1"',
      idempotencyKey: null,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    expect(missingKey.ok).toBe(false);
    if (missingKey.ok) throw new Error('expected rejection');
    expect(missingKey.problem.status).toBe(400);

    const shortKey = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: '"1"',
      idempotencyKey: 'short',
      variantId: VARIANT_G256,
      quantity: 1,
    });
    expect(shortKey.ok).toBe(false);
    if (shortKey.ok) throw new Error('expected rejection');
    expect(shortKey.problem.status).toBe(400);

    const badIfMatch = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: 'not-quoted',
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-40`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    expect(badIfMatch.ok).toBe(false);
    if (badIfMatch.ok) throw new Error('expected rejection');
    expect(badIfMatch.problem.status).toBe(400);

    const missingIfMatch = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: null,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-41`,
      variantId: VARIANT_G256,
      quantity: 1,
    });
    expect(missingIfMatch.ok).toBe(false);
    if (missingIfMatch.ok) throw new Error('expected rejection');
    expect(missingIfMatch.problem.status).toBe(400);
  });

  it('rejects non-integer quantity with 422', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-42` });
    if (!created.ok) throw new Error('createCart failed');
    const fractional = env.domain.addCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-43`,
      variantId: VARIANT_G256,
      quantity: 1.5,
    });
    expect(fractional.ok).toBe(false);
    if (fractional.ok) throw new Error('expected rejection');
    expect(fractional.problem.status).toBe(422);
    expect(fractional.problem.code).toBe('QUANTITY_LIMIT');
  });

  it('rejects setCartItemQuantity on unknown itemId with 404', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-44` });
    if (!created.ok) throw new Error('createCart failed');
    const result = env.domain.setCartItemQuantity({
      sessionId: SESSION_A,
      cartId: created.value.id,
      itemId: 'missing-line-id',
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-45`,
      quantity: 1,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.problem.status).toBe(404);
  });

  it('rejects removeCartItem on unknown itemId with 404', () => {
    const env = makeEnv();
    const created = env.domain.createCart({ sessionId: SESSION_A, idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-46` });
    if (!created.ok) throw new Error('createCart failed');
    const result = env.domain.removeCartItem({
      sessionId: SESSION_A,
      cartId: created.value.id,
      itemId: 'missing-line-id',
      ifMatch: quoteEtag(created.value.version),
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-47`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.problem.status).toBe(404);
  });
});

describe('cart handler dispatch path (MSW + SDK wire)', () => {
  let env: ReturnType<typeof makeEnv>;

  beforeEach(() => {
    env = makeEnv();
    const handlers = createHandlers({
      repository: env.repository,
      clock: env.clock,
      ids: env.ids,
      scenario: env.repository.getScenario(),
      apiRoot: '/api/v1',
    });
    server.use(...handlers);
  });

  afterEach(() => {
    server.resetHandlers();
  });

  function url(path: string): string {
    return `http://127.0.0.1/api/v1${path}`;
  }

  function commonHeaders(idempotencyKey: string): Record<string, string> {
    return {
      'X-Demo-Session': SESSION_A,
      'Idempotency-Key': idempotencyKey,
      'Content-Type': 'application/json',
    };
  }

  async function postCart(): Promise<{ id: string; version: number }> {
    const response = await fetch(url('/carts'), {
      method: 'POST',
      headers: commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-create`),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; version: number };
    return body;
  }

  it('creates a cart via the wire contract and returns the canonical Cart shape', async () => {
    const body = await postCart();
    expect(body.id).toMatch(/^cart-cart-mock-suite-/);
    expect(body.version).toBe(1);
  });

  it('runs an add → set → remove flow over MSW with the expected cart version chain', async () => {
    const cart = await postCart();
    const add = await fetch(url(`/carts/${cart.id}/items`), {
      method: 'POST',
      headers: { ...commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-add`), 'If-Match': quoteEtag(cart.version) },
      body: JSON.stringify({ variantId: VARIANT_G256, quantity: 1 }),
    });
    expect(add.status).toBe(200);
    const afterAdd = (await add.json()) as { version: number; items: { id: string; quantity: number }[] };
    expect(afterAdd.version).toBe(2);
    expect(afterAdd.items).toHaveLength(1);
    const itemId = afterAdd.items[0].id;
    const patch = await fetch(url(`/carts/${cart.id}/items/${itemId}`), {
      method: 'PATCH',
      headers: { ...commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-set`), 'If-Match': quoteEtag(afterAdd.version) },
      body: JSON.stringify({ quantity: 3 }),
    });
    expect(patch.status).toBe(200);
    const afterSet = (await patch.json()) as { version: number; items: { quantity: number }[] };
    expect(afterSet.version).toBe(3);
    expect(afterSet.items[0]?.quantity).toBe(3);
    const del = await fetch(url(`/carts/${cart.id}/items/${itemId}`), {
      method: 'DELETE',
      headers: { ...commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-del`), 'If-Match': quoteEtag(afterSet.version) },
    });
    expect(del.status).toBe(200);
    const afterDel = (await del.json()) as { version: number; items: unknown[] };
    expect(afterDel.version).toBe(4);
    expect(afterDel.items).toHaveLength(0);
  });

  it('returns 409 CART_VERSION_CONFLICT when the wire If-Match is stale', async () => {
    const cart = await postCart();
    const response = await fetch(url(`/carts/${cart.id}/items`), {
      method: 'POST',
      headers: { ...commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-stale`), 'If-Match': '"99"' },
      body: JSON.stringify({ variantId: VARIANT_G256, quantity: 1 }),
    });
    expect(response.status).toBe(409);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('CART_VERSION_CONFLICT');
  });

  it('returns 410 CART_EXPIRED after the clock advances past the cart expiry', async () => {
    const cart = await postCart();
    env.clock.advanceMs(CART_DURATION_MS + 1);
    const response = await fetch(url(`/carts/${cart.id}`), {
      method: 'GET',
      headers: commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-expired`),
    });
    expect(response.status).toBe(410);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('CART_EXPIRED');
  });

  it('returns 404 when a different session reads the cart', async () => {
    const cart = await postCart();
    const response = await fetch(url(`/carts/${cart.id}`), {
      method: 'GET',
      headers: { ...commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-other`), 'X-Demo-Session': SESSION_B },
    });
    expect(response.status).toBe(404);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 409 IDEMPOTENCY_CONFLICT on a same-key + different-body wire request', async () => {
    const cart = await postCart();
    const first = await fetch(url(`/carts/${cart.id}/items`), {
      method: 'POST',
      headers: { ...commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-conflict`), 'If-Match': quoteEtag(cart.version) },
      body: JSON.stringify({ variantId: VARIANT_G256, quantity: 1 }),
    });
    expect(first.status).toBe(200);
    const after = (await first.json()) as { version: number };
    const conflict = await fetch(url(`/carts/${cart.id}/items`), {
      method: 'POST',
      headers: { ...commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-conflict`), 'If-Match': quoteEtag(after.version) },
      body: JSON.stringify({ variantId: VARIANT_G512, quantity: 2 }),
    });
    expect(conflict.status).toBe(409);
    const body = (await conflict.json()) as { code: string };
    expect(body.code).toBe('IDEMPOTENCY_CONFLICT');
  });
});