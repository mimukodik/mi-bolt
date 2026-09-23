import type { HttpHandler } from 'msw';

import type { MockDb } from './db';

/** Filled by unit F6 (MIM-333). */
export function authHandlers(_db: MockDb): HttpHandler[] {
  return [];
}
