/**
 * T24 — success step (S4.5).
 *
 * Replaces the T11 stub and the previous placeholder. Owns the
 * success page at `/penztar/siker/:orderId` and the reload-recovery
 * flow that the spec calls for in T24-AC01 … T24-AC05.
 *
 * Wire-level contract:
 *
 *   The page RENDERS only what the API returned. If
 *   `CheckoutFacade.order()` is already populated (the user navigated
 *   forward through the wizard), it is used directly. On a hard
 *   reload, deep-link or "back + forward" the in-memory receipt is
 *   gone; the page then calls `CheckoutFacade.fetchOrder(orderId)`,
 *   which is a `GET /orders/{orderId}` (no POST ever happens here).
 *   A 404 surfaces through `ErrorState` — the page never invents a
 *   success when the order is gone.
 *
 *   T24-AC01   Order number, line items, totals, payment method and
 *              the explicit "no real transaction / e-mail / delivery"
 *              notice are rendered through `OrderReceiptComponent`.
 *   T24-AC02   No POST is ever issued by this page. Reload hydrates
 *              through `fetchOrder`. Unknown order ids render a 404
 *              recovery with a "Vissza a kosárhoz" CTA.
 *   T24-AC03   The page calls `CartFacade.resetOrderedCart()` after
 *              the receipt is in memory so the header badge reads 0
 *              even though past-receipt replay remains available
 *              (the order id lives on the URL, not in the cart).
 *   T24-AC04   The wizard guards now refuse to re-open the contact /
 *              delivery / review steps when an order exists, and
 *              redirect back to the existing success URL.
 *   T24-AC05   The success H1 carries `tabindex="-1"`; the page
 *              schedules a focus move onto it through
 *              `RouteFocusService` so keyboard / screen-reader users
 *              land on it after navigation.
 *
 * The page is a consumer of `CheckoutFacade` and `CartFacade`. It
 * never talks to the SDK directly.
 */

import {
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';

import { Button } from '../../shared/ui/button/button';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { RouteFocusService } from '../../core/navigation/route-focus';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';
import { CheckoutStepHeader, type CheckoutCrumb } from './checkout-step-header';
import { OrderReceiptComponent } from './order-receipt';

/** State of the hydration pipeline that lives on top of `CheckoutFacade.order()`. */
type LoadState =
  { kind: 'loading' } | { kind: 'ready' } | { kind: 'missing' } | { kind: 'error'; detail: string };

const ORDER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

@Component({
  selector: 'app-success-page',
  imports: [Button, CheckoutStepHeader, ErrorState, LoadingState, OrderReceiptComponent],
  templateUrl: './success-step.html',
  styleUrl: './success-step.scss',
})
export class SuccessStep {
  private readonly checkout = inject(CheckoutFacade);
  private readonly cart = inject(CartFacade);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly routeFocus = inject(RouteFocusService);

  /** Raw order id from the URL. Lazily resolved through `paramMap`. */
  private readonly orderIdFromRoute = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** Selected order id (or null when none was supplied). */
  readonly orderId = computed<string | null>(() => {
    const raw = this.orderIdFromRoute().get('orderId');
    if (raw === null) return null;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null;
    if (!ORDER_ID_PATTERN.test(trimmed)) return null;
    return trimmed;
  });

  /** Read-only view of the receipt from the facade (null until loaded). */
  readonly order = this.checkout.order;

  /** True when a receipt is rendered. */
  readonly hasReceipt = computed<boolean>(() => this.order() !== null);

  /**
   * Hydration state machine. Mirrors the success-page contract:
   *   - `loading` while GET /orders/{id} is in flight
   *   - `ready`   once `CheckoutFacade.order()` carries the receipt
   *   - `missing` when the order id is well-formed but the API 404s
   *   - `error`   on any other failure (network, 5xx, malformed body)
   */
  readonly loadState = signal<LoadState>({ kind: 'loading' });

  /** True while a manual retry is in flight. */
  readonly retrying = signal<boolean>(false);

  /** True while the "Új vásárlás" CTA is creating a fresh cart. */
  readonly startingNewCart = signal<boolean>(false);

  /** Reference to the H1 so the focus move lands on it. */
  private readonly headingRef = viewChild<ElementRef<HTMLElement>>('successHeading');

  /** Breadcrumb trail for the shared `CheckoutStepHeader`. Order matches
   *  the previous template: Főoldal → Kosár, with this step (`Siker`) as
   *  the trailing non-link. */
  protected readonly crumbs: readonly CheckoutCrumb[] = [
    { label: 'Főoldal', link: '/' },
    { label: 'Kosár', link: '/penztar/kosar' },
  ];

  /** Truthy banner copy fed to ErrorState. */
  readonly missingMessage = computed<string>(() => {
    const id = this.orderId() ?? '';
    return id.length > 0
      ? `A(z) ${id} azonosítójú rendelés nem található a rendszerben. Indíts egy új pénztárat, vagy térj vissza a kosaradhoz.`
      : 'A keresett rendelés nem található. Indíts egy új pénztárat, vagy térj vissza a kosaradhoz.';
  });

  /** Truthy banner copy fed to ErrorState on a network / 5xx failure. */
  readonly errorMessage = computed<string>(() => {
    const s = this.loadState();
    return s.kind === 'error' ? s.detail : 'A rendelés visszatöltése nem sikerült.';
  });

  /** Retry button label. */
  readonly retryLabel = computed<string>(() => 'Visszatöltés újra');

  constructor() {
    // Drive the hydration pipeline off the URL signal. We don't reach
    // into the SDK directly: every wire call goes through
    // `CheckoutFacade.fetchOrder()` (a GET, never a POST).
    //
    // The effect tracks only the URL's `orderId`. `hydrate` reads
    // `checkout.order()` to decide whether to issue the GET; without
    // `untracked` that read would be tracked too, and `startNewPurchase`
    // clearing the in-memory receipt would re-fire the effect and
    // refetch the same order — undoing the "new purchase" reset.
    effect(() => {
      const id = this.orderId();
      if (id === null) {
        // The successGuard already rejects navigation when the id is
        // missing, but we keep this branch so the page renders a
        // graceful state if a deep-link sneaks through.
        this.loadState.set({ kind: 'missing' });
        return;
      }
      untracked(() => {
        void this.hydrate(id);
      });
    });

    // The success page also reseeds the cart so the header badge
    // reflects the ordered-cart transition. Done once when the
    // receipt first lands; safe to call repeatedly because the
    // facade short-circuits when the cart is already null.
    effect(() => {
      if (this.hasReceipt()) {
        this.cart.resetOrderedCart();
      }
    });

    // Move focus onto the success heading when the page is rendered.
    // `RouteFocusService.scheduleFocus()` queues a focus on the next
    // render; the explicit heading reference here guarantees the
    // focus lands on the H1 (not the generic layout `main` element).
    effect(() => {
      const heading = this.headingRef();
      if (heading === undefined) return;
      this.scheduleHeadingFocus(heading);
    });
  }

  // -------------------------------------------------------------------------
  // Hydration.
  // -------------------------------------------------------------------------

  private async hydrate(orderId: string): Promise<void> {
    if (this.checkout.order() !== null && this.checkout.order()?.id === orderId) {
      // The receipt is already in memory (forward navigation). No GET
      // needed; the facet is satisfied and we render immediately.
      this.loadState.set({ kind: 'ready' });
      return;
    }
    this.loadState.set({ kind: 'loading' });
    const result = await this.checkout.fetchOrder(orderId);
    if (result.ok) {
      this.loadState.set({ kind: 'ready' });
      return;
    }
    if (result.error.status === 404) {
      this.loadState.set({ kind: 'missing' });
      return;
    }
    this.loadState.set({
      kind: 'error',
      detail: result.error.detail || 'A rendelés visszatöltése sikertelen.',
    });
  }

  /** Moves focus to the success heading after each navigation end, until the component is destroyed. */
  private scheduleHeadingFocus(heading: ElementRef<HTMLElement>): void {
    this.routeFocus
      .navigationEnd$()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        // Defer the focus one tick so the H1 is connected (lazy
        // chunk mount) and the layout's main-element focus has already
        // happened.
        queueMicrotask(() => {
          const el = heading.nativeElement;
          el.setAttribute('tabindex', '-1');
          el.focus({ preventScroll: false });
        });
      });
    // Also schedule one immediately so a direct mount focuses too.
    this.routeFocus.scheduleFocus();
  }

  // -------------------------------------------------------------------------
  // User interactions.
  // -------------------------------------------------------------------------

  onRetry(): void {
    if (this.retrying()) return;
    const id = this.orderId();
    if (id === null) {
      this.loadState.set({ kind: 'missing' });
      return;
    }
    this.retrying.set(true);
    void this.hydrate(id).finally(() => {
      this.retrying.set(false);
    });
  }

  onBackToCart(): void {
    void this.router.navigate(['/penztar/kosar']);
  }

  onStartNewShopping(): void {
    if (this.startingNewCart()) return;
    this.startingNewCart.set(true);
    // The "Új vásárlás" CTA must:
    //   1. Drop the post-commit cart facade snapshot (already null,
    //      but idempotent — `ensureCart` will create a fresh one);
    //   2. Call `ensureCart()` so the next add-to-cart hits a server-
    //      side cart instead of creating a phantom one locally;
    //   3. Navigate to the shop first so the receipt block does
    //      not blank on screen — `successGuard` only runs on
    //      navigation TO the success route, so clearing after
    //      leaving is safe;
    //   4. Clear the checkout session and the receipt through
    //      `startNewPurchase()` so the wizard guards do not bounce
    //      a later navigation back to this success URL.
    void this.cart
      .ensureCart()
      .then(() => this.router.navigate(['/telefonok']))
      .then(() => {
        this.checkout.startNewPurchase();
      })
      .catch(() => this.router.navigate(['/penztar/kosar']))
      .finally(() => {
        this.startingNewCart.set(false);
      });
  }

  // -------------------------------------------------------------------------
  // Test seams — exposed only so spec files can drive the page
  // without standing up the full component tree.
  // -------------------------------------------------------------------------

  __testForceState(next: LoadState): void {
    this.loadState.set(next);
  }

  __testOrderId(): string | null {
    return this.orderId();
  }
}
