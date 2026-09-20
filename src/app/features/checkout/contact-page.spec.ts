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

import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { ContactPage } from './contact-page';
import { CONTACT_DRAFT_SAVER, type ContactDraftSaver } from './contact-step';

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (raw instanceof HTMLElement) return raw;
  throw new Error('Expected HTMLElement');
}

function createContactPage(saver: ContactDraftSaver): ComponentFixture<ContactPage> {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([{ path: '**', component: ContactPage }]),
      { provide: CONTACT_DRAFT_SAVER, useValue: saver },
    ],
  });
  const fixture = TestBed.createComponent(ContactPage);
  fixture.detectChanges();
  return fixture;
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
});
