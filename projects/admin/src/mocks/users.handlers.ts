import { HttpResponse, http, type HttpHandler } from 'msw';

import { isRecord } from '../app/core/is-record';
import type { AdminUserCreated } from '../app/api/generated/models/admin-user-created';
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

/** The three `AdminUsers` operations: list, create, delete. */
export function usersHandlers(db: MockDb): HttpHandler[] {
  return [
    http.get('*/api/v1/admin/users', () => {
      const rejection = sessionRejection(db);
      if (rejection !== undefined) return rejection;

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

      const body = await request.json();
      const username =
        isRecord(body) && typeof body['username'] === 'string' ? body['username'] : undefined;
      if (username === undefined) {
        return problem(400, 'INVALID_REQUEST', 'Invalid request', {
          detail: 'Missing required member',
          fieldErrors: [{ path: '/username', code: 'REQUIRED' }],
        });
      }
      if (username.length > 80) {
        return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
          detail: 'One or more supplied fields are not acceptable',
          fieldErrors: [{ path: '/username', code: 'SIZE' }],
        });
      }
      if (!matchesUsernamePattern(username)) {
        return problem(422, 'VALIDATION_FAILED', 'Section rejected', {
          detail: 'One or more supplied fields are not acceptable',
          fieldErrors: [{ path: '/username', code: 'PATTERN' }],
        });
      }
      const taken = [...db.admins.values()].some((admin) => admin.user.username === username);
      if (taken) {
        return problem(409, 'USERNAME_TAKEN', 'Username already taken');
      }

      const id = crypto.randomUUID();
      const createdAt = new Date().toISOString();
      const generatedPassword = generatePassword();
      const user = { id, username, createdAt };
      db.admins.set(id, { user, password: generatedPassword });
      const created: AdminUserCreated = { user, generatedPassword };
      return HttpResponse.json(created, { status: 201 });
    }),

    http.delete('*/api/v1/admin/users/:adminId', ({ request, params }) => {
      const csrf = csrfRejection(db, request);
      if (csrf !== undefined) return csrf;
      const rejection = sessionRejection(db);
      if (rejection !== undefined) return rejection;

      const adminId = String(params['adminId']);
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
