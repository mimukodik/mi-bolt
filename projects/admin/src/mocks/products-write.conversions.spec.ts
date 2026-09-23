/**
 * Spec for the product write mock's body-string and path-id conversions
 * (projects/admin/src/mocks/products-write.handlers.ts): `readInteger`,
 * `readBoolean`, `readDate` and `parseProductId` against the Spring backend's
 * actual answers.
 *
 * Every expected value in the tables below is the orchestrator's own
 * measurement on the booted backend at the integration head
 * (`docs/api/fixtures/catalog-source.json` seed): `PUT
 * /api/v1/admin/products/{id}` and `POST
 * /api/v1/admin/products/{id}/archive` sent with a stale `If-Match:
 * "999999"`, so a well-formed, accepted body answers 412
 * `PRODUCT_VERSION_CONFLICT` (and nothing is written) while a body Jackson
 * cannot parse or a member that reads to "no value" answers 400 before the
 * `If-Match` check is even reached. None of these values were computed from
 * the mock code under test.
 */
import { describe, expect, it } from 'vitest';

import type { AdminProduct } from '../app/api/generated/models/admin-product';
import type { ProblemCode } from '../app/api/generated/models/problem-code';
import type { AdminProductInput } from '../app/api/generated/models/admin-product-input';
import { isRecord } from '../app/core/is-record';

import { useMswServer, server } from '../testing/msw-server';
import { createDb } from './db';
import type { MockDb } from './db';
import { XSRF_HEADER, issueXsrfCookie } from './guards';
import { productsWriteHandlers } from './products-write.handlers';
import type { ScenarioName } from './scenario';
import { SEED_ADMIN } from './seed';

useMswServer();

const STALE_IF_MATCH = '"999999"';

function productUrl(id: number | string): string {
  return new URL(`/api/v1/admin/products/${String(id)}`, document.baseURI).href;
}

function archiveUrl(id: number | string): string {
  return new URL(`/api/v1/admin/products/${String(id)}/archive`, document.baseURI).href;
}

function setup(scenario: ScenarioName = 'default'): MockDb {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  issueXsrfCookie(db);
  server?.use(...productsWriteHandlers(db));
  return db;
}

function requireProduct(db: MockDb, id: number): AdminProduct {
  const product = db.products.get(id);
  if (product === undefined) throw new Error(`product ${String(id)} missing from seed`);
  return product;
}

/** Maps an `AdminProduct` back to a valid `AdminProductInput`, as the edit form would. */
function inputOf(product: AdminProduct): AdminProductInput {
  return {
    slug: product.slug,
    brand: product.brand,
    name: product.name,
    description: product.description,
    is5g: product.is5g,
    releasedAt: product.releasedAt,
    rank: product.rank,
    popularityScore: product.popularityScore,
    featured: product.featured,
    highlights: product.highlights,
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
    specGroups: product.specGroups,
  };
}

function headersFor(db: MockDb, overrides: Record<string, string | undefined> = {}): HeadersInit {
  const merged: Record<string, string | undefined> = {
    'content-type': 'application/json',
    [XSRF_HEADER]: db.xsrfToken ?? '',
    ...overrides,
  };
  const present = Object.entries(merged).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  );
  return Object.fromEntries(present);
}

function put(
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

function action(
  url: string,
  db: MockDb,
  headerOverrides: Record<string, string | undefined> = {},
): Promise<Response> {
  return fetch(url, { method: 'POST', headers: headersFor(db, headerOverrides) });
}

function expectRecord(value: unknown): asserts value is Record<string, unknown> {
  expect(isRecord(value)).toBe(true);
}

function readString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  expect(typeof value).toBe('string');
  if (typeof value !== 'string') throw new Error(`${key} is not a string`);
  return value;
}

function readArray(body: Record<string, unknown>, key: string): unknown[] {
  const value = body[key];
  expect(Array.isArray(value)).toBe(true);
  if (!Array.isArray(value)) throw new Error(`${key} is not an array`);
  return value;
}

function fieldErrorsOf(body: Record<string, unknown>): Record<string, unknown>[] {
  return readArray(body, 'fieldErrors').map((item) => {
    expectRecord(item);
    return item;
  });
}

async function readJsonRecord(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  expectRecord(body);
  return body;
}

async function expectProblem(
  response: Response,
  status: number,
  code: ProblemCode,
): Promise<Record<string, unknown>> {
  expect(response.status).toBe(status);
  const body = await readJsonRecord(response);
  expect(readString(body, 'code')).toBe(code);
  return body;
}

async function expectConflict(response: Response): Promise<void> {
  await expectProblem(response, 412, 'PRODUCT_VERSION_CONFLICT');
}

async function expectMalformed(response: Response): Promise<void> {
  const body = await expectProblem(response, 400, 'INVALID_REQUEST');
  expect(readString(body, 'detail')).toBe('Malformed request body');
}

async function expectMissingRequired(response: Response, path: string): Promise<void> {
  const body = await expectProblem(response, 400, 'INVALID_REQUEST');
  expect(readString(body, 'detail')).toBe('Missing required member');
  expect(fieldErrorsOf(body)).toEqual([{ path, code: 'REQUIRED', params: {} }]);
}

async function expectWrongType(response: Response): Promise<void> {
  const body = await expectProblem(response, 400, 'INVALID_REQUEST');
  expect(readString(body, 'detail')).toBe('Query or path parameter has the wrong type');
  const params = body['params'];
  expectRecord(params);
  expect(readString(params, 'parameter')).toBe('productId');
  expect(readString(params, 'reason')).toBe('type Long');
}

// --- Top-level members: is5g, rank, releasedAt -------------------------------------------

type TopLevelOutcome = 'conflict' | 'malformed' | 'required';

interface TopLevelRow {
  readonly member: 'is5g' | 'rank' | 'releasedAt';
  readonly sent: readonly string[];
  readonly outcome: TopLevelOutcome;
}

const CTRL_1C = String.fromCharCode(0x1c);
const NBSP = String.fromCharCode(0xa0);
const NEL = String.fromCharCode(0x85);
const BOM = String.fromCharCode(0xfeff);

const topLevelRows: readonly TopLevelRow[] = [
  {
    member: 'is5g',
    sent: ['True', 'TRUE', ' true', 'true ', `${CTRL_1C}true`],
    outcome: 'conflict',
  },
  { member: 'is5g', sent: ['tRue', `${NBSP}true`, `${NEL}true`], outcome: 'malformed' },
  { member: 'is5g', sent: [' '], outcome: 'required' },
  {
    member: 'rank',
    sent: [' 1', '1 ', `${CTRL_1C}1`, '+1'],
    outcome: 'conflict',
  },
  { member: 'rank', sent: [`${NBSP}1`, `${BOM}1`, '0x1', '1.0'], outcome: 'malformed' },
  { member: 'rank', sent: [' '], outcome: 'required' },
  {
    member: 'releasedAt',
    sent: [' 2024-01-15', '2024-01-15 ', `${CTRL_1C}2024-01-15`],
    outcome: 'conflict',
  },
  { member: 'releasedAt', sent: [`${NBSP}2024-01-15`], outcome: 'malformed' },
  { member: 'releasedAt', sent: [' '], outcome: 'required' },
];

describe('products-write conversions: top-level members', () => {
  it.each(topLevelRows)('$member ($outcome)', async ({ member, sent, outcome }) => {
    for (const value of sent) {
      const db = setup();
      const product = requireProduct(db, 5);
      const body: Record<string, unknown> = { ...inputOf(product), [member]: value };

      const response = await put(productUrl(product.id), db, body, {
        'If-Match': STALE_IF_MATCH,
      });

      if (outcome === 'conflict') await expectConflict(response);
      else if (outcome === 'malformed') await expectMalformed(response);
      else await expectMissingRequired(response, `/${member}`);
    }
  });
});

// --- Variant members: storageGb, stock, price.amount --------------------------------------

type VariantMember = 'storageGb' | 'stock' | 'amount';

interface VariantRow {
  readonly member: VariantMember;
  readonly sent: readonly string[];
  readonly outcome: 'conflict' | 'malformed';
}

const variantRows: readonly VariantRow[] = [
  { member: 'storageGb', sent: [' 128', `${CTRL_1C}128`], outcome: 'conflict' },
  { member: 'storageGb', sent: [`${NBSP}128`], outcome: 'malformed' },
  { member: 'stock', sent: [`${CTRL_1C}1`], outcome: 'conflict' },
  { member: 'stock', sent: [`${NBSP}1`], outcome: 'malformed' },
  { member: 'amount', sent: [' 1'], outcome: 'conflict' },
  { member: 'amount', sent: [`${NBSP}1`], outcome: 'malformed' },
];

function withVariantMember(
  product: AdminProduct,
  member: VariantMember,
  value: string,
): Record<string, unknown> {
  const input = inputOf(product);
  const [firstVariant, ...restVariants] = input.variants;
  const updatedVariant: Record<string, unknown> =
    member === 'amount'
      ? { ...firstVariant, price: { ...firstVariant.price, amount: value } }
      : { ...firstVariant, [member]: value };
  return { ...input, variants: [updatedVariant, ...restVariants] };
}

describe('products-write conversions: variant members', () => {
  it.each(variantRows)('variants[0].$member ($outcome)', async ({ member, sent, outcome }) => {
    for (const value of sent) {
      const db = setup();
      const product = requireProduct(db, 5);
      const body = withVariantMember(product, member, value);

      const response = await put(productUrl(product.id), db, body, {
        'If-Match': STALE_IF_MATCH,
      });

      if (outcome === 'conflict') await expectConflict(response);
      else await expectMalformed(response);
    }
  });
});

// --- Archive path id ------------------------------------------------------------------------

interface PathIdRow {
  readonly label: string;
  readonly ids: readonly string[];
  readonly outcome: 'conflict' | 'wrongType';
}

const pathIdRows: readonly PathIdRow[] = [
  {
    label: 'Java whitespace in the path id',
    ids: ['5%1C', '%1C5', '5%09', '%205'],
    outcome: 'conflict',
  },
  {
    label: 'a no-break space in the path id',
    ids: ['5%C2%A0', '%C2%A05', '5%E2%80%87'],
    outcome: 'wrongType',
  },
];

describe('products-write conversions: archive path id', () => {
  it.each(pathIdRows)('$label ($outcome)', async ({ ids, outcome }) => {
    for (const id of ids) {
      const db = setup();
      requireProduct(db, 5);

      const response = await action(archiveUrl(id), db, { 'If-Match': STALE_IF_MATCH });

      if (outcome === 'conflict') await expectConflict(response);
      else await expectWrongType(response);
    }
  });
});
