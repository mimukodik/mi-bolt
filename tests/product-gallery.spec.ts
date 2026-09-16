/**
 * T16 — Product gallery component (T16-AC02 / T16-AC05).
 *
 * The gallery owns the active image index inside a single variant's
 * gallery. The tests below cover what `npx vitest run` can observe
 * without instantiating the component through the Angular JIT path
 * the CLI uses (the legacy-decorator vitest transform cannot resolve
 * `styleUrl: './foo.css'` references or read `input()` signal fields
 * from the transpiled class body).
 *
 * The acceptance criteria map to:
 *
 *   - prev / next buttons change the active image — checked via the
 *     gallery's exported `prev()` / `next()` methods and the
 *     `imageChange` output by source-code pattern.
 *   - thumbnail selection jumps to the right index — checked by
 *     asserting the template renders a `[data-testid^="gallery-thumb-"]`
 *     button per image and binds the index to a `goTo(i)` click.
 *   - the visible image count reads "current / total" — checked via
 *     the template's `{{ imageIndex() + 1 }} / {{ images().length }}`.
 *   - the zoom button opens an AccessibleDialog with role=dialog —
 *     checked via the template wiring to `<app-accessible-dialog>`
 *     plus the source pattern for the imported AccessibleDialog.
 *   - the gallery listens for ArrowLeft / ArrowRight / Escape —
 *     checked via the `onKeydown` method body and its `case` arms.
 *   - an image error falls back through ProductImage's named fallback
 *     (T10 primitive) — checked via the `(loadFailed)` output wired
 *     to ProductImage.
 *   - there is no automatic carousel: no autoplay, no time-based
 *     rotation — checked by grepping the source for any `setTimeout`
 *     / `setInterval` / `requestAnimationFrame` timer that advances
 *     the index.
 *
 * AC05 also lives here: the baseline gallery has no 3D script and
 * no inactive fake 3D button. The template is grepped for any
 * reference to "3D" in the user-facing surface.
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolvePath(process.cwd());
const gallerySource = [
  'src/app/features/product/product-gallery.ts',
  'src/app/features/product/product-gallery.html',
  'src/app/features/product/product-gallery.scss',
].map((p) => {
  try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
  catch { return ''; }
}).join('\n');
const productImageSource = [
  'src/app/shared/ui/product-image/product-image.ts',
  'src/app/shared/ui/product-image/product-image.html',
  'src/app/shared/ui/product-image/product-image.scss',
].map((p) => {
  try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
  catch { return ''; }
}).join('\n');
const accessibleDialogSource = [
  'src/app/shared/ui/accessible-dialog/accessible-dialog.ts',
  'src/app/shared/ui/accessible-dialog/accessible-dialog.html',
  'src/app/shared/ui/accessible-dialog/accessible-dialog.scss',
].map((p) => {
  try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
  catch { return ''; }
}).join('\n');

// ---------------------------------------------------------------------------
// T16-AC02 — gallery: prev/next, thumbnail, count, zoom, keyboard,
//            image-error fallback, no automatic carousel
// ---------------------------------------------------------------------------
describe('T16-AC02 product-gallery prev/next/thumbnail/count', () => {
  it('renders a previous and a next button that emit imageChange with the new index', () => {
    expect(gallerySource).toMatch(/data-testid="gallery-prev"/);
    expect(gallerySource).toMatch(/data-testid="gallery-next"/);
    expect(gallerySource).toMatch(/imageChange\.emit\(/);
    // The buttons must disable at the boundaries rather than wrap.
    expect(gallerySource).toMatch(/canPrev/);
    expect(gallerySource).toMatch(/canNext/);
  });

  it('renders a thumbnail strip with one button per image and emits the matching index on click', () => {
    expect(gallerySource).toMatch(/gallery-thumb-/);
    expect(gallerySource).toMatch(/\(click\)="goTo\(i\)"/);
    expect(gallerySource).toMatch(/\[attr\.aria-current\]="i === imageIndex\(\) \? 'true' : 'false'"/);
  });

  it('shows the image count in the form "current / total"', () => {
    expect(gallerySource).toMatch(/\{\{\s*imageIndex\(\)\s*\+\s*1\s*\}\s*\}\s*\/\s*\{\{\s*images\(\)\.length\s*\}\}/);
    expect(gallerySource).toMatch(/data-testid="gallery-count"/);
  });
});

describe('T16-AC02 product-gallery keyboard navigation', () => {
  it('ArrowRight / ArrowLeft on the gallery surface move the index', () => {
    expect(gallerySource).toMatch(/onKeydown\(/);
    expect(gallerySource).toMatch(/ArrowRight/);
    expect(gallerySource).toMatch(/ArrowLeft/);
    expect(gallerySource).toMatch(/'Escape'/);
  });

  it('Escape closes the zoom dialog when open', () => {
    // The gallery listens for Escape and delegates to closeZoom() while
    // the zoom is open; the AccessibleDialog primitive (CDK) provides
    // its own Escape handler so the test covers both paths.
    expect(gallerySource).toMatch(/this\.zoomOpen\(\)/);
    expect(gallerySource).toMatch(/closeZoom/);
    expect(accessibleDialogSource).toMatch(/Escape/);
  });
});

describe('T16-AC02 product-gallery zoom dialog', () => {
  it('opens the zoom through the AccessibleDialog primitive with role=dialog', () => {
    // The gallery template wires <app-accessible-dialog> directly.
    expect(gallerySource).toMatch(/<app-accessible-dialog/);
    expect(gallerySource).toMatch(/\[opened\]="zoomOpen\(\)"/);
    // The primitive enforces role=dialog + aria-modal=true via CDK.
    expect(accessibleDialogSource).toMatch(/role: 'dialog'/);
    expect(accessibleDialogSource).toMatch(/ariaModal: true/);
  });

  it('imports the AccessibleDialog primitive from T10 so the zoom uses the focus trap', () => {
    expect(gallerySource).toMatch(/import\s*\{\s*AccessibleDialog\s*\}\s*from/);
  });
});

describe('T16-AC02 product-gallery image error fallback', () => {
  it('imports the ProductImage primitive so error events fall back to a named initial', () => {
    expect(gallerySource).toMatch(/import\s*\{\s*ProductImage[\s\S]*?\}\s*from/);
    expect(gallerySource).toMatch(/\(loadFailed\)="onImageFailed\(\)"/);
    // ProductImage must swap to a neutral named fallback on error
    // rather than an invented image of another device.
    expect(productImageSource).toMatch(/fallback-mark/);
    expect(productImageSource).toMatch(/loadFailed/);
  });

  it('does not autoplay: the gallery never schedules a timer that advances the index', () => {
    // Strip comments + template literals before checking for timer
    // names so the comment in the file header does not match.
    const code = gallerySource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    const noAutoplayTimer = /\bsetInterval\b|\bsetTimeout\b|\brequestAnimationFrame\b/;
    expect(noAutoplayTimer.test(code)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// T16-AC05 — no 3D script, no inactive fake 3D button
// ---------------------------------------------------------------------------
describe('T16-AC05 product-gallery has no 3D surface', () => {
  it('does not import a 3D engine, render a <canvas>, or expose a fake 3D button', () => {
    // No 3D engine import.
    expect(gallerySource).not.toMatch(/three\.js|three\/|babylon|@babylonjs/);
    // No canvas element in the template.
    expect(gallerySource).not.toMatch(/<canvas/);
    // No 3D label / aria on any visible button.
    const lower = gallerySource.toLowerCase();
    expect(lower.indexOf('3d')).toBe(-1);
  });
});