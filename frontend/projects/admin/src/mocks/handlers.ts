import type { HttpHandler } from 'msw';

import { appearanceHandlers } from './appearance.handlers';
import { authHandlers } from './auth.handlers';
import type { MockDb } from './db';
import { mediaHandlers } from './media.handlers';
import { productsReadHandlers } from './products-read.handlers';
import { productsWriteHandlers } from './products-write.handlers';
import { usersHandlers } from './users.handlers';

/** Every admin API handler over one db; the browser worker and the specs both start from here. */
export function adminHandlers(db: MockDb): HttpHandler[] {
  return [
    ...authHandlers(db),
    ...appearanceHandlers(db),
    ...usersHandlers(db),
    ...productsReadHandlers(db),
    ...productsWriteHandlers(db),
    ...mediaHandlers(db),
  ];
}
