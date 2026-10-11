import type { CatalogFixture } from './catalog-store';
import type { MockPromotion } from './promotion-pricing';

/** Explicit opt-in rehearsal data; the normal fixture never activates a campaign. */
export function halloweenFixture(fixture: CatalogFixture, now: string): CatalogFixture {
  const time = Date.parse(now);
  const promotions: MockPromotion[] = fixture.products.slice(0, 5).map((product, index) => ({
    productId: product.id,
    enabled: true,
    text: 'Ijesztően jó halloweeni ajánlat',
    startsAt: new Date(time + (index === 3 ? 60_000 : -86_400_000)).toISOString(),
    endsAt: new Date(time + (index === 4 ? -1 : 3_600_000)).toISOString(),
    variants: product.variants
      .filter((_variant, variantIndex) => index !== 2 || variantIndex === 0)
      .map((variant) => ({
        variantId: variant.id,
        referencePriceHuf: variant.price.amount,
        salePriceHuf: Math.max(1, variant.price.amount - 20_000),
      })),
  }));
  return { ...fixture, promotions };
}
