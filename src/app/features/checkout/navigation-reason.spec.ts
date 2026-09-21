/**
 * MIM-212 S3-C8 — the `navigationReason` copy table.
 *
 * The four reasons the checkout guards redirect with
 * (`checkout.guards.ts`) each have one sentence, and anything else
 * renders nothing. The exact strings are asserted here so the three
 * pages that show the banner cannot drift apart from the guards.
 */

import { describe, expect, it } from 'vitest';

import { navigationReasonMessage } from './navigation-reason';

describe('navigationReasonMessage', () => {
  it('maps "incomplete" to the "fill this step first" sentence', () => {
    expect(navigationReasonMessage('incomplete')).toBe(
      'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.',
    );
  });

  it('maps "empty-cart" to the empty-cart sentence', () => {
    expect(navigationReasonMessage('empty-cart')).toBe('A kosarad üres, ezért ide irányítottunk.');
  });

  it('maps "deep-link" to the "start from the cart" sentence', () => {
    expect(navigationReasonMessage('deep-link')).toBe('A pénztárba a kosárból indulhatsz.');
  });

  it('maps "reload" to the "continue from here" sentence', () => {
    expect(navigationReasonMessage('reload')).toBe('Az oldal újratöltése után innen folytathatod.');
  });

  it('returns null for a reason this build does not know, so the banner renders nothing', () => {
    expect(navigationReasonMessage('something-else')).toBeNull();
    expect(navigationReasonMessage('')).toBeNull();
  });
});
