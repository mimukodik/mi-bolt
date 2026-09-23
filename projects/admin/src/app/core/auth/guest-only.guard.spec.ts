/**
 * Spec for `guestOnlyGuard` (MIM-337): a signed-in admin is sent to
 * `/attekintes`; everyone else passes. Shares its `AdminSession` stub
 * and real-snapshot harness with `admin-auth.guard.spec.ts` through
 * `guard-test-helpers`.
 */
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';

import { guestOnlyGuard } from './guest-only.guard';
import { runGuard, SEED_ADMIN, snapshotsAt } from './guard-test-helpers';

describe('guestOnlyGuard', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('case 13a: a signed-in admin is redirected to /attekintes', async () => {
    const snapshots = await snapshotsAt(SEED_ADMIN, '/bejelentkezes');
    const result = runGuard(guestOnlyGuard, snapshots);
    expect(result).toBeInstanceOf(UrlTree);
    if (result instanceof UrlTree) {
      expect(TestBed.inject(Router).serializeUrl(result)).toBe('/attekintes');
    }
  });

  it('case 13b: null (signed out) passes', async () => {
    const snapshots = await snapshotsAt(null, '/bejelentkezes');
    expect(runGuard(guestOnlyGuard, snapshots)).toBe(true);
  });
});
