/**
 * T08 - checkout draft, shipping and quote mock focused unit suite.
 *
 * Each acceptance criterion has at least one named assertion in the
 * file. The suite exercises every line of `validate-checkout.ts`,
 * `quote-domain.ts` and the checkout handler dispatch path so the
 * coverage gate stays green on the owned runtime surface.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createHandlers } from '../../mocks/create-handlers';
// Side-effect import - registers cart handlers in the T05 registry so the
// checkout wire tests can drive `addCartItem` between quote attempts.
import { DEMO_PRODUCT } from '../../mocks/cart/cart.handlers';
import { CartDomain } from '../../mocks/cart/cart-domain';
import { IdempotencyStore } from '../../mocks/idempotency';
import type { Product, Variant } from '../../mocks/repository';
import { Repository } from '../../mocks/repository';
import { createDeterministicIds, createFixedClock } from '../../mocks/scenarios';
import { CHECKOUT_OPTIONS } from '../../mocks/checkout/checkout.handlers';
import { QUOTE_TTL_MS, QuoteDomain } from '../../mocks/checkout/quote-domain';
import {
  normalizeAddressCity,
  normalizeAddressLine1,
  normalizeAddressLine2,
  normalizeAddressPostalCode,
  normalizeContactEmail,
  normalizeContactFullName,
  normalizeContactPhone,
} from '../../mocks/checkout/validate-checkout';
import { server } from '../../../tests/msw-server';

const SESSION_A = 'session-aaaaaaaaaaaa';
const VARIANT_G256 = 'demo-one-5g-graphite-256';
const VARIANT_G512 = 'demo-one-5g-graphite-512';
const IDEMPOTENCY_KEY_BASE = 'idem-key-12345678';

interface Env {
  clock: ReturnType<typeof createFixedClock>;
  ids: ReturnType<typeof createDeterministicIds>;
  repository: Repository;
  idempotency: IdempotencyStore;
  cartDomain: CartDomain;
  quoteDomain: QuoteDomain;
}

function makeEnv(initialClockMs = Date.parse('2026-09-14T10:00:00.000Z')): Env {
  const clock = createFixedClock(new Date(initialClockMs).toISOString());
  const ids = createDeterministicIds(7);
  const scenario = {
    name: 'checkout-mock-suite',
    seed: 7,
    clockOffsetMs: 0,
    isolated: true,
  };
  const repository = new Repository(scenario, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
  const idempotency = new IdempotencyStore(clock);
  const cartDomain = new CartDomain(repository, clock, ids, idempotency);
  const quoteDomain = new QuoteDomain(repository, clock, ids, idempotency);
  return { clock, ids, repository, idempotency, cartDomain, quoteDomain };
}

function asProductFixture(env: Env): Product {
  const product = env.repository.getProductById(DEMO_PRODUCT.id);
  if (!product) throw new Error('demo product missing');
  return product;
}

async function seedCart(env: Env, sessionId = SESSION_A, variantId = VARIANT_G256, quantity = 1) {
  await Promise.resolve();
  const created = env.cartDomain.createCart({
    sessionId,
    idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-seed-${sessionId}-${variantId}`,
  });
  if (!created.ok) throw new Error('createCart failed');
  const added = env.cartDomain.addCartItem({
    sessionId,
    cartId: created.value.id,
    ifMatch: `"${String(created.value.version)}"`,
    idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-add-${sessionId}-${variantId}`,
    variantId,
    quantity,
  });
  if (!added.ok) throw new Error('addCartItem failed');
  return added.value;
}

function completeValidContact() {
  return { fullName: '  Teszt Elek  ', email: ' Teszt@Example.test ', phone: ' +36201234567 ' };
}

function completeValidDelivery(optionId: 'home_delivery' | 'demo_pickup' = 'home_delivery') {
  if (optionId === 'home_delivery') {
    return {
      optionId,
      address: {
        countryCode: 'HU',
        postalCode: '1111',
        city: '  Demóváros  ',
        line1: '  Példa utca 1.  ',
      },
    } as const;
  }
  return { optionId } as const;
}

describe('T08-AC01 contact normalization and partial-merge safety', () => {
  it('normalizes whitespace, case-folds email and validates the +36 phone prefix', () => {
    expect(normalizeContactFullName('  Teszt   Elek  ')).toBe('Teszt Elek');
    expect(normalizeContactFullName('ÁRVÍZTŰRŐ'.normalize('NFC'))).toBe(
      'ÁRVÍZTŰRŐ'.normalize('NFC'),
    );
    expect(normalizeContactEmail('  Teszt@Example.test ')).toBe('teszt@example.test');
    expect(normalizeContactPhone(' +36 20 123 4567 ')).toBe('+36201234567');
    expect(normalizeContactPhone('+36201234567')).toBe('+36201234567');
    expect(normalizeContactPhone('+3630123456')).toBe('+3630123456');
  });

  it('rejects contact sections outside the JSON schema with field errors', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const result = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-contact-bad`,
      body: {
        contact: { fullName: 'X', email: 'not-email', phone: '+361' },
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.problem.status).toBe(422);
    expect(result.problem.code).toBe('VALIDATION_ERROR');
    const paths = result.problem.fieldErrors.map((f) => f.path).sort();
    expect(paths).toEqual(
      expect.arrayContaining(['/contact/fullName', '/contact/email', '/contact/phone']),
    );
  });

  it('merges only the supplied sections and never erases prior values', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const first = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-merge-1`,
      body: { contact: completeValidContact(), paymentMethod: 'demo_card' },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected merge');
    expect(first.value.draft.contact?.fullName).toBe('Teszt Elek');
    expect(first.value.draft.contact?.email).toBe('teszt@example.test');
    expect(first.value.draft.paymentMethod).toBe('demo_card');
    const second = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: first.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-merge-2`,
      body: { delivery: completeValidDelivery('home_delivery') },
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error('expected merge');
    // Contact is preserved.
    expect(second.value.draft.contact?.fullName).toBe('Teszt Elek');
    expect(second.value.draft.paymentMethod).toBe('demo_card');
    expect(second.value.draft.delivery?.optionId).toBe('home_delivery');
    // Cart version unchanged.
    expect(second.value.cartVersion).toBe(seeded.version);
  });

  it('returns field errors without erasing previously-merged sections', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const first = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-preserve-1`,
      body: { contact: completeValidContact(), paymentMethod: 'demo_card' },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected merge');
    const invalid = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: first.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-preserve-2`,
      body: {
        delivery: {
          optionId: 'demo_pickup',
          address: {
            countryCode: 'HU',
            postalCode: '1111',
            city: 'Demóváros',
            line1: 'Példa utca 1.',
          },
        },
      },
    });
    expect(invalid.ok).toBe(false);
    if (invalid.ok) throw new Error('expected rejection');
    expect(invalid.problem.status).toBe(422);
    expect(invalid.problem.fieldErrors[0]?.path).toBe('/delivery');
    // Re-read the session: previously merged contact + paymentMethod survive.
    const next = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: first.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-preserve-3`,
      body: { contact: completeValidContact() },
    });
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error('expected still-merged state');
    expect(next.value.draft.contact?.fullName).toBe('Teszt Elek');
    expect(next.value.draft.paymentMethod).toBe('demo_card');
  });
});

describe('T08-AC02 delivery rules and shipping fee', () => {
  it('accepts HU address for home_delivery and rejects non-HU country code', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const bad = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-country`,
      body: {
        delivery: {
          optionId: 'home_delivery',
          address: {
            countryCode: 'AT',
            postalCode: '1111',
            city: 'Bécs',
            line1: 'Ringstraße 1.',
          },
        },
      },
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error('expected rejection');
    expect(bad.problem.status).toBe(422);
    expect(bad.problem.fieldErrors[0]?.path).toBe('/delivery/address/countryCode');
  });

  it('rejects home_delivery without an address and pickup with an address', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const missing = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-missing-address`,
      body: { delivery: { optionId: 'home_delivery' } },
    });
    expect(missing.ok).toBe(false);
    if (missing.ok) throw new Error('expected rejection');
    expect(missing.problem.code).toBe('VALIDATION_ERROR');
    expect(missing.problem.fieldErrors[0]?.path).toBe('/delivery/address');

    const pickupWithAddress = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-pickup-bad`,
      body: {
        delivery: {
          optionId: 'demo_pickup',
          address: {
            countryCode: 'HU',
            postalCode: '1111',
            city: 'Demóváros',
            line1: 'Példa utca 1.',
          },
        },
      },
    });
    expect(pickupWithAddress.ok).toBe(false);
    if (pickupWithAddress.ok) throw new Error('expected rejection');
    expect(pickupWithAddress.problem.fieldErrors[0]?.path).toBe('/delivery');
  });

  it('rejects malformed address fields with the matching JSON pointer', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const bad = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-bad-address`,
      body: {
        delivery: {
          optionId: 'home_delivery',
          address: {
            countryCode: 'HU',
            postalCode: '0123',
            city: 'x',
            line1: 'ab',
          },
        },
      },
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) throw new Error('expected rejection');
    const paths = bad.problem.fieldErrors.map((f) => f.path).sort();
    expect(paths).toEqual(
      expect.arrayContaining([
        '/delivery/address/postalCode',
        '/delivery/address/city',
        '/delivery/address/line1',
      ]),
    );
  });

  it('quotes home_delivery at 1990 HUF and demo_pickup at 0 HUF, never client-supplied', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const updated = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-fee-home`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      },
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error('expected merge');
    const home = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: updated.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-quote-home`,
    });
    expect(home.ok).toBe(true);
    if (!home.ok) throw new Error('expected quote');
    expect(home.value.quote.shipping).toEqual({ amount: 1990, currency: 'HUF' });
    expect(home.value.quote.subtotal).toEqual({ amount: 339_990, currency: 'HUF' });
    expect(home.value.quote.total).toEqual({ amount: 341_980, currency: 'HUF' });

    const updatedPickup = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-fee-pickup`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('demo_pickup'),
        paymentMethod: 'demo_card',
      },
    });
    expect(updatedPickup.ok).toBe(true);
    if (!updatedPickup.ok) throw new Error('expected merge');
    const pickup = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: updatedPickup.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-quote-pickup`,
    });
    expect(pickup.ok).toBe(true);
    if (!pickup.ok) throw new Error('expected quote');
    expect(pickup.value.quote.shipping).toEqual({ amount: 0, currency: 'HUF' });
    expect(pickup.value.quote.total).toEqual({ amount: 339_990, currency: 'HUF' });
  });

  it('exposes a static checkout options payload that drives the shipping fee', () => {
    expect(CHECKOUT_OPTIONS.deliveryOptions.find((o) => o.id === 'home_delivery')?.fee).toEqual({
      amount: 1990,
      currency: 'HUF',
    });
    expect(CHECKOUT_OPTIONS.deliveryOptions.find((o) => o.id === 'demo_pickup')?.fee).toEqual({
      amount: 0,
      currency: 'HUF',
    });
  });
});

describe('T08-AC03 quote guards (empty cart, incomplete sections, stock)', () => {
  it('rejects a quote for an empty cart with CHECKOUT_INCOMPLETE /cart pointer', () => {
    const env = makeEnv();
    const created = env.cartDomain.createCart({
      sessionId: SESSION_A,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-empty-cart`,
    });
    if (!created.ok) throw new Error('createCart failed');
    const merged = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: created.value.id,
      cartVersion: created.value.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-empty-merge`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error('expected merge');
    const quote = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: created.value.id,
      cartVersion: merged.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-empty-quote`,
    });
    expect(quote.ok).toBe(false);
    if (quote.ok) throw new Error('expected rejection');
    expect(quote.problem.status).toBe(422);
    expect(quote.problem.code).toBe('CHECKOUT_INCOMPLETE');
    expect(quote.problem.fieldErrors[0]?.path).toBe('/cart');
  });

  it('rejects a quote when any of contact/delivery/payment is missing', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const noContact = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-no-contact`,
    });
    expect(noContact.ok).toBe(false);
    if (noContact.ok) throw new Error('expected rejection');
    expect(noContact.problem.status).toBe(422);
    expect(noContact.problem.code).toBe('CHECKOUT_INCOMPLETE');
    const noContactPaths = noContact.problem.fieldErrors.map((f) => f.path).sort();
    expect(noContactPaths).toEqual(
      expect.arrayContaining(['/contact', '/delivery', '/paymentMethod']),
    );

    const merged = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-incomplete-merge`,
      body: { contact: completeValidContact() },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error('expected merge');
    const noDelivery = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: merged.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-no-delivery`,
    });
    expect(noDelivery.ok).toBe(false);
    if (noDelivery.ok) throw new Error('expected rejection');
    expect(noDelivery.problem.code).toBe('CHECKOUT_INCOMPLETE');
    expect(noDelivery.problem.fieldErrors.map((f) => f.path)).toEqual(
      expect.arrayContaining(['/delivery', '/paymentMethod']),
    );
  });

  it('returns 409 OUT_OF_STOCK when a variant is exhausted at quote time', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env, SESSION_A, VARIANT_G256, 1);
    // Flip the catalogue to out_of_stock before the quote runs.
    const product = asProductFixture(env);
    const oos = cloneProduct(
      product,
      product.variants.map((v) =>
        v.id === VARIANT_G256 ? { ...v, availability: 'out_of_stock' as const, maxQuantity: 0 } : v,
      ),
    );
    env.repository.loadProducts([oos]);
    const merged = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-oos-merge`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error('expected merge');
    const quote = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: merged.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-oos-quote`,
    });
    expect(quote.ok).toBe(false);
    if (quote.ok) throw new Error('expected rejection');
    expect(quote.problem.status).toBe(409);
    expect(quote.problem.code).toBe('OUT_OF_STOCK');
  });
});

describe('T08-AC04 quote TTL, cart-version and draft invalidation', () => {
  it('exposes the 5-minute TTL constant and keeps an active quote inside the window', async () => {
    expect(QUOTE_TTL_MS).toBe(5 * 60 * 1000);
    const env = makeEnv();
    const seeded = await seedCart(env);
    const merged = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-ttl-merge`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error('expected merge');
    const first = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: merged.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-ttl-first`,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected quote');
    const initialExpiresAt = first.value.quote.expiresAt;
    env.clock.advanceMs(QUOTE_TTL_MS - 1);
    expect(env.quoteDomain.getActiveQuote(seeded.id, seeded.version)?.expiresAt).toBe(
      initialExpiresAt,
    );
  });

  it('expires the quote after exactly 5 mock-clock minutes', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const merged = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-ttl-expire-merge`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error('expected merge');
    const first = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: merged.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-ttl-expire-first`,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected quote');
    env.clock.advanceMs(QUOTE_TTL_MS);
    expect(env.quoteDomain.getActiveQuote(seeded.id, seeded.version)).toBeNull();
  });

  it('invalidates the active quote when the cart version bumps (cart mutation)', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const merged = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-mut-merge`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error('expected merge');
    const first = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: merged.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-mut-first`,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected quote');
    const bumped = env.cartDomain.addCartItem({
      sessionId: SESSION_A,
      cartId: seeded.id,
      ifMatch: `"${String(seeded.version)}"`,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-mut-bump`,
      variantId: VARIANT_G512,
      quantity: 1,
    });
    expect(bumped.ok).toBe(true);
    if (!bumped.ok) throw new Error('expected bump');
    // Old quote (cartVersion < current) is treated as invalidated.
    expect(env.quoteDomain.getActiveQuote(seeded.id, bumped.value.version)).toBeNull();

    // Advance the clock by a millisecond so the fresh quote carries a
    // distinct expiresAt timestamp deterministically.
    env.clock.advanceMs(1);
    const next = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: bumped.value.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-mut-second`,
    });
    expect(next.ok).toBe(true);
    if (!next.ok) throw new Error('expected fresh quote');
    expect(next.value.quote.id).not.toBe(first.value.quote.id);
    expect(next.value.quote.expiresAt).not.toBe(first.value.quote.expiresAt);
    expect(next.value.quote.cartVersion).toBe(bumped.value.version);
  });

  it('invalidates the active quote when a draft update succeeds and replaces it on the next call', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const first = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-draft-merge-1`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected merge');
    const quote = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: first.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-draft-quote-1`,
    });
    expect(quote.ok).toBe(true);
    if (!quote.ok) throw new Error('expected quote');
    const id1 = quote.value.quote.id;

    const draftUpdate = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: first.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-draft-merge-2`,
      body: { contact: { ...completeValidContact(), fullName: 'Más Név' } },
    });
    expect(draftUpdate.ok).toBe(true);
    if (!draftUpdate.ok) throw new Error('expected merge');

    // Old quote is gone (treated as invalidated).
    expect(env.quoteDomain.getActiveQuote(seeded.id, seeded.version)).toBeNull();

    const replacement = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-draft-quote-2`,
    });
    expect(replacement.ok).toBe(true);
    if (!replacement.ok) throw new Error('expected replacement');
    expect(replacement.value.quote.id).not.toBe(id1);
  });
});

describe('T08-AC05 PRICE_CHANGED atomic update', () => {
  it('atomically updates cart line prices, bumps version, and returns PRICE_CHANGED', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const merged = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-price-merge`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error('expected merge');

    // Mutate the catalogue price for the variant while the cart still
    // carries the old snapshot.
    const product = asProductFixture(env);
    const mutated = cloneProduct(
      product,
      product.variants.map((v) =>
        v.id === VARIANT_G256 ? { ...v, price: { amount: 359_990, currency: 'HUF' } } : v,
      ),
    );
    env.repository.loadProducts([mutated]);

    const result = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: merged.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-price-quote`,
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected PRICE_CHANGED');
    expect(result.problem.status).toBe(409);
    expect(result.problem.code).toBe('PRICE_CHANGED');
    // Cart version bumped by exactly one and price reflects the catalogue.
    const stored = env.repository.getCart(seeded.id);
    expect(stored?.version).toBe(seeded.version + 1);
    expect(stored?.items[0]?.unitPrice).toEqual({ amount: 359_990, currency: 'HUF' });
    expect(stored?.items[0]?.lineTotal).toEqual({ amount: 359_990, currency: 'HUF' });
  });

  it('keeps PRICE_CHANGED distinct from QUOTE_EXPIRED and OUT_OF_STOCK', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const merged = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-dist-merge`,
      body: {
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      },
    });
    expect(merged.ok).toBe(true);
    if (!merged.ok) throw new Error('expected merge');

    // Quote once -> advance clock past TTL -> quote is gone but cart is intact.
    const first = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: merged.value.cartVersion,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-dist-quote-1`,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected quote');

    env.clock.advanceMs(QUOTE_TTL_MS + 1);

    // Same cart, same draft, same stock, same prices - strictly expiry.
    const expired = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-dist-quote-2`,
    });
    expect(expired.ok).toBe(true);
    if (!expired.ok) throw new Error('expected fresh quote (no PRICE_CHANGED)');
    expect(expired.value.quote.id).not.toBe(first.value.quote.id);

    // Now flip a variant to out_of_stock at quote time; PRICE_CHANGED must
    // not be returned because the existing-prices branch is satisfied.
    const product = asProductFixture(env);
    const oos = cloneProduct(
      product,
      product.variants.map((v) =>
        v.id === VARIANT_G256 ? { ...v, availability: 'out_of_stock' as const, maxQuantity: 0 } : v,
      ),
    );
    env.repository.loadProducts([oos]);
    const stock = env.quoteDomain.createQuote({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-dist-quote-3`,
    });
    expect(stock.ok).toBe(false);
    if (stock.ok) throw new Error('expected OUT_OF_STOCK');
    expect(stock.problem.code).toBe('OUT_OF_STOCK');
    expect(stock.problem.code).not.toBe('PRICE_CHANGED');
  });
});

describe('address and contact normalization helpers', () => {
  it('normalizes HU address fields while enforcing the schema-length rules', () => {
    expect(normalizeAddressCity('  Demóváros  ')).toBe('Demóváros');
    expect(normalizeAddressLine1('  Példa utca 1.  ')).toBe('Példa utca 1.');
    expect(normalizeAddressLine2('  Emelet 2  ')).toBe('Emelet 2');
    // Acceptable postal codes (1xxx, 9xxx, 1000-9999 inclusive).
    expect(normalizeAddressPostalCode('1111')).toBe('1111');
    expect(normalizeAddressPostalCode('9999')).toBe('9999');
    // Leading-zero 0123 must be rejected.
    expect(normalizeAddressPostalCode('0123')).toBeNull();
    expect(normalizeAddressPostalCode('0')).toBeNull();
    // Too-short city.
    expect(normalizeAddressCity('x')).toBeNull();
    // Too-long line1.
    expect(normalizeAddressLine1('a'.repeat(121))).toBeNull();
    // Too-long line2.
    expect(normalizeAddressLine2('a'.repeat(121))).toBeNull();
  });

  it('rejects non-string, empty and out-of-range inputs across every normalizer', () => {
    // Non-string inputs.
    expect(normalizeContactFullName(123)).toBeNull();
    expect(normalizeContactEmail(null)).toBeNull();
    expect(normalizeContactPhone(undefined)).toBeNull();
    expect(normalizeAddressPostalCode(false)).toBeNull();
    expect(normalizeAddressCity({})).toBeNull();
    expect(normalizeAddressLine1([])).toBeNull();
    expect(normalizeAddressLine2(42)).toBeNull();
    // Empty strings.
    expect(normalizeContactFullName('   ')).toBeNull();
    expect(normalizeContactEmail('')).toBeNull();
    expect(normalizeAddressCity('')).toBeNull();
    expect(normalizeAddressLine1('  ')).toBeNull();
    // Out-of-range lengths.
    expect(normalizeContactFullName('a'.repeat(101))).toBeNull();
    expect(normalizeContactEmail('a'.repeat(255))).toBeNull();
    expect(normalizeAddressCity('a'.repeat(81))).toBeNull();
    // Invalid email patterns.
    expect(normalizeContactEmail('not-an-email')).toBeNull();
    expect(normalizeContactEmail('no@dot')).toBeNull();
    expect(normalizeContactEmail('@example.com')).toBeNull();
    // Phone numbers not matching the +36 prefix.
    expect(normalizeContactPhone('06201234567')).toBeNull();
    expect(normalizeContactPhone('+363012')).toBeNull();
    expect(normalizeContactPhone('+362012345')).toBeNull();
    // Address line2 above 120 chars returns null; exactly 120 stays valid.
    expect(normalizeAddressLine2('a'.repeat(120))).toBe('a'.repeat(120));
    // Line2 undefined/null becomes undefined; too-long string returns null.
    expect(normalizeAddressLine2(undefined)).toBeUndefined();
    expect(normalizeAddressLine2(null)).toBeUndefined();
  });
});

describe('QuoteDomain error paths and session guards', () => {
  it('rejects malformed X-Demo-Session headers with 400 VALIDATION_FAILED', () => {
    const env = makeEnv();
    const result = env.quoteDomain.updateDraft({
      sessionId: 'short',
      cartId: 'cart-anything',
      cartVersion: 1,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-bad-session`,
      body: { contact: completeValidContact() },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.problem.status).toBe(400);
    expect(result.problem.code).toBe('VALIDATION_FAILED');
  });

  it('rejects missing If-Match with 400 VALIDATION_FAILED', () => {
    const env = makeEnv();
    const result = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: 'cart-anything',
      cartVersion: null,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-no-if`,
      body: { contact: completeValidContact() },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.problem.status).toBe(400);
    expect(result.problem.fieldErrors[0]?.path).toBe('/If-Match');
  });

  it('rejects missing Idempotency-Key with 400 VALIDATION_FAILED', () => {
    const env = makeEnv();
    const result = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: 'cart-anything',
      cartVersion: 1,
      idempotencyKey: null,
      body: { contact: completeValidContact() },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.problem.status).toBe(400);
    expect(result.problem.fieldErrors[0]?.path).toBe('/Idempotency-Key');
  });

  it('returns 404 NOT_FOUND when the cart does not belong to the session', () => {
    const env = makeEnv();
    const result = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: 'cart-unknown',
      cartVersion: 1,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-no-cart`,
      body: { contact: completeValidContact() },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.problem.status).toBe(404);
    expect(result.problem.code).toBe('NOT_FOUND');
  });

  it('returns 409 IDEMPOTENCY_CONFLICT on a same-key + different-body replay', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const key = `${IDEMPOTENCY_KEY_BASE}-conflicting-key`;
    const first = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: key,
      body: { contact: completeValidContact() },
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('expected first');
    const conflict = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: first.value.cartVersion,
      idempotencyKey: key,
      body: { paymentMethod: 'demo_card' },
    });
    expect(conflict.ok).toBe(false);
    if (conflict.ok) throw new Error('expected conflict');
    expect(conflict.problem.status).toBe(409);
    expect(conflict.problem.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('rejects update with no recognized sections as 422 VALIDATION_ERROR', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const empty = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-empty-body`,
      body: {},
    });
    expect(empty.ok).toBe(false);
    if (empty.ok) throw new Error('expected rejection');
    expect(empty.problem.status).toBe(422);
    expect(empty.problem.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unknown delivery option ids with the optionId pointer', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const result = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-unknown-delivery`,
      body: { delivery: { optionId: 'teleport' } },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.problem.fieldErrors[0]?.path).toBe('/delivery/optionId');
  });

  it('rejects unknown payment methods with the paymentMethod pointer', async () => {
    const env = makeEnv();
    const seeded = await seedCart(env);
    const result = env.quoteDomain.updateDraft({
      sessionId: SESSION_A,
      cartId: seeded.id,
      cartVersion: seeded.version,
      idempotencyKey: `${IDEMPOTENCY_KEY_BASE}-unknown-payment`,
      body: { paymentMethod: 'bitcoin' },
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected rejection');
    expect(result.problem.fieldErrors[0]?.path).toBe('/paymentMethod');
  });
});

describe('checkout handler dispatch path (MSW + SDK wire)', () => {
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

  function commonHeaders(idempotencyKey: string, ifMatch = '"1"'): Record<string, string> {
    return {
      'X-Demo-Session': SESSION_A,
      'Idempotency-Key': idempotencyKey,
      'If-Match': ifMatch,
      'Content-Type': 'application/json',
    };
  }

  async function postCart(): Promise<{ id: string; version: number }> {
    const response = await fetch(url('/carts'), {
      method: 'POST',
      headers: {
        'X-Demo-Session': SESSION_A,
        'Idempotency-Key': `${IDEMPOTENCY_KEY_BASE}-wire-cart`,
        'Content-Type': 'application/json',
      },
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; version: number };
  }

  async function addItem(
    cart: { id: string; version: number },
    variantId: string,
    quantity: number,
  ): Promise<{ id: string; version: number }> {
    const response = await fetch(url(`/carts/${cart.id}/items`), {
      method: 'POST',
      headers: commonHeaders(
        `${IDEMPOTENCY_KEY_BASE}-wire-add-${variantId}-${String(cart.version)}`,
        `"${String(cart.version)}"`,
      ),
      body: JSON.stringify({ variantId, quantity }),
    });
    expect(response.status).toBe(200);
    return (await response.json()) as { id: string; version: number };
  }

  it('exposes the static checkout options payload', async () => {
    const response = await fetch(url('/checkout/options'));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { deliveryOptions: { id: string }[] };
    expect(body.deliveryOptions.map((o) => o.id)).toEqual(['home_delivery', 'demo_pickup']);
  });

  it('returns CHECKOUT_INCOMPLETE on the wire when the cart is empty', async () => {
    const cart = await postCart();
    const response = await fetch(url(`/checkout/${cart.id}/quote`), {
      method: 'POST',
      headers: commonHeaders(
        `${IDEMPOTENCY_KEY_BASE}-wire-empty-quote-${String(cart.version)}`,
        `"${String(cart.version)}"`,
      ),
    });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { code: string };
    expect(body.code).toBe('CHECKOUT_INCOMPLETE');
  });

  it('runs a full update → quote → mutation → re-quote flow on the wire', async () => {
    const cart = await postCart();
    const withItem = await addItem(cart, VARIANT_G256, 1);

    // Update draft with home delivery
    const updateResponse = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: commonHeaders(
        `${IDEMPOTENCY_KEY_BASE}-wire-update-1`,
        `"${String(withItem.version)}"`,
      ),
      body: JSON.stringify({
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      }),
    });
    expect(updateResponse.status).toBe(200);

    // First quote
    const firstQuoteResponse = await fetch(url(`/checkout/${cart.id}/quote`), {
      method: 'POST',
      headers: commonHeaders(
        `${IDEMPOTENCY_KEY_BASE}-wire-quote-1`,
        `"${String(withItem.version)}"`,
      ),
    });
    expect(firstQuoteResponse.status).toBe(200);
    const firstQuote = (await firstQuoteResponse.json()) as {
      id: string;
      total: { amount: number };
      shipping: { amount: number };
      cartVersion: number;
    };
    expect(firstQuote.total).toEqual({ amount: 341_980, currency: 'HUF' });
    expect(firstQuote.shipping).toEqual({ amount: 1990, currency: 'HUF' });
    expect(firstQuote.cartVersion).toBe(withItem.version);

    // Mutate cart -> bumps version. The previous call returned `withItem`
    // and we use its version as the If-Match so addItem accepts it and
    // returns the freshly bumped version.
    const bumped = await addItem({ id: cart.id, version: withItem.version }, VARIANT_G512, 1);

    // Subsequent quote uses the bumped version and produces a fresh quote id
    const refreshedResponse = await fetch(url(`/checkout/${cart.id}/quote`), {
      method: 'POST',
      headers: commonHeaders(`${IDEMPOTENCY_KEY_BASE}-wire-quote-2`, `"${String(bumped.version)}"`),
    });
    expect(refreshedResponse.status).toBe(200);
    const refreshed = (await refreshedResponse.json()) as { id: string; cartVersion: number };
    expect(refreshed.id).not.toBe(firstQuote.id);
    expect(refreshed.cartVersion).toBe(bumped.version);
  });

  it('returns 422 with field errors for a missing address and a same-key conflict on retry', async () => {
    const cart = await postCart();
    const withItem = await addItem(cart, VARIANT_G256, 1);

    const badResponse = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: commonHeaders(
        `${IDEMPOTENCY_KEY_BASE}-wire-missing-address`,
        `"${String(withItem.version)}"`,
      ),
      body: JSON.stringify({
        contact: completeValidContact(),
        delivery: { optionId: 'home_delivery' },
        paymentMethod: 'demo_card',
      }),
    });
    expect(badResponse.status).toBe(422);
    const badBody = (await badResponse.json()) as {
      code: string;
      fieldErrors: { path: string; message: string }[];
    };
    expect(badBody.code).toBe('VALIDATION_ERROR');
    expect(badBody.fieldErrors[0]?.path).toBe('/delivery/address');

    // Same Idempotency-Key + different body -> IDEMPOTENCY_CONFLICT
    const key = `${IDEMPOTENCY_KEY_BASE}-wire-conflict`;
    const first = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: commonHeaders(key, `"${String(withItem.version)}"`),
      body: JSON.stringify({
        contact: completeValidContact(),
        delivery: completeValidDelivery('home_delivery'),
        paymentMethod: 'demo_card',
      }),
    });
    expect(first.status).toBe(200);
    const conflict = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: commonHeaders(key, `"${String(withItem.version)}"`),
      body: JSON.stringify({
        contact: completeValidContact(),
        delivery: completeValidDelivery('demo_pickup'),
        paymentMethod: 'demo_card',
      }),
    });
    expect(conflict.status).toBe(409);
    const conflictBody = (await conflict.json()) as { code: string };
    expect(conflictBody.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('returns 400 for missing X-Demo-Session, Idempotency-Key and If-Match headers on update', async () => {
    const cart = await postCart();
    const noSession = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: {
        'Idempotency-Key': `${IDEMPOTENCY_KEY_BASE}-wire-no-session`,
        'If-Match': '"1"',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contact: completeValidContact() }),
    });
    expect(noSession.status).toBe(400);

    const noKey = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: {
        'X-Demo-Session': SESSION_A,
        'If-Match': '"1"',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contact: completeValidContact() }),
    });
    expect(noKey.status).toBe(400);

    const noIfMatch = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: {
        'X-Demo-Session': SESSION_A,
        'Idempotency-Key': `${IDEMPOTENCY_KEY_BASE}-wire-no-if`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contact: completeValidContact() }),
    });
    expect(noIfMatch.status).toBe(400);
  });

  it('returns 400 for malformed If-Match, short Idempotency-Key and malformed body on update', async () => {
    const cart = await postCart();
    const badIf = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: {
        'X-Demo-Session': SESSION_A,
        'Idempotency-Key': `${IDEMPOTENCY_KEY_BASE}-wire-bad-if`,
        'If-Match': 'not-quoted',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contact: completeValidContact() }),
    });
    expect(badIf.status).toBe(400);

    const shortKey = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: {
        'X-Demo-Session': SESSION_A,
        'Idempotency-Key': 'x',
        'If-Match': '"1"',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contact: completeValidContact() }),
    });
    expect(shortKey.status).toBe(400);

    const malformedBody = await fetch(url(`/checkout/${cart.id}`), {
      method: 'PUT',
      headers: {
        'X-Demo-Session': SESSION_A,
        'Idempotency-Key': `${IDEMPOTENCY_KEY_BASE}-wire-malformed-body`,
        'If-Match': '"1"',
        'Content-Type': 'application/json',
      },
      body: 'not-json',
    });
    expect(malformedBody.status).toBe(400);
  });

  it('returns 404 from getCheckoutSession for unknown or cross-session carts', async () => {
    const response = await fetch(url('/checkout/cart-unknown'), {
      headers: { 'X-Demo-Session': SESSION_A },
    });
    expect(response.status).toBe(404);

    const cart = await postCart();
    const cross = await fetch(url(`/checkout/${cart.id}`), {
      headers: { 'X-Demo-Session': 'session-cccccccccccc' },
    });
    expect(cross.status).toBe(404);
  });

  it('returns 400 from getCheckoutSession when X-Demo-Session is missing or short', async () => {
    const noSession = await fetch(url('/checkout/cart-anything'));
    expect(noSession.status).toBe(400);
    const shortSession = await fetch(url('/checkout/cart-anything'), {
      headers: { 'X-Demo-Session': 'short' },
    });
    expect(shortSession.status).toBe(400);
  });

  it('returns 400 from createCheckoutQuote for missing headers and malformed If-Match', async () => {
    const cart = await postCart();
    const noKey = await fetch(url(`/checkout/${cart.id}/quote`), {
      method: 'POST',
      headers: {
        'X-Demo-Session': SESSION_A,
        'If-Match': '"1"',
        'Content-Type': 'application/json',
      },
    });
    expect(noKey.status).toBe(400);

    const badIf = await fetch(url(`/checkout/${cart.id}/quote`), {
      method: 'POST',
      headers: {
        'X-Demo-Session': SESSION_A,
        'Idempotency-Key': `${IDEMPOTENCY_KEY_BASE}-wire-bad-if-quote`,
        'If-Match': 'not-quoted',
        'Content-Type': 'application/json',
      },
    });
    expect(badIf.status).toBe(400);

    const shortKey = await fetch(url(`/checkout/${cart.id}/quote`), {
      method: 'POST',
      headers: {
        'X-Demo-Session': SESSION_A,
        'Idempotency-Key': 'x',
        'If-Match': '"1"',
        'Content-Type': 'application/json',
      },
    });
    expect(shortKey.status).toBe(400);
  });
});

/** Test-only helpers below - small utilities used by the suite. */

function cloneProduct(product: Product, variants: readonly Variant[]): Product {
  return {
    ...product,
    variants,
    defaultVariant: variants[0] ?? product.defaultVariant,
  };
}
