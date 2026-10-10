import { describe, expect, it } from 'vitest';
import { buildCatalogHandlers } from './catalog.handlers';
import { Repository } from '../repository';
import { createFixedClock, createDeterministicIds, resolveScenario } from '../scenarios';
import { server, useMswServer } from '../../../../tests/msw-server';
useMswServer();
const path = new URL('/api/v1/shop-appearance', document.baseURI).href;
describe('independent decoration mock windows', () => {
  it('starts and expires on a separate clock window without any product promotion', async () => {
    const clock = createFixedClock('2026-10-30T12:00:00Z');
    server.use(
      ...buildCatalogHandlers({
        repository: new Repository(
          resolveScenario('halloween-appearance-future'),
          createDeterministicIds(1),
          clock,
        ),
        clock,
        ids: createDeterministicIds(1),
        scenario: resolveScenario('halloween-appearance-future'),
        apiRoot: new URL('/api/v1', document.baseURI).href,
      }),
    );
    const before = await fetch(path);
    expect(before.headers.get('Cache-Control')).toBe('no-store');
    expect(await before.json()).toEqual({
      halloweenActive: false,
      serverTime: clock.now(),
      nextChangeAt: '2026-10-30T12:01:00.000Z',
    });
    clock.advanceMs(60_000);
    expect(await (await fetch(path)).json()).toEqual({
      halloweenActive: true,
      serverTime: clock.now(),
      nextChangeAt: '2026-10-30T12:02:00.000Z',
    });
    clock.advanceMs(60_000);
    expect(await (await fetch(path)).json()).toEqual({
      halloweenActive: false,
      serverTime: clock.now(),
    });
    expect((await fetch(`${path}?unknown=true`)).status).toBe(400);
  });
  it.each(['default', 'halloween-appearance-expired'])('leaves %s undecorated', async (name) => {
    const clock = createFixedClock('2026-10-30T12:00:00Z');
    server.use(
      ...buildCatalogHandlers({
        repository: new Repository(resolveScenario(name), createDeterministicIds(1), clock),
        clock,
        ids: createDeterministicIds(1),
        scenario: resolveScenario(name),
        apiRoot: new URL('/api/v1', document.baseURI).href,
      }),
    );
    expect(await (await fetch(path)).json()).toEqual({
      halloweenActive: false,
      serverTime: clock.now(),
    });
  });
});
