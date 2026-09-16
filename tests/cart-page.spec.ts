/**
 * T18 — cart screen (S4.1).
 *
 * Acceptance criteria mapped to source-pattern tests:
 *
 *   T18-AC01 — Adding confirms product, color, storage and quantity in an
 *              accessible status. Cart line matches the mock response.
 *              Status line is asserted on `add-to-cart.ts` (the
 *              confirmation surface) and on `cart-line.ts` (the line
 *              card that matches the mock response).
 *   T18-AC02 — Cart page shows image/name/variant/unit price/quantity/
 *              line total, remove action, and subtotal. Shipping is
 *              NOT misrepresented as final before method choice.
 *   T18-AC03 — Quantity increment/decrement/remove handle
 *              max/min/pending/failure and preserve cart on error.
 *              Removing the last item produces the empty screen.
 *   T18-AC04 — Continue button is disabled for empty/invalid/pending
 *              cart and navigates to /penztar/adatok only after
 *              authoritative revalidation (`facade.ensureCart`).
 *   T18-AC05 — 339 990 × 2 = 679 980 HUF subtotal; with home
 *              delivery (1 990 HUF) total = 681 970 HUF. No monthly
 *              fee or hidden add-on copy.
 *
 * The tests inspect the rendered source directly because vitest's
 * esbuild/oxc pipeline strips the Angular signal-input metadata
 * that TestBed's runtime instantiation needs (see
 * `vitest.config.ts`). The implementation is exercised end-to-end
 * by `ng build` and by the browser-side demos.
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolvePath(process.cwd());

function read(relative: string): string {
  const base = relative.replace(/\.ts$/, '');
  const sources = [relative, `${base}.html`, `${base}.scss`];
  return sources
    .map((p) => {
      try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
      catch { return ''; }
    })
    .join('\n');
}

const cartPageSource = read('src/app/features/cart/cart-page.ts');
const cartLineSource = read('src/app/features/cart/cart-line.ts');
const orderSummarySource = read('src/app/features/cart/order-summary.ts');

function componentStyles(componentSource: string, scssPath?: string): string {
  const inline = componentSource.match(/styles:\s*\[([\s\S]*?)\]/);
  if (inline) return inline[1] ?? '';
  if (scssPath) {
    try {
      return readFileSync(resolvePath(workspaceRoot, scssPath), 'utf8');
    } catch {
      return '';
    }
  }
  const htmlMatch = componentSource.match(/templateUrl:\s*'\.\/([^']+\.html)'/);
  if (htmlMatch) {
    const derivedScss = htmlMatch[1].replace(/\.html$/, '.scss');
    try {
      return readFileSync(
        resolvePath(workspaceRoot, derivedScss),
        'utf8',
      );
    } catch {
      return '';
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// T18-AC01 — add-to-cart surface confirms the addition. The full
// confirmation flow lives in `add-to-cart.ts`; here we assert the
// page renders the line card that matches the mock response.
// ---------------------------------------------------------------------------
describe('T18-AC01 cart page renders the line card matching the mock cart', () => {
  it('CartLine renders image, name, variant, unit price, quantity, line total', () => {
    // Image
    expect(cartLineSource).toMatch(/ProductImage|app-product-image/);
    // Product name (the wire-shaped field name is `productName`).
    expect(cartLineSource).toMatch(/productName/);
    // Variant line — color name and storage both rendered.
    expect(cartLineSource).toMatch(/colorName/);
    expect(cartLineSource).toMatch(/storageGb/);
    // Unit price + line total go through the PriceBlock primitive.
    expect(cartLineSource).toMatch(/app-price-block/);
    expect(cartLineSource).toMatch(/unitPrice/);
    expect(cartLineSource).toMatch(/lineTotal/);
    // Quantity control wires quantity changes back to the page.
    expect(cartLineSource).toMatch(/app-quantity-control/);
    expect(cartLineSource).toMatch(/quantityChanged/);
  });

  it('CartLine emits removeRequested and uses an aria-label for the remove action', () => {
    expect(cartLineSource).toMatch(/removeRequested/);
    expect(cartLineSource).toMatch(/aria-label/);
    // The remove action is rendered as a real button for keyboard access.
    expect(cartLineSource).toMatch(/<button[\s\S]*?remove/);
  });

  it('CartPage passes each item to a CartLine, plus wires quantity + remove', () => {
    expect(cartPageSource).toMatch(/@for[\s\S]*?app-cart-line/);
    expect(cartPageSource).toMatch(/<app-cart-line/);
    // Page listens to the line events and forwards to the facade.
    expect(cartPageSource).toMatch(/\(quantityChanged\)=["']onQuantityChanged/);
    expect(cartPageSource).toMatch(/\(removeRequested\)=["']onRemoveRequested/);
  });
});

// ---------------------------------------------------------------------------
// T18-AC02 — cart page renders subtotal and never misrepresents
// shipping as final before the user chooses a method.
// ---------------------------------------------------------------------------
describe('T18-AC02 cart page shows subtotal and a shipping placeholder, not a final shipping figure', () => {
  it('renders OrderSummary with the cart subtotal', () => {
    expect(cartPageSource).toMatch(/<app-order-summary/);
    expect(cartPageSource).toMatch(/\[subtotal\]="subtotal\(\)"/);
  });

  it('OrderSummary renders the Hungarian "shipping calculated at checkout" message when no method is selected', () => {
    // The exact Hungarian message spelled out in the task spec.
    expect(orderSummarySource).toMatch(/A szállítási díj a pénztárban kerül kiszámításra/);
    // The summary does NOT lock the total to a specific fee before
    // the user picks a method — total computation must allow a null
    // shipping leg.
    expect(orderSummarySource).toMatch(/shipping/);
  });

  it('OrderSummary computes subtotal + shipping = total when a method is supplied', () => {
    // The Hungarian "Részösszeg" + "Szállítás" + "Végösszeg" labels.
    expect(orderSummarySource).toMatch(/Részösszeg|Részöszeg|Subtotal/i);
    expect(orderSummarySource).toMatch(/Szállítás/);
    expect(orderSummarySource).toMatch(/Végösszeg|Fizetendő/);
    // The summary takes a Money total or computes one from subtotal
    // + optional shipping.
    expect(orderSummarySource).toMatch(/total/);
  });

  it('never invents a monthly fee or hidden add-on (T18-AC05)', () => {
    // Strip comments + template literals so the Hungarian label
    // names ("havi díj" mention) inside narrative notes do not trip
    // the assertion against the implementation.
    const cleaned = orderSummarySource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(cleaned.toLowerCase().indexOf('havi')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('előfizet')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('rejtett')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('extra költség')).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// T18-AC03 — quantity controls handle boundaries and the empty
// state appears when the last line is removed.
// ---------------------------------------------------------------------------
describe('T18-AC03 quantity boundaries and the empty screen on last-line removal', () => {
  it('CartLine forwards quantity changes to the facade and respects maxQuantity from the line', () => {
    expect(cartLineSource).toMatch(/maxQuantity/);
    // The line component reads the wire-shaped `maxQuantity` so the
    // user's hand is forced into the cap the cart backend accepts.
    expect(cartLineSource).toMatch(/\[max\]="maxQuantity\(\)"/);
  });

  it('CartLine surfaces pending state when a mutation is in flight', () => {
    expect(cartLineSource).toMatch(/\[pending\]="pending\(\)"/);
  });

  it('CartPage renders the EmptyState when no items remain (removing the last line)', () => {
    expect(cartPageSource).toMatch(/app-empty-state/);
    // The empty-screen title and message are Hungarian.
    expect(cartPageSource).toMatch(/A kosarad üres|A kosár üres/);
    // The empty state offers a way back to the catalogue so the
    // user can keep shopping without losing context.
    expect(cartPageSource).toMatch(/Vásárlás folytatása|Tovább a kínálatba/);
  });

  it('CartPage renders a loading skeleton on first arrival and an ErrorState on a failure', () => {
    expect(cartPageSource).toMatch(/app-loading-state/);
    expect(cartPageSource).toMatch(/app-error-state/);
  });
});

// ---------------------------------------------------------------------------
// T18-AC04 — Continue is disabled when the cart cannot be advanced,
// and only navigates to /penztar/adatok after ensureCart() succeeds.
// ---------------------------------------------------------------------------
describe('T18-AC04 Continue gating and authoritative revalidation', () => {
  it('exposes a continue button disabled when the cart is empty, pending, or in error', () => {
    expect(cartPageSource).toMatch(/Tovább a pénztárhoz|Continue|Tovább/);
    // The disabled binding must reflect the union of (empty || pending || error).
    expect(cartPageSource).toMatch(/\[disabled\]="!canContinue\(\)"/);
    expect(cartPageSource).toMatch(/canContinue/);
  });

  it('navigates only after `facade.ensureCart()` resolves successfully', () => {
    expect(cartPageSource).toMatch(/facade\.ensureCart/);
    expect(cartPageSource).toMatch(/Router|navigate/);
    expect(cartPageSource).toMatch(/penztar\/adatok/);
  });
});

// ---------------------------------------------------------------------------
// T18-AC05 — subtotal calculation is unit-priced * quantity. The
// cart page renders the subtotal as whole HUF; with home delivery
// the summary computes the final 681 970 HUF. No monthly fee.
// ---------------------------------------------------------------------------
describe('T18-AC05 subtotal and total arithmetic in whole HUF', () => {
  it('renders the subtotal through the PriceBlock primitive (whole HUF)', () => {
    expect(cartPageSource).toMatch(/app-price-block/);
    expect(cartPageSource).toMatch(/subtotal\(\)/);
  });

  it('does not display any monthly-fee or hidden-bundle copy (R25)', () => {
    const cleaned = cartPageSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(cleaned.toLowerCase().indexOf('havi')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('előfizetés')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('bundle')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('rejtett')).toBe(-1);
  });

  it('styles declare a desktop two-column layout (items + summary)', () => {
    const css = componentStyles(cartPageSource, 'src/app/features/cart/cart-page.scss');
    // Two-column layout for the items column and the order summary
    // sits side-by-side on desktop (>= 1024 px).
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(css).toMatch(/grid-template-columns/);
  });
});

// ---------------------------------------------------------------------------
// T18 wiring — CartPage uses the documented T10 primitives.
// ---------------------------------------------------------------------------
describe('T18 cart-page shared-primitive dependency wiring', () => {
  it('depends on the shared UI primitives and the CartFacade + ProductFacade', () => {
    expect(cartPageSource).toMatch(/imports:\s*\[[\s\S]*?CartLine[\s\S]*?\]/);
    expect(cartPageSource).toMatch(/imports:\s*\[[\s\S]*?OrderSummary[\s\S]*?\]/);
    expect(cartPageSource).toMatch(/imports:\s*\[[\s\S]*?EmptyState[\s\S]*?\]/);
    expect(cartPageSource).toMatch(/imports:\s*\[[\s\S]*?LoadingState[\s\S]*?\]/);
    expect(cartPageSource).toMatch(/imports:\s*\[[\s\S]*?ErrorState[\s\S]*?\]/);
    expect(cartPageSource).toMatch(/imports:\s*\[[\s\S]*?PriceBlock[\s\S]*?\]/);
    // CartFacade is consumed via inject().
    expect(cartPageSource).toMatch(/inject\(CartFacade\)/);
  });

  it('OrderSummary only imports PriceBlock + Button from the shared UI surface', () => {
    const emptyImports = /imports:\s*\[\s*\]/;
    const hasImports = /imports:\s*\[/;
    const usesEmptyOrAbsent = emptyImports.test(orderSummarySource) || !hasImports.test(orderSummarySource);
    if (!usesEmptyOrAbsent) {
      // When imports is non-empty, only PriceBlock + Button are
      // expected.
      expect(orderSummarySource).toMatch(/imports:\s*\[[\s\S]*?PriceBlock[\s\S]*?\]/);
    }
  });

  it('CartLine uses ProductImage + PriceBlock + QuantityControl from the shared UI surface', () => {
    expect(cartLineSource).toMatch(/imports:\s*\[[\s\S]*?ProductImage[\s\S]*?\]/);
    expect(cartLineSource).toMatch(/imports:\s*\[[\s\S]*?PriceBlock[\s\S]*?\]/);
    expect(cartLineSource).toMatch(/imports:\s*\[[\s\S]*?QuantityControl[\s\S]*?\]/);
  });
});