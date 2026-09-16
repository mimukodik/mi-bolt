/**
 * Coverage canary — lazy-loaded Angular component used by the E2E
 * coverage suite. The standalone component renders the branch
 * returned by `branch(flag)` so the browser coverage counters see
 * every code path of `canary.ts` whenever a Playwright spec navigates
 * to `/canary?branch=true|false`.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

import { branch } from './canary';

@Component({
  selector: 'app-coverage-canary',
  templateUrl: './canary-page.html',
  styleUrl: './canary-page.scss',
})
export class CoverageCanaryPage {
  private readonly flag = signal<boolean>(false);

  readonly label = computed(() => branch(this.flag()));

  constructor() {
    const route = inject(ActivatedRoute);
    const raw = route.snapshot.queryParamMap.get('branch');
    const flag = raw === null ? false : raw === 'true';
    this.flag.set(flag);
  }
}