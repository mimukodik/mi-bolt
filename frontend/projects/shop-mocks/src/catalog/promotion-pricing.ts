import type { Product, Variant } from '@mi-bolt/api/models';

/** Stored demo configuration; never returned as shopper base-price fields. */
export interface MockPromotion {
  productId: string;
  enabled: boolean;
  text: string;
  startsAt: string;
  endsAt: string;
  variants: readonly { variantId: string; salePriceHuf: number; referencePriceHuf: number }[];
}

export function resolvePromotion(
  product: Product,
  promotion: MockPromotion | undefined,
  now: string,
): Product {
  if (promotion?.enabled !== true) return product;
  const time = Date.parse(now);
  const start = Date.parse(promotion.startsAt);
  const end = Date.parse(promotion.endsAt);
  const active = time >= start && time < end;
  const nextPriceChangeAt =
    time < start ? promotion.startsAt : time < end ? promotion.endsAt : undefined;
  const variants: Variant[] = product.variants.map((variant) => {
    const config = promotion.variants.find((entry) => entry.variantId === variant.id);
    const discounted = active && config !== undefined;
    return {
      ...variant,
      price: discounted ? { amount: config.salePriceHuf, currency: 'HUF' } : variant.price,
      priceMetadata: {
        activePromotion: discounted,
        serverTime: now,
        nextPriceChangeAt,
        ...(discounted
          ? {
              referencePrice: { amount: config.referencePriceHuf, currency: 'HUF' },
              promotionText: promotion.text,
            }
          : {}),
      },
    };
  });
  return { ...product, variants, serverTime: now, nextPriceChangeAt };
}
