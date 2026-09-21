/**
 * Renders the sentence that explains why the shopper is on this page
 * rather than on the one they asked for.
 *
 * The checkout guards redirect with `?navigationReason=…`
 * (`checkout.guards.ts`); this banner reads that parameter off the
 * current route and renders `navigationReasonMessage`'s sentence for
 * it. It is one component rather than three copies because the cart,
 * contact and delivery surfaces all need the same behaviour, and
 * because the contact surface's container owns no template of its own
 * to put it in.
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
  templateUrl: './navigation-reason-banner.html',
  host: { class: 'block' },
})
export class NavigationReasonBanner {
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParamMap);

  /** The sentence for the current `navigationReason`, or null when the
   *  route carries none and when it carries one this build does not
   *  know. */
  readonly message = computed<string | null>(() => {
    const reason = this.queryParams()?.get('navigationReason') ?? null;
    if (reason === null) return null;
    return navigationReasonMessage(reason);
  });
}
