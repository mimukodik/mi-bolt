/**
 * Spec for `adminHandlers` (projects/admin/src/mocks/handlers.ts).
 *
 * Today every slice stub returns `[]`, so the combined list is
 * empty; F6 (MIM-333, auth+users), F7 (MIM-334, products-read),
 * F8 (MIM-335, products-write) and F9 (MIM-336, media) each fill
 * their slice and the array grows. The assertion below pins the
 * starting point of the slice, not the steady state.
 */
import { describe, expect, it } from 'vitest';

import { createDb } from './db';
import { adminHandlers } from './handlers';

describe('adminHandlers', () => {
  it('returns an empty array today (F6-F9 fill the slice)', () => {
    const handlers = adminHandlers(createDb());
    expect(Array.isArray(handlers)).toBe(true);
    expect(handlers).toHaveLength(0);
  });
});
