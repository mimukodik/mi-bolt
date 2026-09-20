import { Component, input, output } from '@angular/core';

/**
 * `FooterNav` — single dark bar carrying the MiBolt brand, the demo
 * disclaimer sentence and one outlined CTA. Rendered by `AppShell` on
 * every layout.
 *
 * `docs/spec/components.md:86-92` declares `compact:boolean` (default
 * `false`) and `demoInfoRequested:void`: `compact` renders the
 * checkout layout's shorter footer, and the demo-explainer CTA emits
 * an intent rather than navigating itself — `components.md:3`'s
 * "intents use output()" rule, the same pattern `DeliveryStep`'s CTA
 * follows (FIX-56). `AppShell.onDemoInfo()` is the one caller and
 * decides the actual navigation target.
 *
 * Required by R02: the same partner brand and same footer on every
 * standard page.
 */
@Component({
  selector: 'app-footer-nav',
  templateUrl: './footer-nav.html',
  styleUrl: './footer-nav.scss',
})
export class FooterNav {
  readonly compact = input<boolean>(false);
  readonly demoInfoRequested = output();

  onDemoInfo(): void {
    this.demoInfoRequested.emit();
  }
}
