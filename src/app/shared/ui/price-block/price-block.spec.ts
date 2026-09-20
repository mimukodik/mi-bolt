import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { PriceBlock } from './price-block';
import type { AsyncStatus } from '../../types/async-status';
import type { Money } from './price-block';

@Component({
  imports: [PriceBlock],
  template: ` <app-price-block [label]="label()" [money]="money()" [status]="status()" /> `,
})
class HostComponent {
  readonly money = signal<Money | null>({ amount: 339_990, currency: 'HUF' });
  readonly label = signal('Készülékár, egyszeri díj');
  readonly status = signal<AsyncStatus>('success');
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

describe('PriceBlock primitive', () => {
  it('formats a whole-HUF amount with non-breaking spaces', () => {
    const { fixture } = setup();
    const amount = getNativeElement(fixture).querySelector<HTMLElement>(
      '[data-testid="price-amount"]',
    );
    expect(amount).not.toBeNull();
    if (amount === null) {
      throw new Error('Expected price-amount element');
    }
    expect(amount.textContent.trim()).toBe('339 990');
  });

  it('attaches the Ft suffix in a separate visually-distinct element', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.textContent).toContain('Ft');
  });

  it('exposes the one-time label live text', () => {
    const { fixture } = setup();
    const label = getNativeElement(fixture).querySelector<HTMLElement>('.label');
    expect(label).not.toBeNull();
    if (label === null) {
      throw new Error('Expected label element');
    }
    expect(label.textContent.trim()).toBe('Készülékár, egyszeri díj');
  });

  it('formats the example 339 990 / 9 990 amounts from the skill', () => {
    expect(PriceBlock.formatHuf(339_990)).toBe('339 990');
    expect(PriceBlock.formatHuf(9990)).toBe('9 990');
  });

  it('renders a skeleton while loading and never an invented number', () => {
    const { fixture, host } = setup();
    host.status.set('loading');
    fixture.detectChanges();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="price-skeleton"]'),
    ).not.toBeNull();
    expect(getNativeElement(fixture).querySelector('[data-testid="price-amount"]')).toBeNull();
  });

  it('renders a dash on error and never an invented number', () => {
    const { fixture, host } = setup();
    host.status.set('error');
    fixture.detectChanges();
    const error = getNativeElement(fixture).querySelector<HTMLElement>(
      '[data-testid="price-error"]',
    );
    expect(error).not.toBeNull();
    expect(error?.textContent).toContain('\u{2014}');
    expect(getNativeElement(fixture).querySelector('[data-testid="price-amount"]')).toBeNull();
  });

  it('renders a dash on empty and never an invented number', () => {
    const { fixture, host } = setup();
    host.status.set('empty');
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('[data-testid="price-empty"]')).not.toBeNull();
    expect(getNativeElement(fixture).querySelector('[data-testid="price-amount"]')).toBeNull();
  });

  it('renders a known zero as 0 Ft (FIX-35: a free option is a fact, not a missing value)', () => {
    const { fixture, host } = setup();
    host.money.set({ amount: 0, currency: 'HUF' });
    host.status.set('success');
    fixture.detectChanges();
    const amount = getNativeElement(fixture).querySelector<HTMLElement>(
      '[data-testid="price-amount"]',
    );
    expect(amount).not.toBeNull();
    expect(amount?.textContent.trim()).toBe('0');
    const root = getNativeElement(fixture).querySelector<HTMLElement>('.root');
    expect(root?.textContent).toContain('Ft');
  });

  it('does not show a negative amount as a real price', () => {
    const { fixture, host } = setup();
    host.money.set({ amount: -1, currency: 'HUF' });
    host.status.set('success');
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('[data-testid="price-amount"]')).toBeNull();
    expect(getNativeElement(fixture).querySelector('[data-testid="price-empty"]')).not.toBeNull();
  });

  it('rejects a non-HUF currency silently', () => {
    const { fixture, host } = setup();
    // @ts-expect-error: the wire type is HUF; this guards the runtime check.
    host.money.set({ amount: 100, currency: 'EUR' });
    host.status.set('success');
    fixture.detectChanges();
    expect(getNativeElement(fixture).querySelector('[data-testid="price-amount"]')).toBeNull();
  });

  it('puts the amount and the currency in one shared row, not the component root (FIX-19)', () => {
    const { fixture } = setup();
    const amount = getNativeElement(fixture).querySelector('[data-testid="price-amount"]');
    const currency = getNativeElement(fixture).querySelector('.currency');
    const root = getNativeElement(fixture).querySelector('.root');
    expect(amount).not.toBeNull();
    expect(currency).not.toBeNull();
    expect(amount?.parentElement).toBe(currency?.parentElement);
    expect(amount?.parentElement).not.toBe(root);
    expect(amount?.parentElement?.classList.contains('row')).toBe(true);
  });
});
