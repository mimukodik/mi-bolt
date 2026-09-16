import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * `Hero` — dark charcoal hero for the home page (S1).
 *
 * Layout contract:
 *   - Mobile (default) content order: heading, message, CTA,
 *     illustration, shortcuts. Verified by T14-AC05.
 *   - Desktop: two columns — copy left, illustration right; the
 *     shortcuts stay below in their own row so the visual order
 *     remains identical to the mobile source order.
 *
 * Visual contract:
 *   - R02: dark hero only on a marketing page.
 *   - R03: orange accent + charcoal text + neutral surfaces.
 *   - R06: 8 px spacing rhythm, 8 px card radius, 6 px control radius.
 *   - R08: one prominent primary action; secondary shortcuts restrained.
 *   - R10/R11: no functional text inside the decorative SVG.
 *   - R12: Hungarian copy with correct accents.
 *   - R21: every interactive element meets the 44×44 CSS px target.
 *
 * The CTA is live Hungarian text inside an anchor, never an image
 * (R10). The SVG illustration is `aria-hidden` and contains no
 * readable copy. Shortcuts render as `<a>` elements with the 44 px
 * control height token and a visible focus ring.
 */
@Component({
  selector: 'app-hero',
  imports: [RouterLink],
  templateUrl: './hero.html',
  styleUrl: './hero.scss',
})
export class Hero {}
