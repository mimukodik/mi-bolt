// projects/admin/src/app/core/api/problem.spec.ts — MIM-331, plan F4 D13.
//
// `isProblem` narrows the wire body to the OpenAPI `Problem` shape;
// `problemOf` extracts the body from an `HttpErrorResponse`; `fieldErrorsOf`
// returns the fieldErrors array, or `[]` when the body is not a Problem.

import { HttpErrorResponse } from '@angular/common/http';

import { fieldErrorsOf, isProblem, problemOf } from './problem';

describe('isProblem', () => {
  it('returns true for a Problem body', () => {
    const body = {
      code: 'VALIDATION_FAILED',
      detail: 'invalid',
      fieldErrors: [{ path: '/contact/phone', code: 'REQUIRED' }],
      status: 422,
      title: 'Validation failed',
      traceId: 't-1',
      type: 'about:blank',
    };
    expect(isProblem(body)).toBe(true);
  });

  it('returns false for null', () => {
    expect(isProblem(null)).toBe(false);
  });

  it('returns false for a string', () => {
    expect(isProblem('Problem')).toBe(false);
  });

  it('returns false for an object missing the Problem shape', () => {
    expect(isProblem({ code: 'X' })).toBe(false);
  });
});

describe('problemOf', () => {
  function buildError(body: unknown): HttpErrorResponse {
    return new HttpErrorResponse({ status: 422, statusText: 'Unprocessable', error: body });
  }

  it('returns the body for an HttpErrorResponse with a Problem body', () => {
    const body = {
      code: 'VALIDATION_FAILED',
      detail: 'invalid',
      fieldErrors: [],
      status: 422,
      title: 'Validation failed',
      traceId: 't-1',
      type: 'about:blank',
    };
    expect(problemOf(buildError(body))).toBe(body);
  });

  it('returns null for a non-Problem body', () => {
    expect(problemOf(buildError('boom'))).toBeNull();
  });

  it('returns null for a value that is not an HttpErrorResponse', () => {
    expect(problemOf(new Error('boom'))).toBeNull();
  });
});

describe('fieldErrorsOf', () => {
  it('returns the pointer list from a 422 Problem', () => {
    const error = new HttpErrorResponse({
      status: 422,
      statusText: 'Unprocessable',
      error: {
        code: 'VALIDATION_FAILED',
        detail: 'invalid',
        fieldErrors: [{ path: '/variants/1/priceHuf', code: 'REQUIRED' }],
        status: 422,
        title: 'Validation failed',
        traceId: 't-1',
        type: 'about:blank',
      },
    });
    expect(fieldErrorsOf(error)).toEqual([{ path: '/variants/1/priceHuf', code: 'REQUIRED' }]);
  });

  it('returns an empty array otherwise', () => {
    expect(fieldErrorsOf(new Error('boom'))).toEqual([]);
  });
});
