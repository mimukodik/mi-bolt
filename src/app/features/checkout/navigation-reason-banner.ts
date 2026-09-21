/**
 * Renders the sentence that explains why the shopper is on this page
 * rather than on the one they asked for.
 *
 * The checkout guards redirect with `?navigationReason=…`
 * (`checkout.guards.ts`); this banner reads that parameter off the
 * current route and renders `navigationReasonMessage`'s sentence for
 * it. It is one component rather than three copies because the cart,
 * contact and delivery surfaces all need the same behaviour.
 *
 * The banner is persistent: the page offers no other way back to the
 * step the shopper came from, so a dismiss control would remove the
 * only explanation on the screen.
 */

import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { navigationReasonMessage } from './navigation-reason';

@Component({
  selector: 'app-navigation-reason-banner',
  imports: [StatusMessage],
  template: `
    @if (message(); as text) {
      <app-status-message
        [message]="text"
        severity="info"
        [persistent]="true"
        data-testid="navigation-reason"
      ></app-status-message>
    }
  `,
  // Every host of this banner is a `flex flex-col gap-…` section, where a
  // rendered-but-empty child is still a flex item and spends one gap. The
  // host therefore leaves the flow entirely while there is no reason.
  host: { '[style.display]': "message() === null ? 'none' : 'block'" },
})
export class NavigationReasonBanner {
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParamMap);

  /** The sentence for the current `navigationReason`, or null when the
   *  route carries none and when it carries one this build does not
   *  know. */
  readonly message = computed<string | null>(() =>
    navigationReasonMessage(this.queryParams()?.get('navigationReason') ?? ''),
  );
}
