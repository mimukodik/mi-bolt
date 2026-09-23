import { Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

import type { ProductFormModel } from '../product-form.model';
import { SectionCard } from '../section-card';

/**
 * The side card of the product edit page, Megjelenítés: Kiemelt, Rangsor,
 * Népszerűség. Stub: F20 writes the fields; the inputs and the header are final.
 */
@Component({
  selector: 'adm-display-card',
  imports: [SectionCard],
  template: `
    <adm-section-card title="Megjelenítés" [errorCount]="errorCount()">
      <p>Ez a szakasz a következő lépésben készül el.</p>
    </adm-section-card>
  `,
})
export class DisplayCard {
  readonly form = input.required<FieldTree<ProductFormModel>>();
  readonly attempted = input.required<boolean>();
  readonly featuredOthers = input.required<number | null>();

  /** Errors of this section's fields, shown once a save was attempted. */
  protected readonly errorCount = computed(() => {
    if (!this.attempted()) return 0;
    const form = this.form();
    return [form.featured, form.rank, form.popularityScore].reduce(
      (sum, field) => sum + field().errorSummary().length,
      0,
    );
  });
}
