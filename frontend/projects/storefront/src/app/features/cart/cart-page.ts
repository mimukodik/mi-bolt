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
 *   - forward `removeRequested` from each line to `removeItem`;
 *   - disable Continue while the cart is empty, pending or in
 *     error, and read the cart from the server again (`refetch()`)
 *     before the actual navigation (AC04).
 *
 * The header chrome (`<h1>`, breadcrumbs, layout) lives in the
 * page itself so the cart does not depend on the shop / checkout
 * layouts duplicating it.
 */

import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injector,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import type { ElementRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { NavigationReasonBanner } from '../checkout/navigation-reason-banner';
import { CartFacade } from './cart.facade';
import { CartLine } from './cart-line';
import { BREADCRUMB_VISIBLE } from '../../core/navigation/breadcrumb-visibility';
import { OrderSummary } from './order-summary';

import { EmptyState } from '../../shared/ui/empty-state/empty-state';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { SkeletonLeave } from '../../shared/ui/skeleton-leave/skeleton-leave';
import { Button } from '../../shared/ui/button/button';
import { StatusMessage, type StatusSeverity } from '../../shared/ui/status-message/status-message';

import type { Cart } from '@mi-bolt/api/models/cart';
import type { CartNotice } from '@mi-bolt/api/models/cart-notice';
import type { Money } from '@mi-bolt/api/models/money';

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
  return 'A kosár betöltése sikertelen.';
}

function describeNotice(notice: CartNotice): string {
  const subject = notice.productName ?? 'Egy termék';
  if (notice.code === 'QUANTITY_REDUCED') {
    const from = notice.params?.from;
    const to = notice.params?.to;
    if (from !== undefined && to !== undefined) {
      return `${subject}: a mennyiséget ${String(from)} → ${String(to)} darabra csökkentettük a készlet miatt.`;
    }
    return `${subject}: a mennyiséget a készlethez igazítottuk.`;
  }
  if (notice.code === 'ITEM_REMOVED') {
    return `${subject} kikerült a kosárból, mert már nem kapható.`;
  }
  return `${subject}: az ár megváltozott.`;
}

/** The same lines as on screen: every variant, quantity and unit price, in any order. */
function sameLines(onScreen: Cart, fresh: Cart): boolean {
  if (onScreen.items.length !== fresh.items.length) return false;
  return onScreen.items.every((line) => {
    const match = fresh.items.find((item) => item.variantId === line.variantId);
    if (match === undefined) return false;
    return match.quantity === line.quantity && match.unitPrice.amount === line.unitPrice.amount;
  });
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
    SkeletonLeave,
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
  /** Switched off for now (MIM-234); the nav stays in place behind this flag. */
  protected readonly breadcrumbVisible = BREADCRUMB_VISIBLE;

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

  /** Template ref for the cart page `<h1>` so a dismiss of the
   *  transient status banner returns focus to the page heading rather
   *  than dropping to `<body>`. */
  private readonly pageTitle = viewChild<ElementRef<HTMLElement>>('pageTitle');

  /** Every rendered cart line, in list order, so focus can move to the
   *  line that takes a removed line's place. */
  private readonly lines = viewChildren(CartLine);
  private readonly injector = inject(Injector);

  private readonly destroyRef = inject(DestroyRef);

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
    return cart.notices.map((notice) => describeNotice(notice));
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
    if (cart.items.length === 0) return 'empty';
    return 'ready';
  });

  /**
   * Continue button gating. The button is enabled only when:
   *   - at least one item is in the cart;
   *   - the facade is not currently dispatching a mutation;
   *   - there is no live conflict or expiry signal. A failed mutation
   *     (add, remove, clear) leaves the cart unchanged, so it does not
   *     block Continue;
   *   - the page is not reading the cart again (Continue, retry);
   *   - the page is not currently clearing the cart (the local
   *     `clearing` flag is true across the microtask between the
   *     clear response settling and the reset, so `pending()` alone
   *     would let Continue slip through).
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
  readonly statusMessage = computed<{
    text: string;
    severity: StatusSeverity;
    dismissible: boolean;
  } | null>(() => {
    // The ErrorState already carries the load-failure and
    // expiry copy when state is 'error'; the banner's
    // mutation-specific text would contradict it.
    if (this.state() === 'error') return null;
    if (this.facade.error() !== null) {
      return {
        text: 'A kosár módosítása nem sikerült; a kosár változatlan.',
        severity: 'error',
        dismissible: false,
      };
    }
    if (this.facade.conflict() !== null) {
      return {
        text: 'A kosár időközben megváltozott; frissítsd az oldalt, vagy próbáld újra a műveletet.',
        severity: 'error',
        dismissible: false,
      };
    }
    if (this.facade.cartExpired()) {
      return {
        text: 'A kosár lejárt. Indíts egy új pénztárat a frissítés gombra kattintva.',
        severity: 'error',
        dismissible: false,
      };
    }
    const transient = this.transientStatus();
    if (transient === null) return null;
    return { ...transient, dismissible: true };
  });

  private readonly transientStatus = signal<{ text: string; severity: StatusSeverity } | null>(
    null,
  );

  constructor() {
    // A refused add on another page leaves its failure on the shared
    // facade; this visit starts without it (owner, 2026-09-23).
    this.facade.dismissError();
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
  }

  onRemoveRequested(variantId: string): void {
    this.transientStatus.set({ text: 'A termék eltávolítása…', severity: 'info' });
    this.mutatingVariantId.set(variantId);
    const index = this.items().findIndex((item) => item.variantId === variantId);
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
        this.restoreFocus(index);
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
          this.restoreFocus(0);
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
    // An expired cart is only replaced when the shopper asks for a new
    // one; this button is that ask (E059). Every other retry reloads
    // the session cart through the idempotent ensureCart().
    const reload = this.facade.cartExpired() ? this.facade.refetch() : this.facade.ensureCart();
    void reload.finally(() => {
      this.revalidating.set(false);
    });
  }

  onContinueShopping(): void {
    void this.router.navigate(['/telefonok']);
  }

  /**
   * "Tovább az adatokhoz". The cart is read from the server again before
   * the shopper leaves (T18-AC04, owner: "Igen, lekéri újra"): a failed
   * change leaves this button active, so the snapshot on screen may be
   * behind the server (a conflict whose background read failed, another
   * tab). The shopper stays when the read fails, when the cart comes back
   * empty or with notices, and, with a message, when a line differs from
   * the one on screen. Nothing navigates once the page is gone.
   */
  async onContinue(): Promise<void> {
    if (!this.canContinue()) return;
    const onScreen = this.cart();
    this.continuing.set(true);
    try {
      await this.facade.refetch();
      if (this.destroyRef.destroyed) return;
      const fresh = this.facade.cart();
      if (
        fresh === null ||
        this.facade.error() !== null ||
        this.facade.conflict() !== null ||
        this.facade.cartExpired()
      ) {
        return;
      }
      if (fresh.items.length === 0 || fresh.notices.length > 0) return;
      if (onScreen === null || !sameLines(onScreen, fresh)) {
        this.transientStatus.set({
          text: 'A kosár időközben megváltozott; nézd át, mielőtt továbblépsz.',
          severity: 'info',
        });
        return;
      }
      await this.router.navigate(['/penztar/adatok']);
    } finally {
      this.continuing.set(false);
    }
  }

  dismissStatusMessage(): void {
    this.transientStatus.set(null);
    this.pageTitle()?.nativeElement.focus();
  }

  /**
   * After the next render, focuses the remove button of the line now at
   * `index` (the last line when `index` is past the end), or the page
   * heading when no line is left. The removed or disabled control had the
   * focus, and without this it would drop to `<body>`.
   */
  private restoreFocus(index: number): void {
    // A removal or clear can settle after the shopper has left the page;
    // registering a render hook on a destroyed view throws NG0911, and a
    // destroyed page has nothing left to focus.
    if (this.destroyRef.destroyed) return;
    afterNextRender(
      () => {
        const lines = this.lines();
        if (lines.length === 0 || index < 0) {
          this.pageTitle()?.nativeElement.focus();
          return;
        }
        const target = lines[Math.min(index, lines.length - 1)];
        target.focusRemove();
      },
      { injector: this.injector },
    );
  }

  /** `true` when the facade holds no failure signal after a mutation settled. */
  private mutationLanded(): boolean {
    return (
      this.facade.error() === null && this.facade.conflict() === null && !this.facade.cartExpired()
    );
  }
}
