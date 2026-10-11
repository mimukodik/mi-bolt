import { Component, computed, input } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import type { FieldTree } from '@angular/forms/signals';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ControlError } from '../../../../shared/forms/control-error';
import type { PromotionModel } from '../product-form.model';
import { SectionCard } from '../section-card';

@Component({
  selector: 'adm-promotion-section',
  imports: [
    FormField,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    ControlError,
    SectionCard,
  ],
  templateUrl: './promotion-section.html',
})
export class PromotionSection {
  readonly field = input.required<FieldTree<PromotionModel>>();
  readonly attempted = input.required<boolean>();
  protected readonly errorCount = computed(() =>
    this.attempted() ? this.field()().errorSummary().length : 0,
  );
}
