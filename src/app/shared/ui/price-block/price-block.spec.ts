import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { PriceBlock } from './price-block';
import type { AsyncStatus } from './price-block';
import type { Money } from './price-block';

@Component({
  imports: [PriceBlock],
  template: `
    <app-price-block
      [money]="money()"
      [label]="label()"
      [status]="status()"
    ></app-price-block>
  `,
})
class HostComponent {
  readonly money = signal<Money | null>({ amount: 339990, currency: 'HUF' });
  readonly label = signal('Készülékár, egyszeri díj');
  readonly status = signal<AsyncStatus>('success');
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('PriceBlock primitive', () => {
  it('formats a whole-HUF amount with non-breaking spaces', () => {
    const { fixture } = setup();
    const amount: HTMLElement | null = fixture.nativeElement.querySelector('[data-testid="price-amount"]');
    expect(amount).not.toBeNull();
    expect(amount?.textContent?.trim()).toBe('339 990');
  });

  it('attaches the Ft suffix in a separate visually-distinct element', () => {
    const { fixture } = setup();
    const root: HTMLElement = fixture.nativeElement.querySelector('.root');
    expect(root.textContent).toContain('Ft');
  });

  it('exposes the one-time label live text', () => {
    const { fixture } = setup();
    const label: HTMLElement | null = fixture.nativeElement.querySelector('.label');
    expect(label?.textContent?.trim()).toBe('Készülékár, egyszeri díj');
  });

  it('formats the example 339 990 / 9 990 amounts from the skill', () => {
    expect(PriceBlock.formatHuf(339990)).toBe('339 990');
    expect(PriceBlock.formatHuf(9990)).toBe('9 990');
  });

  it('renders a skeleton while loading and never an invented number', () => {
    const { fixture, host } = setup();
    host.status.set('loading');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="price-skeleton"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="price-amount"]')).toBeNull();
  });

  it('renders a dash on error and never an invented number', () => {
    const { fixture, host } = setup();
    host.status.set('error');
    fixture.detectChanges();
    const error: HTMLElement | null = fixture.nativeElement.querySelector('[data-testid="price-error"]');
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('—');
    expect(fixture.nativeElement.querySelector('[data-testid="price-amount"]')).toBeNull();
  });

  it('renders a dash on empty and never an invented number', () => {
    const { fixture, host } = setup();
    host.status.set('empty');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="price-empty"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="price-amount"]')).toBeNull();
  });

  it('does not show 0 Ft when the amount is zero or invalid', () => {
    const { fixture, host } = setup();
    host.money.set({ amount: 0, currency: 'HUF' });
    host.status.set('success');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="price-amount"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="price-empty"]')).not.toBeNull();
  });

  it('rejects a non-HUF currency silently', () => {
    const { fixture, host } = setup();
    // @ts-expect-error: the wire type is HUF; this guards the runtime check.
    host.money.set({ amount: 100, currency: 'EUR' });
    host.status.set('success');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[data-testid="price-amount"]')).toBeNull();
  });
});
