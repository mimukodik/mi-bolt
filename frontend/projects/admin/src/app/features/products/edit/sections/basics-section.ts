import { Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

import type { ProductFormModel } from '../product-form.model';
import { SectionCard } from '../section-card';

/**
 * Section 1 of the product edit page, Alapadatok: név, márka, slug, leírás,
 * megjelenés dátuma, 5G. Stub: F20 writes the fields; the inputs and the header are final.
 */
@Component({
  selector: 'adm-basics-section',
  imports: [SectionCard],
  template: `
    <adm-section-card title="Alapadatok" [errorCount]="errorCount()" [number]="1">
      <p>Ez a szakasz a következő lépésben készül el.</p>
    </adm-section-card>
  `,
})
export class BasicsSection {
  readonly form = input.required<FieldTree<ProductFormModel>>();
  readonly attempted = input.required<boolean>();
  readonly brands = input.required<readonly string[]>();

  /** Errors of this section's fields, shown once a save was attempted. */
  protected readonly errorCount = computed(() => {
    if (!this.attempted()) return 0;
    const form = this.form();
    return [form.slug, form.brand, form.name, form.description, form.releasedAt, form.is5g].reduce(
      (sum, field) => sum + field().errorSummary().length,
      0,
    );
  });
}
