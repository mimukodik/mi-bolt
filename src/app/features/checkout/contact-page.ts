/**
 * The owning container of the contact step: it holds the `Contact` Signal Forms model seeded from the checkout session, the `CONTACT_DRAFT_SAVER` save call and the post-save navigation to the delivery step.
 */
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { buildContactForm, normalizeContact } from './contact.schema';
import { CheckoutFacade } from './checkout.facade';
import { CONTACT_DRAFT_SAVER, ContactStep } from './contact-step';

import type { AsyncStatus } from '../../shared/types/async-status';
import type { CheckoutSession } from '../../api/generated/models/checkout-session';
import type { Contact } from '../../api/generated/models/contact';

/**
 * The contact section the draft already holds, copied field by field
 * so the form's writes stay inside the model signal, or an empty
 * contact when the draft has none.
 */
function initialContact(session: CheckoutSession | null): Contact {
  const contact = session?.contact;
  if (contact === undefined) {
    return { fullName: '', email: '', phone: '' };
  }
  return { fullName: contact.fullName, email: contact.email, phone: contact.phone };
}

@Component({
  selector: 'app-contact-page',
  imports: [ContactStep],
  templateUrl: './contact-page.html',
})
export class ContactPage {
  private readonly saver = inject(CONTACT_DRAFT_SAVER);
  private readonly router = inject(Router);
  private readonly checkout = inject(CheckoutFacade);

  /**
   * The form starts from the contact section the checkout draft
   * carries, which `contactGuard` has hydrated by the time this page
   * is created, so a reload of `/penztar/adatok` and a "Módosítás"
   * from the review step both open on the saved values. With no saved
   * section the form starts empty: the example values the prototype
   * shows are placeholders on the inputs, not content, and a
   * pre-filled form would satisfy "All fields required" (screens.md
   * S4.2) without the user having entered anything.
   */
  private readonly modelWritable = signal<Contact>(initialContact(this.checkout.session()));
  readonly contactFields = buildContactForm(this.modelWritable);

  readonly saveState = signal<AsyncStatus>('idle');

  async onContinue(): Promise<void> {
    this.saveState.set('loading');
    try {
      const normalized = normalizeContact(this.modelWritable());
      const saveResult = await this.saver(normalized);
      if (!saveResult.ok) {
        this.saveState.set('error');
        return;
      }
      this.saveState.set('idle');
      await this.router.navigate(['/penztar/szallitas']);
    } catch {
      this.saveState.set('error');
    }
  }
}
