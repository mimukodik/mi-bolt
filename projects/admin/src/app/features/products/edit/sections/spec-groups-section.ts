import {
  Component,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { moveItemInArray } from '@angular/cdk/drag-drop';
import { CdkTextareaAutosize } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import type { MatButton } from '@angular/material/button';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { FormField } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';

import { emptySpecGroup, emptySpecRow } from '../product-form.model';
import type { SpecGroupModel } from '../product-form.model';
import { SectionCard } from '../section-card';

/**
 * Section 5 of the product edit page, Specifikáció: named groups of label/value
 * rows, each group a collapsible panel. A group opens on click, stays open
 * while the user chose to open it, and reopens on its own once a save attempt
 * leaves an error inside it (R3).
 */
@Component({
  selector: 'adm-spec-groups-section',
  imports: [
    CdkTextareaAutosize,
    FormField,
    MatButtonModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    SectionCard,
  ],
  templateUrl: './spec-groups-section.html',
  styles: `
    .adm-array-error {
      color: var(--mat-sys-error);
      font: var(--mat-sys-body-small);
      margin: 0;
    }
  `,
})
export class SpecGroupsSection {
  readonly field = input.required<FieldTree<SpecGroupModel[]>>();
  readonly attempted = input.required<boolean>();

  private readonly injector = inject(Injector);
  private readonly openKeys = signal<ReadonlySet<string>>(new Set());

  /** Errors of this section's field, shown once a save was attempted. */
  protected readonly errorCount = computed(() => {
    if (!this.attempted()) return 0;
    const field = this.field();
    return field().errorSummary().length;
  });

  /** The list's own error (fewer than 1 group), shown only after a save attempt. */
  protected readonly arrayError = computed(() =>
    this.attempted() ? (this.field()().errors()[0]?.message ?? '') : '',
  );

  /** Open while the user chose to open it, or while it holds an error after a save attempt. */
  protected isOpen(group: FieldTree<SpecGroupModel>): boolean {
    return (
      this.openKeys().has(group().value().key) ||
      (this.attempted() && group().errorSummary().length > 0)
    );
  }

  protected markOpen(group: FieldTree<SpecGroupModel>): void {
    const key = group().value().key;
    this.openKeys.update((keys) => new Set(keys).add(key));
  }

  protected markClosed(group: FieldTree<SpecGroupModel>): void {
    const key = group().value().key;
    this.openKeys.update((keys) => {
      const copy = new Set(keys);
      copy.delete(key);
      return copy;
    });
  }

  /** The panel header's description: the row count, plus the error count after a save attempt. */
  protected describe(group: FieldTree<SpecGroupModel>): string {
    const rows = group.rows().value().length;
    const base = `${String(rows)} sor`;
    if (!this.attempted()) return base;
    const errors = group().errorSummary().length;
    return errors > 0 ? `${base} · ${String(errors)} hiba` : base;
  }

  /** The group's own row-list error (fewer than 1 row), shown only after a save attempt. */
  protected rowsError(group: FieldTree<SpecGroupModel>): string {
    return this.attempted() ? (group.rows().errors()[0]?.message ?? '') : '';
  }

  protected addGroup(): void {
    const group = emptySpecGroup();
    this.field()().value.update((groups) => [...groups, group]);
    this.openKeys.update((keys) => new Set(keys).add(group.key));
  }

  protected removeGroup(index: number, addGroupButton: MatButton): void {
    this.field()().value.update((groups) => groups.filter((_, i) => i !== index));
    this.focusAfterRemoval(addGroupButton);
  }

  protected moveGroup(index: number, delta: -1 | 1): void {
    this.field()().value.update((groups) => {
      const copy = [...groups];
      moveItemInArray(copy, index, index + delta);
      return copy;
    });
  }

  protected addRow(group: FieldTree<SpecGroupModel>): void {
    group.rows().value.update((rows) => [...rows, emptySpecRow()]);
  }

  protected removeRow(
    group: FieldTree<SpecGroupModel>,
    index: number,
    addRowButton: MatButton,
  ): void {
    group.rows().value.update((rows) => rows.filter((_, i) => i !== index));
    this.focusAfterRemoval(addRowButton);
  }

  protected moveRow(group: FieldTree<SpecGroupModel>, index: number, delta: -1 | 1): void {
    group.rows().value.update((rows) => {
      const copy = [...rows];
      moveItemInArray(copy, index, index + delta);
      return copy;
    });
  }

  /**
   * The removed item held the menu that focus would return to, so focus moves
   * to the given add button after the next render: `mat-menu` restores focus to
   * the removed item's trigger during the same click, and for a real (trusted)
   * click that restore runs in its own listener with a microtask checkpoint
   * before it, so a microtask here would run first and be overridden.
   */
  private focusAfterRemoval(button: MatButton): void {
    afterNextRender(
      () => {
        button.focus();
      },
      { injector: this.injector },
    );
  }
}
