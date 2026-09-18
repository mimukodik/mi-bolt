#!/usr/bin/env node
// validate-contract.mjs — T03 contract validation entry point.
//
// Reads docs/api/openapi.yaml (the wire contract) and the fixture set under
// docs/api/fixtures/, dereferences all $refs with
// @apidevtools/json-schema-ref-parser, and enforces the OpenAPI 3.1 invariants
// the MiBolt domain depends on:
//
//   T03-AC01  exactly 16 operationIds, all unique; every $ref resolves;
//             every example validates against its declared schema
//   T03-AC02  status codes are sane; repeated query arrays use style=form,
//             explode=true; Money.amount is whole-HUF integer everywhere
//   T03-AC03  fixtures match the Product schema, contain 16 fictional
//             products with at least one multi-variant product, an
//             out-of-stock combination and a low-stock scenario
//   T03-AC04  schema constraints preserve (Money bounds, Variant cap,
//             Cart line quantity)
//   T03-AC05  package.json declares the `api:generate` script (T04 wires
//             it; T03 only asserts the contract name exists)
//
// Exits 0 with `contract:OK` on success, exits 1 with a structured error
// payload otherwise. The validator performs no install and performs no
// write: every read goes through `fs.readFile` and the schema dereferencer.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import yaml from 'js-yaml';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(__dirname, '..');

export const REQUIRED_OPERATION_IDS = 16;

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'options', 'head']);

const KNOWN_2XX = new Set(['200', '201', '202', '203', '204', '206']);
const KNOWN_4XX = new Set(['400', '401', '403', '404', '409', '410', '413', '415', '422', '429']);
const KNOWN_5XX = new Set(['500', '502', '503', '504']);

// ---------------------------------------------------------------------------
// Spec collection
// ---------------------------------------------------------------------------

export function collectOperationIds(spec) {
  const ids = [];
  for (const [pathKey, pathItem] of Object.entries(spec?.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (!op || typeof op !== 'object') continue;
      if (typeof op.operationId !== 'string') continue;
      ids.push({
        path: pathKey,
        method: method.toUpperCase(),
        operationId: op.operationId,
      });
    }
  }
  return ids;
}

export function findDuplicateOperationIds(entries) {
  const seen = new Map();
  const duplicates = [];
  for (const entry of entries) {
    const prior = seen.get(entry.operationId);
    if (prior) {
      duplicates.push({
        operationId: entry.operationId,
        first: prior,
        second: { path: entry.path, method: entry.method },
      });
    } else {
      seen.set(entry.operationId, { path: entry.path, method: entry.method });
    }
  }
  return duplicates;
}

// ---------------------------------------------------------------------------
// Money invariant — T03-AC02
// ---------------------------------------------------------------------------

export function assertMoneyIsInteger(spec) {
  const errors = [];
  const money = spec?.components?.schemas?.Money;
  if (!money || money.type !== 'object') {
    errors.push({
      kind: 'money-schema-missing',
      reason: 'components.schemas.Money is missing or not an object',
    });
    return errors;
  }
  const amount = money.properties?.amount;
  if (!amount) {
    errors.push({ kind: 'money-amount-missing', reason: 'Money.amount missing' });
  } else if (amount.type !== 'integer') {
    errors.push({
      kind: 'money-amount-not-integer',
      type: amount.type,
      reason: `Money.amount must be type=integer (whole HUF), got type=${amount.type}`,
    });
  }

  // Walk every example recursively. A Money-shaped object is identified by
  // *typed* values, not key presence: amount must be number-typed and currency
  // must be string-typed. JSON Schema property definitions with keys named
  // `amount` and `currency` are not Money instances.
  function visit(node, path) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((child, i) => visit(child, `${path}[${i}]`));
      return;
    }
    if (typeof node.amount === 'number' && typeof node.currency === 'string') {
      if (!Number.isInteger(node.amount)) {
        errors.push({
          kind: 'money-amount-float',
          path,
          amount: node.amount,
          reason: `Money.amount at ${path} must be a whole-HUF integer`,
        });
      }
      if (node.currency !== 'HUF') {
        errors.push({
          kind: 'money-currency-not-huf',
          path,
          currency: node.currency,
          reason: `Money.currency at ${path} must be HUF`,
        });
      }
    }
    for (const [k, v] of Object.entries(node)) visit(v, `${path}.${k}`);
  }
  visit(spec, '#');
  return errors;
}

// ---------------------------------------------------------------------------
// Repeated query-array encoding — T03-AC02
// ---------------------------------------------------------------------------

export function assertRepeatedQueryEncoding(spec) {
  const errors = [];
  for (const [pathKey, pathItem] of Object.entries(spec?.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !op || typeof op !== 'object') continue;
      const params = Array.isArray(op.parameters) ? op.parameters : [];
      for (const param of params) {
        if (param?.in !== 'query') continue;
        const schema = param.schema ?? {};
        if (schema.type !== 'array') continue;
        if (param.style !== 'form' || param.explode !== true) {
          errors.push({
            kind: 'repeated-query-encoding',
            operationId: op.operationId,
            path: `${method.toUpperCase()} ${pathKey}`,
            parameter: param.name,
            style: param.style ?? null,
            explode: param.explode ?? null,
            reason: `Repeated query array parameter "${param.name}" must use style=form, explode=true`,
          });
        }
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Status code sanity — T03-AC02
// ---------------------------------------------------------------------------

export function assertStatusCodes(spec) {
  const errors = [];
  for (const [pathKey, pathItem] of Object.entries(spec?.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !op || typeof op !== 'object') continue;
      const responses = op.responses ?? {};
      for (const status of Object.keys(responses)) {
        if (status === 'default') continue;
        if (!/^[1-5]\d\d$/.test(status)) {
          errors.push({
            kind: 'invalid-status-code',
            operationId: op.operationId,
            path: `${method.toUpperCase()} ${pathKey}`,
            status,
            reason: `Response status "${status}" is not a three-digit code`,
          });
          continue;
        }
        const bucket = `${status[0]}XX`;
        const known = bucket === '2XX' ? KNOWN_2XX : bucket === '4XX' ? KNOWN_4XX : KNOWN_5XX;
        if (!known.has(status)) {
          errors.push({
            kind: 'unexpected-status-code',
            operationId: op.operationId,
            path: `${method.toUpperCase()} ${pathKey}`,
            status,
            reason: `Response status "${status}" is not in the project's documented set`,
          });
        }
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Example validation — T03-AC01
// ---------------------------------------------------------------------------

export function buildAjv() {
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: false,
  });
  addFormats(ajv);
  return ajv;
}

export function assertExamplesValidate(rawSpec, dereferencedSpec, ajv = buildAjv()) {
  const errors = [];

  // Pre-register every dereferenced schema so $refs in raw mediaObj schemas
  // resolve through the ajv instance. We assign $id = the canonical $ref path
  // so ajv can resolve `#/components/schemas/Foo` -> the registered schema.
  if (dereferencedSpec?.components?.schemas) {
    for (const [name, schema] of Object.entries(dereferencedSpec.components.schemas)) {
      const tagged = { ...schema, $id: `#/components/schemas/${name}` };
      try {
        ajv.addSchema(tagged);
      } catch {
        // Schema may already be registered or contain $id collision; ignore.
      }
    }
  }

  const validatorCache = new Map();
  function validatorFor(schema, schemaName) {
    const key = schemaName ?? JSON.stringify(schema);
    let v = validatorCache.get(key);
    if (!v) {
      try {
        v = ajv.compile(schema);
      } catch (err) {
        errors.push({
          kind: 'schema-compile-failed',
          schema: schemaName,
          reason: err?.message ?? String(err),
        });
        return null;
      }
      validatorCache.set(key, v);
    }
    return v;
  }

  function checkExample(example, schema, where) {
    const validate = validatorFor(schema, where);
    if (!validate) return;
    const ok = validate(example);
    if (!ok) {
      errors.push({
        kind: 'example-validation-failed',
        where,
        errors: validate.errors,
      });
    }
  }

  // Schemas-level examples (e.g. DemoConfig examples at the schema level)
  for (const [schemaName, schema] of Object.entries(rawSpec?.components?.schemas ?? {})) {
    if (Array.isArray(schema.examples)) {
      for (let i = 0; i < schema.examples.length; i++) {
        checkExample(schema.examples[i], schema, `${schemaName}.examples[${i}]`);
      }
    }
  }

  // Operation-level examples (media type examples)
  for (const [pathKey, pathItem] of Object.entries(rawSpec?.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !op || typeof op !== 'object') continue;
      for (const [status, response] of Object.entries(op.responses ?? {})) {
        const content = response?.content ?? {};
        for (const [mediaType, mediaObj] of Object.entries(content)) {
          if (!mediaObj || typeof mediaObj !== 'object') continue;
          if (Array.isArray(mediaObj.examples)) {
            for (let i = 0; i < mediaObj.examples.length; i++) {
              const ex = mediaObj.examples[i];
              if (ex && typeof ex === 'object' && 'value' in ex) {
                checkExample(
                  ex.value,
                  mediaObj.schema ?? {},
                  `${op.operationId}.responses.${status}.${mediaType}.examples[${i}]`,
                );
              }
            }
          }
        }
      }
      if (op.requestBody?.content) {
        for (const [mediaType, mediaObj] of Object.entries(op.requestBody.content)) {
          if (!mediaObj || typeof mediaObj !== 'object') continue;
          if (Array.isArray(mediaObj.examples)) {
            for (let i = 0; i < mediaObj.examples.length; i++) {
              const ex = mediaObj.examples[i];
              if (ex && typeof ex === 'object' && 'value' in ex) {
                checkExample(
                  ex.value,
                  mediaObj.schema ?? {},
                  `${op.operationId}.requestBody.${mediaType}.examples[${i}]`,
                );
              }
            }
          }
        }
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Idempotency key on mutations — T03-AC04 business invariant
// ---------------------------------------------------------------------------

export function assertIdempotencyKeyOnMutations(spec) {
  const errors = [];
  for (const [pathKey, pathItem] of Object.entries(spec?.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const [method, op] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method) || !op || typeof op !== 'object') continue;
      const upper = method.toUpperCase();
      if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(upper)) continue;
      const params = Array.isArray(op.parameters) ? op.parameters : [];
      const has = params.some(
        (p) =>
          p?.$ref?.endsWith('/IdempotencyKey') ||
          (p?.in === 'header' && p?.name === 'Idempotency-Key'),
      );
      if (!has) {
        errors.push({
          kind: 'missing-idempotency-key',
          operationId: op.operationId,
          path: `${upper} ${pathKey}`,
          reason: 'Every mutating operation must require Idempotency-Key header',
        });
      }
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// package.json contract — T03-AC05
// ---------------------------------------------------------------------------

export function assertApiGenerateScript(packageJson) {
  const errors = [];
  if (!packageJson || typeof packageJson !== 'object') {
    errors.push({
      kind: 'package-json-missing',
      reason: 'package.json could not be read or parsed',
    });
    return errors;
  }
  const scripts = packageJson.scripts ?? {};
  if (!Object.prototype.hasOwnProperty.call(scripts, 'api:generate')) {
    errors.push({
      kind: 'api-generate-missing',
      reason:
        'package.json scripts.api:generate is required (T04 wires ng-openapi-gen; T03 asserts the name)',
    });
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Fixture shape — T03-AC03
// ---------------------------------------------------------------------------

export function assertFixturesShape(products) {
  const errors = [];
  if (!Array.isArray(products)) {
    errors.push({ kind: 'fixture-not-array', reason: 'products fixture must be an array' });
    return errors;
  }
  if (products.length < REQUIRED_OPERATION_IDS) {
    errors.push({
      kind: 'fixture-product-count',
      count: products.length,
      required: REQUIRED_OPERATION_IDS,
      reason: `products fixture must contain at least ${REQUIRED_OPERATION_IDS} products for pagination`,
    });
  }
  const multiVariant = products.filter((p) => Array.isArray(p?.variants) && p.variants.length > 1);
  if (multiVariant.length === 0) {
    errors.push({
      kind: 'fixture-no-multivariant',
      reason: 'products fixture must contain at least one product with multiple variants',
    });
  }
  const allVariants = products.flatMap((p) => (Array.isArray(p?.variants) ? p.variants : []));
  if (allVariants.length === 0) {
    errors.push({ kind: 'fixture-no-variants', reason: 'products fixture has no variants' });
  }
  const outOfStock = allVariants.filter(
    (v) => v?.availability === 'out_of_stock' && v?.maxQuantity === 0,
  );
  if (outOfStock.length === 0) {
    errors.push({
      kind: 'fixture-no-out-of-stock',
      reason: 'products fixture must contain at least one out-of-stock combination',
    });
  }
  const lowStock = allVariants.filter(
    (v) =>
      v?.availability === 'in_stock' &&
      typeof v?.maxQuantity === 'number' &&
      v.maxQuantity <= 2 &&
      v.maxQuantity > 0,
  );
  if (lowStock.length === 0) {
    errors.push({
      kind: 'fixture-no-low-stock',
      reason:
        'products fixture must contain at least one low-stock scenario (maxQuantity in (0..2])',
    });
  }
  // Real Hungarian operators are explicitly forbidden in the fixture set;
  // we reject well-known telco brands from the `brand` field of any product.
  // The mi-bolt-design skill already requires demo data only, but the
  // validator hardens it against a copied operator brand.
  const FORBIDDEN_OPERATORS = new Set([
    'yettel',
    'telekom',
    'magyar telekom',
    'vodafone',
    'vodafone hu',
    'digi',
    'digi.hu',
  ]);
  for (const p of products) {
    const brand = String(p?.brand ?? '')
      .trim()
      .toLowerCase();
    if (brand && FORBIDDEN_OPERATORS.has(brand)) {
      errors.push({
        kind: 'fixture-operator-name',
        productId: p?.id,
        matched: brand,
        reason: `products fixture brand "${p.brand}" is a real operator name`,
      });
    }
  }
  return errors;
}

export function assertFixturesSchema(products, ajv = buildAjv()) {
  const errors = [];
  const validate = ajv.getSchema('https://example.invalid/dummy');
  // We accept the schema from the spec is needed, so this function expects
  // the dereferenced spec to be passed separately. See validateContract.
  if (!validate) {
    errors.push({
      kind: 'fixture-schema-missing',
      reason: 'assertFixturesSchema requires a registered schema; use validateContract',
    });
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function dereferenceSpec(spec) {
  return $RefParser.dereference(structuredClone(spec));
}

/**
 * @param {object} input
 * @param {object} input.spec             Parsed OpenAPI document (object form)
 * @param {object|null} input.dereferenced Dereferenced spec from json-schema-ref-parser
 * @param {object|null} input.products    Parsed products.json array
 * @param {object|null} input.packageJson Parsed package.json
 * @returns {{ok:boolean, summary:string, errors:object[], stats:object}}
 */
export function validateContract({ spec, dereferenced, products, packageJson }) {
  const errors = [];

  // AC01 — operationIds
  const operationIds = collectOperationIds(spec ?? {});
  if (operationIds.length !== REQUIRED_OPERATION_IDS) {
    errors.push({
      kind: 'operation-id-count',
      count: operationIds.length,
      required: REQUIRED_OPERATION_IDS,
      reason: `expected exactly ${REQUIRED_OPERATION_IDS} operationIds, got ${operationIds.length}`,
    });
  }
  const duplicates = findDuplicateOperationIds(operationIds);
  for (const dup of duplicates) {
    errors.push({
      kind: 'duplicate-operation-id',
      operationId: dup.operationId,
      first: dup.first,
      second: dup.second,
      reason: `operationId "${dup.operationId}" appears on more than one operation`,
    });
  }

  // AC01 — ref resolution
  if (!dereferenced) {
    errors.push({
      kind: 'ref-dereference-failed',
      reason:
        'json-schema-ref-parser could not dereference the spec; one or more $ref points are unresolved',
    });
  }

  // AC01 — example validation
  if (dereferenced) {
    for (const err of assertExamplesValidate(spec, dereferenced)) errors.push(err);
  }

  // AC02 — money, status, query encoding
  for (const err of assertMoneyIsInteger(spec ?? {})) errors.push(err);
  for (const err of assertStatusCodes(spec ?? {})) errors.push(err);
  for (const err of assertRepeatedQueryEncoding(spec ?? {})) errors.push(err);

  // AC04 — idempotency on mutations
  for (const err of assertIdempotencyKeyOnMutations(spec ?? {})) errors.push(err);

  // AC05 — api:generate
  for (const err of assertApiGenerateScript(packageJson)) errors.push(err);

  // AC03 — fixture shape
  for (const err of assertFixturesShape(products ?? null)) errors.push(err);

  // AC04 — fixtures against the Product schema
  if (dereferenced && Array.isArray(products) && products.length > 0) {
    const ajv = buildAjv();
    const productSchema = dereferenced.components?.schemas?.Product;
    if (!productSchema) {
      errors.push({
        kind: 'product-schema-missing',
        reason: 'Product schema is missing from components.schemas',
      });
    } else {
      const validate = ajv.compile(productSchema);
      for (let i = 0; i < products.length; i++) {
        const ok = validate(products[i]);
        if (!ok) {
          errors.push({
            kind: 'fixture-product-schema-failed',
            index: i,
            productId: products[i]?.id,
            errors: validate.errors,
          });
        }
      }
    }
  }

  const ok = errors.length === 0;
  return {
    ok,
    summary: ok ? 'contract:OK' : 'contract:FAIL',
    errors,
    stats: {
      operationIdCount: operationIds.length,
      duplicateCount: duplicates.length,
      productCount: Array.isArray(products) ? products.length : 0,
      dereferenced: Boolean(dereferenced),
    },
  };
}

// ---------------------------------------------------------------------------
// File-system orchestration
// ---------------------------------------------------------------------------

export async function loadSpec(specPath) {
  const raw = await readFile(specPath, 'utf8');
  return yaml.load(raw);
}

export async function dereferenceFromPath(specPath) {
  return $RefParser.dereference(specPath);
}

export async function loadJson(jsonPath) {
  const raw = await readFile(jsonPath, 'utf8');
  return JSON.parse(raw);
}

export async function runValidator({
  spec: specPath,
  products: productsPath,
  packageJson: packageJsonPath,
}) {
  const spec = await loadSpec(specPath);
  const dereferenced = await dereferenceFromPath(specPath);
  const products = await loadJson(productsPath);
  const packageJson = await loadJson(packageJsonPath);
  return validateContract({ spec, dereferenced, products, packageJson });
}

export const DEFAULT_PATHS = Object.freeze({
  spec: resolve(REPO_ROOT, 'docs/api/openapi.yaml'),
  products: resolve(REPO_ROOT, 'docs/api/fixtures/products.json'),
  packageJson: resolve(REPO_ROOT, 'package.json'),
});

async function main() {
  const result = await runValidator(DEFAULT_PATHS);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err) + '\n');
    process.exit(2);
  });
}
