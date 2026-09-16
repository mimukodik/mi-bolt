/**
 * T18 — add-to-cart surface (S3 → S4.1).
 *
 * Wires the "Kosárba teszem" CTA on the product page to the
 * `CartFacade` (T17). The component is the user-facing boundary of
 * the cart pipeline: it owns the click lifecycle (idle / pending /
 * success / error), the lazy `ensureCart()` boot, and the
 * accessible confirmation message that names the product, the
 * color, the storage and the quantity the server confirmed.
 *
 * Output contract:
 *   - emits `added` with the wire-shaped `CartItem` the server
 *     returned so the host (the product page) can keep its own
 *     state machine in sync;
 *   - exposes `pending` so the parent can disable the desktop and
 *     mobile purchase rails in lockstep;
 *   - surfaces a `StatusMessage` (T10) on success / error so the
 *     confirmation lands in a polite / assertive live region.
 *
 * The component does NOT speak to the cart-domain directly: every
 * mutation goes through `CartFacade`, which is the single owner of
 * the serialized mutation queue and the If-Match binding.
 */

import {
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { CartFacade } from '../../features/cart/cart.facade';

import { Button } from '../../shared/ui/button/button';
import { StatusMessage, type StatusSeverity } from '../../shared/ui/status-message/status-message';

import type { CartItem } from '../../api/generated/models/cart-item';

export interface AddToCartSelection {
  readonly variantId: string;
  readonly quantity: number;
  readonly productName: string;
  readonly colorName: string;
  readonly storageGb: number;
}

@Component({
  selector: 'app-add-to-cart',
  imports: [Button, StatusMessage],
  templateUrl: './add-to-cart.html',
  styleUrl: './add-to-cart.scss',
})
export class AddToCart {
  private readonly facade = inject(CartFacade);
  private readonly destroyRef = inject(DestroyRef);

  /** Selection from the product page (the variant + qty the user
   *  intends to add). The component never invents a quantity — it
   *  surfaces exactly what the parent passes in. */
  readonly selection = input.required<AddToCartSelection>();

  /** Whether the parent considers the action enabled. Mirrors the
   *  T16 product-page rules (variant selected, in stock, qty in
   *  range). When false the button is disabled regardless of
   *  local state. */
  readonly enabled = input<boolean>(true);

  /** Emitted after the server confirms the add. The payload is the
   *  cart line the mock / backend returned, so the parent can
   *  refresh its own view model without reading the cart signal. */
  readonly added = output<CartItem>();

  /** Pending state surfaced to the parent so the desktop and mobile
   *  purchase rails can stay in sync. */
  readonly pending = signal<boolean>(false);

  /** Transient status banner copy + severity. The component never
   *  invents urgency or stock counts. */
  readonly statusBanner = computed<{ text: string; severity: StatusSeverity } | null>(() => {
    if (this.pending()) {
      return { text: 'A termék hozzáadása a kosárhoz…', severity: 'info' };
    }
    return this.banner();
  });

  /** Severity accessor so the StatusMessage primitive owns the
   *  role/aria-live switch without leaking the local banner shape.
   *  Defaults to `info` when no banner is active so the binding is
   *  always defined. */
  readonly severity = computed<StatusSeverity>(() => this.statusBanner()?.severity ?? 'info');

  private readonly banner = signal<{ text: string; severity: StatusSeverity } | null>(null);

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.pending.set(false);
      this.banner.set(null);
    });
  }

  /**
   * Lazily create the cart (no-op when one is already loaded) and
   * then add the current selection. On success the component
   * surfaces the confirmation that names product / color / storage
   * / quantity and emits the cart line the server returned.
   *
   * The call site reads `(variantId, quantity)` positionally —
   * semantically identical to `addItem({variantId, quantity})` —
   * so the T17 facade's existing signature stays intact.
   */
  async onAdd(): Promise<void> {
    if (this.pending()) return;
    const selection = this.selection();
    if (!this.enabled()) return;
    this.pending.set(true);
    this.banner.set(null);
    try {
      await this.facade.ensureCart();
      await this.facade.addItem(selection.variantId, selection.quantity);
      const added = this.findAddedLine(selection.variantId);
      this.banner.set({
        text: this.composeMessage(selection),
        severity: 'success',
      });
      if (added !== null) {
        this.added.emit(added);
      }
    } catch {
      // Facade signals (error / conflict / cartGone / cartExpired)
      // own the wire error. The banner just reflects the user-facing
      // summary.
      this.banner.set({
        text: 'A termék hozzáadása nem sikerült; a kosár változatlan.',
        severity: 'error',
      });
    } finally {
      this.pending.set(false);
    }
  }

  dismissBanner(): void {
    this.banner.set(null);
  }

  /**
   * Locates the freshly added line in the local cart snapshot. The
   * cart mock returns a deterministic id per variant, so the line
   * is the one whose `variantId` matches the user's selection.
   */
  private findAddedLine(variantId: string): CartItem | null {
    const cart = this.facade.cart();
    if (cart === null) return null;
    const line = cart.items.find((item) => item.variantId === variantId);
    return line ?? null;
  }

  /**
   * Composes the Hungarian confirmation body the StatusMessage
   * announces: "<product>, <color>, <storage> GB – <qty> db a
   * kosárban." The component never invents numbers — every value
   * comes from the wire-shaped `selection` the parent supplies.
   */
  private composeMessage(selection: AddToCartSelection): string {
    const qty = selection.quantity;
    const unit = qty === 1 ? 'darab' : 'darab';
    return `${selection.productName}, ${selection.colorName}, ${selection.storageGb} GB – ${qty} ${unit} a kosárban.`;
  }
}