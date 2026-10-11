import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { ifMatchInterceptor } from '../../core/api/if-match.interceptor';
import { AppearancePage } from './appearance-page';

const path = '/api/v1/admin/halloween-appearance';
afterEach(() => TestBed.resetTestingModule());
async function setup(): Promise<{ page: AppearancePage; http: HttpTestingController }> {
  TestBed.configureTestingModule({
    imports: [AppearancePage],
    providers: [
      provideHttpClient(withInterceptors([ifMatchInterceptor])),
      provideHttpClientTesting(),
      provideApiConfiguration('/api/v1'),
    ],
  });
  const fixture = TestBed.createComponent(AppearancePage);
  const http = TestBed.inject(HttpTestingController);
  http.expectOne(path).flush({ enabled: false, version: 0 });
  await fixture.whenStable();
  return { page: fixture.componentInstance, http };
}
const draft = { enabled: true, startsAt: '2026-10-30T18:00:00', endsAt: '2026-11-02T06:00:00' };
describe('Halloween appearance admin', () => {
  it('validates required/calendar/range fields without losing input', async () => {
    const { page, http } = await setup();
    page.model.set({
      enabled: true,
      startsAt: '2026-02-30T18:00:00',
      endsAt: '2026-02-01T18:00:00',
    });
    TestBed.tick();
    expect(page.form.startsAt().invalid()).toBe(true);
    page.model.set({ ...draft, endsAt: draft.startsAt });
    TestBed.tick();
    expect(page.form.endsAt().invalid()).toBe(true);
    page.model.set({ enabled: true, startsAt: '', endsAt: '' });
    TestBed.tick();
    expect(page.form.startsAt().invalid()).toBe(true);
    expect(page.form.endsAt().invalid()).toBe(true);
    http.verify();
  });
  it('preserves the draft when conflict refresh fails and the visible retry succeeds', async () => {
    const { page, http } = await setup();
    page.model.set(draft);
    page.status.set('conflict');
    const failed = page.refreshVersion();
    http.expectOne(path).flush({}, { status: 503, statusText: 'Unavailable' });
    await failed;
    expect(page.model()).toEqual(draft);
    const retry = page.retryLoad();
    http.expectOne(path).flush({ enabled: false, version: 4 });
    await retry;
    expect(page.model()).toEqual(draft);
    expect(page.status()).toBe('refreshed');
    page.model.set({ ...draft, startsAt: '2026-10-30T18:00:00.000000001' });
    TestBed.tick();
    expect(page.form.startsAt().invalid()).toBe(true);
    http.verify();
  });

  it('sends UTC times and version, preserving input and field errors after 422', async () => {
    const { page, http } = await setup();
    page.model.set(draft);
    page.onSubmit(new Event('submit'));
    await vi.waitFor(() => {
      const request = http.expectOne(path);
      expect(request.request.headers.get('If-Match')).toBe('"0"');
      expect(request.request.body).toEqual({
        enabled: true,
        startsAt: `${draft.startsAt}Z`,
        endsAt: `${draft.endsAt}Z`,
      });
      request.flush(
        {
          status: 422,
          code: 'VALIDATION_FAILED',
          fieldErrors: [{ path: '/endsAt', code: 'PROMOTION_TIME_RANGE' }],
        },
        { status: 422, statusText: 'Invalid' },
      );
    });
    await vi.waitFor(() => {
      expect(page.form().submitting()).toBe(false);
    });
    expect(page.model()).toEqual(draft);
    expect(
      page.form
        .endsAt()
        .errors()
        .some((e) => e.kind === 'server'),
    ).toBe(true);
    http.verify();
  });
  it('keeps the draft through conflict and refresh, then explicitly saves current version', async () => {
    const { page, http } = await setup();
    page.model.set(draft);
    page.onSubmit(new Event('submit'));
    await vi.waitFor(() => {
      http
        .expectOne(path)
        .flush(
          { status: 412, code: 'APPEARANCE_VERSION_CONFLICT', fieldErrors: [] },
          { status: 412, statusText: 'Conflict' },
        );
    });
    await vi.waitFor(() => {
      expect(page.status()).toBe('conflict');
    });
    expect(page.model()).toEqual(draft);
    const refresh = page.refreshVersion();
    http.expectOne(path).flush({ enabled: false, version: 4 });
    await refresh;
    expect(page.model()).toEqual(draft);
    expect(page.status()).toBe('refreshed');
    page.onSubmit(new Event('submit'));
    await vi.waitFor(() => {
      const request = http.expectOne(path);
      expect(request.request.headers.get('If-Match')).toBe('"4"');
      request.flush({
        enabled: true,
        startsAt: `${draft.startsAt}Z`,
        endsAt: `${draft.endsAt}Z`,
        version: 5,
      });
    });
    await vi.waitFor(() => {
      expect(page.status()).toBe('saved');
    });
    expect(page.model()).toEqual(draft);
    http.verify();
  });
});
