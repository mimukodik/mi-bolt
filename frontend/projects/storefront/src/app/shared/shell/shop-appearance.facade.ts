import { DestroyRef, Service, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, retry, switchMap, tap } from 'rxjs';
import { Api } from '@mi-bolt/api/api';
import { getShopAppearance } from '@mi-bolt/api/fn/catalog/get-shop-appearance';
import { PriceRefresh } from '../utils/price-refresh';

/** Decoration has its own server-authoritative window, independent of product offers. */
@Service()
export class ShopAppearanceFacade {
  private readonly api = inject(Api);
  private readonly load = new Subject<void>();
  private readonly active = signal(false);
  readonly halloweenActive = this.active.asReadonly();
  private readonly refresh = new PriceRefresh(inject(DestroyRef), () => {
    this.load.next();
  });

  constructor() {
    this.load
      .pipe(
        switchMap(() =>
          this.api.invoke(getShopAppearance).pipe(
            tap({
              error: () => {
                this.active.set(false);
              },
            }),
            retry({ delay: 30_000 }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((appearance) => {
        this.active.set(appearance.halloweenActive);
        // Also discover admin edits while a tab stays open with no scheduled boundary.
        const pollAt = Date.parse(appearance.serverTime) + 30_000;
        const boundary = Date.parse(appearance.nextChangeAt ?? '');
        const next = Number.isFinite(boundary) ? Math.min(pollAt, boundary) : pollAt;
        this.refresh.schedule(appearance.serverTime, new Date(next).toISOString());
      });
    this.load.next();
  }
}
