/**
 * Spec for the Adminok page (projects/admin/src/app/features/admins/admins-page.ts):
 * the table renders every admin with the Létrehozva date formatted as
 * `yyyy. MM. dd. HH:mm` and marks the signed-in row `(te)`; the Törlés
 * button is disabled with a tooltip for the signed-in admin and for
 * the last-admin case, opens a confirm dialog otherwise, and each
 * server answer lands as a snack-bar. The loading and error states
 * are also covered (MIM-344, F13).
 *
 * The page reads the signed-in admin through `AdminSession.current()`,
 * so the spec signs in on the mock db first and then awaits
 * `AdminSession.refresh()` so `current()` resolves to the seeded
 * admin before the page is created. `provideZonelessChangeDetection`
 * keeps the test in sync with `app.config.ts`; `MOCK_PLATFORM_LOCATION_CONFIG`
 * lets Angular's XSRF interceptor keep the `X-XSRF-TOKEN` header on
 * the DELETE (see `admin-session.spec.ts:44-53` for the reason).
 */
import { HttpResponse, http } from 'msw';
import { ANIMATION_MODULE_TYPE, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { MOCK_PLATFORM_LOCATION_CONFIG } from '@angular/common/testing';
import { provideRouter } from '@angular/router';
import { formatDate, registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltip } from '@angular/material/tooltip';
import type { MockResult } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveApiRoot } from '@mi-bolt/core-api/api-root';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { AdminSession } from '../../core/auth/admin-session';
import { issueXsrfCookie } from '../../../mocks/guards';
import { createDb } from '../../../mocks/db';
import { SEED_ADMIN } from '../../../mocks/seed';
import { server, useMswServer } from '../../../testing/msw-server';
import { usersHandlers } from '../../../mocks/users.handlers';
import { authHandlers } from '../../../mocks/auth.handlers';
import type { MockDb } from '../../../mocks/db';

import { AdminsPage } from './admins-page';
import { AdminsStore } from './admins.store';

useMswServer();

const OTHER_ADMIN_ID = 'a0000000-0000-4000-8000-000000000002';
const OTHER_ADMIN = {
  id: OTHER_ADMIN_ID,
  username: 'second',
  createdAt: '2026-09-20T00:00:00Z',
} as const;

// See confirm-dialog.spec.ts:25 — the NoopAnimations spelling this
// workspace uses, since `@angular/platform-browser/animations` is not
// installed and Material only reads the token.
const NOOP_ANIMATIONS = { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' } as const;

// Register the hu-HU locale data once per worker so the page's
// `date` pipe can render the Létrehozva cell. `main.ts` does the same
// at bootstrap; tests do not load `main.ts`, so it has to be here.
registerLocaleData(localeHu, 'hu-HU');

function configureTestBed(): void {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withXhr()),
      provideApiConfiguration(resolveApiRoot()),
      provideRouter([]),
      provideZonelessChangeDetection(),
      NOOP_ANIMATIONS,
      AdminsStore,
      { provide: MOCK_PLATFORM_LOCATION_CONFIG, useValue: { startUrl: document.baseURI } },
    ],
  });
}

function primeXsrf(db: MockDb): void {
  issueXsrfCookie(db);
  // The mock's CSRF check sees the `X-XSRF-TOKEN` request header
  // against the db's stored token; Angular's built-in XSRF interceptor
  // reads that token from `document.cookie`, so set it for the
  // HttpClient to pick up on mutating requests.
  document.cookie = `XSRF-TOKEN=${db.xsrfToken ?? ''}; Path=/`;
}

function refreshCookie(db: MockDb): void {
  // The auth handler may rotate `db.xsrfToken` in response to a 401 or
  // session-expired state; re-sync `document.cookie` so the next
  // mutating request carries the matching `X-XSRF-TOKEN` header.
  document.cookie = `XSRF-TOKEN=${db.xsrfToken ?? ''}; Path=/`;
}

function signedInDb(): MockDb {
  const db = createDb();
  db.sessionAdminId = SEED_ADMIN.id;
  db.admins.set(OTHER_ADMIN_ID, {
    user: { ...OTHER_ADMIN },
    password: 'irrelevant-secret-000',
  });
  return db;
}

async function signInAndRefresh(db: MockDb): Promise<void> {
  primeXsrf(db);
  const session = TestBed.inject(AdminSession);
  await session.refresh();
}

function hostOf(fixture: ComponentFixture<AdminsPage>): HTMLElement {
  const element: unknown = fixture.nativeElement;
  if (!(element instanceof HTMLElement)) throw new Error('expected the page host element');
  return element;
}

function rowByUsername(host: HTMLElement, username: string): HTMLTableRowElement | undefined {
  const rows = Array.from(host.querySelectorAll<HTMLTableRowElement>('tr.mat-mdc-row'));
  return rows.find((row) => row.textContent.includes(username));
}

function torlesButtonOf(row: HTMLTableRowElement): HTMLButtonElement {
  const button = row.querySelector<HTMLButtonElement>('button');
  if (button === null) throw new Error('row has no torles button');
  return button;
}

function tooltipOf(button: HTMLButtonElement, fixture: ComponentFixture<AdminsPage>): MatTooltip {
  const debugButton = fixture.debugElement
    .queryAll(By.css('button'))
    .find((node) => node.nativeElement === button);
  if (debugButton === undefined) throw new Error('button not found in the page debug tree');
  return debugButton.injector.get(MatTooltip);
}

function dialogButtonByLabel(label: string): HTMLButtonElement {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container button'),
  );
  const found = buttons.find((button) => button.textContent.trim() === label);
  if (found === undefined) throw new Error(`no dialog button labelled "${label}"`);
  return found;
}

function ujAdminButton(host: HTMLElement): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent.includes('Új admin'),
  );
  if (found === undefined) throw new Error('no Új admin button in the header row');
  return found;
}

/** The single input of whichever dialog the overlay currently holds. */
function dialogInput(): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>('.cdk-overlay-container input');
  if (found === null) throw new Error('no input in the open dialog');
  return found;
}

function snackBarText(): string {
  const element = document.querySelector('.mat-mdc-snack-bar-container, .mat-mdc-simple-snack-bar');
  if (element === null) throw new Error('no snack-bar container in the document');
  return element.textContent.trim();
}

/** The promise a spied call returned; `confirmDelete` resolves once the dialog, the DELETE and the snack-bar are done. */
function returnedPromise(result: MockResult<Promise<void>> | undefined): Promise<void> {
  if (result?.type === 'return') {
    return result.value;
  }
  throw new Error('confirmDelete did not return');
}

describe('AdminsPage', () => {
  beforeEach(() => {
    configureTestBed();
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    TestBed.resetTestingModule();
    document.cookie = 'XSRF-TOKEN=; Max-Age=0; Path=/';
  });

  // Fails if the table drops a username or its Létrehozva cell, if the date
  // format drifts, or if the `(te)` marker appears on any row but the
  // signed-in one.
  it('case 3: every row carries the username and Létrehozva, the signed-in row carries (te)', async () => {
    const db = signedInDb();
    server?.use(...authHandlers(db), ...usersHandlers(db));
    await signInAndRefresh(db);

    const fixture = TestBed.createComponent(AdminsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = hostOf(fixture);

    const expectedCreated = formatDate(OTHER_ADMIN.createdAt, 'yyyy. MM. dd. HH:mm', 'hu-HU');
    const otherRow = rowByUsername(host, OTHER_ADMIN.username);
    expect(otherRow?.textContent).toContain(OTHER_ADMIN.username);
    expect(otherRow?.textContent).toContain(expectedCreated);
    expect(otherRow?.textContent).not.toContain('(te)');

    const selfExpected = formatDate(SEED_ADMIN.createdAt, 'yyyy. MM. dd. HH:mm', 'hu-HU');
    const selfRow = rowByUsername(host, SEED_ADMIN.username);
    expect(selfRow?.textContent).toContain(SEED_ADMIN.username);
    expect(selfRow?.textContent).toContain(selfExpected);
    expect(selfRow?.textContent).toContain('(te)');
  });

  // Fails if the signed-in row's Törlés stops carrying `disabledInteractive`,
  // stops being `aria-disabled`, or its tooltip message drifts; fails if any
  // other row's tooltip is enabled (its `matTooltipDisabled` is true).
  it('case 4: the signed-in Törlés is disabled with the self message, others are enabled', async () => {
    const db = signedInDb();
    server?.use(...authHandlers(db), ...usersHandlers(db));
    await signInAndRefresh(db);

    const fixture = TestBed.createComponent(AdminsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = hostOf(fixture);

    const selfRow = rowByUsername(host, SEED_ADMIN.username);
    if (selfRow === undefined) throw new Error('self row missing');
    const selfButton = torlesButtonOf(selfRow);
    // The button template applies `disabledInteractive` to every row,
    // so the class is always present; the difference between enabled
    // and disabled is the aria-disabled attribute.
    expect(selfButton.classList.contains('mat-mdc-button-disabled-interactive')).toBe(true);
    expect(selfButton.getAttribute('aria-disabled')).toBe('true');
    const selfTooltip = tooltipOf(selfButton, fixture);
    expect(selfTooltip.message).toBe('A saját fiókodat nem törölheted.');
    expect(selfTooltip.disabled).toBe(false);

    const otherRow = rowByUsername(host, OTHER_ADMIN.username);
    if (otherRow === undefined) throw new Error('other row missing');
    const otherButton = torlesButtonOf(otherRow);
    expect(otherButton.getAttribute('aria-disabled')).not.toBe('true');
    expect(otherButton.hasAttribute('disabled')).toBe(false);
    const otherTooltip = tooltipOf(otherButton, fixture);
    expect(otherTooltip.disabled).toBe(true);
  });

  // Fails if the page drops the last-admin branch, or its tooltip text
  // drifts. The seeded admin signs in first (so `refresh()` resolves
  // to it), and is then removed from `db.admins` before the page's
  // own `load()` runs; the GET handler then returns a single row, and
  // the page's `admins().length === 1` branch is the one firing. The
  // `sessionAdmin` mock guard clears `db.sessionAdminId` on the first
  // request that follows the removal, so the page's GET — and not the
  // session refresh — is the request that has to land with `sessionAdminId`
  // still set; that's why the one-off GET handler here skips the
  // session check entirely.
  it('case 5: with one non-self admin, its Törlés is disabled with the last-admin message', async () => {
    const db = signedInDb();
    await signInAndRefresh(db);
    db.admins.delete(SEED_ADMIN.id);
    server?.use(
      ...authHandlers(db),
      http.get('*/api/v1/admin/users', () => HttpResponse.json([OTHER_ADMIN])),
    );

    const fixture = TestBed.createComponent(AdminsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = hostOf(fixture);

    const onlyRow = rowByUsername(host, OTHER_ADMIN.username);
    if (onlyRow === undefined) throw new Error('only row missing');
    const button = torlesButtonOf(onlyRow);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(tooltipOf(button, fixture).message).toBe('Az utolsó admin nem törölhető.');
  });

  // Fails if a blocked Törlés (the signed-in admin's row) stops being
  // filtered by confirmDelete's early return: opens a dialog or sends a
  // DELETE despite `disabledInteractive` leaving the native `disabled`
  // attribute unset.
  it('case 5b: clicking a blocked Törlés opens no dialog and sends no DELETE', async () => {
    const db = signedInDb();
    server?.use(...authHandlers(db), ...usersHandlers(db));
    await signInAndRefresh(db);

    const fixture = TestBed.createComponent(AdminsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = hostOf(fixture);

    let deleteCount = 0;
    const deleteListener = ({ request }: { request: Request }): void => {
      if (request.method === 'DELETE' && request.url.includes('/admin/users/')) deleteCount++;
    };
    server?.events.on('request:start', deleteListener);

    try {
      const selfRow = rowByUsername(host, SEED_ADMIN.username);
      if (selfRow === undefined) throw new Error('self row missing');
      const deleting = vi.spyOn(fixture.componentInstance, 'confirmDelete');
      torlesButtonOf(selfRow).click();
      await returnedPromise(deleting.mock.results[0]);
      await fixture.whenStable();

      expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
      expect(deleteCount).toBe(0);
    } finally {
      server?.events.removeListener('request:start', deleteListener);
    }
  });

  // Fails if the page stops opening the dialog with the exact text, or if
  // Mégse stops cancelling; fails if Törlés stops sending the DELETE, the
  // snack-bar text drifts, or the row stays put after the 204.
  it('case 6: an enabled Törlés opens the confirm; Mégse does nothing, Törlés deletes and snack-bars', async () => {
    const db = signedInDb();
    primeXsrf(db);
    server?.use(...authHandlers(db), ...usersHandlers(db));
    await signInAndRefresh(db);

    const fixture = TestBed.createComponent(AdminsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = hostOf(fixture);

    let deleteCount = 0;
    const deleteListener = ({ request }: { request: Request }): void => {
      if (request.method === 'DELETE' && request.url.includes('/admin/users/')) deleteCount++;
    };
    server?.events.on('request:start', deleteListener);

    try {
      const otherRow = rowByUsername(host, OTHER_ADMIN.username);
      if (otherRow === undefined) throw new Error('other row missing');
      const deleting = vi.spyOn(fixture.componentInstance, 'confirmDelete');
      torlesButtonOf(otherRow).click();
      await fixture.whenStable();

      const title = document.querySelector('.cdk-overlay-container h2');
      if (title === null) throw new Error('dialog title missing');
      const message = document.querySelector('.cdk-overlay-container mat-dialog-content p');
      if (message === null) throw new Error('dialog message missing');
      expect(title.textContent.trim()).toBe('Admin törlése');
      expect(message.textContent.trim()).toBe(
        `Biztosan törlöd: ${OTHER_ADMIN.username}? A fiók azonnal megszűnik.`,
      );

      dialogButtonByLabel('Mégse').click();
      await returnedPromise(deleting.mock.results[0]);
      await fixture.whenStable();
      expect(deleteCount).toBe(0);

      torlesButtonOf(otherRow).click();
      await fixture.whenStable();
      dialogButtonByLabel('Törlés').click();
      await returnedPromise(deleting.mock.results[1]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(deleteCount).toBe(1);
      expect(rowByUsername(host, OTHER_ADMIN.username)).toBeUndefined();
      expect(snackBarText()).toContain(`Admin törölve: ${OTHER_ADMIN.username}`);
    } finally {
      server?.events.removeListener('request:start', deleteListener);
    }
  });

  // Fails if the snack-bar text for `LAST_ADMIN` drifts, or if the page
  // fails to reload after the error (the second GET is what re-reads
  // the server's view of the admins).
  //
  // The mock's `sessionAdmin` clears `sessionAdminId` when the signed-in
  // admin is missing from `db.admins`, so the 409 LAST_ADMIN branch is
  // unreachable through the real handler; the one-off DELETE here answers
  // 409 directly, bypassing the session check that the case-2c
  // arrangement would have triggered.
  it('case 7: a 409 LAST_ADMIN answers show the last-admin snack-bar and reload the list', async () => {
    const db = signedInDb();
    primeXsrf(db);
    server?.use(
      http.delete('*/api/v1/admin/users/:adminId', () =>
        HttpResponse.json(
          {
            type: 'urn:mi-bolt:problem:last-admin',
            title: 'Last admin',
            status: 409,
            code: 'LAST_ADMIN',
            detail: 'The last admin cannot be deleted',
            traceId: 'fixed-trace',
            fieldErrors: [],
          },
          { status: 409 },
        ),
      ),
      ...authHandlers(db),
      ...usersHandlers(db),
    );
    let getCount = 0;
    const getListener = ({ request }: { request: Request }): void => {
      if (request.method === 'GET' && request.url.includes('/admin/users')) getCount++;
    };
    server?.events.on('request:start', getListener);

    try {
      await signInAndRefresh(db);

      const fixture = TestBed.createComponent(AdminsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      const host = hostOf(fixture);

      const otherRow = rowByUsername(host, OTHER_ADMIN.username);
      if (otherRow === undefined) throw new Error('other row missing');
      const deleting = vi.spyOn(fixture.componentInstance, 'confirmDelete');
      torlesButtonOf(otherRow).click();
      await fixture.whenStable();
      dialogButtonByLabel('Törlés').click();
      refreshCookie(db);
      await returnedPromise(deleting.mock.results[0]);
      await fixture.whenStable();
      fixture.detectChanges();

      expect(snackBarText()).toBe('Az utolsó admin nem törölhető.');
      expect(getCount).toBeGreaterThanOrEqual(2);
    } finally {
      server?.events.removeListener('request:start', getListener);
    }
  });

  // Fails if the loading bar is missing while the first GET is pending,
  // if the 503 path doesn't show the alert, or if Újra doesn't trigger a
  // second GET.
  it('case 8: the loading bar shows while the first GET is pending; a 503 shows the alert and Újra reloads', async () => {
    const db = signedInDb();
    primeXsrf(db);
    let releaseFirst: (() => void) | undefined;
    const firstPending = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let firstResolved = false;
    let userGetCount = 0;
    server?.use(
      ...authHandlers(db),
      http.get('*/api/v1/admin/users', async () => {
        userGetCount++;
        if (firstResolved) {
          return HttpResponse.json([]);
        }
        await firstPending;
        firstResolved = true;
        return HttpResponse.json(null, { status: 503 });
      }),
    );
    await signInAndRefresh(db);

    const fixture = TestBed.createComponent(AdminsPage);
    // Render before the first GET settles so the progress bar is in
    // the DOM while the request is pending; whenStable would wait for
    // the held handler, so it is used only after releaseFirst().
    fixture.detectChanges();
    const host = hostOf(fixture);
    expect(host.querySelector('mat-progress-bar')).not.toBeNull();

    (releaseFirst ?? (() => undefined))();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const alert = host.querySelector('[role="alert"]');
    if (alert === null) throw new Error('alert missing');
    expect(alert.textContent.trim()).toBe('Az adminok betöltése nem sikerült.');
    const retryButton = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent.trim() === 'Újra',
    );
    expect(retryButton).not.toBeUndefined();
    retryButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    // The first GET counts as one; the Újra click triggers a second.
    expect(userGetCount).toBeGreaterThanOrEqual(2);
  });

  // Fails if openNewAdmin stops reloading the list after a 201, if the
  // generated-password dialog stops opening with disableClose, if the
  // password shown there stops matching what the mock db stored, or if
  // AdminsStore starts holding the password anywhere in its state.
  it('case 9: Új admin creates an admin, refreshes the list and shows the password once', async () => {
    const db = signedInDb();
    primeXsrf(db);
    server?.use(...authHandlers(db), ...usersHandlers(db));
    await signInAndRefresh(db);

    let getCount = 0;
    const getListener = ({ request }: { request: Request }): void => {
      if (request.method === 'GET' && request.url.includes('/admin/users')) getCount++;
    };
    server?.events.on('request:start', getListener);

    try {
      const fixture = TestBed.createComponent(AdminsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      const host = hostOf(fixture);

      const opening = vi.spyOn(fixture.componentInstance, 'openNewAdmin');
      ujAdminButton(host).click();
      await fixture.whenStable();

      const usernameField = dialogInput();
      usernameField.value = 'kovacs.anna';
      usernameField.dispatchEvent(new Event('input'));
      dialogButtonByLabel('Létrehozás').click();
      await fixture.whenStable();

      const stored = [...db.admins.values()].find((admin) => admin.user.username === 'kovacs.anna');
      if (stored === undefined) throw new Error('expected kovacs.anna to exist in the mock db');
      expect(dialogInput().value).toBe(stored.password);
      expect(TestBed.inject(MatDialog).openDialogs[0]?.disableClose).toBe(true);
      expect(getCount).toBe(2);
      fixture.detectChanges();
      expect(rowByUsername(host, 'kovacs.anna')).not.toBeUndefined();

      const store = fixture.debugElement.injector.get(AdminsStore);
      expect(JSON.stringify(store.admins())).not.toContain(stored.password);

      dialogButtonByLabel('Bezárás').click();
      await returnedPromise(opening.mock.results[0]);
    } finally {
      server?.events.removeListener('request:start', getListener);
    }
  });

  // Fails if Mégse on Új admin stops closing without a value, if
  // openNewAdmin runs the reload or opens the password dialog anyway.
  it('case 10: Mégse on Új admin sends nothing', async () => {
    const db = signedInDb();
    server?.use(...authHandlers(db), ...usersHandlers(db));
    await signInAndRefresh(db);

    let getCount = 0;
    let postCount = 0;
    const requestListener = ({ request }: { request: Request }): void => {
      if (!request.url.includes('/admin/users')) return;
      if (request.method === 'GET') getCount++;
      if (request.method === 'POST') postCount++;
    };
    server?.events.on('request:start', requestListener);

    try {
      const fixture = TestBed.createComponent(AdminsPage);
      fixture.detectChanges();
      await fixture.whenStable();
      const host = hostOf(fixture);

      const opening = vi.spyOn(fixture.componentInstance, 'openNewAdmin');
      ujAdminButton(host).click();
      await fixture.whenStable();

      dialogButtonByLabel('Mégse').click();
      await returnedPromise(opening.mock.results[0]);
      await fixture.whenStable();

      expect(postCount).toBe(0);
      expect(getCount).toBe(1);
      expect(TestBed.inject(MatDialog).openDialogs.length).toBe(0);
    } finally {
      server?.events.removeListener('request:start', requestListener);
    }
  });
});
