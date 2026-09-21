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
export function navigationReasonMessage(reason: string): string | null {
  switch (reason) {
    case 'incomplete':
      return 'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.';
    case 'empty-cart':
      return 'A kosarad üres, ezért ide irányítottunk.';
    case 'deep-link':
      return 'A pénztárba a kosárból indulhatsz.';
    case 'reload':
      return 'Az oldal újratöltése után innen folytathatod.';
    default:
      return null;
  }
}
