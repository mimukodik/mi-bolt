/**
 * MIM-212 — shared Problem HTTP response for the order and payment handlers.
 *
 * `problemResponse` builds the body the two copies in `order.handlers.ts`
 * and `payment.handlers.ts` used to assemble, and `PROBLEM_CONTENT_TYPE`
 * is the matching `application/problem+json` literal those files carried
 * locally. The other handlers (`catalog`, `checkout`, `cart`) and the
 * dispatcher shell in `create-handlers.ts` have no `problemResponse` of
 * their own and keep their own copy of the literal.
 */

import { HttpResponse, type DefaultBodyType } from 'msw';

import type { Problem } from '../app/api/generated/models/problem';

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
