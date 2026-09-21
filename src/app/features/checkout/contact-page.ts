/**
 * The owning container of the contact step: it holds the `Contact` Signal Forms model seeded from the checkout session, the `CONTACT_DRAFT_SAVER` save call and the post-save navigation to the delivery step.
 *
 * When the saver answers 422 with per-field errors the page
 * hands them to `ContactStep` together with the `Contact` values that
 * were saved, so the step can drop a server error the moment the user
 * edits the field it referred to.
 */
import { Component, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';

import { buildContactForm, normalizeContact } from './contact.schema';
import { CheckoutFacade } from './checkout.facade';
import { CONTACT_DRAFT_SAVER, ContactStep } from './contact-step';
import type { ContactServerErrors } from './contact-server-errors';

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
  private readonly step = viewChild.required(ContactStep);

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

  /**
   * The per-field errors the saver's 422 last carried, paired with the
   * `Contact` values that were saved. Cleared at the start of every
   * `onContinue` so a retry wipes stale messages; set on a 422 so the
   * step can render the error on each named field.
   */
  readonly serverErrors = signal<ContactServerErrors | null>(null);

  async onContinue(): Promise<void> {
    this.saveState.set('loading');
    this.serverErrors.set(null);
    try {
      const normalized = normalizeContact(this.modelWritable());
      const saveResult = await this.saver(normalized);
      if (!saveResult.ok) {
        if (
          saveResult.fieldErrors !== undefined &&
          Object.keys(saveResult.fieldErrors).length > 0
        ) {
          this.serverErrors.set({
            values: this.modelWritable(),
            errors: saveResult.fieldErrors,
          });
          this.saveState.set('idle');
          const step = this.step();
          step.focusSummary();
          step.focusFirstInvalidField();
          return;
        }
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
