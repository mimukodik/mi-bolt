import { readFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MIM-238 follow-up, WCAG 2.2 SC 2.4.11 (Focus Not Obscured): below 1024px
 * the product page's purchase rail is fixed to the viewport bottom, so the
 * root scroller keeps the rail's height as bottom scroll padding and a
 * focused element is scrolled into view above the rail (W3C technique C43).
 * jsdom applies no stylesheet, so this pins the rule's text; the browser
 * pass measures the Tab walk.
 */
describe('MIM-238: focus clears the fixed purchase rail', () => {
  const css = readFileSync(pathResolve(process.cwd(), 'src/styles/primitives.css'), 'utf8');

  it('the root scroller has the rail height as bottom scroll padding on a page with the rail', () => {
    const rule =
      /html:has\(app-mobile-buy-rail\)\s*\{\s*scroll-padding-bottom:\s*calc\(env\(safe-area-inset-bottom\) \+ var\(--rail-height\)\);\s*\}/;
    expect(css).toMatch(rule);
  });

  it('the scroll padding applies below 1024px only, inside the rail breakpoint', () => {
    const block = css.slice(css.indexOf('@media (max-width: 1023px)'));
    expect(block.indexOf('html:has(app-mobile-buy-rail)')).toBeGreaterThan(0);
    expect(block.indexOf('html:has(app-mobile-buy-rail)')).toBeLessThan(block.indexOf('\n}\n'));
  });
});
