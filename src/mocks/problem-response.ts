/**
 * MIM-212 — the shared Problem HTTP helpers of the mock layer.
 *
 * `PROBLEM_CONTENT_TYPE` is the media type every Problem body is served
 * with, `problemResponse` turns a failed store outcome into that
 * response and `invalidRequest` is the 400 Problem for a missing or
 * malformed handler-level input. The catalogue handlers build their
 * parse-time 400 themselves because its detail comes from a `FilterError`.
 */

import { HttpResponse, type DefaultBodyType } from 'msw';

import type { Problem } from '../app/api/generated/models/problem';
import type { CreateHandlersOptions } from './create-handlers';
import { buildTraceId, problemType } from './cart/cart-store';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json' as const;

export function problemResponse(outcome: {
  ok: false;
  problem: Problem;
}): HttpResponse<DefaultBodyType> {
  return HttpResponse.json(outcome.problem, {
    status: outcome.problem.status,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}

export function invalidRequest(
  options: CreateHandlersOptions,
  detail: string,
  params: Record<string, unknown>,
): HttpResponse<DefaultBodyType> {
  const body: Problem = {
    type: problemType('INVALID_REQUEST'),
    title: 'Invalid request',
    status: 400,
    code: 'INVALID_REQUEST',
    detail,
    traceId: buildTraceId(options),
    fieldErrors: [],
    params,
  };
  return HttpResponse.json(body, {
    status: 400,
    headers: { 'content-type': PROBLEM_CONTENT_TYPE },
  });
}
