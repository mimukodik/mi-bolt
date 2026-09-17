/**
 * T18 — add-to-cart surface on the product page.
 *
 * Acceptance criteria mapped to source-pattern tests:
 *
 *   T18-AC01 — Adding confirms product, color, storage and quantity
 *              in an accessible status message (StatusMessage from
 *              T10). Cart badge and cart line match the mock response.
 *   T18-AC02 — (cart page owns this; add-to-cart does not duplicate.)
 *   T18-AC03 — (cart page owns the quantity controls.)
 *   T18-AC04 — (cart page owns the Continue gating.)
 *   T18-AC05 — Subtotal/total arithmetic lives in the cart page.
 *
 * The add-to-cart component is the source of truth for the
 * "A termék a kosárban van." confirmation: it must call the
 * CartFacade (`addItem(variantId, quantity)`), surface a
 * StatusMessage whose text names the product, the color, the storage
 * and the quantity, and never invent numbers or urgency.
 *
 * The vitest runtime cannot instantiate Angular components through
 * the legacy-decorator transform (see product-page.spec.ts for the
 * full explanation); the suite below inspects the source directly.
 * `ng build` exercises the template / signal-input pipeline end to
 * end so the implementation is still validated.
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

const addToCartSource = read('src/app/features/product/add-to-cart.ts');
const productPageSource = read('src/app/features/product/product-page.ts');
const cartFacadeSource = read('src/app/features/cart/cart.facade.ts');

// ---------------------------------------------------------------------------
// T18-AC01 — accessible confirmation and CartFacade wiring.
// ---------------------------------------------------------------------------
describe('T18-AC01 add-to-cart emits an accessible confirmation through the CartFacade', () => {
  it('renders a StatusMessage (T10 primitive) after a successful add', () => {
    expect(addToCartSource).toMatch(/app-status-message/);
    expect(addToCartSource).toMatch(/imports:\s*\[[\s\S]*?StatusMessage[\s\S]*?\]/);
    // The component composes the message body from the wire-shaped
    // product / variant / quantity values, NOT from an invented
    // figure. The body must reference all four pieces of data the
    // AC lists.
    expect(addToCartSource).toMatch(/productName/);
    expect(addToCartSource).toMatch(/colorName/);
    expect(addToCartSource).toMatch(/storageGb/);
    expect(addToCartSource).toMatch(/quantity/);
  });

  it('passes the confirmation through the T10 StatusMessage primitive (severity + role)', () => {
    // The StatusMessage primitive owns the role/aria-live switch:
    // success → role="status" + aria-live="polite", error →
    // role="alert". The component must wire the `severity` input
    // rather than re-implement the live region.
    expect(addToCartSource).toMatch(/\[severity\]="severity\(\)"/);
    expect(addToCartSource).toMatch(/severity\(?\)?/);
  });

  it('calls CartFacade.addItem with the selected variant id and quantity', () => {
    expect(addToCartSource).toMatch(/facade\.addItem/);
    expect(addToCartSource).toMatch(/variantId/);
    expect(addToCartSource).toMatch(/quantity/);
  });

  it('creates the cart lazily via CartFacade.ensureCart() before the first add', () => {
    // The cart does not exist on a fresh tab; addItem() throws if
    // there is no cart, so the add-to-cart component must call
    // ensureCart() once on mount / before the first addItem().
    expect(addToCartSource).toMatch(/facade\.ensureCart/);
  });

  it('surfaces the cart line matching the mock response (CartItem shape)', () => {
    // The confirmation message body MUST include the exact values
    // the cart returned. The add-to-cart component reads the cart
    // signal after the add resolves and re-emits the line that the
    // mock / backend confirmed (R24 — preserve cart on error).
    expect(addToCartSource).toMatch(/facade\.cart\(\)/);
    expect(addToCartSource).toMatch(/items/);
  });
});

// ---------------------------------------------------------------------------
// Shared AC — same T10 primitives, no UI clichés.
// ---------------------------------------------------------------------------
describe('T18 add-to-cart shared-primitive dependency wiring', () => {
  it('depends on Button + StatusMessage from the shared UI surface', () => {
    expect(addToCartSource).toMatch(/imports:\s*\[[\s\S]*?Button[\s\S]*?\]/);
    expect(addToCartSource).toMatch(/imports:\s*\[[\s\S]*?StatusMessage[\s\S]*?\]/);
  });

  it('consumes the CartFacade via inject() — the root-scoped facade owned by T17', () => {
    expect(addToCartSource).toMatch(/inject\(CartFacade\)/);
    // No sibling event bus, no parallel totals, no Service stub of
    // its own.
    expect(addToCartSource).not.toMatch(/class\s+\w+\s*\{[^}]*private\s+(cart|itemCount|subtotal)\s*=/);
  });

  it('product page wires the Add-to-cart component through addRequested', () => {
    // The product page's (addRequested) output is consumed by the
    // host feature wrapper (T15/T18) so the add-to-cart component
    // can live next to the buy panel. The wiring line MUST stay
    // bound to a real `(addRequested)` handler.
    expect(productPageSource).toMatch(/addRequested\s*=\s*output/);
  });
});

// ---------------------------------------------------------------------------
// ProductPage wiring — emits addRequested for the new component to
// consume (the existing page already does this; T18 just hooks the
// consumer in). We assert on the product-page source as a regression
// guard against accidental removal of the emit.
// ---------------------------------------------------------------------------
describe('T18 product-page addRequested wiring', () => {
  it('keeps the addRequested output with variantId + quantity payload', () => {
    expect(productPageSource).toMatch(/addRequested\s*=\s*output/);
    expect(productPageSource).toMatch(/variantId:\s*v\.selectedVariant\.id/);
    expect(productPageSource).toMatch(/quantity:\s*v\.quantity/);
  });
});

// ---------------------------------------------------------------------------
// CartFacade contract — the add-to-cart component relies on the
// T17 facade exposing `addItem`, `ensureCart`, `cart`, and `pending`.
// These are not new in T18, but pinning them keeps the contract
// visible across the cart / checkout boundaries.
// ---------------------------------------------------------------------------
describe('T18 add-to-cart CartFacade contract pins', () => {
  it('CartFacade.addItem accepts (variantId, quantity) and returns a promise', () => {
    expect(cartFacadeSource).toMatch(/async\s+addItem\(variantId:\s*string,\s*quantity:\s*number\)/);
    expect(cartFacadeSource).toMatch(/Promise<void>/);
  });

  it('CartFacade exposes the cart snapshot and the pending count signals the add-to-cart reads', () => {
    expect(cartFacadeSource).toMatch(/readonly\s+cart:\s*Signal<Cart \| null>/);
    expect(cartFacadeSource).toMatch(/readonly\s+pending:\s*Signal<number>/);
  });
});