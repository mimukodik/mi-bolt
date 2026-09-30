import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PromotionState } from '../../core/promotion';
import { HalloweenDecoration } from '../ui/halloween-decoration';

@Component({
  selector: 'app-promotion-banner',
  imports: [HalloweenDecoration],
  template: `
    @if (promotion.active()) {
      <section aria-label="Halloween-akció" class="promotion">
        <div class="decoration">
          <app-halloween-decoration class="moon" kind="moon" /><app-halloween-decoration
            class="bat bat--small"
            kind="bat"
          />
        </div>
        <div class="copy">
          <button type="button" (click)="openOffers()">{{ promotion.campaign()?.text }}</button>
          @if (promotion.campaign()?.endsAt; as end) {
            <p>{{ expiry(end) }} · magyar idő (Europe/Budapest)</p>
          }
        </div>
        <app-halloween-decoration class="bat bat--large" kind="bat" />
      </section>
    }
  `,
  styles: `
    .promotion {
      background: #2d124c;
      color: #ffad5c;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 24px;
      padding: 12px 24px;
    }
    .decoration {
      display: flex;
      align-items: center;
      gap: 16px;
      flex-shrink: 0;
    }
    .moon {
      width: 96px;
      height: 96px;
    }
    .bat--small {
      width: 54px;
      height: 54px;
    }
    .bat--large {
      width: 108px;
      height: 80px;
    }
    .copy {
      text-align: center;
      min-width: 0;
    }
    button {
      color: inherit;
      font: inherit;
      font-weight: 700;
      font-size: 20px;
      background: transparent;
      border: 0;
      padding: 8px;
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 5px;
    }
    button:focus-visible {
      outline: 2px solid #ffad5c;
      outline-offset: 4px;
    }
    p {
      color: inherit;
      font-size: 12px;
      margin: 8px 0 0;
    }
    @media (max-width: 767px) {
      .promotion {
        flex-wrap: wrap;
        gap: 8px;
        padding: 12px 16px;
      }
      .decoration {
        width: 100%;
        justify-content: center;
        gap: 24px;
      }
      .moon {
        width: 60px;
        height: 60px;
      }
      .bat--small {
        width: 78px;
        height: 54px;
      }
      .bat--large {
        width: 45px;
        height: 35px;
      }
      .copy {
        width: 100%;
      }
      button {
        font-size: 18px;
        line-height: 1.5;
      }
    }
  `,
})
export class PromotionBanner {
  readonly promotion = inject(PromotionState);
  private readonly router = inject(Router);
  openOffers(): void {
    void this.router.navigate(['/telefonok'], {
      queryParams: { onPromotion: true, page: null, variant: null },
      queryParamsHandling: 'merge',
    });
  }
  expiry(value: string): string {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return `Érvényes: ${new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', dateStyle: 'short', timeStyle: 'short' }).format(date)}-ig`;
  }
}
