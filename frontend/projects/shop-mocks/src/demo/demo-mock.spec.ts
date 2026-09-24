/**
 * MIM-423 — demo access mock focused unit suite.
 *
 * Four cases, one per acceptance criterion of the two new operations:
 * GET /demo/session always answers a body-less 204, POST answers 204 for
 * the one demo password, 401 UNAUTHENTICATED for a wrong one, and 400
 * INVALID_REQUEST for a body that is not exactly
 * {"password": <string of 1 to 64 characters>}.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { createHandlers } from '../create-handlers';
import { DEMO_PASSWORD } from './demo.handlers';
import { Repository } from '../repository';
import {
  createDeterministicIds,
  createFixedClock,
  DEFAULT_SCENARIO,
  type Clock,
  type Ids,
} from '../scenarios';
import { server, useMswServer } from '../../../../tests/msw-server';
import { isRecord } from '../is-record';

useMswServer();

const DEMO_SESSION_URL = 'http://localhost/api/v1/demo/session';

let clock: Clock;
let ids: Ids;
let options: {
  repository: Repository;
  clock: Clock;
  ids: Ids;
  scenario: ReturnType<Repository['getScenario']>;
  apiRoot: string;
};

beforeEach(() => {
  clock = createFixedClock('2026-09-20T10:00:00.000Z');
  ids = createDeterministicIds(1);
  options = {
    repository: new Repository(DEFAULT_SCENARIO, ids, clock),
    clock,
    ids,
    scenario: DEFAULT_SCENARIO,
    apiRoot: '/api/v1',
  };
  server.use(...createHandlers(options));
});

function postSession(body: string): Promise<Response> {
  return fetch(DEMO_SESSION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
}

async function readProblem(res: Response): Promise<Record<string, unknown>> {
  expect(res.headers.get('content-type')).toBe('application/problem+json');
  const body: unknown = await res.json();
  expect(isRecord(body)).toBe(true);
  if (!isRecord(body)) throw new Error('[demo-mock.spec] problem body is not a record');
  return body;
}

describe('GET /demo/session', () => {
  it('answers a body-less 204', async () => {
    const res = await fetch(DEMO_SESSION_URL);

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});

describe('POST /demo/session', () => {
  it('answers 204 for the demo password', async () => {
    const res = await postSession(JSON.stringify({ password: DEMO_PASSWORD }));

    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('answers 401 UNAUTHENTICATED for a wrong password', async () => {
    const res = await postSession(JSON.stringify({ password: 'rossz' }));

    expect(res.status).toBe(401);
    const body = await readProblem(res);
    expect(body['code']).toBe('UNAUTHENTICATED');
    expect(body['status']).toBe(401);
  });

  it('answers 400 INVALID_REQUEST for a malformed body', async () => {
    const withExtraKey = await postSession(JSON.stringify({ password: DEMO_PASSWORD, extra: 1 }));
    expect(withExtraKey.status).toBe(400);
    expect((await readProblem(withExtraKey))['code']).toBe('INVALID_REQUEST');

    const notAnObject = await postSession('x');
    expect(notAnObject.status).toBe(400);
    expect((await readProblem(notAnObject))['code']).toBe('INVALID_REQUEST');

    const emptyPassword = await postSession(JSON.stringify({ password: '' }));
    expect(emptyPassword.status).toBe(400);
    expect((await readProblem(emptyPassword))['code']).toBe('INVALID_REQUEST');

    // DemoSessionRequest.password is maxLength 64, so above that the body is
    // malformed (400), never merely a wrong password (401).
    const tooLong = await postSession(JSON.stringify({ password: 'a'.repeat(65) }));
    expect(tooLong.status).toBe(400);
    expect((await readProblem(tooLong))['code']).toBe('INVALID_REQUEST');
  });
});
