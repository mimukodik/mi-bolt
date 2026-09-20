import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * `FooterNav` — single dark bar carrying the MiBolt brand, the demo
 * disclaimer sentence and one outlined CTA linking to the home page's
 * how-it-works section. Rendered by `AppShell` on every layout.
 *
 * Required by R02: the same partner brand and same footer on every
 * standard page.
 */
@Component({
  selector: 'app-footer-nav',
  imports: [RouterLink],
  templateUrl: './footer-nav.html',
  styleUrl: './footer-nav.scss',
})
export class FooterNav {
  protected readonly tag = 'app-footer-nav';
}
