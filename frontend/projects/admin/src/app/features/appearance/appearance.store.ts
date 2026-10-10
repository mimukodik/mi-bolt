import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminApi } from '../../api/generated/admin-api';
import { getHalloweenAppearance } from '../../api/generated/fn/admin-campaign-settings/get-halloween-appearance';
import { updateHalloweenAppearance } from '../../api/generated/fn/admin-campaign-settings/update-halloween-appearance';
import type { HalloweenAppearance } from '../../api/generated/models/halloween-appearance';
import type { HalloweenAppearanceInput } from '../../api/generated/models/halloween-appearance-input';
import { withIfMatch } from '../../core/api/if-match.interceptor';
import { fieldErrorsOf, problemOf } from '../../core/api/problem';
import type { WireFieldError } from '../../shared/forms/server-errors';

export type AppearanceSaveResult =
  | { kind: 'saved'; value: HalloweenAppearance }
  | { kind: 'invalid'; errors: readonly WireFieldError[] }
  | { kind: 'conflict' }
  | { kind: 'failed' };

@Injectable()
export class AppearanceStore {
  private readonly api = inject(AdminApi);
  readonly stored = signal<HalloweenAppearance | null>(null);
  readonly loading = signal(false);
  readonly loadFailed = signal(false);

  async load(): Promise<HalloweenAppearance | null> {
    this.loading.set(true);
    this.loadFailed.set(false);
    try {
      const value = await firstValueFrom(this.api.invoke(getHalloweenAppearance));
      this.stored.set(value);
      return value;
    } catch {
      this.loadFailed.set(true);
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  async save(body: HalloweenAppearanceInput): Promise<AppearanceSaveResult> {
    const current = this.stored();
    if (current === null) return { kind: 'failed' };
    try {
      const value = await firstValueFrom(
        this.api.invoke(
          updateHalloweenAppearance,
          { body },
          withIfMatch(`"${String(current.version)}"`),
        ),
      );
      this.stored.set(value);
      return { kind: 'saved', value };
    } catch (error) {
      if (problemOf(error)?.code === 'APPEARANCE_VERSION_CONFLICT') return { kind: 'conflict' };
      const errors = fieldErrorsOf(error);
      return errors.length > 0 ? { kind: 'invalid', errors } : { kind: 'failed' };
    }
  }
}
