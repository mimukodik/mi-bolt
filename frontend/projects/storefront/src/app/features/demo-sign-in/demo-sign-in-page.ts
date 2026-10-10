/**
 * MIM-423 — the demo sign-in page at `/belepes`.
 *
 * One password field and one Belépés button, with nothing of the shop
 * behind it: the page is the gate, so it carries no header, no footer and
 * no `ShopLayout`. The design is `frontend/docs/design/yettel.md`'s
 * recipes assembled for a surface yettel itself does not have — the
 * `.container-sm` card width and the `.modal-content` radius and shadow
 * (§4), the navy `.btn--primary` pill (§5), and the storefront header's own
 * brand mark, so the page reads as MiBolt before the shop opens.
 *
 * On success the visitor goes to `vissza` when that is a safe same-origin
 * path, and to the home page otherwise. Deliberately not here: showing the
 * password, a username field, a sign-out.
 */

import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import type { WritableSignal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { FormField, form, maxLength, required } from '@angular/forms/signals';

import { Button, FormFieldMessage, StatusMessage, type FieldError } from '../../shared/ui';
import { DemoAccess, isSafeReturnUrl } from '../../core/demo-access/demo-access';
import { HalloweenPreviewState } from '../../shared/shell/halloween-preview-state';

/** Where a visitor lands when `vissza` is missing or unsafe. */
const HOME_PATH = '/';

/** `DemoSessionRequest.password` caps the body at 64 characters (contract 2.2.0). */
const PASSWORD_MAX_LENGTH = 64;

@Component({
  selector: 'app-demo-sign-in-page',
  templateUrl: './demo-sign-in-page.html',
  imports: [Button, FormField, FormFieldMessage, StatusMessage],
  host: { '[class.halloween]': 'showHalloween()' },
})
export class DemoSignInPage {
  private readonly access = inject(DemoAccess);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly preview = inject(HalloweenPreviewState);
  protected readonly showHalloween = computed(
    () =>
      this.preview.enabled() ||
      this.route.snapshot.queryParamMap.get('vissza') === '/primitives/halloween',
  );

  private readonly model = signal({ password: '' });

  protected readonly form = form(this.model, (p) => {
    required(p.password, { message: 'Add meg a jelszót.' });
    maxLength(p.password, PASSWORD_MAX_LENGTH, {
      message: 'A jelszó legfeljebb 64 karakter lehet.',
    });
  });

  /** `true` after the visitor has tried to submit at least once. */
  protected readonly submitted = signal(false);

  /** `true` while the sign-in call is in flight; the button is disabled then. */
  protected readonly pending = signal(false);

  /** The alert under the heading; any edit to the password clears it. */
  protected readonly signInError: WritableSignal<string | null> = linkedSignal({
    source: this.model,
    computation: () => null,
  });

  /** The field's own validation messages, in the shape the primitive expects. */
  protected readonly passwordErrors = computed<readonly FieldError[]>(() =>
    this.form
      .password()
      .errors()
      .map((error) => ({
        code: error.kind,
        message: error.message ?? error.kind,
      })),
  );

  /** `aria-invalid` and the message share one gate: touched or submitted. */
  protected readonly passwordShowsInvalid = computed<boolean>(
    () => this.passwordErrors().length > 0 && (this.form.password().touched() || this.submitted()),
  );

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.submitted.set(true);
    if (this.form().invalid() || this.pending()) return;

    this.pending.set(true);
    try {
      await this.access.signIn(this.model().password);
    } catch (error: unknown) {
      this.signInError.set(
        error instanceof HttpErrorResponse && error.status === 401
          ? 'Hibás jelszó. Próbáld újra.'
          : 'A belépés nem sikerült. Próbáld újra később.',
      );
      return;
    } finally {
      this.pending.set(false);
    }

    const vissza = this.route.snapshot.queryParamMap.get('vissza');
    await this.router.navigateByUrl(isSafeReturnUrl(vissza) ? vissza : HOME_PATH, {
      replaceUrl: true,
    });
  }
}
