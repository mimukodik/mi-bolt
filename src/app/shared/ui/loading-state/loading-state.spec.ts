import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { LoadingState } from './loading-state';
import type { LoadingVariant } from './loading-state';

@Component({
  imports: [LoadingState],
  template: `
    <app-loading-state
      [variant]="variant()"
      [label]="label()"
      [role]="role()"
    ></app-loading-state>
  `,
})
class HostComponent {
  readonly variant = signal<LoadingVariant>('block');
  readonly label = signal('Adatok betöltése…');
  readonly role = signal<'status' | 'progressbar'>('status');
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('LoadingState primitive', () => {
  it('marks itself busy and exposes the live label', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(root.textContent).toContain('Adatok betöltése…');
  });

  it('renders three placeholder lines for the lines variant', () => {
    const { fixture, host } = setup();
    host.variant.set('lines');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.line').length).toBe(3);
    expect(fixture.nativeElement.querySelector('.root')?.classList.contains('is-lines')).toBe(true);
  });

  it('renders the card-shaped skeleton (image + title + price) for the card variant', () => {
    const { fixture, host } = setup();
    host.variant.set('card');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.block--image')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.block--title')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.block--price')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.root')?.classList.contains('is-card')).toBe(true);
  });

  it('renders a single block skeleton for the default variant', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('.block--single')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('.line').length).toBe(0);
  });

  it('does not display an invented number inside the skeleton', () => {
    const { fixture } = setup();
    const text = fixture.nativeElement.querySelector('.root').textContent ?? '';
    expect(text).not.toMatch(/\d+\s*Ft/);
  });
});
