import { Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

import type { ProductFormModel } from '../product-form.model';
import { SectionCard } from '../section-card';

/**
 * Section 4 of the product edit page, Változatok: variant colour, storage,
 * price, stock. Stub: F24 writes the fields; the inputs and the header are
 * final.
 */
@Component({
  selector: 'adm-variants-section',
  imports: [SectionCard],
  template: `
    <adm-section-card title="Változatok" [errorCount]="errorCount()" [number]="4">
      <p>Ez a szakasz a következő lépésben készül el.</p>
    </adm-section-card>
  `,
})
export class VariantsSection {
  readonly form = input.required<FieldTree<ProductFormModel>>();
  readonly attempted = input.required<boolean>();

  /** Errors of this section's field, shown once a save was attempted. */
  protected readonly errorCount = computed(() => {
    if (!this.attempted()) return 0;
    return this.form().variants().errorSummary().length;
  });
}
