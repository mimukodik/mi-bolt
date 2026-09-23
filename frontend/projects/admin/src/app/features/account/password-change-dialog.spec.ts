/**
 * Spec for `PasswordChangeDialog` (MIM-339). Opened through a real
 * `MatDialog`, driven against MSW's `authHandlers`, signed in as the
 * seeded admin the way `admin-session.spec.ts` signs in: the db's
 * `sessionAdminId` set directly and `AdminSession.refresh()` awaited,
 * which also primes the `XSRF-TOKEN` cookie so the PUT below carries a
 * matching `X-XSRF-TOKEN`.
 */
import { ANIMATION_MODULE_TYPE, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, withXhr } from '@angular/common/http';
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { HttpResponse, http } from 'msw';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { authHandlers } from '../../../mocks/auth.handlers';
import { createDb } from '../../../mocks/db';
import { SEED_ADMIN, SEED_ADMIN_PASSWORD } from '../../../mocks/seed';
import { server, useMswServer } from '../../../testing/msw-server';
import { AdminSession } from '../../core/auth/admin-session';
import { unauthorizedInterceptor } from '../../core/auth/unauthorized.interceptor';

import { PasswordChangeDialog } from './password-change-dialog';

useMswServer();

/** See `confirm-dialog.spec.ts` for why NoopAnimations is required in jsdom. */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

@Component({ selector: 'adm-password-change-dialog-host', template: '' })
class HostComponent {}

function configureTestBed(): void {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [
      provideZonelessChangeDetection(),
      NOOP_ANIMATIONS,
      provideHttpClient(withXhr(), withInterceptors([unauthorizedInterceptor])),
      provideApiConfiguration(resolveApiRoot()),
      provideRouter([{ path: 'bejelentkezes', component: HostComponent }]),
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: document.baseURI } },
    ],
  });
}

/** Signs in the seeded admin directly on the mock db, then syncs `AdminSession`. */
async function signIn(db: ReturnType<typeof createDb>): Promise<void> {
  db.sessionAdminId = SEED_ADMIN.id;
  await TestBed.inject(AdminSession).refresh();
}

function overlay(): HTMLElement {
  const found = document.querySelector('.cdk-overlay-container');
  if (!(found instanceof HTMLElement)) {
    throw new Error('Expected the overlay container');
  }
  return found;
}

function asInput(element: Element | null): HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) {
    throw new Error('Expected an input element');
  }
  return element;
}

function asButton(element: Element | null): HTMLButtonElement {
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error('Expected a button element');
  }
  return element;
}

/** The three password inputs, in DOM order: current, new, confirm. */
function passwordInputs(): [HTMLInputElement, HTMLInputElement, HTMLInputElement] {
  const fields = Array.from(overlay().querySelectorAll('mat-form-field'));
  if (fields.length !== 3) {
    throw new Error(`Expected 3 mat-form-field elements, found ${String(fields.length)}`);
  }
  return [
    asInput(fields[0].querySelector('input')),
    asInput(fields[1].querySelector('input')),
    asInput(fields[2].querySelector('input')),
  ];
}

/** The three visibility-toggle buttons, in the same order as {@link passwordInputs}. */
function toggleButtons(): [HTMLButtonElement, HTMLButtonElement, HTMLButtonElement] {
  const fields = Array.from(overlay().querySelectorAll('mat-form-field'));
  return [
    asButton(fields[0].querySelector('button')),
    asButton(fields[1].querySelector('button')),
    asButton(fields[2].querySelector('button')),
  ];
}

function submitButton(): HTMLButtonElement {
  const found = Array.from(overlay().querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.type === 'submit',
  );
  if (found === undefined) {
    throw new Error('Expected the submit button');
  }
  return found;
}

function fill(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function blur(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('blur'));
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Requests seen by MSW during the test, filtered to the password PUT. */
function countPasswordRequests(): { count: () => number; stop: () => void } {
  let count = 0;
  const listener = ({ request }: { request: Request }): void => {
    if (request.method === 'PUT' && request.url.includes('/admin/auth/password')) {
      count += 1;
    }
  };
  server?.events.on('request:start', listener);
  return {
    count: () => count,
    stop: () => server?.events.removeListener('request:start', listener),
  };
}

describe('PasswordChangeDialog', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    configureTestBed();
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    // The XSRF cookie is a real `document.cookie` entry, not TestBed state,
    // so it survives a test module reset; a stale value from a previous
    // test's token would fail the next test's CSRF check.
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
  });

  /** Opens the dialog and returns the value it eventually closes with. */
  function openDialog(): Promise<boolean | undefined> {
    return firstValueFrom(
      TestBed.inject(MatDialog)
        .open<PasswordChangeDialog, unknown, boolean>(PasswordChangeDialog, {
          width: '28rem',
          autoFocus: 'first-tabbable',
        })
        .afterClosed(),
    );
  }

  it('R1: untouched shows no error and the Mentés button is enabled', async () => {
    // Fails if the schema marks the form attempted on open, or Mentés
    // reads plain form().invalid() instead of attempt.disabled(form).
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);

    void openDialog();
    await fixture.whenStable();

    expect(overlay().textContent).not.toContain('Kötelező mező.');
    expect(submitButton().disabled).toBe(false);
  });

  it('R3: submitting the empty form shows the required message on all three fields, disables Mentés, focuses Jelenlegi jelszó and sends nothing', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);
    const requests = countPasswordRequests();

    void openDialog();
    await fixture.whenStable();

    submitButton().click();
    await fixture.whenStable();

    expect(occurrences(overlay().textContent, 'Kötelező mező.')).toBe(3);
    expect(submitButton().disabled).toBe(true);
    expect(document.activeElement).toBe(passwordInputs()[0]);
    expect(requests.count()).toBe(0);
    requests.stop();
  });

  it('a 14-character new password shows the minLength message', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);

    void openDialog();
    await fixture.whenStable();

    const [, newPassword] = passwordInputs();
    fill(newPassword, 'a'.repeat(14));
    blur(newPassword);
    await fixture.whenStable();

    expect(overlay().textContent).toContain('Legalább 15 karakter.');
  });

  it('a different confirmation shows the mismatch message after blur, and matching it clears the error', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);

    void openDialog();
    await fixture.whenStable();

    const [, newPassword, confirmPassword] = passwordInputs();
    fill(newPassword, 'a-brand-new-password');
    fill(confirmPassword, 'a-different-password');
    blur(confirmPassword);
    await fixture.whenStable();

    expect(overlay().textContent).toContain('A két jelszó nem egyezik.');

    fill(confirmPassword, 'a-brand-new-password');
    await fixture.whenStable();

    expect(overlay().textContent).not.toContain('A két jelszó nem egyezik.');
  });

  it('a wrong current password shows "Hibás jelenlegi jelszó." under Jelenlegi jelszó, keeps the dialog open, and clears on edit', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);

    const closed = openDialog();
    await fixture.whenStable();

    const [currentPassword, newPassword, confirmPassword] = passwordInputs();
    fill(currentPassword, 'not-the-real-password');
    fill(newPassword, 'a-brand-new-password');
    fill(confirmPassword, 'a-brand-new-password');
    submitButton().click();
    await fixture.whenStable();

    expect(overlay().textContent).toContain('Hibás jelenlegi jelszó.');
    expect(overlay().querySelector('h2[mat-dialog-title]')).not.toBeNull();

    fill(currentPassword, 'still-not-the-real-password');
    await fixture.whenStable();

    expect(overlay().textContent).not.toContain('Hibás jelenlegi jelszó.');

    TestBed.inject(MatDialog).closeAll();
    await fixture.whenStable();
    await expect(closed).resolves.toBeUndefined();
  });

  it('a 37-character "ő" new password (74 UTF-8 bytes) shows the server\'s PASSWORD_TOO_LONG message under Új jelszó', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);

    void openDialog();
    await fixture.whenStable();

    const tooLong = 'ő'.repeat(37);
    const [currentPassword, newPassword, confirmPassword] = passwordInputs();
    fill(currentPassword, SEED_ADMIN_PASSWORD);
    fill(newPassword, tooLong);
    fill(confirmPassword, tooLong);
    submitButton().click();
    await fixture.whenStable();

    expect(overlay().textContent).toContain('A jelszó legfeljebb 72 bájt lehet.');
  });

  it('success closes the dialog with true and sends exactly { currentPassword, newPassword }', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);

    let capturedBody: unknown;
    server?.use(
      http.put(
        '*/api/v1/admin/auth/password',
        async ({ request }) => {
          capturedBody = await request.json();
          return new HttpResponse(null, { status: 204 });
        },
        { once: true },
      ),
    );

    const closed = openDialog();
    await fixture.whenStable();

    const [currentPassword, newPassword, confirmPassword] = passwordInputs();
    fill(currentPassword, SEED_ADMIN_PASSWORD);
    fill(newPassword, 'a-brand-new-password');
    fill(confirmPassword, 'a-brand-new-password');
    submitButton().click();
    await fixture.whenStable();

    await expect(closed).resolves.toBe(true);
    expect(capturedBody).toEqual({
      currentPassword: SEED_ADMIN_PASSWORD,
      newPassword: 'a-brand-new-password',
    });
  });

  it('a one-off 503 shows the generic failure alert', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);
    server?.use(
      http.put('*/api/v1/admin/auth/password', () => HttpResponse.json({}, { status: 503 }), {
        once: true,
      }),
    );

    void openDialog();
    await fixture.whenStable();

    const [currentPassword, newPassword, confirmPassword] = passwordInputs();
    fill(currentPassword, SEED_ADMIN_PASSWORD);
    fill(newPassword, 'a-brand-new-password');
    fill(confirmPassword, 'a-brand-new-password');
    submitButton().click();
    await fixture.whenStable();

    expect(overlay().textContent).toContain('A jelszó módosítása nem sikerült. Próbáld újra.');
  });

  it('a one-off 422 with an empty fieldErrors list shows the same generic alert and no field error', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);
    server?.use(
      http.put(
        '*/api/v1/admin/auth/password',
        () =>
          HttpResponse.json(
            { code: 'VALIDATION_FAILED', status: 422, fieldErrors: [] },
            { status: 422 },
          ),
        { once: true },
      ),
    );

    void openDialog();
    await fixture.whenStable();

    const [currentPassword, newPassword, confirmPassword] = passwordInputs();
    fill(currentPassword, SEED_ADMIN_PASSWORD);
    fill(newPassword, 'a-brand-new-password');
    fill(confirmPassword, 'a-brand-new-password');
    submitButton().click();
    await fixture.whenStable();

    expect(overlay().textContent).toContain('A jelszó módosítása nem sikerült. Próbáld újra.');
    expect(overlay().textContent).not.toContain('Hibás jelenlegi jelszó.');
  });

  it('a one-off 401 closes the dialog with false', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);
    server?.use(
      http.put('*/api/v1/admin/auth/password', () => HttpResponse.json({}, { status: 401 }), {
        once: true,
      }),
    );

    const closed = openDialog();
    await fixture.whenStable();

    const [currentPassword, newPassword, confirmPassword] = passwordInputs();
    fill(currentPassword, SEED_ADMIN_PASSWORD);
    fill(newPassword, 'a-brand-new-password');
    fill(confirmPassword, 'a-brand-new-password');
    submitButton().click();
    await fixture.whenStable();

    await expect(closed).resolves.toBe(false);
  });

  it('the three visibility toggles flip their own input type and aria-pressed independently', async () => {
    const db = createDb();
    server?.use(...authHandlers(db));
    await signIn(db);

    void openDialog();
    await fixture.whenStable();

    const inputs = passwordInputs();
    const toggles = toggleButtons();

    for (const input of inputs) {
      expect(input.type).toBe('password');
    }
    for (const toggle of toggles) {
      expect(toggle.getAttribute('aria-pressed')).toBe('false');
    }

    toggles[1].click();
    await fixture.whenStable();

    expect(inputs[0].type).toBe('password');
    expect(inputs[1].type).toBe('text');
    expect(inputs[2].type).toBe('password');
    expect(toggles[0].getAttribute('aria-pressed')).toBe('false');
    expect(toggles[1].getAttribute('aria-pressed')).toBe('true');
    expect(toggles[2].getAttribute('aria-pressed')).toBe('false');
  });
});
