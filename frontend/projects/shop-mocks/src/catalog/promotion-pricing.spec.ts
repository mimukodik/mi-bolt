import type { Product } from '@mi-bolt/api/models';
import type { VariantLookup } from './catalog-store';
import { describe, expect, it } from 'vitest';
import rawFixture from '../../../../docs/api/fixtures/catalog.json';
import { isCatalogFixtureShape } from './catalog.handlers';
import { resolvePromotion, type MockPromotion } from './promotion-pricing';
import { CartStore, type CartOutcome } from '../cart/cart-store';
import { Repository } from '../repository';
import { createDeterministicIds, createFixedClock, DEFAULT_SCENARIO } from '../scenarios';

const fixture: unknown = rawFixture;

function campaign(): MockPromotion {
  if (!isCatalogFixtureShape(fixture)) throw new Error('Invalid fixture');
  const product = fixture.products[0];
  return {
    productId: product.id,
    enabled: true,
    text: 'Halloween',
    startsAt: '2026-10-30T12:00:00Z',
    endsAt: '2026-11-01T00:00:00Z',
    variants: [
      {
        variantId: product.variants[0].id,
        referencePriceHuf: product.variants[0].price.amount,
        salePriceHuf: 100_000,
      },
    ],
  };
}
function cartView(outcome: CartOutcome): Extract<CartOutcome, { ok: true }>['cart'] {
  if (!outcome.ok) throw new Error(outcome.problem.code);
  return outcome.cart;
}

describe('promotion pricing and item acceptance', () => {
  it('uses inclusive start, exclusive expiry, and only configured variants', () => {
    if (!isCatalogFixtureShape(fixture)) throw new Error('Invalid fixture');
    const product = fixture.products[0];
    const promotion = campaign();
    expect(
      resolvePromotion(product, promotion, '2026-10-30T11:59:59.999Z').variants[0].price,
    ).toEqual(product.variants[0].price);
    const active = resolvePromotion(product, promotion, promotion.startsAt);
    expect(active.variants[0].price.amount).toBe(100_000);
    expect(active.variants[0].priceMetadata?.referencePrice?.amount).toBe(
      product.variants[0].price.amount,
    );
    for (const variant of active.variants.slice(1))
      expect(variant.priceMetadata?.activePromotion).toBe(false);
    expect(resolvePromotion(product, promotion, promotion.endsAt).variants[0].price).toEqual(
      product.variants[0].price,
    );
  });
  it('retains captured reference and sale after a base-price change', () => {
    if (!isCatalogFixtureShape(fixture)) throw new Error('Invalid fixture');
    const product = structuredClone(fixture.products[0]);
    const promotion = campaign();
    const reference = product.variants[0].price.amount;
    product.variants[0].price.amount += 50_000;
    const result = resolvePromotion(product, promotion, promotion.startsAt).variants[0];
    expect(result.price.amount).toBe(100_000);
    expect(result.priceMetadata?.referencePrice?.amount).toBe(reference);
  });
  it('requires acceptance for equal-total item changes, persists it across reload, and rejects a second change', () => {
    if (!isCatalogFixtureShape(fixture)) throw new Error('Invalid fixture');
    const products: Product[] = structuredClone(fixture.products.slice(0, 2));
    const hits: VariantLookup[] = products.map((product) => ({
      product,
      variant: product.variants[0],
    }));
    const ids = createDeterministicIds(91);
    const clock = createFixedClock('2026-10-30T12:00:00Z');
    const options = {
      repository: new Repository(DEFAULT_SCENARIO, ids, clock),
      ids,
      clock,
      scenario: DEFAULT_SCENARIO,
      apiRoot: '/api/v1',
    };
    const lookup = (id: string): (typeof hits)[number] | undefined =>
      hits.find((hit) => hit.variant.id === id);
    const store = new CartStore(options, lookup);
    let view = cartView(store.get('session'));
    for (const hit of hits)
      view = cartView(store.add('session', `"${String(view.version)}"`, hit.variant.id, 1));
    const subtotal = view.subtotal.amount;
    hits[0].variant.price.amount += 1000;
    hits[1].variant.price.amount -= 1000;
    const changed = cartView(store.get('session'));
    expect(changed.subtotal.amount).toBe(subtotal);
    expect(changed.priceAcceptanceRequired).toBe(true);
    expect(store.acceptPrices('session', undefined)).toBe(false);
    const saved = store.toPersistedCart('session');
    if (saved === undefined) throw new Error('Missing snapshot');
    const restored = new CartStore(options, lookup);
    restored.seedFromSnapshot('session', saved);
    expect(cartView(restored.get('session')).priceAcceptanceRequired).toBe(true);
    hits[0].variant.price.amount += 1;
    expect(restored.acceptPrices('session', changed.priceRevision)).toBe(false);
    const latest = cartView(restored.get('session'));
    expect(restored.acceptPrices('session', latest.priceRevision)).toBe(true);
    expect(cartView(restored.get('session')).priceAcceptanceRequired).toBe(false);
    expect(restored.pricesMatch('session', changed.priceRevision)).toBe(false);
    expect(restored.acceptPrices('session', changed.priceRevision)).toBe(false);
    expect(restored.pricesMatch('session', latest.priceRevision)).toBe(true);
  });
});
