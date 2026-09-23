import { HttpResponse, http, type HttpHandler } from 'msw';

import type { AdminUserCreated } from '../app/api/generated/models/admin-user-created';
import {
  asText,
  bodyViolations,
  fieldError,
  firstQueryKey,
  isTextual,
  javaTrim,
  malformedBody,
  readJsonObject,
  unknownQueryParameter,
  wrongType,
} from './backend-answers';
import type { MockDb } from './db';
import { csrfRejection, sessionRejection } from './guards';
import { problem } from './problem';

/**
 * Matches `^[a-z0-9]+(?:[._-][a-z0-9]+)*$` without the nested quantifier
 * that trips the unsafe-regex heuristic: only lowercase letters, digits
 * and the three separators, no leading/trailing separator, no run of two
 * or more separators in a row.
 */
function matchesUsernamePattern(username: string): boolean {
  return (
    /^[a-z0-9._-]+$/.test(username) &&
    !/^[._-]|[._-]$/.test(username) &&
    !/[._-]{2,}/.test(username)
  );
}

/** 24 URL-safe characters from 18 random bytes, like the backend's password generator. */
function generatePassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const ADMIN_ID_GROUP_WIDTHS = [8, 4, 4, 4, 12] as const;
const ADMIN_ID_GROUP_PATTERN = /^\+?([0-9a-fA-F]+)$/;
const LONG_MAX = 0x7fffffffffffffffn;

/**
 * One `-`-separated group the way `Long.parseLong(group, 16)` reads it: an
 * optional leading `+`, one or more hex digits, masked to the group's width
 * in bits and printed lower-case, zero-padded to that many hex digits.
 * `undefined` where the group does not match or its value overflows a Long.
 */
function normalizeAdminIdGroup(group: string, width: number): string | undefined {
  const match = ADMIN_ID_GROUP_PATTERN.exec(group);
  if (match === null) return undefined;
  const [, digits] = match;
  const value = BigInt('0x' + digits);
  if (value > LONG_MAX) return undefined;
  const mask = (1n << BigInt(width * 4)) - 1n;
  return (value & mask).toString(16).padStart(width, '0');
}

/**
 * The path id the way Java 21's `UUID.fromString` reads and re-prints it
 * after `trim()` (`StringToUUIDConverter` calls
 * `UUID.fromString(source.trim())`): at most 36 characters, exactly five
 * `-`-separated groups, each read and re-printed by `normalizeAdminIdGroup`,
 * or `undefined` where `UUID.fromString` would throw.
 */
function normalizeAdminId(raw: string): string | undefined {
  const trimmed = javaTrim(raw);
  if (trimmed.length > 36) return undefined;
  const groups = trimmed.split('-');
  if (groups.length !== ADMIN_ID_GROUP_WIDTHS.length) return undefined;
  const normalized: string[] = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = normalizeAdminIdGroup(groups[index], ADMIN_ID_GROUP_WIDTHS[index]);
    if (group === undefined) return undefined;
    normalized.push(group);
  }
  return normalized.join('-');
}

/** The three `AdminUsers` operations: list, create, delete. */
export function usersHandlers(db: MockDb): HttpHandler[] {
  return [
    http.get('*/api/v1/admin/users', ({ request }) => {
      const rejection = sessionRejection(db);
      if (rejection !== undefined) return rejection;
      const key = firstQueryKey(request);
      if (key !== undefined) return unknownQueryParameter(key);

      const users = [...db.admins.values()]
        .map((admin) => admin.user)
        .sort((a, b) => {
          const byCreatedAt = a.createdAt.localeCompare(b.createdAt);
          return byCreatedAt !== 0 ? byCreatedAt : a.username.localeCompare(b.username);
        });
      return HttpResponse.json(users);
    }),

    http.post('*/api/v1/admin/users', async ({ request }) => {
      const csrf = csrfRejection(db, request);
      if (csrf !== undefined) return csrf;
      const rejection = sessionRejection(db);
      if (rejection !== undefined) return rejection;
      const key = firstQueryKey(request);
      if (key !== undefined) return unknownQueryParameter(key);

      const body = await readJsonObject(request, ['username']);
      if (body === undefined) return malformedBody();
      if (!isTextual(body['username'])) return malformedBody();

      const usernameText = asText(body['username']);
      if (usernameText === undefined) {
        return bodyViolations([fieldError('/username', 'REQUIRED')]);
      }
      const errors = [
        ...(matchesUsernamePattern(usernameText) ? [] : [fieldError('/username', 'PATTERN')]),
        ...(usernameText.length > 80 ? [fieldError('/username', 'SIZE')] : []),
      ];
      if (errors.length > 0) return bodyViolations(errors);

      const taken = [...db.admins.values()].some((admin) => admin.user.username === usernameText);
      if (taken) {
        return problem(409, 'USERNAME_TAKEN', 'Username already taken');
      }

      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const generatedPassword = generatePassword();
      const user = { id, username: usernameText, createdAt };
      db.admins.set(id, { user, password: generatedPassword });
      const created: AdminUserCreated = { user, generatedPassword };
      return HttpResponse.json(created, { status: 201 });
    }),

    http.delete('*/api/v1/admin/users/:adminId', ({ request, params }) => {
      const csrf = csrfRejection(db, request);
      if (csrf !== undefined) return csrf;
      const rejection = sessionRejection(db);
      if (rejection !== undefined) return rejection;
      const key = firstQueryKey(request);
      if (key !== undefined) return unknownQueryParameter(key);

      const rawAdminId = String(params['adminId']);
      const adminId = normalizeAdminId(rawAdminId);
      if (adminId === undefined) return wrongType('adminId', 'UUID');

      if (adminId === db.sessionAdminId) {
        return problem(409, 'ADMIN_SELF_DELETE', 'The signed-in admin cannot be deleted');
      }
      if (!db.admins.has(adminId)) {
        return problem(404, 'NOT_FOUND', 'Resource not found', { params: { adminId } });
      }
      if (db.admins.size === 1) {
        return problem(409, 'LAST_ADMIN', 'The last admin cannot be deleted');
      }

      db.admins.delete(adminId);
      return new HttpResponse(null, { status: 204 });
    }),
  ];
}
