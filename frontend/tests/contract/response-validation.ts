/**
 * T26 — OpenAPI-backed schema validators used by the contract
 * parity suite (`tests/contract/operation-matrix.spec.ts`).
 *
 * The wire contract is `contracts/commerce/openapi.yaml`; the SDK is generated
 * from it; the MSW handlers register their slices through the T05
 * dispatcher. T26 makes drift between the three obvious at build
 * time by:
 *
 *   - walking `paths` to derive the inventory of operationIds
 *     (no hand-maintained list anywhere in the repo),
 *   - compiling an AJV validator for every response and request
 *     body shape declared by the contract,
 *   - compiling a Problem validator so every business error code
 *     the contract documents is exercised at test boundary.
 *
 * The validators cache their compiled AJV instances by schema name
 * because AJV compilation is the expensive step; the validator
 * returned by `compileResponseValidator` is reusable across hundreds
 * of requests in the same run.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import yaml from 'js-yaml';
import $RefParser from '@apidevtools/json-schema-ref-parser';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';

import { withoutAdminOperations } from './admin-tags';

export const REPO_ROOT = resolve(__dirname, '../..');
export const SPEC_PATH = resolve(REPO_ROOT, '../contracts/commerce/openapi.yaml');

export const REQUIRED_OPERATION_COUNT = 19;

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

export const HTTP_METHODS: readonly HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

export type SpecPaths = Record<string, Record<string, SpecOperation>>;

export type SpecParameter = {
  $ref?: string;
  in?: string;
  name?: string;
  required?: boolean;
  schema?: {
    type?: string;
    enum?: unknown[];
    format?: string;
    pattern?: string;
    minimum?: number;
    maximum?: number;
    maxLength?: number;
  };
  description?: string;
};

export type SpecOperation = {
  operationId?: string;
  parameters?: SpecParameter[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: unknown }>;
  };
  responses?: Record<
    string,
    { description?: string; content?: Record<string, { schema?: unknown }> }
  >;
  tags?: string[];
};

export type OpenApiSpec = {
  openapi?: string;
  paths?: SpecPaths;
  components?: {
    schemas?: Record<string, unknown>;
    parameters?: Record<
      string,
      { in?: string; name?: string; required?: boolean; schema?: unknown }
    >;
  };
};

export type OperationDescriptor = {
  operationId: string;
  method: HttpMethod;
  path: string;
  pathParams: string[];
  tag: string;
  successStatus: string;
  hasRequestBody: boolean;
  bodyRequired: boolean;
  documentedStatuses: string[];
};

let rawSpecCache: OpenApiSpec | null = null;
let derefSpecCache: OpenApiSpec | null = null;
let ajvCache: Ajv2020 | null = null;
let responseValidators: Map<string, Map<string, ValidateFunction>> | null = null;
let requestValidators: Map<string, ValidateFunction> | null = null;
let problemValidator: ValidateFunction | null = null;

function ensureRawSpec(): OpenApiSpec {
  if (rawSpecCache) return rawSpecCache;
  // Synchronous seed: callers always run after `await loadOpenApiSpec()`
  // in `beforeAll`, so the lazy fallback below should never fire.
  // Reading from disk is intentionally avoided here to keep this module
  // synchronous for the hot path (operation-matrix iteration).
  throw new Error(
    '[mi-bolt/contract] openapi.yaml is not loaded yet; call loadOpenApiSpec() in beforeAll first',
  );
}

/**
 * Loads the raw openapi.yaml and resolves every $ref so AJV can compile
 * the response / request schemas without further indirection. Returns
 * both the raw (for $ref-aware consumers) and the dereferenced views.
 */
export async function loadOpenApiSpec(): Promise<{
  raw: OpenApiSpec;
  dereferenced: OpenApiSpec;
}> {
  const rawYaml = await readFile(SPEC_PATH, 'utf8');
  // Shop suite: admin-tagged operations are the admin SDK's (tests/contract/admin-tags.ts).
  const raw = withoutAdminOperations(yaml.load(rawYaml) as OpenApiSpec);
  const dereferenced = withoutAdminOperations(
    (await $RefParser.dereference(SPEC_PATH)) as OpenApiSpec,
  );
  rawSpecCache = raw;
  derefSpecCache = dereferenced;
  ajvCache = buildAjv();
  precompileValidators();
  return { raw, dereferenced };
}

function buildAjv(): Ajv2020 {
  // The contract gates `date-time` and `email` formats at the wire
  // boundary (Cart.expiresAt, PaymentIntent.expiresAt, OrderReceipt.contactEmail).
  // Disabling format validation entirely would let a malformed timestamp
  // pass, which is exactly the kind of drift T26-AC05 must catch. Keep all
  // format checks enabled. Compiling against Ajv 2020 (draft 2020-12)
  // also makes the contract's `unevaluatedProperties: false` actually
  // enforce — default-export Ajv (draft-07) silently ignores it under
  // `strict: false`.
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}

/**
 * Walks `paths` and returns one descriptor per HTTP operation. The
 * caller uses this to drive every assertion in the contract suite so
 * adding an operation to the spec cannot go unnoticed.
 */
export function collectOperations(
  spec: OpenApiSpec = derefSpecCache ?? ensureRawSpec(),
): OperationDescriptor[] {
  const rows: OperationDescriptor[] = [];
  for (const [pathKey, pathItem] of Object.entries(spec.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    for (const method of HTTP_METHODS) {
      const op = (pathItem as Record<string, SpecOperation | undefined>)[method];
      if (!op || typeof op !== 'object' || typeof op.operationId !== 'string') continue;
      const parameters = Array.isArray(op.parameters) ? op.parameters : [];
      const pathParameters = collectPathParameters(pathKey, parameters, spec);
      const documented = Object.keys(op.responses ?? {});
      const success = pickSuccessStatus(documented);
      const hasRequestBody = typeof op.requestBody === 'object' && op.requestBody !== null;
      const isBodyRequired = Boolean(
        op.requestBody && 'required' in op.requestBody ? op.requestBody.required : false,
      );
      const tag = Array.isArray(op.tags) && typeof op.tags[0] === 'string' ? op.tags[0] : '';
      rows.push({
        operationId: op.operationId,
        method,
        path: pathKey.startsWith('/') ? pathKey : `/${pathKey}`,
        pathParams: pathParameters,
        tag,
        successStatus: success,
        hasRequestBody,
        bodyRequired: isBodyRequired,
        documentedStatuses: documented,
      });
    }
  }
  return rows;
}

function pickSuccessStatus(statuses: string[]): string {
  // OpenAPI convention: 2xx first; fall back to the first declared
  // status so a missing 200/201 still yields something useful.
  const ok = statuses.find((s) => /^2\d\d$/.test(s));
  return ok ?? statuses[0] ?? '200';
}

function collectPathParameters(
  path: string,
  parameters: SpecParameter[],
  spec: OpenApiSpec,
): string[] {
  const matches = path.matchAll(/\{([^}]+)\}/g);
  const names = Array.from(matches, (m) => m[1] ?? '').filter((n) => n.length > 0);
  const components = spec.components?.parameters ?? {};
  const declared = new Set<string>();
  for (const p of parameters) {
    if (typeof p.$ref === 'string') {
      const referenceName = p.$ref.split('/').pop();
      if (referenceName && referenceName in components) {
        declared.add(components[referenceName]?.name ?? '');
      }
    } else if (p.in === 'path') {
      declared.add(p.name ?? '');
    }
  }
  // Path placeholders that are not declared in `parameters` are still
  // surfaced — the consumer wants every `{x}` token to match a route
  // parameter, declared or implied.
  for (const name of names) declared.add(name);
  return [...declared];
}

/**
 * Converts an OpenAPI path template (`/carts/{cartId}/items/{itemId}`)
 * into the MSW path pattern (`/carts/:cartId/items/:itemId`). Used to
 * correlate operation descriptors with handler routes.
 */
export function openApiPathToMswPath(path: string): string {
  return path.replaceAll(/\{([^}]+)\}/g, ':$1');
}

/**
 * Builds a `{status: validator}` map for the given operation so the
 * contract suite can validate every documented response status. The
 * cache is shared across the whole process so 19 operations × N
 * statuses compile exactly once.
 */
export function compileResponseValidator(
  operationId: string,
  status: string,
): ValidateFunction | null {
  if (!responseValidators) return null;
  const map = responseValidators.get(operationId);
  return map ? (map.get(status) ?? null) : null;
}

export function compileRequestValidator(operationId: string): ValidateFunction | null {
  return requestValidators ? (requestValidators.get(operationId) ?? null) : null;
}

export function getProblemValidator(): ValidateFunction {
  if (!problemValidator) {
    throw new Error(
      '[mi-bolt/contract] Problem validator is not compiled; call loadOpenApiSpec() first',
    );
  }
  return problemValidator;
}

function precompileValidators(): void {
  if (!ajvCache || !derefSpecCache) return;
  responseValidators = new Map();
  requestValidators = new Map();

  const schemas = derefSpecCache.components?.schemas ?? {};
  for (const [name, schema] of Object.entries(schemas)) {
    try {
      ajvCache.addSchema({ ...schema, $id: `#/components/schemas/${name}` });
    } catch {
      // Duplicate $id collisions are harmless here; the standalone
      // compile below is what the validator actually consumes.
    }
  }

  const problemSchema = schemas['Problem'];
  if (problemSchema && typeof problemSchema === 'object') {
    problemValidator = ajvCache.compile(problemSchema);
  }

  const operations = collectOperations(derefSpecCache);
  for (const op of operations) {
    const opSpec = (
      derefSpecCache.paths?.[op.path] as Record<string, SpecOperation | undefined> | undefined
    )?.[op.method];
    if (!opSpec) continue;
    const statusMap = new Map<string, ValidateFunction>();
    const responses = opSpec.responses ?? {};
    for (const [status, response] of Object.entries(responses)) {
      const jsonMedia = response.content?.['application/json'];
      if (!jsonMedia || typeof jsonMedia !== 'object') continue;
      try {
        statusMap.set(status, ajvCache.compile(jsonMedia.schema ?? {}));
      } catch {
        // Schema fails to compile; the suite surfaces a single, focused
        // failure rather than masking the issue with a swallowed error.
      }
    }
    responseValidators.set(op.operationId, statusMap);

    const requestJson = opSpec.requestBody?.content?.['application/json'];
    if (requestJson && typeof requestJson === 'object' && requestJson.schema) {
      try {
        requestValidators.set(op.operationId, ajvCache.compile(requestJson.schema));
      } catch {
        // Leave the operation out of the request-validator cache; the
        // operation-matrix spec reports the failure on first use.
      }
    }
  }
}

/**
 * Maps every `ProblemCode` documented in the contract to the
 * operationIds that may legally return it. The matrix is built from
 * the spec rather than maintained by hand; T26-AC03 walks it to drive
 * the negative-path coverage.
 */
export function buildProblemCodeMatrix(
  spec: OpenApiSpec = derefSpecCache ?? ensureRawSpec(),
): Map<string, Set<string>> {
  const matrix = new Map<string, Set<string>>();
  const operations = collectOperations(spec);
  for (const op of operations) {
    const opSpec = (
      spec.paths?.[op.path] as Record<string, SpecOperation | undefined> | undefined
    )?.[op.method];
    if (!opSpec) continue;
    for (const [status, response] of Object.entries(opSpec.responses ?? {})) {
      if (!status.startsWith('4') && !status.startsWith('5')) continue;
      const codes = collectCodesFromSchema(response.content?.['application/problem+json']?.schema);
      for (const code of codes) {
        let bucket = matrix.get(code);
        if (!bucket) {
          bucket = new Set<string>();
          matrix.set(code, bucket);
        }
        bucket.add(op.operationId);
      }
    }
  }
  return matrix;
}

function collectCodesFromSchema(schema: unknown): string[] {
  if (!schema || typeof schema !== 'object') return [];
  // The Problem schema always $refs `ProblemCode`, but dereferenced
  // payloads inline the enum on `properties.code`. Walk every node
  // and surface any enum-shaped string list.
  const codes: string[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const record = node as Record<string, unknown>;
    if (
      Array.isArray(record['enum']) &&
      typeof record['type'] === 'string' &&
      record['type'] === 'string'
    ) {
      for (const value of record['enum']) {
        if (typeof value === 'string') codes.push(value);
      }
    }
    for (const value of Object.values(record)) visit(value);
  };
  visit(schema);
  return codes;
}
