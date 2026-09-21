/**
 * The `navigationReason` query parameter the checkout guards attach to
 * every redirect (`checkout.guards.ts`), turned into the one sentence
 * the page the shopper lands on shows them.
 *
 * The mapping lives here, and only here, so the cart, contact and
 * delivery pages cannot word the same redirect differently. A value the
 * guards do not produce maps to `null`, which the banner renders as
 * nothing rather than as a guess.
 */
import type { NavigationReason } from './checkout.guards';

export const NAVIGATION_REASONS = [
  'incomplete',
  'empty-cart',
  'cart-unavailable',
  'deep-link',
] as const;

export function toNavigationReason(value: string | null): NavigationReason | null {
  return NAVIGATION_REASONS.find((reason) => reason === value) ?? null;
}

export function navigationReasonMessage(reason: NavigationReason | null): string | null {
  if (reason === null) return null;
  switch (reason) {
    case 'incomplete':
      return 'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.';
    case 'empty-cart':
      return 'A kosarad üres, ezért ide irányítottunk.';
    case 'cart-unavailable':
      return 'A kosár most nem érhető el, próbáld újra.';
    case 'deep-link':
      return 'A pénztárba a kosárból indulhatsz.';
  }
}
