/**
 * The browser handler factory's snapshot key.
 *
 * `resolveBrowserHandlerOptions` writes the persistence snapshot under the
 * scenario name it is given, falling back to the page URL's scenario. The
 * demo payment page reads the shop's snapshot by its key and writes the
 * outcome back to that same key, while the handlers it builds keep the
 * scenario its own URL names, so the shop's return leg reads the scenario it
 * left from. The shop passes the scenario it resolved (the URL's, or the one
 * its tab remembered), and the handlers run under it. A Node request calls
 * `persist` synchronously, which is what these three cases drive.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { createHandlers } from './create-handlers';
import { resolveBrowserHandlerOptions } from './browser';
import { snapshotKey } from './persistence';
import { resolveScenario } from './scenarios';

afterEach(() => {
  sessionStorage.clear();
});

describe('resolveBrowserHandlerOptions persists under the snapshot name it is given', () => {
  it("BP-01: with no name the snapshot goes under the page URL's scenario", () => {
    const options = resolveBrowserHandlerOptions();
    createHandlers(options);
    // The handlers answer for the scenario the page's own URL names: the
    // fault rules, the demo gate and the dispatcher shell all read it.
    expect(options.scenario.name).toBe('default');
    options.persist?.('spec-session-bp01');
    expect(sessionStorage.getItem(snapshotKey('default'))).not.toBeNull();
  });

  it('BP-02: a given name is the key the snapshot goes under', () => {
    const options = resolveBrowserHandlerOptions('payment-pending-resolves');
    createHandlers(options);
    // The given name moves the snapshot key only: the handlers stay on the
    // page URL's scenario, which is what keeps the shop's fault scenarios
    // out of the demo payment page's own document.
    expect(options.scenario.name).toBe('default');
    options.persist?.('spec-session-bp02');
    expect(sessionStorage.getItem(snapshotKey('payment-pending-resolves'))).not.toBeNull();
    expect(sessionStorage.getItem(snapshotKey('default'))).toBeNull();
  });

  it('BP-03: a resumed scenario runs the handlers and names the snapshot', () => {
    const options = resolveBrowserHandlerOptions(undefined, resolveScenario('lost-once-order'));
    createHandlers(options);
    // The shop resolves the scenario before it calls in, so a query-less
    // reload runs the remembered scenario's handlers, not the URL's default.
    expect(options.scenario.name).toBe('lost-once-order');
    options.persist?.('spec-session-bp03');
    expect(sessionStorage.getItem(snapshotKey('lost-once-order'))).not.toBeNull();
    expect(sessionStorage.getItem(snapshotKey('default'))).toBeNull();
  });
});
