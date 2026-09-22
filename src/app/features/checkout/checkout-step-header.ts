import { Component, input } from '@angular/core';
import { BREADCRUMB_VISIBLE } from '../../core/navigation/breadcrumb-visibility';
import { RouterLink } from '@angular/router';

/** One breadcrumb link, in the order the header should render it. */
export interface CheckoutCrumb {
  readonly label: string;
  readonly link: string;
}

/**
 * Shared page header for every checkout step (contact / delivery / review /
 * success). Renders the breadcrumb trail (switched off for now, MIM-234) and
 * projects the step's heading + notice + (for success) the checkmark through
 * `<ng-content />`.
 *
 * Styled entirely with Tailwind utilities — no companion `.scss`. The class
 * names the existing specs and the FIX-55 anchor selector rely on
 * (`nav.breadcrumbs`, `a.breadcrumb`, `.breadcrumb.is-current`,
 * `.breadcrumb__sep`) are kept verbatim so the existing tests stay green.
 */
@Component({
  selector: 'app-checkout-step-header',
  imports: [RouterLink],
  templateUrl: './checkout-step-header.html',
  host: { class: 'block' },
})
export class CheckoutStepHeader {
  readonly crumbs = input.required<readonly CheckoutCrumb[]>();
  /** Switched off for now (MIM-234); the nav stays in place behind this flag. */
  protected readonly breadcrumbVisible = BREADCRUMB_VISIBLE;
  readonly current = input.required<string>();
}
