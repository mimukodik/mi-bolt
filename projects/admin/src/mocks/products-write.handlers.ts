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
import type { StorageGb } from '../app/api/generated/models/storage-gb';
import { isRecord } from '../app/core/is-record';

import type { MockDb } from './db';
import { csrfRejection, sessionRejection } from './guards';
import { problem } from './problem';

const PRODUCT_ID_PATTERN = /^[0-9]+$/;
const IF_MATCH_PATTERN = /^"[0-9]+"$/;

// --- AdminProductInput narrowing -------------------------------------------------

function isMoney(value: unknown): value is Money {
  return isRecord(value) && typeof value['amount'] === 'number' && value['currency'] === 'HUF';
}

function isStorageGb(value: unknown): value is StorageGb {
  return value === 128 || value === 256 || value === 512;
}

function isAdminProductColorInput(value: unknown): value is AdminProductColorInput {
  return (
    isRecord(value) &&
    typeof value['code'] === 'string' &&
    typeof value['name'] === 'string' &&
    typeof value['swatchHex'] === 'string' &&
    typeof value['imageId'] === 'string' &&
    typeof value['alt'] === 'string'
  );
}

function isAdminProductVariantInput(value: unknown): value is AdminProductVariantInput {
  return (
    isRecord(value) &&
    typeof value['slug'] === 'string' &&
    typeof value['colorCode'] === 'string' &&
    isStorageGb(value['storageGb']) &&
    isMoney(value['price']) &&
    typeof value['stock'] === 'number'
  );
}

function isAdminSpecRow(value: unknown): value is AdminSpecRow {
  return (
    isRecord(value) && typeof value['label'] === 'string' && typeof value['value'] === 'string'
  );
}

function isAdminSpecGroup(value: unknown): value is AdminSpecGroup {
  return (
    isRecord(value) &&
    typeof value['title'] === 'string' &&
    Array.isArray(value['rows']) &&
    value['rows'].every(isAdminSpecRow)
  );
}

/** One check per `AdminProductInput` required member, in the schema's `required` order. */
const REQUIRED_MEMBERS: readonly (readonly [string, (value: unknown) => boolean])[] = [
  ['slug', (value) => typeof value === 'string'],
  ['brand', (value) => typeof value === 'string'],
  ['name', (value) => typeof value === 'string'],
  ['description', (value) => typeof value === 'string'],
  ['is5g', (value) => typeof value === 'boolean'],
  ['releasedAt', (value) => typeof value === 'string'],
  ['rank', (value) => typeof value === 'number'],
  ['popularityScore', (value) => typeof value === 'number'],
  ['featured', (value) => typeof value === 'boolean'],
  [
    'highlights',
    (value) => Array.isArray(value) && value.every((item) => typeof item === 'string'),
  ],
  ['colors', (value) => Array.isArray(value) && value.every(isAdminProductColorInput)],
  ['variants', (value) => Array.isArray(value) && value.every(isAdminProductVariantInput)],
  ['specGroups', (value) => Array.isArray(value) && value.every(isAdminSpecGroup)],
];

/** The first top-level member (in `required` order) that fails its check, or `undefined`. */
function firstMissingMember(value: unknown): string | undefined {
  const record: Record<string, unknown> = isRecord(value) ? value : {};
  for (const [member, check] of REQUIRED_MEMBERS) {
    if (!check(record[member])) return member;
  }
  return undefined;
}

/** Narrowed by `isRecord` and `typeof`/enum checks on every required member, nested inputs included. */
function isAdminProductInput(value: unknown): value is AdminProductInput {
  return firstMissingMember(value) === undefined;
}

// --- Problem builders --------------------------------------------------------------

function invalidParam(parameter: string): HttpResponse<DefaultBodyType> {
  return problem(400, 'INVALID_REQUEST', 'Invalid request', {
    detail: 'Query or path parameter is not acceptable',
    params: { parameter },
  });
}

function requiredMemberError(body: unknown): HttpResponse<DefaultBodyType> {
  const member = firstMissingMember(body);
  if (member === undefined)
    throw new Error('isAdminProductInput rejected a body with no failing member');
  return problem(400, 'INVALID_REQUEST', 'Invalid request', {
    detail: 'Missing required member',
    fieldErrors: [{ path: `/${member}`, code: 'REQUIRED' }],
  });
}

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

function problem422(fieldErrors: readonly FieldError[]): HttpResponse<DefaultBodyType> {
  return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
    detail: 'One or more supplied fields are not acceptable',
    fieldErrors,
  });
}

// --- Path id and If-Match ------------------------------------------------------------

function parseProductId(raw: string): number | undefined {
  if (!PRODUCT_ID_PATTERN.test(raw)) return undefined;
  const id = Number(raw);
  return id >= 1 ? id : undefined;
}

type IfMatchCheck =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'present'; readonly version: number };

/** `undefined`/blank-after-trim is `'missing'`; present but not `"<digits>"` is `'invalid'`. */
function readIfMatch(request: Request): IfMatchCheck {
  const header = request.headers.get('If-Match');
  if (header === null || header.trim() === '') return { kind: 'missing' };
  if (!IF_MATCH_PATTERN.test(header)) return { kind: 'invalid' };
  return { kind: 'present', version: Number(header.slice(1, -1)) };
}

// --- 422 stage 1 (schema) and stage 2 (cross-field) -----------------------------------

const SLUG_SEGMENT_PATTERN = /^[a-z0-9]+$/;

/**
 * Same accepted set as the contract's `^[a-z0-9]+(?:-[a-z0-9]+)*$`, without
 * the nested-quantifier shape `security/detect-unsafe-regex` flags: split on
 * `-` and require every segment to match the single-quantifier pattern.
 */
function isValidSlug(slug: string): boolean {
  return slug.split('-').every((segment) => SLUG_SEGMENT_PATTERN.test(segment));
}

function slugPatternError(slug: string): FieldError | undefined {
  return isValidSlug(slug) ? undefined : { path: '/slug', code: 'PATTERN' };
}

function duplicateColorErrors(colors: readonly AdminProductColorInput[]): FieldError[] {
  const errors: FieldError[] = [];
  const seen = new Set<string>();
  colors.forEach((color, index) => {
    if (seen.has(color.code))
      errors.push({ path: `/colors/${String(index)}/code`, code: 'DUPLICATE_COLOR_CODE' });
    seen.add(color.code);
  });
  return errors;
}

function duplicateVariantErrors(variants: readonly AdminProductVariantInput[]): FieldError[] {
  const errors: FieldError[] = [];
  const seen = new Set<string>();
  variants.forEach((variant, index) => {
    const key = `${variant.colorCode}::${String(variant.storageGb)}`;
    if (seen.has(key))
      errors.push({ path: `/variants/${String(index)}/storageGb`, code: 'DUPLICATE_VARIANT' });
    seen.add(key);
  });
  return errors;
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
    if (!db.images.has(color.imageId))
      errors.push({ path: `/colors/${String(index)}/imageId`, code: 'UNKNOWN_IMAGE' });
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
    ? { path: '/featured', code: 'FEATURED_LIMIT', params: { max: 4 } }
    : undefined;
}

function createStage3Errors(input: AdminProductInput, db: MockDb): FieldError[] {
  const errors: FieldError[] = [];
  if (slugTaken(db, input.slug)) errors.push({ path: '/slug', code: 'SLUG_TAKEN' });
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
  if (input.slug !== stored.slug) errors.push({ path: '/slug', code: 'SLUG_IMMUTABLE' });
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

    const body: unknown = await request.json();
    if (!isAdminProductInput(body)) return requiredMemberError(body);

    const slugError = slugPatternError(body.slug);
    if (slugError !== undefined) return problem422([slugError]);

    const stage2 = [...duplicateColorErrors(body.colors), ...duplicateVariantErrors(body.variants)];
    if (stage2.length > 0) return problem422(stage2);

    const stage3 = createStage3Errors(body, db);
    if (stage3.length > 0) return problem422(stage3);

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

    const id = parseProductId(String(params['productId']));
    if (id === undefined) return invalidParam('productId');

    const body: unknown = await request.json();
    if (!isAdminProductInput(body)) return requiredMemberError(body);

    const slugError = slugPatternError(body.slug);
    if (slugError !== undefined) return problem422([slugError]);

    const ifMatch = readIfMatch(request);
    if (ifMatch.kind === 'invalid') return invalidParam('If-Match');

    const stored = db.products.get(id);
    if (stored === undefined) return productNotFound(id);

    if (ifMatch.kind === 'missing')
      return problem(428, 'PRECONDITION_REQUIRED', 'If-Match required');

    if (db.scenario === 'save-conflict') return versionConflict(stored.version, ifMatch.version);
    if (ifMatch.version !== stored.version) return versionConflict(stored.version, ifMatch.version);

    const stage2 = [...duplicateColorErrors(body.colors), ...duplicateVariantErrors(body.variants)];
    if (stage2.length > 0) return problem422(stage2);

    const stage3 = replaceStage3Errors(body, db, stored);
    if (stage3.length > 0) return problem422(stage3);

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

    const id = parseProductId(String(params['productId']));
    if (id === undefined) return invalidParam('productId');

    const ifMatch = readIfMatch(request);
    if (ifMatch.kind === 'invalid') return invalidParam('If-Match');

    const stored = db.products.get(id);
    if (stored === undefined) return productNotFound(id);

    if (ifMatch.kind === 'missing')
      return problem(428, 'PRECONDITION_REQUIRED', 'If-Match required');
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

    const id = parseProductId(String(params['productId']));
    if (id === undefined) return invalidParam('productId');

    const ifMatch = readIfMatch(request);
    if (ifMatch.kind === 'invalid') return invalidParam('If-Match');

    const stored = db.products.get(id);
    if (stored === undefined) return productNotFound(id);

    if (ifMatch.kind === 'missing')
      return problem(428, 'PRECONDITION_REQUIRED', 'If-Match required');
    if (ifMatch.version !== stored.version) return versionConflict(stored.version, ifMatch.version);

    if (stored.status === 'active') return productResponse(stored, 200);

    if (stored.featured && countOtherActiveFeatured(db, stored.id) >= 4)
      return problem(409, 'FEATURED_LIMIT', 'Featured limit reached');

    const next = restoredProduct(stored);
    db.products.set(id, next);
    return productResponse(next, 200);
  });
}

/** Create, replace, archive and restore for `AdminProduct` — the way units B11/B12 will. */
export function productsWriteHandlers(db: MockDb): HttpHandler[] {
  return [createHandler(db), replaceHandler(db), archiveHandler(db), restoreHandler(db)];
}
