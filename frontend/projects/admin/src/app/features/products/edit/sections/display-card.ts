import { Component, computed, input } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormField } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';

import { ControlError } from '../../../../shared/forms/control-error';
import type { ProductFormModel } from '../product-form.model';
import { SectionCard } from '../section-card';

/**
 * The side card of the product edit page, Megjelenítés: Kiemelt, Rangsor,
 * Népszerűség. The hint counts the featured products including this one while
 * the count is known, and the schema's cap error appears under the toggle
 * through `adm-control-error` once the toggle was touched.
 */
@Component({
  selector: 'adm-display-card',
  imports: [
    ControlError,
    FormField,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    SectionCard,
  ],
  templateUrl: './display-card.html',
  styles: `
    .adm-featured-hint {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
    }
  `,
})
export class DisplayCard {
  readonly form = input.required<FieldTree<ProductFormModel>>();
  readonly attempted = input.required<boolean>();
  readonly featuredOthers = input.required<number | null>();

  /** The featured cap the hint counts against, the same number `productFormSchema`'s `featuredLimit` uses. */
  protected readonly max = 4;

  /** The featured products counted with this one, or `null` while the others are unknown. */
  protected readonly featuredCount = computed(() => {
    const others = this.featuredOthers();
    return others === null ? null : others + (this.form().featured().value() ? 1 : 0);
  });

  protected readonly featuredHint = computed(() => {
    const count = this.featuredCount();
    return count === null ? '' : `${String(count)} / ${String(this.max)} kiemelt termék`;
  });

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
