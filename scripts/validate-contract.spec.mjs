#!/usr/bin/env node
// validate-contract.spec.mjs — T03 contract-validator test surface (node:test).
//
// Run with `node --test scripts/*.spec.mjs`. Each test exercises one of the
// pure exports of validate-contract.mjs against focused sample data; the
// end-to-end "real files" check spawns the CLI and inspects the JSON.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  REQUIRED_OPERATION_IDS,
  collectOperationIds,
  findDuplicateOperationIds,
  assertMoneyIsInteger,
  assertStatusCodes,
  assertRepeatedQueryEncoding,
  assertIdempotencyKeyOnMutations,
  assertApiGenerateScript,
  assertFixturesShape,
  assertExamplesValidate,
  validateContract,
  runValidator,
  DEFAULT_PATHS,
} from './validate-contract.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, 'validate-contract.mjs');

// ---------------------------------------------------------------------------
// OperationIds — AC01
// ---------------------------------------------------------------------------

test('collectOperationIds: yields one entry per (path, method, operationId)', () => {
  const spec = {
    paths: {
      '/x': {
        get: { operationId: 'getX' },
        post: { operationId: 'createX' },
      },
      '/y': {
        get: { operationId: 'getY' },
      },
    },
  };
  const ids = collectOperationIds(spec);
  assert.equal(ids.length, 3);
  assert.deepEqual(
    ids.map((e) => e.operationId),
    ['getX', 'createX', 'getY'],
  );
});

test('collectOperationIds: ignores path-item keys that are not HTTP methods', () => {
  const spec = {
    paths: {
      '/x': {
        summary: 'not a method',
        parameters: [],
        get: { operationId: 'getX' },
      },
    },
  };
  const ids = collectOperationIds(spec);
  assert.equal(ids.length, 1);
  assert.equal(ids[0].operationId, 'getX');
});

test('findDuplicateOperationIds: reports only true duplicates', () => {
  const entries = [
    { operationId: 'a', path: '/a', method: 'GET' },
    { operationId: 'b', path: '/b', method: 'POST' },
    { operationId: 'a', path: '/c', method: 'DELETE' },
  ];
  const dups = findDuplicateOperationIds(entries);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].operationId, 'a');
  assert.deepEqual(dups[0].first, { path: '/a', method: 'GET' });
  assert.deepEqual(dups[0].second, { path: '/c', method: 'DELETE' });
});

// ---------------------------------------------------------------------------
// Money invariant — AC02
// ---------------------------------------------------------------------------

test('assertMoneyIsInteger: accepts integer Money with HUF currency', () => {
  const spec = {
    components: {
      schemas: {
        Money: {
          type: 'object',
          properties: {
            amount: { type: 'integer' },
            currency: { type: 'string', enum: ['HUF'] },
          },
        },
      },
    },
  };
  assert.deepEqual(assertMoneyIsInteger(spec), []);
});

test('assertMoneyIsInteger: rejects non-integer Money.amount', () => {
  const spec = {
    components: {
      schemas: {
        Money: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            currency: { type: 'string', enum: ['HUF'] },
          },
        },
      },
    },
  };
  const errors = assertMoneyIsInteger(spec);
  assert.ok(
    errors.some((e) => e.kind === 'money-amount-not-integer'),
    `expected money-amount-not-integer, got ${JSON.stringify(errors)}`,
  );
});

test('assertMoneyIsInteger: rejects example with floating-point amount', () => {
  const spec = {
    components: {
      schemas: {
        Money: {
          type: 'object',
          properties: {
            amount: { type: 'integer' },
            currency: { type: 'string', enum: ['HUF'] },
          },
        },
        DemoConfig: {
          type: 'object',
          examples: [
            {
              price: { amount: 1990.99, currency: 'HUF' },
            },
          ],
        },
      },
    },
  };
  const errors = assertMoneyIsInteger(spec);
  assert.ok(
    errors.some((e) => e.kind === 'money-amount-float'),
    `expected money-amount-float, got ${JSON.stringify(errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Status codes — AC02
// ---------------------------------------------------------------------------

test('assertStatusCodes: accepts documented 2xx/4xx/5xx codes', () => {
  const spec = {
    paths: {
      '/x': {
        get: {
          operationId: 'getX',
          responses: { 200: {}, 400: {}, 503: {} },
        },
      },
    },
  };
  assert.deepEqual(assertStatusCodes(spec), []);
});

test('assertStatusCodes: rejects non-three-digit status code', () => {
  const spec = {
    paths: {
      '/x': {
        get: { operationId: 'getX', responses: { 99: {} } },
      },
    },
  };
  const errors = assertStatusCodes(spec);
  assert.ok(
    errors.some((e) => e.kind === 'invalid-status-code'),
    `expected invalid-status-code, got ${JSON.stringify(errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Repeated query arrays — AC02
// ---------------------------------------------------------------------------

test('assertRepeatedQueryEncoding: accepts style=form, explode=true arrays', () => {
  const spec = {
    paths: {
      '/products': {
        get: {
          operationId: 'listProducts',
          parameters: [
            {
              name: 'brand',
              in: 'query',
              style: 'form',
              explode: true,
              schema: { type: 'array', items: { type: 'string' } },
            },
          ],
        },
      },
    },
  };
  assert.deepEqual(assertRepeatedQueryEncoding(spec), []);
});

test('assertRepeatedQueryEncoding: rejects pipeDelimited array params', () => {
  const spec = {
    paths: {
      '/products': {
        get: {
          operationId: 'listProducts',
          parameters: [
            {
              name: 'brand',
              in: 'query',
              style: 'pipeDelimited',
              explode: false,
              schema: { type: 'array', items: { type: 'string' } },
            },
          ],
        },
      },
    },
  };
  const errors = assertRepeatedQueryEncoding(spec);
  assert.ok(
    errors.some((e) => e.kind === 'repeated-query-encoding'),
    `expected repeated-query-encoding, got ${JSON.stringify(errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Idempotency on mutations — AC04 business invariant
// ---------------------------------------------------------------------------

test('assertIdempotencyKeyOnMutations: accepts POST that requires Idempotency-Key', () => {
  const spec = {
    paths: {
      '/carts': {
        post: {
          operationId: 'createCart',
          parameters: [{ name: 'Idempotency-Key', in: 'header', required: true }],
        },
      },
    },
  };
  assert.deepEqual(assertIdempotencyKeyOnMutations(spec), []);
});

test('assertIdempotencyKeyOnMutations: rejects POST without Idempotency-Key', () => {
  const spec = {
    paths: {
      '/carts': {
        post: { operationId: 'createCart', parameters: [] },
      },
    },
  };
  const errors = assertIdempotencyKeyOnMutations(spec);
  assert.ok(
    errors.some((e) => e.kind === 'missing-idempotency-key'),
    `expected missing-idempotency-key, got ${JSON.stringify(errors)}`,
  );
});

// ---------------------------------------------------------------------------
// api:generate script — AC05
// ---------------------------------------------------------------------------

test('assertApiGenerateScript: accepts package.json with api:generate', () => {
  const pkg = { scripts: { 'api:generate': 'ng-openapi-gen --config ng-openapi-gen.json' } };
  assert.deepEqual(assertApiGenerateScript(pkg), []);
});

test('assertApiGenerateScript: rejects package.json without api:generate', () => {
  const pkg = { scripts: { build: 'ng build' } };
  const errors = assertApiGenerateScript(pkg);
  assert.ok(
    errors.some((e) => e.kind === 'api-generate-missing'),
    `expected api-generate-missing, got ${JSON.stringify(errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Fixture shape — AC03
// ---------------------------------------------------------------------------

test('assertFixturesShape: accepts 16 multi-variant products with low + oos', () => {
  const products = [];
  for (let i = 0; i < 16; i++) {
    products.push({
      id: `p-${i}`,
      slug: `demo-${i}-5g`,
      brand: 'MiBolt Demo',
      name: `Demo ${i} 5G`,
      variants: [
        { id: `v${i}-a`, availability: 'in_stock', maxQuantity: 5 },
        { id: `v${i}-b`, availability: 'in_stock', maxQuantity: 1 },
      ],
    });
  }
  // one variant out of stock
  products[0].variants.push({ id: 'oos', availability: 'out_of_stock', maxQuantity: 0 });
  assert.deepEqual(assertFixturesShape(products), []);
});

test('assertFixturesShape: rejects fewer than 16 products', () => {
  const errors = assertFixturesShape([
    {
      id: 'a',
      brand: 'X',
      name: 'Y',
      variants: [{ id: 'v', availability: 'in_stock', maxQuantity: 1 }],
    },
  ]);
  assert.ok(
    errors.some((e) => e.kind === 'fixture-product-count'),
    `expected fixture-product-count, got ${JSON.stringify(errors)}`,
  );
});

test('assertFixturesShape: rejects no out-of-stock combination', () => {
  const products = Array.from({ length: 16 }, (_, i) => ({
    id: `p-${i}`,
    slug: `demo-${i}`,
    brand: 'MiBolt Demo',
    name: `Demo ${i}`,
    variants: [{ id: `v${i}`, availability: 'in_stock', maxQuantity: 5 }],
  }));
  const errors = assertFixturesShape(products);
  assert.ok(
    errors.some(
      (e) => e.kind === 'fixture-no-multivariant' || e.kind === 'fixture-no-out-of-stock',
    ),
    `expected fixture-no-out-of-stock or fixture-no-multivariant, got ${JSON.stringify(errors)}`,
  );
});

test('assertFixturesShape: rejects copied operator brand', () => {
  const products = Array.from({ length: 16 }, (_, i) => ({
    id: `p-${i}`,
    slug: `demo-${i}`,
    brand: 'Yettel',
    name: 'Demo 5G',
    variants: [
      { id: `v${i}-a`, availability: 'in_stock', maxQuantity: 5 },
      { id: `oos-${i}`, availability: 'out_of_stock', maxQuantity: 0 },
    ],
  }));
  const errors = assertFixturesShape(products);
  assert.ok(
    errors.some((e) => e.kind === 'fixture-operator-name'),
    `expected fixture-operator-name, got ${JSON.stringify(errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Example validation — AC01
// ---------------------------------------------------------------------------

test('assertExamplesValidate: accepts a schema-level example matching its schema', () => {
  const spec = {
    components: {
      schemas: {
        Money: {
          type: 'object',
          properties: {
            amount: { type: 'integer' },
            currency: { type: 'string', enum: ['HUF'] },
          },
          required: ['amount', 'currency'],
        },
        DemoConfig: {
          type: 'object',
          properties: {
            price: { $ref: '#/components/schemas/Money' },
          },
          required: ['price'],
          examples: [{ price: { amount: 1990, currency: 'HUF' } }],
        },
      },
    },
  };
  assert.deepEqual(assertExamplesValidate(spec, spec), []);
});

test('assertExamplesValidate: rejects a schema-level example that violates its schema', () => {
  const spec = {
    components: {
      schemas: {
        Money: {
          type: 'object',
          properties: {
            amount: { type: 'integer' },
            currency: { type: 'string', enum: ['HUF'] },
          },
          required: ['amount', 'currency'],
        },
        DemoConfig: {
          type: 'object',
          properties: {
            price: { $ref: '#/components/schemas/Money' },
          },
          required: ['price'],
          examples: [{ price: { amount: 1990.99, currency: 'EUR' } }],
        },
      },
    },
  };
  const errors = assertExamplesValidate(spec, spec);
  assert.ok(
    errors.some((e) => e.kind === 'example-validation-failed'),
    `expected example-validation-failed, got ${JSON.stringify(errors)}`,
  );
});

// ---------------------------------------------------------------------------
// Orchestrator wiring — AC01 + AC02 + AC04 + AC05
// ---------------------------------------------------------------------------

test('validateContract: rejects synthetic spec with one operation missing', () => {
  // Build a tiny but spec-shaped spec that has all the AC01..AC05 invariants
  // satisfied EXCEPT for the operationId count.
  const spec = {
    openapi: '3.1.0',
    info: { title: 't', version: '0.0.0' },
    paths: {
      '/a': {
        get: {
          operationId: 'getA',
          parameters: [],
          responses: {
            200: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/DemoConfig' },
                },
              },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        Money: {
          type: 'object',
          properties: {
            amount: { type: 'integer', minimum: 0 },
            currency: { type: 'string', enum: ['HUF'] },
          },
          required: ['amount', 'currency'],
        },
        DemoConfig: {
          type: 'object',
          properties: { price: { $ref: '#/components/schemas/Money' } },
          required: ['price'],
        },
      },
    },
  };
  const result = validateContract({
    spec,
    dereferenced: spec, // not actually dereferenced, but the dereference check passes
    products: null,
    packageJson: { scripts: { 'api:generate': 'x' } },
  });
  assert.equal(result.ok, false);
  assert.equal(result.summary, 'contract:FAIL');
  assert.ok(
    result.errors.some((e) => e.kind === 'operation-id-count'),
    `expected operation-id-count, got ${JSON.stringify(result.errors)}`,
  );
});

test('validateContract: accepts the real openapi.yaml + fixtures + synthetic package.json', async () => {
  const productsPath = DEFAULT_PATHS.products;
  const specPath = DEFAULT_PATHS.spec;
  const productsRaw = await import('node:fs/promises').then((m) =>
    m.readFile(productsPath, 'utf8'),
  );
  const products = JSON.parse(productsRaw);
  // First run with no api:generate must fail with api-generate-missing.
  const failResult = validateContract({
    spec: await (async () => {
      const yaml = (await import('js-yaml')).default;
      const raw = await import('node:fs/promises').then((m) => m.readFile(specPath, 'utf8'));
      return yaml.load(raw);
    })(),
    dereferenced: null,
    products,
    packageJson: { scripts: { build: 'ng build' } },
  });
  assert.equal(failResult.ok, false);
  assert.ok(
    failResult.errors.some((e) => e.kind === 'api-generate-missing'),
    `expected api-generate-missing without api:generate, got ${JSON.stringify(failResult.errors)}`,
  );
  // Second run with api:generate present and the real dereferenced spec must pass.
  const passResult = await runValidator({
    spec: specPath,
    products: productsPath,
    packageJson: DEFAULT_PATHS.packageJson,
  });
  assert.equal(passResult.ok, true, JSON.stringify(passResult, null, 2));
  assert.equal(passResult.summary, 'contract:OK');
  assert.equal(passResult.errors.length, 0);
});

// ---------------------------------------------------------------------------
// End-to-end CLI — runs the real script against the real files
// ---------------------------------------------------------------------------

test('validate-contract.mjs CLI: exits 0 with contract:OK against the real files', () => {
  const result = spawnSync('node', [SCRIPT], {
    encoding: 'utf8',
    cwd: resolve(__dirname, '..'),
  });
  assert.equal(
    result.status,
    0,
    `expected exit 0 against the real files, got ${result.status}\nstdout:${result.stdout}\nstderr:${result.stderr}`,
  );
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.summary, 'contract:OK');
  assert.equal(payload.errors.length, 0);
  assert.equal(payload.stats.operationIdCount, 16);
  assert.equal(payload.stats.productCount, 16);
});

test('validate-contract.mjs CLI: REQUIRED_OPERATION_IDS is 16', () => {
  assert.equal(REQUIRED_OPERATION_IDS, 16);
});
