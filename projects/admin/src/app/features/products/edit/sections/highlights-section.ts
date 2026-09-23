import { Component, Injector, afterNextRender, computed, inject, input } from '@angular/core';
import { CdkDrag, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import type { CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatButtonModule } from '@angular/material/button';
import type { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { FormField } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';

import { emptyHighlight } from '../product-form.model';
import type { HighlightModel } from '../product-form.model';
import { SectionCard } from '../section-card';

/**
 * Section 2 of the product edit page, Kiemelések: the product's short selling
 * points, one text field each, 1 to 6 of them, reordered by drag or by the row
 * menu's Feljebb and Lejjebb for keyboard users, removed with Törlés.
 */
@Component({
  selector: 'adm-highlights-section',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    FormField,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    SectionCard,
  ],
  templateUrl: './highlights-section.html',
  styles: `
    .adm-array-error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: 0;
    }
  `,
})
export class HighlightsSection {
  readonly field = input.required<FieldTree<HighlightModel[]>>();
  readonly attempted = input.required<boolean>();

  private readonly injector = inject(Injector);

  protected readonly max = 6;
  protected readonly maxLength = 280;

  /** Errors of this section's field, shown once a save was attempted. */
  protected readonly errorCount = computed(() => {
    if (!this.attempted()) return 0;
    const field = this.field();
    return field().errorSummary().length;
  });

  /** The list's own error (fewer than 1, more than 6), shown only after a save attempt. */
  protected readonly arrayError = computed(() =>
    this.attempted() ? (this.field()().errors()[0]?.message ?? '') : '',
  );

  protected add(): void {
    this.field()().value.update((items) => [...items, emptyHighlight()]);
  }

  /**
   * Removes one highlight; focus moves to the add button after the next
   * render, because `mat-menu` restores focus to the removed row's own
   * trigger during the same click (its panel's
   * `(click)="closed.emit('click')"` still fires after this handler returns),
   * and only once change detection has removed that trigger from the DOM can
   * this call win without being immediately overridden.
   */
  protected remove(index: number, addButton: MatButton): void {
    this.field()().value.update((items) => items.filter((_, i) => i !== index));
    afterNextRender(
      () => {
        addButton.focus();
      },
      { injector: this.injector },
    );
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
