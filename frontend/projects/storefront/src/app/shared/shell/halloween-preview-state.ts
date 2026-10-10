import { Service, signal } from '@angular/core';

const STORAGE_KEY = 'mi-bolt.halloween-preview';

/** Opt-in design preview survives route changes and reloads in this tab only. */
@Service()
export class HalloweenPreviewState {
  private readonly active = signal(this.restore());
  readonly enabled = this.active.asReadonly();

  setEnabled(enabled: boolean): void {
    this.active.set(enabled);
    try {
      if (enabled) sessionStorage.setItem(STORAGE_KEY, '1');
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Storage-denied browsers still preview across client-side navigation.
    }
  }

  private restore(): boolean {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }
}
