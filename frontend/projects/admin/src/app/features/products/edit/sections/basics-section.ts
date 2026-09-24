import { Component, computed, input } from '@angular/core';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormField } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';

import type { ProductFormModel } from '../product-form.model';
import { SectionCard } from '../section-card';
import { slugify } from '../slugify';

/**
 * Section 1 of the product edit page, Alapadatok: név, márka, slug, leírás,
 * megjelenés dátuma, 5G. Stub: F20 writes the fields; the inputs and the header are final.
 */
@Component({
  selector: 'adm-basics-section',
  imports: [
    CdkTextareaAutosize,
    FormField,
    MatAutocompleteModule,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSlideToggleModule,
    SectionCard,
  ],
  providers: [provideNativeDateAdapter(), { provide: MAT_DATE_LOCALE, useValue: 'hu-HU' }],
  templateUrl: './basics-section.html',
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

  /** The brand list filtered to what the user typed, or the whole list while the field is empty. */
  protected readonly brandOptions = computed(() => {
    const typed = this.form().brand().value().trim().toLocaleLowerCase('hu-HU');
    return typed === ''
      ? this.brands()
      : this.brands().filter((brand) => brand.toLocaleLowerCase('hu-HU').includes(typed));
  });

  /** Fills the slug from the current name and shows any resulting error at once. */
  protected generateSlug(): void {
    this.form().slug().value.set(slugify(this.form().name().value()));
    this.form().slug().markAsTouched();
  }
}
