import { Component, computed, input } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FormField } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';

import { ControlError } from '../../../../shared/forms/control-error';
import { emptyVariant } from '../product-form.model';
import type { ColorModel, ProductFormModel, VariantModel } from '../product-form.model';
import { SectionCard } from '../section-card';
import { variantId } from '../variant-id';

/**
 * Section 4 of the product edit page, Változatok: one row per variant with its
 * colour (one of the section 3 colours), its storage, its price in forint and
 * its stock, plus the id the row will be saved under — the kept id while the
 * colour and storage pair is unchanged, the id a new pair will get otherwise.
 */
@Component({
  selector: 'adm-variants-section',
  imports: [
    ControlError,
    FormField,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    SectionCard,
  ],
  templateUrl: './variants-section.html',
  styles: `
    .adm-swatch {
      display: inline-block;
      width: 1rem;
      height: 1rem;
      margin-inline-end: 0.5rem;
      vertical-align: middle;
      border-radius: 50%;
      border: 1px solid var(--mat-sys-outline-variant);
    }
    .adm-variant-id {
      margin: 0;
      color: var(--mat-sys-on-surface-variant);
      font: var(--mat-sys-body-small);
      overflow-wrap: anywhere;
    }
    .adm-array-error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: 0;
    }
  `,
})
export class VariantsSection {
  readonly form = input.required<FieldTree<ProductFormModel>>();
  readonly attempted = input.required<boolean>();

  /** The colours of section 3: the only values a variant's colour may take. */
  protected readonly colors = computed(() => this.form().colors().value());

  /** Errors of this section's field, shown once a save was attempted. */
  protected readonly errorCount = computed(() => {
    if (!this.attempted()) return 0;
    return this.form().variants().errorSummary().length;
  });

  /** The list's own error (fewer than 1), shown only after a save attempt. */
  protected readonly arrayError = computed(() =>
    this.attempted() ? (this.form().variants().errors()[0]?.message ?? '') : '',
  );

  protected referenceText(amount: number): string {
    return new Intl.NumberFormat('hu-HU').format(amount);
  }

  protected colorName(color: ColorModel): string {
    return color.name.trim() === '' ? 'Névtelen szín' : color.name;
  }

  /**
   * The row's id line. The backend matches variants by (colour code, storage),
   * not by id: a kept pair keeps its id, any other pair gets a derived one, so
   * a row whose colour or storage was changed shows the new id with `(új)`.
   */
  protected idText(variant: VariantModel): string {
    const color = this.colors().find((c) => c.key === variant.colorKey);
    const slug = this.form().slug().value();
    const derived =
      color !== undefined && color.code !== '' && variant.storageGb !== null && slug !== ''
        ? variantId(slug, color.code, variant.storageGb)
        : null;
    if (variant.id !== null && variant.id === derived) {
      return `azonosító: ${variant.id}`;
    }
    if (derived !== null) {
      return `azonosító: ${derived} (új)`;
    }
    return 'azonosító: mentéskor készül';
  }

  /** Appends a variant on the first colour: the row can only save with a known colour. */
  protected add(): void {
    this.form()
      .variants()
      .value.update((items) => [...items, emptyVariant(this.colors()[0]?.key ?? null)]);
  }

  protected remove(index: number): void {
    this.form()
      .variants()
      .value.update((items) => items.filter((_, i) => i !== index));
  }
}
