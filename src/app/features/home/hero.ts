import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * `Hero` — dark charcoal hero for the home page (S1).
 *
 * Layout contract:
 *   - Mobile (default) content order: eyebrow, heading, message, CTA
 *     row (primary + secondary), illustration, then the three
 *     category shortcut cards as a sibling section after the hero.
 *     Verified by T14-AC05.
 *   - Desktop: two columns — copy left, illustration right; the
 *     shortcut cards render as their own row below the hero.
 *
 * Visual contract:
 *   - R02: dark hero only on a marketing page.
 *   - R03: orange accent + charcoal text + neutral surfaces.
 *   - R06: 8 px spacing rhythm, 8 px card radius, 6 px control radius.
 *   - R08: one prominent primary action; the secondary CTA and the
 *     shortcut cards are restrained.
 *   - R10/R11: no functional text inside the decorative SVG; the
 *     illustration caption is a live text node, not part of the SVG.
 *   - R12: Hungarian copy with correct accents.
 *   - R21: every interactive element meets the 44×44 CSS px target.
 *
 * The CTA is live Hungarian text inside an anchor, never an image
 * (R10). The SVG illustration is `aria-hidden` and contains no
 * readable copy. Shortcut cards render as `<a>` elements with a
 * visible focus ring.
 */
@Component({
  selector: 'app-hero',
  imports: [RouterLink],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {
  protected readonly tag = 'app-hero';
}
