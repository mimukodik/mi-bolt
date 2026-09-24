/**
 * Spec for the reading and validation pipeline inside
 * `products-write.handlers.ts`: how the body is read the way Jackson reads
 * it (§3), bean validation (§4), the `AdminProductValidator` rules (§5), the
 * `productId`/`If-Match` conversion (§6) and the order the checks run in
 * (§2). Every expected answer is a literal read from the brief
 * (`mim-335-f8-r2-validation.md`), measured on the backend or its code.
 *
 * The fixture is `seedCatalog()`'s product 5 (`honor-600-lite`, colours
 * `fekete`/`zold`, one variant per colour at 128GB), read directly from the
 * catalogue rather than hand-typed, so its image ids and Hungarian text stay
 * real. Its `slug` is overridden to `validation-fixture`, which nothing in
 * the seed uses, so a create never collides with `SLUG_TAKEN`.
 */
import { describe, expect, it } from 'vitest';

import type { ProblemCode } from '../app/api/generated/models/problem-code';
import type { AdminProductInput } from '../app/api/generated/models/admin-product-input';
import { isRecord } from '../app/core/is-record';

import { useMswServer } from '../testing/msw-server';
import {
  action,
  archiveUrl,
  expectRecord,
  fieldErrorsOf,
  headersFor,
  productUrl,
  productsUrl,
  readJsonRecord,
  readNumber,
  readString,
  restoreUrl,
  setup,
} from '../testing/mock-spec-helpers';
import type { MockDb } from './db';
import { seedCatalog } from './seed';

useMswServer();

function postJson(
  url: string,
  db: MockDb,
  body: unknown,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: headersFor(db, headerOverrides),
    body: JSON.stringify(body),
  });
}

function postRaw(
  url: string,
  db: MockDb,
  rawBody: string,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, { method: 'POST', headers: headersFor(db, headerOverrides), body: rawBody });
}

function putJson(
  url: string,
  db: MockDb,
  body: unknown,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, {
    method: 'PUT',
    headers: headersFor(db, headerOverrides),
    body: JSON.stringify(body),
  });
}

function putRaw(
  url: string,
  db: MockDb,
  rawBody: string,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, { method: 'PUT', headers: headersFor(db, headerOverrides), body: rawBody });
}

async function expectProblem(
  response: Response,
  status: number,
  code: ProblemCode,
  title: string,
  detail: string,
): Promise<Record<string, unknown>> {
  expect(response.status).toBe(status);
  const body = await readJsonRecord(response);
  expect(readString(body, 'code')).toBe(code);
  expect(readString(body, 'title')).toBe(title);
  expect(readString(body, 'detail')).toBe(detail);
  return body;
}

// --- The fixture and the `withChanges` helper -----------------------------------------

/** Product 5 (`honor-600-lite`), read straight from the catalogue, `slug` made unique. */
function baseProductInput(): AdminProductInput {
  const product = seedCatalog().products.find((candidate) => candidate.id === 5);
  if (product === undefined) throw new Error('seed product 5 (honor-600-lite) is missing');
  return {
    slug: 'validation-fixture',
    brand: product.brand,
    name: product.name,
    description: product.description,
    is5g: product.is5g,
    releasedAt: product.releasedAt,
    rank: product.rank,
    popularityScore: product.popularityScore,
    featured: false,
    highlights: [...product.highlights],
    colors: product.colors.map((color) => ({
      code: color.code,
      name: color.name,
      swatchHex: color.swatchHex,
      imageId: color.image.id,
      alt: color.image.alt,
    })),
    variants: product.variants.map((variant) => ({
      slug: variant.slug,
      colorCode: variant.colorCode,
      storageGb: variant.storageGb,
      price: variant.price,
      stock: variant.stock,
    })),
    specGroups: product.specGroups.map((group) => ({
      title: group.title,
      rows: group.rows.map((row) => ({ label: row.label, value: row.value })),
    })),
  };
}

/** A JSON-serialisable clone of the fixture, loose enough to carry a deliberately malformed value. */
function baseBody(): Record<string, unknown> {
  const clone: unknown = structuredClone(baseProductInput());
  if (!isRecord(clone)) throw new Error('the fixture did not clone to an object');
  return clone;
}

function requireArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('withChanges: expected an array in the fixture body');
  return value;
}

function requireRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('withChanges: expected an object in the fixture body');
  return value;
}

type PathSegment = string | number;

function memberAt(node: unknown, key: PathSegment): unknown {
  return typeof key === 'number' ? requireArray(node)[key] : requireRecord(node)[key];
}

function setMember(node: unknown, key: PathSegment, value: unknown): void {
  if (typeof key === 'number') requireArray(node)[key] = value;
  else requireRecord(node)[key] = value;
}

function segmentsOf(path: string): readonly PathSegment[] {
  return path.split('.').map((segment) => (/^[0-9]+$/.test(segment) ? Number(segment) : segment));
}

/** A clone of `base` with each `path` (dotted, numeric segments index arrays) set to its `value`. */
function withChanges(
  base: Record<string, unknown>,
  ...changes: readonly (readonly [string, unknown])[]
): Record<string, unknown> {
  const clone = structuredClone(base);
  for (const [path, value] of changes) {
    const segments = segmentsOf(path);
    const leadingSegments = segments.slice(0, -1);
    const lastSegment = segments[segments.length - 1];
    let node: unknown = clone;
    for (const segment of leadingSegments) node = memberAt(node, segment);
    setMember(node, lastSegment, value);
  }
  return clone;
}

describe('products-write validation', () => {
  describe('reading the body (§3)', () => {
    // Fails if readJsonObject stops rejecting a body that is not JSON at all.
    it('a non-JSON body is malformed, with no field errors', async () => {
      const db = setup();
      const response = await postRaw(productsUrl(), db, '{not json');
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
      expect(fieldErrorsOf(body)).toEqual([]);
    });

    // Fails if hasOnlyMembers stops rejecting an undeclared top-level member.
    it('an undeclared top-level member is malformed', async () => {
      const db = setup();
      const response = await postJson(productsUrl(), db, withChanges(baseBody(), ['extra', 1]));
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if readColorShape stops rejecting an undeclared nested member.
    it('an undeclared nested member is malformed', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['colors.0.hex', '#000000']),
      );
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if readInteger stops reading a digit-only string as that integer.
    it('an integer as a digit string is read as that integer (201)', async () => {
      const db = setup();
      const response = await postJson(productsUrl(), db, withChanges(baseBody(), ['rank', '12']));
      expect(response.status).toBe(201);
      const body = await readJsonRecord(response);
      expect(readNumber(body, 'rank')).toBe(12);
    });

    // Fails if readInteger stops truncating a JSON number toward zero.
    it('an integer number is truncated toward zero (201)', async () => {
      const db = setup();
      const response = await postJson(productsUrl(), db, withChanges(baseBody(), ['rank', 1.5]));
      expect(response.status).toBe(201);
      const body = await readJsonRecord(response);
      expect(readNumber(body, 'rank')).toBe(1);
    });

    // Fails if readInteger stops rejecting a non-digit string.
    it('a decimal string is malformed for an Integer member', async () => {
      const db = setup();
      const response = await postJson(productsUrl(), db, withChanges(baseBody(), ['rank', '1.5']));
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if readInteger stops rejecting a value outside the int32 range.
    it('an out-of-range integer is malformed', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['rank', 3000000000]),
      );
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if readBoolean stops reading the string "true" as true (empty-catalog: no featured limit).
    it('a boolean as the string "true" is read as true (201)', async () => {
      const db = setup('empty-catalog');
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['featured', 'true']),
      );
      expect(response.status).toBe(201);
      const body = await readJsonRecord(response);
      expect(body['featured']).toBe(true);
    });

    // Fails if readBoolean stops rejecting a string other than "true"/"false".
    it('an arbitrary string is malformed for a Boolean member', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['featured', 'yes']),
      );
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if readStorageGb stops rejecting an integer outside {128,256,512}.
    it('a storageGb outside 128/256/512 is malformed', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['variants.0.storageGb', 64]),
      );
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if readCurrency stops rejecting a currency other than HUF.
    it('a currency other than HUF is malformed', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['variants.0.price.currency', 'USD']),
      );
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if readDate stops rejecting a string that is not a real calendar date.
    it('an unparseable date is malformed', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['releasedAt', 'not-a-date']),
      );
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if isLeapYear stops treating year 0 as a leap year (java.time.LocalDate.parse
    // accepts "0000-02-29"; Date.UTC would read year 0 as 1900, which is not a leap year).
    it('0000-02-29 is a valid calendar date (201)', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['releasedAt', '0000-02-29']),
      );
      expect(response.status).toBe(201);
    });

    // Fails if isLeapYear stops treating year 1900 as not a leap year (java.time.LocalDate.parse
    // throws DateTimeParseException on "1900-02-29").
    it('1900-02-29 is malformed (not a leap year)', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['releasedAt', '1900-02-29']),
      );
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if readStringList stops rejecting a non-array value for a List member.
    it('a scalar in place of a List member is malformed', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['highlights', 'one']),
      );
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if beanValidationErrors stops walking every top-level member in declaration order.
    it('an empty object lists all thirteen top-level members REQUIRED, in order', async () => {
      const db = setup();
      const response = await postJson(productsUrl(), db, {});
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Missing required member',
      );
      expect(fieldErrorsOf(body)).toEqual(
        [
          '/slug',
          '/brand',
          '/name',
          '/description',
          '/is5g',
          '/releasedAt',
          '/rank',
          '/popularityScore',
          '/featured',
          '/highlights',
          '/colors',
          '/variants',
          '/specGroups',
        ].map((path) => ({ path, code: 'REQUIRED', params: {} })),
      );
    });
  });

  describe('bean validation (§4)', () => {
    // Fails if PATTERN and SIZE stop being ordered before/across members in declaration order.
    it('a bad slug and a too-short brand are both reported, slug first', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['slug', 'Bad Slug'], ['brand', '']),
      );
      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([
        { path: '/slug', code: 'PATTERN', params: {} },
        { path: '/brand', code: 'SIZE', params: {} },
      ]);
    });

    // Fails if the walk order (colors before variants) or the per-member checks drift.
    it('a bad swatch, a blank alt and a bad variant slug are reported in walk order', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(
          baseBody(),
          ['colors.0.swatchHex', 'notahex'],
          ['colors.0.alt', ''],
          ['variants.0.slug', 'Has Spaces'],
        ),
      );
      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([
        { path: '/colors/0/swatchHex', code: 'PATTERN', params: {} },
        { path: '/colors/0/alt', code: 'SIZE', params: {} },
        { path: '/variants/0/slug', code: 'PATTERN', params: {} },
      ]);
    });

    // Fails if MIN stops firing for both price.amount and stock.
    it('a negative price amount and a negative stock both get MIN', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['variants.0.price.amount', -1], ['variants.0.stock', -1]),
      );
      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([
        { path: '/variants/0/price/amount', code: 'MIN', params: {} },
        { path: '/variants/0/stock', code: 'MIN', params: {} },
      ]);
    });

    // Fails if the highlights list SIZE (max 6) stops being checked.
    it('seven highlights get /highlights SIZE', async () => {
      const db = setup();
      const highlights = Array.from(
        { length: 7 },
        (_unused, index) => `highlight ${String(index)}`,
      );
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['highlights', highlights]),
      );
      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([{ path: '/highlights', code: 'SIZE', params: {} }]);
    });

    // Fails if a REQUIRED violation stops flipping the whole answer to 400 alongside a SIZE one.
    it('a REQUIRED violation flips the answer to 400, keeping a co-occurring SIZE one', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['variants.0.price', null], ['slug', 'x'.repeat(121)]),
      );
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Missing required member',
      );
      expect(fieldErrorsOf(body)).toEqual([
        { path: '/slug', code: 'SIZE', params: {} },
        { path: '/variants/0/price', code: 'REQUIRED', params: {} },
      ]);
    });
  });

  describe('the validator (§5)', () => {
    // Fails if isBlank stops treating an all-whitespace brand as blank.
    it('an all-whitespace brand gets NOTBLANK', async () => {
      const db = setup();
      const response = await postJson(productsUrl(), db, withChanges(baseBody(), ['brand', '   ']));
      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([{ path: '/brand', code: 'NOTBLANK', params: {} }]);
    });

    // Fails if a null colour element stops being reported as REQUIRED by the validator.
    it('a null colour element gets /colors/1 REQUIRED, and flips the answer to 400', async () => {
      const db = setup();
      const body = baseBody();
      const colors = requireArray(body['colors']);
      colors[1] = null;
      body['variants'] = requireArray(body['variants']).slice(0, 1);

      const response = await postJson(productsUrl(), db, body);

      const problem = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Missing required member',
      );
      expect(fieldErrorsOf(problem)).toEqual([{ path: '/colors/1', code: 'REQUIRED', params: {} }]);
    });

    // Fails if the known-colour set stops catching a variant colorCode no colour declares.
    it('a variant colorCode no colour declares gets UNKNOWN_COLOR', async () => {
      const db = setup();
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['variants.0.colorCode', 'nope']),
      );
      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([
        { path: '/variants/0/colorCode', code: 'UNKNOWN_COLOR', params: {} },
      ]);
    });

    // Fails if the variant id length check (productSlug--colorCode--storageGb, max 80) stops firing.
    it('an 81-character variant id gets VARIANT_ID_TOO_LONG, params max 80', async () => {
      const db = setup();
      const longSlug = 'a'.repeat(68); // 68 + 2 + "fekete".length(6) + 2 + "128".length(3) = 81
      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['slug', longSlug]),
      );
      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([
        { path: '/variants/0/colorCode', code: 'VARIANT_ID_TOO_LONG', params: { max: 80 } },
      ]);
    });

    // Fails if the seen-codes set stops flagging a repeated colour code (first occurrence kept clean).
    it('two colours with one code get /colors/1/code DUPLICATE_COLOR_CODE', async () => {
      const db = setup();
      const body = baseBody();
      const colors = requireArray(body['colors']);
      const firstColor = requireRecord(colors[0]);
      const secondColor = requireRecord(colors[1]);
      secondColor['code'] = firstColor['code'];
      body['variants'] = requireArray(body['variants']).slice(0, 1);

      const response = await postJson(productsUrl(), db, body);

      const problem = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(problem)).toEqual([
        { path: '/colors/1/code', code: 'DUPLICATE_COLOR_CODE', params: {} },
      ]);
    });

    // Fails if the seen-slugs set stops flagging a repeated variant slug (first occurrence kept clean).
    it('two variants with one slug get /variants/1/slug DUPLICATE_VARIANT_SLUG', async () => {
      const db = setup();
      const fixture = baseProductInput();
      const duplicateSlug = fixture.variants[0].slug;

      const response = await postJson(
        productsUrl(),
        db,
        withChanges(baseBody(), ['variants.1.slug', duplicateSlug]),
      );

      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([
        { path: '/variants/1/slug', code: 'DUPLICATE_VARIANT_SLUG', params: {} },
      ]);
    });

    // Fails if replaceHandler stops running validatorErrors once the version check has passed.
    it('replace with an all-whitespace brand gets NOTBLANK', async () => {
      const db = setup();
      const response = await putJson(
        productUrl(5),
        db,
        withChanges(baseBody(), ['slug', 'honor-600-lite'], ['brand', '   ']),
        { 'If-Match': '"0"' },
      );
      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([{ path: '/brand', code: 'NOTBLANK', params: {} }]);
    });
  });

  describe('query parameters', () => {
    // Fails if firstQueryKey stops being checked before the body is even read.
    it('create with an unknown query key answers 400 with that key', async () => {
      const db = setup();
      const response = await postJson(`${productsUrl()}?x=1`, db, baseBody());
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Unknown query parameter',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('x');
    });

    // Fails if firstQueryKey stops being checked on restore.
    it('restore with an unknown query key answers 400 with that key', async () => {
      const db = setup();
      const response = await action(`${restoreUrl(1)}?force=1`, db, { 'If-Match': '"0"' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Unknown query parameter',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('force');
    });

    // Fails if firstQueryKey stops being checked on replace.
    it('replace with an unknown query key answers 400 with that key', async () => {
      const db = setup();
      const response = await putJson(`${productUrl(5)}?x=1`, db, baseBody(), { 'If-Match': '"0"' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Unknown query parameter',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('x');
    });

    // Fails if firstQueryKey stops being checked on archive.
    it('archive with an unknown query key answers 400 with that key', async () => {
      const db = setup();
      const response = await action(`${archiveUrl(1)}?force=1`, db, { 'If-Match': '"0"' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Unknown query parameter',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('force');
    });
  });

  describe('productId and If-Match (§6, §2)', () => {
    // Fails if parseProductId stops rejecting a non-numeric path id, before the body is read.
    it('replace with a non-numeric path id answers wrong type, before the body is read', async () => {
      const db = setup();
      const response = await putRaw(productUrl('abc'), db, '{not json', { 'If-Match': '"0"' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter has the wrong type',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('productId');
      expect(readString(params, 'reason')).toBe('type Long');
    });

    // Fails if the body stops being read (and validated) before the productId MIN check.
    it('replace with productId 0 and a malformed body answers malformed, not MIN', async () => {
      const db = setup();
      const response = await putRaw(productUrl(0), db, '{not json', { 'If-Match': '"0"' });
      await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Malformed request body',
      );
    });

    // Fails if the productId MIN check stops firing once the body has passed validation.
    it('replace with productId 0 and a valid body answers not acceptable, productId MIN', async () => {
      const db = setup();
      const response = await putJson(productUrl(0), db, baseBody(), { 'If-Match': '"0"' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter is not acceptable',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('productId');
      expect(readString(params, 'reason')).toBe('MIN');
    });

    // Fails if the If-Match PATTERN check stops firing once productId MIN has passed.
    it('replace with a valid body and a malformed If-Match answers not acceptable, ifMatch PATTERN', async () => {
      const db = setup();
      const response = await putJson(productUrl(1), db, baseBody(), { 'If-Match': 'abc' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter is not acceptable',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('ifMatch');
      expect(readString(params, 'reason')).toBe('PATTERN');
    });

    // Fails if a bean validation violation stops winning over a malformed If-Match.
    it('replace with a bad brand and a malformed If-Match answers the body violation', async () => {
      const db = setup();
      const response = await putJson(productUrl(1), db, withChanges(baseBody(), ['brand', '']), {
        'If-Match': 'abc',
      });
      const body = await expectProblem(
        response,
        422,
        'VALIDATION_FAILED',
        'Section rejected',
        'One or more supplied fields are not acceptable',
      );
      expect(fieldErrorsOf(body)).toEqual([{ path: '/brand', code: 'SIZE', params: {} }]);
    });

    // Fails if readIfMatch stops pattern-checking a present empty header instead of treating it as missing.
    it('replace with a valid body and an empty If-Match answers not acceptable, ifMatch PATTERN', async () => {
      const db = setup();
      const response = await putJson(productUrl(1), db, baseBody(), { 'If-Match': '' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter is not acceptable',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('ifMatch');
      expect(readString(params, 'reason')).toBe('PATTERN');
    });

    // Fails if archive stops checking productId MIN before the If-Match pattern (the lowest index wins).
    it('archive with productId 0 and a malformed If-Match answers not acceptable, productId MIN', async () => {
      const db = setup();
      const response = await action(archiveUrl(0), db, { 'If-Match': 'abc' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter is not acceptable',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('productId');
      expect(readString(params, 'reason')).toBe('MIN');
    });

    // Fails if restore stops checking the If-Match pattern once productId MIN has passed.
    it('restore with a malformed If-Match answers not acceptable, ifMatch PATTERN', async () => {
      const db = setup();
      const response = await action(restoreUrl(1), db, { 'If-Match': 'abc' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter is not acceptable',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('ifMatch');
      expect(readString(params, 'reason')).toBe('PATTERN');
    });

    // Fails if archive stops checking the If-Match pattern once productId MIN has passed.
    it('archive with a malformed If-Match answers not acceptable, ifMatch PATTERN', async () => {
      const db = setup();
      const response = await action(archiveUrl(1), db, { 'If-Match': 'abc' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter is not acceptable',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('ifMatch');
      expect(readString(params, 'reason')).toBe('PATTERN');
    });

    // Fails if restore stops checking productId MIN.
    it('restore with productId 0 answers not acceptable, productId MIN', async () => {
      const db = setup();
      const response = await action(restoreUrl(0), db, { 'If-Match': '"0"' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter is not acceptable',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('productId');
      expect(readString(params, 'reason')).toBe('MIN');
    });

    // Fails if HEX_ID_PATTERN (products-write.handlers.ts ~650) stops rejecting a leading '+'
    // before a hex prefix: Spring's NumberUtils.parseNumber strips only a leading '-' there.
    it('replace with path id +0x1 answers wrong type, productId, type Long', async () => {
      const db = setup();
      const response = await putJson(productUrl('+0x1'), db, baseBody(), { 'If-Match': '"0"' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter has the wrong type',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('productId');
      expect(readString(params, 'reason')).toBe('type Long');
    });

    // Fails if HEX_ID_PATTERN (products-write.handlers.ts ~650) stops rejecting a leading '+'
    // before a hex prefix on the archive path id.
    it('archive with path id +0x1 answers wrong type, productId, type Long', async () => {
      const db = setup();
      const response = await action(archiveUrl('+0x1'), db, { 'If-Match': '"0"' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter has the wrong type',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('productId');
      expect(readString(params, 'reason')).toBe('type Long');
    });

    // Fails if HEX_ID_PATTERN (products-write.handlers.ts ~650) stops rejecting a leading '+'
    // before a hex prefix on the restore path id.
    it('restore with path id +0x1 answers wrong type, productId, type Long', async () => {
      const db = setup();
      const response = await action(restoreUrl('+0x1'), db, { 'If-Match': '"0"' });
      const body = await expectProblem(
        response,
        400,
        'INVALID_REQUEST',
        'Invalid request',
        'Query or path parameter has the wrong type',
      );
      const params = body['params'];
      expectRecord(params);
      expect(readString(params, 'parameter')).toBe('productId');
      expect(readString(params, 'reason')).toBe('type Long');
    });
  });
});
