import type { DestroyRef } from '@angular/core';

/** Server-relative boundary timer. Browser clock never decides an effective price. */
export class PriceRefresh {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    destroyRef: DestroyRef,
    private readonly refresh: () => void,
  ) {
    const returned = (): void => {
      if (document.visibilityState === 'visible') this.refresh();
    };
    document.addEventListener('visibilitychange', returned);
    window.addEventListener('pageshow', returned);
    destroyRef.onDestroy(() => {
      this.cancel();
      document.removeEventListener('visibilitychange', returned);
      window.removeEventListener('pageshow', returned);
    });
  }

  schedule(serverTime?: string, nextPriceChangeAt?: string): void {
    this.cancel();
    if (serverTime === undefined || nextPriceChangeAt === undefined) return;
    const delay = Date.parse(nextPriceChangeAt) - Date.parse(serverTime);
    if (!Number.isFinite(delay)) return;
    this.timer = setTimeout(
      () => {
        this.timer = null;
        this.refresh();
      },
      Math.min(2_147_483_647, Math.max(0, delay) + 50),
    );
  }

  private cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
