import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * `HowDemoWorks` — three explanatory tiles for the home page.
 *
 * The copy only describes the demo flow (böngészés, kosár, szimulált
 * rendelés) and deliberately avoids any reference to tariffs,
 * internet, services, payments or bank cards (T14-AC04). The three
 * tiles map directly to the documented demo flow so users know
 * exactly what to do once they click the CTA.
 *
 * Each tile renders an icon-shaped SVG mark (decorative, no
 * functional text) and a heading + body in Hungarian with correct
 * accents (R12).
 */
interface TileCopy {
  readonly id: string;
  readonly title: string;
  readonly body: string;
}

const TILES: readonly TileCopy[] = [
  {
    id: 'how-tile-browse',
    title: 'Böngészés',
    body: 'Szűrj 5G-re, készletre vagy tárhelyre, és nézd meg a kiválasztott készülék részletes adatait.',
  },
  {
    id: 'how-tile-cart',
    title: 'Kosár',
    body: 'A kiválasztott variánst bármikor visszakeresheted a kosárban — a demó a munkameneted során megőrzi.',
  },
  {
    id: 'how-tile-order',
    title: 'Szimulált rendelés',
    body: 'A pénztár végigmegy a demó lépésein; a rendelés nem kerül valódi feldolgozásra, sem számlázásra.',
  },
];

@Component({
  selector: 'app-how-demo-works',
  template: `
    <section
      class="how"
      data-testid="how-demo-works"
      aria-labelledby="how-heading"
    >
      <div class="how__inner">
        <header class="how__header">
          <h2 id="how-heading" class="how__title">Hogyan működik a demó?</h2>
          <p class="how__lede">
            Három lépésben végigmégy a vásárlási folyamaton — valódi tranzakció nélkül.
          </p>
        </header>
        <ol class="how__grid" role="list">
          @for (tile of tiles; track tile.id) {
            <li class="how__tile" [attr.data-testid]="tile.id">
              <span class="how__icon" aria-hidden="true">
                @switch (tile.id) {
                  @case ('how-tile-browse') {
                    <svg viewBox="0 0 32 32" width="32" height="32" focusable="false">
                      <circle cx="14" cy="14" r="8" fill="none" stroke="currentColor" stroke-width="2" />
                      <line x1="20" y1="20" x2="27" y2="27" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
                    </svg>
                  }
                  @case ('how-tile-cart') {
                    <svg viewBox="0 0 32 32" width="32" height="32" focusable="false">
                      <path
                        d="M6 8h3l2.5 14h13l3-10H11"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                      <circle cx="14" cy="26" r="1.6" fill="currentColor" />
                      <circle cx="23" cy="26" r="1.6" fill="currentColor" />
                    </svg>
                  }
                  @case ('how-tile-order') {
                    <svg viewBox="0 0 32 32" width="32" height="32" focusable="false">
                      <rect
                        x="6"
                        y="6"
                        width="20"
                        height="20"
                        rx="3"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      />
                      <polyline
                        points="11,17 15,21 22,12"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                  }
                }
              </span>
              <h3 class="how__tile-title">{{ tile.title }}</h3>
              <p class="how__tile-body">{{ tile.body }}</p>
            </li>
          }
        </ol>
      </div>
    </section>
  `,
  styles: [
    `
      /* T14 — How the demo works (S1).
       *
       * Three explanatory tiles that describe browsing, cart and simulated
       * order. Light surface, restrained orange accent on the icon, no
       * mention of tariffs / internet / services / payments / bank cards.
       */

      .how {
        background: var(--color-surface-section);
        color: var(--color-text-primary);
        padding: var(--space-9) var(--layout-gutter-mobile);
      }

      .how__inner {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
        max-width: var(--layout-container-max);
        margin: 0 auto;
      }

      .how__header {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .how__title {
        font-size: var(--type-section-title-mobile);
        line-height: var(--line-height-heading);
        font-weight: var(--weight-bold);
        color: var(--color-text-primary);
        margin: 0;
        overflow-wrap: anywhere;
      }

      .how__lede {
        font-size: var(--type-body);
        line-height: var(--line-height-body);
        color: var(--color-text-secondary);
        margin: 0;
        max-width: 64ch;
        overflow-wrap: anywhere;
      }

      .how__grid {
        list-style: none;
        margin: 0;
        padding: 0;
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-4);
        counter-reset: how;
      }

      .how__tile {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-6);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
      }

      .how__icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--size-icon-large);
        height: var(--size-icon-large);
        color: var(--color-brand-accent);
      }

      .how__tile-title {
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        margin: 0;
        color: var(--color-text-primary);
        overflow-wrap: anywhere;
      }

      .how__tile-body {
        font-size: var(--type-body);
        line-height: var(--line-height-body);
        margin: 0;
        color: var(--color-text-secondary);
        overflow-wrap: anywhere;
      }

      @media (min-width: 720px) {
        .how {
          padding: var(--space-10) var(--layout-gutter-desktop);
        }

        .how__title {
          font-size: var(--type-section-title);
        }

        .how__grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HowDemoWorks {
  readonly tiles = TILES;
}
