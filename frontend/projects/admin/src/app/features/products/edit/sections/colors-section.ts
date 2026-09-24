import { Component, computed, input } from '@angular/core';
import { CdkDrag, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { FormField } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';

import { emptyColor } from '../product-form.model';
import type { ColorModel } from '../product-form.model';
import { SectionCard } from '../section-card';
import { ControlError } from '../../../../shared/forms/control-error';
import { ImageUpload } from '../../../../shared/image-upload/image-upload';

/**
 * The same accepted set as `product-form.schema.ts`'s `HEX_PATTERN` — the schema
 * module keeps that constant private and does not export it, so the picker
 * guards its own input against a hand-typed Hex value.
 */
const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Section 3 of the product edit page, Színek és képek: one block per colour
 * with the swatch, code, name, alt text and image, added from the card header,
 * reordered by drag or by the row menu's Feljebb and Lejjebb, removed with
 * Törlés.
 */
@Component({
  selector: 'adm-colors-section',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    ControlError,
    FormField,
    ImageUpload,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    SectionCard,
  ],
  templateUrl: './colors-section.html',
  styles: `
    .adm-swatch-picker {
      width: 3rem;
      height: 3.5rem;
      padding: 0;
      border: none;
      background: none;
      cursor: pointer;
    }
    .adm-color-indent {
      margin-inline-start: 3rem;
    }
    .adm-array-error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: 0;
    }
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

  /** The list's own error (fewer than 1), shown only after a save attempt. */
  protected readonly arrayError = computed(() =>
    this.attempted() ? (this.field()().errors()[0]?.message ?? '') : '',
  );

  /**
   * The `<input type="color">` value for a swatch: the native picker only
   * accepts a lowercase `#rrggbb`, and every seeded swatch is uppercase.
   */
  protected pickerValue(hex: string): string {
    return HEX.test(hex) ? hex.toLowerCase() : '#000000';
  }

  /** Writes the picker's lowercase colour back into the Hex field, uppercased. */
  protected setSwatch(color: FieldTree<ColorModel>, event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    color.swatchHex().value.set(target.value.toUpperCase());
  }

  protected add(): void {
    this.field()().value.update((items) => [...items, emptyColor()]);
  }

  protected remove(index: number): void {
    this.field()().value.update((items) => items.filter((_, i) => i !== index));
  }

  protected move(index: number, delta: -1 | 1): void {
    this.field()().value.update((items) => {
      const copy = [...items];
      moveItemInArray(copy, index, index + delta);
      return copy;
    });
  }

  protected drop(event: CdkDragDrop<unknown>): void {
    this.field()().value.update((items) => {
      const copy = [...items];
      moveItemInArray(copy, event.previousIndex, event.currentIndex);
      return copy;
    });
  }
}
