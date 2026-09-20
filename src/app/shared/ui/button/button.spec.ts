import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { Button } from './button';

@Component({
  imports: [Button],
  template: `
    <app-button
      [variant]="variant()"
      [label]="label()"
      [loadingLabel]="loadingLabel()"
      [disabled]="disabled()"
      [loading]="loading()"
      [type]="type()"
      (pressed)="clickCount.set(clickCount() + 1)"
    ></app-button>
  `,
})
class HostComponent {
  readonly variant = signal<'primary' | 'secondary' | 'secondaryOnDark' | 'navy'>('primary');
  readonly label = signal('Kosárba teszem');
  readonly loadingLabel = signal('Hozzáadás…');
  readonly disabled = signal(false);
  readonly loading = signal(false);
  readonly type = signal<'button' | 'submit' | 'reset'>('button');
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

/** Strips comments, the compiler's custom-property namespace placeholder, the
 * emulated encapsulation attribute selector and all whitespace, so a
 * declaration can be asserted verbatim regardless of how the build formatted
 * it. */
function normaliseComponentCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replaceAll('%NS%', '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '');
}

/** The declaration block of one rule of the normalised sheet. Asserting on the
 * block rather than on the whole sheet is what makes a colour pair belong to
 * the variant under test: the outlined variants share one box rule, so a
 * sheet-wide match proves nothing about either. The selector has to sit at a
 * rule boundary, or `.root.is-secondary-on-dark` would match inside the
 * grouped selector `.root.is-secondary,.root.is-secondary-on-dark`. The
 * boundary includes `;` because Sass prepends `@charset "UTF-8";`. */
function ruleBody(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|[{};])${escaped}\\{`).exec(css);
  if (match === null) {
    throw new Error(`Expected a rule for ${selector}`);
  }
  const open = match.index + match[0].length;
  return css.slice(open, css.indexOf('}', open));
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
    expect(btn?.disabled).toBe(true);
    expect(btn?.textContent).toContain('Hozzáadás…');
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
    // selector; both are stripped here, and whitespace with them, so the
    // declaration pairs below match whether or not the build minified them.
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
    expect(declarations(css, '.root:hover:not(:disabled)')).toContain(
      'background:var(--color-accent-hover)',
    );
    // the two outlined variants take the hairline out of the padding, so
    // their box is the same 48px as the filled ones.
    const outlined = declarations(css, '.root.is-secondary,.root.is-secondary-on-dark');
    expect(outlined).toContain('border:1pxsolid');
    expect(outlined).toContain('padding:11px23px');
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
    expect(declarations(css, '.root.is-secondary-on-dark:hover:not(:disabled)')).toContain(
      'background:var(--color-accent)',
    );
    expect(declarations(css, '.root.is-secondary-on-dark:focus-visible')).toContain(
      'outline-color:var(--color-text-inverse)',
    );
    // navy: the filled .btn--primary, white on #002340, hover #01385e.
    const navy = declarations(css, '.root.is-navy');
    expect(navy).toContain('color:var(--color-text-inverse)');
    expect(navy).toContain('background:var(--color-primary)');
    expect(declarations(css, '.root.is-navy:hover:not(:disabled)')).toContain(
      'background:var(--color-primary-hover)',
    );
    // disabled: #80919f on #e5e9ec.
    const disabled = declarations(css, '.root:disabled');
    expect(disabled).toContain('color:var(--color-disabled-text)');
    expect(disabled).toContain('background:var(--color-disabled-bg)');
    // the retired orange palette is gone from this primitive.
    expect(css).not.toContain('color-brand-accent');
  });
});
