/**
 * Spec for `adminAuthGuard` (MIM-337): a signed-in admin passes,
 * `null` or `undefined` both redirect to the login page carrying
 * `vissza`. Shares its `AdminSession` stub and real-snapshot harness
 * with `guest-only.guard.spec.ts` through `guard-test-helpers`.
 */
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';

import { adminAuthGuard } from './admin-auth.guard';
import { runGuard, SEED_ADMIN, snapshotsAt } from './guard-test-helpers';

describe('adminAuthGuard', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('case 12a: a signed-in admin passes', async () => {
    const snapshots = await snapshotsAt(SEED_ADMIN, '/termekek');
    expect(runGuard(adminAuthGuard, snapshots)).toBe(true);
  });

  it('case 12b: null (signed out) redirects to /bejelentkezes?vissza=%2Ftermekek', async () => {
    const snapshots = await snapshotsAt(null, '/termekek');
    const result = runGuard(adminAuthGuard, snapshots);
    expect(result).toBeInstanceOf(UrlTree);
    if (result instanceof UrlTree) {
      expect(TestBed.inject(Router).serializeUrl(result)).toBe('/bejelentkezes?vissza=%2Ftermekek');
    }
  });

  it('case 12c: undefined (not yet known) redirects the same way as null', async () => {
    const snapshots = await snapshotsAt(undefined, '/termekek');
    const result = runGuard(adminAuthGuard, snapshots);
    expect(result).toBeInstanceOf(UrlTree);
    if (result instanceof UrlTree) {
      expect(TestBed.inject(Router).serializeUrl(result)).toBe('/bejelentkezes?vissza=%2Ftermekek');
    }
  });
});
