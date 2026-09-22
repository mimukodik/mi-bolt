import { afterEach, describe, expect, it } from 'vitest';

import { checkoutKeys } from './checkout-keys';

const TERMS_SLOT = 'mi-bolt.checkout.terms-accepted';

afterEach(() => {
  sessionStorage.clear();
});

describe('checkoutKeys: the accepted demo terms survive the cold return from the payment page', () => {
  it('reads false when nothing is stored', () => {
    expect(checkoutKeys.termsAccepted()).toBe(false);
  });

  it('stores a tick and reads it back', () => {
    checkoutKeys.setTermsAccepted(true);
    expect(sessionStorage.getItem(TERMS_SLOT)).toBe('true');
    expect(checkoutKeys.termsAccepted()).toBe(true);
  });

  it('stores an untick as false', () => {
    checkoutKeys.setTermsAccepted(true);
    checkoutKeys.setTermsAccepted(false);
    expect(sessionStorage.getItem(TERMS_SLOT)).toBe('false');
    expect(checkoutKeys.termsAccepted()).toBe(false);
  });

  it('clearAll drops the stored tick, so the next checkout starts unticked', () => {
    checkoutKeys.setTermsAccepted(true);
    checkoutKeys.clearAll();
    expect(sessionStorage.getItem(TERMS_SLOT)).toBeNull();
    expect(checkoutKeys.termsAccepted()).toBe(false);
  });
});
