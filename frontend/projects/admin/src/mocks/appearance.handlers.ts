import { http, HttpResponse } from 'msw';
import type { HttpHandler } from 'msw';
import type { FieldError } from '../app/api/generated/models/field-error';
import { toUtcInput, utcTimestampKey } from '../app/core/utc-timestamp';
import {
  bodyViolations,
  fieldError,
  firstQueryKey,
  malformedBody,
  readJsonObject,
  unknownQueryParameter,
} from './backend-answers';
import type { MockDb } from './db';
import { csrfRejection, sessionRejection } from './guards';
import { problem } from './problem';

function timestampKey(value: string): string | null {
  const parts = /^(.*)(Z|[+-][0-9]{2}:[0-9]{2})$/.exec(value);
  if (parts === null || utcTimestampKey(parts[1]) === null || !Number.isFinite(Date.parse(value)))
    return null;
  const offset = parts[2];
  if (offset !== 'Z') {
    const hours = Number(offset.slice(1, 3));
    const minutes = Number(offset.slice(4, 6));
    if (hours > 18 || minutes > 59 || (hours === 18 && minutes !== 0)) return null;
  }
  return utcTimestampKey(toUtcInput(value));
}

export function appearanceHandlers(db: MockDb): HttpHandler[] {
  const path = '*/api/v1/admin/halloween-appearance';
  return [
    http.get(
      path,
      ({ request }) =>
        sessionRejection(db) ??
        (firstQueryKey(request) === undefined
          ? undefined
          : unknownQueryParameter(firstQueryKey(request) ?? '')) ??
        HttpResponse.json(db.appearance, {
          headers: { ETag: `"${String(db.appearance.version)}"`, 'Cache-Control': 'no-store' },
        }),
    ),
    http.put(path, async ({ request }) => {
      const rejection = csrfRejection(db, request) ?? sessionRejection(db);
      if (rejection !== undefined) return rejection;
      const query = firstQueryKey(request);
      if (query !== undefined) return unknownQueryParameter(query);
      const match = request.headers.get('If-Match');
      if (match === null || match.trim() === '')
        return problem(428, 'PRECONDITION_REQUIRED', 'If-Match required');
      if (match.trim() !== `"${String(db.appearance.version)}"` || db.scenario === 'save-conflict')
        return problem(412, 'APPEARANCE_VERSION_CONFLICT', 'Appearance version conflict', {
          params: { expected: db.appearance.version, received: match },
        });
      const body = await readJsonObject(request, ['enabled', 'startsAt', 'endsAt']);
      if (body === undefined) return malformedBody();
      if (body['enabled'] === null || body['enabled'] === undefined)
        return bodyViolations([fieldError('/enabled', 'REQUIRED')]);
      if (typeof body['enabled'] !== 'boolean') return malformedBody();
      const enabled = body['enabled'];
      const startsAt = body['startsAt'];
      const endsAt = body['endsAt'];
      for (const value of [startsAt, endsAt]) {
        if (
          value !== null &&
          value !== undefined &&
          (typeof value !== 'string' || timestampKey(value) === null)
        )
          return malformedBody();
      }
      const start = typeof startsAt === 'string' ? startsAt : null;
      const end = typeof endsAt === 'string' ? endsAt : null;
      const errors: FieldError[] = [];
      for (const { path, value } of [
        { path: '/startsAt', value: start },
        { path: '/endsAt', value: end },
      ]) {
        if (value !== null && !(timestampKey(value)?.endsWith('000') ?? true))
          errors.push(fieldError(path, 'DATETIME_PRECISION'));
      }
      if (enabled && start === null) errors.push(fieldError('/startsAt', 'REQUIRED'));
      if (enabled && end === null) errors.push(fieldError('/endsAt', 'REQUIRED'));
      if (
        start !== null &&
        end !== null &&
        (timestampKey(start) ?? '') >= (timestampKey(end) ?? '')
      )
        errors.push(fieldError('/endsAt', 'INVALID_PERIOD'));
      if (errors.length > 0)
        return problem(422, 'VALIDATION_FAILED', 'Invalid appearance period', {
          fieldErrors: errors,
        });
      const normalizedStart = start === null ? null : `${toUtcInput(start)}Z`;
      const normalizedEnd = end === null ? null : `${toUtcInput(end)}Z`;
      const changed =
        enabled !== db.appearance.enabled ||
        (start === null ? null : timestampKey(start)) !==
          (db.appearance.startsAt === null || db.appearance.startsAt === undefined
            ? null
            : timestampKey(db.appearance.startsAt)) ||
        (end === null ? null : timestampKey(end)) !==
          (db.appearance.endsAt === null || db.appearance.endsAt === undefined
            ? null
            : timestampKey(db.appearance.endsAt));
      db.appearance = {
        enabled,
        startsAt: normalizedStart,
        endsAt: normalizedEnd,
        version: db.appearance.version + (changed ? 1 : 0),
      };
      return HttpResponse.json(db.appearance, {
        headers: { ETag: `"${String(db.appearance.version)}"`, 'Cache-Control': 'no-store' },
      });
    }),
  ];
}
