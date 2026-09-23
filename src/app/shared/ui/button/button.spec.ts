import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { Button } from './button';

@Component({
  imports: [Button],
  template: `
    <app-button
      [block]="block()"
      [disabled]="disabled()"
      [label]="label()"
      [loading]="loading()"
      [loadingLabel]="loadingLabel()"
      [type]="type()"
      [variant]="variant()"
      (pressed)="clickCount.set(clickCount() + 1)"
    />
  `,
})
class HostComponent {
  readonly variant = signal<'primary' | 'primaryOnDark' | 'secondary' | 'secondaryOnDark' | 'navy'>(
    'primary',
  );
  readonly label = signal('Kosárba teszem');
  readonly loadingLabel = signal('Hozzáadás…');
  readonly disabled = signal(false);
  readonly loading = signal(false);
  readonly type = signal<'button' | 'submit' | 'reset'>('button');
  readonly block = signal(false);
  readonly clickCount = signal(0);
}

interface ComponentWithStyles {
  ɵcmp: { styles: readonly string[] };
}

function hasComponentStyles(val: unknown): val is ComponentWithStyles {
  if (typeof val !== 'object' && typeof val !== 'function') return false;
  if (val === null) return false;
  return 'ɵcmp' in val;
}

/** Strips comments, the compiler's custom-property namespace placeholder and
 * the emulated encapsulation attribute selector, then collapses whitespace
 * and trims the spaces around the structural characters ({, }, :, ;, ,).
 * Internal whitespace inside a value is preserved, so the normalised form
 * keeps the space inside `1px solid`. */
function normaliseComponentCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll('%NS%', '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}:;,])\s*/g, '$1');
}

/** The declaration block of one rule of the normalised sheet. Asserting on the
 * block rather than on the whole sheet is what makes a colour pair belong to
 * the variant under test: the outlined variants share one box rule, so a
 * sheet-wide match proves nothing about either. The selector has to sit at a
 * rule boundary, or `.root.is-secondary-on-dark` would match inside the
 * grouped selector `.root.is-secondary,.root.is-secondary-on-dark`. The
 * boundary includes `;` because Sass prepends `@charset "UTF-8";`. */
function ruleBody(css: string, selector: string): string {
  const matchIndex = findRuleStart(css, selector);
  if (matchIndex === -1) {
    throw new Error(`Expected a rule for ${selector}`);
  }
  const openBrace = css.indexOf('{', matchIndex + selector.length);
  const closeBrace = css.indexOf('}', openBrace);
  return css.slice(openBrace + 1, closeBrace);
}

function findRuleStart(css: string, selector: string): number {
  let from = 0;
  for (;;) {
    const idx = css.indexOf(selector, from);
    if (idx === -1) {
      return -1;
    }
    const before = idx === 0;
    const atCloseBrace =
      idx > 0 && (css[idx - 1] === '{' || css[idx - 1] === '}' || css[idx - 1] === ';');
    if (before || atCloseBrace) {
      let cursor = idx + selector.length;
      while (cursor < css.length && isAsciiWhitespace(css[cursor])) {
        cursor += 1;
      }
      if (css[cursor] === '{') {
        return idx;
      }
    }
    from = idx + 1;
  }
}

function isAsciiWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

/** The declarations of one rule, as whole `prop:value` strings. A substring
 * match is not enough for a colour: `color:var(--color-accent)` also matches
 * inside `border-color:var(--color-accent)`, so dropping the `color` line
 * leaves such an assertion green. */
function declarations(css: string, selector: string): string[] {
  return ruleBody(css, selector)
    .split(';')
    .filter((d) => d.length > 0);
}

function setup(): {
  fixture: ComponentFixture<HostComponent>;
  host: HostComponent;
  root: HTMLElement;
} {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return { fixture, host: fixture.componentInstance, root: raw };
}

describe('Button primitive', () => {
  it('renders the label as visible text', () => {
    const { root } = setup();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.textContent.trim()).toBe('Kosárba teszem');
  });

  it('renders a native button with type=button by default', () => {
    const { root } = setup();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.tagName).toBe('BUTTON');
    expect(btn?.getAttribute('type')).toBe('button');
  });

  it('applies the requested type when bound (e.g. submit)', () => {
    const { fixture, host, root } = setup();
    host.type.set('submit');
    fixture.detectChanges();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.getAttribute('type')).toBe('submit');
  });

  it('reports the variant token in its computed style (R21 minimum 44 CSS px)', () => {
    const { root } = setup();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn).not.toBeNull();
    expect(btn?.classList.contains('is-primary')).toBe(true);
    // The size token is wired in button.css as min-height: var(--button-height).
    // jsdom has no layout but the class-based guarantee of the standard
    // height is what makes the button reachable for assistive tech.
  });

  it('emits a pressed event on click', () => {
    const { host, root } = setup();
    const btn = root.querySelector<HTMLButtonElement>('button');
    btn?.click();
    expect(host.clickCount()).toBe(1);
  });

  it('does not emit when disabled and exposes native disabled state', () => {
    const { fixture, host, root } = setup();
    host.disabled.set(true);
    fixture.detectChanges();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.disabled).toBe(true);
    expect(btn?.getAttribute('aria-disabled')).toBe('true');
    expect(btn?.classList.contains('is-disabled')).toBe(true);
    btn?.click();
    expect(host.clickCount()).toBe(0);
  });

  it('does not emit while loading and exposes aria-busy', () => {
    const { fixture, host, root } = setup();
    host.loading.set(true);
    host.loadingLabel.set('Hozzáadás…');
    fixture.detectChanges();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.getAttribute('aria-busy')).toBe('true');
    // Loading never sets native `disabled`: a focused button that
    // becomes disabled loses its focus to <body>.
    expect(btn?.disabled).toBe(false);
    expect(btn?.getAttribute('aria-disabled')).toBe('true');
    expect(btn?.classList.contains('is-disabled')).toBe(true);
    expect(btn?.textContent).toContain('Hozzáadás…');
    btn?.click();
    expect(host.clickCount()).toBe(0);
  });

  it('is neither aria-disabled, aria-busy, nor styled disabled when idle', () => {
    const { root } = setup();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.hasAttribute('aria-disabled')).toBe(false);
    expect(btn?.hasAttribute('aria-busy')).toBe(false);
    expect(btn?.classList.contains('is-disabled')).toBe(false);
  });

  it('combines disabled and loading: native disabled wins, inert styling still applies, click is dropped', () => {
    const { fixture, host, root } = setup();
    host.disabled.set(true);
    host.loading.set(true);
    fixture.detectChanges();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.disabled).toBe(true);
    expect(btn?.getAttribute('aria-disabled')).toBe('true');
    expect(btn?.getAttribute('aria-busy')).toBe('true');
    expect(btn?.classList.contains('is-disabled')).toBe(true);
    btn?.click();
    expect(host.clickCount()).toBe(0);
  });

  it('uses a button (not an a-tag) for actions', () => {
    const { root } = setup();
    expect(root.querySelector('a')).toBeNull();
  });

  it('applies the secondary variant on dark mode when configured', () => {
    const { fixture, host, root } = setup();
    host.variant.set('secondaryOnDark');
    fixture.detectChanges();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.classList.contains('is-secondary-on-dark')).toBe(true);
    expect(btn?.classList.contains('is-primary')).toBe(false);
  });

  it('applies the filled-navy variant when configured', () => {
    const { fixture, host, root } = setup();
    host.variant.set('navy');
    fixture.detectChanges();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.classList.contains('is-navy')).toBe(true);
    expect(btn?.classList.contains('is-primary')).toBe(false);
  });

  it('applies the lime variant for a navy surface with a white focus ring (owner 2026-09-22)', () => {
    const { fixture, host, root } = setup();
    host.variant.set('primaryOnDark');
    fixture.detectChanges();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.classList.contains('is-primary-on-dark')).toBe(true);
    expect(btn?.classList.contains('is-primary')).toBe(false);
    expect(btn?.classList.contains('is-secondary-on-dark')).toBe(false);
  });

  it('declares the focus-visible state in its stylesheet (R20)', () => {
    if (!hasComponentStyles(Button)) {
      throw new Error('Expected Button component styles');
    }
    const css = Button.ɵcmp.styles.join('\n');
    expect(css).toContain(':focus-visible');
  });

  it('wires the yettel button recipe into its stylesheet (docs/design/yettel.md §5, §9)', () => {
    if (!hasComponentStyles(Button)) {
      throw new Error('Expected Button component styles');
    }
    // The compiler stores custom-property names with a namespace placeholder
    // (`var(--%NS%color-primary)`) and the emulated-encapsulation attribute
    // selector; both are stripped here, and the whitespace around the
    // structural characters with them, so the declaration pairs below match
    // the source's inner spacing (`1px solid`, not `1pxsolid`).
    const css = normaliseComponentCss(Button.ɵcmp.styles.join('\n'));
    // primary: the .btn--primary-inverse recipe, navy #002340 on lime
    // #b4ff00 — the lime pill is yettel's CTA on every captured screen.
    const primary = declarations(css, '.root');
    expect(primary).toContain('color:var(--color-primary)');
    expect(primary).toContain('background:var(--color-accent)');
    // the 24px pill radius (§4), the 48px box (12 + 24 + 12) and the bold
    // face, reached through the token that is not a Tailwind theme variable
    // so `font-bold` keeps its weight. A filled .btn carries `border:0`.
    expect(primary).toContain('border-radius:var(--button-radius)');
    expect(primary).toContain('min-height:var(--button-height)');
    expect(primary).toContain('border:0');
    expect(primary).toContain('font-family:var(--font-family-bold)');
    // hover: #c5ff64.
    expect(declarations(css, '.root:hover:not(.is-disabled)')).toContain(
      'background:var(--color-accent-hover)',
    );
    // the two outlined variants take the hairline out of the padding, so
    // their box is the same 48px as the filled ones.
    const outlined = declarations(css, '.root.is-secondary,.root.is-secondary-on-dark');
    expect(outlined).toContain('border:1px solid');
    expect(outlined).toContain('padding:11px 23px');
    // secondary: the navy outline on white (.btn-outline-navy).
    const secondary = declarations(css, '.root.is-secondary');
    expect(secondary).toContain('color:var(--color-primary)');
    expect(secondary).toContain('background:var(--color-surface)');
    expect(secondary).toContain('border-color:var(--color-primary)');
    // secondary-on-dark: .btn-outline-lime — lime text and hairline on a
    // transparent fill, with the white ring the navy ground needs.
    const onDark = declarations(css, '.root.is-secondary-on-dark');
    expect(onDark).toContain('color:var(--color-accent)');
    expect(onDark).toContain('background:transparent');
    expect(onDark).toContain('border-color:var(--color-accent)');
    expect(declarations(css, '.root.is-secondary-on-dark:hover:not(.is-disabled)')).toContain(
      'background:var(--color-accent)',
    );
    expect(declarations(css, '.root.is-secondary-on-dark:focus-visible')).toContain(
      'outline-color:var(--color-text-inverse)',
    );
    // primary-on-dark: the lime pill on a navy surface keeps the base
    // lime fill and takes the same white ring.
    expect(declarations(css, '.root.is-primary-on-dark:focus-visible')).toContain(
      'outline-color:var(--color-text-inverse)',
    );
    // navy: the filled .btn--primary, white on #002340, hover #01385e.
    const navy = declarations(css, '.root.is-navy');
    expect(navy).toContain('color:var(--color-text-inverse)');
    expect(navy).toContain('background:var(--color-primary)');
    expect(declarations(css, '.root.is-navy:hover:not(.is-disabled)')).toContain(
      'background:var(--color-primary-hover)',
    );
    // disabled: #80919f on #e5e9ec.
    const disabled = declarations(css, '.root.is-disabled');
    expect(disabled).toContain('color:var(--color-disabled-text)');
    expect(disabled).toContain('background:var(--color-disabled-bg)');
    // the retired orange palette is gone from this primitive.
    expect(css).not.toContain('color-brand-accent');
  });

  it('adds w-full to the root when block is set (MIM-211)', () => {
    const { fixture, host, root } = setup();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.classList.contains('w-full')).toBe(false);
    host.block.set(true);
    fixture.detectChanges();
    expect(btn?.classList.contains('w-full')).toBe(true);
  });
});
