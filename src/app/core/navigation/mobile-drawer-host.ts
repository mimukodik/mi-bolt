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
  readonly trigger = viewChild.required<ElementRef<HTMLElement>>('trigger');

  readonly navLinks = input<ReadonlyArray<{ label: string; routerLink: string }>>([
    { label: 'Mobiltelefonok', routerLink: '/telefonok' },
    { label: 'A demóról', routerLink: '/' },
  ]);

  readonly triggerEl = signal<HTMLElement | null>(null);

  constructor() {
    // Resolve the trigger after the view has rendered. Reading
    // `this.trigger()` from the constructor throws NG0951 because the
    // required view child has not been attached yet; deferring to
    // `afterNextRender` makes the read safe in both the Angular test
    // bed (which calls it in `provideZonelessChangeDetection` mode) and
    // the production runtime.
    afterNextRender(() => {
      this.triggerEl.set(this.trigger().nativeElement);
    });
  }
}
