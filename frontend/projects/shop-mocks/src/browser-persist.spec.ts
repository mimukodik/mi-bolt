/**
 * The browser handler factory's snapshot key.
 *
 * `resolveBrowserHandlerOptions` writes the persistence snapshot under the
 * scenario name it is given, falling back to the page URL's scenario. The
 * demo payment page reads the shop's snapshot by its key and writes the
 * outcome back to that same key, while the handlers it builds keep the
 * scenario its own URL names, so the shop's return leg reads the scenario it
 * left from. A Node request calls `persist` synchronously, which is what
 * these two cases drive.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createHandlers } from './create-handlers';
import { resolveBrowserHandlerOptions } from './browser';
import { snapshotKey } from './persistence';

afterEach(() => {
  sessionStorage.clear();
});

describe('resolveBrowserHandlerOptions persists under the snapshot name it is given', () => {
  it("BP-01: with no name the snapshot goes under the page URL's scenario", () => {
    const options = resolveBrowserHandlerOptions();
    createHandlers(options);
    options.persist?.('spec-session-bp01');
    expect(sessionStorage.getItem(snapshotKey('default'))).not.toBeNull();
  });

  it('BP-02: a given name is the key the snapshot goes under', () => {
    const options = resolveBrowserHandlerOptions('payment-pending-resolves');
    createHandlers(options);
    options.persist?.('spec-session-bp02');
    expect(sessionStorage.getItem(snapshotKey('payment-pending-resolves'))).not.toBeNull();
    expect(sessionStorage.getItem(snapshotKey('default'))).toBeNull();
  });
});
