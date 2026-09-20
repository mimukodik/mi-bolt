import { Component, computed, input, signal } from '@angular/core';

import type { SpecGroup } from '../../api/legacy/models/spec-group';

/**
 * T16 — accessible specification accordion (T16-AC03).
 *
 * Each spec group is a disclosure widget built around a button with
 * `aria-expanded`. The button owns the visibility state; the panel
 * below is a real region with `role="region"` and `aria-labelledby`
 * so screen readers announce the heading when the disclosure
 * expands.
 *
 * Required states:
 *   - collapsed — button `aria-expanded="false"`, panel hidden.
 *   - expanded  — button `aria-expanded="true"`, panel visible.
 *
 * No additional dependencies: the widget is pure presentation. A
 * consumer can either let each group own its own signal (the default)
 * or pass an initial open group id via `openedGroupId` to keep the
 * disclosure synced across renders.
 */
@Component({
  selector: 'app-specification-accordion',
  templateUrl: './specification-accordion.html',
  styleUrl: './specification-accordion.scss',
})
export class SpecificationAccordion {
  readonly groups = input.required<readonly SpecGroup[]>();
  /** Optional group id kept open by default (others start collapsed). */
  readonly openedGroupId = input<string | null>(null);

  private readonly openSet = signal<ReadonlySet<string>>(new Set<string>());

  /** A computed view of which group ids are currently open. */
  readonly open = computed<ReadonlySet<string>>(() => {
    const seed = this.openedGroupId();
    if (seed === null) return this.openSet();
    const merged = new Set(this.openSet());
    if (!merged.has(seed)) merged.add(seed);
    return merged;
  });

  toggle(id: string): void {
    const next = new Set(this.openSet());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.openSet.set(next);
  }

  isOpen(id: string): boolean {
    return this.open().has(id);
  }
}
