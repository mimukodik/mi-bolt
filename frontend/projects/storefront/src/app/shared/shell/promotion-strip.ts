import { HttpContext } from '@angular/common/http';
import { PROMOTION_PROBE } from '../../core/price-cache.interceptor';
import { Component, DestroyRef, effect, inject, signal, viewChild } from '@angular/core';
import type { ElementRef } from '@angular/core';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import { Api } from '@mi-bolt/api/api';
import { listProducts } from '@mi-bolt/api/fn/catalog/list-products';
import { PriceRefresh } from '../utils/price-refresh';
import { ShopAppearanceFacade } from './shop-appearance.facade';
import { promotionMotion } from '../halloween/promotion-motion';

@Component({
  selector: 'app-promotion-strip',
  imports: [RouterLink],
  templateUrl: './promotion-strip.html',
  host: { class: 'sm sm--deco sm--desktop' },
  styles: `
    .promotion-strip {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: nowrap;
      gap: 8px;
      background: #2e1065;
      color: #fff;
      padding: 14px 16px;
      font-size: 15px;
      font-weight: 700;
      text-align: center;
      text-decoration: none;
      border-bottom: 3px solid #ff7a1a;
    }
    .promotion-strip > span {
      flex: none;
    }
    .promotion-strip > .promotion-message {
      flex: 0 1 auto;
      min-width: 0;
    }
    .sm-bar__icon {
      width: 28px;
      height: 28px;
    }
    .sm-pumpkin {
      width: 100%;
      height: 100%;
      fill: #ff7a1a;
    }
    .promotion-strip:hover {
      background: #3b1a80;
    }
  `,
})
export class PromotionStrip {
  private readonly api = inject(Api);
  private readonly refresh = new PriceRefresh(inject(DestroyRef), () => {
    this.load();
  });
  protected readonly active = signal(false);
  private readonly appearance = inject(ShopAppearanceFacade);
  private readonly promotionLink = viewChild<ElementRef<HTMLAnchorElement>>('promotionLink');

  constructor() {
    effect((onCleanup) => {
      const bar = this.promotionLink()?.nativeElement;
      const themed = this.appearance.halloweenActive();
      if (bar === undefined || !themed || typeof bar.animate !== 'function') return;
      const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
      if (preference.matches) return;
      const stop = promotionMotion(bar);
      const changed = (): void => {
        if (preference.matches) stop();
      };
      preference.addEventListener('change', changed);
      onCleanup(() => {
        stop();
        preference.removeEventListener('change', changed);
      });
    });
    this.load();
  }

  private load(): void {
    this.api
      .invoke(
        listProducts,
        { activePromotion: true, pageSize: 12 },
        new HttpContext().set(PROMOTION_PROBE, true),
      )
      .pipe(take(1))
      .subscribe({
        next: (page) => {
          this.active.set(page.total > 0);
          this.refresh.schedule(page.serverTime, page.nextPriceChangeAt);
        },
        error: () => {
          this.active.set(false);
        },
      });
  }
}
