import type { StorageGb } from '../../../api/generated/models/storage-gb';

/** `CatalogValidator.MAX_VARIANT_ID` on the backend: a longer variant id is 422 `VARIANT_ID_TOO_LONG`. */
export const MAX_VARIANT_ID = 80;

/** Every seeded variant's slug is `<colorCode>-<storageGb>gb` (measured on the backend's `data/catalog/catalog.json`). */
export function variantSlug(colorCode: string, storageGb: StorageGb): string {
  return `${colorCode}-${String(storageGb)}gb`;
}

/**
 * Every seeded variant's id is `<productSlug>--<colorCode>--<storageGb>` (measured on the
 * backend's `data/catalog/catalog.json`); the server derives a new variant's id, the client only
 * estimates its length against `MAX_VARIANT_ID`.
 */
export function variantId(productSlug: string, colorCode: string, storageGb: StorageGb): string {
  return `${productSlug}--${colorCode}--${String(storageGb)}`;
}
