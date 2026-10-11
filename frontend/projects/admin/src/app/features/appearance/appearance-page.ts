import { Component, inject, signal } from '@angular/core';
import { FormField, form, validate } from '@angular/forms/signals';
import type { TreeValidationResult } from '@angular/forms/signals';
import { MatButton } from '@angular/material/button';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatFormField, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import type { HalloweenAppearance } from '../../api/generated/models/halloween-appearance';
import { toUtcInput, utcTimestampKey } from '../../core/utc-timestamp';
import { ControlError } from '../../shared/forms/control-error';
import { MESSAGES } from '../../shared/forms/messages';
import { toServerErrors } from '../../shared/forms/server-errors';
import { SubmitAttempt } from '../../shared/forms/submit-attempt';
import { AppearanceStore } from './appearance.store';

interface AppearanceFormModel {
  enabled: boolean;
  startsAt: string;
  endsAt: string;
}
function modelOf(value: HalloweenAppearance): AppearanceFormModel {
  return {
    enabled: value.enabled,
    startsAt:
      value.startsAt === null || value.startsAt === undefined ? '' : toUtcInput(value.startsAt),
    endsAt: value.endsAt === null || value.endsAt === undefined ? '' : toUtcInput(value.endsAt),
  };
}

@Component({
  selector: 'adm-appearance-page',
  templateUrl: './appearance-page.html',
  imports: [FormField, MatButton, MatCheckbox, MatFormField, MatInput, MatLabel, ControlError],
  providers: [AppearanceStore, SubmitAttempt],
})
export class AppearancePage {
  protected readonly store = inject(AppearanceStore);
  protected readonly attempt = inject(SubmitAttempt);
  readonly model = signal<AppearanceFormModel>({ enabled: false, startsAt: '', endsAt: '' });
  readonly status = signal<'idle' | 'saved' | 'conflict' | 'failed' | 'refreshed'>('idle');
  readonly form = form(this.model, (path) => {
    for (const field of [path.startsAt, path.endsAt]) {
      validate(field, (ctx) => {
        if (ctx.value() === '')
          return ctx.valueOf(path.enabled)
            ? { kind: 'required', message: MESSAGES.required }
            : null;
        const key = utcTimestampKey(ctx.value());
        if (key === null) return { kind: 'date', message: MESSAGES.promotionDate };
        return key.endsWith('000')
          ? null
          : { kind: 'precision', message: MESSAGES.appearancePrecision };
      });
    }
    validate(path.endsAt, (ctx) => {
      const start = utcTimestampKey(ctx.valueOf(path.startsAt));
      const end = utcTimestampKey(ctx.value());
      return start !== null && end !== null && start >= end
        ? { kind: 'period', message: MESSAGES.promotionPeriod }
        : null;
    });
  });

  constructor() {
    void this.loadInitial();
  }

  async loadInitial(): Promise<void> {
    const value = await this.store.load();
    if (value !== null) this.model.set(modelOf(value));
  }

  async retryLoad(): Promise<void> {
    if (this.store.stored() === null) await this.loadInitial();
    else await this.refreshVersion();
  }

  async refreshVersion(): Promise<void> {
    if ((await this.store.load()) !== null) this.status.set('refreshed');
  }

  onSubmit(event: Event): void {
    event.preventDefault();
    void this.attempt.run(this.form, () => this.save());
  }

  private async save(): Promise<TreeValidationResult> {
    this.status.set('idle');
    const value = this.model();
    const result = await this.store.save({
      enabled: value.enabled,
      startsAt: value.startsAt === '' ? null : `${value.startsAt}Z`,
      endsAt: value.endsAt === '' ? null : `${value.endsAt}Z`,
    });
    if (result.kind === 'invalid') return toServerErrors(this.form, result.errors);
    this.status.set(result.kind);
    if (result.kind === 'saved') {
      this.model.set(modelOf(result.value));
      this.form().reset();
    }
    return undefined;
  }
}
