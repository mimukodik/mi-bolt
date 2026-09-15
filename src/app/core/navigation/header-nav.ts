import { Component, computed, inject, input, signal, viewChild, type ElementRef } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';

import { CartCountFacade } from './cart-count-facade';
import { MobileDrawer } from './mobile-drawer';

/**
 * Variant of the global header rendered by `AppShell`.
 *
 * - `marketing` and `shop` use the full navigation: brand left, primary
 *   links (Mobiltelefonok, A demóról) center, search + cart right. The
 *   `shop` variant additionally exposes a full-width mobile search bar
 *   below the header at narrow widths.
 * - `checkout` uses the compact dark header required by the purchase
 *   flow (R02 variant): no search, "Demó pénztár" label and a single
 *   "Vissza a shopba" link. Mobile drawer is disabled.
 */
export type HeaderVariant = 'marketing' | 'shop' | 'checkout';

interface NavLink {
  readonly label: string;
  readonly routerLink: string;
  readonly fragment?: string;
}

const STANDARD_LINKS: ReadonlyArray<NavLink> = [
  { label: 'Mobiltelefonok', routerLink: '/telefonok' },
  { label: 'A demóról', routerLink: '/', fragment: 'demo' },
];

@Component({
  selector: 'app-header-nav',
  imports: [RouterLink, RouterLinkActive, MobileDrawer],
  template: `
    @if (variant() === 'checkout') {
      <header
        class="header header--checkout"
        data-testid="checkout-header"
        role="banner"
      >
        <div class="header__inner">
          <a routerLink="/" class="brand" aria-label="MiBolt kezdőlap">
            <span class="brand__mark" aria-hidden="true">M</span>
            <span class="brand__word">MiBolt</span>
          </a>
          <span class="header__label" aria-label="Demó pénztár">Demó pénztár</span>
          <a
            routerLink="/telefonok"
            class="header__back"
            data-testid="back-to-shop"
          >Vissza a shopba</a>
        </div>
      </header>
    } @else {
      <header
        class="header header--default"
        data-testid="main-header"
        role="banner"
      >
        <div class="header__inner">
          <a routerLink="/" class="brand" aria-label="MiBolt kezdőlap">
            <span class="brand__mark" aria-hidden="true">M</span>
            <span class="brand__word">MiBolt</span>
          </a>
          <nav class="header__nav" aria-label="Fő navigáció">
            @for (link of navLinks(); track link.label) {
              <a
                [routerLink]="link.routerLink"
                [fragment]="link.fragment"
                routerLinkActive="is-active"
                [routerLinkActiveOptions]="link.routerLink === '/' ? { exact: true } : { exact: false }"
              >{{ link.label }}</a>
            }
          </nav>
          <div class="header__actions">
            <label class="header__search" data-testid="header-search">
              <span class="sr-only">Keresés a telefonok között</span>
              <input
                type="search"
                name="q"
                placeholder="Keresés…"
                autocomplete="off"
                inputmode="search"
                data-testid="header-search-input"
                [value]="searchDraft()"
                (input)="onSearchDraftInput($event)"
                (keydown.enter)="commitSearch()"
              />
            </label>
            <a
              routerLink="/penztar/kosar"
              class="cart"
              [attr.aria-label]="cartLabel()"
              data-testid="cart-link"
            >
              <span class="cart__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24" focusable="false" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M7 4h-2l-1 2v1h2l3.6 7.59-1.35 2.45A2 2 0 0 0 10 20h10v-2H10.4l1.1-2H18a2 2 0 0 0 1.8-1.11l3.6-6.49L22.4 7H7.21l-.94-2H7Zm3 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"
                  />
                </svg>
              </span>
              <span class="cart__label">Kosár</span>
              @if (cartFacade.itemCount() > 0) {
                <span class="cart__badge" data-testid="cart-badge" aria-hidden="true">
                  {{ cartFacade.itemCount() }}
                </span>
              } @else {
                <span class="cart__badge" data-testid="cart-badge" aria-hidden="true">0</span>
              }
            </a>
            <button
              #menuTrigger
              type="button"
              class="menu-trigger"
              [attr.aria-expanded]="drawerOpen()"
              aria-controls="mobile-drawer"
              aria-label="Menü megnyitása"
              data-testid="menu-trigger"
              (click)="toggleDrawer()"
            >☰</button>
          </div>
        </div>
        @if (variant() === 'shop') {
          <div class="mobile-search" data-testid="mobile-search" role="search">
            <label class="mobile-search__field">
              <span class="sr-only">Keresés a telefonok között</span>
              <input
                type="search"
                name="q-mobile"
                placeholder="Keresés a telefonok között…"
                autocomplete="off"
                inputmode="search"
                data-testid="mobile-search-input"
                [value]="searchDraft()"
                (input)="onSearchDraftInput($event)"
                (keydown.enter)="commitSearch()"
              />
            </label>
          </div>
        }
      </header>
      <app-mobile-drawer
        id="mobile-drawer"
        [opened]="drawerOpen()"
        label="Menü"
        [triggerEl]="menuTriggerEl()"
        (closed)="closeDrawer()"
      >
        @for (link of navLinks(); track link.label) {
          <a
            [routerLink]="link.routerLink"
            [fragment]="link.fragment"
            (click)="closeDrawer()"
          >{{ link.label }}</a>
        }
      </app-mobile-drawer>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .header {
        background: var(--color-shell-dark);
        color: var(--color-text-inverse);
        border-bottom: 1px solid #2c333a;
        position: sticky;
        top: 0;
        z-index: 50;
      }

      .header--checkout {
        padding: 0;
      }

      .header__inner {
        display: flex;
        align-items: center;
        gap: var(--space-4);
        min-height: 64px;
        padding: var(--space-2) var(--layout-gutter-mobile);
        max-width: var(--layout-container-max);
        margin: 0 auto;
      }

      .brand {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        color: var(--color-text-inverse);
        text-decoration: none;
        min-height: var(--size-control);
      }

      .brand__mark {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        font-weight: var(--weight-bold);
        border-radius: var(--radius-control);
      }

      .brand__word {
        font-weight: var(--weight-bold);
        font-size: var(--type-card-title);
        letter-spacing: 0.02em;
      }

      .header__nav {
        display: none;
        gap: var(--space-4);
        flex: 1 1 auto;
        justify-content: center;
      }

      .header__nav a {
        color: var(--color-text-inverse);
        text-decoration: none;
        padding: var(--space-2) var(--space-3);
        border-radius: var(--radius-control);
        min-height: var(--size-control);
        display: inline-flex;
        align-items: center;
        font-size: var(--type-body);
      }

      .header__nav a:hover,
      .header__nav a:focus-visible {
        color: var(--color-text-inverse);
        text-decoration: underline;
        text-underline-offset: 6px;
      }

      .header__nav a.is-active {
        text-decoration: underline;
        text-decoration-color: var(--color-brand-accent);
        text-decoration-thickness: 3px;
        text-underline-offset: 6px;
      }

      .header__actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        margin-left: auto;
      }

      .header__search {
        display: none;
        align-items: center;
        background: #2c333a;
        border-radius: var(--radius-control);
        padding: 0 var(--space-3);
        min-height: var(--size-control);
      }

      .header__search input {
        background: transparent;
        border: none;
        color: var(--color-text-inverse);
        outline: none;
        min-width: 200px;
        font: inherit;
        height: var(--size-control);
      }

      .header__search input::placeholder {
        color: var(--color-text-inverse-muted);
      }

      .cart {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        color: var(--color-text-inverse);
        text-decoration: none;
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        border-radius: var(--radius-control);
      }

      .cart:hover,
      .cart:focus-visible {
        background: #2c333a;
      }

      .cart__icon {
        display: inline-flex;
      }

      .cart__label {
        display: none;
        font-size: var(--type-body);
      }

      .cart__badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 24px;
        height: 24px;
        padding: 0 var(--space-1);
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        font-size: var(--type-meta);
        font-weight: var(--weight-bold);
        border-radius: var(--radius-badge);
      }

      .menu-trigger {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: var(--size-control);
        height: var(--size-control);
        border-radius: var(--radius-control);
        border: 1px solid transparent;
        background: transparent;
        color: var(--color-text-inverse);
        font-size: 1.25rem;
        cursor: pointer;
      }

      .menu-trigger:hover {
        background: #2c333a;
      }

      .menu-trigger:focus-visible {
        outline: 2px solid var(--color-focus-dark);
        outline-offset: 2px;
      }

      .mobile-search {
        display: block;
        padding: var(--space-2) var(--layout-gutter-mobile) var(--space-3);
        background: var(--color-shell-dark);
        border-top: 1px solid #2c333a;
      }

      .mobile-search__field {
        display: block;
      }

      .mobile-search input {
        width: 100%;
        min-height: var(--size-control);
        padding: 0 var(--space-3);
        background: #2c333a;
        border: 1px solid transparent;
        color: var(--color-text-inverse);
        border-radius: var(--radius-control);
        font: inherit;
      }

      .mobile-search input::placeholder {
        color: var(--color-text-inverse-muted);
      }

      .mobile-search input:focus-visible {
        outline: 2px solid var(--color-focus-dark);
        outline-offset: 2px;
      }

      .header--checkout .header__inner {
        justify-content: space-between;
      }

      .header__label {
        color: var(--color-text-inverse-muted);
        font-size: var(--type-helper);
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .header__back {
        color: var(--color-text-inverse);
        text-decoration: none;
        padding: var(--space-2) var(--space-3);
        min-height: var(--size-control);
        display: inline-flex;
        align-items: center;
        border-radius: var(--radius-control);
        border: 1px solid var(--color-brand-accent);
        font-size: var(--type-body);
      }

      .header__back:hover,
      .header__back:focus-visible {
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        outline: none;
      }

      @media (min-width: 1024px) {
        .header__inner {
          padding: var(--space-2) var(--layout-gutter-desktop);
          gap: var(--space-6);
        }

        .header__nav {
          display: flex;
        }

        .header__search {
          display: flex;
        }

        .cart__label {
          display: inline;
        }

        .menu-trigger {
          display: none;
        }

        .mobile-search {
          display: none;
        }
      }

      @media (max-width: 640px) {
        .header--default .mobile-search {
          display: block;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .header,
        .cart,
        .menu-trigger,
        .header__nav a,
        .header__back {
          transition: none;
        }
      }

      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
    `,
  ],
})
export class HeaderNav {
  /** Variant decides which chrome the header exposes. */
  readonly variant = input<HeaderVariant>('marketing');

  /** Cart line-item total signal — provided in root by `CartCountFacade`. */
  readonly cartFacade = inject(CartCountFacade);

  /** Router instance — used to send the header search to the catalog page. */
  private readonly router = inject(Router);

  /** Mobile drawer open state. */
  readonly drawerOpen = signal(false);

  /** Current draft of the header search input. Submitted to the
   *  catalog on Enter; cleared after a successful navigation so a
   *  second query does not see stale text. */
  readonly searchDraft = signal<string>('');

  /** Reference to the menu trigger button for focus restoration. */
  private readonly menuTriggerRef = viewChild<ElementRef<HTMLElement>>('menuTrigger');

  /** Stable trigger element handle that the drawer can read after view init. */
  readonly menuTriggerEl = computed<HTMLElement | null>(() => {
    this.drawerOpen();
    return this.menuTriggerRef()?.nativeElement ?? null;
  });

  /** Links rendered in the nav and the mobile drawer. */
  readonly navLinks = computed<ReadonlyArray<NavLink>>(() => {
    if (this.variant() === 'checkout') return [];
    return STANDARD_LINKS;
  });

  /** Accessible label for the cart link, formatted in Hungarian. */
  readonly cartLabel = computed(() => {
    const n = this.cartFacade.itemCount();
    if (n === 0) return 'Kosár megnyitása, jelenleg üres';
    if (n === 1) return 'Kosár megnyitása, 1 termék';
    return `Kosár megnyitása, ${n} termék`;
  });

  toggleDrawer(): void {
    this.drawerOpen.update((open) => !open);
  }

  closeDrawer(): void {
    this.drawerOpen.set(false);
  }

  /** Capture the typed search value into the draft signal. */
  onSearchDraftInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (target === null) return;
    this.searchDraft.set(target.value);
  }

  /** Submit the search draft to the catalog route. Empty drafts are
   *  ignored so the user can blur the input without leaving the page. */
  commitSearch(): void {
    const q = this.searchDraft().trim();
    if (q.length === 0) return;
    void this.router.navigate(['/telefonok'], { queryParams: { q } });
    this.searchDraft.set('');
  }
}
