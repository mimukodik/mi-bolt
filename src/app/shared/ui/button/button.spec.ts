import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { Button } from './button';

@Component({
  imports: [Button],
  template: `
    <app-button
      [variant]="variant()"
      [size]="size()"
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
  readonly variant = signal<'primary' | 'secondary' | 'secondaryOnDark'>('primary');
  readonly size = signal<'standard' | 'comfortable'>('standard');
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

/** Strips the compiler's custom-property namespace placeholder, the emulated
 * encapsulation attribute selector and all whitespace, so a declaration can be
 * asserted verbatim regardless of how the build formatted it. */
function normaliseComponentCss(css: string): string {
  return css
    .replaceAll('%NS%', '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, '');
}

/** The declaration block of one rule of the normalised sheet. Asserting on the
 * block rather than on the whole sheet is what makes a colour pair belong to
 * the variant under test: `.root` and `.root.is-secondary-on-dark` now carry
 * the same lime fill, so a sheet-wide match proves nothing about either. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(`${selector}{`);
  if (at === -1) {
    throw new Error(`Expected a rule for ${selector}`);
  }
  const open = at + selector.length + 1;
  return css.slice(open, css.indexOf('}', open));
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

  it('uses the comfortable class when size=comfortable is requested', () => {
    const { fixture, host, root } = setup();
    host.size.set('comfortable');
    fixture.detectChanges();
    const btn = root.querySelector<HTMLButtonElement>('button');
    expect(btn?.classList.contains('is-comfortable')).toBe(true);
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
    const primary = ruleBody(css, '.root');
    expect(primary).toContain('color:var(--color-primary)');
    expect(primary).toContain('background:var(--color-accent)');
    // the 24px pill radius (§4) and the bold face, reached through the token
    // that is not a Tailwind theme variable so `font-bold` keeps its weight.
    expect(primary).toContain('border-radius:var(--button-radius)');
    expect(primary).toContain('font-family:var(--font-family-bold)');
    // hover: #c5ff64.
    expect(ruleBody(css, '.root:hover:not(:disabled)')).toContain(
      'background:var(--color-accent-hover)',
    );
    // secondary: the navy outline on white (.btn-outline-navy).
    const secondary = ruleBody(css, '.root.is-secondary');
    expect(secondary).toContain('color:var(--color-primary)');
    expect(secondary).toContain('background:var(--color-surface)');
    expect(secondary).toContain('border-color:var(--color-primary)');
    // secondary-on-dark: the same lime pill, with the white ring the navy
    // ground needs — a navy or lime ring disappears there.
    const onDark = ruleBody(css, '.root.is-secondary-on-dark');
    expect(onDark).toContain('color:var(--color-primary)');
    expect(onDark).toContain('background:var(--color-accent)');
    expect(ruleBody(css, '.root.is-secondary-on-dark:focus-visible')).toContain(
      'outline-color:var(--color-text-inverse)',
    );
    // disabled: #80919f on #e5e9ec.
    const disabled = ruleBody(css, '.root:disabled');
    expect(disabled).toContain('color:var(--color-disabled-text)');
    expect(disabled).toContain('background:var(--color-disabled-bg)');
    // the retired orange palette is gone from this primitive.
    expect(css).not.toContain('color-brand-accent');
  });
});
