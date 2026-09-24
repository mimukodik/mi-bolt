import { describe, expect, it } from 'vitest';

import { waitForController } from './wait-for-controller';

class FakeContainer extends EventTarget {
  controller: object | null = null;
}

describe('waitForController', () => {
  it('resolves at once when the page is already controlled', async () => {
    const container = new FakeContainer();
    container.controller = {};
    let settled = false;
    const done = waitForController(container).then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(true);
    await done;
  });

  it('waits for controllerchange when the page is not controlled yet', async () => {
    const container = new FakeContainer();
    let settled = false;
    const done = waitForController(container).then(() => {
      settled = true;
    });
    await Promise.resolve();
    container.dispatchEvent(new Event('message'));
    await Promise.resolve();
    expect(settled).toBe(false);
    container.controller = {};
    container.dispatchEvent(new Event('controllerchange'));
    await done;
    expect(settled).toBe(true);
  });
});
