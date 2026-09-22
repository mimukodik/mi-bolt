import { Component, computed, input, output, signal } from '@angular/core';

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
 * - invalid  — value outside the range or not a whole number, inline message, no emit; on blur the field shows the last valid quantity again.
 * - pending  — both controls disabled, input shows pending spinner.
 */
@Component({
  selector: 'app-quantity-control',
  templateUrl: './quantity-control.html',
  styleUrl: './quantity-control.scss',
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
    const trimmed = text.trim();
    return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : Number.NaN;
  });

  readonly invalid = computed(() => {
    const v = this.draftValue();
    if (!Number.isFinite(v)) return true;
    return v < this.min() || v > this.max();
  });

  /** What the field shows: the shopper's draft while there is one, the
   *  last valid quantity otherwise, so dropping a refused draft on blur
   *  also rewrites the field (MIM-283). */
  readonly displayValue = computed<string>(() => this.draft() ?? String(this.value()));

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
    if (!Number.isFinite(v)) return 'A megadott mennyiség csak egész szám lehet.';
    if (v < this.min()) {
      return `A megadott mennyiség nem lehet kevesebb mint ${String(this.min())}.`;
    }
    if (v > this.max()) {
      return `A megadott mennyiség nem lehet több mint ${String(this.max())}.`;
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
    if (!(event.target instanceof HTMLInputElement)) return;
    const input = event.target;
    this.draft.set(input.value);
    if (!this.invalid()) {
      this.quantityChanged.emit(this.draftValue());
    }
  }

  onBlur(): void {
    if (this.invalid()) {
      this.draft.set(null);
    }
  }

  private commit(next: number): void {
    if (next < this.min() || next > this.max()) return;
    this.draft.set(null);
    this.quantityChanged.emit(next);
  }
}
