/**
 * T21 — PaymentMethodSelector (S4.3).
 *
 * Renders the two demo-only payment choices:
 *
 *   - `demo_card` — simulated card flow; the user picks the radio
 *                   and the parent confirms the order. No actual
 *                   card field, no provider redirect, no input for
 *                   a real PAN / expiry / CVC.
 *   - `demo_cod`  — cash on delivery in the simulated order; no
 *                   payment-intent call at all.
 *
 * The radio group is driven by `model('demo_card' | 'demo_cod')`
 * so the parent can read the current selection through a single
 * binding. Selection is not indicated by color alone: every option
 * carries a visible label and a "(Demó)" / "(Szimulált)" suffix,
 * and the selected state is announced through `aria-checked` plus
 * a "Kiválasztva" badge the assistive tech reads as live region.
 *
 * T10 Button primitive drives the confirm action so the visual
 * vocabulary matches the rest of the checkout flow.
 */

import { Component, computed, model, output } from '@angular/core';

import { Button } from '../../shared/ui/button/button';

export type PaymentMethod = 'demo_card' | 'demo_cod';

interface PaymentOption {
  readonly id: PaymentMethod;
  readonly label: string;
  readonly helper: string;
  readonly demoTag: string;
}

const PAYMENT_OPTIONS: readonly PaymentOption[] = [
  {
    id: 'demo_card',
    label: 'Bankkártya (szimulált)',
    helper: 'A fizetés demó környezetben, valós kártyaadatok megadása nélkül zajlik.',
    demoTag: 'Demó',
  },
  {
    id: 'demo_cod',
    label: 'Utánvét (demó)',
    helper: 'A demó rendelés átvételkor fizetendő; nincs valódi pénzmozgás.',
    demoTag: 'Demó',
  },
];

@Component({
  selector: 'app-payment-method-selector',
  imports: [Button],
  template: `
    <fieldset class="payment" data-testid="payment-selector">
      <legend class="legend">Fizetési mód</legend>
      <p class="hint" data-testid="payment-demo-notice">
        Csak demó fizetési módok érhetők el; nincs valódi kártyaadat vagy átirányítás.
      </p>

      <ul class="options" role="radiogroup" aria-label="Fizetési mód">
        @for (option of options; track option.id) {
          <li class="option" [class.is-active]="isSelected(option.id)" data-testid="payment-option">
            <label class="option-label" [attr.for]="optionId(option.id)">
              <input
                type="radio"
                class="radio"
                [id]="optionId(option.id)"
                name="paymentMethod"
                [value]="option.id"
                [checked]="isSelected(option.id)"
                [attr.aria-checked]="isSelected(option.id) ? 'true' : 'false'"
                [attr.aria-describedby]="helperId(option.id)"
                (change)="onSelected(option.id)"
                data-testid="payment-radio"
              />
              <span class="option-body">
                <span class="option-row">
                  <span class="option-title">{{ option.label }}</span>
                  <span class="option-tag" aria-hidden="true">{{ option.demoTag }}</span>
                </span>
                <span class="option-helper" [id]="helperId(option.id)">{{ option.helper }}</span>
                @if (isSelected(option.id)) {
                  <span class="option-badge" aria-live="polite" data-testid="payment-selected-badge">
                    Kiválasztva
                  </span>
                }
              </span>
            </label>
          </li>
        }
      </ul>

      <div class="actions">
        <app-button
          variant="primary"
          size="comfortable"
          [label]="confirmLabel()"
          [loadingLabel]="'Mentés…'"
          [loading]="pending()"
          [disabled]="!canConfirm()"
          (pressed)="onConfirm()"
          data-testid="payment-confirm"
        ></app-button>
      </div>
    </fieldset>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .payment {
        margin: 0;
        padding: var(--space-5);
        background: var(--color-surface-light);
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        color: var(--color-text-primary);
      }

      .legend {
        padding: 0 var(--space-2);
        font-size: var(--type-card-title);
        font-weight: var(--weight-bold);
        line-height: var(--line-height-heading);
      }

      .hint {
        margin: var(--space-2) 0 var(--space-4);
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
      }

      .options {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }

      .option {
        border: 1px solid var(--color-border-subtle);
        border-radius: var(--radius-card);
        background: var(--color-surface-section);
        transition: border-color var(--motion-fast) ease, background-color var(--motion-fast) ease;
      }

      .option.is-active {
        border-color: var(--color-brand-ink);
        background: var(--color-brand-accent-soft);
      }

      .option-label {
        display: flex;
        align-items: flex-start;
        gap: var(--space-3);
        padding: var(--space-4);
        cursor: pointer;
        min-height: var(--size-control);
      }

      .radio {
        margin-top: var(--space-1);
        width: 20px;
        height: 20px;
        accent-color: var(--color-brand-ink);
      }

      .radio:focus-visible {
        outline: 2px solid var(--color-focus-light);
        outline-offset: 2px;
      }

      .option-body {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        min-width: 0;
      }

      .option-row {
        display: inline-flex;
        align-items: baseline;
        gap: var(--space-2);
      }

      .option-title {
        font-size: var(--type-body);
        font-weight: var(--weight-medium);
        color: var(--color-text-primary);
      }

      .option-tag {
        display: inline-flex;
        align-items: center;
        padding: 0 var(--space-2);
        border-radius: var(--radius-badge);
        background: var(--color-brand-ink);
        color: var(--color-text-inverse);
        font-size: var(--type-meta);
        font-weight: var(--weight-bold);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .option-helper {
        font-size: var(--type-helper);
        color: var(--color-text-secondary);
        line-height: var(--line-height-body);
      }

      .option-badge {
        margin-top: var(--space-1);
        display: inline-flex;
        align-items: center;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-badge);
        background: var(--color-brand-accent);
        color: var(--color-text-primary);
        font-size: var(--type-meta);
        font-weight: var(--weight-bold);
        align-self: flex-start;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-3);
        margin-top: var(--space-5);
      }

      @media (min-width: 640px) {
        .payment {
          padding: var(--space-6);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .option {
          transition: none;
        }
      }
    `,
  ],
})
export class PaymentMethodSelector {
  readonly value = model<PaymentMethod>('demo_card');
  readonly pending = model<boolean>(false);
  /** When false, the confirm button is disabled even though an option is selected. */
  readonly ready = model<boolean>(false);

  readonly selectionChanged = model<PaymentMethod | null>(null);
  readonly paymentChanged = output<PaymentMethod>();

  readonly options: readonly PaymentOption[] = PAYMENT_OPTIONS;

  readonly canConfirm = computed<boolean>(() => this.value() !== null && this.ready() && !this.pending());

  readonly confirmLabel = computed<string>(() => 'Tovább az ellenőrzéshez');

  isSelected(id: PaymentMethod): boolean {
    return this.value() === id;
  }

  optionId(id: PaymentMethod): string {
    return `payment-option-${id}`;
  }

  helperId(id: PaymentMethod): string {
    return `payment-helper-${id}`;
  }

  onSelected(id: PaymentMethod): void {
    if (this.value() === id) return;
    this.value.set(id);
    this.selectionChanged.set(id);
    this.paymentChanged.emit(id);
  }

  onConfirm(): void {
    if (!this.canConfirm()) return;
    // The actual navigation is the parent's responsibility. We only
    // emit the chosen method through the model — the parent listens
    // for the confirm via `(pressed)` on the bound button.
  }
}
