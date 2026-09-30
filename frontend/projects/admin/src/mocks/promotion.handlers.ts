import { http, HttpResponse } from 'msw';
import type { HttpHandler } from 'msw';
import { csrfRejection, sessionRejection } from './guards';
import {
  fieldError,
  firstQueryKey,
  malformedBody,
  readJsonObject,
  unknownQueryParameter,
} from './backend-answers';
import type { MockDb } from './db';
import { problem } from './problem';

export function promotionHandlers(db: MockDb): HttpHandler[] {
  const current = (): typeof db.promotion => {
    const now = new Date().toISOString();
    return {
      ...db.promotion,
      serverNow: now,
      active:
        db.promotion.startsAt !== undefined &&
        db.promotion.endsAt !== undefined &&
        Date.parse(db.promotion.startsAt) <= Date.parse(now) &&
        Date.parse(now) < Date.parse(db.promotion.endsAt),
    };
  };
  return [
    http.get('*/api/v1/admin/promotion', ({ request }) => {
      const rejected = sessionRejection(db);
      if (rejected !== undefined) return rejected;
      const query = firstQueryKey(request);
      if (query !== undefined) return unknownQueryParameter(query);
      return HttpResponse.json(current(), {
        headers: { ETag: `"${String(db.promotion.version)}"` },
      });
    }),
    http.put('*/api/v1/admin/promotion', async ({ request }) => {
      const rejected = csrfRejection(db, request) ?? sessionRejection(db);
      if (rejected !== undefined) return rejected;
      const query = firstQueryKey(request);
      if (query !== undefined) return unknownQueryParameter(query);
      const body = await readJsonObject(request, ['text', 'startsAt', 'endsAt']);
      if (body === undefined) return malformedBody();
      if (Object.values(body).some((value) => value !== null && typeof value !== 'string'))
        return malformedBody();
      const match = request.headers.get('If-Match');
      if (match === null) return problem(428, 'PRECONDITION_REQUIRED', 'Precondition required');
      if (!/^"[0-9]+"$/.test(match)) return problem(400, 'INVALID_REQUEST', 'Invalid request');
      if (match !== `"${String(db.promotion.version)}"` || db.scenario === 'save-conflict')
        return problem(412, 'PRODUCT_VERSION_CONFLICT', 'Product version conflict');
      const text = body['text'];
      const startsAt = body['startsAt'];
      const endsAt = body['endsAt'];
      for (const value of [startsAt, endsAt]) {
        if (
          typeof value === 'string' &&
          (!/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
        )
          return malformedBody();
      }
      const clear = [text, startsAt, endsAt].every(
        (value) => value === undefined || value === null,
      );
      const errors = [];
      if (!clear) {
        if (typeof text !== 'string' || text.trim() === '')
          errors.push(fieldError('/text', 'NOTBLANK'));
        if (typeof text === 'string' && text.length > 280) errors.push(fieldError('/text', 'SIZE'));
        if (typeof startsAt !== 'string')
          errors.push(fieldError('/startsAt', 'PROMOTION_INCOMPLETE'));
        if (typeof endsAt !== 'string') errors.push(fieldError('/endsAt', 'PROMOTION_INCOMPLETE'));
        if (
          typeof startsAt === 'string' &&
          typeof endsAt === 'string' &&
          Date.parse(startsAt) >= Date.parse(endsAt)
        )
          errors.push(fieldError('/endsAt', 'PROMOTION_INTERVAL'));
      }
      if (errors.length > 0)
        return problem(422, 'VALIDATION_FAILED', 'Section rejected', { fieldErrors: errors });
      db.promotion = {
        active: false,
        serverNow: new Date().toISOString(),
        version: db.promotion.version + 1,
        ...(!clear &&
        typeof text === 'string' &&
        typeof startsAt === 'string' &&
        typeof endsAt === 'string'
          ? { text, startsAt, endsAt }
          : {}),
      };
      return HttpResponse.json(current(), {
        headers: { ETag: `"${String(db.promotion.version)}"` },
      });
    }),
  ];
}
