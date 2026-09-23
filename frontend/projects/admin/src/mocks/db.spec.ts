/**
 * Spec for `createDb` (projects/admin/src/mocks/db.ts).
 *
 * `MockDb` is the whole in-memory state the four handler units read
 * and write. The default scenario carries the seed product count,
 * one admin (`admin`), no active session, no issued XSRF token and
 * `nextProductId` one past the seed; the `empty-catalog` scenario
 * clears the products but keeps the admin and the next id.
 */
import { describe, expect, it } from 'vitest';

import catalogSource from '../../../../docs/api/fixtures/catalog-source.json';
import { createDb } from './db';
import { SEED_ADMIN } from './seed';

const seedProductCount = catalogSource.products.length;

describe('createDb', () => {
  it('default scenario seeds the admin, no session, no token, all products, next id past the seed', () => {
    const db = createDb();

    expect(db.scenario).toBe('default');
    expect(db.admins.size).toBe(1);
    expect(db.admins.get(SEED_ADMIN.id)?.user.username).toBe('admin');
    expect(db.sessionAdminId).toBeNull();
    expect(db.xsrfToken).toBeNull();
    expect(db.products.size).toBe(seedProductCount);
    expect(db.nextProductId).toBe(seedProductCount + 1);
  });

  it('empty-catalog scenario clears products but keeps the admin and next id', () => {
    const db = createDb('empty-catalog');

    expect(db.scenario).toBe('empty-catalog');
    expect(db.admins.size).toBe(1);
    expect(db.products.size).toBe(0);
    expect(db.nextProductId).toBe(seedProductCount + 1);
  });
});
