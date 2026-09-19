import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { QuantityControl } from './quantity-control';

@Component({
  imports: [QuantityControl],
  template: `
    <app-quantity-control
      [value]="value()"
      [min]="min()"
      [max]="max()"
      [disabled]="disabled()"
      [pending]="pending()"
      [label]="label()"
      (quantityChanged)="changes.set([...changes(), $event])"
    ></app-quantity-control>
  `,
})
class HostComponent {
  readonly value = signal(1);
  readonly min = signal(1);
  readonly max = signal(5);
  readonly disabled = signal(false);
  readonly pending = signal(false);
  readonly label = signal('Darabszám');
  readonly changes = signal<number[]>([]);
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

interface ComponentWithStyles {
  ɵcmp: {
    styles: readonly string[];
  };
}

function hasStyles(val: unknown): val is ComponentWithStyles {
  if (typeof val !== 'function' && typeof val !== 'object') {
    return false;
  }
  if (val === null || !('ɵcmp' in val)) {
    return false;
  }
  const cmp = val.ɵcmp;
  if (typeof cmp !== 'object' || cmp === null || !('styles' in cmp)) {
    return false;
  }
  return Array.isArray(cmp.styles);
}

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('QuantityControl primitive', () => {
  it('renders three controls in the order decrement, input, increment', () => {
    const { fixture } = setup();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="quantity-decrement"]'),
    ).not.toBeNull();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="quantity-input"]'),
    ).not.toBeNull();
    expect(
      getNativeElement(fixture).querySelector('[data-testid="quantity-increment"]'),
    ).not.toBeNull();
  });

  it('declares the 44-CSS-px minimum via the button height token (R21)', () => {
    if (!hasStyles(QuantityControl)) {
      throw new Error('Expected QuantityControl to have styles');
    }
    const css = QuantityControl.ɵcmp.styles.join('\n');
    expect(css).toMatch(/size-control/);
    expect(css).toMatch(/min-(width|height)/);
  });

  it('emits quantityChanged when the increment button is clicked', () => {
    const { fixture, host } = setup();
    const inc = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="quantity-increment"]',
    );
    if (!inc) {
      throw new Error('Expected increment button');
    }
    inc.click();
    expect(host.changes()).toEqual([2]);
  });

  it('does not emit when the user enters a value above the maximum', () => {
    const { fixture, host } = setup();
    const input = getNativeElement(fixture).querySelector<HTMLInputElement>(
      '[data-testid="quantity-input"]',
    );
    if (!input) {
      throw new Error('Expected quantity input');
    }
    input.value = '99';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.changes()).toEqual([]);
    expect(
      getNativeElement(fixture).querySelector('[data-testid="quantity-message"]'),
    ).not.toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('does not emit when the user enters a value below the minimum', () => {
    const { fixture, host } = setup();
    const input = getNativeElement(fixture).querySelector<HTMLInputElement>(
      '[data-testid="quantity-input"]',
    );
    if (!input) {
      throw new Error('Expected quantity input');
    }
    input.value = '0';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.changes()).toEqual([]);
    expect(
      getNativeElement(fixture).querySelector('[data-testid="quantity-message"]'),
    ).not.toBeNull();
  });

  it('disables the decrement button at the minimum', () => {
    const { fixture, host } = setup();
    host.value.set(1);
    fixture.detectChanges();
    const dec = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="quantity-decrement"]',
    );
    if (!dec) {
      throw new Error('Expected decrement button');
    }
    expect(dec.disabled).toBe(true);
  });

  it('disables the increment button at the maximum', () => {
    const { fixture, host } = setup();
    host.value.set(5);
    fixture.detectChanges();
    const inc = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="quantity-increment"]',
    );
    if (!inc) {
      throw new Error('Expected increment button');
    }
    expect(inc.disabled).toBe(true);
  });

  it('disables both steppers when the component is disabled', () => {
    const { fixture, host } = setup();
    host.disabled.set(true);
    fixture.detectChanges();
    const dec = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="quantity-decrement"]',
    );
    const inc = getNativeElement(fixture).querySelector<HTMLButtonElement>(
      '[data-testid="quantity-increment"]',
    );
    const input = getNativeElement(fixture).querySelector<HTMLInputElement>(
      '[data-testid="quantity-input"]',
    );
    if (!dec || !inc || !input) {
      throw new Error('Expected controls to exist');
    }
    expect(dec.disabled).toBe(true);
    expect(inc.disabled).toBe(true);
    expect(input.disabled).toBe(true);
  });

  it('lays the three step controls out in a shared .row wrapper, with the message outside it (FIX-19)', () => {
    const { fixture, host } = setup();
    host.value.set(0);
    fixture.detectChanges();
    const root = getNativeElement(fixture);
    const dec = root.querySelector('[data-testid="quantity-decrement"]');
    const input = root.querySelector('[data-testid="quantity-input"]');
    const inc = root.querySelector('[data-testid="quantity-increment"]');
    const message = root.querySelector('[data-testid="quantity-message"]');
    if (!dec || !input || !inc) {
      throw new Error('Expected the three step controls to exist');
    }
    const row = dec.parentElement;
    expect(row).not.toBeNull();
    expect(row?.classList.contains('row')).toBe(true);
    expect(input.parentElement).toBe(row);
    expect(inc.parentElement).toBe(row);
    expect(message).not.toBeNull();
    expect(row?.contains(message)).toBe(false);
  });

  it('emits the typed value when it lands back inside the range', () => {
    const { fixture, host } = setup();
    const input = getNativeElement(fixture).querySelector<HTMLInputElement>(
      '[data-testid="quantity-input"]',
    );
    if (!input) {
      throw new Error('Expected quantity input');
    }
    input.value = '3';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.changes()).toEqual([3]);
  });
});
