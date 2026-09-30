import { computed, DestroyRef, inject, Injector, Service, signal } from '@angular/core';
import { Api } from '@mi-bolt/api/api';
import { HttpClient } from '@angular/common/http';
import { getPromotion } from '@mi-bolt/api/fn/catalog/get-promotion';
import type { Promotion } from '@mi-bolt/api/models/promotion';
import type { Money } from '@mi-bolt/api/models/money';
import { Subject, take } from 'rxjs';

/** Only wire-authoritative, valid, in-stock discounts can acquire sale styling. */
export function saleOriginal(
  value: {
    price: Money;
    originalPrice?: Money;
    promotion?: Promotion;
    availability?: string;
  } | null,
): Money | null {
  if (value === null || value.availability === 'out_of_stock' || value.promotion?.active !== true)
    return null;
  const original = value.originalPrice;
  const promotion = value.promotion;
  const now = Date.parse(promotion.serverNow);
  const start = Date.parse(promotion.startsAt ?? '');
  const end = Date.parse(promotion.endsAt ?? '');
  const originalCurrency: unknown = original?.currency;
  const currentCurrency: unknown = value.price.currency;
  return original !== undefined &&
    originalCurrency === 'HUF' &&
    currentCurrency === 'HUF' &&
    Number.isSafeInteger(original.amount) &&
    Number.isSafeInteger(value.price.amount) &&
    value.price.amount > 0 &&
    original.amount > value.price.amount &&
    start <= now &&
    now < end
    ? original
    : null;
}

/** Boundaries are scheduled relative to serverNow, never the browser's wall clock. */
@Service()
export class PromotionState {
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  readonly campaign = signal<Promotion | null>(null);
  readonly invalidated = signal(false);
  readonly active = computed(() => {
    const value = this.campaign();
    return (
      value?.active === true &&
      Date.parse(value.startsAt ?? '') <= Date.parse(value.serverNow) &&
      Date.parse(value.serverNow) < Date.parse(value.endsAt ?? '')
    );
  });
  readonly refreshed = new Subject<void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private started = false;

  constructor() {
    const resume = (): void => {
      if (this.started && document.visibilityState === 'visible') this.refresh();
    };
    document.addEventListener('visibilitychange', resume);
    this.destroyRef.onDestroy(() => {
      clearTimeout(this.timer);
      document.removeEventListener('visibilitychange', resume);
      this.refreshed.complete();
    });
  }

  start(): void {
    if (this.started) return;
    if (this.injector.get(HttpClient, null) === null) return;
    this.started = true;
    this.load(false);
  }

  refresh(): void {
    this.load(true);
  }

  private load(notify: boolean): void {
    const generation = ++this.generation;
    clearTimeout(this.timer);
    this.injector
      .get(Api)
      .invoke(getPromotion)
      .pipe(take(1))
      .subscribe({
        next: (campaign) => {
          if (generation !== this.generation) return;
          const now = Date.parse(campaign.serverNow);
          const start = Date.parse(campaign.startsAt ?? '');
          const end = Date.parse(campaign.endsAt ?? '');
          const valid =
            Number.isFinite(now) && start < end && (campaign.text?.trim().length ?? 0) > 0;
          this.campaign.set(valid ? campaign : null);
          this.invalidated.set(!this.active());
          if (notify) this.refreshed.next();
          const boundary = start > now ? start : end > now ? end : null;
          if (valid && boundary !== null) {
            this.timer = setTimeout(
              () => {
                this.campaign.set(null);
                this.invalidated.set(true);
                this.refresh();
              },
              Math.min(boundary - now, 2_147_483_647),
            );
          }
        },
        error: () => {
          if (generation !== this.generation) return;
          this.campaign.set(null);
          this.invalidated.set(true);
          if (notify) this.refreshed.next();
        },
      });
  }
}
