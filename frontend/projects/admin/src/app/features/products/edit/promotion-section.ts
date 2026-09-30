import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../../api/generated/admin-api';
import { getAdminPromotion } from '../../../api/generated/fn/admin-products/get-admin-promotion';
import { replaceAdminPromotion } from '../../../api/generated/fn/admin-products/replace-admin-promotion';
import type { AdminPromotion } from '../../../api/generated/models/admin-promotion';
import { withIfMatch } from '../../../core/api/if-match.interceptor';
import { problemOf } from '../../../core/api/problem';
import { SERVER_FIELD_FALLBACK, SERVER_FIELD_MESSAGES } from '../../../shared/forms/messages';
import { SectionCard } from './section-card';
import { budapestInstant, budapestLocal } from './budapest-time';

@Component({
  selector: 'adm-promotion-section',
  imports: [SectionCard, FormField, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <adm-section-card title="Promóció · közös Halloween-kampány">
      <p>
        Minden telefonra közös szöveg és időszak. Az akciós árakat a változatoknál add meg; az
        alapár megmarad.
      </p>
      <p><strong>Magyar idő (Europe/Budapest)</strong> · {{ state() }}</p>
      <div class="flex flex-wrap gap-3">
        <mat-form-field class="w-full"
          ><mat-label>Promóció szövege</mat-label
          ><textarea matInput [formField]="fields.text"></textarea>
        </mat-form-field>
        <mat-form-field
          ><mat-label>Kezdés · magyar idő</mat-label
          ><input matInput type="datetime-local" [formField]="fields.startsAt"
        /></mat-form-field>
        <mat-form-field
          ><mat-label>Lejárat · magyar idő</mat-label
          ><input matInput type="datetime-local" [formField]="fields.endsAt"
        /></mat-form-field>
      </div>
      <p>
        A lejárat pillanatától normál ár. A már szerveresen elindított fizetés megőrzi az elfogadott
        árat.
      </p>
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
      @if (success()) {
        <p role="status">Kampány mentve.</p>
      }
      <button matButton type="button" [disabled]="busy() || saved() === null" (click)="save()">
        Kampány mentése
      </button>
      <button matButton type="button" [disabled]="busy()" (click)="load()">
        Kampány újratöltése
      </button>
    </adm-section-card>
  `,
})
export class PromotionSection {
  private readonly api = inject(AdminApi);
  readonly model = signal({ text: '', startsAt: '', endsAt: '' });
  readonly fields = form(this.model);
  readonly saved = signal<AdminPromotion | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal(false);
  readonly state = computed(() => {
    const value = this.saved();
    if (value === null) return 'Nem betöltött';
    if (value.startsAt === undefined) return 'Nincs kampány';
    if (value.active) return 'Aktív';
    return Date.parse(value.serverNow) < Date.parse(value.startsAt) ? 'Tervezett' : 'Lejárt';
  });
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.success.set(false);
    try {
      const value = await firstValueFrom(this.api.invoke(getAdminPromotion));
      this.saved.set(value);
      this.fields().reset({
        text: value.text ?? '',
        startsAt: budapestLocal(value.startsAt ?? ''),
        endsAt: budapestLocal(value.endsAt ?? ''),
      });
    } catch {
      this.error.set('Nem sikerült betölteni a közös kampányt.');
    } finally {
      this.busy.set(false);
    }
  }
  async save(): Promise<void> {
    const saved = this.saved();
    if (saved === null || this.busy()) return;
    const model = this.model();
    const clear = model.text === '' && model.startsAt === '' && model.endsAt === '';
    const startsAt = budapestInstant(model.startsAt);
    const endsAt = budapestInstant(model.endsAt);
    if (
      !clear &&
      (model.text.trim() === '' || startsAt === null || endsAt === null || startsAt >= endsAt)
    ) {
      this.error.set(
        'Adj meg szöveget és egyértelmű, érvényes magyar kezdést és lejáratot; a kezdés előzze meg a lejáratot.',
      );
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.success.set(false);
    try {
      const body =
        clear || startsAt === null || endsAt === null ? {} : { text: model.text, startsAt, endsAt };
      const value = await firstValueFrom(
        this.api.invoke(replaceAdminPromotion, { body }, withIfMatch(`"${String(saved.version)}"`)),
      );
      this.saved.set(value);
      this.success.set(true);
    } catch (error: unknown) {
      const problem = problemOf(error);
      const details =
        problem?.fieldErrors
          .map((field) => SERVER_FIELD_MESSAGES[field.code] ?? SERVER_FIELD_FALLBACK)
          .join(' ') ?? '';
      this.error.set(
        problem?.code === 'PRODUCT_VERSION_CONFLICT'
          ? 'Más módosította a közös kampányt. Töltsd újra, majd ellenőrizd a beállításokat.'
          : details.length > 0
            ? details
            : 'Nem sikerült menteni a kampányt.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
