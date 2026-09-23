import { Component, input } from '@angular/core';
import { MatCard, MatCardContent, MatCardHeader, MatCardTitle } from '@angular/material/card';

/**
 * One card of the product edit page: an optional section number, the title, the
 * error count once a save was attempted (the section passes 0 before that), a
 * slot for header buttons (`admSectionActions`) and the section's body.
 */
@Component({
  selector: 'adm-section-card',
  imports: [MatCard, MatCardHeader, MatCardTitle, MatCardContent],
  template: `
    <mat-card appearance="outlined">
      <mat-card-header class="adm-section-header">
        <mat-card-title class="adm-section-title">
          @if (number(); as number) {
            <span class="adm-section-number">{{ number }}</span>
          }
          <span>{{ title() }}</span>
          @if (errorCount() > 0) {
            <span class="adm-section-errors">{{ errorCount() }} hiba</span>
          }
        </mat-card-title>
        <div class="adm-section-actions"><ng-content select="[admSectionActions]" /></div>
      </mat-card-header>
      <mat-card-content><ng-content /></mat-card-content>
    </mat-card>
  `,
  styles: `
    .adm-section-header {
      align-items: center;
    }
    .adm-section-title {
      display: flex;
      align-items: baseline;
      gap: 0.75rem;
    }
    .adm-section-number {
      color: var(--mat-sys-primary);
    }
    .adm-section-errors {
      color: var(--mat-sys-error);
      font: var(--mat-sys-label-large);
    }
    .adm-section-actions {
      margin-left: auto;
    }
  `,
})
export class SectionCard {
  /** 1-5 for the numbered sections; the side cards have none. */
  readonly number = input<number | null>(null);
  readonly title = input.required<string>();
  readonly errorCount = input(0);
}
