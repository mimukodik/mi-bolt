/**
 * MIM-423 — demo access MSW handlers on the 2.2.0 contract.
 *
 * GET /demo/session answers 204. POST /demo/session answers 204 for the
 * demo password, 401 UNAUTHENTICATED for any other password and 400 for a
 * body that is not exactly {"password": <string of 1 to 64 characters>}
 * (DemoSessionRequest, contracts/commerce/openapi.yaml). While the
 * visitor is signed out (only the `demo-signed-out` scenario starts that
 * way), GET /demo/session answers the contract's 401 DemoAccessRequired
 * and every gated operation answers it too (`demo-access.ts`); the demo
 * password signs in.
 */

import { http, HttpResponse, type RequestHandler } from 'msw';

import {
  registerBusinessHandlers,
  type BusinessHandlerEntry,
  type CreateHandlersOptions,
} from '../create-handlers';
import { isRecord } from '../is-record';
import { invalidRequest } from '../problem-response';
import { demoAccessRequired, demoAccessStateFor, unauthenticatedProblem } from './demo-access';

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

export const demoHandlersEntry: BusinessHandlerEntry = (
  options: CreateHandlersOptions,
): readonly RequestHandler[] => {
  const getSession: RequestHandler = http.get('*/api/v1/demo/session', () =>
    demoAccessStateFor(options).isSignedIn()
      ? new HttpResponse(null, { status: 204 })
      : demoAccessRequired(options),
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
    if (body['password'] !== DEMO_PASSWORD) {
      return unauthenticatedProblem(options, 'Wrong demo password', 'The demo password is wrong.');
    }
    demoAccessStateFor(options).signIn();
    return new HttpResponse(null, { status: 204 });
  });

  return [getSession, createSession];
};

registerBusinessHandlers(demoHandlersEntry);
