/**
 * Spec for the backend answers (projects/admin/src/mocks/backend-answers.ts).
 *
 * Every admin mock rejects a request through these helpers, so the tests pin
 * the backend's `ProblemAdvice` wording: status, code, title, detail, params
 * and field errors, the `REQUIRED` flip from 422 to 400, and how Jackson reads
 * a body (malformed shapes, unknown members, scalar coercion to text).
 */
import { describe, expect, it } from 'vitest';

import { isRecord } from '../app/core/is-record';
import {
  asText,
  bodyViolations,
  fieldError,
  hasOnlyMembers,
  isTextual,
  malformedBody,
  notAcceptable,
  readJsonObject,
  serviceUnavailable,
  unknownQueryParameter,
  wrongType,
} from './backend-answers';

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  const body: unknown = await response.json();
  if (!isRecord(body)) throw new Error('the answer is not a JSON object');
  return body;
}

function jsonRequest(body: string): Request {
  return new Request('http://localhost/api/v1/admin/probe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

describe('backend answers', () => {
  // Fails if fieldError drops the empty params object the backend always serialises.
  it('builds a field error with empty params by default', () => {
    expect(fieldError('/username', 'SIZE')).toEqual({
      path: '/username',
      code: 'SIZE',
      params: {},
    });
    expect(fieldError('/variants/0/colorCode', 'VARIANT_ID_TOO_LONG', { max: 120 })).toEqual({
      path: '/variants/0/colorCode',
      code: 'VARIANT_ID_TOO_LONG',
      params: { max: 120 },
    });
  });

  // Fails if malformedBody's detail differs from ProblemAdvice's HttpMessageNotReadableException answer.
  it('answers a malformed body as a 400 with no field errors', async () => {
    const response = malformedBody();
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Malformed request body',
      fieldErrors: [],
    });
  });

  // Fails if bodyViolations stops answering shape-only violations as a 422.
  it('answers shape violations together as a 422', async () => {
    const errors = [fieldError('/username', 'SIZE'), fieldError('/password', 'SIZE')];
    const response = bodyViolations(errors);
    expect(response.status).toBe(422);
    expect(await bodyOf(response)).toMatchObject({
      status: 422,
      code: 'VALIDATION_FAILED',
      title: 'Section rejected',
      detail: 'One or more supplied fields are not acceptable',
      fieldErrors: errors,
    });
  });

  // Fails if one REQUIRED among the violations no longer flips the answer to a 400.
  it('flips to a 400 when one violation is REQUIRED, keeping every violation', async () => {
    const errors = [fieldError('/newPassword', 'SIZE'), fieldError('/currentPassword', 'REQUIRED')];
    const response = bodyViolations(errors);
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      title: 'Invalid request',
      detail: 'Missing required member',
      fieldErrors: errors,
    });
  });

  // Fails if the parameter rejections drift from ProblemAdvice's details and params.
  it('words the three parameter rejections as the backend does', async () => {
    expect(await bodyOf(unknownQueryParameter('colour'))).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Unknown query parameter',
      params: { parameter: 'colour' },
    });
    expect(await bodyOf(wrongType('page', 'Integer'))).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Query or path parameter has the wrong type',
      params: { parameter: 'page', reason: 'type Integer' },
    });
    expect(await bodyOf(notAcceptable('pageSize', 'MAX'))).toMatchObject({
      status: 400,
      code: 'INVALID_REQUEST',
      detail: 'Query or path parameter is not acceptable',
      params: { parameter: 'pageSize', reason: 'MAX' },
    });
  });

  // Fails if the 503 detail falls back to the title instead of the backend's wording.
  it('answers an unexpected failure with the backend 503 detail', async () => {
    const response = serviceUnavailable();
    expect(response.status).toBe(503);
    expect(await bodyOf(response)).toMatchObject({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      title: 'Service unavailable',
      detail: 'The service is temporarily unavailable',
    });
  });

  // Fails if readJsonObject accepts a body the backend answers as malformed.
  it('reads only a JSON object with declared members', async () => {
    const members = ['username', 'password'];
    expect(await readJsonObject(jsonRequest('{"username":"a","password":"b"}'), members)).toEqual({
      username: 'a',
      password: 'b',
    });
    expect(await readJsonObject(jsonRequest('{}'), members)).toEqual({});
    const rejected = await Promise.all(
      ['', '{not json', 'null', '[]', '"x"', '{"username":"a","extra":1}'].map((body) =>
        readJsonObject(jsonRequest(body), members),
      ),
    );
    expect(rejected).toEqual([undefined, undefined, undefined, undefined, undefined, undefined]);
  });

  // Fails if hasOnlyMembers lets an undeclared member through.
  it('checks that every key is a declared member', () => {
    expect(hasOnlyMembers({ a: 1 }, ['a', 'b'])).toBe(true);
    expect(hasOnlyMembers({ a: 1, c: 2 }, ['a', 'b'])).toBe(false);
  });

  // Fails if isTextual or asText stop reading scalars the way Jackson does.
  it('reads a string member the way Jackson does', () => {
    expect(isTextual('x')).toBe(true);
    expect(isTextual(7)).toBe(true);
    expect(isTextual(null)).toBe(true);
    expect(isTextual(undefined)).toBe(true);
    expect(isTextual(['a'])).toBe(false);
    expect(isTextual({ a: 1 })).toBe(false);
    expect(asText('x')).toBe('x');
    expect(asText(123)).toBe('123');
    expect(asText(true)).toBe('true');
    expect(asText(null)).toBeUndefined();
    expect(asText(undefined)).toBeUndefined();
  });
});
