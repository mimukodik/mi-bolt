import { describe, expect, it } from 'vitest';
import { appearanceHandlers } from './appearance.handlers';
import { createDb } from './db';
import { SEED_ADMIN } from './seed';
import { server, useMswServer } from '../testing/msw-server';
useMswServer();
const path = new URL('/api/v1/admin/halloween-appearance', document.baseURI).href;
function setup(): ReturnType<typeof createDb> {
  const db = createDb();
  db.sessionAdminId = SEED_ADMIN.id;
  db.xsrfToken = 'appearance-xsrf';
  server?.use(...appearanceHandlers(db));
  return db;
}
function write(body: unknown, version = '"0"'): Promise<Response> {
  return fetch(path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': version,
      'X-XSRF-TOKEN': 'appearance-xsrf',
    },
    body: JSON.stringify(body),
  });
}
describe('appearance mock parity', () => {
  it('starts disabled, preserves state on invalid saves, and protects version', async () => {
    const db = setup();
    expect((await fetch(path)).status).toBe(200);
    expect((await write({ enabled: true })).status).toBe(422);
    expect(db.appearance).toEqual({ enabled: false, version: 0 });
    expect(
      (
        await write({
          enabled: true,
          startsAt: '2026-10-30T18:00:00Z',
          endsAt: '2026-10-30T18:00:00Z',
        })
      ).status,
    ).toBe(422);
    const valid = {
      enabled: true,
      startsAt: '2026-10-30T18:00:00Z',
      endsAt: '2026-11-02T06:00:00Z',
    };
    const response = await write(valid);
    expect(response.status).toBe(200);
    expect(response.headers.get('ETag')).toBe('"1"');
    expect(db.appearance).toEqual({ ...valid, version: 1 });
    expect((await write({ enabled: false })).status).toBe(412);
    expect(db.appearance.enabled).toBe(true);
    const same = await write(valid, '"1"');
    expect(same.status).toBe(200);
    expect(same.headers.get('ETag')).toBe('"1"');
  });
  it('rejects malformed calendars and query keys, while preserving nanosecond ordering', async () => {
    setup();
    expect((await write({})).status).toBe(400);
    expect(
      (
        await write({
          enabled: true,
          startsAt: '2026-02-30T00:00:00Z',
          endsAt: '2026-11-02T06:00:00Z',
        })
      ).status,
    ).toBe(400);
    expect((await fetch(`${path}?unknown=1`)).status).toBe(400);
    expect(
      (
        await write({
          enabled: true,
          startsAt: '2026-10-30T18:00:00.000000001Z',
          endsAt: '2026-10-30T18:00:00.000000002Z',
        })
      ).status,
    ).toBe(422);
    expect(
      (
        await write({
          enabled: true,
          startsAt: '2026-10-30T18:00:00.000001Z',
          endsAt: '2026-10-30T18:00:00.000002Z',
        })
      ).status,
    ).toBe(200);
  });
});
