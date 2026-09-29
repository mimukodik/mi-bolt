import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-promotion-banner',
  imports: [RouterLink],
  template: `
    <a class="promotion-banner" routerLink="/telefonok" [queryParams]="{ promotion: true }">
      <span aria-hidden="true" class="promotion-banner__tree">🎄</span>
      <span>Válaszd ki kedvenc adventi ajánlatodat!</span>
      <span aria-hidden="true" class="promotion-banner__arrow">→</span>
    </a>
  `,
  styles: `
    :host {
      display: block;
      background: var(--color-surface-light);
      padding: var(--space-5) var(--space-4) 0;
    }
    .promotion-banner {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      max-width: 1200px;
      min-height: 64px;
      margin: 0 auto;
      padding: var(--space-3) var(--space-5);
      border: 2px solid #176b3a;
      border-radius: 8px;
      background: #eef8f1;
      color: #104f2c;
      font-family: var(--font-family-bold);
      font-size: clamp(1rem, 2.4vw, 1.25rem);
      text-align: center;
      text-decoration: none;
    }
    .promotion-banner:hover,
    .promotion-banner:focus-visible {
      background: #dff2e5;
      text-decoration: underline;
    }
    .promotion-banner__tree {
      font-size: 1.75rem;
    }
    .promotion-banner__arrow {
      font-size: 1.5rem;
    }
    @media (max-width: 390px) {
      :host {
        padding-inline: var(--space-3);
      }
      .promotion-banner {
        justify-content: flex-start;
        padding-inline: var(--space-3);
        text-align: left;
      }
    }
  `,
})
export class PromotionBanner {}
