/**
 * FIX-63: `ContactPage` is the owning container `checkout.routes.ts:203`
 * routes `adatok` to. It owns the `Contact` Signal Forms model, the
 * `CONTACT_DRAFT_SAVER` save call and the post-save navigation
 * `ContactStep.onSubmit()` used to do itself before this task moved that
 * responsibility up here (`components.md:551-557`).
 */
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { buildContactForm, normalizeContact } from './contact.schema';
import { CONTACT_DRAFT_SAVER, ContactStep } from './contact-step';

import type { AsyncStatus } from '../../shared/types/async-status';
import type { Contact } from '../../api/legacy/models/contact';

@Component({
  selector: 'app-contact-page',
  imports: [ContactStep],
  templateUrl: './contact-page.html',
})
export class ContactPage {
  private readonly saver = inject(CONTACT_DRAFT_SAVER);
  private readonly router = inject(Router);

  /**
   * The form starts empty. The example values the prototype shows are
   * placeholders on the inputs, not content: a pre-filled form would
   * satisfy "All fields required" (screens.md S4.2) without the user
   * having entered anything.
   */
  private readonly modelWritable = signal<Contact>({ fullName: '', email: '', phone: '' });
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
