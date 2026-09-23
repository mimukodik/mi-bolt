import { afterEach, describe, expect, it } from 'vitest';

import { checkoutKeys } from './checkout-keys';

const TERMS_SLOT = 'mi-bolt.checkout.terms-accepted';

afterEach(() => {
  sessionStorage.clear();
});

describe('checkoutKeys: the accepted demo terms survive the cold return from the payment page', () => {
  it('reads false when nothing is stored', () => {
    expect(checkoutKeys.termsAccepted('v1:1')).toBe(false);
  });

  it('stores a tick under the cart lines and reads it back for the same lines', () => {
    checkoutKeys.setTermsAccepted('v1:1');
    expect(sessionStorage.getItem(TERMS_SLOT)).toBe('v1:1');
    expect(checkoutKeys.termsAccepted('v1:1')).toBe(true);
  });

  it('reads false for other cart lines (owner 2026-09-23: the tick clears when the cart changes)', () => {
    checkoutKeys.setTermsAccepted('v1:1');
    expect(checkoutKeys.termsAccepted('v1:2')).toBe(false);
  });

  it('an untick removes the stored tick', () => {
    checkoutKeys.setTermsAccepted('v1:1');
    checkoutKeys.setTermsAccepted(null);
    expect(sessionStorage.getItem(TERMS_SLOT)).toBeNull();
    expect(checkoutKeys.termsAccepted('v1:1')).toBe(false);
  });

  it('clearAll drops the stored tick, so the next checkout starts unticked', () => {
    checkoutKeys.setTermsAccepted('v1:1');
    checkoutKeys.clearAll();
    expect(sessionStorage.getItem(TERMS_SLOT)).toBeNull();
    expect(checkoutKeys.termsAccepted('v1:1')).toBe(false);
  });
});
