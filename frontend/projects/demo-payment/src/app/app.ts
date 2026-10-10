import { Component, DestroyRef, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Api } from '@mi-bolt/api/api';
import { getShopAppearance } from '@mi-bolt/api/fn/catalog/get-shop-appearance';

/** Shell of the demo payment application: one outlet, no chrome. */
@Component({
  selector: 'pay-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  host: { '[class.halloween]': 'halloweenActive()' },
})
export class App {
  protected readonly halloweenActive = signal(false);
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  private timer: number | undefined;

  constructor() {
    this.destroyRef.onDestroy(() => {
      window.clearTimeout(this.timer);
    });
    this.refresh();
  }

  private refresh(): void {
    this.api
      .invoke(getShopAppearance)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (appearance) => {
          this.halloweenActive.set(appearance.halloweenActive || this.previewEnabled());
          const boundary = Date.parse(appearance.nextChangeAt ?? '');
          const remaining = boundary - Date.parse(appearance.serverTime);
          this.schedule(Number.isFinite(remaining) ? Math.min(30_000, remaining + 50) : 30_000);
        },
        error: () => {
          this.halloweenActive.set(this.previewEnabled());
          this.schedule(30_000);
        },
      });
  }

  private schedule(delay: number): void {
    this.timer = window.setTimeout(
      () => {
        this.refresh();
      },
      Math.max(50, delay),
    );
  }

  private previewEnabled(): boolean {
    if (new URLSearchParams(window.location.search).get('halloweenPreview') === '1') return true;
    try {
      return sessionStorage.getItem('mi-bolt.halloween-preview') === '1';
    } catch {
      return false;
    }
  }
}
