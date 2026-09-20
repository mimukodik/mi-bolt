/**
 * MIM-210 — catalogue store for the 2.0.0 contract mock.
 *
 * The store is the single in-memory source of truth behind the
 * catalogue handlers (`src/mocks/catalog/catalog.handlers.ts`). It
 * keeps the contract shape (`Product`, `CatalogItem`, `Image`,
 * `StorageGb`) and the parallel ranking fields the handlers need but
 * `Product` does not carry, because `ProductBase` and `Product` are
 * `additionalProperties: false` and the handlers need rank /
 * popularityScore / featured / colorOrder at query time.
 *
 * The store is module-local; the handlers live on top of it and never
 * touch a Repository. `src/mocks/browser.ts` calls `load(...)` once
 * with the generated fixture (`docs/api/fixtures/catalog.json`).
 */

import type {
  CatalogItem,
  ColorOption,
  Image,
  Product,
  ProductSort,
  StorageGb,
  Variant,
} from '../../app/api/generated/models';
import { isRecord } from '../is-record';

/** Fixture shape produced by `scripts/build-catalog-fixture.mjs`. */
export interface CatalogFixture {
  products: readonly Product[];
  ranking: readonly ProductRanking[];
}

/** Per-product fields the store carries alongside the `Product`. */
export interface ProductRanking {
  slug: string;
  rank: number;
  popularityScore: number;
  featured: boolean;
  colorOrder: readonly string[];
}

/**
 * One `(product, storage)` list entry. Carries the entry's contract
 * shape (`CatalogItem`-ready) plus the sort and filter keys the
 * filter module reuses across every sort.
 */
export interface CatalogEntry {
  product: Product;
  ranking: ProductRanking;
  storageGb: StorageGb;
  variant: Variant;
  /** Every color option that has a variant at this storage. */
  colors: ColorOption[];
  /** NFC-lowercase "brand name"; cached so the search path is cheap. */
  searchKey: string;
  /** Lowercased brand name for stable equality. */
  brandKey: string;
  /** Display name for name sorts, case-insensitively comparable. */
  nameKey: string;
  /** Position of the entry inside the recommended order before filtering. */
  recommendedIndex: number;
  /** Released-at ISO date string for newest/oldest sorts. */
  releasedAt: string;
}

/** All catalog sorts the contract exposes. */
export const PRODUCT_SORTS: readonly ProductSort[] = [
  'recommended',
  'newest',
  'oldest',
  'popularity',
  'price_asc',
  'price_desc',
  'name_asc',
  'name_desc',
];

/** Storage sizes the contract accepts. */
export const ALLOWED_STORAGES: readonly StorageGb[] = [128, 256, 512];

/** Validates and narrows a string into a `ProductSort`. */
export function isProductSort(value: string): value is ProductSort {
  return PRODUCT_SORTS.some((s) => s === value);
}

/** Validates and narrows a number into a `StorageGb`. */
export function isStorageGb(value: number): value is StorageGb {
  return ALLOWED_STORAGES.some((s) => s === value);
}

/** Cast a numeric storage into the `StorageGb` union once `isStorageGb` passes. */
function asStorageGb(value: number): StorageGb {
  if (value === 128) return 128;
  if (value === 256) return 256;
  return 512;
}

/** Build a `ColorOption` for the variant at this color + storage. */
function colorOptionFor(
  variants: readonly Variant[],
  colorCode: string,
  storageGb: StorageGb,
): ColorOption | null {
  const v = variants.find((x) => x.colorCode === colorCode && x.storageGb === storageGb);
  if (!v) return null;
  return {
    colorCode: v.colorCode,
    colorName: v.colorName,
    swatchHex: v.swatchHex,
    variantId: v.id,
    variantSlug: v.slug,
    price: v.price,
    availability: v.availability,
  };
}

/** Type guard for the fixture shape produced by the generator. */
export function isCatalogFixture(value: unknown): value is CatalogFixture {
  if (!isRecord(value)) return false;
  if (!Array.isArray(value['products'])) return false;
  if (!Array.isArray(value['ranking'])) return false;
  return true;
}

/** Minimal field check on a `Product` from the fixture. */
function isProduct(value: unknown): value is Product {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['slug'] === 'string' &&
    typeof value['brand'] === 'string' &&
    typeof value['name'] === 'string' &&
    Array.isArray(value['highlights']) &&
    typeof value['is5g'] === 'boolean' &&
    typeof value['releasedAt'] === 'string' &&
    typeof value['description'] === 'string' &&
    Array.isArray(value['variants']) &&
    Array.isArray(value['specGroups'])
  );
}

function isRanking(value: unknown): value is ProductRanking {
  if (!isRecord(value)) return false;
  return (
    typeof value['slug'] === 'string' &&
    typeof value['rank'] === 'number' &&
    typeof value['popularityScore'] === 'number' &&
    typeof value['featured'] === 'boolean' &&
    Array.isArray(value['colorOrder'])
  );
}

/** Build the store from a fixture, validating the shape. */
export function load(fixture: CatalogFixture): CatalogStore {
  if (!isCatalogFixture(fixture)) {
    throw new Error('[catalog-store] fixture does not match expected shape');
  }
  const productsBySlug = new Map<string, Product>();
  const rankingBySlug = new Map<string, ProductRanking>();
  const entries: CatalogEntry[] = [];

  for (const [i, rawProduct] of fixture.products.entries()) {
    if (!isProduct(rawProduct)) {
      throw new Error(
        `[catalog-store] product at index ${String(i)} does not match expected shape`,
      );
    }
    const rawRanking = fixture.ranking[i];
    if (!isRanking(rawRanking)) {
      throw new Error(
        `[catalog-store] ranking at index ${String(i)} does not match expected shape`,
      );
    }
    if (rawProduct.slug !== rawRanking.slug) {
      throw new Error(
        `[catalog-store] product slug "${rawProduct.slug}" does not match ranking slug "${rawRanking.slug}"`,
      );
    }
    productsBySlug.set(rawProduct.slug, rawProduct);
    rankingBySlug.set(rawRanking.slug, rawRanking);
  }

  // Recommended order = rank asc, then source order (id asc), then storage asc.
  const orderedProducts = fixture.products
    .map((p, i) => ({ product: p, ranking: fixture.ranking[i] }))
    .sort((a, b) => {
      if (a.ranking.rank !== b.ranking.rank) return a.ranking.rank - b.ranking.rank;
      const idCmp = numericId(a.product.id) - numericId(b.product.id);
      if (idCmp !== 0) return idCmp;
      return a.product.slug.localeCompare(b.product.slug);
    });

  let recommendedIndex = 0;
  for (const { product, ranking } of orderedProducts) {
    const productStorages = new Set<StorageGb>();
    for (const variant of product.variants) {
      if (isStorageGb(variant.storageGb)) {
        productStorages.add(asStorageGb(variant.storageGb));
      }
    }
    const sortedStorages = [...productStorages].sort((a, b) => a - b);
    for (const storageGb of sortedStorages) {
      const variant = product.variants.find((v) => v.storageGb === storageGb);
      if (!variant) continue;
      // colors in source `colors[]` order; only those that have a
      // variant at this storage.
      const colors: ColorOption[] = [];
      for (const code of ranking.colorOrder) {
        const option = colorOptionFor(product.variants, code, storageGb);
        if (option) colors.push(option);
      }
      const searchKey = [product.brand, product.name, ...product.highlights, product.description]
        .join(' ')
        .toLowerCase()
        .normalize('NFC');
      entries.push({
        product,
        ranking,
        storageGb,
        variant,
        colors,
        searchKey,
        brandKey: product.brand.toLowerCase().normalize('NFC'),
        nameKey: product.name.toLowerCase(),
        recommendedIndex: recommendedIndex++,
        releasedAt: product.releasedAt,
      });
    }
  }

  return new CatalogStore(productsBySlug, rankingBySlug, entries);
}

function numericId(id: string): number {
  const n = Number(id);
  return Number.isFinite(n) ? n : 0;
}

/**
 * In-memory store. Built by `load(...)`; queried by the handlers.
 * Mutates only on `load(...)`; queries are pure.
 */
export class CatalogStore {
  private readonly productsBySlug: Map<string, Product>;
  private readonly rankingBySlug: Map<string, ProductRanking>;
  private readonly entries: readonly CatalogEntry[];

  constructor(
    productsBySlug: Map<string, Product>,
    rankingBySlug: Map<string, ProductRanking>,
    entries: readonly CatalogEntry[],
  ) {
    this.productsBySlug = productsBySlug;
    this.rankingBySlug = rankingBySlug;
    this.entries = entries;
  }

  /** Look up a product by slug. */
  getProduct(slug: string): Product | undefined {
    return this.productsBySlug.get(slug);
  }

  /** Look up a product's ranking record by slug. */
  getRanking(slug: string): ProductRanking | undefined {
    return this.rankingBySlug.get(slug);
  }

  /** Every product, source order. */
  listProducts(): readonly Product[] {
    return [...this.productsBySlug.values()];
  }

  /** Every `(product, storage)` entry, in the order the store iterates them. */
  listEntries(): readonly CatalogEntry[] {
    return this.entries;
  }
}

/** Build a `CatalogItem` from a `CatalogEntry` at filter time. */
export function toCatalogItem(entry: CatalogEntry): CatalogItem {
  const image: Image = entry.variant.images[0];
  return {
    id: entry.product.id,
    slug: entry.product.slug,
    brand: entry.product.brand,
    name: entry.product.name,
    highlights: entry.product.highlights,
    is5g: entry.product.is5g,
    releasedAt: entry.product.releasedAt,
    storageGb: entry.storageGb,
    variantId: entry.variant.id,
    variantSlug: entry.variant.slug,
    price: entry.variant.price,
    availability: entry.variant.availability,
    maxQuantity: entry.variant.maxQuantity,
    image,
    colors: entry.colors.slice(),
  };
}
