import { Component, computed, input } from '@angular/core';
import type { FieldTree } from '@angular/forms/signals';

import type { SpecGroupModel } from '../product-form.model';
import { SectionCard } from '../section-card';

/**
 * Section 5 of the product edit page, Specifikáció: spec group titles and
 * rows. Stub: F21 writes the fields; the inputs and the header are final.
 */
@Component({
  selector: 'adm-spec-groups-section',
  imports: [SectionCard],
  template: `
    <adm-section-card title="Specifikáció" [errorCount]="errorCount()" [number]="5">
      <p>Ez a szakasz a következő lépésben készül el.</p>
    </adm-section-card>
  `,
})
export class SpecGroupsSection {
  readonly field = input.required<FieldTree<SpecGroupModel[]>>();
  readonly attempted = input.required<boolean>();

  /** Errors of this section's field, shown once a save was attempted. */
  protected readonly errorCount = computed(() => {
    if (!this.attempted()) return 0;
    const field = this.field();
    return field().errorSummary().length;
  });
}
