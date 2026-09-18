/**
 * T15 — pure variant selection rules.
 *
 * Every export is a pure function: it takes its inputs as arguments
 * and returns outputs derived from those arguments alone. No signals,
 * no Angular DI, no global state, no Date.now(), no Math.random().
 *
 * The rules below map one-to-one to the T15 acceptance criteria:
 *
 *   AC01 — `selectInitialVariant` recognises a valid `?variant=` id
 *          and exposes the unknown id as `invalidQuery` so the page
 *          can require an explicit user choice before the cart action
 *          becomes enabled.
 *   AC02 — `computeDisabledCombinations` enumerates every
 *          (color, storage) pair that has no variant and attaches a
 *          Hungarian textual reason; `selectVariantByPair` keeps the
 *          current selection when the requested pair has no variant
 *          rather than silently substituting a different SKU.
 *   AC03 — `selectImageFromGallery` resolves the active image
 *          inside the supplied gallery; the facade resets the stored
 *          image id on every variant switch so the gallery always
 *          belongs to the active variant.
 *   AC04 — `computeAddToCartState` returns a disabled reason whenever
 *          the selected variant is out of stock, when the user has
 *          not yet resolved an invalid variant query, or when the
 *          requested quantity exceeds the variant's max.
 *   AC05 — `validateQuantity` preserves the user's explicit selection
 *          (no hidden clamping) and exposes an `overMax` flag the UI
 *          uses to surface a "max N" hint rather than silently
 *          rewriting the quantity.
 *
 * The URL codec (`parseVariantQuery` / `serializeVariantQuery`)
 * belongs here because it is also pure and runs alongside the variant
 * selector; it has no place in the Angular facade, which only deals
 * with signals.
 */

import type { Image } from '../../api/generated/models/image';
import type { Product } from '../../api/generated/models/product';
import type { Variant } from '../../api/generated/models/variant';

/**
 * Maximum quantity the cart backend accepts for a single line. The
 * server-side cart-domain clamps every line to this value, regardless
 * of the variant's advertised `maxQuantity` — keep this in sync with
 * `MAX_LINE_QUANTITY` in `src/mocks/cart/cart-domain.ts`.
 */
export const MAX_LINE_QUANTITY = 5;

/** A (colorCode, storageGb) pair that has no matching variant. */
export interface DisabledCombination {
  readonly colorCode: string;
  readonly storageGb: number;
  readonly reason: string;
}

/** Variant paired with whether the variant query was usable. */
export interface InitialVariantSelection {
  /** The variant the page should display. May be the product default
   *  when the `?variant=` query is missing or unknown. */
  readonly variant: Variant;
  /** The original `?variant=` value when it could not be matched.
   *  The page surfaces this string to explain why the user's link
   *  did not apply. */
  readonly invalidQuery: string | null;
}

/** Result of resolving a (color, storage) pair to a concrete variant. */
export interface VariantLookup {
  readonly variant: Variant;
  /** False when the pair has no matching variant; the returned
   *  `variant` is then the previous selection (or the product default)
   *  rather than a silent substitute. */
  readonly pairAvailable: boolean;
}

/** Result of resolving an image id inside a single gallery. */
export interface ImagePick {
  readonly image: Image | null;
  readonly index: number;
}

/** Quantity validation result — never silently clamps. */
export interface QuantityValidation {
  /** The user's explicit selection (floored and clamped at zero). */
  readonly quantity: number;
  /** True when `quantity` is above the variant's `maxQuantity`. */
  readonly overMax: boolean;
  /** True when `quantity` is below one. */
  readonly belowMin: boolean;
}

/** Whether the "Add to cart" action is currently usable. */
export interface AddToCartState {
  readonly enabled: boolean;
  readonly reason: string | null;
}

// ---------------------------------------------------------------------------
// Initial selection
// ---------------------------------------------------------------------------

/**
 * Picks the variant the page should display when the route first
 * lands. The rules:
 *
 *   - missing `variantQuery` → product's `defaultVariant`, no
 *     invalid flag.
 *   - present and matching an existing `Variant.id` → that variant,
 *     no invalid flag.
 *   - present and matching nothing → product's `defaultVariant`,
 *     the raw query preserved as `invalidQuery` so the page can
 *     require the user to confirm before add-to-cart.
 */
export function selectInitialVariant(
  product: Product,
  variantQuery: string | null,
): InitialVariantSelection {
  if (variantQuery !== null && variantQuery.length > 0) {
    const match = product.variants.find((v) => v.id === variantQuery);
    if (match) return { variant: match, invalidQuery: null };
    return { variant: product.defaultVariant, invalidQuery: variantQuery };
  }
  return { variant: product.defaultVariant, invalidQuery: null };
}

// ---------------------------------------------------------------------------
// Disabled (color, storage) combinations — AC02
// ---------------------------------------------------------------------------

/**
 * Enumerates every (colorCode, storageGb) pair the product advertises
 * at least once in `product.variants`. Pairs without a matching
 * variant are flagged disabled and given a Hungarian reason that
 * names both the color label and the storage bucket so the page
 * can render an accessible explanation.
 *
 * The set of distinct colors and storages is derived from the
 * product's own variants — the page already has the product loaded,
 * so it does not depend on a static catalogue.
 */
export function computeDisabledCombinations(product: Product): readonly DisabledCombination[] {
  const colorSet = new Set<string>();
  const storageSet = new Set<number>();
  for (const variant of product.variants) {
    colorSet.add(variant.colorCode);
    storageSet.add(variant.storageGb);
  }
  const out: DisabledCombination[] = [];
  for (const colorCode of colorSet) {
    for (const storageGb of storageSet) {
      const exists = product.variants.some(
        (v) => v.colorCode === colorCode && v.storageGb === storageGb,
      );
      if (exists) continue;
      const colorName = lookupColorName(product, colorCode);
      out.push({
        colorCode,
        storageGb,
        reason: `Ez a szín (${colorName}) nem elérhető ${String(storageGb)} GB kapacitással.`,
      });
    }
  }
  return out;
}

/** Looks up the colour label for a colorCode from any matching
 *  variant. Returns the raw code if no variant matches; that branch
 *  should not run because the disabled enumeration only emits codes
 *  present in the product, but the fallback keeps the function total. */
function lookupColorName(product: Product, colorCode: string): string {
  for (const variant of product.variants) {
    if (variant.colorCode === colorCode) return variant.colorName;
  }
  return colorCode;
}

// ---------------------------------------------------------------------------
// Pair selection — AC02
// ---------------------------------------------------------------------------

/**
 * Resolves a (color, storage) pair to a concrete variant. When the
 * pair exists, the new variant wins. When it does not, the previous
 * selection is preserved and `pairAvailable` is false so the page can
 * keep showing the active variant without silently substituting a
 * different SKU.
 */
export function selectVariantByPair(
  product: Product,
  colorCode: string,
  storageGb: number,
  currentVariantId: string,
): VariantLookup {
  const match = product.variants.find(
    (v) => v.colorCode === colorCode && v.storageGb === storageGb,
  );
  if (match) return { variant: match, pairAvailable: true };
  const fallback = product.variants.find((v) => v.id === currentVariantId);
  if (fallback) return { variant: fallback, pairAvailable: false };
  return { variant: product.defaultVariant, pairAvailable: false };
}

// ---------------------------------------------------------------------------
// Image selection — AC03
// ---------------------------------------------------------------------------

/**
 * Picks an image from the supplied gallery. Returns the image whose
 * id matches `imageId` when present, otherwise the first image in
 * the gallery. Returns `null` for an empty gallery.
 *
 * The function intentionally never falls back to a different
 * variant's gallery: callers must reset `imageId` to `null` when
 * they switch variants so AC03's "same variant owns the gallery"
 * rule holds.
 */
export function selectImageFromGallery(
  gallery: readonly Image[],
  imageId: string | null,
): ImagePick {
  if (gallery.length === 0) return { image: null, index: -1 };
  if (imageId !== null) {
    const idx = gallery.findIndex((i) => i.id === imageId);
    if (idx >= 0) return { image: gallery[idx], index: idx };
  }
  return { image: gallery[0], index: 0 };
}

// ---------------------------------------------------------------------------
// Quantity validation — AC05
// ---------------------------------------------------------------------------

/**
 * Validates the user's quantity against the selected variant's
 * stock. The function deliberately returns the original `quantity`
 * value (floored and floored to non-negative) even when it is
 * outside the allowed range. AC05 requires the page to *display*
 * the validation (e.g. "max 2") rather than silently rewriting the
 * input — callers render the `overMax` / `belowMin` flags as
 * guidance and leave the explicit value untouched.
 */
export function validateQuantity(quantity: number, maxQuantity: number): QuantityValidation {
  const safeMax = Math.max(0, Math.floor(maxQuantity));
  const safeQty = Math.max(0, Math.floor(quantity));
  return {
    quantity: safeQty,
    overMax: safeQty > safeMax,
    belowMin: safeQty < 1,
  };
}

// ---------------------------------------------------------------------------
// Add-to-cart state — AC04 / AC01
// ---------------------------------------------------------------------------

/**
 * Computes whether the "Add to cart" action is enabled and, when
 * not, the Hungarian reason the page should display.
 *
 * Disabled when any of these hold:
 *   - `variant` is null (no product / no selection)
 *   - `invalidQuery` is non-null (the route pointed at an unknown
 *     variant and the user has not yet confirmed a replacement)
 *   - the variant is `out_of_stock`
 *   - the quantity is below one
 *   - the quantity exceeds the variant's `maxQuantity`
 */
export function computeAddToCartState(input: {
  readonly variant: Variant | null;
  readonly quantityValidation: QuantityValidation;
  readonly invalidQuery: string | null;
}): AddToCartState {
  const { variant, quantityValidation, invalidQuery } = input;
  if (variant === null) {
    return { enabled: false, reason: 'Válassz variánst a kosárhoz adáshoz.' };
  }
  if (invalidQuery !== null) {
    return {
      enabled: false,
      reason: 'A linkben megadott változat nem található; válassz a listából.',
    };
  }
  if (variant.availability === 'out_of_stock') {
    return { enabled: false, reason: 'Ez a változat jelenleg nem elérhető.' };
  }
  if (quantityValidation.belowMin) {
    return { enabled: false, reason: 'A mennyiségnek legalább 1 darabnak kell lennie.' };
  }
  if (quantityValidation.overMax) {
    // Surface the effective cap (the variant's maxQuantity clamped to the
    // server-side MAX_LINE_QUANTITY) so the message matches the value the
    // mock actually accepts. Without this, a fixture advertising
    // maxQuantity > 5 would tell the user "Maximum 10 darab rendelhető"
    // and the cart would reject the value as QUANTITY_LIMIT.
    const effectiveMax = Math.min(variant.maxQuantity, MAX_LINE_QUANTITY);
    return {
      enabled: false,
      reason: `Maximum ${String(effectiveMax)} darab rendelhető ebből a változatból.`,
    };
  }
  return { enabled: true, reason: null };
}

// ---------------------------------------------------------------------------
// URL codec — `?variant=<id>`
// ---------------------------------------------------------------------------

/**
 * Extracts the `?variant=` query value from a raw URL search string.
 * Empty strings and whitespace-only values are dropped so callers can
 * treat `null` uniformly as "no query".
 */
export function parseVariantQuery(params: URLSearchParams): string | null {
  const raw = params.get('variant');
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  return trimmed;
}

/**
 * Encodes a variant id for the URL. Returns an empty
 * URLSearchParams when `variantId` is null or empty so the caller
 * can append it without special-casing the absent case.
 */
export function serializeVariantQuery(variantId: string | null): URLSearchParams {
  const params = new URLSearchParams();
  if (variantId !== null && variantId.length > 0) {
    params.set('variant', variantId);
  }
  return params;
}
