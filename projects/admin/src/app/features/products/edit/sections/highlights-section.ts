import { Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

import type { HighlightModel } from '../product-form.model';
import { SectionCard } from '../section-card';

/**
 * Section 2 of the product edit page, Kiemelések: the highlight texts. Stub:
 * F21 writes the fields; the inputs and the header are final.
 */
@Component({
  selector: 'adm-highlights-section',
  imports: [SectionCard],
  template: `
    <adm-section-card title="Kiemelések" [errorCount]="errorCount()" [number]="2">
      <p>Ez a szakasz a következő lépésben készül el.</p>
    </adm-section-card>
  `,
})
export class HighlightsSection {
  readonly field = input.required<FieldTree<HighlightModel[]>>();
  readonly attempted = input.required<boolean>();

  /** Errors of this section's field, shown once a save was attempted. */
  protected readonly errorCount = computed(() => {
    if (!this.attempted()) return 0;
    const field = this.field();
    return field().errorSummary().length;
  });
}
