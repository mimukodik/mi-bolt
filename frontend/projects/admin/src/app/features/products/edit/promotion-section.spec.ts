import { ANIMATION_MODULE_TYPE, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import type { HttpInterceptorFn } from '@angular/common/http';
import { beforeEach, describe, expect, it } from 'vitest';
import { provideApiConfiguration } from '../../../api/generated/api-configuration';
import { ifMatchInterceptor } from '../../../core/api/if-match.interceptor';
import { signedIn } from '../../../../testing/mock-spec-helpers';
import { useMswServer } from '../../../../testing/msw-server';
import { PromotionSection } from './promotion-section';

useMswServer();
const token = 'campaign-test-xsrf';
const xsrf: HttpInterceptorFn = (request, next) =>
  next(
    request.clone({
      setHeaders: {
        'X-XSRF-TOKEN': token,
      },
    }),
  );
describe('common campaign editor', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideApiConfiguration('/api/v1'),
        provideHttpClient(withXhr(), withInterceptors([ifMatchInterceptor, xsrf])),
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      ],
    });
  });
  it('loads Budapest values and saves one shared offset-bearing campaign', async () => {
    const db = signedIn();
    db.xsrfToken = token;
    const fixture = TestBed.createComponent(PromotionSection);
    await fixture.whenStable();
    const section = fixture.componentInstance;
    section.model.set({
      text: 'Válassz ijesztően jó halloweeni ajánlataink közül!',
      startsAt: '2026-10-01T00:00',
      endsAt: '2026-11-01T00:00',
    });
    await section.save();
    expect(section.error()).toBe('');
    expect(section.success()).toBe(true);
    expect(db.promotion.startsAt).toBe('2026-09-30T22:00:00.000Z');
    expect(db.promotion.endsAt).toBe('2026-10-31T23:00:00.000Z');
    await section.load();
    expect(section.model().endsAt).toBe('2026-11-01T00:00');
  });
  it('rejects ambiguous local time and keeps stale edits on a version conflict', async () => {
    const db = signedIn();
    db.xsrfToken = token;
    const fixture = TestBed.createComponent(PromotionSection);
    await fixture.whenStable();
    const section = fixture.componentInstance;
    section.model.set({
      text: 'Halloween',
      startsAt: '2026-10-25T02:30',
      endsAt: '2026-11-01T00:00',
    });
    await section.save();
    expect(section.error()).toContain('egyértelmű');
    expect(db.promotion.version).toBe(0);
    section.model.update((value) => ({ ...value, startsAt: '2026-10-01T00:00' }));
    db.promotion.version = 1;
    await section.save();
    expect(section.error()).toContain('Más módosította');
    expect(section.model().text).toBe('Halloween');
    expect(db.promotion.text).toBeUndefined();
  });
});
