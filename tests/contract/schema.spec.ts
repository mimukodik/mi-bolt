// tests/contract/schema.spec.ts — contract-level assertions over
// docs/api/openapi.yaml (the OpenAPI 2.0.0 wire contract) and the
// generated catalogue fixture under docs/api/fixtures/catalog.json.
//
// Vitest suite that dereferences the spec with
// @apidevtools/json-schema-ref-parser, walks `paths` and
// `components.schemas`/`components.parameters`, and asserts the
// invariants the spec document imposes. The fixture is produced by
// `scripts/build-catalog-fixture.mjs` (the `fixtures:catalog` npm
// script); its drift guard is `fixtures:catalog:check`. The T04 wiring
// the package.json `api:generate` script drives regenerates the SDK
// from the same contract.

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, it, expect, beforeAll } from 'vitest';
import yaml from 'js-yaml';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import Ajv2020 from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { withoutAdminOperations } from './admin-tags';

const SPEC_PATH = resolve(__dirname, '../../docs/api/openapi.yaml');
const CATALOG_PATH = resolve(__dirname, '../../docs/api/fixtures/catalog.json');
const CATALOG_SOURCE_PATH = resolve(__dirname, '../../docs/api/fixtures/catalog-source.json');

interface CatalogVariant {
  id?: string;
  availability?: string;
  maxQuantity?: number;
}

interface CatalogProduct {
  id?: string;
  brand?: string;
  variants?: CatalogVariant[];
}

interface CatalogFixture {
  products: CatalogProduct[];
}

interface SourceFixture {
  products: unknown[];
}

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

const EXPECTED_OPERATION_IDS = [
  'addCartItem',
  'clearCart',
  'createOrder',
  'createPaymentIntent',
  'getCart',
  'getCheckout',
  'getCheckoutOptions',
  'getMedia',
  'getOrder',
  'getPaymentIntent',
  'getProduct',
  'listProducts',
  'listRelatedProducts',
  'removeCartItem',
  'resolvePaymentIntent',
  'setCartItemQuantity',
  'updateCheckout',
] as const;

let spec: OpenApiSpec;
let dereferenced: DereferencedSpec;
let catalog: CatalogFixture;
let expectedProductCount: number;
let ajv: Ajv2020;

beforeAll(async () => {
  const [specRaw, catalogRaw, catalogSourceRaw] = await Promise.all([
    readFile(SPEC_PATH, 'utf8'),
    readFile(CATALOG_PATH, 'utf8'),
    readFile(CATALOG_SOURCE_PATH, 'utf8'),
  ]);
  // Shop suite: admin-tagged operations are the admin SDK's (tests/contract/admin-tags.ts).
  spec = withoutAdminOperations(yaml.load(specRaw) as OpenApiSpec);
  // Shop suite: admin-tagged operations are the admin SDK's (tests/contract/admin-tags.ts).
  dereferenced = withoutAdminOperations(
    (await $RefParser.dereference(SPEC_PATH)) as DereferencedSpec,
  );
  catalog = JSON.parse(catalogRaw) as CatalogFixture;
  expectedProductCount = (JSON.parse(catalogSourceRaw) as SourceFixture).products.length;
  ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
});

describe('T03-AC01 operationIds', () => {
  it('declares exactly the 17 operationIds of the 2.0.0 contract', () => {
    const ids: string[] = [];
    for (const pathItem of Object.values(spec.paths)) {
      for (const op of Object.values(pathItem)) {
        if (op && typeof op === 'object' && typeof op.operationId === 'string') {
          ids.push(op.operationId);
        }
      }
    }
    expect([...ids].sort()).toEqual([...EXPECTED_OPERATION_IDS]);
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

  it('every component $ref in the spec dereferences successfully', () => {
    // If $RefParser.dereference() did not throw above, every $ref
    // resolved. The dereferenced spec exposes the resolved objects
    // directly, so iterate the keys of `components.schemas` and
    // `components.parameters` and assert each one is defined.
    const schemas = dereferenced.components.schemas ?? {};
    for (const name of Object.keys(spec.components.schemas ?? {})) {
      expect(schemas[name], `components.schemas.${name} did not dereference`).toBeDefined();
    }
    const parameters = dereferenced.components.parameters ?? {};
    for (const name of Object.keys(spec.components.parameters ?? {})) {
      expect(parameters[name], `components.parameters.${name} did not dereference`).toBeDefined();
    }
  });

  it('every media-type example on responses and requestBodies validates against its own schema', () => {
    // docs/api/openapi.yaml declares `examples:` blocks at the media
    // type level on seven operations (`grep -n 'examples:' docs/api/openapi.yaml` →
    // 337, 558, 621, 654, 739, 808, 851; the eighth hit at line 247 is
    // a header-schema array, not a media-type named map and so is not
    // walked here). Walk every operation response and requestBody on
    // the dereferenced spec so the media schemas no longer carry $ref
    // nodes (ajv would otherwise fail to resolve them), collect each
    // example with its media type's schema, and validate with ajv. A
    // schema the ajv instance cannot compile is the kind of drift
    // T03-AC01 must catch.
    const exampleAjv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    addFormats(exampleAjv);
    let checked = 0;
    for (const [pathKey, pathItem] of Object.entries(dereferenced.paths ?? {})) {
      for (const [method, op] of Object.entries(pathItem)) {
        if (!op || typeof op !== 'object') continue;
        if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) continue;
        const typed = op as {
          responses?: Record<
            string,
            {
              content?: Record<
                string,
                { schema?: unknown; examples?: Record<string, { value?: unknown }> }
              >;
            }
          >;
          requestBody?: {
            content?: Record<
              string,
              { schema?: unknown; examples?: Record<string, { value?: unknown }> }
            >;
          };
        };
        const groups: [
          string,
          {
            content?: Record<
              string,
              { schema?: unknown; examples?: Record<string, { value?: unknown }> }
            >;
          },
        ][] = [];
        for (const [status, payload] of Object.entries(typed.responses ?? {})) {
          groups.push([status, payload]);
        }
        if (typed.requestBody) groups.push(['', typed.requestBody]);
        for (const [status, payload] of groups) {
          for (const [mediaType, media] of Object.entries(payload.content ?? {})) {
            const schema = media.schema;
            if (!schema || typeof schema !== 'object') continue;
            const examples = media.examples;
            if (!examples || typeof examples !== 'object') continue;
            const validate = exampleAjv.compile(schema as Record<string, unknown>);
            for (const [exampleKey, example] of Object.entries(examples)) {
              if (!example || typeof example !== 'object') continue;
              if (!('value' in example)) continue;
              checked += 1;
              const where =
                `${method.toUpperCase()} ${pathKey} ${status || ''} ${mediaType} ${exampleKey}`.trim();
              expect(
                validate(example.value),
                `${where} failed its media-type schema: ${JSON.stringify(validate.errors)}`,
              ).toBe(true);
            }
          }
        }
      }
    }
    expect(checked, 'no media-type example was found to validate').toBeGreaterThan(0);
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
    expect(money.properties.amount.maximum).toBe(100_000_000);
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
        node.forEach((child, index) => {
          findMoney(child, [...path, String(index)]);
        });
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
    // Measured from the spec:
    //   grep -oE "^\s+'[0-9]{3}':" docs/api/openapi.yaml | sort -u
    // → 200, 201, 400, 404, 409, 410, 412, 422, 503.
    const known = new Set(['200', '201', '400', '404', '409', '410', '412', '422', '503']);
    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(pathItem)) {
        if (
          !op ||
          typeof op !== 'object' ||
          !['get', 'post', 'put', 'patch', 'delete'].includes(method)
        )
          continue;
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
        if (
          !op ||
          typeof op !== 'object' ||
          !['get', 'post', 'put', 'patch', 'delete'].includes(method)
        )
          continue;
        const parameters = (op.parameters ?? []) as {
          $ref?: string;
          in?: string;
          name?: string;
          style?: string;
          explode?: boolean;
          schema?: { type?: string };
        }[];
        for (const p of parameters) {
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
  it('Variant.maxQuantity is integer 0..10', () => {
    // docs/api/openapi.yaml:1207-1210
    const variant = dereferenced.components.schemas.Variant as {
      properties: { maxQuantity: { type: string; minimum: number; maximum: number } };
    };
    expect(variant.properties.maxQuantity.type).toBe('integer');
    expect(variant.properties.maxQuantity.minimum).toBe(0);
    expect(variant.properties.maxQuantity.maximum).toBe(10);
  });

  it('CatalogItem.maxQuantity is integer 0..10', () => {
    // docs/api/openapi.yaml:1309-1312 (CatalogItem is allOf [ProductBase, ...]).
    const catalogItem = dereferenced.components.schemas.CatalogItem as {
      allOf: {
        properties?: { maxQuantity?: { type: string; minimum: number; maximum: number } };
      }[];
    };
    const own = catalogItem.allOf[1]?.properties?.maxQuantity;
    expect(own, 'CatalogItem must declare maxQuantity on its own allOf branch').toBeDefined();
    expect(own?.type).toBe('integer');
    expect(own?.minimum).toBe(0);
    expect(own?.maximum).toBe(10);
  });

  it('CartItem.quantity is integer 1..10', () => {
    // docs/api/openapi.yaml:1583-1586
    const cartItem = dereferenced.components.schemas.CartItem as {
      properties: { quantity: { type: string; minimum: number; maximum: number } };
    };
    expect(cartItem.properties.quantity.type).toBe('integer');
    expect(cartItem.properties.quantity.minimum).toBe(1);
    expect(cartItem.properties.quantity.maximum).toBe(10);
  });

  it('Product.highlights is 1..6 entries on ProductBase, and Product dereferences to it', () => {
    // The `highlights` array lives on ProductBase
    // (docs/api/openapi.yaml:1267-1272: minItems 1, maxItems 6).
    // Product is allOf [ProductBase, ...] and dereferences the base.
    const productBase = dereferenced.components.schemas.ProductBase as {
      properties: { highlights: { type: string; minItems: number; maxItems: number } };
    };
    expect(productBase.properties.highlights.type).toBe('array');
    expect(productBase.properties.highlights.minItems).toBe(1);
    expect(productBase.properties.highlights.maxItems).toBe(6);

    const product = dereferenced.components.schemas.Product as {
      allOf: { properties?: { highlights?: unknown } }[];
    };
    expect(
      Array.isArray(product.allOf) && product.allOf.length >= 1,
      'Product must be allOf with at least one branch',
    ).toBe(true);
    expect(
      product.allOf[0]?.properties?.highlights,
      'Product.allOf[0] must dereference to ProductBase, which carries highlights',
    ).toBeDefined();
    expect(product.allOf[0].properties.highlights).toEqual(productBase.properties.highlights);
  });
});

describe('T03-AC04 business invariants (not enforced by JSON Schema)', () => {
  it('cart-version-monotonic: every mutating cart operation requires If-Match', () => {
    // Measured: `grep -n "parameters/IfMatch" -B25 docs/api/openapi.yaml |
    //  grep operationId` returns the exact set below
    // (addCartItem, clearCart, setCartItemQuantity, removeCartItem,
    // updateCheckout, createPaymentIntent, createOrder).
    const expected = new Set([
      'addCartItem',
      'clearCart',
      'setCartItemQuantity',
      'removeCartItem',
      'updateCheckout',
      'createPaymentIntent',
      'createOrder',
    ]);

    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(pathItem)) {
        if (!op || typeof op !== 'object') continue;
        if (!['post', 'put', 'patch', 'delete'].includes(method)) continue;
        const operationId = (op as { operationId?: string }).operationId;
        if (!operationId) continue;
        const parameters = ((op as { parameters?: unknown[] }).parameters ?? []) as {
          $ref?: string;
          in?: string;
          name?: string;
        }[];
        const hasIfMatch = parameters.some(
          (p) => p.$ref?.endsWith('/IfMatch') || (p.in === 'header' && p.name === 'If-Match'),
        );
        const shouldHave = expected.has(operationId);
        expect(
          hasIfMatch,
          `${method.toUpperCase()} ${pathKey} (${operationId}) requires If-Match — expected ${shouldHave}`,
        ).toBe(shouldHave);
      }
    }
  });

  it('expiresAt fields are date-time on Cart and PaymentIntent', () => {
    // The `Quote` schema is retired in 2.0.0; the date-time invariant
    // survives on Cart.expiresAt (docs/api/openapi.yaml:1635-1637) and
    // PaymentIntent.expiresAt (docs/api/openapi.yaml:1956-1958).
    const cart = dereferenced.components.schemas.Cart as {
      properties: { expiresAt: { type: string; format: string } };
    };
    expect(cart.properties.expiresAt.type).toBe('string');
    expect(cart.properties.expiresAt.format).toBe('date-time');

    const paymentIntent = dereferenced.components.schemas.PaymentIntent as {
      properties: { expiresAt: { type: string; format: string } };
    };
    expect(paymentIntent.properties.expiresAt.type).toBe('string');
    expect(paymentIntent.properties.expiresAt.format).toBe('date-time');
  });

  it('idempotency-key-required-on-mutations: createPaymentIntent and createOrder list Idempotency-Key', () => {
    // Measured: `grep -n "parameters/IdempotencyKey" docs/api/openapi.yaml`
    // → references at lines 599 (createPaymentIntent) and 780
    // (createOrder). Those are the only two operations that require
    // Idempotency-Key in 2.0.0; the previous "every POST/PUT/PATCH/DELETE"
    // expectation is retired because 2.0.0 narrows the contract to the
    // two operations whose side-effects have to be replay-safe
    // (creating a payment intent that may have side effects on the
    // gateway and creating an order that decrements stock).
    const expected = new Set(['createPaymentIntent', 'createOrder']);

    for (const [pathKey, pathItem] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(pathItem)) {
        if (!op || typeof op !== 'object') continue;
        if (!['post', 'put', 'patch', 'delete'].includes(method)) continue;
        const operationId = (op as { operationId?: string }).operationId;
        if (!operationId) continue;
        const parameters = ((op as { parameters?: unknown[] }).parameters ?? []) as {
          $ref?: string;
          in?: string;
          name?: string;
        }[];
        const hasIdempotency = parameters.some(
          (p) =>
            p.$ref?.endsWith('/IdempotencyKey') ||
            (p.in === 'header' && p.name === 'Idempotency-Key'),
        );
        const shouldHave = expected.has(operationId);
        expect(
          hasIdempotency,
          `${method.toUpperCase()} ${pathKey} (${operationId}) must declare Idempotency-Key — expected ${shouldHave}`,
        ).toBe(shouldHave);
      }
    }
  });
});

describe('T03-AC03 fixture shape (docs/api/fixtures/catalog.json)', () => {
  it('catalog.json contains one product per entry of catalog-source.json', () => {
    expect(catalog.products).toHaveLength(expectedProductCount);
  });

  it('every product has at least one variant', () => {
    for (const p of catalog.products) {
      const variants = p.variants ?? [];
      expect(
        variants.length,
        `product ${p.id ?? '(no id)'} has no variants`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it('at least one product has multiple variants', () => {
    const multi = catalog.products.filter((p) => (p.variants ?? []).length > 1);
    expect(multi.length).toBeGreaterThan(0);
  });

  it('at least one out-of-stock combination exists', () => {
    // docs/api/openapi.yaml:1096-1101: Availability enum = in_stock,
    // out_of_stock. The fixture marks 5 variants as out_of_stock
    // (measured: count of availability === 'out_of_stock').
    const oos = catalog.products
      .flatMap((p) => p.variants ?? [])
      .filter((v) => v.availability === 'out_of_stock');
    expect(oos.length).toBeGreaterThan(0);
  });

  it('at least one low-stock scenario exists (in_stock, maxQuantity in (0..2])', () => {
    // The Availability enum does not carry low_stock; the contract
    // expresses low stock through Variant.maxQuantity (in_stock with a
    // small positive cap). Field names: availability, maxQuantity
    // (Variant schema, openapi.yaml:1207-1210).
    const low = catalog.products
      .flatMap((p) => p.variants ?? [])
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
    for (const p of catalog.products) {
      const brand = String(p.brand ?? '')
        .trim()
        .toLowerCase();
      expect(
        forbidden.has(brand),
        `product ${p.id ?? '(no id)'} uses operator brand "${brand}"`,
      ).toBe(false);
    }
  });

  it('every fixture product validates against the OpenAPI Product schema', () => {
    // Product carries `unevaluatedProperties: false` (docs/api/openapi.yaml:1322).
    // The contract suite compiles against Ajv 2020 (draft 2020-12) so that
    // keyword actually fires; default-export Ajv (draft-07) silently ignores
    // it under `strict: false` and would let unknown fields pass.
    const productSchema = dereferenced.components.schemas.Product as Record<string, unknown>;
    const validate = ajv.compile(productSchema);
    for (const p of catalog.products) {
      const ok = validate(p);
      expect(
        ok,
        `product ${p.id ?? '(no id)'} failed Product schema: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }
  });

  it('a fixture product with an unknown field fails the Product schema', () => {
    // Red proof that the validator above is the 2020-12 one: under
    // draft-07 Ajv `unevaluatedProperties` is an unknown keyword and
    // `validate(sample)` returns `true`. With Ajv2020 it must reject
    // the extra property.
    const sample = { ...catalog.products[0], notInTheContract: 'x' } as Record<string, unknown>;
    const productSchema = dereferenced.components.schemas.Product as Record<string, unknown>;
    const validate = ajv.compile(productSchema);
    const ok = validate(sample);
    expect(ok).toBe(false);
    expect(
      validate.errors?.some((e: { keyword: string }) => e.keyword === 'unevaluatedProperties'),
      `expected an unevaluatedProperties error, got ${JSON.stringify(validate.errors)}`,
    ).toBe(true);
  });
});

/**
 * The T04 wiring the package.json `api:generate` script drives
 * regenerates `src/app/api/generated/` from this contract. The script
 * name is part of the contract, not an implementation detail.
 */
function declaresApiGenerate(scripts: Record<string, string> | undefined): boolean {
  return Object.prototype.hasOwnProperty.call(scripts ?? {}, 'api:generate');
}

describe('package.json contract — api:generate is declared (T04 wiring)', () => {
  it('package.json declares the api:generate script', async () => {
    const packageJsonRaw = await readFile(resolve(__dirname, '../../package.json'), 'utf8');
    const packageJson = JSON.parse(packageJsonRaw) as { scripts?: Record<string, string> };
    expect(
      declaresApiGenerate(packageJson.scripts),
      'package.json scripts.api:generate is required (T04 wires ng-openapi-gen; T03 asserts the name)',
    ).toBe(true);
  });

  it('the check fails when the script is renamed or absent', () => {
    expect(
      declaresApiGenerate({ 'zz-api:generate': 'ng-openapi-gen --config ng-openapi-gen.json' }),
    ).toBe(false);
    expect(declaresApiGenerate({})).toBe(false);
    expect(declaresApiGenerate(undefined)).toBe(false);
  });
});
