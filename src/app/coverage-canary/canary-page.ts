/**
 * Coverage canary — lazy-loaded Angular component used by the E2E
 * coverage suite. The standalone component renders the branch
 * returned by `branch(flag)` so the browser coverage counters see
 * every code path of `canary.ts` whenever a Playwright spec navigates
 * to `/canary?branch=true|false`.
 */
import { Component, computed, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { branch, defaultBranch } from './canary';

@Component({
  selector: 'app-coverage-canary',
  standalone: true,
  template: `
    <main class="canary">
      <h1 data-testid="canary-title">Coverage canary</h1>
      <p data-testid="canary-branch">{{ label() }}</p>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .canary {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        padding: 1.5rem 1rem;
      }

      h1 {
        margin: 0;
        font-size: 1.5rem;
        line-height: 1.2;
        font-weight: 600;
      }

      p {
        margin: 0;
        line-height: 1.5;
      }
    `,
  ],
})
export class CoverageCanaryPage {
  private readonly flag = signal<boolean>(false);

  readonly label = computed(() => (this.flag() ? 'A' : 'B'));

  constructor(route: ActivatedRoute) {
    const flag = route.snapshot.queryParamMap.get('branch') === 'true';
    this.flag.set(flag);
  }

  /** Pure helper delegating to the canary function for easy unit testing. */
  resolveBranch(flag: boolean): 'A' | 'B' {
    return branch(flag);
  }

  /** Pure helper delegating to the canary function for easy unit testing. */
  resolveDefault(): 'A' | 'B' {
    return defaultBranch();
  }
}