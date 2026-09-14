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

function setup(): { fixture: ComponentFixture<HostComponent>; host: HostComponent } {
  TestBed.configureTestingModule({ imports: [HostComponent] });
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  return { fixture, host: fixture.componentInstance };
}

describe('QuantityControl primitive', () => {
  it('renders three controls in the order decrement, input, increment', () => {
    const { fixture } = setup();
    expect(fixture.nativeElement.querySelector('[data-testid="quantity-decrement"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="quantity-input"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="quantity-increment"]')).not.toBeNull();
  });

  it('declares the 44-CSS-px minimum via the button height token (R21)', () => {
    const css = (QuantityControl as unknown as { ɵcmp: { styles: readonly string[] } }).ɵcmp.styles.join('\n');
    expect(css).toMatch(/size-control/);
    expect(css).toMatch(/min-(width|height)/);
  });

  it('emits quantityChanged when the increment button is clicked', () => {
    const { fixture, host } = setup();
    const inc: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="quantity-increment"]');
    inc.click();
    expect(host.changes()).toEqual([2]);
  });

  it('does not emit when the user enters a value above the maximum', () => {
    const { fixture, host } = setup();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="quantity-input"]');
    input.value = '99';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.changes()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[data-testid="quantity-message"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="quantity-input"]').getAttribute('aria-invalid')).toBe('true');
  });

  it('does not emit when the user enters a value below the minimum', () => {
    const { fixture, host } = setup();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="quantity-input"]');
    input.value = '0';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.changes()).toEqual([]);
    expect(fixture.nativeElement.querySelector('[data-testid="quantity-message"]')).not.toBeNull();
  });

  it('disables the decrement button at the minimum', () => {
    const { fixture, host } = setup();
    host.value.set(1);
    fixture.detectChanges();
    const dec: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="quantity-decrement"]') as HTMLButtonElement;
    expect(dec.disabled).toBe(true);
  });

  it('disables the increment button at the maximum', () => {
    const { fixture, host } = setup();
    host.value.set(5);
    fixture.detectChanges();
    const inc: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="quantity-increment"]') as HTMLButtonElement;
    expect(inc.disabled).toBe(true);
  });

  it('disables both steppers when the component is disabled', () => {
    const { fixture, host } = setup();
    host.disabled.set(true);
    fixture.detectChanges();
    const dec: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="quantity-decrement"]') as HTMLButtonElement;
    const inc: HTMLButtonElement = fixture.nativeElement.querySelector('[data-testid="quantity-increment"]') as HTMLButtonElement;
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="quantity-input"]') as HTMLInputElement;
    expect(dec.disabled).toBe(true);
    expect(inc.disabled).toBe(true);
    expect(input.disabled).toBe(true);
  });

  it('emits the typed value when it lands back inside the range', () => {
    const { fixture, host } = setup();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('[data-testid="quantity-input"]');
    input.value = '3';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(host.changes()).toEqual([3]);
  });
});
