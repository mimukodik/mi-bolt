import type { Promotion, Variant } from '@mi-bolt/api/models';

/** Explicit test fixture configuration; the ordinary catalogue has no campaign. */
let campaign: { text: string; startsAt: string; endsAt: string } | null = null;
let prices: ReadonlyMap<string, number> = new Map();
let clock: () => string = () => new Date().toISOString();

export function configurePromotion(
  value: typeof campaign,
  salePrices: ReadonlyMap<string, number> = new Map(),
): void {
  campaign = value;
  prices = salePrices;
}
export function promotionClock(value: () => string): void {
  clock = value;
}
export function currentPromotion(): Promotion {
  const now = clock();
  return {
    ...(campaign ?? {}),
    serverNow: now,
    active:
      campaign !== null &&
      Date.parse(campaign.startsAt) <= Date.parse(now) &&
      Date.parse(now) < Date.parse(campaign.endsAt),
  };
}
export function promotionVariant(variant: Variant): Variant {
  const promotion = currentPromotion();
  const base = variant.originalPrice ?? variant.price;
  const sale = prices.get(variant.id);
  const { originalPrice: _original, promotion: _promotion, ...regular } = variant;
  if (
    !promotion.active ||
    variant.availability === 'out_of_stock' ||
    sale === undefined ||
    !Number.isSafeInteger(sale) ||
    sale <= 0 ||
    sale >= base.amount
  )
    return { ...regular, price: base };
  return { ...regular, price: { amount: sale, currency: 'HUF' }, originalPrice: base, promotion };
}
