import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { AppShell } from '../shared/shell/app-shell';

/**
 * `MarketingLayout` is the shell for the Home route.
 *
 * Family S1 — Home: the dark hero, three restrained category shortcuts,
 * featured product grid and three how-it-works tiles live inside the
 * page component (`HomePage`). The shell only owns the chrome around
 * them and exposes a single `<main id="main-content">` landmark so the
 * skip link in the root lands on the right place.
 *
 * The H1 belongs to the lazy page; the layout carries zero headings so
 * the "ONE H1 per page" rule is guaranteed by structure.
 */
@Component({
  selector: 'app-marketing-layout',
  imports: [AppShell, RouterOutlet],
  templateUrl: './marketing-layout.html',
  styleUrl: './marketing-layout.scss',
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class MarketingLayout {}
