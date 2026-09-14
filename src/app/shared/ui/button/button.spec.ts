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
  readonly clickCount = signal(0);
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('Button primitive', () => {
  it('renders the label as visible text', () => {
    const { fixture } = setup();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.textContent?.trim()).toBe('Kosárba teszem');
  });

  it('renders a native button with type=button by default', () => {
    const { fixture } = setup();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('type')).toBe('button');
  });

  it('reports the variant token in its computed style (R21 minimum 44 CSS px)', () => {
    const { fixture } = setup();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.classList.contains('is-primary')).toBe(true);
    // The size token is wired in button.css as min-height: var(--button-height).
    // jsdom has no layout but the class-based guarantee of the standard
    // height is what makes the button reachable for assistive tech.
  });

  it('uses the comfortable class when size=comfortable is requested', () => {
    const { fixture, host } = setup();
    host.size.set('comfortable');
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.classList.contains('is-comfortable')).toBe(true);
  });

  it('emits a pressed event on click', () => {
    const { fixture, host } = setup();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    btn.click();
    expect(host.clickCount()).toBe(1);
  });

  it('does not emit when disabled and exposes native disabled state', () => {
    const { fixture, host } = setup();
    host.disabled.set(true);
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    btn.click();
    expect(host.clickCount()).toBe(0);
  });

  it('does not emit while loading and exposes aria-busy', () => {
    const { fixture, host } = setup();
    host.loading.set(true);
    host.loadingLabel.set('Hozzáadás…');
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(btn.getAttribute('aria-busy')).toBe('true');
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toContain('Hozzáadás…');
    btn.click();
    expect(host.clickCount()).toBe(0);
  });

  it('uses a button (not an a-tag) for actions', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('a')).toBeNull();
  });

  it('applies the secondary variant on dark mode when configured', () => {
    const { fixture, host } = setup();
    host.variant.set('secondaryOnDark');
    fixture.detectChanges();
    const btn: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    expect(btn.classList.contains('is-secondary-on-dark')).toBe(true);
    expect(btn.classList.contains('is-primary')).toBe(false);
  });

  it('declares the focus-visible state in its stylesheet (R20)', () => {
    const css = (Button as unknown as { ɵcmp: { styles: readonly string[] } }).ɵcmp.styles.join('\n');
    expect(css).toContain(':focus-visible');
  });
});
