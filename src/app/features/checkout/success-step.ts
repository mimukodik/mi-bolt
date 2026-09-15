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
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { Button } from '../../shared/ui/button/button';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { RouteFocusService } from '../../core/navigation/route-focus';

import { CartFacade } from '../cart/cart.facade';
import { CheckoutFacade } from './checkout.facade';
import { OrderReceiptComponent } from './order-receipt';

/** State of the hydration pipeline that lives on top of `CheckoutFacade.order()`. */
type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready' }
  | { kind: 'missing' }
  | { kind: 'error'; detail: string };

const ORDER_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

@Component({
  selector: 'app-success-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    Button,
    ErrorState,
    LoadingState,
    OrderReceiptComponent,
  ],
  template: `
    <section class="success" data-testid="success-page">
      <header class="heading">
        <nav class="breadcrumbs" aria-label="Navigáció">
          <a routerLink="/" class="breadcrumb">Főoldal</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <a routerLink="/penztar/kosar" class="breadcrumb">Kosár</a>
          <span aria-hidden="true" class="breadcrumb__sep">/</span>
          <span class="breadcrumb is-current" aria-current="page">Siker</span>
        </nav>
        <h1
          #successHeading
          id="success-heading"
          tabindex="-1"
          class="title"
          data-testid="success-heading"
        >
          @if (hasReceipt()) {
            A demórendelésed elkészült
          } @else if (loadState().kind === 'missing') {
            A rendelés nem található
          } @else if (loadState().kind === 'error') {
            A betöltés nem sikerült
          } @else {
            Demórendelés betöltése…
          }
        </h1>
        <p class="demo-notice" data-testid="success-demo-notice" role="note">
          <strong>Demó pénztár.</strong>
          A sikeroldal csupán a működést mutatja be — nem történt valódi
          fizetés, szállítás vagy e-mail-küldés.
        </p>
      </header>

      @switch (loadState().kind) {
        @case ('loading') {
          <div class="loading" data-testid="success-loading">
            <app-loading-state
              variant="block"
              label="A rendelés visszatöltése"
            ></app-loading-state>
          </div>
        }
        @case ('missing') {
          <div class="recovery" data-testid="success-missing">
            <app-error-state
              [title]="'A rendelés nem található'"
              [message]="missingMessage()"
              [retryLabel]="'Vissza a kosárhoz'"
              [pending]="false"
              (retryRequested)="onBackToCart()"
            ></app-error-state>
          </div>
        }
        @case ('error') {
          <div class="recovery" data-testid="success-error">
            <app-error-state
              [title]="'A visszatöltés nem sikerült'"
              [message]="errorMessage()"
              [retryLabel]="retryLabel()"
              [pending]="retrying()"
              (retryRequested)="onRetry()"
            ></app-error-state>
          </div>
        }
        @default {
          @if (hasReceipt()) {
            <div class="layout" data-testid="success-layout">
              <div class="column">
                <app-order-receipt [receipt]="order()!" />
              </div>
              <aside class="actions" aria-label="További lépések" data-testid="success-actions">
                <h2 class="actions__title">További lépések</h2>
                <p class="actions__intro">
                  A rendeléshez tartozó azonosítót megoszthatod az
                  ügyfélszolgálattal, vagy indíthatsz egy új vásárlást.
                </p>
                <div class="actions__buttons">
                  <app-button
                    variant="primary"
                    size="comfortable"
                    label="Új vásárlás indítása"
                    [loadingLabel]="'Új kosár létrehozása…'"
                    [loading]="startingNewCart()"
                    [disabled]="startingNewCart()"
                    (pressed)="onStartNewShopping()"
                    data-testid="success-new-shopping"
                  ></app-button>
                  <app-button
                    variant="secondary"
                    size="comfortable"
                    label="Vissza a főoldalra"
                    (pressed)="onBackToHome()"
                    data-testid="success-home"
                  ></app-button>
                </div>
                <p class="actions__hint">
                  Az új vásárlás friss kosarat hoz létre; a korábbi
                  rendelés adatai továbbra is elérhetők ezen az URL-en.
                </p>
              </aside>
            </div>
          }
        }
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .success {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
        color: var(--color-text-primary);
      }

      .heading {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .breadcrumbs {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
      }

      .breadcrumb {
        color: var(--color-text-secondary);
        text-decoration: none;
      }

      .breadcrumb:hover,
      .breadcrumb:focus-visible {
        text-decoration: underline;
      }

      .breadcrumb.is-current {
        color: var(--color-text-primary);
        font-weight: var(--weight-medium);
      }

      .breadcrumb__sep {
        margin: 0 var(--space-1);
      }

      .title {
        margin: 0;
        font-size: var(--type-page-title-mobile);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      .demo-notice {
        margin: 0;
        padding: var(--space-3) var(--space-4);
        background: var(--color-surface-section);
        border-left: 4px solid var(--color-brand-ink);
        border-radius: var(--radius-card);
        color: var(--color-text-primary);
        font-size: var(--type-helper);
        line-height: var(--line-height-body);
      }

      .loading,
      .recovery {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 18rem;
      }

      .layout {
        display: flex;
        flex-direction: column;
        gap: var(--space-6);
      }

      .column {
        display: flex;
        flex-direction: column;
        gap: var(--space-5);
        min-width: 0;
      }

      .actions {
        display: flex;
        flex-direction: column;
        gap: var(--space-4);
        padding: var(--space-5);
        background: var(--color-surface-section);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
      }

      .actions__title {
        margin: 0;
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
      }

      .actions__intro,
      .actions__hint {
        margin: 0;
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
      }

      .actions__buttons {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      @media (min-width: 640px) {
        .title {
          font-size: var(--type-page-title);
        }

        .actions__buttons {
          flex-direction: row;
          flex-wrap: wrap;
        }
      }

      @media (min-width: 1024px) {
        .layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 360px;
          gap: var(--space-7);
          align-items: start;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .success {
          transition: none;
        }
      }
    `,
  ],
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
    effect(() => {
      const id = this.orderId();
      if (id === null) {
        // The successGuard already rejects navigation when the id is
        // missing, but we keep this branch so the page renders a
        // graceful state if a deep-link sneaks through.
        this.loadState.set({ kind: 'missing' });
        return;
      }
      void this.hydrate(id);
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

  /** Subscribed once: move focus to the success heading. */
  private scheduleHeadingFocus(heading: ElementRef<HTMLElement>): void {
    this.routeFocus.navigationEnd$()
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

  onBackToHome(): void {
    void this.router.navigate(['/']);
  }

  onStartNewShopping(): void {
    if (this.startingNewCart()) return;
    this.startingNewCart.set(true);
    // The "Új vásárlás" CTA must:
    //   1. Drop the post-commit cart facade snapshot (already null,
    //      but idempotent — `ensureCart` will create a fresh one);
    //   2. Call `ensureCart()` so the next add-to-cart hits a server-
    //      side cart instead of creating a phantom one locally;
    //   3. Navigate to the shop so the user can keep shopping.
    void this.cart
      .ensureCart()
      .then(() => this.router.navigate(['/telefonok']))
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
