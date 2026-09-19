import {
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive } from '@angular/router';

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

const STANDARD_LINKS: readonly NavLink[] = [
  { label: 'Mobiltelefonok', routerLink: '/telefonok' },
  { label: 'A demóról', routerLink: '/', fragment: 'demo' },
];

@Component({
  selector: 'app-header-nav',
  imports: [RouterLink, RouterLinkActive, MobileDrawer],
  templateUrl: './header-nav.html',
  styleUrl: './header-nav.scss',
})
export class HeaderNav {
  /** Variant decides which chrome the header exposes. */
  readonly variant = input<HeaderVariant>('marketing');

  /** Cart line-item total signal — provided in root by `CartCountFacade`. */
  readonly cartFacade = inject(CartCountFacade);

  /** Router instance — used to send the header search to the catalog page. */
  private readonly router = inject(Router);

  /** Active route — used to mirror the header search input to the URL. */
  private readonly route = inject(ActivatedRoute);

  private readonly destroyRef = inject(DestroyRef);

  /** Mobile drawer open state. */
  readonly drawerOpen = signal(false);

  /** Current value of the header search input. It mirrors the URL's `q`
   *  parameter rather than holding local state, so clearing the filters
   *  on the catalogue also clears the box (R18). */
  readonly searchDraft = signal<string>('');

  constructor() {
    // The URL owns the active query; the input mirrors it, so clearing
    // the filters on the catalogue also clears the box (R18).
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.searchDraft.set(params.get('q') ?? '');
    });
  }

  /** Reference to the menu trigger button for focus restoration. */
  private readonly menuTriggerRef = viewChild<ElementRef<HTMLElement>>('menuTrigger');

  /** Stable trigger element handle that the drawer can read after view init. */
  readonly menuTriggerEl = computed<HTMLElement | null>(() => {
    this.drawerOpen();
    return this.menuTriggerRef()?.nativeElement ?? null;
  });

  /** Links rendered in the nav and the mobile drawer. */
  readonly navLinks = computed<readonly NavLink[]>(() => {
    if (this.variant() === 'checkout') return [];
    return STANDARD_LINKS;
  });

  /** Accessible label for the cart link, formatted in Hungarian. */
  readonly cartLabel = computed(() => {
    const n = this.cartFacade.itemCount();
    if (n === 0) return 'Kosár megnyitása, jelenleg üres';
    if (n === 1) return 'Kosár megnyitása, 1 termék';
    return `Kosár megnyitása, ${String(n)} termék`;
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
  }
}
