import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * `Hero` — dark charcoal hero for the home page (S1).
 *
 * Layout contract:
 *   - Mobile (default) content order: heading, message, CTA,
 *     illustration, shortcuts. Verified by T14-AC05.
 *   - Desktop: two columns — copy left, illustration right; the
 *     shortcuts stay below in their own row so the visual order
 *     remains identical to the mobile source order.
 *
 * Visual contract:
 *   - R02: dark hero only on a marketing page.
 *   - R03: orange accent + charcoal text + neutral surfaces.
 *   - R06: 8 px spacing rhythm, 8 px card radius, 6 px control radius.
 *   - R08: one prominent primary action; secondary shortcuts restrained.
 *   - R10/R11: no functional text inside the decorative SVG.
 *   - R12: Hungarian copy with correct accents.
 *   - R21: every interactive element meets the 44×44 CSS px target.
 *
 * The CTA is live Hungarian text inside an anchor, never an image
 * (R10). The SVG illustration is `aria-hidden` and contains no
 * readable copy. Shortcuts render as `<a>` elements with the 44 px
 * control height token and a visible focus ring.
 */
@Component({
  selector: 'app-hero',
  imports: [RouterLink],
  template: `
    <section class="hero" data-testid="hero-section" aria-labelledby="hero-heading">
      <div class="hero__inner">
        <h1 id="hero-heading" class="hero__title" data-testid="hero-heading">
          Mobiltelefonok a MiBolt demóban
        </h1>
        <p class="hero__message" data-testid="hero-message">
          Böngéssz a készülékek között, állítsd össze a kosarad és próbáld ki a szimulált
          rendelést — mindezt valódi vásárlás nélkül.
        </p>
        <div class="hero__cta-row" data-testid="hero-cta-row">
          <a
            routerLink="/telefonok"
            class="hero__cta"
            data-testid="hero-cta"
          >Telefonok böngészése</a>
        </div>
        <div
          class="hero__illustration"
          data-testid="hero-illustration"
          aria-hidden="true"
        >
          <svg
            class="hero__art"
            viewBox="0 0 320 240"
            width="320"
            height="240"
            focusable="false"
          >
            <defs>
              <linearGradient id="hero-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#FF6A00" stop-opacity="0.18" />
                <stop offset="100%" stop-color="#FF6A00" stop-opacity="0" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width="320" height="240" fill="url(#hero-grad)" />
            <rect
              x="120"
              y="40"
              width="80"
              height="160"
              rx="14"
              fill="#FF6A00"
              opacity="0.95"
            />
            <rect
              x="132"
              y="56"
              width="56"
              height="112"
              rx="6"
              fill="#1B2024"
              opacity="0.85"
            />
            <circle cx="160" cy="184" r="4" fill="#1B2024" opacity="0.7" />
            <rect
              x="40"
              y="60"
              width="56"
              height="14"
              rx="4"
              fill="#FF6A00"
              opacity="0.55"
            />
            <rect
              x="40"
              y="82"
              width="40"
              height="10"
              rx="4"
              fill="#FF6A00"
              opacity="0.35"
            />
            <rect
              x="232"
              y="120"
              width="48"
              height="12"
              rx="4"
              fill="#FF6A00"
              opacity="0.55"
            />
            <rect
              x="232"
              y="140"
              width="32"
              height="10"
              rx="4"
              fill="#FF6A00"
              opacity="0.35"
            />
          </svg>
        </div>
        <nav
          class="hero__shortcuts"
          data-testid="hero-shortcuts"
          aria-label="Gyors szűrők a katalógusban"
        >
          <a
            routerLink="/telefonok?is5g=true"
            class="hero__shortcut"
            data-testid="shortcut-5g"
          >5G készülékek</a>
          <a
            routerLink="/telefonok?inStock=true"
            class="hero__shortcut"
            data-testid="shortcut-instock"
          >Készleten</a>
          <a
            routerLink="/telefonok?is5g=true&inStock=true"
            class="hero__shortcut"
            data-testid="shortcut-5g-instock"
          >5G + készleten</a>
        </nav>
      </div>
    </section>
  `,
  styles: [
    `
      /* T14 — Hero (S1).
       *
       * Dark shell hero for the marketing entry screen. Layout contract:
       *   - mobile source order: heading, message, CTA, illustration, shortcuts
       *   - desktop: two columns + shortcuts in their own row
       * The DOM order is fixed; CSS only repositions on wide viewports so the
       * order assertion in T14-AC05 is meaningful.
       */

      .hero {
        background: var(--color-shell-dark);
        color: var(--color-text-inverse);
        padding: var(--space-9) var(--layout-gutter-mobile);
      }

      .hero__inner {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
        max-width: var(--layout-container-max);
        margin: 0 auto;
      }

      .hero__title {
        font-size: var(--type-page-title-mobile);
        line-height: var(--line-height-heading);
        font-weight: var(--weight-bold);
        color: var(--color-text-inverse);
        margin: 0;
        overflow-wrap: anywhere;
        hyphens: auto;
      }

      .hero__message {
        font-size: var(--type-body);
        line-height: var(--line-height-body);
        color: var(--color-text-inverse-muted);
        margin: 0;
        max-width: 56ch;
        overflow-wrap: anywhere;
      }

      .hero__cta-row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
      }

      .hero__cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: var(--size-control);
        padding: 0 var(--space-6);
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        font-size: var(--type-body);
        font-weight: var(--weight-bold);
        text-decoration: none;
        border-radius: var(--radius-control);
        border: 1px solid var(--color-brand-accent);
        transition: background-color var(--motion-fast) ease;
        min-width: 44px;
      }

      .hero__cta:hover {
        background: var(--color-brand-accent-hover);
      }

      .hero__cta:focus-visible {
        outline: 3px solid var(--color-focus-dark);
        outline-offset: 2px;
      }

      .hero__illustration {
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .hero__art {
        display: block;
        max-width: 100%;
        height: auto;
        width: 100%;
        max-width: 320px;
      }

      .hero__shortcuts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
        padding-top: var(--space-2);
      }

      .hero__shortcut {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: var(--size-control);
        padding: 0 var(--space-5);
        background: transparent;
        color: var(--color-text-inverse);
        font-size: var(--type-body);
        font-weight: var(--weight-medium);
        text-decoration: none;
        border-radius: var(--radius-control);
        border: 1px solid var(--color-text-inverse-muted);
        min-width: 44px;
        transition: background-color var(--motion-fast) ease, color var(--motion-fast) ease;
      }

      .hero__shortcut:hover {
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        border-color: var(--color-brand-accent);
      }

      .hero__shortcut:focus-visible {
        outline: 3px solid var(--color-focus-dark);
        outline-offset: 2px;
      }

      @media (min-width: 720px) {
        .hero {
          padding: var(--space-10) var(--layout-gutter-desktop);
        }

        .hero__title {
          font-size: var(--type-page-title);
        }

        .hero__inner {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          grid-template-areas:
            "heading  illustration"
            "message  illustration"
            "cta      illustration"
            "shortcuts shortcuts";
          column-gap: var(--space-8);
          row-gap: var(--space-6);
          align-items: start;
        }

        .hero__title {
          grid-area: heading;
        }

        .hero__message {
          grid-area: message;
        }

        .hero__cta-row {
          grid-area: cta;
        }

        .hero__illustration {
          grid-area: illustration;
          align-self: center;
        }

        .hero__shortcuts {
          grid-area: shortcuts;
          border-top: 1px solid #2a3035;
          padding-top: var(--space-5);
        }
      }
    `,
  ],
})
export class Hero {}
