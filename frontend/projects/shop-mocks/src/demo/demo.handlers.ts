/**
 * MIM-423 — demo access MSW handlers on the 2.2.0 contract.
 *
 * GET /demo/session answers 204. POST /demo/session answers 204 for the
 * demo password, 401 UNAUTHENTICATED for any other password and 400 for a
 * body that is not exactly {"password": <string of 1 to 64 characters>}
 * (DemoSessionRequest, contracts/commerce/openapi.yaml). The mock does
 * not gate the other shop operations; a later unit adds that.
 */

import { http, HttpResponse, type DefaultBodyType, type RequestHandler } from 'msw';

import { buildTraceId, problemType } from '../cart/cart-store';
import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { isRecord } from '../is-record';
import { invalidRequest, problemResponse } from '../problem-response';

/** DemoSessionRequest.password caps the body at 64 characters. */
const DEMO_PASSWORD_MAX_LENGTH = 64;

/** The one demo password the mock accepts (MIM-423; the owner ruled it not secret). */
export const DEMO_PASSWORD = '1MiBoltDemo1';

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.clone().json();
  } catch {
    return null;
  }
}

function wrongPassword(options: CreateHandlersOptions): HttpResponse<DefaultBodyType> {
  return problemResponse({
    ok: false,
    problem: {
      type: problemType('UNAUTHENTICATED'),
      title: 'Wrong demo password',
      status: 401,
      code: 'UNAUTHENTICATED',
      detail: 'The demo password is wrong.',
      traceId: buildTraceId(options),
      fieldErrors: [],
    },
  });
}

export const demoHandlersEntry: BusinessHandlerEntry = (
  options: CreateHandlersOptions,
): readonly RequestHandler[] => {
  const getSession: RequestHandler = http.get(
    '*/api/v1/demo/session',
    () => new HttpResponse(null, { status: 204 }),
  );

  const createSession: RequestHandler = http.post('*/api/v1/demo/session', async ({ request }) => {
    const body = await readJsonBody(request);
    if (
      !isRecord(body) ||
      Object.keys(body).some((key) => key !== 'password') ||
      typeof body['password'] !== 'string' ||
      body['password'].length === 0 ||
      body['password'].length > DEMO_PASSWORD_MAX_LENGTH
    ) {
      return invalidRequest(
        options,
        'The body must be {"password": <string of 1 to 64 characters>}.',
        {},
      );
    }
    if (body['password'] !== DEMO_PASSWORD) return wrongPassword(options);
    return new HttpResponse(null, { status: 204 });
  });

  return [getSession, createSession];
};

registerBusinessHandlers(demoHandlersEntry);
