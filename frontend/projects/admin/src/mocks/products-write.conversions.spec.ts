/**
 * Spec for the product write mock's body-string and path-id conversions
 * (projects/admin/src/mocks/products-write.handlers.ts): `readInteger`,
 * `readBoolean`, `readDate` and `parseProductId` against the Spring backend's
 * actual answers.
 *
 * Every expected value in the tables below is the orchestrator's own
 * measurement on the booted backend at the integration head
 * (`data/catalog/catalog.json` seed): `PUT
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

import { useMswServer } from '../testing/msw-server';
import {
  action,
  archiveUrl,
  expectProblem,
  expectRecord,
  fieldErrorsOf,
  inputOf,
  productUrl,
  put,
  readString,
  requireProduct,
  setup,
} from '../testing/mock-spec-helpers';

useMswServer();

const STALE_IF_MATCH = '"999999"';

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
  readonly sent: readonly (string | number)[];
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
  { member: 'is5g', sent: ['', ' '], outcome: 'required' },
  {
    member: 'rank',
    sent: [' 1', '1 ', `${CTRL_1C}1`, '+1', 1.9],
    outcome: 'conflict',
  },
  {
    member: 'rank',
    sent: [`${NBSP}1`, `${BOM}1`, '0x1', '1.0', `${NEL} 1`],
    outcome: 'malformed',
  },
  { member: 'rank', sent: ['', ' '], outcome: 'required' },
  {
    member: 'releasedAt',
    sent: [' 2024-01-15', '2024-01-15 ', `${CTRL_1C}2024-01-15`],
    outcome: 'conflict',
  },
  { member: 'releasedAt', sent: [`${NBSP}2024-01-15`], outcome: 'malformed' },
  { member: 'releasedAt', sent: ['', ' '], outcome: 'required' },
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
  { member: 'stock', sent: [' 1', `${CTRL_1C}1`], outcome: 'conflict' },
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
    ids: ['5%1C', '%1C5', '5%09', '%205', '5%20'],
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
