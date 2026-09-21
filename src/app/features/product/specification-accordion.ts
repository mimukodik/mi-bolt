import { Component, input } from '@angular/core';

import type { SpecGroup } from '../../api/generated/models/spec-group';

/**
 * Specification boxes on the device page: every group is an always-open
 * bordered box with a titled header and label/value rows, laid out in
 * columns. Pure presentation, no state.
 */
@Component({
  selector: 'app-specification-accordion',
  templateUrl: './specification-accordion.html',
  styleUrl: './specification-accordion.scss',
})
export class SpecificationAccordion {
  readonly groups = input.required<readonly SpecGroup[]>();
}
