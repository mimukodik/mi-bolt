import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * `Hero`: the navy hero band of the home page. `title` is the plain first
 * line of the heading, `subtitle` the lime second line; the lead paragraph
 * and the two CTA labels are local copy. Mobile and desktop share one
 * column: eyebrow, heading, message, CTA row; the three shortcut cards
 * follow as their own navy band (docs/design/yettel.md §9).
 */
@Component({
  selector: 'app-hero',
  imports: [RouterLink],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
}
