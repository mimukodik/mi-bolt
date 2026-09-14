import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, computed, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

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
  styleUrl: './header-nav.css',
})
export class HeaderNav {
  /** Variant decides which chrome the header exposes. */
  readonly variant = input<HeaderVariant>('marketing');

  /** Cart line-item total signal — provided in root by `CartCountFacade`. */
  readonly cartFacade = inject(CartCountFacade);

  /** Mobile drawer open state. */
  readonly drawerOpen = signal(false);

  /** Reference to the menu trigger button for focus restoration. */
  private readonly menuTriggerRef = ViewChild('menuTrigger');

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
}
