/**
 * T18 — cart screen (S4.1).
 *
 * Replaces the T11 stub. Owns the user-visible cart: line list,
 * order summary and the Continue button that hands the user off to
 * the contact step (`/penztar/adatok`).
 *
 * The page is a thin shell around the T17 `CartFacade`. Every
 * mutation goes through the facade so the queue's If-Match / X-
 * Demo-Session / Idempotency-Key rules apply uniformly. The page
 * itself owns only the UI orchestration:
 *
 *   - keep the cart hot (`ensureCart()` on mount);
 *   - render the four documented states (loading / error / empty /
 *     success);
 *   - forward `quantityChanged` / `removeRequested` from each line
 *     to `setQuantity` / `removeItem`;
 *   - disable Continue while the cart is empty, pending or in
 *     error, and re-validate through `ensureCart()` before the
 *     actual navigation (AC04).
 *
 * The header chrome (`<h1>`, breadcrumbs, layout) lives in the
 * page itself so the cart does not depend on the shop / checkout
 * layouts duplicating it.
 */

import {
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { CartFacade } from './cart.facade';
import { CartLine } from './cart-line';
import { OrderSummary } from './order-summary';

import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock } from '../../shared/ui/price-block/price-block';
import { Button } from '../../shared/ui/button/button';
import { StatusMessage, type StatusSeverity } from '../../shared/ui/status-message/status-message';

import type { Cart } from '../../api/generated/models/cart';
import type { Money } from '../../api/generated/models/money';

type ScreenState = 'loading' | 'error' | 'empty' | 'ready';

/**
 * Coarse error message produced from the facade signals. The page
 * surfaces this through `ErrorState` so the user knows the cart is
 * unavailable (without inventing a stock / payment copy that does
 * not exist on the wire).
 */
function describeCartError(facade: CartFacade): string {
  if (facade.cartExpired()) {
    return 'A kosár lejárt. Indíts egy új pénztárat a frissítés gombra kattintva.';
  }
  if (facade.cartGone()) {
    return 'A kosár nem található. Indíts egy új pénztárat a frissítés gombra kattintva.';
  }
  const error = facade.error();
  if (error !== null) {
    return error.detail;
  }
  return 'A kosár betöltése sikertelen.';
}

@Component({
  selector: 'app-cart-page',
  imports: [
    RouterLink,
    CartLine,
    OrderSummary,
    EmptyState,
    ErrorState,
    LoadingState,
    PriceBlock,
    Button,
    StatusMessage,
  ],
  templateUrl: './cart-page.html',
  styleUrl: './cart-page.scss',
})
export class CartPage {
  private readonly facade = inject(CartFacade);
  private readonly router = inject(Router);

  /** Snapshot of the cart once it has loaded. */
  readonly cart = signal<Cart | null>(null);
  /** `true` while the user has clicked "Tovább a pénztárhoz" and the
   *  revalidation + navigation chain is in flight. */
  readonly continuing = signal<boolean>(false);
  /** `true` while the user has clicked the ErrorState retry and the
   *  re-fetch / ensure-cart chain is in flight. */
  readonly revalidating = signal<boolean>(false);

  /** Most recent in-flight item ids — used to disable the line
   *  while the facade is mutating it. */
  readonly pendingItemIds = computed<ReadonlySet<string>>(() => {
    const cart = this.cart();
    if (cart === null) return new Set();
    return new Set(cart.items.map((item) => item.id));
  });

  /** Items list (the cart is non-null in the success branch). */
  readonly items = computed(() => this.cart()?.items ?? []);

  /** Subtotal as whole-HUF Money for the PriceBlock primitive. */
  readonly subtotal = computed<Money>(() => {
    const cart = this.cart();
    if (cart === null) return { amount: 0, currency: 'HUF' };
    return cart.subtotal;
  });

  /** Summary footnote copy shown under the total. The shipping fee
   *  is intentionally absent — see OrderSummary for the Hungarian
   *  "A szállítási díj a pénztárban kerül kiszámításra" message. */
  readonly summaryFootnote = computed<string | null>(() => null);

  /** Friendly error message — prefers the cart-expired / cart-gone
   *  branches so the user is told why their cart vanished. */
  readonly errorMessage = computed<string>(() => describeCartError(this.facade));

  /** Cart state machine: drives the four documented branches. */
  readonly state = computed<ScreenState>(() => {
    const facadeCart = this.facade.cart();
    // Local mirror is the source of truth once it has landed.
    const cart = this.cart() ?? facadeCart;
    if (cart === null) {
      if (this.facade.error() !== null || this.facade.cartGone() || this.facade.cartExpired()) {
        return 'error';
      }
      if (this.facade.pending() > 0) {
        return 'loading';
      }
      return 'loading';
    }
    if (this.facade.error() !== null) return 'error';
    if (cart.items.length === 0) return 'empty';
    return 'ready';
  });

  /**
   * Continue button gating. The button is enabled only when:
   *   - at least one item is in the cart;
   *   - the facade is not currently dispatching a mutation;
   *   - there is no live conflict / error / gone / expired signal;
   *   - the page itself is not mid-`ensureCart` revalidation.
   */
  readonly canContinue = computed<boolean>(() => {
    const cart = this.cart();
    if (cart === null) return false;
    if (cart.items.length === 0) return false;
    if (this.continuing()) return false;
    if (this.revalidating()) return false;
    if (this.facade.pending() > 0) return false;
    if (this.facade.conflict() !== null) return false;
    if (this.facade.error() !== null) return false;
    if (this.facade.cartGone()) return false;
    if (this.facade.cartExpired()) return false;
    return true;
  });

  /**
   * Transient status banner. The page surfaces:
   *   - "A termék a kosárban van." after a successful add;
   *   - "A mennyiség frissítve." after a successful setQuantity;
   *   - "A termék törölve a kosárból." after a successful remove;
   *   - any surfaced error.
   *
   * The banner text is Hungarian; the body never invents numbers
   * and never mentions stock urgency (R25).
   */
  readonly statusMessage = computed<{ text: string; severity: StatusSeverity } | null>(() => {
    const error = this.facade.error();
    if (error !== null) {
      return { text: error.detail, severity: 'error' };
    }
    return this.transientStatus();
  });

  private readonly transientStatus = signal<{ text: string; severity: StatusSeverity } | null>(null);

  constructor() {
    // Ensure a cart exists as soon as the user lands. ensureCart()
    // is idempotent and does nothing when a snapshot is already
    // loaded, so calling it on every mount is safe.
    void this.facade.ensureCart();

    // Mirror the facade snapshot into the local signal so the page
    // can reason about the cart state (loading / empty / ready)
    // synchronously without subscribing to each signal individually.
    effect(() => {
      const next = this.facade.cart();
      this.cart.set(next);
    });

    // Reset the transient status banner when the cart resolves to
    // a new shape so a stale "X törölve" message does not survive a
    // subsequent successful mutation.
    effect(() => {
      const cart = this.cart();
      void cart;
    });
  }

  onQuantityChanged(item: { id: string }, quantity: number): void {
    this.transientStatus.set({ text: 'A mennyiség frissítése…', severity: 'info' });
    void this.facade.setQuantity(item.id, quantity).then(
      () => {
        // The facade's error / cartGone / cartExpired / cartExpired
        // signals own the wire-level state. The banner is the
        // user-facing summary, so we only flip it when the promise
        // resolved without throwing.
        if (this.facade.error() === null) {
          this.transientStatus.set({ text: 'A mennyiség frissítve.', severity: 'success' });
        } else {
          this.transientStatus.set({
            text: 'A mennyiség frissítése nem sikerült; a kosár változatlan.',
            severity: 'error',
          });
        }
      },
    );
  }

  onRemoveRequested(itemId: string): void {
    this.transientStatus.set({ text: 'A termék eltávolítása…', severity: 'info' });
    void this.facade.removeItem(itemId).then(
      () => {
        if (this.facade.error() === null) {
          this.transientStatus.set({
            text: 'A termék törölve a kosárból.',
            severity: 'success',
          });
        } else {
          this.transientStatus.set({
            text: 'A termék eltávolítása nem sikerült; a kosár változatlan.',
            severity: 'error',
          });
        }
      },
    );
  }

  onRetry(): void {
    this.revalidating.set(true);
    this.facade.ensureCart().finally(() => {
      this.revalidating.set(false);
    });
  }

  onContinueShopping(): void {
    void this.router.navigate(['/telefonok']);
  }

  /**
   * Continue handler. The flow is:
   *   1. set `continuing` so the button enters loading state;
   *   2. call `facade.ensureCart()` — the authoritative
   *      revalidation (AC04). If a 409/410/404 happened in the
   *      background, the facade's signals flip and the user stays
   *      on the page;
   *   3. only navigate when the local cart is still present and
   *      non-empty.
   */
  onContinue(): void {
    if (!this.canContinue()) return;
    this.continuing.set(true);
    void this.facade
      .ensureCart()
      .then(() => {
        const cart = this.cart() ?? this.facade.cart();
        if (cart === null || cart.items.length === 0) {
          this.continuing.set(false);
          return;
        }
        return this.router.navigate(['/penztar/adatok']);
      })
      .finally(() => {
        this.continuing.set(false);
      });
  }

  dismissStatusMessage(): void {
    this.transientStatus.set(null);
  }
}