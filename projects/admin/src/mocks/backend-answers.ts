import type { HttpResponse } from 'msw';

import { isRecord } from '../app/core/is-record';
import type { FieldError } from '../app/api/generated/models/field-error';
import type { Problem } from '../app/api/generated/models/problem';
import { problem } from './problem';

/** A field error as the backend serialises it: `params` is always present, `{}` when empty. */
export function fieldError(
  path: string,
  code: string,
  params: Record<string, unknown> = {},
): FieldError {
  return { path, code, params };
}

/** A body that is not JSON, not a JSON object, or carries a member its schema does not declare. */
export function malformedBody(): HttpResponse<Problem> {
  return problem(400, 'INVALID_REQUEST', 'Invalid request', { detail: 'Malformed request body' });
}

/** Bean validation on a body: every violation in one answer; one `REQUIRED` among them makes it a 400. */
export function bodyViolations(fieldErrors: readonly FieldError[]): HttpResponse<Problem> {
  if (fieldErrors.some((error) => error.code === 'REQUIRED')) {
    return problem(400, 'INVALID_REQUEST', 'Invalid request', {
      detail: 'Missing required member',
      fieldErrors,
    });
  }
  return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
    detail: 'One or more supplied fields are not acceptable',
    fieldErrors,
  });
}

/** The first query key in query-string order, or `undefined` when there is none. */
export function firstQueryKey(request: Request): string | undefined {
  return [...new URL(request.url).searchParams.keys()][0];
}

/** A query key the operation does not declare. */
export function unknownQueryParameter(parameter: string): HttpResponse<Problem> {
  return problem(400, 'INVALID_REQUEST', 'Invalid request', {
    detail: 'Unknown query parameter',
    params: { parameter },
  });
}

/** A query or path value that does not convert to its declared type. */
export function wrongType(parameter: string, type: string): HttpResponse<Problem> {
  return problem(400, 'INVALID_REQUEST', 'Invalid request', {
    detail: 'Query or path parameter has the wrong type',
    params: { parameter, reason: `type ${type}` },
  });
}

/** A converted query, path or header value that breaks its constraint. */
export function notAcceptable(parameter: string, reason: string): HttpResponse<Problem> {
  return problem(400, 'INVALID_REQUEST', 'Invalid request', {
    detail: 'Query or path parameter is not acceptable',
    params: { parameter, reason },
  });
}

/** The backend's answer for an unexpected failure. */
export function serviceUnavailable(): HttpResponse<Problem> {
  return problem(503, 'SERVICE_UNAVAILABLE', 'Service unavailable', {
    detail: 'The service is temporarily unavailable',
  });
}

/**
 * The body as a JSON object whose keys are all in `members`, or `undefined`
 * when the backend would answer `malformedBody()`: not JSON, empty, `null`,
 * not an object, or an undeclared member.
 */
export async function readJsonObject(
  request: Request,
  members: readonly string[],
): Promise<Record<string, unknown> | undefined> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return undefined;
  }
  return isRecord(body) && hasOnlyMembers(body, members) ? body : undefined;
}

/** Whether every key of `value` is one of `members`; the backend rejects an unknown member. */
export function hasOnlyMembers(
  value: Record<string, unknown>,
  members: readonly string[],
): boolean {
  return Object.keys(value).every((key) => members.includes(key));
}

/** Whether Jackson can read `value` into a string member: an array or an object makes the body malformed. */
export function isTextual(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

/** A string member as Jackson reads it: a number or boolean becomes its text; absent or `null` is `undefined`. */
export function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return undefined;
}
