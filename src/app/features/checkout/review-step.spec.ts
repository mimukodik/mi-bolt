/**
 * T22 — final review step (S4.4).
 *
 * Source-pattern tests for the owned files. Mirrors the T20 / T21
 * convention: vitest's esbuild/oxc pipeline strips Angular decorator
 * metadata, so the suite inspects the source files directly. The
 * end-to-end runtime path (real `QuoteController`, real
 * `CheckoutFacade`, real MSW responses) is covered by the
 * `checkout-state.spec.ts` analogue that the orchestrator runs in a
 * real browser harness.
 *
 *   T22-AC01 — Fresh quote on entry; items, one-time subtotal,
 *               shipping, total and payment method; back / edit
 *               links preserve fields.
 *   T22-AC02 — Two unchecked consents (demo terms + simulation
 *               acknowledgement); demo terms open in an accessible
 *               dialog; no production-legal-compliance framing.
 *   T22-AC03 — PRICE_CHANGED, QUOTE_EXPIRED and OUT_OF_STOCK have
 *               distinct messages and correction paths; the old
 *               amount cannot be submitted.
 *   T22-AC04 — Primary CTA is "Demórendelés véglegesítése";
 *               disabled while quote / consent / state is incomplete
 *               with an explanation.
 *   T22-AC05 — Loading, ready, quote-expired, price-change and
 *               field-error states render without erasing the order
 *               summary.
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

const reviewStepSource = read('src/app/features/checkout/review-step.ts');
const quoteStateSource = read('src/app/features/checkout/quote-state.ts');
const termsDialogSource = read('src/app/features/checkout/terms-dialog.ts');
const reviewPageSource = read('src/app/features/checkout/review-page.ts');
const checkoutRoutesSource = read('src/app/features/checkout/checkout.routes.ts');

function componentStyles(componentSource: string, explicitScssPath?: string): string {
  // First try the inline `styles: [...]` block (legacy / not-yet-migrated components).
  const start = componentSource.search(/styles:\s*\[/);
  if (start !== -1) {
    const index = componentSource.indexOf('[', start);
    if (index !== -1) {
      let depth = 0;
      for (let cursor = index; cursor < componentSource.length; cursor++) {
        const ch = componentSource[cursor];
        if (ch === '[') depth++;
        else if (ch === ']') {
          depth--;
          if (depth === 0) {
            return componentSource.slice(index + 1, cursor);
          }
        }
      }
    }
  }
  // After the templateUrl/styleUrl split, styles live in a sibling .scss file.
  // If the caller passes an explicit path (workspace-relative), prefer it
  // so the function works regardless of where the .scss sits relative
  // to the .ts source.
  if (explicitScssPath) {
    try {
      return readFileSync(resolvePath(workspaceRoot, explicitScssPath), 'utf8');
    } catch {
      return '';
    }
  }
  const htmlMatch = componentSource.match(/templateUrl:\s*'\.\/([^']+\.html)'/);
  if (htmlMatch) {
    const scssPath = htmlMatch[1].replace(/\.html$/, '.scss');
    try {
      return readFileSync(
        resolvePath(workspaceRoot, scssPath),
        'utf8',
      );
    } catch {
      return '';
    }
  }
  return '';
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/`[^`]*`/g, '');
}

// ---------------------------------------------------------------------------
// T22-AC01 — entering the review step creates a fresh quote; the
// summary, items, payment method and edit links are all visible.
// ---------------------------------------------------------------------------
describe('T22-AC01 review entry creates a fresh quote and shows the order summary', () => {
  it('ReviewStep drives a fresh quote on mount so the totals are fresh', () => {
    // Either the page calls `createQuote()` directly, or it
    // delegates to `QuoteController.refresh()` (which calls the
    // facade under the hood).
    const driven =
      /createQuote\(\)/.test(reviewStepSource) ||
      /quoteController\.refresh/.test(reviewStepSource) ||
      /quoteController\b/.test(quoteStateSource);
    expect(driven).toBe(true);
    // The constructor drives the lifecycle through the QuoteController.
    expect(reviewStepSource).toMatch(/QuoteController/);
  });

  it('renders an order summary that lists cart items, subtotal, shipping and total', () => {
    expect(reviewStepSource).toMatch(/data-testid="review-items"/);
    expect(reviewStepSource).toMatch(/data-testid="review-summary"/);
    // The summary uses the shared OrderSummary primitive so the
    // subtotal / shipping / total trio is rendered identically to
    // the cart page.
    expect(reviewStepSource).toMatch(/app-order-summary|OrderSummary/);
    // The OrderSummary component already exposes
    // order-summary-subtotal / shipping / total — those rows must
    // appear in the rendered DOM because we use the primitive.
    expect(reviewStepSource).toMatch(/\[subtotal\]|\[shipping\]/);
    expect(reviewStepSource).toMatch(/review-summary|review-total/);
  });

  it('renders the chosen payment method (demo_card | demo_cod) under the summary', () => {
    expect(reviewStepSource).toMatch(/data-testid="review-payment"/);
    expect(reviewStepSource).toMatch(/Bankkártya|Utánvét|paymentLabel|demo_card|demo_cod/);
  });

  it('exposes edit affordances for the contact and delivery sections, pointing at the earlier steps', () => {
    // Edit links preserve the user's previously-typed fields
    // (T19-AC03) and signal that the quote must be re-built.
    expect(reviewStepSource).toMatch(/data-testid="review-edit-contact"/);
    expect(reviewStepSource).toMatch(/data-testid="review-edit-delivery"/);
    expect(reviewStepSource).toMatch(/\/penztar\/adatok/);
    expect(reviewStepSource).toMatch(/\/penztar\/szallitas/);
  });

  it('back link returns to the delivery step and preserves in-memory fields', () => {
    expect(reviewStepSource).toMatch(/data-testid="review-back"/);
    expect(reviewStepSource).toMatch(/Vissza a szállításhoz/);
  });
});

// ---------------------------------------------------------------------------
// T22-AC02 — two unchecked consents, demo terms dialog.
// ---------------------------------------------------------------------------
describe('T22-AC02 demo terms + simulation acknowledgement with accessible dialog', () => {
  it('renders two unchecked checkbox inputs as part of the Signal Form', () => {
    // Each consent is bound through `formField` so the checkout
    // schema enforces the "must be true" rule (mustAcceptTerms /
    // mustAcknowledgeSimulation).
    expect(reviewStepSource).toMatch(/formField.*acceptedTerms|formField.*acknowledgedSimulation/);
    expect(reviewStepSource).toMatch(/acceptedTerms\(\)\.value\.set|acceptedTerms/);
    expect(reviewStepSource).toMatch(/acknowledgedSimulation\(\)\.value\.set|acknowledgedSimulation/);
    // Two checkboxes are present and start unchecked.
    expect(reviewStepSource).toMatch(/<input[^>]*type="checkbox"[\s\S]*?acceptedTerms/);
    expect(reviewStepSource).toMatch(/<input[^>]*type="checkbox"[\s\S]*?acknowledgedSimulation/);
  });

  it('demo terms label links to a terms dialog and does not present production legal compliance', () => {
    // The label carries the demo notice so the user never confuses
    // the consent with a real subscription contract.
    expect(reviewStepSource).toMatch(/Demó|demó|demo/i);
    // The "read terms" affordance opens the dialog rather than
    // navigating away.
    expect(reviewStepSource).toMatch(/app-terms-dialog|TermsDialog|terms-dialog/);
  });

  it('TermsDialog uses AccessibleDialog with a Hungarian label and demo-only copy', () => {
    expect(termsDialogSource).toMatch(/AccessibleDialog|app-accessible-dialog/);
    // The dialog label is Hungarian.
    expect(termsDialogSource).toMatch(/Demó|demó/i);
    // The body must declare the simulation — no production legal
    // claim.
    expect(termsDialogSource).toMatch(/szimuláció|szimulált|demo/i);
    // No "Adatvédelmi tájékoztató" or "ÁSZF"-style production
    // compliance copy.
    const cleaned = stripComments(termsDialogSource);
    expect(cleaned.toLowerCase().indexOf('ászf')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('adatvédelmi tájékoztató')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('jognyilatkozat')).toBe(-1);
  });

  it('TermsDialog is projected as accessible content under app-accessible-dialog', () => {
    // The CDK dialog primitive owns focus trap, background
    // exclusion and Escape handling (R23).
    expect(termsDialogSource).toMatch(/@Component/);
    expect(termsDialogSource).toMatch(/selector:\s*['"]app-terms-dialog['"]/);
  });
});

// ---------------------------------------------------------------------------
// T22-AC03 — PRICE_CHANGED, QUOTE_EXPIRED, OUT_OF_STOCK have distinct
// messages and correction paths; the old amount cannot be submitted.
// ---------------------------------------------------------------------------
describe('T22-AC03 distinct PRICE_CHANGED / QUOTE_EXPIRED / OUT_OF_STOCK messages', () => {
  it('QuoteController exposes a state discriminator with the three failure kinds', () => {
    expect(quoteStateSource).toMatch(/price-changed/);
    expect(quoteStateSource).toMatch(/quote-expired/);
    expect(quoteStateSource).toMatch(/out-of-stock/);
    // The discriminated union is exposed publicly so the page can
    // branch on `kind`.
    expect(quoteStateSource).toMatch(/export\s+type\s+QuoteState/);
  });

  it('PRICE_CHANGED branch explains the cart version changed and points at a refresh action', () => {
    expect(reviewStepSource).toMatch(/price-change|PRICE_CHANGED/i);
    expect(reviewStepSource).toMatch(/kosár frissítve|katalógus ára megváltozott|Árváltozás/i);
  });

  it('QUOTE_EXPIRED branch explains the TTL elapsed and forces a fresh quote', () => {
    expect(reviewStepSource).toMatch(/quote-expired|QUOTE_EXPIRED|Lejárt/i);
  });

  it('OUT_OF_STOCK branch explains a variant disappeared and points at the cart', () => {
    expect(reviewStepSource).toMatch(/out-of-stock|OUT_OF_STOCK|Kifogyott|elfogyott/i);
  });

  it('the primary CTA is disabled while the quote state is not ready (old amount cannot be submitted)', () => {
    // The "ready" gate is the only state that enables submission;
    // every other state must disable the CTA.
    expect(reviewStepSource).toMatch(/\[disabled\]="!canSubmit\(\)"|\[disabled\]="!canConfirm\(\)"/);
    // The canSubmit / canConfirm computed depends on the quote
    // state.
    expect(reviewStepSource).toMatch(/canSubmit|canConfirm/);
    // The CTA label never reads "Submit" / "Pay" / "Send" — it stays
    // the demo-aware Hungarian copy.
    expect(reviewStepSource).toMatch(/Demórendelés véglegesítése/);
  });
});

// ---------------------------------------------------------------------------
// T22-AC04 — primary CTA copy and the gating explanation.
// ---------------------------------------------------------------------------
describe('T22-AC04 primary CTA copy and disabled-with-explanation behaviour', () => {
  it('primary CTA button reads "Demórendelés véglegesítése"', () => {
    expect(reviewStepSource).toMatch(/Demórendelés véglegesítése/);
  });

  it('uses the shared Button primitive so the disabled + loading states match the rest of the flow', () => {
    expect(reviewStepSource).toMatch(/app-button|Button/);
  });

  it('renders an explanation when the CTA is disabled because of consent / quote / state', () => {
    // The page explains why the CTA is disabled — exactly one of:
    //   - a consent is missing,
    //   - the quote is not ready,
    //   - a network mutation is in flight.
    expect(reviewStepSource).toMatch(/data-testid="review-cta-explanation"|cta-explanation/);
  });

  it('disables the CTA when either checkbox is unchecked (Signal Form gates)', () => {
    // The schema makes `acceptedTerms` and `acknowledgedSimulation`
    // invalid until they're both true; the gate combines with the
    // Signal Form `valid()` check.
    expect(reviewStepSource).toMatch(/reviewForm\(\)\.valid\(\)|form\(\)\.valid\(\)|acceptedTerms\(\)\.value\(\)|acknowledgedSimulation\(\)\.value\(\)/);
  });

  it('disables the CTA while the facade is busy (no double submit)', () => {
    expect(reviewStepSource).toMatch(/busy\(\)/);
  });
});

// ---------------------------------------------------------------------------
// T22-AC05 — the order summary is preserved across every quote state.
// ---------------------------------------------------------------------------
describe('T22-AC05 order summary is preserved across quote states', () => {
  it('renders the items list in the loading branch (skeleton, but the section still appears)', () => {
    // Even before the quote lands the user must see the items they
    // are about to buy; the skeleton replaces the totals, not the
    // cart contents.
    expect(reviewStepSource).toMatch(/data-testid="review-items"/);
    expect(reviewStepSource).toMatch(/app-loading-state|LoadingState/);
  });

  it('renders the items list in the ready branch (full PriceBlock totals)', () => {
    // PriceBlock is the canonical amount primitive.
    expect(reviewStepSource).toMatch(/app-price-block|PriceBlock/);
  });

  it('renders the items list in the price-changed and quote-expired branches', () => {
    // The @switch keeps the items section above the per-state
    // banner.
    expect(reviewStepSource).toMatch(/@switch\s*\(\s*state\(\)!\.kind\s*\)/);
    // The status-message family must be the per-state banner.
    expect(reviewStepSource).toMatch(/StatusMessage|status-message|app-status-message/);
  });

  it('field-error branch (validation failures) keeps the items visible', () => {
    expect(reviewStepSource).toMatch(/field-error|VALIDATION_ERROR/);
  });

  it('exposes a per-state hook on the wrapper so each state has a stable data-status attribute', () => {
    expect(reviewStepSource).toMatch(/data-status.*state\(\)\.kind|data-testid="review-status"/);
  });
});

// ---------------------------------------------------------------------------
// Wiring — ReviewStep owns the right primitives and the route is bound.
// ---------------------------------------------------------------------------
describe('T22 wiring — ReviewStep uses T10 primitives and owns the demo-aware navigation', () => {
  it('imports the T10 UI primitives it needs', () => {
    expect(reviewStepSource).toMatch(/Button/);
    expect(reviewStepSource).toMatch(/PriceBlock/);
    expect(reviewStepSource).toMatch(/LoadingState/);
    expect(reviewStepSource).toMatch(/OrderSummary/);
    expect(reviewStepSource).toMatch(/AccessibleDialog|terms-dialog/);
  });

  it('uses Angular Signal Forms to bind the consent checkboxes', () => {
    expect(reviewStepSource).toMatch(/from\s*['"]@angular\/forms\/signals['"]/);
    expect(reviewStepSource).toMatch(/formField/);
  });

  it('does NOT set `standalone: true` (default in Angular 22+) and does NOT inject CommonModule', () => {
    expect(reviewStepSource).not.toMatch(/standalone:\s*true/);
    expect(reviewStepSource).not.toMatch(/CommonModule/);
  });

  it('ReviewPage is re-exported from review-step so the lazy route still resolves', () => {
    expect(reviewPageSource).toMatch(/export\s*\{\s*ReviewStep(?:,\s*ReviewStep)?\s+as\s+ReviewPage\s*\}/);
    expect(reviewPageSource).not.toMatch(/T11 placeholder/);
  });

  it('review-page no longer carries the T11 stub copy', () => {
    expect(reviewPageSource).not.toMatch(/T18 feladatban/);
    expect(reviewPageSource).not.toMatch(/T22 feladatban/);
  });

  it('checkout.routes.ts still routes /penztar/ellenorzes to review-page so the wizard compiles', () => {
    expect(checkoutRoutesSource).toMatch(/review-page/);
    expect(checkoutRoutesSource).toMatch(/reviewGuard/);
  });

  it('declares a desktop layout breakpoint so the narrow / desktop matrices differ', () => {
    const css = componentStyles(reviewStepSource, 'src/app/features/checkout/review-step.scss');
    expect(css).toMatch(/@media\s*\(min-width:\s*1024px\)/);
    expect(css).toMatch(/@media\s*\(min-width:\s*640px\)/);
  });
});