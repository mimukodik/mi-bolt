import { describe, expect, it } from 'vitest';
import { signedIn } from '../testing/mock-spec-helpers';
import { useMswServer } from '../testing/msw-server';
import { issueXsrfCookie } from './guards';

useMswServer();
const url = new URL('/api/v1/admin/promotion', document.baseURI).href;
describe('shared campaign writes', () => {
  it('saves atomically with a version and an explicit offset', async () => {
    const db = signedIn();
    issueXsrfCookie(db);
    const read = await fetch(url);
    expect(read.status).toBe(200);
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': '"0"',
        'X-XSRF-TOKEN': db.xsrfToken ?? '',
      },
      body: JSON.stringify({
        text: 'Halloween',
        startsAt: '2026-10-01T00:00:00+02:00',
        endsAt: '2026-11-01T00:00:00+01:00',
      }),
    });
    expect(response.status).toBe(200);
    expect(db.promotion.version).toBe(1);
    expect(response.headers.get('ETag')).toBe('"1"');
    const conflict = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'If-Match': '"0"',
        'X-XSRF-TOKEN': db.xsrfToken ?? '',
      },
      body: '{}',
    });
    expect(conflict.status).toBe(412);
    expect(db.promotion.version).toBe(1);
  });
  it('rejects blank/incomplete/reversed campaigns without changing data', async () => {
    const db = signedIn();
    issueXsrfCookie(db);
    for (const body of [
      { text: '' },
      { text: 'Halloween', startsAt: '2026-11-01T00:00:00Z', endsAt: '2026-10-01T00:00:00Z' },
    ]) {
      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'If-Match': '"0"',
          'X-XSRF-TOKEN': db.xsrfToken ?? '',
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(422);
      expect(db.promotion.version).toBe(0);
    }
  });
  it('rejects bad JSON/types, missing preconditions and unauthenticated calls', async () => {
    const db = signedIn();
    issueXsrfCookie(db);
    const headers = { 'Content-Type': 'application/json', 'X-XSRF-TOKEN': db.xsrfToken ?? '' };
    expect((await fetch(url, { method: 'PUT', headers, body: '{' })).status).toBe(400);
    expect((await fetch(url, { method: 'PUT', headers, body: '{"text":42}' })).status).toBe(400);
    expect((await fetch(url, { method: 'PUT', headers, body: '{}' })).status).toBe(428);
    db.sessionAdminId = null;
    expect((await fetch(url)).status).toBe(401);
  });
});
