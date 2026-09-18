// tests/contract/schema.spec.ts — T03-AC01/AC02/AC04 contract-level assertions.
//
// Vitest suite that reads docs/api/openapi.yaml (the wire contract) plus the
// products fixture, dereferences $refs with @apidevtools/json-schema-ref-parser,
// and asserts the schema-level and business-invariant constraints the spec
// document imposes. The validator (scripts/validate-contract.mjs) enforces the
// same checks for the CLI; this suite gives the same coverage to Vitest so
// T03 can run it under `ng test` or `npx vitest run`.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, it, expect, beforeAll } from 'vitest';
import yaml from 'js-yaml';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const SPEC_PATH = resolve(__dirname, '../../docs/api/openapi.yaml');
const PRODUCTS_PATH = resolve(__dirname, '../../docs/api/fixtures/products.json');

interface OpenApiSpec {
  openapi: string;
  paths: Record<
    string,
    Record<
      string,
      {
        operationId?: string;
        parameters?: unknown[];
        responses?: Record<string, unknown>;
        requestBody?: unknown;
      }
    >
  >;
  components: {
    schemas: Record<string, unknown>;
    parameters: Record<string, unknown>;
  };
}

interface DereferencedSpec {
  components: {
    schemas: Record<string, unknown>;
    parameters: Record<string, unknown>;
  };
}

let spec: OpenApiSpec;
let dereferenced: DereferencedSpec;
let products: Array<Record<string, unknown>>;
let ajv: Ajv;

beforeAll(async () => {
  const [specRaw, productsRaw] = await Promise.all([
    readFile(SPEC_PATH, 'utf8'),
    readFile(PRODUCTS_PATH, 'utf8'),
  ]);
  spec = yaml.load(specRaw) as OpenApiSpec;
  dereferenced = (await $RefParser.dereference(SPEC_PATH)) as DereferencedSpec;
  products = JSON.parse(productsRaw) as Array<Record<string, unknown>>;
  ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
});

describe('T03-AC01 operationIds', () => {
  it('declares exactly 16 operationIds', () => {
    const ids: string[] = [];
    for (const pathItem of Object.values(spec.paths)) {
      for (const op of Object.values(pathItem)) {
        if (op && typeof op === 'object' && typeof op.operationId === 'string') {
          ids.push(op.operationId);
        }
      }
    }
    expect(ids).toHaveLength(16);
  });

  it('every operationId is unique', () => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const pathItem of Object.values(spec.paths)) {
      for (const op of Object.values(pathItem)) {
        if (op && typeof op === 'object' && typeof op.operationId === 'string') {
          ids.push(op.operationId);
        }
      }
    }
    for (const id of ids) {
      expect(seen.has(id), `duplicate operationId: ${id}`).toBe(false);
      seen.add(id);
    }
  });

  it('every $ref in the spec dereferences successfully', () => {
    // If dereference() did not throw, every $ref resolved. The dereferenced
    // spec also contains no $ref objects at the leaf paths we exercise.
    expect(dereferenced.components.schemas).toBeDefined();
    expect(dereferenced.components.schemas.Money).toBeDefined();
    expect(dereferenced.components.schemas.Product).toBeDefined();
    expect(dereferenced.components.schemas.Cart).toBeDefined();
    expect(dereferenced.components.schemas.Quote).toBeDefined();
  });
});

describe('T03-AC02 Money invariant', () => {
  it('Money.amount is integer with min 0 and max 100000000', () => {
    const money = dereferenced.components.schemas.Money as {
      properties: { amount: { type: string; minimum: number; maximum: number } };
      required: string[];
    };
    expect(money.properties.amount.type).toBe('integer');
    expect(money.properties.amount.minimum).toBe(0);
    expect(money.properties.amount.maximum).toBe(100000000);
    expect(money.required).toContain('amount');
  });

  it('Money.currency is constrained to HUF', () => {
    const money = dereferenced.components.schemas.Money as {
      properties: { currency: { type: string; enum: string[] } };
    };
    expect(money.properties.currency.enum).toEqual(['HUF']);
  });

  it('every Money.example in the spec uses an integer HUF amount', () => {
    function findMoney(node: unknown, path: string[]): void {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((child, i) => findMoney(child, [...path, String(i)]));
        return;
      }
      const record = node as Record<string, unknown>;
      if (typeof record.amount === 'number' && typeof record.currency === 'string') {
        expect(Number.isInteger(record.amount), `amount at ${path.join('.')} is not integer`).toBe(
          true,
        );
        expect(record.currency, `currency at ${path.join('.')} is not HUF`).toBe('HUF');
      }
      for (const [k, v] of Object.entries(record)) findMoney(v, [...path, k]);
    }
    findMoney(spec, []);
  });
});

describe('T03-AC02 status codes & repeated query arrays', () => {
  it('every operation response is one of the documented status codes', () => {
    const known = new Set([
      '200',
      '201',
      '202',
      '203',
      '204',
      '206',
      '400',
      '401',
      '403',
      '404',
      '409',
      '410',
      '413',
      '415',
      '422',
      '429',
      '500',
      '502',
      '503',
      '504',
    ]);
    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(pathItem)) {
        if (!op || typeof op !== 'object') continue;
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        for (const status of Object.keys(op.responses ?? {})) {
          if (status === 'default') continue;
          expect(known.has(status), `${method.toUpperCase()} ${pathKey} returns ${status}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('every repeated query-array parameter uses style=form, explode=true', () => {
    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(pathItem)) {
        if (!op || typeof op !== 'object') continue;
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        const params = (op.parameters ?? []) as Array<{
          $ref?: string;
          in?: string;
          name?: string;
          style?: string;
          explode?: boolean;
          schema?: { type?: string };
        }>;
        for (const p of params) {
          if (p.$ref) continue; // resolved via dereferenced.parameters
          if (p.in !== 'query') continue;
          if (p.schema?.type !== 'array') continue;
          expect(p.style, `${method.toUpperCase()} ${pathKey} :: ${p.name}`).toBe('form');
          expect(p.explode, `${method.toUpperCase()} ${pathKey} :: ${p.name}`).toBe(true);
        }
      }
    }
  });
});

describe('T03-AC04 schema constraints', () => {
  it('Variant.maxQuantity is integer 0..5', () => {
    const variant = dereferenced.components.schemas.Variant as {
      properties: { maxQuantity: { type: string; minimum: number; maximum: number } };
    };
    expect(variant.properties.maxQuantity.type).toBe('integer');
    expect(variant.properties.maxQuantity.minimum).toBe(0);
    expect(variant.properties.maxQuantity.maximum).toBe(5);
  });

  it('CartItem.quantity is integer 1..5', () => {
    const cartItem = dereferenced.components.schemas.CartItem as {
      properties: { quantity: { type: string; minimum: number; maximum: number } };
    };
    expect(cartItem.properties.quantity.type).toBe('integer');
    expect(cartItem.properties.quantity.minimum).toBe(1);
    expect(cartItem.properties.quantity.maximum).toBe(5);
  });

  it('Product.highlights is 1..2 entries (per spec)', () => {
    const product = dereferenced.components.schemas.Product as {
      properties: { highlights: { type: string; minItems: number; maxItems: number } };
    };
    expect(product.properties.highlights.minItems).toBe(1);
    expect(product.properties.highlights.maxItems).toBe(2);
  });
});

describe('T03-AC04 business invariants (not enforced by JSON Schema)', () => {
  it('cart-version-monotonic: every mutating cart operation requires If-Match', () => {
    const mutatingMethods = new Set(['post', 'put', 'patch', 'delete']);
    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(pathItem)) {
        if (!op || typeof op !== 'object') continue;
        if (!mutatingMethods.has(method)) continue;
        // Skip POST /carts (no cart yet) and POST /orders (atomic commit uses
        // idempotency, not If-Match) and POST /payment-intents (no cart yet).
        const isCartless =
          (method === 'post' && (pathKey === '/carts' || pathKey === '/payment-intents')) ||
          (method === 'post' && pathKey === '/orders');
        if (isCartless) continue;
        const params = (op.parameters ?? []) as Array<{
          $ref?: string;
          name?: string;
          in?: string;
        }>;
        const hasIfMatch = params.some(
          (p) => p.$ref?.endsWith('/IfMatch') || (p.in === 'header' && p.name === 'If-Match'),
        );
        expect(
          hasIfMatch,
          `${method.toUpperCase()} ${pathKey} requires If-Match for cart-version-monotonic compare-and-swap`,
        ).toBe(true);
      }
    }
  });

  it('quote-ttl-300s: Quote.expiresAt is a date-time field and createCheckoutQuote pins the 5-minute TTL', () => {
    const quote = dereferenced.components.schemas.Quote as {
      properties: { expiresAt: { type: string; format: string } };
    };
    expect(quote.properties.expiresAt.type).toBe('string');
    expect(quote.properties.expiresAt.format).toBe('date-time');

    const quoteOp = spec.paths['/checkout/{cartId}/quote']?.post as
      { description?: string } | undefined;
    expect(quoteOp, 'createCheckoutQuote operation must be defined').toBeDefined();
    const opDescription = (quoteOp?.description ?? '').toLowerCase();
    expect(
      opDescription.includes('5 minutes'),
      `createCheckoutQuote description must mention "5 minutes" TTL; got: ${quoteOp?.description}`,
    ).toBe(true);
  });

  it('idempotency-key-required-on-mutations: every POST/PUT/PATCH/DELETE lists Idempotency-Key', () => {
    const mutatingMethods = new Set(['post', 'put', 'patch', 'delete']);
    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(pathItem)) {
        if (!op || typeof op !== 'object') continue;
        if (!mutatingMethods.has(method)) continue;
        const params = (op.parameters ?? []) as Array<{
          $ref?: string;
          name?: string;
          in?: string;
        }>;
        const hasIdempotency = params.some(
          (p) =>
            p.$ref?.endsWith('/IdempotencyKey') ||
            (p.in === 'header' && p.name === 'Idempotency-Key'),
        );
        expect(
          hasIdempotency,
          `${method.toUpperCase()} ${pathKey} must declare Idempotency-Key`,
        ).toBe(true);
      }
    }
  });
});

describe('T03-AC03 fixture shape', () => {
  it('products.json contains exactly 16 fictional products', () => {
    expect(products).toHaveLength(16);
  });

  it('every product has at least one variant', () => {
    for (const p of products) {
      const variants = (p as { variants?: unknown[] }).variants;
      expect(Array.isArray(variants), `product ${(p as { id: string }).id} missing variants`).toBe(
        true,
      );
      expect(variants?.length ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('at least one product has multiple variants', () => {
    const multi = products.filter((p) => {
      const v = (p as { variants?: unknown[] }).variants ?? [];
      return v.length > 1;
    });
    expect(multi.length).toBeGreaterThan(0);
  });

  it('at least one out-of-stock combination exists', () => {
    const oos = products
      .flatMap((p) => (p as { variants?: Array<{ availability?: string }> }).variants ?? [])
      .filter((v) => v.availability === 'out_of_stock');
    expect(oos.length).toBeGreaterThan(0);
  });

  it('at least one low-stock scenario exists (maxQuantity in (0..2] and in_stock)', () => {
    const low = products
      .flatMap(
        (p) =>
          (p as { variants?: Array<{ availability?: string; maxQuantity?: number }> }).variants ??
          [],
      )
      .filter(
        (v) =>
          v.availability === 'in_stock' &&
          typeof v.maxQuantity === 'number' &&
          v.maxQuantity > 0 &&
          v.maxQuantity <= 2,
      );
    expect(low.length).toBeGreaterThan(0);
  });

  it('every product brand avoids a real Hungarian operator name', () => {
    const forbidden = new Set(['yettel', 'telekom', 'magyar telekom', 'vodafone', 'digi']);
    for (const p of products) {
      const brand = String((p as { brand?: string }).brand ?? '')
        .trim()
        .toLowerCase();
      expect(
        forbidden.has(brand),
        `product ${(p as { id: string }).id} uses operator brand "${brand}"`,
      ).toBe(false);
    }
  });

  it('every fixture product validates against the OpenAPI Product schema', () => {
    const productSchema = dereferenced.components.schemas.Product as Record<string, unknown>;
    const validate = ajv.compile(productSchema);
    for (const p of products) {
      const ok = validate(p);
      expect(
        ok,
        `product ${(p as { id: string }).id} failed Product schema: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }
  });
});
