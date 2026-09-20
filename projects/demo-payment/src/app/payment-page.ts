import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Placeholder for the demo payment page; unit S3-P2 supplies the surface. */
@Component({
  selector: 'pay-payment-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<main><h1>Demó fizetés</h1></main>`,
})
export class PaymentPage {
  /** Bound from the `:paymentIntentId` route segment (withComponentInputBinding). */
  readonly paymentIntentId = input<string>();
}
