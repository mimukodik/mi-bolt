/**
 * T22 — quote lifecycle state machine for the review step.
 *
 * Wraps `CheckoutFacade.createQuote()` in a discriminated-union
 * signal so the review page can branch on the exact failure the
 * mock returned, instead of relying on a generic `error` signal.
 *
 *   - `idle`            — controller mounted, no quote attempt yet.
 *   - `loading`         — a `POST /checkout/{id}/quote` is in flight.
 *   - `ready`           — a fresh quote is stored in the facade and
 *                         can be submitted.
 *   - `price-changed`   — mock returned 409 PRICE_CHANGED. The cart
 *                         was atomically rewritten by the mock so
 *                         the page must show the new totals (T22-
 *                         AC03). The old amount cannot be
 *                         submitted.
 *   - `quote-expired`   — mock returned 409 QUOTE_EXPIRED. The
 *                         TTL elapsed; the user must explicitly
 *                         re-quote.
 *   - `out-of-stock`    — mock returned 409 OUT_OF_STOCK. The page
 *                         sends the user back to the cart so the
 *                         line can be edited.
 *   - `field-error`     — any other validation / network failure
 *                         (422 CHECKOUT_INCOMPLETE, 500, etc.).
 *
 * The controller is constructed inside the review component's
 * injection context so the facade it injects is the root-provided
 * singleton. The component disposes it on destroy through its own
 * `DestroyRef`; nothing else holds the reference.
 *
 * Wire-level invariants (T22-AC03):
 *
 *   - The previously-shown amount cannot be submitted. The page
 *     disables the final CTA whenever the controller is not in
 *     `ready`, so the user must explicitly call `refresh()` to
 *     acknowledge the new total.
 *   - The page does not clear the cart on any branch — the cart
 *     survives across error states so a corrected retry does not
 *     require re-adding items.
 */

import {
  Injectable,
  computed,
  inject,
  signal,
  type Signal,
  type WritableSignal,
} from '@angular/core';

import type { Quote } from '../../api/generated/models/quote';

import { CheckoutFacade, type CheckoutError } from './checkout.facade';

/** Discriminated union exposed to the review component template. */
export type QuoteState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly quote: Quote }
  | { readonly kind: 'price-changed'; readonly detail: string }
  | { readonly kind: 'quote-expired'; readonly detail: string }
  | { readonly kind: 'out-of-stock'; readonly detail: string }
  | {
      readonly kind: 'field-error';
      readonly detail: string;
      readonly errors: readonly { path: string; message: string }[];
    };

/**
 * Pure helper that maps a `CheckoutError` to the corresponding
 * `QuoteState` branch. Exported so the review component (and the
 * unit suite) can verify the mapping without instantiating the
 * controller.
 */
export function mapQuoteError(error: CheckoutError): QuoteState {
  switch (error.code) {
    case 'PRICE_CHANGED':
      return { kind: 'price-changed', detail: error.detail };
    case 'QUOTE_EXPIRED':
      return { kind: 'quote-expired', detail: error.detail };
    case 'OUT_OF_STOCK':
      return { kind: 'out-of-stock', detail: error.detail };
    default:
      return {
        kind: 'field-error',
        detail: error.detail,
        errors: error.fieldErrors,
      };
  }
}

/**
 * Drives the review step's quote lifecycle. The page instantiates
 * one of these in its constructor; the controller owns the signal
 * state machine and the explicit `refresh()` action the user
 * triggers when they re-edit an earlier step.
 */
@Injectable({ providedIn: 'root' })
export class QuoteController {
  private readonly facade = inject(CheckoutFacade);

  private readonly stateWritable: WritableSignal<QuoteState> = signal<QuoteState>({ kind: 'idle' });

  /** Current state. The page branches on `kind` to pick the right
   *  banner + CTA explanation. */
  readonly state: Signal<QuoteState> = this.stateWritable.asReadonly();

  /** Convenience: the live `Quote` when the state is `ready`. */
  readonly quote: Signal<Quote | null> = computed<Quote | null>(() => {
    const current = this.stateWritable();
    return current.kind === 'ready' ? current.quote : null;
  });

  /** True while a quote request is in flight. */
  readonly busy: Signal<boolean> = computed<boolean>(() => this.stateWritable().kind === 'loading');

  /** True only when the controller holds a fresh, submittable
   *  quote. The CTA reads this. */
  readonly ready: Signal<boolean> = computed<boolean>(() => this.stateWritable().kind === 'ready');

  /**
   * Mirrors the facade's "active quote" flag into the controller
   * state. Called once on construction so the page reuses the
   * already-fetched quote when the user returns to the review
   * step instead of issuing a duplicate `POST /quote`.
   */
  syncFromFacade(): void {
    const facadeQuote = this.facade.quote();
    if (facadeQuote !== null && this.stateWritable().kind !== 'ready') {
      this.stateWritable.set({ kind: 'ready', quote: facadeQuote });
    }
  }

  /**
   * Creates a fresh quote bound to the current cart version. The
   * page calls this on mount and after every edit / correction.
   * The result drives the `state` signal — never an unmodelled
   * `error` flag.
   */
  async refresh(): Promise<void> {
    this.stateWritable.set({ kind: 'loading' });
    const result = await this.facade.createQuote();
    if (result.ok) {
      this.stateWritable.set({ kind: 'ready', quote: result.value });
      return;
    }
    this.stateWritable.set(mapQuoteError(result.error));
  }

  /**
   * Drops the current quote so the page can show the "stale quote"
   * state. Called when the user re-edits contact / delivery /
   * payment so the next `refresh()` produces a fresh `quoteId`.
   */
  invalidate(): void {
    this.facade.invalidateQuote();
    const current = this.stateWritable();
    if (current.kind === 'ready') {
      this.stateWritable.set({ kind: 'idle' });
    }
  }
}
