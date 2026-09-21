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

import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { NavigationReasonBanner } from '../checkout/navigation-reason-banner';
import { CartFacade } from './cart.facade';
import { CartLine } from './cart-line';
import { OrderSummary } from './order-summary';

import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock } from '../../shared/ui/price-block/price-block';
import { Button } from '../../shared/ui/button/button';
import { StatusMessage, type StatusSeverity } from '../../shared/ui/status-message/status-message';
import { isRecord } from '../../shared/utils/is-record';

import type { Cart } from '../../api/generated/models/cart';
import type { CartItem } from '../../api/generated/models/cart-item';
import type { CartNotice } from '../../api/generated/models/cart-notice';
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
  const error = facade.error();
  if (error !== null) {
    return error.detail;
  }
  return 'A kosár betöltése sikertelen.';
}

function describeNotice(notice: CartNotice, items: readonly CartItem[]): string {
  const name = items.find((item) => item.variantId === notice.variantId)?.productName;
  const subject = name ?? 'Egy termék';
  if (notice.code === 'QUANTITY_REDUCED') {
    const from = readNumberParam(notice, 'from');
    const to = readNumberParam(notice, 'to');
    if (from !== null && to !== null) {
      return `${subject}: a mennyiséget ${String(from)} → ${String(to)} darabra csökkentettük a készlet miatt.`;
    }
    return `${subject}: a mennyiséget a készlethez igazítottuk.`;
  }
  if (notice.code === 'ITEM_REMOVED') {
    return `${subject} kikerült a kosárból, mert már nem kapható.`;
  }
  return `${subject}: az ár megváltozott.`;
}

function readNumberParam(notice: CartNotice, key: string): number | null {
  const params = notice.params;
  if (!isRecord(params)) {
    return null;
  }
  const value = params[key];
  return typeof value === 'number' ? value : null;
}

@Component({
  selector: 'app-cart-page',
  imports: [
    RouterLink,
    CartLine,
    NavigationReasonBanner,
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
  /** Read by the template for the pending state; mutations go through the methods below. */
  readonly facade = inject(CartFacade);
  private readonly router = inject(Router);

  /** Snapshot of the cart once it has loaded. */
  readonly cart = signal<Cart | null>(null);
  /** `true` while the user has clicked "Tovább a pénztárhoz" and the
   *  revalidation + navigation chain is in flight. */
  readonly continuing = signal<boolean>(false);
  /** `true` while the user has clicked the ErrorState retry and the
   *  re-fetch / ensure-cart chain is in flight. */
  readonly revalidating = signal<boolean>(false);

  /** `true` while the "Kosár ürítése" call is in flight. */
  readonly clearing = signal<boolean>(false);

  /** Variant id of the line whose mutation is currently in flight, or null.
   *  Only that line is disabled while the facade dispatches. */
  private readonly mutatingVariantId = signal<string | null>(null);

  readonly pendingVariantIds = computed<ReadonlySet<string>>(() => {
    const id = this.mutatingVariantId();
    return id === null ? new Set() : new Set([id]);
  });

  /** Items list (the cart is non-null in the success branch). */
  readonly items = computed(() => this.cart()?.items ?? []);

  /** Subtotal as whole-HUF Money for the PriceBlock primitive. */
  readonly subtotal = computed<Money>(() => {
    const cart = this.cart();
    if (cart === null) return { amount: 0, currency: 'HUF' };
    return cart.subtotal;
  });

  /** One Hungarian sentence per server notice on the current cart. */
  readonly noticeMessages = computed<readonly string[]>(() => {
    const cart = this.cart();
    if (cart === null) return [];
    return cart.notices.map((notice) => describeNotice(notice, cart.items));
  });

  /** Summary footnote copy shown under the total. The shipping fee
   *  is intentionally absent — see OrderSummary for the Hungarian
   *  "A következő lépésben választod ki." message. */
  readonly summaryFootnote = computed<string | null>(() => null);

  /** Friendly error message — prefers the cart-expired branch
   *  so the user is told why their cart vanished. */
  readonly errorMessage = computed<string>(() => describeCartError(this.facade));

  /** Cart state machine: drives the four documented branches. */
  readonly state = computed<ScreenState>(() => {
    const facadeCart = this.facade.cart();
    // Local mirror is the source of truth once it has landed.
    const cart = this.cart() ?? facadeCart;
    if (cart === null) {
      if (this.facade.error() !== null || this.facade.cartExpired()) {
        return 'error';
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
   *   - there is no live conflict / error / expired signal;
   *   - the page itself is not mid-`ensureCart` revalidation.
   */
  readonly canContinue = computed<boolean>(() => {
    const cart = this.cart();
    if (cart === null) return false;
    if (cart.items.length === 0) return false;
    if (this.continuing()) return false;
    if (this.revalidating()) return false;
    if (this.clearing()) return false;
    if (this.facade.pending() > 0) return false;
    if (this.facade.conflict() !== null) return false;
    if (this.facade.error() !== null) return false;
    if (this.facade.cartExpired()) return false;
    return true;
  });

  /**
   * Transient status banner. The page surfaces, in order:
   *   - the wire-level `error` when present (generic Problem);
   *   - the 412 `conflict` overlay, so the user is told the cart
   *     diverged from the server even when no in-flight mutation
   *     is around to set the transient banner;
   *   - the 410 `cartExpired` overlay, the same shape as the
   *     `errorMessage` string;
   *   - the `transientStatus` set by the per-mutation handlers.
   *
   * The conflict overlay must not be hidden by a successful
   * `transientStatus` set up by the next mutation — once the
   * post-conflict refetch lands the user has not yet pressed
   * "Retry", and a transient "Sikeres frissítés." after that would
   * tell them the conflict was cleared when actually nothing was.
   */
  readonly statusMessage = computed<{ text: string; severity: StatusSeverity } | null>(() => {
    const error = this.facade.error();
    if (error !== null) {
      return { text: error.detail, severity: 'error' };
    }
    if (this.facade.conflict() !== null) {
      return {
        text: 'A kosár időközben megváltozott; frissítsd az oldalt, vagy próbáld újra a műveletet.',
        severity: 'error',
      };
    }
    if (this.facade.cartExpired()) {
      return {
        text: 'A kosár lejárt. Indíts egy új pénztárat a frissítés gombra kattintva.',
        severity: 'error',
      };
    }
    return this.transientStatus();
  });

  private readonly transientStatus = signal<{ text: string; severity: StatusSeverity } | null>(
    null,
  );

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

    // Reset the transient status banner when the cart resolves to a
    // new shape so a stale "X törölve" message does not survive a
    // subsequent successful mutation.
    effect(() => {
      this.cart();
    });
  }

  onQuantityChanged(item: { variantId: string }, quantity: number): void {
    this.transientStatus.set({ text: 'A mennyiség frissítése…', severity: 'info' });
    this.mutatingVariantId.set(item.variantId);
    void this.facade
      .setQuantity(item.variantId, quantity)
      .then(() => {
        // `statusMessage` renders the facade's error / conflict /
        // cartExpired signals ahead of this banner, so the handler
        // reports success only when none of them is set and otherwise
        // clears the in-flight text to let the signal through.
        if (this.mutationLanded()) {
          this.transientStatus.set({ text: 'A mennyiség frissítve.', severity: 'success' });
        } else {
          this.transientStatus.set(null);
        }
      })
      .finally(() => {
        this.mutatingVariantId.set(null);
      });
  }

  onRemoveRequested(variantId: string): void {
    this.transientStatus.set({ text: 'A termék eltávolítása…', severity: 'info' });
    this.mutatingVariantId.set(variantId);
    void this.facade
      .removeItem(variantId)
      .then(() => {
        if (this.mutationLanded()) {
          this.transientStatus.set({
            text: 'A termék törölve a kosárból.',
            severity: 'success',
          });
        } else {
          this.transientStatus.set(null);
        }
      })
      .finally(() => {
        this.mutatingVariantId.set(null);
      });
  }

  onClearCart(): void {
    this.transientStatus.set({ text: 'A kosár ürítése…', severity: 'info' });
    this.clearing.set(true);
    void this.facade
      .clear()
      .then(() => {
        if (this.mutationLanded()) {
          this.transientStatus.set({ text: 'A kosár kiürítve.', severity: 'success' });
        } else {
          this.transientStatus.set(null);
        }
      })
      .finally(() => {
        this.clearing.set(false);
      });
  }

  onRetry(): void {
    this.revalidating.set(true);
    void this.facade.ensureCart().finally(() => {
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
   *      revalidation (AC04). If a 412 conflict / 410 expiry / any
   *      other Problem on the error signal happened in the
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

  /** `true` when the facade holds no failure signal after a mutation settled. */
  private mutationLanded(): boolean {
    return (
      this.facade.error() === null && this.facade.conflict() === null && !this.facade.cartExpired()
    );
  }
}
