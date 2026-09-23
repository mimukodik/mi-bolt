/**
 * Spec for `seedCatalog`, `SEED_ADMIN` and `SEED_ADMIN_PASSWORD`
 * (projects/admin/src/mocks/seed.ts).
 *
 * The seed is the only place that turns the backend fixture into the
 * generated admin SDK shape, so each test below pins one
 * invariant the four handler units (F6-F9) depend on: the product
 * count matches the fixture, ids are 1..N in source order, the last
 * two products are `archived` with `SEED_TIME` and every other one is
 * `active` with no `archivedAt`, the first variant price and the
 * first spec group title flow through unchanged, every colour
 * registers an image whose id and src match the contract, the
 * demo admin UUID matches the v4 pattern and is not `'1'`, and the
 * guard helpers throw the documented messages on a bad source.
 *
 * Counts and values are derived from the fixture the same way the
 * production file derives them, so a fixture edit cannot silently
 * move the test's numbers.
 */
import { describe, expect, it } from 'vitest';

import catalogSource from '../../../../../data/catalog/catalog.json';
import { isRecord } from '../app/core/is-record';
import {
  ARCHIVED_SEED_COUNT,
  SEED_ADMIN,
  SEED_ADMIN_PASSWORD,
  SEED_TIME,
  seedCatalog,
} from './seed';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('seedCatalog', () => {
  it('returns one AdminProduct per fixture entry with ids 1..N in source order', () => {
    const catalog = seedCatalog();
    const sourceProducts = Array.isArray(catalogSource) ? catalogSource : catalogSource.products;
    if (!Array.isArray(sourceProducts)) {
      throw new Error('fixture: products is not an array');
    }
    expect(catalog.products).toHaveLength(sourceProducts.length);
    const ids = catalog.products.map((product) => product.id);
    expect(ids).toEqual(sourceProducts.map((_, index) => index + 1));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('archives the last two products and leaves every other one active', () => {
    const catalog = seedCatalog();
    expect(ARCHIVED_SEED_COUNT).toBe(2);
    const archived = catalog.products.filter((product) => product.status === 'archived');
    const active = catalog.products.filter((product) => product.status === 'active');
    expect(archived).toHaveLength(ARCHIVED_SEED_COUNT);
    expect(active).toHaveLength(catalog.products.length - ARCHIVED_SEED_COUNT);
    for (const product of archived) {
      expect(product.archivedAt).toBe(SEED_TIME);
    }
    for (const product of active) {
      expect('archivedAt' in product).toBe(false);
    }
    // The two archived entries are the last two in source order.
    const lastTwo = catalog.products.slice(-ARCHIVED_SEED_COUNT);
    expect(lastTwo.every((product) => product.status === 'archived')).toBe(true);
  });

  it('mirrors the first variant price and the first spec group title from the fixture', () => {
    const catalog = seedCatalog();
    const sourceProducts = Array.isArray(catalogSource) ? catalogSource : catalogSource.products;
    if (!Array.isArray(sourceProducts)) {
      throw new Error('fixture: products is not an array');
    }
    const firstSource: unknown = sourceProducts[0];
    if (!isRecord(firstSource)) {
      throw new Error('fixture: first product is not an object');
    }
    const fixtureVariants: unknown = firstSource['variants'];
    const fixtureSpecGroups: unknown = firstSource['specGroups'];
    if (!Array.isArray(fixtureVariants) || !Array.isArray(fixtureSpecGroups)) {
      throw new Error('fixture: variants/specGroups is not an array');
    }
    const firstVariant: unknown = fixtureVariants[0];
    const firstSpecGroup: unknown = fixtureSpecGroups[0];
    if (!isRecord(firstVariant) || !isRecord(firstSpecGroup)) {
      throw new Error('fixture: first variant/group is not an object');
    }
    const priceHuf = firstVariant['priceHuf'];
    const label = firstSpecGroup['label'];

    const firstSeed = catalog.products[0];
    expect(firstSeed.variants[0]?.price).toEqual({ amount: priceHuf, currency: 'HUF' });
    expect(firstSeed.specGroups[0]?.title).toBe(label);
  });

  it('registers every colour image with bytes null and the contract src form', () => {
    const catalog = seedCatalog();
    for (const product of catalog.products) {
      for (const color of product.colors) {
        const image = catalog.images.get(color.image.id);
        expect(image).toBeDefined();
        if (image === undefined) continue;
        expect(image.bytes).toBeNull();
        expect(image.seedFile).toBe(`${color.image.id}.png`);
        expect(color.image.src).toBe(`/api/v1/media/${color.image.id}`);
      }
    }
  });

  it('every seed product starts at version 0', () => {
    const catalog = seedCatalog();
    for (const product of catalog.products) {
      expect(product.version).toBe(0);
    }
  });
});

describe('seed image content types', () => {
  function buildSourceWithImageFile(file: string): unknown {
    const sourceProducts = Array.isArray(catalogSource) ? catalogSource : catalogSource.products;
    if (!Array.isArray(sourceProducts)) {
      throw new Error('fixture: products is not an array');
    }
    const firstSource: unknown = sourceProducts[0];
    if (!isRecord(firstSource)) {
      throw new Error('fixture: first product is not an object');
    }
    const colors = firstSource['colors'];
    if (!Array.isArray(colors) || colors.length === 0) {
      throw new Error('fixture: colors is not an array');
    }
    const firstColor: unknown = colors[0];
    if (!isRecord(firstColor)) {
      throw new Error('fixture: first color is not an object');
    }
    const image = firstColor['image'];
    if (!isRecord(image)) {
      throw new Error('fixture: first color image is not an object');
    }
    const badImage = { ...image, file };
    const badColor = { ...firstColor, image: badImage };
    const badProduct = { ...firstSource, colors: [badColor] };
    return { products: [badProduct] };
  }

  it('registers a .webp image as image/webp', () => {
    const source = buildSourceWithImageFile('sample-photo.webp');
    expect(seedCatalog(source).images.get('sample-photo')?.contentType).toBe('image/webp');
  });

  it('registers a .jpg image as image/jpeg', () => {
    const source = buildSourceWithImageFile('sample-photo.jpg');
    expect(seedCatalog(source).images.get('sample-photo')?.contentType).toBe('image/jpeg');
  });

  it('registers a .jpeg image as image/jpeg', () => {
    const source = buildSourceWithImageFile('sample-photo.jpeg');
    expect(seedCatalog(source).images.get('sample-photo')?.contentType).toBe('image/jpeg');
  });

  it('rejects an unsupported image extension', () => {
    const source = buildSourceWithImageFile('sample-photo.gif');
    expect(() => seedCatalog(source)).toThrow(
      'data/catalog/catalog.json: image type of sample-photo.gif',
    );
  });
});

describe('SEED_ADMIN', () => {
  it('matches the v4 UUID pattern and is not the placeholder "1"', () => {
    expect(SEED_ADMIN.id).toMatch(UUID_V4);
    expect(SEED_ADMIN.id).not.toBe('1');
    expect(SEED_ADMIN.username).toBe('admin');
    expect(SEED_ADMIN.createdAt).toBe(SEED_TIME);
  });

  it('carries the documented mock password', () => {
    expect(SEED_ADMIN_PASSWORD).toBe('mibolt-admin-demo');
  });
});

describe('seedCatalog guards', () => {
  it('throws when the root is not an object', () => {
    expect(() => seedCatalog(null)).toThrow('data/catalog/catalog.json: root is not an object');
  });

  it('throws when a product carries an unsupported storageGb', () => {
    const sourceProducts = Array.isArray(catalogSource) ? catalogSource : catalogSource.products;
    if (!Array.isArray(sourceProducts)) {
      throw new Error('fixture: products is not an array');
    }
    const firstSource: unknown = sourceProducts[0];
    if (!isRecord(firstSource)) {
      throw new Error('fixture: first product is not an object');
    }
    const variants = firstSource['variants'];
    if (!Array.isArray(variants) || variants.length === 0) {
      throw new Error('fixture: variants is not an array');
    }
    const firstVariant: unknown = variants[0];
    if (!isRecord(firstVariant)) {
      throw new Error('fixture: first variant is not an object');
    }
    const badVariant = { ...firstVariant, storageGb: 64 };
    const badProduct = { ...firstSource, variants: [badVariant] };
    const badSource = { products: [badProduct] };
    expect(() => seedCatalog(badSource)).toThrow('data/catalog/catalog.json: storageGb 64');
  });
});
