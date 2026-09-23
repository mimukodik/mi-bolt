import { Injectable, inject, signal } from '@angular/core';
import type { Signal, WritableSignal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { AdminApi } from '../../api/generated/admin-api';
import { deleteAdminUser } from '../../api/generated/fn/admin-users/delete-admin-user';
import { listAdminUsers } from '../../api/generated/fn/admin-users/list-admin-users';
import type { AdminUser } from '../../api/generated/models/admin-user';
import type { Problem } from '../../api/generated/models/problem';
import { isProblem } from '../../core/api/problem';

/**
 * The five outcomes `delete()` reports to the page. A 204 removes the
 * admin locally without a reload; a 409 `ADMIN_SELF_DELETE` and a 409
 * `LAST_ADMIN` map to their own kinds; a 404 is `gone`; any other
 * failure becomes `failed` with the `Problem` body when the contract
 * shaped it, otherwise `null`.
 */
export type DeleteResult =
  | { readonly kind: 'deleted' }
  | { readonly kind: 'self' }
  | { readonly kind: 'last' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'failed'; readonly problem: Problem | null };

/**
 * The Adminok page's list state (MIM-344, F13). `load()` fetches the
 * list once on creation; a second call reloads it. `delete()` answers
 * with a `DeleteResult` and never rejects, so the page can dispatch the
 * snack-bar text by kind without `try`/`catch`. Provided in the page's
 * `providers`, not at root, so each route activation owns its own list.
 */
@Injectable()
export class AdminsStore {
  private readonly api = inject(AdminApi);

  private readonly adminsSignal: WritableSignal<readonly AdminUser[]> = signal([]);
  readonly admins: Signal<readonly AdminUser[]> = this.adminsSignal.asReadonly();

  private readonly statusSignal: WritableSignal<'loading' | 'ready' | 'error'> = signal('loading');
  readonly status: Signal<'loading' | 'ready' | 'error'> = this.statusSignal.asReadonly();

  /** Reads the admin list. Sets `status` to `loading` first, then `ready` on 200 or `error` on any failure. */
  async load(): Promise<void> {
    this.statusSignal.set('loading');
    try {
      const list = await firstValueFrom(this.api.invoke(listAdminUsers, undefined));
      this.adminsSignal.set(list);
      this.statusSignal.set('ready');
    } catch {
      this.statusSignal.set('error');
    }
  }

  /**
   * Sends the DELETE and translates its answer into a `DeleteResult`.
   * 204 removes the admin from `admins` locally; the four error shapes
   * each map to their kind, with `failed` carrying the `Problem` body.
   * Never rejects.
   */
  async delete(admin: AdminUser): Promise<DeleteResult> {
    try {
      await firstValueFrom(this.api.invoke(deleteAdminUser, { adminId: admin.id }));
      this.adminsSignal.update((current) => current.filter((entry) => entry.id !== admin.id));
      return { kind: 'deleted' };
    } catch (err) {
      // HttpClient rejects with HttpErrorResponse; anything else falls
      // through to `failed` with no Problem body.
      if (!(err instanceof HttpErrorResponse)) return { kind: 'failed', problem: null };
      // The generated DELETE uses `responseType: 'text'`, so the body
      // reaches `HttpErrorResponse.error` as a JSON string; parse it
      // back into the Problem shape so the `kind` mapping can read the
      // code.
      const problem: Problem | null = parseProblem(err);
      if (err.status === 404) return { kind: 'gone' };
      if (err.status === 409) {
        if (problem?.code === 'ADMIN_SELF_DELETE') return { kind: 'self' };
        if (problem?.code === 'LAST_ADMIN') return { kind: 'last' };
      }
      return { kind: 'failed', problem };
    }
  }
}

/**
 * Reads the `Problem` body out of an `HttpErrorResponse`. The DELETE
 * operation uses `responseType: 'text'`, so `err.error` is a JSON
 * string here; parse it back, then narrow with `isProblem` the same
 * way `problemOf` does for the JSON responses.
 */
function parseProblem(error: HttpErrorResponse): Problem | null {
  const body: unknown = error.error;
  if (typeof body !== 'string') return isProblem(body) ? body : null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  return isProblem(parsed) ? parsed : null;
}
