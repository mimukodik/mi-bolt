import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, signal, viewChild } from '@angular/core';
import { provideZonelessChangeDetection } from '@angular/core';

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
  template: `
    <app-mobile-drawer
      [opened]="opened()"
      [triggerEl]="triggerEl()"
      (closed)="closed.set(true)"
    >
      @for (link of navLinks(); track link.label) {
        <a [href]="link.routerLink">{{ link.label }}</a>
      }
    </app-mobile-drawer>
    <button #trigger type="button" data-testid="drawer-trigger">Menü</button>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class MobileDrawerHost {
  readonly opened = signal(false);
  readonly closed = signal(false);
  // `viewChild` (non-required) returns `undefined` until the view is
  // attached; the optional form lets `afterNextRender` defer the read
  // safely across the test-bed's first change-detection pass.
  readonly trigger = viewChild<ElementRef<HTMLElement>>('trigger');

  readonly navLinks = input<ReadonlyArray<{ label: string; routerLink: string }>>([
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
