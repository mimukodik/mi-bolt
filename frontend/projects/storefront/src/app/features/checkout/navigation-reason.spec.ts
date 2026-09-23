/**
 * MIM-212 S3-C8 — the `navigationReason` copy table.
 *
 * The four reasons the checkout guards redirect with
 * (`checkout.guards.ts`) each have one sentence, and anything else
 * renders nothing. The exact strings are asserted here so the three
 * pages that show the banner cannot drift apart from the guards.
 */

import { describe, expect, it } from 'vitest';

import {
  NAVIGATION_REASONS,
  navigationReasonMessage,
  toNavigationReason,
} from './navigation-reason';

describe('navigationReasonMessage', () => {
  it('maps "incomplete" to the "fill this step first" sentence', () => {
    expect(navigationReasonMessage('incomplete')).toBe(
      'Előbb ezt a lépést kell kitöltened, utána léphetsz tovább.',
    );
  });

  it('maps "empty-cart" to the empty-cart sentence', () => {
    expect(navigationReasonMessage('empty-cart')).toBe('A kosarad üres, ezért ide irányítottunk.');
  });

  it('maps "cart-unavailable" to the "cart unavailable" sentence', () => {
    expect(navigationReasonMessage('cart-unavailable')).toBe(
      'A kosár most nem érhető el, próbáld újra.',
    );
  });

  it('maps "deep-link" to the "start from the cart" sentence', () => {
    expect(navigationReasonMessage('deep-link')).toBe('A pénztárba a kosárból indulhatsz.');
  });

  it('returns null for null, so the banner renders nothing', () => {
    expect(navigationReasonMessage(null)).toBeNull();
  });

  it('covers every NavigationReason with a non-null sentence, so the switch stays exhaustive', () => {
    for (const reason of NAVIGATION_REASONS) {
      expect(navigationReasonMessage(reason)).not.toBeNull();
    }
  });
});

describe('toNavigationReason', () => {
  it('returns null for null and empty strings', () => {
    expect(toNavigationReason(null)).toBeNull();
    expect(toNavigationReason('')).toBeNull();
  });

  it('returns null for strings the guards never emit', () => {
    expect(toNavigationReason('reload')).toBeNull();
    expect(toNavigationReason('something-else')).toBeNull();
  });
});
