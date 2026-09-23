/**
 * Spec for `LoginPage` (MIM-338): the admin form rule (R1-R6, R8) and the
 * `vissza` redirect guard. Wired as `admin-session.spec.ts` does — real MSW,
 * real `document.cookie` XSRF round trip — and rendered through
 * `RouterTestingHarness` so `vissza` is read from a real activated route.
 */
import { ANIMATION_MODULE_TYPE, Component } from '@angular/core';
import { HttpResponse, http } from 'msw';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { authHandlers } from '../../../mocks/auth.handlers';
import { createDb } from '../../../mocks/db';
import { SEED_ADMIN, SEED_ADMIN_PASSWORD } from '../../../mocks/seed';
import { server, useMswServer } from '../../../testing/msw-server';

import { LoginPage } from './login-page';

useMswServer();

/**
 * `provideNoopAnimations()` lives in `@angular/platform-browser/animations`,
 * which imports `@angular/animations` — a package this workspace does not
 * install (confirmed alongside `confirm-dialog.spec.ts`). All Material reads
 * is the token, so this substitutes it directly.
 */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

@Component({ selector: 'adm-attekintes-stub', template: 'Áttekintés' })
class AttekintesStub {}

@Component({ selector: 'adm-termekek-stub', template: 'Termékek' })
class TermekekStub {}

function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr()),
      provideApiConfiguration(resolveApiRoot()),
      provideRouter([
        { path: 'attekintes', component: AttekintesStub },
        { path: 'termekek', component: TermekekStub },
        { path: 'bejelentkezes', component: LoginPage },
      ]),
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: document.baseURI } },
      NOOP_ANIMATIONS,
    ],
  });
}

function root(harness: RouterTestingHarness): HTMLElement {
  const el = harness.routeNativeElement;
  if (el === null) throw new Error('Expected the routed page element');
  return el;
}

function usernameInput(harness: RouterTestingHarness): HTMLInputElement {
  const input = root(harness).querySelector('input[autocomplete="username"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Expected the username input');
  return input;
}

function passwordInput(harness: RouterTestingHarness): HTMLInputElement {
  const input = root(harness).querySelector('input[autocomplete="current-password"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('Expected the password input');
  return input;
}

function submitButton(harness: RouterTestingHarness): HTMLButtonElement {
  const button = root(harness).querySelector('button[type="submit"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error('Expected the submit button');
  return button;
}

function toggleButton(harness: RouterTestingHarness): HTMLButtonElement {
  const button = root(harness).querySelector('button[type="button"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error('Expected the visibility toggle');
  return button;
}

function matErrors(harness: RouterTestingHarness): HTMLElement[] {
  return Array.from(root(harness).querySelectorAll('mat-error'));
}

function alertParagraph(harness: RouterTestingHarness): HTMLParagraphElement {
  const p = root(harness).querySelector('#login-error');
  if (!(p instanceof HTMLParagraphElement)) throw new Error('Expected the login-error paragraph');
  return p;
}

function setValue(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function blur(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('blur'));
}

describe('LoginPage', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    configureTestBed();
    const db = createDb();
    server?.use(...authHandlers(db));
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
  });

  it('R1: an untouched form shows no error, the button is enabled, the alert is empty', async () => {
    // Fails if the schema starts a field touched/invalid, or if `attempt.disabled`
    // drops its `attempted()` guard.
    await harness.navigateByUrl('/bejelentkezes');

    expect(matErrors(harness).length).toBe(0);
    expect(submitButton(harness).disabled).toBe(false);
    expect(alertParagraph(harness).textContent.trim()).toBe('');
  });

  it('R2: shows exactly the username error on blur, and none on the password', async () => {
    // Fails if `required` stops carrying the shared MESSAGES.required text, or if
    // the password field's error state leaks from the username's.
    await harness.navigateByUrl('/bejelentkezes');

    blur(usernameInput(harness));
    await harness.fixture.whenStable();

    const errors = matErrors(harness);
    expect(errors.length).toBe(1);
    expect(errors[0].textContent.trim()).toBe('Kötelező mező.');
  });

  it('R3: submitting the empty form shows both errors, disables the button, focuses the username, and sends no request', async () => {
    // Fails if SubmitAttempt.run stops calling submit() (nothing marked touched,
    // button stays enabled) or drops its onInvalid focus handler.
    await harness.navigateByUrl('/bejelentkezes');

    let requestCount = 0;
    const listener = (): void => {
      requestCount += 1;
    };
    server?.events.on('request:start', listener);

    submitButton(harness).click();
    await harness.fixture.whenStable();

    server?.events.removeListener('request:start', listener);

    expect(matErrors(harness).length).toBe(2);
    expect(submitButton(harness).disabled).toBe(true);
    expect(document.activeElement).toBe(usernameInput(harness));
    expect(requestCount).toBe(0);
  });

  it('R5: re-enables the button once both fields are filled after a failed attempt', async () => {
    // Fails if SubmitAttempt.disabled drops the `invalid()` half of its predicate.
    await harness.navigateByUrl('/bejelentkezes');

    submitButton(harness).click();
    await harness.fixture.whenStable();
    expect(submitButton(harness).disabled).toBe(true);

    setValue(usernameInput(harness), SEED_ADMIN.username);
    setValue(passwordInput(harness), SEED_ADMIN_PASSWORD);
    await harness.fixture.whenStable();

    expect(submitButton(harness).disabled).toBe(false);
  });

  it('an 81-character username shows the max-length message after blur', async () => {
    // Fails if maxLength stops being applied at 80, or drops the shared message.
    await harness.navigateByUrl('/bejelentkezes');

    setValue(usernameInput(harness), 'a'.repeat(81));
    blur(usernameInput(harness));
    await harness.fixture.whenStable();

    const errors = matErrors(harness);
    expect(errors.length).toBe(1);
    expect(errors[0].textContent.trim()).toBe('Legfeljebb 80 karakter.');
  });

  it('a wrong password shows the exact 401 alert, stays on /bejelentkezes, and clears on the next edit', async () => {
    // Fails if the 401 branch stops setting the exact Hungarian sentence, or if
    // loginError stops being a linkedSignal on the model (R8).
    await harness.navigateByUrl('/bejelentkezes');

    setValue(usernameInput(harness), SEED_ADMIN.username);
    setValue(passwordInput(harness), 'wrong-password');
    submitButton(harness).click();
    await harness.fixture.whenStable();

    expect(alertParagraph(harness).textContent.trim()).toBe('Hibás felhasználónév vagy jelszó.');
    expect(TestBed.inject(Router).url).toContain('/bejelentkezes');

    setValue(passwordInput(harness), 'wrong-password2');
    await harness.fixture.whenStable();

    expect(alertParagraph(harness).textContent.trim()).toBe('');
  });

  it('a 503 on login shows the generic failure alert', async () => {
    // Fails if the non-401 branch stops setting the generic Hungarian sentence.
    await harness.navigateByUrl('/bejelentkezes');
    server?.use(
      http.post('*/api/v1/admin/auth/login', () => HttpResponse.json(null, { status: 503 }), {
        once: true,
      }),
    );

    setValue(usernameInput(harness), SEED_ADMIN.username);
    setValue(passwordInput(harness), SEED_ADMIN_PASSWORD);
    submitButton(harness).click();
    await harness.fixture.whenStable();

    expect(alertParagraph(harness).textContent.trim()).toBe(
      'A bejelentkezés nem sikerült. Próbáld újra.',
    );
  });

  it('success with no vissza lands on /attekintes', async () => {
    // Fails if the default target stops being /attekintes.
    await harness.navigateByUrl('/bejelentkezes');

    setValue(usernameInput(harness), SEED_ADMIN.username);
    setValue(passwordInput(harness), SEED_ADMIN_PASSWORD);
    submitButton(harness).click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/attekintes');
  });

  it('success with a safe vissza returns to that path and query', async () => {
    // Fails if the safe-target guard rejects a legitimate same-origin path with a query.
    await harness.navigateByUrl('/bejelentkezes?vissza=%2Ftermekek%3Fstatus%3Dall');

    setValue(usernameInput(harness), SEED_ADMIN.username);
    setValue(passwordInput(harness), SEED_ADMIN_PASSWORD);
    submitButton(harness).click();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/termekek?status=all');
  });

  it.each(['//evil.example', 'https://evil.example', '/bejelentkezes', '\\evil'])(
    'an unsafe vissza value %s falls back to /attekintes',
    async (vissza) => {
      // Fails if the open-redirect guard stops rejecting any of the four unsafe shapes.
      await harness.navigateByUrl(`/bejelentkezes?vissza=${encodeURIComponent(vissza)}`);

      setValue(usernameInput(harness), SEED_ADMIN.username);
      setValue(passwordInput(harness), SEED_ADMIN_PASSWORD);
      submitButton(harness).click();
      await harness.fixture.whenStable();

      expect(TestBed.inject(Router).url).toBe('/attekintes');
    },
  );

  it('R6: disables the button while the login POST is pending, then navigates once it resolves', async () => {
    // Fails if SubmitAttempt.disabled drops `form().submitting()`.
    await harness.navigateByUrl('/bejelentkezes');

    let resolvePending: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => {
      resolvePending = resolve;
    });
    server?.use(
      http.post('*/api/v1/admin/auth/login', async () => {
        await pending;
        return HttpResponse.json(SEED_ADMIN, {
          headers: { 'Set-Cookie': 'XSRF-TOKEN=pending-test-token; Path=/' },
        });
      }),
    );

    setValue(usernameInput(harness), SEED_ADMIN.username);
    setValue(passwordInput(harness), SEED_ADMIN_PASSWORD);
    submitButton(harness).click();
    // `submit()`'s `selfSubmitting` signal is set synchronously, before the
    // pending POST's promise is awaited; `detectChanges()` flushes that
    // update without waiting for `whenStable()`, which would deadlock here
    // because HttpClient registers the in-flight request as a pending task.
    harness.detectChanges();

    expect(submitButton(harness).disabled).toBe(true);

    resolvePending?.();
    await harness.fixture.whenStable();

    expect(TestBed.inject(Router).url).toBe('/attekintes');
  });

  it('toggles the password visibility, its type and the button aria state', async () => {
    // Fails if the toggle stops flipping [type], aria-pressed or aria-label together.
    await harness.navigateByUrl('/bejelentkezes');

    expect(passwordInput(harness).type).toBe('password');
    expect(toggleButton(harness).getAttribute('aria-pressed')).toBe('false');
    expect(toggleButton(harness).getAttribute('aria-label')).toBe('Jelszó megjelenítése');

    toggleButton(harness).click();
    await harness.fixture.whenStable();

    expect(passwordInput(harness).type).toBe('text');
    expect(toggleButton(harness).getAttribute('aria-pressed')).toBe('true');
    expect(toggleButton(harness).getAttribute('aria-label')).toBe('Jelszó elrejtése');
  });
});
