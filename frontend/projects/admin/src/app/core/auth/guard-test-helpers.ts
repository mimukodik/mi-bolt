/**
 * Shared harness for `admin-auth.guard.spec.ts` and
 * `guest-only.guard.spec.ts`: a stub `AdminSession` whose `current` is a
 * signal the case sets, and real `ActivatedRouteSnapshot` /
 * `RouterStateSnapshot` pairs taken from an actual navigation
 * (`RouterTestingHarness`), since those are concrete classes an object
 * literal cannot satisfy without `as`.
 */
import { Component, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import type {
  ActivatedRouteSnapshot,
  CanActivateFn,
  RouterStateSnapshot,
  Routes,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';

import type { AdminUser } from '../../api/generated/models/admin-user';

import { AdminSession } from './admin-session';

export const SEED_ADMIN: AdminUser = {
  id: '3f6c9a2e-7b1d-4c58-9e0a-5d2b8f4a6c17',
  username: 'admin',
  createdAt: '2026-09-22T00:00:00Z',
};

@Component({ selector: 'adm-test-guard-stub', template: '' })
class StubComponent {}

const TEST_ROUTES: Routes = [{ path: '**', component: StubComponent }];

class AdminSessionStub {
  readonly currentSignal = signal<AdminUser | null | undefined>(undefined);
  readonly current: Signal<AdminUser | null | undefined> = this.currentSignal.asReadonly();
}

export interface Snapshots {
  readonly route: ActivatedRouteSnapshot;
  readonly state: RouterStateSnapshot;
}

/** Configures a fresh `TestBed` with `AdminSession` stubbed to `current`, navigates to `url`, and returns real snapshots. */
export async function snapshotsAt(
  current: AdminUser | null | undefined,
  url: string,
): Promise<Snapshots> {
  const stub = new AdminSessionStub();
  stub.currentSignal.set(current);
  TestBed.configureTestingModule({
    providers: [provideRouter(TEST_ROUTES), { provide: AdminSession, useValue: stub }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
  const snapshot = TestBed.inject(Router).routerState.snapshot;
  return { route: snapshot.root, state: snapshot };
}

/** Runs `guard` in an injection context against `snapshots`, asserting the result is a boolean or a `UrlTree`. */
export function runGuard(guard: CanActivateFn, { route, state }: Snapshots): boolean | UrlTree {
  const result = TestBed.runInInjectionContext(() => guard(route, state));
  if (typeof result === 'boolean' || result instanceof UrlTree) return result;
  throw new Error('unexpected guard result: neither a boolean nor a UrlTree');
}
