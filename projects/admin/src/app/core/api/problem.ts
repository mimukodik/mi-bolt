// projects/admin/src/app/core/api/problem.ts — MIM-331, plan F4 D13.
//
// Narrowing helpers around the OpenAPI `Problem` shape. The contract
// pins a Problem to an object with a string `code`, a number `status`,
// and an array `fieldErrors`; `isProblem` is the type guard, `problemOf`
// extracts the Problem body from an `HttpErrorResponse`, `fieldErrorsOf`
// returns the `fieldErrors` pointer list (or `[]` when the body is not
// a Problem).

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

export function problemOf(error: unknown): Problem | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  if (!isProblem(error.error)) return null;
  return error.error;
}

export function fieldErrorsOf(error: unknown): readonly FieldError[] {
  return problemOf(error)?.fieldErrors ?? [];
}
