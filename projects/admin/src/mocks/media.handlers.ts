import type { HttpHandler } from 'msw';

import type { MockDb } from './db';

/** Filled by unit F9 (MIM-336). */
export function mediaHandlers(_db: MockDb): HttpHandler[] {
  return [];
}
