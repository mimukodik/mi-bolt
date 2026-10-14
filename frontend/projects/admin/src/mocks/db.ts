import type { AdminProduct } from '../app/api/generated/models/admin-product';
import type { AdminUser } from '../app/api/generated/models/admin-user';
import type { ScenarioName } from './scenario';
import { SEED_ADMIN, SEED_ADMIN_PASSWORD, seedCatalog, type MockImage } from './seed';

export interface MockAdmin {
  readonly user: AdminUser;
  password: string;
}

/**
 * The whole mock state (one browser tab; a reload resets it). The handler
 * units read and write these fields and never change this shape.
 */
export interface MockDb {
  /** Keyed by admin id. */
  readonly admins: Map<string, MockAdmin>;
  /** The signed-in admin's id; the session cookie is HttpOnly, so the mock keeps it here. */
  sessionAdminId: string | null;
  /** The current `XSRF-TOKEN` value; `null` before the first issue. */
  xsrfToken: string | null;
  /** Keyed by product id; `version`, `status` and `archivedAt` live on the product. */
  readonly products: Map<number, AdminProduct>;
  nextProductId: number;
  /** Keyed by image id (the SHA-256 hex of the bytes for an upload). */
  readonly images: Map<string, MockImage>;
  readonly scenario: ScenarioName;
}

export function createDb(scenario: ScenarioName = 'default'): MockDb {
  const seed = seedCatalog();
  const products = new Map<number, AdminProduct>();
  if (scenario !== 'empty-catalog') {
    for (const product of seed.products) products.set(product.id, product);
  }
  return {
    admins: new Map([[SEED_ADMIN.id, { user: SEED_ADMIN, password: SEED_ADMIN_PASSWORD }]]),
    sessionAdminId: null,
    xsrfToken: null,
    products,
    nextProductId: seed.products.length + 1,
    images: new Map(seed.images),
    scenario,
  };
}
