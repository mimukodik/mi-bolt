/**
 * S3-P2 — the simulated card-payment authorisation screen.
 *
 * The shop redirects here at `/demo-fizetes/<paymentIntentId>` once it has
 * created a payment intent. The page shows the amount and the transaction
 * id, offers the three outcomes the contract allows, POSTs the chosen one
 * and sends the shopper back to `intent.returnUrl` with a full page load.
 *
 * It carries neither the shop's identity nor a provider's, and it never
 * renders a card field: `PaymentOutcomeRequest` accepts exactly one
 * property (`outcome`), so there is nothing a card number could travel in.
 */

import { CurrencyPipe } from '@angular/common';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  ElementRef,
  InjectionToken,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Api } from '@mi-bolt/api/api';
import { ApiConfiguration } from '@mi-bolt/api/api-configuration';
import { getPaymentIntent, resolvePaymentIntent } from '@mi-bolt/api/functions';

import type { PaymentIntent } from '@mi-bolt/api/models/payment-intent';
import type { PaymentOutcomeRequest } from '@mi-bolt/api/models/payment-outcome-request';

/**
 * The browser's own navigation call, behind an injectable seam.
 *
 * The return to the shop must be a full page load with a GET navigation
 * (`docs/01-kommunikacio.md:236-238`), so it cannot go through the Router;
 * the seam exists so the page spec can observe the navigation instead of
 * losing its test runner to it.
 */
export const LOCATION_ASSIGN = new InjectionToken<(url: string) => void>('LOCATION_ASSIGN', {
  providedIn: 'root',
  factory:
    () =>
    (url: string): void => {
      window.location.assign(url);
    },
});

/** The three outcomes the contract allows, read off the request model. */
type Outcome = PaymentOutcomeRequest['outcome'];

/** What failed, so the retry button re-runs exactly that step and no other. */
type FailedStep =
  | { readonly step: 'load' }
  | { readonly step: 'submit'; readonly intent: PaymentIntent; readonly outcome: Outcome };

/** Every state the page can be in. `display()` maps these onto three renderings. */
type PageState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly intent: PaymentIntent }
  | { readonly kind: 'submitting'; readonly intent: PaymentIntent; readonly outcome: Outcome }
  | { readonly kind: 'redirecting'; readonly intent: PaymentIntent }
  | { readonly kind: 'missing-id' }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'closed'; readonly intent: PaymentIntent }
  | { readonly kind: 'error'; readonly failed: FailedStep };

/** How the card renders: the three groups the states collapse into. */
type Display = 'loading' | 'card' | 'alert';

/**
 * The four states that replace the card with a `role="alert"` line. A kind
 * listed here is an alert state; the lookup is also what `display()` and
 * the focus effect branch on, so the two can never disagree.
 */
const ALERT_MESSAGES: Partial<Readonly<Record<PageState['kind'], string>>> = {
  'missing-id': 'Hiányzó fizetési azonosító.',
  'not-found': 'Ez a fizetési kérés nem található vagy lejárt.',
  closed: 'Ez a fizetés már lezárult.',
  error: 'A fizetés jóváhagyása nem sikerült.',
};

/** Button copy per outcome; the closed state names the booked one with it. */
const OUTCOME_LABELS: Readonly<Record<Outcome, string>> = {
  succeeded: 'Sikeres fizetés',
  declined: 'Elutasított fizetés',
  pending: 'Függőben marad',
};

@Component({
  selector: 'pay-payment-page',
  imports: [CurrencyPipe],
  templateUrl: './payment-page.html',
  styleUrl: './payment-page.css',
})
export class PaymentPage implements OnInit {
  /** Bound from the `:paymentIntentId` route segment (withComponentInputBinding). */
  readonly paymentIntentId = input<string>();

  private readonly api: Api;
  private readonly navigator = inject(LOCATION_ASSIGN);

  private readonly state = signal<PageState>({ kind: 'loading' });

  private readonly titleRef = viewChild<ElementRef<HTMLElement>>('payTitle');
  private readonly alertRef = viewChild<ElementRef<HTMLElement>>('payAlert');

  /**
   * What focus was last moved for: the state kind for an alert, and `'card'`
   * for the whole ready/submitting/redirecting group, which shares one `h1`.
   * Grouping the card states is what keeps `submitting` from taking focus off
   * the button the shopper just pressed.
   */
  private focusedFor: PageState['kind'] | 'card' | null = null;

  /** Which of the three renderings the current state asks for. */
  readonly display = computed<Display>(() => {
    const kind = this.state().kind;
    switch (kind) {
      case 'loading':
        return 'loading';
      case 'missing-id':
      case 'not-found':
      case 'closed':
      case 'error':
        return 'alert';
      case 'ready':
      case 'submitting':
      case 'redirecting':
        return 'card';
    }
  });

  /** The alert copy for the current state; empty while no alert is shown. */
  readonly alertMessage = computed(() => ALERT_MESSAGES[this.state().kind] ?? '');

  /** The loaded intent, wherever the current state carries one. */
  readonly intent = computed<PaymentIntent | null>(() => {
    const state = this.state();
    return 'intent' in state ? state.intent : null;
  });

  /** The outcome whose button was pressed, while the POST is in flight. */
  readonly pressed = computed<Outcome | null>(() => {
    const state = this.state();
    return state.kind === 'submitting' ? state.outcome : null;
  });

  readonly submitting = computed(() => this.state().kind === 'submitting');
  readonly redirecting = computed(() => this.state().kind === 'redirecting');
  readonly retryable = computed(() => this.state().kind === 'error');

  /** Button copy of the outcome a closed intent was booked with; empty otherwise. */
  readonly closedLabel = computed(() => {
    const state = this.state();
    if (state.kind !== 'closed') return '';
    const status = state.intent.status;
    return status === 'requires_action' ? '' : OUTCOME_LABELS[status];
  });

  /**
   * Target of the `Vissza a boltba` link. Only the closed state offers one:
   * a missing id and a 404 have no intent, so there is no `returnUrl` to
   * send the shopper to and a link would have to invent one.
   */
  readonly backUrl = computed<string | null>(() => {
    const state = this.state();
    return state.kind === 'closed' ? state.intent.returnUrl : null;
  });

  /** `aria-labelledby` only where the `h1` it names is actually rendered. */
  readonly labelledBy = computed<string | null>(() =>
    this.display() === 'card' ? 'pay-title' : null,
  );

  readonly busy = computed<string | null>(() => (this.submitting() ? 'true' : null));

  constructor() {
    // The generated `Api` class relies on Angular decorator metadata
    // for constructor injection. Vitest's esbuild pipeline does not
    // emit that metadata, so we wire it manually from the two
    // primitives that ARE injectable: `HttpClient` and
    // `ApiConfiguration`. The same `new Api(...)` call sees the live
    // `HttpClient` in a real browser, supplied by
    // `provideHttpClient(withInterceptors(...))`.
    this.api = new Api(inject(ApiConfiguration), inject(HttpClient));

    // Both view queries are read on every run, so the effect re-runs when
    // the element it wants mounts. That makes the move order-independent:
    // whether the query resolves before or after this effect first runs,
    // the focus lands exactly once, on the run where the target exists.
    //
    // Entering the card group takes focus to the `h1` once. That covers the
    // first render and the retry that leaves the error state: the button the
    // shopper pressed is destroyed with the alert, and a browser leaves focus
    // on `<body>` for an element that stops existing (WCAG 2.4.3, 2.4.7) —
    // the same failure `CatalogPage.focusResultCount` answers in the shop.
    effect(() => {
      const display = this.display();
      const kind = this.state().kind;
      const title = this.titleRef();
      const alert = this.alertRef();
      const target = display === 'card' ? 'card' : kind;
      if (this.focusedFor === target) return;
      if (display === 'card') {
        if (title === undefined) return;
        title.nativeElement.focus();
      } else if (display === 'alert') {
        if (alert === undefined) return;
        alert.nativeElement.focus();
      }
      this.focusedFor = target;
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  /** Choose an outcome. Ignored unless the page is showing a live intent. */
  onChoose(outcome: Outcome): void {
    const state = this.state();
    if (state.kind !== 'ready') return;
    void this.submit(state.intent, outcome);
  }

  /** Re-run whichever step failed; the error state records which one it was. */
  onRetry(): void {
    const state = this.state();
    if (state.kind !== 'error') return;
    if (state.failed.step === 'load') {
      void this.load();
      return;
    }
    void this.submit(state.failed.intent, state.failed.outcome);
  }

  /**
   * Read the intent named by the route. An intent that is already terminal
   * goes straight to the closed state, so the common back-button case never
   * reaches the POST at all (`docs/01-kommunikacio.md:242-244`).
   */
  private async load(): Promise<void> {
    const id = this.paymentIntentId();
    if (id === undefined || id.length === 0) {
      this.state.set({ kind: 'missing-id' });
      return;
    }
    this.state.set({ kind: 'loading' });
    try {
      const intent = await firstValueFrom(
        this.api.invoke(getPaymentIntent, { paymentIntentId: id }),
      );
      this.state.set(
        intent.status === 'requires_action'
          ? { kind: 'ready', intent }
          : { kind: 'closed', intent },
      );
    } catch (err: unknown) {
      this.state.set(
        err instanceof HttpErrorResponse && err.status === 404
          ? { kind: 'not-found' }
          : { kind: 'error', failed: { step: 'load' } },
      );
    }
  }

  /**
   * POST the chosen outcome, then leave. The intent id comes from the loaded
   * intent rather than from the route segment: it is the same value by
   * construction and it is not optional, so the POST cannot be built from a
   * missing id.
   */
  private async submit(intent: PaymentIntent, outcome: Outcome): Promise<void> {
    this.state.set({ kind: 'submitting', intent, outcome });
    try {
      await firstValueFrom(
        this.api.invoke(resolvePaymentIntent, {
          paymentIntentId: intent.id,
          body: { outcome },
        }),
      );
      // The live region is set before the navigation starts. `assign` only
      // begins a navigation — the current document keeps rendering until the
      // new one commits — so the announcement is made, not raced.
      this.state.set({ kind: 'redirecting', intent });
      this.navigator(intent.returnUrl);
    } catch (err: unknown) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        await this.showBookedOutcome(intent);
        return;
      }
      this.state.set({ kind: 'error', failed: { step: 'submit', intent, outcome } });
    }
  }

  /**
   * A 409 means the intent was resolved already, by this shopper's earlier
   * click or by a retry whose answer was lost. The POST is never repeated:
   * the page re-reads the intent and shows the outcome the server booked
   * (`docs/01-kommunikacio.md:243-244`). A failed re-read leaves a retry that
   * re-reads rather than one that re-posts.
   */
  private async showBookedOutcome(intent: PaymentIntent): Promise<void> {
    try {
      const booked = await firstValueFrom(
        this.api.invoke(getPaymentIntent, { paymentIntentId: intent.id }),
      );
      this.state.set({ kind: 'closed', intent: booked });
    } catch {
      this.state.set({ kind: 'error', failed: { step: 'load' } });
    }
  }
}
