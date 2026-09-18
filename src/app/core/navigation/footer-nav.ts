import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * `FooterNav` — brand-consistent footer with two link groups and the
 * partner identity line. The footer is rendered by `AppShell` on every
 * layout (marketing, shop) except the checkout layout, which uses its
 * own compact strip.
 *
 * Footer link groups:
 * - Vásárlás (browse): Mobiltelefonok + Vissza a főoldalra
 * - Információ: A demóról (anchored to the home explainer)
 *
 * Identity line below the link groups is required by R02: the same
 * partner brand and same footer on every standard page.
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
