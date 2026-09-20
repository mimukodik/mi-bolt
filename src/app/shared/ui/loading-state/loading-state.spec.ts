import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { LoadingState } from './loading-state';
import type { LoadingVariant } from './loading-state';

@Component({
  imports: [LoadingState],
  template: ` <app-loading-state [label]="label()" [role]="role()" [variant]="variant()" /> `,
})
class HostComponent {
  readonly variant = signal<LoadingVariant>('block');
  readonly label = signal('Adatok betöltése…');
  readonly role = signal<'status' | 'progressbar'>('status');
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new TypeError('Expected HTMLElement');
  }
  return raw;
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
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.getAttribute('aria-busy')).toBe('true');
    expect(root?.textContent).toContain('Adatok betöltése…');
  });

  it('renders three placeholder lines for the lines variant', () => {
    const { fixture, host } = setup();
    host.variant.set('lines');
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelectorAll('.line').length).toBe(3);
    expect(getNativeElement(fixture).querySelector('.root')?.classList.contains('is-lines')).toBe(
      true,
    );
  });

  it('renders the card-shaped skeleton (image + title + price) for the card variant', () => {
    const { fixture, host } = setup();
    host.variant.set('card');
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('.block--image')).not.toBeNull();
    expect(getNativeElement(fixture).querySelector('.block--title')).not.toBeNull();
    expect(getNativeElement(fixture).querySelector('.block--price')).not.toBeNull();
    expect(getNativeElement(fixture).querySelector('.root')?.classList.contains('is-card')).toBe(
      true,
    );
  });

  it('renders a single block skeleton for the default variant', () => {
    const { fixture } = setup();
    expect(getNativeElement(fixture).querySelector('.block--single')).not.toBeNull();
    expect(getNativeElement(fixture).querySelectorAll('.line').length).toBe(0);
  });

  it('does not display an invented number inside the skeleton', () => {
    const { fixture } = setup();
    const text = getNativeElement(fixture).querySelector('.root')?.textContent ?? '';
    expect(text).not.toMatch(/\d+\s*Ft/);
  });
});
