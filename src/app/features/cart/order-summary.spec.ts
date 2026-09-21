import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { OrderSummary } from './order-summary';
import type { Money } from '../../shared/ui/price-block/price-block';

const HUF = (amount: number): Money => ({ amount, currency: 'HUF' });

@Component({
  imports: [OrderSummary],
  template: `
    <app-order-summary
      [footnote]="footnote()"
      [inverse]="inverse()"
      [paymentFee]="paymentFee()"
      [serverTotal]="serverTotal()"
      [shipping]="shipping()"
      [subtotal]="subtotal()"
    >
      <button data-testid="projected" type="button">Tovább</button>
    </app-order-summary>
  `,
})
class HostComponent {
  readonly subtotal = signal<Money>(HUF(339990));
  readonly shipping = signal<Money | null>(null);
  readonly footnote = signal<string | null>(null);
  readonly paymentFee = signal<Money | null>(null);
  readonly serverTotal = signal<Money | null>(null);
  readonly inverse = signal(false);
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('OrderSummary', () => {
  it('renders no data-inverse attribute and stacked price blocks by default (MIM-211)', () => {
    const { fixture } = setup();
    const root = getNativeElement(fixture);
    const aside = root.querySelector<HTMLElement>('[data-testid="order-summary"]');
    expect(aside).not.toBeNull();
    expect(aside?.hasAttribute('data-inverse')).toBe(false);
    const priceRoots = root.querySelectorAll<HTMLElement>('app-price-block .root');
    expect(priceRoots.length).toBeGreaterThan(0);
    priceRoots.forEach((priceRoot) => {
      expect(priceRoot.getAttribute('data-layout')).toBe('stack');
      expect(priceRoot.hasAttribute('data-inverse')).toBe(false);
      expect(priceRoot.getAttribute('data-size')).toBe('lg');
    });
  });

  it('renders data-inverse on the card and row price blocks when inverse is set (MIM-211)', () => {
    const { fixture, host } = setup();
    host.shipping.set(HUF(9990));
    host.paymentFee.set(HUF(990));
    host.serverTotal.set(HUF(350970));
    host.inverse.set(true);
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    const aside = root.querySelector<HTMLElement>('[data-testid="order-summary"]');
    expect(aside?.hasAttribute('data-inverse')).toBe(true);
    const priceRoots = root.querySelectorAll<HTMLElement>('app-price-block .root');
    priceRoots.forEach((priceRoot) => {
      expect(priceRoot.getAttribute('data-layout')).toBe('row');
      expect(priceRoot.hasAttribute('data-inverse')).toBe(true);
    });
    const totalRoot = root.querySelector<HTMLElement>(
      '[data-testid="order-summary-total"] app-price-block .root',
    );
    expect(totalRoot?.getAttribute('data-size')).toBe('lg');
    const subtotalRoot = root.querySelector<HTMLElement>(
      '[data-testid="order-summary-subtotal"] app-price-block .root',
    );
    expect(subtotalRoot?.getAttribute('data-size')).toBe('md');
    const shippingRoot = root.querySelector<HTMLElement>(
      '[data-testid="order-summary-shipping"] app-price-block .root',
    );
    expect(shippingRoot?.getAttribute('data-size')).toBe('md');
    const paymentFeeRoot = root.querySelector<HTMLElement>(
      '[data-testid="order-summary-payment-fee"] app-price-block .root',
    );
    expect(paymentFeeRoot?.getAttribute('data-size')).toBe('md');
  });

  it('projects consumer content inside the card after the footnote (MIM-211)', () => {
    const { fixture, host } = setup();
    host.footnote.set('Bruttó árak.');
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    const card = root.querySelector<HTMLElement>('[data-testid="order-summary"]');
    const projected = root.querySelector<HTMLElement>('[data-testid="projected"]');
    expect(card).not.toBeNull();
    expect(projected).not.toBeNull();
    if (card === null || projected === null) {
      throw new Error('Expected card and projected button');
    }
    expect(card.contains(projected)).toBe(true);
    const footnote = card.querySelector<HTMLElement>('[data-testid="order-summary-footnote"]');
    expect(footnote).not.toBeNull();
    if (footnote === null) {
      throw new Error('Expected footnote');
    }
    const relation = footnote.compareDocumentPosition(projected);
    expect(relation & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
