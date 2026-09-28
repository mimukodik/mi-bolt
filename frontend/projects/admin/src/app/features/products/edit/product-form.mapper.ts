import type { AdminProduct } from '../../../api/generated/models/admin-product';
import type { AdminProductInput } from '../../../api/generated/models/admin-product-input';
import type { AdminProductVariantInput } from '../../../api/generated/models/admin-product-variant-input';

import { newKey } from './product-form.model';
import type { ProductFormModel } from './product-form.model';
import { variantSlug } from './variant-id';

const COLOR_IMAGE_ID_POINTER = /^\/colors\/(\d+)\/imageId$/;
const VARIANT_COLOR_CODE_POINTER = /^\/variants\/(\d+)\/colorCode$/;
const VARIANT_SLUG_POINTER = /^\/variants\/(\d+)\/slug$/;
const VARIANT_PRICE_POINTER = /^\/variants\/(\d+)\/price(?:\/amount)?$/;
const VARIANT_DISCOUNT_POINTER = /^\/variants\/(\d+)\/discountPrice(?:\/amount)?$/;
const HIGHLIGHT_POINTER = /^\/highlights\/(\d+)$/;

/** Local midnight for `date`, parsed without a time-zone shift (`new Date(y, m - 1, d)`). */
function parseLocalDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** `YYYY-MM-DD` for `date`'s local calendar day; never `toISOString()`, which shifts by the time zone. */
function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalDateTime(value: string | undefined): string {
  if (value === undefined) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toOffsetDateTime(value: string): string | undefined {
  return value === '' ? undefined : new Date(value).toISOString();
}

/** Reads a value the edit schema requires non-null before submission, or throws naming `pointer`. */
function requireValue<T>(value: T | null, pointer: string): T {
  if (value === null) {
    throw new Error(`toProductInput: ${pointer} is empty`);
  }
  return value;
}

/** `product`, read into the edit form's model: fresh keys, a colour-code lookup for every variant's `colorKey`, a local `releasedAt`. */
export function toFormModel(product: AdminProduct): ProductFormModel {
  const colors = product.colors.map((color) => ({
    key: newKey(),
    code: color.code,
    name: color.name,
    swatchHex: color.swatchHex,
    alt: color.image.alt,
    image: color.image,
  }));
  const colorKeyByCode = new Map(colors.map((color) => [color.code, color.key] as const));

  return {
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    description: product.description,
    is5g: product.is5g,
    releasedAt: parseLocalDate(product.releasedAt),
    rank: product.rank,
    popularityScore: product.popularityScore,
    featured: product.featured,
    promotionStartAt: toLocalDateTime(product.promotionStartAt),
    promotionEndAt: toLocalDateTime(product.promotionEndAt),
    promotionText: product.promotionText ?? '',
    highlights: product.highlights.map((text) => ({ key: newKey(), text })),
    colors,
    variants: product.variants.map((variant) => ({
      key: newKey(),
      id: variant.id,
      colorKey: colorKeyByCode.get(variant.colorCode) ?? null,
      storageGb: variant.storageGb,
      price: variant.price.amount,
      discountPrice: variant.discountPrice?.amount ?? null,
      stock: variant.stock,
    })),
    specGroups: product.specGroups.map((group) => ({
      key: newKey(),
      title: group.title,
      rows: group.rows.map((row) => ({ key: newKey(), label: row.label, value: row.value })),
    })),
  };
}

/**
 * `model`, read into the write DTO. Called only on a form the schema found valid; a `null` the
 * schema should have already blocked throws instead of reaching the wire.
 */
export function toProductInput(model: ProductFormModel): AdminProductInput {
  const releasedAt = requireValue(model.releasedAt, '/releasedAt');
  const rank = requireValue(model.rank, '/rank');
  const popularityScore = requireValue(model.popularityScore, '/popularityScore');

  const codeByKey = new Map(model.colors.map((color) => [color.key, color.code] as const));

  const colors = model.colors.map((color, index) => {
    const image = requireValue(color.image, `/colors/${String(index)}/image`);
    return {
      code: color.code,
      name: color.name,
      swatchHex: color.swatchHex,
      imageId: image.id,
      alt: color.alt,
    };
  });

  const variants = model.variants.map((variant, index): AdminProductVariantInput => {
    const colorKey = requireValue(variant.colorKey, `/variants/${String(index)}/colorKey`);
    const colorCode = codeByKey.get(colorKey);
    if (colorCode === undefined) {
      throw new Error(`toProductInput: /variants/${String(index)}/colorKey is empty`);
    }
    const storageGb = requireValue(variant.storageGb, `/variants/${String(index)}/storageGb`);
    const price = requireValue(variant.price, `/variants/${String(index)}/price`);
    const stock = requireValue(variant.stock, `/variants/${String(index)}/stock`);
    return {
      slug: variantSlug(colorCode, storageGb),
      colorCode,
      storageGb,
      price: { amount: price, currency: 'HUF' },
      ...(variant.discountPrice === null
        ? {}
        : { discountPrice: { amount: variant.discountPrice, currency: 'HUF' as const } }),
      stock,
    };
  });

  return {
    slug: model.slug,
    brand: model.brand,
    name: model.name,
    description: model.description,
    is5g: model.is5g,
    releasedAt: formatLocalDate(releasedAt),
    rank,
    popularityScore,
    featured: model.featured,
    promotionStartAt: toOffsetDateTime(model.promotionStartAt),
    promotionEndAt: toOffsetDateTime(model.promotionEndAt),
    promotionText: model.promotionText.trim() === '' ? undefined : model.promotionText.trim(),
    highlights: model.highlights.map((highlight) => highlight.text),
    colors,
    variants,
    specGroups: model.specGroups.map((group) => ({
      title: group.title,
      rows: group.rows.map((row) => ({ label: row.label, value: row.value })),
    })),
  };
}

/** Maps a 422 pointer into the request body onto the edit form's model. */
export function toModelPointer(pointer: string): string {
  const colorImageId = COLOR_IMAGE_ID_POINTER.exec(pointer);
  if (colorImageId !== null) {
    return `/colors/${colorImageId[1]}/image`;
  }
  const variantColorCode = VARIANT_COLOR_CODE_POINTER.exec(pointer);
  if (variantColorCode !== null) {
    return `/variants/${variantColorCode[1]}/colorKey`;
  }
  const variantSlugPointer = VARIANT_SLUG_POINTER.exec(pointer);
  if (variantSlugPointer !== null) {
    return `/variants/${variantSlugPointer[1]}/storageGb`;
  }
  const variantPrice = VARIANT_PRICE_POINTER.exec(pointer);
  if (variantPrice !== null) {
    return `/variants/${variantPrice[1]}/price`;
  }
  const variantDiscount = VARIANT_DISCOUNT_POINTER.exec(pointer);
  if (variantDiscount !== null) {
    return `/variants/${variantDiscount[1]}/discountPrice`;
  }
  const highlight = HIGHLIGHT_POINTER.exec(pointer);
  if (highlight !== null) {
    return `/highlights/${highlight[1]}/text`;
  }
  return pointer;
}
