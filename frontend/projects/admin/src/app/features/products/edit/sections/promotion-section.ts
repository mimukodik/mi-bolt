import { Component, input } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import type { ProductFormModel } from '../product-form.model';
import { SectionCard } from '../section-card';

@Component({
  selector: 'adm-promotion-section',
  imports: [FormField, MatFormFieldModule, MatInputModule, SectionCard],
  templateUrl: './promotion-section.html',
})
export class PromotionSection {
  readonly form = input.required<FieldTree<ProductFormModel>>();
  readonly attempted = input.required<boolean>();

  protected error(field: { errors(): readonly { message?: string }[] }): string {
    return this.attempted() ? (field.errors()[0]?.message ?? '') : '';
  }
}
