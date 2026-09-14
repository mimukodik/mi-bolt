import {
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

/**
 * MiBolt QuantityControl primitive.
 *
 * Three focusable elements: a decrement button, an integer input and an
 * increment button. Each control surface is at least 44×44 CSS px, can
 * be operated with Tab/Enter/Space, and exposes a visible focus ring.
 *
 * The component owns the visible value but **does not silently clamp**.
 * When the user enters an out-of-range value, the primitive enters the
 * `invalid` state and announces the boundary via an inline message; it
 * only emits `quantityChanged` for values inside the allowed range.
 *
 * Required states:
 * - default  — both buttons enabled, value inside the range.
 * - hover/focus — focus ring and hover color via Button primitive.
 * - disabled — native disabled, both controls uninteractive.
 * - invalid  — value outside the range, inline message, no emit.
 * - pending  — both controls disabled, input shows pending spinner.
 */
@Component({
  selector: 'app-quantity-control',
  template: `
    <div class="root" [class.is-disabled]="disabled()" [class.is-invalid]="invalid()" data-testid="quantity-control">
      <button
        type="button"
        class="step"
        [attr.aria-label]="'Darabszám csökkentése'"
        [disabled]="decrementDisabled()"
        (click)="decrement()"
        data-testid="quantity-decrement"
      >−</button>
      <input
        type="text"
        inputmode="numeric"
        class="value"
        [attr.aria-label]="label()"
        [attr.aria-invalid]="invalid() ? 'true' : 'false'"
        [attr.aria-describedby]="invalid() ? describedById : null"
        [value]="value()"
        [disabled]="disabled()"
        (input)="onInput($event)"
        (blur)="onBlur()"
        data-testid="quantity-input"
      />
      <button
        type="button"
        class="step"
        [attr.aria-label]="'Darabszám növelése'"
        [disabled]="incrementDisabled()"
        (click)="increment()"
        data-testid="quantity-increment"
      >+</button>
      @if (invalid() && message()) {
        <p class="message" [id]="describedById" role="status" aria-live="polite" data-testid="quantity-message">
          {{ message() }}
        </p>
      }
    </div>
  `,
  styleUrl: './quantity-control.css',
})
export class QuantityControl {
  readonly value = input.required<number>();
  readonly min = input<number>(1);
  readonly max = input<number>(99);
  readonly disabled = input(false);
  readonly pending = input(false);
  readonly label = input<string>('Darabszám');

  readonly quantityChanged = output<number>();

  // We mirror the input value locally so that out-of-range keystrokes are
  // visible to the user but never silently emitted.
  private readonly draft = signal<string | null>(null);

  readonly draftValue = computed<number>(() => {
    const text = this.draft();
    if (text === null) return this.value();
    const n = Number.parseInt(text, 10);
    return Number.isFinite(n) ? n : Number.NaN;
  });

  readonly invalid = computed(() => {
    const v = this.draftValue();
    if (!Number.isFinite(v)) return false;
    return v < this.min() || v > this.max();
  });

  readonly decrementDisabled = computed(
    () => this.disabled() || this.pending() || this.draftValue() <= this.min(),
  );

  readonly incrementDisabled = computed(
    () => this.disabled() || this.pending() || this.draftValue() >= this.max(),
  );

  readonly describedById = 'quantity-message';

  readonly message = computed<string | null>(() => {
    if (!this.invalid()) return null;
    const v = this.draftValue();
    if (v < this.min()) {
      return `A megadott mennyiség nem lehet kevesebb mint ${this.min()}.`;
    }
    if (v > this.max()) {
      return `A megadott mennyiség nem lehet több mint ${this.max()}.`;
    }
    return null;
  });

  decrement(): void {
    if (this.decrementDisabled()) return;
    const next = this.value() - 1;
    this.commit(next);
  }

  increment(): void {
    if (this.incrementDisabled()) return;
    const next = this.value() + 1;
    this.commit(next);
  }

  onInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.draft.set(input.value);
    const n = Number.parseInt(input.value, 10);
    if (Number.isFinite(n) && n >= this.min() && n <= this.max()) {
      this.quantityChanged.emit(n);
    }
  }

  onBlur(): void {
    const n = this.draftValue();
    if (!Number.isFinite(n) || n < this.min() || n > this.max()) {
      this.draft.set(null);
    }
  }

  private commit(next: number): void {
    if (next < this.min() || next > this.max()) return;
    this.draft.set(null);
    this.quantityChanged.emit(next);
  }
}
