/**
 * Spec for `adminHandlers` (projects/admin/src/mocks/handlers.ts): the
 * combined list is every slice's handlers.
 */
import { describe, expect, it } from 'vitest';

import { authHandlers } from './auth.handlers';
import { createDb } from './db';
import { adminHandlers } from './handlers';
import { mediaHandlers } from './media.handlers';
import { productsReadHandlers } from './products-read.handlers';
import { productsWriteHandlers } from './products-write.handlers';
import { usersHandlers } from './users.handlers';
import { promotionHandlers } from './promotion.handlers';

describe('adminHandlers', () => {
  it('combines every slice', () => {
    const db = createDb();
    const slices = [
      ...authHandlers(db),
      ...usersHandlers(db),
      ...promotionHandlers(db),
      ...productsReadHandlers(db),
      ...productsWriteHandlers(db),
      ...mediaHandlers(db),
    ];
    expect(adminHandlers(db)).toHaveLength(slices.length);
  });
});
