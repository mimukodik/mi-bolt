import type { Promotion } from '../app/api/generated/models/promotion';
import catalogSource from '../../../../../data/catalog/catalog.json';

import type { AdminProduct } from '../app/api/generated/models/admin-product';
import type { AdminProductColor } from '../app/api/generated/models/admin-product-color';
import type { AdminProductVariant } from '../app/api/generated/models/admin-product-variant';
import type { AdminSpecGroup } from '../app/api/generated/models/admin-spec-group';
import type { AdminUser } from '../app/api/generated/models/admin-user';
import type { StorageGb } from '../app/api/generated/models/storage-gb';
import type { UploadedImage } from '../app/api/generated/models/uploaded-image';
import { isRecord } from '../app/core/is-record';

export const SEED_TIME = '2026-09-22T00:00:00Z';
export const SEED_ADMIN: AdminUser = {
  id: '3f6c9a2e-7b1d-4c58-9e0a-5d2b8f4a6c17',
  username: 'admin',
  createdAt: SEED_TIME,
};
export const SEED_ADMIN_PASSWORD = 'mibolt-admin-demo';
export const ARCHIVED_SEED_COUNT = 2;

/** An uploaded image carries its bytes; a seed image carries the file name it is served from under `public/media/`. */
export type MockImage = {
  readonly contentType: UploadedImage['contentType'];
  readonly width: number;
  readonly height: number;
} & (
  | { readonly bytes: Uint8Array; readonly seedFile: null }
  | { readonly bytes: null; readonly seedFile: string }
);

export interface SeedCatalog {
  readonly products: readonly AdminProduct[];
  readonly images: ReadonlyMap<string, MockImage>;
}

function fail(what: string): never {
  throw new Error(`data/catalog/catalog.json: ${what}`);
}

function rec(value: unknown, what: string): Record<string, unknown> {
  return isRecord(value) ? value : fail(`${what} is not an object`);
}

function list(record: Record<string, unknown>, key: string): readonly unknown[] {
  const value = record[key];
  return Array.isArray(value) ? value : fail(`${key} is not an array`);
}

function text(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : fail(`${key} is not a string`);
}

function num(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === 'number' ? value : fail(`${key} is not a number`);
}

function flag(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return typeof value === 'boolean' ? value : fail(`${key} is not a boolean`);
}

function storage(value: number): StorageGb {
  return value === 128 || value === 256 || value === 512
    ? value
    : fail(`storageGb ${String(value)}`);
}

function contentTypeOf(file: string): MockImage['contentType'] {
  if (file.endsWith('.png')) return 'image/png';
  if (file.endsWith('.webp')) return 'image/webp';
  if (file.endsWith('.jpg') || file.endsWith('.jpeg')) return 'image/jpeg';
  return fail(`image type of ${file}`);
}

function imageId(file: string): string {
  const dot = file.lastIndexOf('.');
  return dot < 0 ? file : file.slice(0, dot);
}

function color(value: unknown, images: Map<string, MockImage>): AdminProductColor {
  const source = rec(value, 'colour');
  const image = rec(source['image'], 'colour image');
  const file = text(image, 'file');
  const id = imageId(file);
  const width = num(image, 'width');
  const height = num(image, 'height');
  images.set(id, { bytes: null, seedFile: file, contentType: contentTypeOf(file), width, height });
  return {
    code: text(source, 'code'),
    name: text(source, 'name'),
    swatchHex: text(source, 'swatchHex'),
    image: { id, src: `/api/v1/media/${id}`, alt: text(image, 'alt'), width, height },
  };
}

function variant(value: unknown): AdminProductVariant {
  const source = rec(value, 'variant');
  return {
    id: text(source, 'id'),
    slug: text(source, 'slug'),
    colorCode: text(source, 'colorCode'),
    storageGb: storage(num(source, 'storageGb')),
    price: { amount: num(source, 'priceHuf'), currency: 'HUF' },
    stock: num(source, 'stock'),
    ...(source['salePriceHuf'] === undefined || source['salePriceHuf'] === null
      ? {}
      : { salePriceHuf: num(source, 'salePriceHuf') }),
  };
}

function promotion(value: unknown): Promotion | undefined {
  if (value === undefined || value === null) return undefined;
  const source = rec(value, 'promotion');
  return {
    enabled: flag(source, 'enabled'),
    ...(source['text'] === undefined ? {} : { text: text(source, 'text') }),
    ...(source['startsAt'] === undefined ? {} : { startsAt: text(source, 'startsAt') }),
    ...(source['endsAt'] === undefined ? {} : { endsAt: text(source, 'endsAt') }),
  };
}

function specGroup(value: unknown): AdminSpecGroup {
  const source = rec(value, 'spec group');
  return {
    title: text(source, 'label'),
    rows: list(source, 'rows').map((row) => {
      const cells = rec(row, 'spec row');
      return { label: text(cells, 'label'), value: text(cells, 'value') };
    }),
  };
}

/** The admin view of `data/catalog/catalog.json`: ids 1..N, the last two archived, every image registered. */
export function seedCatalog(source: unknown = catalogSource): SeedCatalog {
  const products = list(rec(source, 'root'), 'products');
  const images = new Map<string, MockImage>();
  const firstArchived = products.length - ARCHIVED_SEED_COUNT;
  const mapped = products.map((value, index): AdminProduct => {
    const product = rec(value, 'product');
    const archived = index >= firstArchived;
    return {
      id: index + 1,
      slug: text(product, 'slug'),
      brand: text(product, 'brand'),
      name: text(product, 'name'),
      highlights: list(product, 'highlights').map((line) =>
        typeof line === 'string' ? line : fail('highlight'),
      ),
      description: text(product, 'description'),
      is5g: flag(product, 'is5g'),
      releasedAt: text(product, 'releasedAt'),
      rank: num(product, 'rank'),
      popularityScore: num(product, 'popularityScore'),
      featured: flag(product, 'featured'),
      promotion: promotion(product['promotion']),
      colors: list(product, 'colors').map((entry) => color(entry, images)),
      variants: list(product, 'variants').map(variant),
      specGroups: list(product, 'specGroups').map(specGroup),
      status: archived ? 'archived' : 'active',
      ...(archived ? { archivedAt: SEED_TIME } : {}),
      version: 0,
    };
  });
  return { products: mapped, images };
}
