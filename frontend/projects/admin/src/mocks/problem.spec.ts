/**
 * Spec for `problem` (projects/admin/src/mocks/problem.ts).
 *
 * The Problem helper is the contract every admin handler answers
 * failure with. The tests pin the wire shape: status, content type,
 * `type` derived from `code`, `title` carried through, `detail`
 * defaulting to `title`, an empty `fieldErrors` array, a 32-character
 * hex `traceId`, and the `params` block only present when the caller
 * supplied one. A `params` that landed on the wire empty would break
 * the page-side switch on `Object.keys(params).length === 0`.
 */
import { describe, expect, it } from 'vitest';

import { isRecord } from '../app/core/is-record';
import { problem } from './problem';

describe('problem', () => {
  it('returns the contract Problem wire shape with the supplied extras', async () => {
    const response = problem(412, 'PRODUCT_VERSION_CONFLICT', 'Product version conflict', {
      params: { expected: 3, received: 2 },
    });

    expect(response.status).toBe(412);
    expect(response.headers.get('content-type')).toBe('application/problem+json');

    const body: unknown = await response.json();
    expect(isRecord(body)).toBe(true);
    if (!isRecord(body)) return;

    expect(body['type']).toBe('urn:mi-bolt:problem:product-version-conflict');
    expect(body['code']).toBe('PRODUCT_VERSION_CONFLICT');
    expect(body['title']).toBe('Product version conflict');
    expect(body['detail']).toBe('Product version conflict');
    expect(body['status']).toBe(412);
    expect(body['fieldErrors']).toEqual([]);
    expect(body['params']).toEqual({ expected: 3, received: 2 });

    const traceId = body['traceId'];
    expect(typeof traceId).toBe('string');
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
  });

  it('omits the params key when no extras were supplied', async () => {
    const response = problem(401, 'UNAUTHENTICATED', 'Authentication required');

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(isRecord(body)).toBe(true);
    if (!isRecord(body)) return;

    expect('params' in body).toBe(false);
    expect(body['code']).toBe('UNAUTHENTICATED');
    expect(body['title']).toBe('Authentication required');
    expect(body['detail']).toBe('Authentication required');
    expect(body['fieldErrors']).toEqual([]);
  });
});
