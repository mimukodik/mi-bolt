import { Component, input } from '@angular/core';
import { HalloweenScenery } from '../../shared/halloween/halloween-scenery';
import { RouterLink } from '@angular/router';

/** Homepage headline, catalogue actions, and category shortcuts. */
@Component({
  selector: 'app-hero',
  imports: [RouterLink, HalloweenScenery],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  readonly title = input.required<string>();
  readonly subtitle = input.required<string>();
}
