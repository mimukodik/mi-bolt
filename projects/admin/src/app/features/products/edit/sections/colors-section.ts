import { Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

import type { ColorModel } from '../product-form.model';
import { SectionCard } from '../section-card';

/**
 * Section 3 of the product edit page, Színek és képek: colour code, name,
 * swatch, alt, image. Stub: F23 writes the fields; the inputs and the header
 * are final.
 */
@Component({
  selector: 'adm-colors-section',
  imports: [SectionCard],
  template: `
    <adm-section-card title="Színek és képek" [errorCount]="errorCount()" [number]="3">
      <p>Ez a szakasz a következő lépésben készül el.</p>
    </adm-section-card>
  `,
})
export class ColorsSection {
  readonly field = input.required<FieldTree<ColorModel[]>>();
  readonly attempted = input.required<boolean>();

  /** Errors of this section's field, shown once a save was attempted. */
  protected readonly errorCount = computed(() => {
    if (!this.attempted()) return 0;
    const field = this.field();
    return field().errorSummary().length;
  });
}
