import { http, HttpResponse } from 'msw';
import type { DefaultBodyType, HttpHandler } from 'msw';

import type { AdminProduct } from '../app/api/generated/models/admin-product';
import type { AdminProductColor } from '../app/api/generated/models/admin-product-color';
import type { AdminProductColorInput } from '../app/api/generated/models/admin-product-color-input';
import type { AdminProductInput } from '../app/api/generated/models/admin-product-input';
import type { AdminProductStatus } from '../app/api/generated/models/admin-product-status';
import type { AdminProductVariant } from '../app/api/generated/models/admin-product-variant';
import type { AdminProductVariantInput } from '../app/api/generated/models/admin-product-variant-input';
import type { AdminSpecGroup } from '../app/api/generated/models/admin-spec-group';
import type { AdminSpecRow } from '../app/api/generated/models/admin-spec-row';
import type { FieldError } from '../app/api/generated/models/field-error';
import type { Money } from '../app/api/generated/models/money';
import type { Problem } from '../app/api/generated/models/problem';
import type { StorageGb } from '../app/api/generated/models/storage-gb';
import { isRecord } from '../app/core/is-record';

import {
  asText,
  bodyViolations,
  fieldError,
  hasOnlyMembers,
  isTextual,
  malformedBody,
  notAcceptable,
  readJsonObject,
  unknownQueryParameter,
  wrongType,
} from './backend-answers';
import type { MockDb } from './db';
import { csrfRejection, sessionRejection } from './guards';
import { problem } from './problem';

const SLUG_SEGMENT_PATTERN = /^[a-z0-9]+$/;

/**
 * Same accepted set as the contract's `^[a-z0-9]+(?:-[a-z0-9]+)*$`, without
 * the nested-quantifier shape `security/detect-unsafe-regex` flags: split on
 * `-` and require every segment to match the single-quantifier pattern.
 */
function isValidSlug(slug: string): boolean {
  return slug.split('-').every((segment) => SLUG_SEGMENT_PATTERN.test(segment));
}

// --- Reading the body (Jackson, measured; see the brief's §3) ------------------------

/** Marks a body shape the backend answers with `malformedBody()`, wherever it occurs. */
const MALFORMED: unique symbol = Symbol('malformed');
type Malformed = typeof MALFORMED;

/** Either the read value (`undefined` for absent/`null`, "no value"), or `MALFORMED`. */
type Read<T> = T | undefined | Malformed;

type ReadPrice = Partial<Money>;
type ReadColor = Partial<AdminProductColorInput>;
type ReadVariant = Omit<Partial<AdminProductVariantInput>, 'price'> & {
  readonly price?: ReadPrice;
};
type ReadSpecRow = Partial<AdminSpecRow>;
type ReadSpecGroup = Omit<Partial<AdminSpecGroup>, 'rows'> & {
  readonly rows?: readonly (ReadSpecRow | undefined)[];
};
type ReadInput = Omit<
  Partial<AdminProductInput>,
  'highlights' | 'colors' | 'variants' | 'specGroups'
> & {
  readonly highlights?: readonly (string | undefined)[];
  readonly colors?: readonly (ReadColor | undefined)[];
  readonly variants?: readonly (ReadVariant | undefined)[];
  readonly specGroups?: readonly (ReadSpecGroup | undefined)[];
};

const TOP_MEMBERS = [
  'slug',
  'brand',
  'name',
  'description',
  'is5g',
  'releasedAt',
  'rank',
  'popularityScore',
  'featured',
  'highlights',
  'colors',
  'variants',
  'specGroups',
] as const;
const COLOR_MEMBERS = ['code', 'name', 'swatchHex', 'imageId', 'alt'] as const;
const VARIANT_MEMBERS = ['slug', 'colorCode', 'storageGb', 'price', 'stock'] as const;
const PRICE_MEMBERS = ['amount', 'currency'] as const;
const SPEC_GROUP_MEMBERS = ['title', 'rows'] as const;
const SPEC_ROW_MEMBERS = ['label', 'value'] as const;

const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;
const INTEGER_STRING_PATTERN = /^[+-]?[0-9]+$/;

/** A string member as Jackson reads it: a scalar as text; an array or object is malformed. */
function readString(value: unknown): Read<string> {
  if (value === undefined || value === null) return undefined;
  if (!isTextual(value)) return MALFORMED;
  return asText(value);
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

/** A `LocalDate` member: `YYYY-MM-DD` and a real calendar date; `""` is no value. */
function readDate(value: unknown): Read<string> {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return MALFORMED;
  if (value === '') return undefined;
  return isValidCalendarDate(value) ? value : MALFORMED;
}

/** An `Integer` member: a JSON number truncated toward zero, or a digit-only string. */
function readInteger(value: unknown): Read<number> {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') {
    const truncated = Math.trunc(value);
    return truncated < INT32_MIN || truncated > INT32_MAX ? MALFORMED : truncated;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return undefined;
    if (!INTEGER_STRING_PATTERN.test(trimmed)) return MALFORMED;
    const parsed = Number(trimmed);
    return parsed < INT32_MIN || parsed > INT32_MAX ? MALFORMED : parsed;
  }
  return MALFORMED;
}

/** A `Boolean` member: `true`/`false`, the same as text, or 0/non-zero for an integer number. */
function readBoolean(value: unknown): Read<boolean> {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value === '' ? undefined : MALFORMED;
  }
  if (typeof value === 'number') return Number.isInteger(value) ? value !== 0 : MALFORMED;
  return MALFORMED;
}

/** A `StorageGb` member: read as `Integer` first, then narrowed to 128/256/512. */
function readStorageGb(value: unknown): Read<StorageGb> {
  const asInteger = readInteger(value);
  if (asInteger === MALFORMED || asInteger === undefined) return asInteger;
  return asInteger === 128 || asInteger === 256 || asInteger === 512 ? asInteger : MALFORMED;
}

/** A `CurrencyEnum` member: read as `String` first, then narrowed to exactly `HUF`. */
function readCurrency(value: unknown): Read<'HUF'> {
  const asString = readString(value);
  if (asString === MALFORMED || asString === undefined) return asString;
  return asString === 'HUF' ? asString : MALFORMED;
}

/** A single nested object member: absent/`null` is "no value"; extra keys are malformed. */
function readObject<T>(
  value: unknown,
  members: readonly string[],
  readShape: (obj: Record<string, unknown>) => T | Malformed,
): Read<T> {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value) || !hasOnlyMembers(value, members)) return MALFORMED;
  return readShape(value);
}

/** A JSON array of declared-shape objects; a `null` element stays a null element. */
function readObjectList<T>(
  value: unknown,
  members: readonly string[],
  readShape: (obj: Record<string, unknown>) => T | Malformed,
): Read<readonly (T | undefined)[]> {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return MALFORMED;
  const result: (T | undefined)[] = [];
  for (const item of value) {
    if (item === null) {
      result.push(undefined);
      continue;
    }
    if (!isRecord(item) || !hasOnlyMembers(item, members)) return MALFORMED;
    const read = readShape(item);
    if (read === MALFORMED) return MALFORMED;
    result.push(read);
  }
  return result;
}

/** A JSON array of `String` members (`highlights`); a `null` item stays a null element. */
function readStringList(value: unknown): Read<readonly (string | undefined)[]> {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return MALFORMED;
  const result: (string | undefined)[] = [];
  for (const item of value) {
    const read = readString(item);
    if (read === MALFORMED) return MALFORMED;
    result.push(read);
  }
  return result;
}

function readColorShape(obj: Record<string, unknown>): ReadColor | Malformed {
  const code = readString(obj['code']);
  if (code === MALFORMED) return MALFORMED;
  const name = readString(obj['name']);
  if (name === MALFORMED) return MALFORMED;
  const swatchHex = readString(obj['swatchHex']);
  if (swatchHex === MALFORMED) return MALFORMED;
  const imageId = readString(obj['imageId']);
  if (imageId === MALFORMED) return MALFORMED;
  const alt = readString(obj['alt']);
  if (alt === MALFORMED) return MALFORMED;
  return { code, name, swatchHex, imageId, alt };
}

function readPriceShape(obj: Record<string, unknown>): ReadPrice | Malformed {
  const amount = readInteger(obj['amount']);
  if (amount === MALFORMED) return MALFORMED;
  const currency = readCurrency(obj['currency']);
  if (currency === MALFORMED) return MALFORMED;
  return { amount, currency };
}

function readVariantShape(obj: Record<string, unknown>): ReadVariant | Malformed {
  const slug = readString(obj['slug']);
  if (slug === MALFORMED) return MALFORMED;
  const colorCode = readString(obj['colorCode']);
  if (colorCode === MALFORMED) return MALFORMED;
  const storageGb = readStorageGb(obj['storageGb']);
  if (storageGb === MALFORMED) return MALFORMED;
  const price = readObject(obj['price'], PRICE_MEMBERS, readPriceShape);
  if (price === MALFORMED) return MALFORMED;
  const stock = readInteger(obj['stock']);
  if (stock === MALFORMED) return MALFORMED;
  return { slug, colorCode, storageGb, price, stock };
}

function readSpecRowShape(obj: Record<string, unknown>): ReadSpecRow | Malformed {
  const label = readString(obj['label']);
  if (label === MALFORMED) return MALFORMED;
  const value = readString(obj['value']);
  if (value === MALFORMED) return MALFORMED;
  return { label, value };
}

function readSpecGroupShape(obj: Record<string, unknown>): ReadSpecGroup | Malformed {
  const title = readString(obj['title']);
  if (title === MALFORMED) return MALFORMED;
  const rows = readObjectList(obj['rows'], SPEC_ROW_MEMBERS, readSpecRowShape);
  if (rows === MALFORMED) return MALFORMED;
  return { title, rows };
}

/** The whole body: a JSON object with only declared top-level keys, read member by member. */
async function readProductInput(request: Request): Promise<ReadInput | Malformed> {
  const body = await readJsonObject(request, TOP_MEMBERS);
  if (body === undefined) return MALFORMED;

  const slug = readString(body['slug']);
  if (slug === MALFORMED) return MALFORMED;
  const brand = readString(body['brand']);
  if (brand === MALFORMED) return MALFORMED;
  const name = readString(body['name']);
  if (name === MALFORMED) return MALFORMED;
  const description = readString(body['description']);
  if (description === MALFORMED) return MALFORMED;
  const is5g = readBoolean(body['is5g']);
  if (is5g === MALFORMED) return MALFORMED;
  const releasedAt = readDate(body['releasedAt']);
  if (releasedAt === MALFORMED) return MALFORMED;
  const rank = readInteger(body['rank']);
  if (rank === MALFORMED) return MALFORMED;
  const popularityScore = readInteger(body['popularityScore']);
  if (popularityScore === MALFORMED) return MALFORMED;
  const featured = readBoolean(body['featured']);
  if (featured === MALFORMED) return MALFORMED;
  const highlights = readStringList(body['highlights']);
  if (highlights === MALFORMED) return MALFORMED;
  const colors = readObjectList(body['colors'], COLOR_MEMBERS, readColorShape);
  if (colors === MALFORMED) return MALFORMED;
  const variants = readObjectList(body['variants'], VARIANT_MEMBERS, readVariantShape);
  if (variants === MALFORMED) return MALFORMED;
  const specGroups = readObjectList(body['specGroups'], SPEC_GROUP_MEMBERS, readSpecGroupShape);
  if (specGroups === MALFORMED) return MALFORMED;

  return {
    slug,
    brand,
    name,
    description,
    is5g,
    releasedAt,
    rank,
    popularityScore,
    featured,
    highlights,
    colors,
    variants,
    specGroups,
  };
}

// --- Bean validation (every violation together, member declaration order; the brief's §4) --

function requiredOr<T>(
  value: T | undefined,
  path: string,
  checks: (value: T) => FieldError[],
): FieldError[] {
  return value === undefined ? [fieldError(path, 'REQUIRED')] : checks(value);
}

function sizeError(path: string, length: number, min: number, max: number): FieldError[] {
  return length < min || length > max ? [fieldError(path, 'SIZE')] : [];
}

function patternThenSize(
  value: string,
  path: string,
  pattern: (value: string) => boolean,
  max: number,
): FieldError[] {
  const errors: FieldError[] = [];
  if (!pattern(value)) errors.push(fieldError(path, 'PATTERN'));
  if (value.length > max) errors.push(fieldError(path, 'SIZE'));
  return errors;
}

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;
const IMAGE_ID_PATTERN = /^[0-9a-f]{64}$/;

function highlightsErrors(highlights: ReadInput['highlights']): FieldError[] {
  return requiredOr(highlights, '/highlights', (list) => {
    const errors = sizeError('/highlights', list.length, 1, 6);
    list.forEach((item, index) => {
      if (item === undefined) return;
      errors.push(...sizeError(`/highlights/${String(index)}`, item.length, 1, 280));
    });
    return errors;
  });
}

function colorsErrors(colors: ReadInput['colors']): FieldError[] {
  return requiredOr(colors, '/colors', (list) => {
    const errors = list.length < 1 ? [fieldError('/colors', 'SIZE')] : [];
    list.forEach((color, index) => {
      if (color === undefined) return;
      const base = `/colors/${String(index)}`;
      errors.push(
        ...requiredOr(color.code, `${base}/code`, (v) =>
          patternThenSize(v, `${base}/code`, isValidSlug, 40),
        ),
      );
      errors.push(
        ...requiredOr(color.name, `${base}/name`, (v) =>
          sizeError(`${base}/name`, v.length, 1, 80),
        ),
      );
      errors.push(
        ...requiredOr(color.swatchHex, `${base}/swatchHex`, (v) =>
          HEX_COLOR_PATTERN.test(v) ? [] : [fieldError(`${base}/swatchHex`, 'PATTERN')],
        ),
      );
      errors.push(
        ...requiredOr(color.imageId, `${base}/imageId`, (v) =>
          IMAGE_ID_PATTERN.test(v) ? [] : [fieldError(`${base}/imageId`, 'PATTERN')],
        ),
      );
      errors.push(
        ...requiredOr(color.alt, `${base}/alt`, (v) => sizeError(`${base}/alt`, v.length, 1, 280)),
      );
    });
    return errors;
  });
}

function variantsErrors(variants: ReadInput['variants']): FieldError[] {
  return requiredOr(variants, '/variants', (list) => {
    const errors = list.length < 1 ? [fieldError('/variants', 'SIZE')] : [];
    list.forEach((variant, index) => {
      if (variant === undefined) return;
      const base = `/variants/${String(index)}`;
      errors.push(
        ...requiredOr(variant.slug, `${base}/slug`, (v) =>
          patternThenSize(v, `${base}/slug`, isValidSlug, 120),
        ),
      );
      errors.push(...requiredOr(variant.colorCode, `${base}/colorCode`, () => []));
      errors.push(...requiredOr(variant.storageGb, `${base}/storageGb`, () => []));
      errors.push(
        ...requiredOr(variant.price, `${base}/price`, (price) => {
          const priceErrors: FieldError[] = [];
          priceErrors.push(
            ...requiredOr(price.amount, `${base}/price/amount`, (amount) => {
              const e: FieldError[] = [];
              if (amount < 0) e.push(fieldError(`${base}/price/amount`, 'MIN'));
              if (amount > 100000000) e.push(fieldError(`${base}/price/amount`, 'MAX'));
              return e;
            }),
          );
          priceErrors.push(...requiredOr(price.currency, `${base}/price/currency`, () => []));
          return priceErrors;
        }),
      );
      errors.push(
        ...requiredOr(variant.stock, `${base}/stock`, (stock) =>
          stock < 0 ? [fieldError(`${base}/stock`, 'MIN')] : [],
        ),
      );
    });
    return errors;
  });
}

function specGroupsErrors(specGroups: ReadInput['specGroups']): FieldError[] {
  return requiredOr(specGroups, '/specGroups', (list) => {
    const errors = list.length < 1 ? [fieldError('/specGroups', 'SIZE')] : [];
    list.forEach((group, index) => {
      if (group === undefined) return;
      const base = `/specGroups/${String(index)}`;
      errors.push(
        ...requiredOr(group.title, `${base}/title`, (v) =>
          sizeError(`${base}/title`, v.length, 1, 120),
        ),
      );
      errors.push(
        ...requiredOr(group.rows, `${base}/rows`, (rows) => {
          const rowErrors = rows.length < 1 ? [fieldError(`${base}/rows`, 'SIZE')] : [];
          rows.forEach((row, rowIndex) => {
            if (row === undefined) return;
            const rowBase = `${base}/rows/${String(rowIndex)}`;
            rowErrors.push(
              ...requiredOr(row.label, `${rowBase}/label`, (v) =>
                sizeError(`${rowBase}/label`, v.length, 1, 120),
              ),
            );
            rowErrors.push(
              ...requiredOr(row.value, `${rowBase}/value`, (v) =>
                sizeError(`${rowBase}/value`, v.length, 1, 2000),
              ),
            );
          });
          return rowErrors;
        }),
      );
    });
    return errors;
  });
}

function beanValidationErrors(input: ReadInput): FieldError[] {
  const errors: FieldError[] = [];
  errors.push(
    ...requiredOr(input.slug, '/slug', (v) => patternThenSize(v, '/slug', isValidSlug, 120)),
  );
  errors.push(...requiredOr(input.brand, '/brand', (v) => sizeError('/brand', v.length, 1, 80)));
  errors.push(...requiredOr(input.name, '/name', (v) => sizeError('/name', v.length, 1, 200)));
  errors.push(
    ...requiredOr(input.description, '/description', (v) =>
      v.length > 2000 ? [fieldError('/description', 'SIZE')] : [],
    ),
  );
  errors.push(...requiredOr(input.is5g, '/is5g', () => []));
  errors.push(...requiredOr(input.releasedAt, '/releasedAt', () => []));
  errors.push(...requiredOr(input.rank, '/rank', () => []));
  errors.push(...requiredOr(input.popularityScore, '/popularityScore', () => []));
  errors.push(...requiredOr(input.featured, '/featured', () => []));
  errors.push(...highlightsErrors(input.highlights));
  errors.push(...colorsErrors(input.colors));
  errors.push(...variantsErrors(input.variants));
  errors.push(...specGroupsErrors(input.specGroups));
  return errors;
}

// --- The validator (`AdminProductValidator`, same order; the brief's §5) -------------------

/**
 * "Blank" is every character Java whitespace: `Character.isWhitespace`, which
 * excludes the non-breaking spaces U+00A0, U+2007 and U+202F. `\u001C`-`\u001F`
 * (the FILE/GROUP/RECORD/UNIT SEPARATOR control characters) are part of that
 * set on purpose, not an accidental control character.
 */
const BLANK_PATTERN =
  // eslint-disable-next-line no-control-regex -- \u001C-\u001F are Java whitespace, matched on purpose
  /^[\t\n\v\f\r\u001C-\u001F\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]*$/;

function isBlank(value: string): boolean {
  return BLANK_PATTERN.test(value);
}

/** A value the invariant "the validator runs only after bean validation passed" guarantees present. */
function requireDefined<T>(value: T | undefined): T {
  if (value === undefined) {
    throw new Error('the validator ran on an input bean validation would have rejected');
  }
  return value;
}

function validatorErrors(input: ReadInput): FieldError[] {
  const errors: FieldError[] = [];
  const brand = requireDefined(input.brand);
  const name = requireDefined(input.name);
  if (isBlank(brand)) errors.push(fieldError('/brand', 'NOTBLANK'));
  if (isBlank(name)) errors.push(fieldError('/name', 'NOTBLANK'));

  requireDefined(input.highlights).forEach((item, index) => {
    const path = `/highlights/${String(index)}`;
    if (item === undefined) {
      errors.push(fieldError(path, 'REQUIRED'));
      return;
    }
    if (isBlank(item)) errors.push(fieldError(path, 'NOTBLANK'));
  });

  const colors = requireDefined(input.colors);
  const seenColorCodes = new Set<string>();
  colors.forEach((color, index) => {
    const base = `/colors/${String(index)}`;
    if (color === undefined) {
      errors.push(fieldError(base, 'REQUIRED'));
      return;
    }
    const code = requireDefined(color.code);
    if (seenColorCodes.has(code)) errors.push(fieldError(`${base}/code`, 'DUPLICATE_COLOR_CODE'));
    seenColorCodes.add(code);
    if (isBlank(requireDefined(color.name))) errors.push(fieldError(`${base}/name`, 'NOTBLANK'));
    if (isBlank(requireDefined(color.alt))) errors.push(fieldError(`${base}/alt`, 'NOTBLANK'));
  });

  const knownColorCodes = new Set(
    colors.flatMap((color) => (color === undefined ? [] : [requireDefined(color.code)])),
  );
  const seenVariantSlugs = new Set<string>();
  const seenVariantPairs = new Set<string>();
  const productSlug = requireDefined(input.slug);
  requireDefined(input.variants).forEach((variant, index) => {
    const base = `/variants/${String(index)}`;
    if (variant === undefined) {
      errors.push(fieldError(base, 'REQUIRED'));
      return;
    }
    const colorCode = requireDefined(variant.colorCode);
    const slug = requireDefined(variant.slug);
    const storageGb = requireDefined(variant.storageGb);
    if (!knownColorCodes.has(colorCode))
      errors.push(fieldError(`${base}/colorCode`, 'UNKNOWN_COLOR'));
    if (seenVariantSlugs.has(slug))
      errors.push(fieldError(`${base}/slug`, 'DUPLICATE_VARIANT_SLUG'));
    seenVariantSlugs.add(slug);
    const pairKey = `${colorCode}::${String(storageGb)}`;
    if (seenVariantPairs.has(pairKey))
      errors.push(fieldError(`${base}/storageGb`, 'DUPLICATE_VARIANT'));
    seenVariantPairs.add(pairKey);
    const variantId = `${productSlug}--${colorCode}--${String(storageGb)}`;
    if (variantId.length > 80) {
      errors.push(fieldError(`${base}/colorCode`, 'VARIANT_ID_TOO_LONG', { max: 80 }));
    }
  });

  requireDefined(input.specGroups).forEach((group, index) => {
    const base = `/specGroups/${String(index)}`;
    if (group === undefined) {
      errors.push(fieldError(base, 'REQUIRED'));
      return;
    }
    if (isBlank(requireDefined(group.title))) errors.push(fieldError(`${base}/title`, 'NOTBLANK'));
    requireDefined(group.rows).forEach((row, rowIndex) => {
      const rowBase = `${base}/rows/${String(rowIndex)}`;
      if (row === undefined) {
        errors.push(fieldError(rowBase, 'REQUIRED'));
        return;
      }
      if (isBlank(requireDefined(row.label)))
        errors.push(fieldError(`${rowBase}/label`, 'NOTBLANK'));
      if (isBlank(requireDefined(row.value)))
        errors.push(fieldError(`${rowBase}/value`, 'NOTBLANK'));
    });
  });

  return errors;
}

/** Builds the finished `AdminProductInput` once both bean validation and the validator pass. */
function toAdminProductInput(input: ReadInput): AdminProductInput {
  return {
    slug: requireDefined(input.slug),
    brand: requireDefined(input.brand),
    name: requireDefined(input.name),
    description: requireDefined(input.description),
    is5g: requireDefined(input.is5g),
    releasedAt: requireDefined(input.releasedAt),
    rank: requireDefined(input.rank),
    popularityScore: requireDefined(input.popularityScore),
    featured: requireDefined(input.featured),
    highlights: requireDefined(input.highlights).map((item) => requireDefined(item)),
    colors: requireDefined(input.colors).map((color) => {
      const value = requireDefined(color);
      return {
        code: requireDefined(value.code),
        name: requireDefined(value.name),
        swatchHex: requireDefined(value.swatchHex),
        imageId: requireDefined(value.imageId),
        alt: requireDefined(value.alt),
      };
    }),
    variants: requireDefined(input.variants).map((variant) => {
      const value = requireDefined(variant);
      const price = requireDefined(value.price);
      return {
        slug: requireDefined(value.slug),
        colorCode: requireDefined(value.colorCode),
        storageGb: requireDefined(value.storageGb),
        price: { amount: requireDefined(price.amount), currency: requireDefined(price.currency) },
        stock: requireDefined(value.stock),
      };
    }),
    specGroups: requireDefined(input.specGroups).map((group) => {
      const value = requireDefined(group);
      return {
        title: requireDefined(value.title),
        rows: requireDefined(value.rows).map((row) => {
          const rowValue = requireDefined(row);
          return { label: requireDefined(rowValue.label), value: requireDefined(rowValue.value) };
        }),
      };
    }),
  };
}

type BeanValidationResult =
  | { readonly ok: true; readonly input: ReadInput }
  | { readonly ok: false; readonly response: HttpResponse<Problem> };

/** §3 (read) and §4 (bean validation) together; the validator (§5) is a separate call. */
async function readAndBeanValidate(request: Request): Promise<BeanValidationResult> {
  const read = await readProductInput(request);
  if (read === MALFORMED) return { ok: false, response: malformedBody() };
  const errors = beanValidationErrors(read);
  if (errors.length > 0) return { ok: false, response: bodyViolations(errors) };
  return { ok: true, input: read };
}

// --- Query key, path id and If-Match (the brief's §2 and §6) -------------------------------

function firstQueryKey(request: Request): string | undefined {
  const url = new URL(request.url);
  return Array.from(url.searchParams.keys())[0];
}

const DECIMAL_ID_PATTERN = /^([+-]?)([0-9]+)$/;
const HEX_ID_PATTERN = /^(-?)(?:0[xX]|#)([0-9a-fA-F]+)$/;
const LONG_MIN = -9223372036854775808n;
const LONG_MAX = 9223372036854775807n;

/**
 * Spring's `Long` path conversion: whitespace stripped, then either a signed
 * decimal, or `0x`/`0X`/`#` hex digits with an optional leading `-` only —
 * `NumberUtils.parseNumber`'s `isHexNumber` strips just a leading minus
 * before the hex prefix, so `+0x1` is not a Long and falls through to
 * `wrongType`, while `-0x1` converts to -1.
 */
function parseProductId(raw: string): number | undefined {
  const cleaned = raw.replace(/\s+/g, '');
  const decimal = DECIMAL_ID_PATTERN.exec(cleaned);
  if (decimal !== null) {
    const magnitude = BigInt(decimal[2]);
    const value = decimal[1] === '-' ? -magnitude : magnitude;
    return value >= LONG_MIN && value <= LONG_MAX ? Number(value) : undefined;
  }
  const hex = HEX_ID_PATTERN.exec(cleaned);
  if (hex !== null) {
    const magnitude = BigInt(`0x${hex[2]}`);
    const value = hex[1] === '-' ? -magnitude : magnitude;
    return value >= LONG_MIN && value <= LONG_MAX ? Number(value) : undefined;
  }
  return undefined;
}

type IfMatchCheck =
  | { readonly kind: 'missing' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'present'; readonly version: number };

const IF_MATCH_PATTERN = /^"[0-9]+"$/;

/** `undefined` header is `'missing'`; any other present value, blanks included, is pattern-checked. */
function readIfMatch(request: Request): IfMatchCheck {
  const header = request.headers.get('If-Match');
  if (header === null) return { kind: 'missing' };
  if (!IF_MATCH_PATTERN.test(header)) return { kind: 'invalid' };
  return { kind: 'present', version: Number(header.slice(1, -1)) };
}

// --- Problem builders ----------------------------------------------------------------------

function productNotFound(productId: number): HttpResponse<DefaultBodyType> {
  return problem(404, 'NOT_FOUND', 'Resource not found', {
    detail: 'Product not found',
    params: { productId },
  });
}

function versionConflict(expected: number, received: number): HttpResponse<DefaultBodyType> {
  return problem(412, 'PRODUCT_VERSION_CONFLICT', 'Product version conflict', {
    params: { expected, received },
  });
}

// --- 422 stage 3 (database rules) -----------------------------------------------------

function slugTaken(db: MockDb, slug: string): boolean {
  for (const product of db.products.values()) {
    if (product.slug === slug) return true;
  }
  return false;
}

function unknownImageErrors(colors: readonly AdminProductColorInput[], db: MockDb): FieldError[] {
  const errors: FieldError[] = [];
  colors.forEach((color, index) => {
    if (!db.images.has(color.imageId)) {
      errors.push(fieldError(`/colors/${String(index)}/imageId`, 'UNKNOWN_IMAGE'));
    }
  });
  return errors;
}

function countOtherActiveFeatured(db: MockDb, excludeId: number | undefined): number {
  let count = 0;
  for (const product of db.products.values()) {
    if (product.id === excludeId) continue;
    if (product.status === 'active' && product.featured) count += 1;
  }
  return count;
}

function featuredLimitError(
  featured: boolean,
  productIsActive: boolean,
  db: MockDb,
  excludeId: number | undefined,
): FieldError | undefined {
  if (!featured || !productIsActive) return undefined;
  return countOtherActiveFeatured(db, excludeId) >= 4
    ? fieldError('/featured', 'FEATURED_LIMIT', { max: 4 })
    : undefined;
}

function createStage3Errors(input: AdminProductInput, db: MockDb): FieldError[] {
  const errors: FieldError[] = [];
  if (slugTaken(db, input.slug)) errors.push(fieldError('/slug', 'SLUG_TAKEN'));
  errors.push(...unknownImageErrors(input.colors, db));
  const limit = featuredLimitError(input.featured, true, db, undefined);
  if (limit !== undefined) errors.push(limit);
  return errors;
}

function replaceStage3Errors(
  input: AdminProductInput,
  db: MockDb,
  stored: AdminProduct,
): FieldError[] {
  const errors: FieldError[] = [];
  if (input.slug !== stored.slug) errors.push(fieldError('/slug', 'SLUG_IMMUTABLE'));
  errors.push(...unknownImageErrors(input.colors, db));
  const limit = featuredLimitError(input.featured, stored.status === 'active', db, stored.id);
  if (limit !== undefined) errors.push(limit);
  return errors;
}

// --- Building a stored product ---------------------------------------------------------

function buildColor(input: AdminProductColorInput, db: MockDb): AdminProductColor {
  const image = db.images.get(input.imageId);
  if (image === undefined) throw new Error(`unknown image ${input.imageId}`);
  return {
    code: input.code,
    name: input.name,
    swatchHex: input.swatchHex,
    image: {
      id: input.imageId,
      src: `/api/v1/media/${input.imageId}`,
      alt: input.alt,
      width: image.width,
      height: image.height,
    },
  };
}

function buildVariant(input: AdminProductVariantInput, productSlug: string): AdminProductVariant {
  return {
    id: `${productSlug}--${input.colorCode}--${String(input.storageGb)}`,
    slug: input.slug,
    colorCode: input.colorCode,
    storageGb: input.storageGb,
    price: input.price,
    stock: input.stock,
  };
}

interface ProductMeta {
  readonly id: number;
  readonly status: AdminProductStatus;
  readonly version: number;
  readonly archivedAt?: string;
}

function buildProduct(input: AdminProductInput, db: MockDb, meta: ProductMeta): AdminProduct {
  return {
    id: meta.id,
    slug: input.slug,
    brand: input.brand,
    name: input.name,
    description: input.description,
    is5g: input.is5g,
    releasedAt: input.releasedAt,
    rank: input.rank,
    popularityScore: input.popularityScore,
    featured: input.featured,
    status: meta.status,
    version: meta.version,
    ...(meta.archivedAt === undefined ? {} : { archivedAt: meta.archivedAt }),
    updatedAt: new Date().toISOString(),
    highlights: input.highlights,
    colors: input.colors.map((color) => buildColor(color, db)),
    variants: input.variants.map((variant) => buildVariant(variant, input.slug)),
    specGroups: input.specGroups,
  };
}

function archivedProduct(stored: AdminProduct): AdminProduct {
  return {
    ...stored,
    status: 'archived',
    archivedAt: new Date().toISOString(),
    version: stored.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

function restoredProduct(stored: AdminProduct): AdminProduct {
  const { archivedAt: _archivedAt, ...rest } = stored;
  return {
    ...rest,
    status: 'active',
    version: stored.version + 1,
    updatedAt: new Date().toISOString(),
  };
}

function productResponse(
  product: AdminProduct,
  status: number,
  extraHeaders: Record<string, string> = {},
): HttpResponse<DefaultBodyType> {
  return HttpResponse.json(product, {
    status,
    headers: { ETag: `"${String(product.version)}"`, ...extraHeaders },
  });
}

// --- Handlers ----------------------------------------------------------------------------

function createHandler(db: MockDb): HttpHandler {
  return http.post('*/api/v1/admin/products', async ({ request }) => {
    const guard = csrfRejection(db, request) ?? sessionRejection(db);
    if (guard !== undefined) return guard;

    const queryKey = firstQueryKey(request);
    if (queryKey !== undefined) return unknownQueryParameter(queryKey);

    const read = await readAndBeanValidate(request);
    if (!read.ok) return read.response;

    const validation = validatorErrors(read.input);
    if (validation.length > 0) return bodyViolations(validation);

    const body = toAdminProductInput(read.input);

    const stage3 = createStage3Errors(body, db);
    if (stage3.length > 0) return bodyViolations(stage3);

    const id = db.nextProductId;
    db.nextProductId += 1;
    const product = buildProduct(body, db, { id, status: 'active', version: 0 });
    db.products.set(id, product);

    return productResponse(product, 201, { Location: `/api/v1/admin/products/${String(id)}` });
  });
}

function replaceHandler(db: MockDb): HttpHandler {
  return http.put('*/api/v1/admin/products/:productId', async ({ request, params }) => {
    const guard = csrfRejection(db, request) ?? sessionRejection(db);
    if (guard !== undefined) return guard;

    const queryKey = firstQueryKey(request);
    if (queryKey !== undefined) return unknownQueryParameter(queryKey);

    const id = parseProductId(String(params['productId']));
    if (id === undefined) return wrongType('productId', 'Long');

    const read = await readAndBeanValidate(request);
    if (!read.ok) return read.response;

    if (id < 1) return notAcceptable('productId', 'MIN');

    const ifMatch = readIfMatch(request);
    if (ifMatch.kind === 'invalid') return notAcceptable('ifMatch', 'PATTERN');

    const stored = db.products.get(id);
    if (stored === undefined) return productNotFound(id);

    if (ifMatch.kind === 'missing') {
      return problem(428, 'PRECONDITION_REQUIRED', 'If-Match required');
    }

    if (db.scenario === 'save-conflict') return versionConflict(stored.version, ifMatch.version);
    if (ifMatch.version !== stored.version) return versionConflict(stored.version, ifMatch.version);

    const validation = validatorErrors(read.input);
    if (validation.length > 0) return bodyViolations(validation);

    const body = toAdminProductInput(read.input);

    const stage3 = replaceStage3Errors(body, db, stored);
    if (stage3.length > 0) return bodyViolations(stage3);

    const next = buildProduct(body, db, {
      id: stored.id,
      status: stored.status,
      version: stored.version + 1,
      ...(stored.archivedAt === undefined ? {} : { archivedAt: stored.archivedAt }),
    });
    db.products.set(id, next);

    return productResponse(next, 200);
  });
}

function archiveHandler(db: MockDb): HttpHandler {
  return http.post('*/api/v1/admin/products/:productId/archive', ({ request, params }) => {
    const guard = csrfRejection(db, request) ?? sessionRejection(db);
    if (guard !== undefined) return guard;

    const queryKey = firstQueryKey(request);
    if (queryKey !== undefined) return unknownQueryParameter(queryKey);

    const id = parseProductId(String(params['productId']));
    if (id === undefined) return wrongType('productId', 'Long');

    if (id < 1) return notAcceptable('productId', 'MIN');

    const ifMatch = readIfMatch(request);
    if (ifMatch.kind === 'invalid') return notAcceptable('ifMatch', 'PATTERN');

    const stored = db.products.get(id);
    if (stored === undefined) return productNotFound(id);

    if (ifMatch.kind === 'missing') {
      return problem(428, 'PRECONDITION_REQUIRED', 'If-Match required');
    }
    if (ifMatch.version !== stored.version) return versionConflict(stored.version, ifMatch.version);

    if (stored.status === 'archived') return productResponse(stored, 200);

    const next = archivedProduct(stored);
    db.products.set(id, next);
    return productResponse(next, 200);
  });
}

function restoreHandler(db: MockDb): HttpHandler {
  return http.post('*/api/v1/admin/products/:productId/restore', ({ request, params }) => {
    const guard = csrfRejection(db, request) ?? sessionRejection(db);
    if (guard !== undefined) return guard;

    const queryKey = firstQueryKey(request);
    if (queryKey !== undefined) return unknownQueryParameter(queryKey);

    const id = parseProductId(String(params['productId']));
    if (id === undefined) return wrongType('productId', 'Long');

    if (id < 1) return notAcceptable('productId', 'MIN');

    const ifMatch = readIfMatch(request);
    if (ifMatch.kind === 'invalid') return notAcceptable('ifMatch', 'PATTERN');

    const stored = db.products.get(id);
    if (stored === undefined) return productNotFound(id);

    if (ifMatch.kind === 'missing') {
      return problem(428, 'PRECONDITION_REQUIRED', 'If-Match required');
    }
    if (ifMatch.version !== stored.version) return versionConflict(stored.version, ifMatch.version);

    if (stored.status === 'active') return productResponse(stored, 200);

    if (stored.featured && countOtherActiveFeatured(db, stored.id) >= 4) {
      return problem(409, 'FEATURED_LIMIT', 'Featured limit reached');
    }

    const next = restoredProduct(stored);
    db.products.set(id, next);
    return productResponse(next, 200);
  });
}

/** Create, replace, archive and restore for `AdminProduct` — the way units B11/B12 will. */
export function productsWriteHandlers(db: MockDb): HttpHandler[] {
  return [createHandler(db), replaceHandler(db), archiveHandler(db), restoreHandler(db)];
}
