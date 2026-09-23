/**
 * Spec for `adminAuthGuard` (MIM-337): a signed-in admin passes,
 * `null` or `undefined` both redirect to the login page carrying
 * `vissza`. `AdminSession` is replaced with a stub whose `current` is a
 * signal the case sets, so no HTTP layer is involved. `route` and
 * `state` are real snapshots taken from an actual navigation
 * (`RouterTestingHarness`, the pattern `app.routes.spec.ts` uses)
 * rather than a cast object, since `ActivatedRouteSnapshot` and
 * `RouterStateSnapshot` are concrete classes an object literal cannot
 * satisfy without `as`.
 */
import { Component, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import type { ActivatedRouteSnapshot, RouterStateSnapshot, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it } from 'vitest';

import type { AdminUser } from '../../api/generated/models/admin-user';

import { AdminSession } from './admin-session';
import { adminAuthGuard } from './admin-auth.guard';

const SEED_ADMIN: AdminUser = {
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

interface Snapshots {
  readonly route: ActivatedRouteSnapshot;
  readonly state: RouterStateSnapshot;
}

async function snapshotsAt(current: AdminUser | null | undefined, url: string): Promise<Snapshots> {
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

function runGuard({ route, state }: Snapshots): boolean | UrlTree {
  const result = TestBed.runInInjectionContext(() => adminAuthGuard(route, state));
  if (typeof result === 'boolean' || result instanceof UrlTree) return result;
  throw new Error('unexpected guard result: neither a boolean nor a UrlTree');
}

describe('adminAuthGuard', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('case 12a: a signed-in admin passes', async () => {
    const snapshots = await snapshotsAt(SEED_ADMIN, '/termekek');
    expect(runGuard(snapshots)).toBe(true);
  });

  it('case 12b: null (signed out) redirects to /bejelentkezes?vissza=%2Ftermekek', async () => {
    const snapshots = await snapshotsAt(null, '/termekek');
    const result = runGuard(snapshots);
    expect(result).toBeInstanceOf(UrlTree);
    if (result instanceof UrlTree) {
      expect(TestBed.inject(Router).serializeUrl(result)).toBe('/bejelentkezes?vissza=%2Ftermekek');
    }
  });

  it('case 12c: undefined (not yet known) redirects the same way as null', async () => {
    const snapshots = await snapshotsAt(undefined, '/termekek');
    const result = runGuard(snapshots);
    expect(result).toBeInstanceOf(UrlTree);
    if (result instanceof UrlTree) {
      expect(TestBed.inject(Router).serializeUrl(result)).toBe('/bejelentkezes?vissza=%2Ftermekek');
    }
  });
});
