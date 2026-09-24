// tests/contract/shop-bad-request.spec.ts — every shop operation declares 400 (MIM-401).
//
// The backend answers 400 INVALID_REQUEST on any query key an operation does
// not declare, on every operation (UnknownQueryParameterInterceptor is
// registered with no path pattern), so every shop operation in
// contracts/commerce/openapi.yaml declares the shared BadRequest response.

import { beforeAll, describe, expect, it } from 'vitest';

import {
  collectOperations,
  loadOpenApiSpec,
  REQUIRED_OPERATION_COUNT,
} from './response-validation';

describe('MIM-401 unknown query parameter', () => {
  beforeAll(async () => {
    await loadOpenApiSpec();
  });

  it('every shop operation declares 400', () => {
    const operations = collectOperations();
    expect(operations).toHaveLength(REQUIRED_OPERATION_COUNT);
    const without400 = operations
      .filter((operation) => !operation.documentedStatuses.includes('400'))
      .map((operation) => operation.operationId);
    expect(without400).toEqual([]);
  });
});
