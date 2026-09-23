import { HttpResponse } from 'msw';

import type { FieldError } from '../app/api/generated/models/field-error';
import type { Problem } from '../app/api/generated/models/problem';
import type { ProblemCode } from '../app/api/generated/models/problem-code';

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export interface ProblemExtras {
  readonly detail?: string;
  readonly fieldErrors?: readonly FieldError[];
  readonly params?: Record<string, unknown>;
}

/** A contract Problem answer, the same `type` form as the backend and the shop mock. */
export function problem(
  status: number,
  code: ProblemCode,
  title: string,
  extras: ProblemExtras = {},
): HttpResponse<Problem> {
  const body: Problem = {
    type: `urn:mi-bolt:problem:${code.toLowerCase().replace(/_/g, '-')}`,
    title,
    status,
    code,
    detail: extras.detail ?? title,
    traceId: crypto.randomUUID().replace(/-/g, ''),
    fieldErrors: [...(extras.fieldErrors ?? [])],
    ...(extras.params === undefined ? {} : { params: extras.params }),
  };
  return HttpResponse.json(body, { status, headers: { 'content-type': PROBLEM_CONTENT_TYPE } });
}
