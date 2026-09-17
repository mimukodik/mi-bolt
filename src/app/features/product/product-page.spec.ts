/**
 * T16 — Product detail page (S3).
 *
 * Acceptance criteria mapped to source-pattern tests:
 *
 *   T16-AC01 — desktop >= 1024 px uses a 7/5 column gallery/buy
 *              layout with a 24 px gap; < 1024 px stacks gallery,
 *              configuration and specifications vertically.
 *              Verified by reading the page stylesheet and the
 *              breakpoint block.
 *   T16-AC02 — gallery exposes prev/next, thumbnail, image count,
 *              zoom dialog, keyboard control and image-error fallback
 *              via the shared primitives (covered in
 *              `product-gallery.spec.ts`).
 *   T16-AC03 — color and storage selectors render label/checkmark
 *              semantic selection; spec groups use a disclosure
 *              pattern with aria-expanded.
 *   T16-AC04 — mobile purchase rail carries price + primary CTA with
 *              safe-area padding, does not obscure keyboard focus
 *              and respects sticky positioning.
 *   T16-AC05 — baseline page has no 3D script and no inactive fake
 *              3D button.
 *
 * The vitest runtime cannot instantiate Angular components through
 * the legacy-decorator transform the project ships (styleUrl
 * resolution needs the Angular CLI's resource plugin; the legacy
 * transpile strips signal-input metadata). The tests below
 * therefore inspect the rendered source directly. The
 * implementation is exercised end-to-end by `ng build` (which runs
 * the real Angular compiler) and by the browser-side demos.
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

const productPageSource = read('src/app/features/product/product-page.ts');
const variantSelectorSource = read('src/app/features/product/variant-selector.ts');
const specAccordionSource = read('src/app/features/product/specification-accordion.ts');
const productGallerySource = read('src/app/features/product/product-gallery.ts');

/** Returns the joined inline-styles block of a component, or '' when
 *  the component uses an external styleUrl (the cli build bundles it
 *  and the runtime serves it). */
function componentStyles(componentSource: string, explicitScssPath?: string): string {
  const inline = componentSource.match(/styles:\s*\[([\s\S]*?)\]/);
  if (inline) return inline[1] ?? '';
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

// ---------------------------------------------------------------------------
// T16-AC01 — desktop 7/5 columns + 24 px gap; < 1024 stacks.
// ---------------------------------------------------------------------------
describe('T16-AC01 product-page responsive two-column layout', () => {
  it('desktop chrome declares a 7/5 column split with a 24px gap', () => {
    const css = componentStyles(productPageSource, 'src/app/features/product/product-page.scss');
    // 12-fraction grid (7 + 5 = 12) at >= 1024 px.
    expect(css).toMatch(/grid-template-columns:\s*minmax\(0,\s*7fr\)\s*minmax\(0,\s*5fr\)/);
    // 24 px gap -> tokens.css uses --space-6 for 24 px.
    expect(css).toMatch(/gap:\s*var\(--space-6\)/);
    // Single-column collapse below 1024 px.
    expect(css).toMatch(/@media\s*\(max-width:\s*1023px\)/);
  });
});

// ---------------------------------------------------------------------------
// T16-AC02 — gallery is mounted through the ProductGallery component
// (its own spec covers buttons/zoom/keyboard/error fallback).
// ---------------------------------------------------------------------------
describe('T16-AC02 product-page embeds the gallery primitive', () => {
  it('imports ProductGallery and mounts it in the buy-panel layout', () => {
    expect(productPageSource).toMatch(/imports:\s*\[[\s\S]*ProductGallery[\s\S]*\]/);
    expect(productPageSource).toMatch(/<app-product-gallery/);
    expect(productPageSource).toMatch(/\[images\]="gallery\(\)"/);
    // The gallery wires the active image back into the facade.
    expect(productPageSource).toMatch(/\(imageChange\)="onImageChange\(\$event\)"/);
  });
});

// ---------------------------------------------------------------------------
// T16-AC03 — color/storage selectors show label + checkmark; spec
// groups use a disclosure pattern with aria-expanded; gallery image
// and product name refer to the chosen variant.
// ---------------------------------------------------------------------------
describe('T16-AC03 product-page variant selection is semantically labelled', () => {
  it('VariantSelector renders color buttons with a textual label, swatch and checkmark for the chosen bucket', () => {
    // Textual color name is rendered, not just the swatch.
    expect(variantSelectorSource).toMatch(/option\.colorName/);
    // aria-pressed carries the selection state.
    expect(variantSelectorSource).toMatch(/aria-pressed/);
    // The checkmark glyph appears next to the selected option.
    expect(variantSelectorSource).toMatch(/class="check"/);
  });

  it('VariantSelector renders a textual label for every storage bucket', () => {
    expect(variantSelectorSource).toMatch(/option\.storageGb/);
    expect(variantSelectorSource).toMatch(/\{\{\s*option\.storageGb\s*\}\}\s*GB/);
    expect(variantSelectorSource).toMatch(/aria-pressed/);
  });

  it('SpecificationAccordion uses a disclosure pattern with aria-expanded', () => {
    expect(specAccordionSource).toMatch(/aria-expanded/);
    expect(specAccordionSource).toMatch(/aria-controls/);
    // The disclosure is a real button so keyboard users can activate it.
    expect(specAccordionSource).toMatch(/<button[\s\S]*aria-expanded/);
  });

  it('the visible product name on the page matches the loaded product (label/header reading)', () => {
    expect(productPageSource).toMatch(/class="name"/);
    expect(productPageSource).toMatch(/\{\{\s*productName\(\)\s*\}\}/);
  });

  it('the gallery image and the visible price refer to the chosen variant', () => {
    // Gallery images come from the selected variant's images array.
    expect(productPageSource).toMatch(/variant\.images\.map\(\(i\)/);
    // The buy panel renders the price through PriceBlock.
    expect(productPageSource).toMatch(/<app-price-block[\s\S]*?\[money\]="devicePrice\(\)"/);
  });
});

// ---------------------------------------------------------------------------
// T16-AC04 — mobile purchase rail with price + CTA + safe-area padding.
// ---------------------------------------------------------------------------
describe('T16-AC04 product-page mobile purchase rail', () => {
  it('declares safe-area padding and sticky positioning so the rail does not overlap content', () => {
    const css = componentStyles(productPageSource, 'src/app/features/product/product-page.scss');
    expect(css).toMatch(/safe-area-inset-bottom/);
    expect(css).toMatch(/position:\s*sticky/);
    // The page main has bottom padding so the sticky rail never
    // covers keyboard focus or page content (AC04 / R22).
    expect(css).toMatch(/padding-bottom:\s*calc\(env\(safe-area-inset-bottom\)\s*\+/);
  });

  it('mounts a sticky purchase rail with the price and the primary CTA', () => {
    expect(productPageSource).toMatch(/data-testid="purchase-rail"/);
    expect(productPageSource).toMatch(/data-testid="purchase-cta"/);
    // The rail contains a PriceBlock for the device price.
    expect(productPageSource).toMatch(/<app-price-block[\s\S]*?\[money\]="devicePrice\(\)"/);
  });

  it('emits addRequested with the chosen variant id and quantity through (addRequested)', () => {
    expect(productPageSource).toMatch(/addRequested\s*=\s*output/);
    expect(productPageSource).toMatch(/onAddToCart/);
    expect(productPageSource).toMatch(/variantId:\s*v\.selectedVariant\.id/);
    expect(productPageSource).toMatch(/quantity:\s*v\.quantity/);
  });
});

// ---------------------------------------------------------------------------
// T16-AC05 — no 3D, no fake 3D button.
// ---------------------------------------------------------------------------
describe('T16-AC05 product-page has no 3D surface', () => {
  it('does not import a 3D engine and does not render a fake 3D button', () => {
    // Strip comments + template literals so the header notes that
    // name-check themselves ("no three.js bundle") do not trip the
    // test against its own documentation.
    const code = productPageSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/three\.js/);
    expect(code).not.toMatch(/babylon/);
    expect(code).not.toMatch(/<canvas/);
    expect(code.toLowerCase().indexOf('3d')).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// Shared dependency wiring — the page must use the documented T10
// primitives. We assert via the imports block of the @Component
// decorator so the wiring remains in sync with the source.
// ---------------------------------------------------------------------------
describe('T16 shared-primitive dependency wiring', () => {
  it('ProductPage depends on ProductGallery, VariantSelector and SpecificationAccordion', () => {
    expect(productPageSource).toMatch(/imports:\s*\[[\s\S]*?ProductGallery[\s\S]*?\]/);
    expect(productPageSource).toMatch(/imports:\s*\[[\s\S]*?VariantSelector[\s\S]*?\]/);
    expect(productPageSource).toMatch(/imports:\s*\[[\s\S]*?SpecificationAccordion[\s\S]*?\]/);
  });

  it('ProductPage uses the documented T10 primitives through its gallery + buy panel', () => {
    // ProductPage wires Button, PriceBlock, QuantityControl, ErrorState
    // and LoadingState directly. AccessibleDialog + ProductImage are
    // reached through ProductGallery; that dependency is asserted in
    // the previous test.
    expect(productPageSource).toMatch(/imports:\s*\[[\s\S]*?Button[\s\S]*?\]/);
    expect(productPageSource).toMatch(/imports:\s*\[[\s\S]*?PriceBlock[\s\S]*?\]/);
    expect(productPageSource).toMatch(/imports:\s*\[[\s\S]*?QuantityControl[\s\S]*?\]/);
    expect(productPageSource).toMatch(/imports:\s*\[[\s\S]*?ErrorState[\s\S]*?\]/);
    expect(productPageSource).toMatch(/imports:\s*\[[\s\S]*?LoadingState[\s\S]*?\]/);
  });

  it('VariantSelector depends on nothing exotic — text/checkmark semantic selection', () => {
    // Pure presentation; standalone components without an explicit
    // `imports:` field are also valid (empty by default).
    const emptyImports = /imports:\s*\[\s*\]/;
    const hasImports = /imports:\s*\[/;
    const emptyOrAbsent = emptyImports.test(variantSelectorSource) || !hasImports.test(variantSelectorSource);
    expect(emptyOrAbsent).toBe(true);
  });

  it('SpecificationAccordion depends on nothing exotic — accessible disclosure only', () => {
    const emptyImports = /imports:\s*\[\s*\]/;
    const hasImports = /imports:\s*\[/;
    const emptyOrAbsent = emptyImports.test(specAccordionSource) || !hasImports.test(specAccordionSource);
    expect(emptyOrAbsent).toBe(true);
  });

  it('ProductGallery depends on AccessibleDialog and ProductImage (AC02 / AC05)', () => {
    expect(productGallerySource).toMatch(/imports:\s*\[[\s\S]*?AccessibleDialog[\s\S]*?\]/);
    expect(productGallerySource).toMatch(/imports:\s*\[[\s\S]*?ProductImage[\s\S]*?\]/);
  });
});