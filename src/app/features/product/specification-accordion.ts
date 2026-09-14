import { Component, computed, input, signal } from '@angular/core';

import type { SpecGroup } from '../../api/generated/models/spec-group';

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
  template: `
    <section class="root" aria-label="Műszaki adatok" data-testid="spec-accordion">
      @for (group of groups(); track group.id) {
        <div class="group" [attr.data-testid]="'spec-group-' + group.id">
          <h3 class="heading">
            <button
              type="button"
              class="trigger"
              [id]="'spec-trigger-' + group.id"
              [attr.aria-expanded]="isOpen(group.id)"
              [attr.aria-controls]="'spec-panel-' + group.id"
              [attr.data-testid]="'spec-disclosure-' + group.id"
              (click)="toggle(group.id)"
            >
              <span class="title">{{ group.title }}</span>
              <span class="caret" aria-hidden="true">{{ isOpen(group.id) ? '−' : '+' }}</span>
            </button>
          </h3>
          @if (isOpen(group.id)) {
            <div
              class="panel"
              role="region"
              [id]="'spec-panel-' + group.id"
              [attr.aria-labelledby]="'spec-trigger-' + group.id"
              [attr.data-testid]="'spec-panel-' + group.id"
            >
              <dl class="rows">
                @for (row of group.rows; track row.label) {
                  <div class="row">
                    <dt class="label">{{ row.label }}</dt>
                    <dd class="value">{{ row.value }}</dd>
                  </div>
                }
              </dl>
            </div>
          }
        </div>
      }
    </section>
  `,
  styles: [
    `
      :host { display: block; }

      .root {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
      }

      .group {
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        background: var(--color-surface-light);
      }

      .heading {
        margin: 0;
      }

      .trigger {
        display: flex;
        width: 100%;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        min-height: var(--size-control);
        padding: 0 var(--space-4);
        border: 0;
        background: transparent;
        color: var(--color-text-primary);
        font-family: inherit;
        font-size: var(--type-body);
        font-weight: var(--weight-medium);
        text-align: left;
        cursor: pointer;
      }

      .trigger:hover {
        background: var(--color-surface-section);
      }

      .trigger:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: -2px;
      }

      .caret {
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        color: var(--color-text-secondary);
        line-height: 1;
      }

      .panel {
        padding: 0 var(--space-4) var(--space-4);
      }

      .rows {
        display: grid;
        grid-template-columns: minmax(0, 12rem) minmax(0, 1fr);
        gap: var(--space-2) var(--space-4);
        margin: 0;
      }

      .row {
        display: contents;
      }

      .label {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        margin: 0;
      }

      .value {
        font-size: var(--type-body);
        color: var(--color-text-primary);
        margin: 0;
      }

      @media (max-width: 640px) {
        .rows {
          grid-template-columns: minmax(0, 1fr);
          gap: var(--space-1) 0;
        }
        .row {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          padding-bottom: var(--space-2);
          border-bottom: 1px solid var(--color-border-subtle);
        }
        .row:last-of-type {
          border-bottom: 0;
        }
      }
    `,
  ],
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