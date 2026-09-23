/**
 * Spec for `NewAdminDialog` (MIM-345, F14). Opened through a real
 * `MatDialog` against MSW's `usersHandlers`, signed in directly on the
 * mock db (the dialog does not read `AdminSession`) with the XSRF
 * cookie primed for the POST's CSRF check (see
 * `admins-page.spec.ts`'s `primeXsrf` for the same pattern).
 */
import { ANIMATION_MODULE_TYPE, Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { MatDialog } from '@angular/material/dialog';
import { provideRouter } from '@angular/router';
import { HttpResponse, http } from 'msw';
import { firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import type { AdminUserCreated } from '../../api/generated/models/admin-user-created';
import { serviceUnavailable } from '../../../mocks/backend-answers';
import { createDb } from '../../../mocks/db';
import type { MockDb } from '../../../mocks/db';
import { issueXsrfCookie } from '../../../mocks/guards';
import { SEED_ADMIN } from '../../../mocks/seed';
import { server, useMswServer } from '../../../testing/msw-server';
import { usersHandlers } from '../../../mocks/users.handlers';
import { MESSAGES } from '../../shared/forms/messages';

import { NewAdminDialog } from './new-admin-dialog';

useMswServer();

/** See `confirm-dialog.spec.ts` for why NoopAnimations is required in jsdom. */
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

@Component({ selector: 'adm-new-admin-dialog-host', template: '' })
class HostComponent {}

function configureTestBed(): void {
  TestBed.configureTestingModule({
    imports: [HostComponent],
    providers: [
      provideZonelessChangeDetection(),
      NOOP_ANIMATIONS,
      provideHttpClient(withXhr()),
      provideApiConfiguration(resolveApiRoot()),
      provideRouter([]),
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: document.baseURI } },
    ],
  });
}

/** Signs the seeded admin in directly on the mock db and primes the XSRF cookie. */
function signIn(db: MockDb): void {
  db.sessionAdminId = SEED_ADMIN.id;
  issueXsrfCookie(db);
  document.cookie = `XSRF-TOKEN=${db.xsrfToken ?? ''}; Path=/`;
}

function overlay(): HTMLElement {
  const found = document.querySelector('.cdk-overlay-container');
  if (!(found instanceof HTMLElement)) throw new Error('expected the overlay container');
  return found;
}

function asInput(element: Element | null): HTMLInputElement {
  if (!(element instanceof HTMLInputElement)) throw new Error('expected an input element');
  return element;
}

function usernameInput(): HTMLInputElement {
  return asInput(overlay().querySelector('input'));
}

function submitButton(): HTMLButtonElement {
  const found = Array.from(overlay().querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.type === 'submit',
  );
  if (found === undefined) throw new Error('expected the submit button');
  return found;
}

function megseButton(): HTMLButtonElement {
  const found = Array.from(overlay().querySelectorAll<HTMLButtonElement>('button')).find(
    (button) => button.textContent.trim() === 'Mégse',
  );
  if (found === undefined) throw new Error('expected the Mégse button');
  return found;
}

function fill(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function blur(input: HTMLInputElement): void {
  input.dispatchEvent(new Event('blur'));
}

interface RequestLog {
  readonly count: () => number;
  readonly bodies: () => readonly unknown[];
  readonly stop: () => void;
}

/** Counts and captures the JSON bodies of every POST to `/admin/users` seen during the test. */
function createRequestLog(): RequestLog {
  let count = 0;
  const bodies: unknown[] = [];
  const listener = ({ request }: { request: Request }): void => {
    if (request.method !== 'POST' || !request.url.includes('/admin/users')) return;
    count += 1;
    void request
      .clone()
      .json()
      .then((body: unknown) => bodies.push(body));
  };
  server?.events.on('request:start', listener);
  return {
    count: () => count,
    bodies: () => bodies,
    stop: () => server?.events.removeListener('request:start', listener),
  };
}

describe('NewAdminDialog', () => {
  let fixture: ComponentFixture<HostComponent>;

  beforeEach(async () => {
    configureTestBed();
    fixture = TestBed.createComponent(HostComponent);
    await fixture.whenStable();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
  });

  /** Opens the dialog and returns the value it eventually closes with. */
  function openDialog(): Promise<AdminUserCreated | undefined> {
    return firstValueFrom(
      TestBed.inject(MatDialog)
        .open<NewAdminDialog, undefined, AdminUserCreated>(NewAdminDialog, {
          width: '28rem',
          autoFocus: 'first-tabbable',
        })
        .afterClosed(),
    );
  }

  it('case 1: submitting empty shows Kötelező mező. under Felhasználónév and sends no POST', async () => {
    // Fails if `required` stops validating an empty username, or if the
    // action runs despite the invalid form.
    const db = createDb();
    signIn(db);
    server?.use(...usersHandlers(db));
    const requests = createRequestLog();

    try {
      void openDialog();
      await fixture.whenStable();

      submitButton().click();
      await fixture.whenStable();

      expect(overlay().textContent).toContain(MESSAGES.required);
      expect(requests.count()).toBe(0);
    } finally {
      requests.stop();
    }
  });

  it('case 2: pattern and maxLength validation show their messages, a valid username shows none', async () => {
    // Fails if `isValidUsername` stops rejecting the shapes it should, if
    // it wrongly rejects a valid username, or if `maxLength(80)` drifts.
    const db = createDb();
    signIn(db);
    server?.use(...usersHandlers(db));

    void openDialog();
    await fixture.whenStable();

    const input = usernameInput();

    fill(input, 'Kovacs Anna');
    blur(input);
    await fixture.whenStable();
    expect(overlay().textContent).toContain(MESSAGES.usernamePattern);

    fill(input, 'kovacs..anna');
    blur(input);
    await fixture.whenStable();
    expect(overlay().textContent).toContain(MESSAGES.usernamePattern);

    fill(input, '.kovacs');
    blur(input);
    await fixture.whenStable();
    expect(overlay().textContent).toContain(MESSAGES.usernamePattern);

    fill(input, 'kovacs.anna');
    blur(input);
    await fixture.whenStable();
    expect(overlay().textContent).not.toContain(MESSAGES.usernamePattern);

    fill(input, 'a'.repeat(81));
    blur(input);
    await fixture.whenStable();
    expect(overlay().textContent).toContain(MESSAGES.maxLength(80));
  });

  it('case 3: kovacs.anna sends exactly one POST with the exact body and closes with the created user and password', async () => {
    // Fails if the request body carries more than `username`, if more
    // than one POST is sent, or if the dialog closes with a value whose
    // password does not match what the mock db actually stored.
    const db = createDb();
    signIn(db);
    server?.use(...usersHandlers(db));
    const requests = createRequestLog();

    try {
      const closed = openDialog();
      await fixture.whenStable();

      fill(usernameInput(), 'kovacs.anna');
      submitButton().click();
      await fixture.whenStable();

      const created = await closed;
      if (created === undefined) throw new Error('expected the dialog to close with a value');
      expect(created.user.username).toBe('kovacs.anna');
      expect(db.admins.get(created.user.id)?.password).toBe(created.generatedPassword);
      expect(requests.count()).toBe(1);
      expect(requests.bodies()).toEqual([{ username: 'kovacs.anna' }]);
    } finally {
      requests.stop();
    }
  });

  it('case 4: the seeded username admin shows Ez a felhasználónév már foglalt. and keeps the dialog open', async () => {
    // Fails if the mock's 409 USERNAME_TAKEN stops mapping onto the
    // username field, or if the dialog closes anyway.
    const db = createDb();
    signIn(db);
    server?.use(...usersHandlers(db));

    const closed = openDialog();
    await fixture.whenStable();

    fill(usernameInput(), SEED_ADMIN.username);
    submitButton().click();
    await fixture.whenStable();

    expect(overlay().textContent).toContain(MESSAGES.usernameTaken);
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(1);

    TestBed.inject(MatDialog).closeAll();
    await expect(closed).resolves.toBeUndefined();
  });

  it('case 5: a 422 SIZE field error on /username shows the fallback message', async () => {
    // Fails if `toServerErrors` stops falling back to
    // SERVER_FIELD_FALLBACK for a code with no Hungarian message.
    const db = createDb();
    signIn(db);
    server?.use(
      http.post(
        '*/api/v1/admin/users',
        () =>
          HttpResponse.json(
            {
              code: 'VALIDATION_FAILED',
              status: 422,
              fieldErrors: [{ path: '/username', code: 'SIZE' }],
            },
            { status: 422 },
          ),
        { once: true },
      ),
      ...usersHandlers(db),
    );

    void openDialog();
    await fixture.whenStable();

    fill(usernameInput(), 'kovacs.anna');
    submitButton().click();
    await fixture.whenStable();

    expect(overlay().textContent).toContain('Ellenőrizd a mező értékét.');
  });

  it('case 6: a 503 shows the generic failure alert and keeps the dialog open', async () => {
    // Fails if a non-Problem/non-field failure stops falling back to the
    // generic alert, or if the dialog closes on that path.
    const db = createDb();
    signIn(db);
    server?.use(
      http.post('*/api/v1/admin/users', () => serviceUnavailable(), { once: true }),
      ...usersHandlers(db),
    );

    const closed = openDialog();
    await fixture.whenStable();

    fill(usernameInput(), 'kovacs.anna');
    submitButton().click();
    await fixture.whenStable();

    const alert = overlay().querySelector('[role="alert"]');
    if (alert === null) throw new Error('expected the alert line');
    expect(alert.textContent).toContain('Az admin létrehozása nem sikerült. Próbáld újra.');
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(1);

    TestBed.inject(MatDialog).closeAll();
    await expect(closed).resolves.toBeUndefined();
  });

  it('case 12: while the POST is in flight Escape, the backdrop and Mégse cannot close the dialog; it then closes with the created admin', async () => {
    // Fails if `disableClose` stops blocking Escape, the backdrop or Mégse
    // while the request is in flight, or if the dialog does not close with
    // the created admin once the request resolves.
    const db = createDb();
    signIn(db);
    let markArrived: (() => void) | undefined;
    const arrived = new Promise<void>((resolve) => {
      markArrived = resolve;
    });
    let release: (() => void) | undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    server?.use(
      http.post(
        '*/api/v1/admin/users',
        async () => {
          (markArrived ?? ((): void => undefined))();
          await released;
          return undefined; // falls through to the users handler below, which creates the admin
        },
        { once: true },
      ),
      ...usersHandlers(db),
    );

    const closed = openDialog();
    await fixture.whenStable();

    fill(usernameInput(), 'kovacs.anna');
    submitButton().click();
    await arrived;
    TestBed.tick();

    expect(megseButton().disabled).toBe(true);

    const pane = document.querySelector('.cdk-overlay-pane');
    if (!(pane instanceof HTMLElement)) throw new Error('expected the dialog overlay pane');
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    // jsdom's KeyboardEvent carries no keyCode, and the CDK's dialog reads
    // `event.keyCode === ESCAPE` (see `generated-password-dialog.spec.ts`).
    Object.defineProperty(escape, 'keyCode', { get: () => 27 });
    pane.dispatchEvent(escape);
    TestBed.tick();
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(1);

    const backdrop = document.querySelector('.cdk-overlay-backdrop');
    if (!(backdrop instanceof HTMLElement)) throw new Error('expected the overlay backdrop');
    backdrop.click();
    TestBed.tick();
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(1);

    megseButton().click();
    TestBed.tick();
    expect(TestBed.inject(MatDialog).openDialogs.length).toBe(1);

    (release ?? ((): void => undefined))();
    await fixture.whenStable();
    const created = await closed;
    if (created === undefined) throw new Error('expected the dialog to close with a value');
    expect(created.user.username).toBe('kovacs.anna');
    expect(db.admins.get(created.user.id)?.password).toBe(created.generatedPassword);
  });

  it('case 13: the username field sizes its subscript to the message, so a two-line error is not clipped', async () => {
    // Fails if `subscriptSizing="dynamic"` is dropped from the username
    // form field, clipping a two-line error message behind a scrollbar.
    const db = createDb();
    signIn(db);
    server?.use(...usersHandlers(db));

    void openDialog();
    await fixture.whenStable();

    expect(overlay().querySelector('.mat-mdc-form-field-subscript-dynamic-size')).not.toBeNull();
  });
});
