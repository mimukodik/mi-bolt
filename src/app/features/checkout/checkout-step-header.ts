import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/** One breadcrumb link, in the order the header should render it. */
export interface CheckoutCrumb {
  readonly label: string;
  readonly link: string;
}

/**
 * Shared page header for every checkout step (contact / delivery / review /
 * success). Renders the breadcrumb trail and projects the step's heading +
 * notice + (for success) the checkmark through `<ng-content />`.
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
  readonly current = input.required<string>();
}
