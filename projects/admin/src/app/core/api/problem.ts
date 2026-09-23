// projects/admin/src/app/core/api/problem.ts — MIM-331, plan F4 D13.
//
// Narrowing helpers around the OpenAPI `Problem` shape. The contract
// pins a Problem to an object with a string `code`, a number `status`,
// and an array `fieldErrors`; `isProblem` is the type guard, `problemOf`
// extracts the Problem body from an `HttpErrorResponse`, `fieldErrorsOf`
// returns the `fieldErrors` pointer list (or `[]` when the body is not
// a Problem). A Problem sent as text (a responseType 'text' operation)
// is parsed first.

import { HttpErrorResponse } from '@angular/common/http';

import type { FieldError } from '../../api/generated/models/field-error';
import type { Problem } from '../../api/generated/models/problem';

export function isProblem(value: unknown): value is Problem {
  if (value === null || typeof value !== 'object') return false;
  if (!('code' in value) || typeof value.code !== 'string') return false;
  if (!('status' in value) || typeof value.status !== 'number') return false;
  if (!('fieldErrors' in value) || !Array.isArray(value.fieldErrors)) return false;
  return true;
}

/**
 * The Problem body of an `HttpErrorResponse`, or `null`. An operation
 * generated with `responseType: 'text'` (its success is a body-less 204)
 * leaves the error body as the raw JSON text, so a string body is parsed
 * before it is narrowed.
 */
export function problemOf(error: unknown): Problem | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const body: unknown = typeof error.error === 'string' ? parseJson(error.error) : error.error;
  return isProblem(body) ? body : null;
}

function parseJson(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    return null;
  }
}

export function fieldErrorsOf(error: unknown): readonly FieldError[] {
  return problemOf(error)?.fieldErrors ?? [];
}
