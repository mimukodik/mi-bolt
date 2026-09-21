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
 * The notice is a one-time flash the shopper can close: an official
 * webshop's redirect banner is informational, not blocking, and once
 * the shopper has read it the next navigation dismisses it.
 */

import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';

import { StatusMessage } from '../../shared/ui/status-message/status-message';
import { navigationReasonMessage, toNavigationReason } from './navigation-reason';

@Component({
  selector: 'app-navigation-reason-banner',
  imports: [StatusMessage],
  template: `
    @if (text(); as message) {
      <app-status-message
        [message]="message"
        severity="info"
        (dismissed)="dismissed.set(true)"
        data-testid="navigation-reason"
      ></app-status-message>
    }
  `,
  // Every host of this banner is a `flex flex-col gap-…` section, where a
  // rendered-but-empty child is still a flex item and spends one gap. The
  // host therefore leaves the flow entirely while there is no reason.
  host: { '[style.display]': "visible() ? 'block' : 'none'" },
})
export class NavigationReasonBanner {
  private readonly queryParams = toSignal(inject(ActivatedRoute).queryParamMap);

  protected readonly dismissed = signal(false);

  /** The sentence for the current `navigationReason`, or null when the
   *  route carries none and when it carries one this build does not
   *  know. */
  readonly message = computed<string | null>(() =>
    navigationReasonMessage(
      toNavigationReason(this.queryParams()?.get('navigationReason') ?? null),
    ),
  );

  readonly text = computed<string | null>(() => (this.dismissed() ? null : this.message()));

  readonly visible = computed(() => this.text() !== null);
}
