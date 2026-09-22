import { readFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * MIM-238 follow-up, WCAG 2.2 SC 2.4.11 (Focus Not Obscured) and the
 * footer's last button: below 1024px the product page's purchase rail
 * is fixed to the viewport bottom, so the root scroller keeps the
 * rail's height plus a 4px focus-ring gap as bottom scroll padding
 * (a focused element lands above the rail; W3C technique C43) and the
 * footer keeps the rail's height plus its own bottom padding (1.5rem, 2rem from 640px)
 * (its last button is not covered by the rail, even while a message
 * row makes the rail taller than `--rail-height`).
 *
 * jsdom applies no stylesheet, so this pins the rule's text; the
 * browser pass measures the Tab walk.
 */
describe('MIM-238: focus and the footer clear the fixed purchase rail', () => {
  const css = readFileSync(pathResolve(process.cwd(), 'src/styles/primitives.css'), 'utf8');
  const railHeight =
    'var(--rail-block-size, calc(env(safe-area-inset-bottom) + var(--rail-height)))';

  /** Every `@media (max-width: 1023px) { ... }` block, found by brace
   *  matching rather than by the first `\n}\n` after the first match.
   *  Comments are stripped first so a brace inside a comment cannot
   *  desync the depth counter. */
  function narrowBlocks(): string[] {
    const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const blocks: string[] = [];
    let from = source.indexOf('@media (max-width: 1023px)');
    while (from !== -1) {
      const open = source.indexOf('{', from);
      let depth = 0;
      let end = open;
      for (let i = open; i < source.length; i += 1) {
        if (source[i] === '{') depth += 1;
        if (source[i] === '}') depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
      blocks.push(source.slice(open + 1, end));
      from = source.indexOf('@media (max-width: 1023px)', end);
    }
    return blocks;
  }

  it('the root scroller keeps the measured rail height plus the focus ring as bottom scroll padding, below 1024px only', () => {
    const rule = `html:has(app-mobile-buy-rail) {\n    scroll-padding-bottom: calc(\n      ${railHeight} + 4px\n    );\n  }`;
    expect(narrowBlocks().some((block) => block.includes(rule))).toBe(true);
    expect(css.split('html:has(app-mobile-buy-rail)').length - 1).toBe(1);
  });

  it('the footer keeps the measured rail height plus its own 1.5rem as bottom padding, below 1024px only', () => {
    const rule = `body:has(app-mobile-buy-rail) app-footer-nav .footer {\n    padding-bottom: calc(\n      ${railHeight} + 1.5rem\n    );\n  }`;
    expect(narrowBlocks().some((block) => block.includes(rule))).toBe(true);
    expect(css.split('body:has(app-mobile-buy-rail) app-footer-nav .footer').length - 1).toBe(2);
  });

  it('from 640px the footer keeps the measured rail height plus its own sm:py-8 2rem, below 1024px only', () => {
    const rule = `@media (min-width: 640px) {\n    body:has(app-mobile-buy-rail) app-footer-nav .footer {\n      padding-bottom: calc(\n        ${railHeight} + 2rem\n      );\n    }\n  }`;
    expect(narrowBlocks().some((block) => block.includes(rule))).toBe(true);
  });
});
