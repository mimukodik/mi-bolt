import type { HttpHandler } from 'msw';

import type { MockDb } from './db';

/** Filled by unit F8 (MIM-335). */
export function productsWriteHandlers(_db: MockDb): HttpHandler[] {
  return [];
}
