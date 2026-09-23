/**
 * FIX-63 — `ContactPage` container: owns the Signal Forms model, the
 * `CONTACT_DRAFT_SAVER` save call and the post-save navigation that
 * `ContactStep.onSubmit()` used to do itself before this task moved
 * that responsibility up here (`components.md:551-557`).
 *
 * `ContactStep` itself is covered by `contact-step.spec.ts` in
 * isolation; this file covers only what the container adds: the save
 * orchestration and the navigation on success.
 */

import { provideZonelessChangeDetection, signal, type Provider } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { CheckoutFacade } from './checkout.facade';
import { ContactPage } from './contact-page';
import { CONTACT_DRAFT_SAVER, ContactStep, type ContactDraftSaver } from './contact-step';

import type { CheckoutSession } from '../../api/generated/models/checkout-session';

const ZERO = { amount: 0, currency: 'HUF' } as const;

/** A draft whose contact section is filled, as `GET /checkout` returns it. */
const SESSION_WITH_CONTACT: CheckoutSession = {
  version: 3,
  complete: false,
  summary: { subtotal: ZERO, shippingFee: ZERO, paymentFee: ZERO, total: ZERO },
  contact: { fullName: 'Teszt Elek', email: 'teszt.elek@pelda.hu', phone: '+36301234567' },
};

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (raw instanceof HTMLElement) return raw;
  throw new Error('Expected HTMLElement');
}

/**
 * `ContactPage` reads one member of the checkout facade, the `session`
 * signal it seeds the form from, so the spec supplies exactly that
 * member instead of standing up the real facade and its HTTP stack.
 * The `satisfies` keeps the stub honest about the member's type.
 */
function provideSessionStub(session: CheckoutSession | null): Provider {
  const stub = {
    session: signal(session).asReadonly(),
  } satisfies Pick<CheckoutFacade, 'session'>;
  return { provide: CheckoutFacade, useValue: stub };
}

function createContactPage(
  saver: ContactDraftSaver,
  session: CheckoutSession | null = null,
): ComponentFixture<ContactPage> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', component: ContactPage }]),
      { provide: CONTACT_DRAFT_SAVER, useValue: saver },
      provideSessionStub(session),
    ],
  });
  const fixture = TestBed.createComponent(ContactPage);
  fixture.detectChanges();
  return fixture;
}

function getContactStep(fixture: ComponentFixture<ContactPage>): ContactStep {
  const instance: unknown = fixture.debugElement.query(By.directive(ContactStep)).componentInstance;
  if (!(instance instanceof ContactStep)) throw new Error('Expected ContactStep');
  return instance;
}

function fillModel(fixture: ReturnType<typeof createContactPage>): void {
  fixture.componentInstance.contactFields.fullName().value.set('Teszt Elek');
  fixture.componentInstance.contactFields.email().value.set('teszt@example.test');
  fixture.componentInstance.contactFields.phone().value.set('+36201234567');
  fixture.detectChanges();
}

describe('ContactPage owns the save call and post-save navigation', () => {
  it('renders ContactStep with an initially empty model and saveState idle', () => {
    const fixture = createContactPage(() => Promise.resolve({ ok: true }));
    expect(fixture.componentInstance.saveState()).toBe('idle');
    const root = getRootElement(fixture);
    expect(root.querySelector<HTMLInputElement>('#contact-fullname-input')?.value).toBe('');
  });

  it('renders the contact section the checkout draft already carries, so a reload of /penztar/adatok keeps the saved values', () => {
    const fixture = createContactPage(() => Promise.resolve({ ok: true }), SESSION_WITH_CONTACT);
    const root = getRootElement(fixture);
    expect(root.querySelector<HTMLInputElement>('#contact-fullname-input')?.value).toBe(
      'Teszt Elek',
    );
    expect(root.querySelector<HTMLInputElement>('#contact-email-input')?.value).toBe(
      'teszt.elek@pelda.hu',
    );
    expect(root.querySelector<HTMLInputElement>('#contact-phone-input')?.value).toBe(
      '+36301234567',
    );
  });

  it('MIM-234: the contact step renders no breadcrumb', () => {
    const fixture = createContactPage(() => Promise.resolve({ ok: true }));
    const root = getRootElement(fixture);

    expect(root.querySelector('nav.breadcrumbs')).toBeNull();
  });

  it('calls the injected CONTACT_DRAFT_SAVER with the normalized contact and navigates to /penztar/szallitas on success', async () => {
    let received: unknown = null;
    const saver: ContactDraftSaver = (contact) => {
      received = contact;
      return Promise.resolve({ ok: true });
    };
    const fixture = createContactPage(saver);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fillModel(fixture);
    await fixture.componentInstance.onContinue();
    fixture.detectChanges();

    expect(received).toEqual({
      fullName: 'Teszt Elek',
      email: 'teszt@example.test',
      phone: '+36201234567',
    });
    expect(navigateSpy).toHaveBeenCalledWith(['/penztar/szallitas']);
    expect(fixture.componentInstance.saveState()).toBe('idle');
  });

  it('sets saveState to "error" and does not navigate when the saver rejects the draft', async () => {
    const saver: ContactDraftSaver = () => Promise.resolve({ ok: false, message: 'Mentési hiba.' });
    const fixture = createContactPage(saver);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fillModel(fixture);
    await fixture.componentInstance.onContinue();
    fixture.detectChanges();

    expect(fixture.componentInstance.saveState()).toBe('error');
    expect(navigateSpy).not.toHaveBeenCalled();
    const root = getRootElement(fixture);
    expect(root.querySelector('[data-testid="contact-save-error"]')).not.toBeNull();
  });

  it('sets saveState to "error" and does not navigate when the saver throws', async () => {
    const saver: ContactDraftSaver = () => Promise.reject(new Error('network down'));
    const fixture = createContactPage(saver);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fillModel(fixture);
    await fixture.componentInstance.onContinue();
    fixture.detectChanges();

    expect(fixture.componentInstance.saveState()).toBe('error');
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('re-running onContinue() after an error runs the saver again — the retry path this control exposes is pressing "Tovább" again', async () => {
    let calls = 0;
    const saver: ContactDraftSaver = () => {
      calls += 1;
      return calls === 1 ? Promise.resolve({ ok: false }) : Promise.resolve({ ok: true });
    };
    const fixture = createContactPage(saver);

    fillModel(fixture);
    await fixture.componentInstance.onContinue();
    fixture.detectChanges();
    expect(fixture.componentInstance.saveState()).toBe('error');

    await fixture.componentInstance.onContinue();
    fixture.detectChanges();

    expect(calls).toBe(2);
    expect(fixture.componentInstance.saveState()).toBe('idle');
  });

  it('ContactStep, rendered by this container with no saver of its own, still emits continueRequested that this container acts on', async () => {
    const saver: ContactDraftSaver = () => Promise.resolve({ ok: true });
    const fixture = createContactPage(saver);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fillModel(fixture);
    const root = getRootElement(fixture);
    root.querySelector<HTMLButtonElement>('[data-testid="contact-submit"] button')?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navigateSpy).toHaveBeenCalledWith(['/penztar/szallitas']);
  });

  // -------------------------------------------------------------------------
  // A 422 with `fieldErrors` marks the field(s) the wire named,
  // keeps `saveState` idle (no banner), and does not navigate. Editing the
  // named field clears the server error.
  // -------------------------------------------------------------------------

  it('a 422 with field errors marks the fields, keeps saveState idle and does not navigate (MIM-212)', async () => {
    const saver: ContactDraftSaver = () =>
      Promise.resolve({
        ok: false,
        message: 'x',
        fieldErrors: {
          email: [
            {
              code: 'EMAIL_FORMAT',
              message: 'Adj meg egy érvényes e-mail címet.',
              pointer: '/email',
            },
          ],
        },
      });
    const fixture = createContactPage(saver);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fillModel(fixture);
    const stepInstance = getContactStep(fixture);

    await stepInstance.onSubmit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.saveState()).toBe('idle');
    expect(navigateSpy).not.toHaveBeenCalled();
    expect(fixture.componentInstance.serverErrors()).not.toBeNull();

    const root = getRootElement(fixture);
    const message = root.querySelector<HTMLElement>('#contact-email-message');
    expect(message).not.toBeNull();
    expect(message?.textContent).toContain('Adj meg egy érvényes e-mail címet.');
    expect(root.querySelector('[data-testid="contact-save-error"]')).toBeNull();
  });

  it('a 422 with field errors moves focus to the first field it names (MIM-212)', async () => {
    const saver: ContactDraftSaver = () =>
      Promise.resolve({
        ok: false,
        message: 'x',
        fieldErrors: {
          email: [
            {
              code: 'EMAIL_FORMAT',
              message: 'Adj meg egy érvényes e-mail címet.',
              pointer: '/email',
            },
          ],
        },
      });
    const fixture = createContactPage(saver);

    fillModel(fixture);
    const stepInstance = getContactStep(fixture);

    document.body.focus();
    expect(document.activeElement).toBe(document.body);

    // No synchronous detectChanges(): the focus has to survive the real
    // tick order, where the render happens after the microtask queue.
    await stepInstance.onSubmit();
    await fixture.whenStable();

    expect(document.activeElement?.id).toBe('contact-email-input');
  });

  it('a corrected retry after a 422 clears the server errors and navigates (MIM-212)', async () => {
    let calls = 0;
    const saver: ContactDraftSaver = () => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({
          ok: false,
          message: 'x',
          fieldErrors: {
            email: [
              {
                code: 'EMAIL_FORMAT',
                message: 'Adj meg egy érvényes e-mail címet.',
                pointer: '/email',
              },
            ],
          },
        });
      }
      return Promise.resolve({ ok: true });
    };
    const fixture = createContactPage(saver);
    fillModel(fixture);
    const stepInstance = getContactStep(fixture);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    await stepInstance.onSubmit();
    await fixture.whenStable();
    expect(fixture.componentInstance.serverErrors()).not.toBeNull();

    fixture.componentInstance.contactFields.email().value.set('teszt2@example.test');
    fixture.detectChanges();
    await stepInstance.onSubmit();
    await fixture.whenStable();

    expect(calls).toBe(2);
    expect(fixture.componentInstance.serverErrors()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/penztar/szallitas']);
  });

  it('editing the field clears its server error (MIM-212)', async () => {
    const saver: ContactDraftSaver = () =>
      Promise.resolve({
        ok: false,
        message: 'x',
        fieldErrors: {
          email: [
            {
              code: 'EMAIL_FORMAT',
              message: 'Adj meg egy érvényes e-mail címet.',
              pointer: '/email',
            },
          ],
        },
      });
    const fixture = createContactPage(saver);

    fillModel(fixture);
    const stepInstance = getContactStep(fixture);
    await stepInstance.onSubmit();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.querySelector<HTMLElement>('#contact-email-message')?.hidden).toBe(false);
    expect(root.querySelector('#contact-email-message')?.textContent.trim()).toBe(
      'Adj meg egy érvényes e-mail címet.',
    );

    // Editing the field whose value no longer matches the saved one
    // drops that field's server error.
    fixture.componentInstance.contactFields.email().value.set('masik@example.test');
    fixture.detectChanges();

    expect(root.querySelector<HTMLElement>('#contact-email-message')?.hidden).toBe(true);
    expect(root.querySelector('#contact-email-message')?.textContent.trim()).toBe('');
  });

  it('a 422 with errors on multiple fields marks them all (MIM-212)', async () => {
    // The wire returns one server error per invalid field. All of them
    // must surface, not just the first, so the user fixes the form in
    // one submit cycle rather than discovering further errors on the
    // next attempt.
    const saver: ContactDraftSaver = () =>
      Promise.resolve({
        ok: false,
        message: 'x',
        fieldErrors: {
          email: [
            {
              code: 'EMAIL_FORMAT',
              message: 'Adj meg egy érvényes e-mail címet.',
              pointer: '/email',
            },
          ],
          phone: [
            {
              code: 'PHONE_FORMAT',
              message: 'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
              pointer: '/phone',
            },
          ],
        },
      });
    const fixture = createContactPage(saver);
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate');

    fillModel(fixture);
    const stepInstance = getContactStep(fixture);
    await stepInstance.onSubmit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.saveState()).toBe('idle');
    expect(navigateSpy).not.toHaveBeenCalled();

    const root = getRootElement(fixture);
    expect(root.querySelector<HTMLElement>('#contact-email-message')?.hidden).toBe(false);
    expect(root.querySelector('#contact-email-message')?.textContent.trim()).toBe(
      'Adj meg egy érvényes e-mail címet.',
    );
    expect(root.querySelector<HTMLElement>('#contact-phone-message')?.hidden).toBe(false);
    expect(root.querySelector('#contact-phone-message')?.textContent.trim()).toBe(
      'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
    );
  });

  it('editing one of multiple server-errored fields drops only that one (MIM-212)', async () => {
    // With errors on email AND phone, editing the email must clear the
    // email message and leave the phone message in place — the saved
    // phone value still matches what the wire rejected.
    const saver: ContactDraftSaver = () =>
      Promise.resolve({
        ok: false,
        message: 'x',
        fieldErrors: {
          email: [
            {
              code: 'EMAIL_FORMAT',
              message: 'Adj meg egy érvényes e-mail címet.',
              pointer: '/email',
            },
          ],
          phone: [
            {
              code: 'PHONE_FORMAT',
              message: 'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
              pointer: '/phone',
            },
          ],
        },
      });
    const fixture = createContactPage(saver);

    fillModel(fixture);
    const stepInstance = getContactStep(fixture);
    await stepInstance.onSubmit();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.querySelector<HTMLElement>('#contact-email-message')?.hidden).toBe(false);
    expect(root.querySelector('#contact-email-message')?.textContent.trim()).toBe(
      'Adj meg egy érvényes e-mail címet.',
    );
    expect(root.querySelector<HTMLElement>('#contact-phone-message')?.hidden).toBe(false);
    expect(root.querySelector('#contact-phone-message')?.textContent.trim()).toBe(
      'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
    );

    fixture.componentInstance.contactFields.email().value.set('masik@example.test');
    fixture.detectChanges();

    expect(root.querySelector<HTMLElement>('#contact-email-message')?.hidden).toBe(true);
    expect(root.querySelector('#contact-email-message')?.textContent.trim()).toBe('');
    expect(root.querySelector<HTMLElement>('#contact-phone-message')?.hidden).toBe(false);
    expect(root.querySelector('#contact-phone-message')?.textContent.trim()).toBe(
      'Adj meg érvényes magyar (+36) telefonszámot 8-9 jeggyel.',
    );
  });

  it('editing fullName clears its server error (MIM-212)', async () => {
    // The per-field edit-clears behaviour holds for fullName too;
    // email-only coverage would leave a regression hiding here.
    const saver: ContactDraftSaver = () =>
      Promise.resolve({
        ok: false,
        message: 'x',
        fieldErrors: {
          fullName: [
            {
              code: 'FULL_NAME_LENGTH',
              message: 'Add meg a teljes neved (2–100 karakter).',
              pointer: '/fullName',
            },
          ],
        },
      });
    const fixture = createContactPage(saver);

    fillModel(fixture);
    const stepInstance = getContactStep(fixture);
    await stepInstance.onSubmit();
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.querySelector<HTMLElement>('#contact-fullname-message')?.hidden).toBe(false);
    expect(root.querySelector('#contact-fullname-message')?.textContent.trim()).toBe(
      'Add meg a teljes neved (2–100 karakter).',
    );

    fixture.componentInstance.contactFields.fullName().value.set('Másik Név');
    fixture.detectChanges();

    expect(root.querySelector<HTMLElement>('#contact-fullname-message')?.hidden).toBe(true);
    expect(root.querySelector('#contact-fullname-message')?.textContent.trim()).toBe('');
  });

  it('a seeded form with its fields cleared is blocked by client validation and never saved (MIM-212)', async () => {
    let calls = 0;
    const saver: ContactDraftSaver = () => {
      calls += 1;
      return Promise.resolve({ ok: true });
    };
    const fixture = createContactPage(saver, SESSION_WITH_CONTACT);
    const root = getRootElement(fixture);
    const stepInstance = getContactStep(fixture);

    for (const id of ['contact-fullname-input', 'contact-email-input', 'contact-phone-input']) {
      const input = root.querySelector<HTMLInputElement>(`#${id}`);
      expect(input).not.toBeNull();
      if (input === null) return;
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    fixture.detectChanges();

    await stepInstance.onSubmit();
    await fixture.whenStable();

    expect(calls).toBe(0);
    expect(root.querySelector('[data-testid="contact-summary"]')).not.toBeNull();
    expect(stepInstance.invalidFields().length).toBe(3);
  });
});
