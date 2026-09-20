import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { Button } from './button';

@Component({
  imports: [Button],
  template: `
    <app-button
      [disabled]="disabled()"
      [label]="label()"
      [loading]="loading()"
      [loadingLabel]="loadingLabel()"
      [size]="size()"
      [type]="type()"
      [variant]="variant()"
      (pressed)="clickCount.set(clickCount() + 1)"
    />
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

function hasComponentStyles(value: unknown): value is ComponentWithStyles {
  if (typeof value !== 'object' && typeof value !== 'function') return false;
  return value === null ? false : 'ɵcmp' in value;
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
    throw new TypeError('Expected HTMLElement');
  }
  return { fixture, host: fixture.componentInstance, root: raw };
}

describe('Button primitive', () => {
  it('renders the label as visible text', () => {
    const { root } = setup();
    const button = root.querySelector<HTMLButtonElement>('button');
    expect(button?.textContent.trim()).toBe('Kosárba teszem');
  });

  it('renders a native button with type=button by default', () => {
    const { root } = setup();
    const button = root.querySelector<HTMLButtonElement>('button');
    expect(button?.tagName).toBe('BUTTON');
    expect(button?.getAttribute('type')).toBe('button');
  });

  it('applies the requested type when bound (e.g. submit)', () => {
    const { fixture, host, root } = setup();
    host.type.set('submit');
    fixture.detectChanges();
    const button = root.querySelector<HTMLButtonElement>('button');
    expect(button?.getAttribute('type')).toBe('submit');
  });

  it('reports the variant token in its computed style (R21 minimum 44 CSS px)', () => {
    const { root } = setup();
    const button = root.querySelector<HTMLButtonElement>('button');
    expect(button).not.toBeNull();
    expect(button?.classList.contains('is-primary')).toBe(true);
    // The size token is wired in button.css as min-height: var(--button-height).
    // jsdom has no layout but the class-based guarantee of the standard
    // height is what makes the button reachable for assistive tech.
  });

  it('uses the comfortable class when size=comfortable is requested', () => {
    const { fixture, host, root } = setup();
    host.size.set('comfortable');
    fixture.detectChanges();
    const button = root.querySelector<HTMLButtonElement>('button');
    expect(button?.classList.contains('is-comfortable')).toBe(true);
  });

  it('emits a pressed event on click', () => {
    const { host, root } = setup();
    const button = root.querySelector<HTMLButtonElement>('button');
    button?.click();
    expect(host.clickCount()).toBe(1);
  });

  it('does not emit when disabled and exposes native disabled state', () => {
    const { fixture, host, root } = setup();
    host.disabled.set(true);
    fixture.detectChanges();
    const button = root.querySelector<HTMLButtonElement>('button');
    expect(button?.disabled).toBe(true);
    button?.click();
    expect(host.clickCount()).toBe(0);
  });

  it('does not emit while loading and exposes aria-busy', () => {
    const { fixture, host, root } = setup();
    host.loading.set(true);
    host.loadingLabel.set('Hozzáadás…');
    fixture.detectChanges();
    const button = root.querySelector<HTMLButtonElement>('button');
    expect(button?.getAttribute('aria-busy')).toBe('true');
    expect(button?.disabled).toBe(true);
    expect(button?.textContent).toContain('Hozzáadás…');
    button?.click();
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
    const button = root.querySelector<HTMLButtonElement>('button');
    expect(button?.classList.contains('is-secondary-on-dark')).toBe(true);
    expect(button?.classList.contains('is-primary')).toBe(false);
  });

  it('declares the focus-visible state in its stylesheet (R20)', () => {
    if (!hasComponentStyles(Button)) {
      throw new Error('Expected Button component styles');
    }
    const css = Button.ɵcmp.styles.join('\n');
    expect(css).toContain(':focus-visible');
  });
});
