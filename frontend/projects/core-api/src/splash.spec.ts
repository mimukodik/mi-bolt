/**
 * MIM-404: dismissSplash() takes the index.html cover screen away only after
 * its exit animation, and at once when no animation runs.
 */

import { afterEach, describe, expect, it } from 'vitest';

import { SPLASH_ID, SPLASH_LEAVING_CLASS, dismissSplash } from './splash';

/** jsdom has no Web Animations API, so each test says what getAnimations() returns. */
function addSplash(
  animations: () => readonly { readonly finished: Promise<unknown> }[],
): HTMLElement {
  const splash = document.createElement('div');
  splash.id = SPLASH_ID;
  Object.defineProperty(splash, 'getAnimations', { value: animations });
  document.body.append(splash);
  return splash;
}

describe('dismissSplash', () => {
  afterEach(() => {
    document.getElementById(SPLASH_ID)?.remove();
  });

  it('adds splash--leaving and removes the element only when its animation has finished', async () => {
    let finish: (() => void) | undefined;
    const finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const splash = addSplash(() => [{ finished }]);

    const done = dismissSplash(document);
    expect(splash.classList.contains(SPLASH_LEAVING_CLASS)).toBe(true);
    await Promise.resolve();
    expect(splash.isConnected).toBe(true);

    finish?.();
    await done;
    expect(splash.isConnected).toBe(false);
  });

  it('removes the element at once when no animation runs (reduced motion)', async () => {
    const splash = addSplash(() => []);
    await dismissSplash(document);
    expect(splash.isConnected).toBe(false);
  });

  it('still removes the element when its animation is cancelled', async () => {
    const splash = addSplash(() => [
      { finished: Promise.reject(new DOMException('The animation was cancelled', 'AbortError')) },
    ]);
    await dismissSplash(document);
    expect(splash.isConnected).toBe(false);
  });

  it('resolves without error when the document has no cover screen', async () => {
    await expect(dismissSplash(document)).resolves.toBeUndefined();
  });
});
