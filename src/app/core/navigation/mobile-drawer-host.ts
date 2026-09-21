import type { ElementRef } from '@angular/core';
import { Component, afterNextRender, input, signal, viewChild } from '@angular/core';

import { MobileDrawer } from './mobile-drawer';

/**
 * Test-only host wrapper for the MobileDrawer.
 *
 * Vitest transforms files under `tests/` without enabling the
 * TypeScript experimentalDecorators flag, so test specs cannot declare
 * inline `@Component` classes. This host component lives in `src/`
 * (where decorators parse normally) so the unit test can mount the
 * real `MobileDrawer` primitive without inline decorator declarations.
 *
 * It is not used in any production route.
 */
@Component({
  selector: 'app-mobile-drawer-host',
  imports: [MobileDrawer],
  templateUrl: './mobile-drawer-host.html',
  styleUrl: './mobile-drawer-host.scss',
})
export class MobileDrawerHost {
  readonly opened = signal(false);
  readonly closed = signal(false);
  // `viewChild` (non-required) returns `undefined` until the view is
  // attached; the optional form lets `afterNextRender` defer the read
  // safely across the test-bed's first change-detection pass.
  readonly trigger = viewChild<ElementRef<HTMLElement>>('trigger');

  readonly navLinks = input<readonly { label: string; routerLink: string }[]>([
    { label: 'Mobiltelefonok', routerLink: '/telefonok' },
    { label: 'A demóról', routerLink: '/' },
  ]);

  readonly triggerEl = signal<HTMLElement | null>(null);

  constructor() {
    afterNextRender(() => {
      const trigger = this.trigger();
      if (trigger !== undefined) {
        this.triggerEl.set(trigger.nativeElement);
      }
    });
  }
}
