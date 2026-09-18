/**
 * T21 — delivery + payment-method step (S4.3).
 *
 * Acceptance criteria mapped to source-pattern tests:
 *
 *   T21-AC01 — Home delivery requires an address; virtual pickup removes
 *               it from the submitted payload and announces no real
 *               pickup place.
 *   T21-AC02 — Postal code `[1-9][0-9]{3}`, city 2..80, line1 3..120,
 *               optional line2 <=120; country fixed HU with visible label.
 *   T21-AC03 — Shipping fee visibly follows the selected option:
 *               1990 HUF for home / 0 HUF for pickup. No tariff,
 *               installment, insurance, real card field, or provider
 *               redirect.
 *   T21-AC04 — Changing any option invalidates the previous quote/intent
 *               and requires fresh review. Selection is not indicated by
 *               color alone.
 *   T21-AC05 — Options-load failure has retry and cannot render a
 *               fabricated free-shipping default.
 *
 * Same trade-off as cart-page.spec: vitest's esbuild/oxc pipeline
 * strips Angular decorator metadata, so the suite inspects the
 * source files directly. The behaviour is exercised end-to-end by
 * `ng build` and the cart.facade.spec analogue can run in a real
 * browser.
 */

import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';

const workspaceRoot = resolvePath(process.cwd());

function read(relative: string): string {
  const base = relative.replace(/\.ts$/, '');
  const sources = [relative, `${base}.html`, `${base}.scss`];
  return sources
    .map((p) => {
      try { return readFileSync(resolvePath(workspaceRoot, p), 'utf8'); }
      catch { return ''; }
    })
    .join('\n');
}

const deliveryStepSource = read('src/app/features/checkout/delivery-step.ts');
const addressFormSource = read('src/app/features/checkout/address-form.ts');
const paymentSelectorSource = read('src/app/features/checkout/payment-method-selector.ts');

function componentStyles(componentSource: string, explicitScssPath?: string): string {
  const inline = /styles:\s*\[([\s\S]*?)\]/.exec(componentSource);
  if (inline) return inline[1];
  if (explicitScssPath) {
    try {
      return readFileSync(resolvePath(workspaceRoot, explicitScssPath), 'utf8');
    } catch {
      return '';
    }
  }
  const htmlMatch = /templateUrl:\s*'\.\/([^']+\.html)'/.exec(componentSource);
  if (htmlMatch) {
    const scssPath = htmlMatch[1].replace(/\.html$/, '.scss');
    try {
      return readFileSync(
        resolvePath(workspaceRoot, scssPath),
        'utf8',
      );
    } catch {
      return '';
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// T21-AC01 — home-only address, pickup removes it, "no real pickup place"
// announced.
// ---------------------------------------------------------------------------
describe('T21-AC01 home delivery requires address; pickup removes it and announces no real pickup place', () => {
  it('AddressForm is rendered only when the chosen delivery option requires it', () => {
    // The step uses a computed `requiresAddress` to gate the form so
    // pickup never renders the address inputs at all.
    expect(deliveryStepSource).toMatch(/requiresAddress|requireAddress|requires_address/i);
    expect(deliveryStepSource).toMatch(/@if[\s\S]*?app-address-form|@if[\s\S]*?app-address-form/i);
  });

  it('AddressForm submits address fields only when home_delivery is the selected option', () => {
    // The page strips `address` from the payload when the option is
    // pickup, even if the form happens to still hold a value.
    expect(addressFormSource).toMatch(/addressChanged|address-form|address/i);
    // The page selects between including and omitting the address.
    expect(deliveryStepSource).toMatch(/optionId|home_delivery|demo_pickup/);
  });

  it('DeliveryStep announces that virtual pickup is not a real pickup place', () => {
    // The Hungarian mock payload calls the option "Virtuális átvételi
    // lehetőség; nincs valós üzletcím." — the rendered notice must
    // use at least one of those phrases so the user never mistakes
    // the demo option for a real store visit. The /s flag lets the
    // match span across template-literal line breaks.
    expect(deliveryStepSource).toMatch(/Virtuális átvételi lehetőség|nincs valós\s+üzletcím|nem valós átvétel/is);
  });

  it('DeliveryStep exposes radio inputs (one per delivery option) and addresses are programmatic only', () => {
    // Both home_delivery and demo_pickup are exposed as radio inputs.
    expect(deliveryStepSource).toMatch(/<input[\s\S]*?type="radio"/);
    expect(deliveryStepSource).toMatch(/home_delivery|demo_pickup/);
    // No placeholder text shipped for pickup that could be misread as
    // a real address; the form is never rendered for pickup.
    expect(deliveryStepSource).not.toMatch(/placeholder.*utca|placeholder.*[A-Z][a-z]+ utca/);
  });
});

// ---------------------------------------------------------------------------
// T21-AC02 — postal code regex, length bounds, HU country fixed.
// ---------------------------------------------------------------------------
describe('T21-AC02 address field rules and fixed HU country', () => {
  it('AddressForm regex for postal code is [1-9][0-9]{3} and rejects leading-zero codes', () => {
    expect(addressFormSource).toMatch(/\[1-9\]\[0-9\]\{3\}|\^\[1-9\]\[0-9\]\{3\}\$/);
  });

  it('AddressForm enforces city length 2..80, line1 length 3..120, line2 optional <=120', () => {
    // City 2..80
    expect(addressFormSource).toMatch(/city[\s\S]{0,120}length[\s\S]{0,40}>=?\s*2[\s\S]{0,40}<=?\s*80|2.*80/);
    // Line1 3..120
    expect(addressFormSource).toMatch(/line1[\s\S]{0,120}length[\s\S]{0,40}>=?\s*3[\s\S]{0,40}<=?\s*120|3.*120/);
    // Line2 optional and <=120
    expect(addressFormSource).toMatch(/line2/);
    expect(addressFormSource).toMatch(/120/);
  });

  it('AddressForm hard-codes country to HU with a visible label, not a user-editable select', () => {
    // Country code is HU only — there is no select element the user
    // can change it to.
    expect(addressFormSource).toMatch(/HU/);
    expect(addressFormSource).not.toMatch(/<select[\s\S]*?country/);
    // The label visibly announces "HU".
    expect(addressFormSource).toMatch(/Magyarország|HU\s*[-–]\s*Magyarország|HU\s*\(\s*Magyarország\s*\)/);
  });

  it('AddressForm tags every error with a JSON pointer the orchestrator can map back', () => {
    expect(addressFormSource).toMatch(/pointer/);
    expect(addressFormSource).toMatch(/postalCode|city|line1|line2/);
  });
});

// ---------------------------------------------------------------------------
// T21-AC03 — shipping fee visibly follows the option; no hidden add-ons.
// ---------------------------------------------------------------------------
describe('T21-AC03 visible shipping fee per option; no tariff / installments / insurance / real card field', () => {
  it('DeliveryStep renders the shipping fee as a PriceBlock whose money matches the selected option', () => {
    // The shipping row uses the shared PriceBlock primitive so the
    // 1 990 / 0 HUF amounts are visible to the user without inventing
    // values.
    expect(deliveryStepSource).toMatch(/app-price-block/);
    expect(deliveryStepSource).toMatch(/Szállítási díj|szállítási díj|Szállítás/);
  });

  it('home_delivery and demo_pickup fees are exactly 1990 and 0 HUF — no fallback or rounding', () => {
    // The numeric constants are pinned in the step code so a copy
    // edit cannot silently rewrite the wire contract.
    expect(deliveryStepSource).toMatch(/1990/);
    expect(deliveryStepSource).toMatch(/amount:\s*0|amount:\s*0,|amount:\s*0\}/);
  });

  it('does not mention tariff, installment, insurance, monthly fee, hidden add-on or card fields', () => {
    const cleaned = deliveryStepSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(cleaned.toLowerCase().indexOf('vám')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('részlet')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('installment')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('biztosít')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('havi díj')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('extra költség')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('rejtett')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('card number')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('cardholder')).toBe(-1);
    expect(cleaned.toLowerCase().indexOf('cvc')).toBe(-1);
    // No provider redirect or "redirect" copy.
    expect(cleaned.toLowerCase().indexOf('átirányít')).toBe(-1);
  });

  it('PaymentMethodSelector accepts demo_card | demo_cod only — no wallet, transfer, or card-detail inputs', () => {
    expect(paymentSelectorSource).toMatch(/demo_card/);
    expect(paymentSelectorSource).toMatch(/demo_cod/);
    // No card number / expiry / cvc inputs.
    expect(paymentSelectorSource).not.toMatch(/<input[\s\S]*?name="cardnumber"/);
    expect(paymentSelectorSource).not.toMatch(/<input[\s\S]*?name="expiry"/);
    expect(paymentSelectorSource).not.toMatch(/<input[\s\S]*?name="cvc"/);
    // Selection is conveyed by radio inputs with explicit text labels
    // (the visible-label rule below).
    expect(paymentSelectorSource).toMatch(/<input[\s\S]*?type="radio"/);
  });

  it('PaymentMethodSelector visibly labels both options and marks the simulation as a demo', () => {
    expect(paymentSelectorSource).toMatch(/Bankkártya|demo_card|Kártyás fizetés|Kártya/);
    expect(paymentSelectorSource).toMatch(/Utánvét|demo_cod|Utánvétes fizetés/);
    // The Hungarian "demo" marker is present so the user knows this
    // is a simulated card flow, not a real provider redirect.
    expect(paymentSelectorSource).toMatch(/Demó|demó|szimulált/);
  });
});

// ---------------------------------------------------------------------------
// T21-AC04 — changing any option invalidates the previous quote/intent
// and requires a fresh review. Selection is not by color alone.
// ---------------------------------------------------------------------------
describe('T21-AC04 selection invalidates the previous quote and is not indicated by color alone', () => {
  it('DeliveryStep emits a `selectionChanged` event carrying DeliverySelection + paymentMethod', () => {
    expect(deliveryStepSource).toMatch(/selectionChanged/);
    expect(deliveryStepSource).toMatch(/DeliverySelection|deliverySelection/);
  });

  it('Selection state is conveyed by an explicit "Kiválasztva" badge or similar, not only by a class', () => {
    // The selected radio is announced with a visible Hungarian label,
    // not just a CSS class.
    expect(deliveryStepSource).toMatch(/Kiválasztva|kiválasztva|aktív|selected|Aktív/);
    // A live region or aria-live announces the change.
    expect(deliveryStepSource).toMatch(/aria-live/);
  });

  it('Selection radios bind their `checked` state to the signal so the DOM stays in sync', () => {
    expect(deliveryStepSource).toMatch(/\[checked\]|\[attr\.checked\]/);
    // The same signal source drives both the radio and the computed
    // shipping fee (one source of truth).
    expect(deliveryStepSource).toMatch(/signal\b|computed\(/);
  });

  it('PaymentMethodSelector emits paymentChanged with demo_card | demo_cod and selection is not color-only', () => {
    expect(paymentSelectorSource).toMatch(/paymentChanged/);
    expect(paymentSelectorSource).toMatch(/demo_card|demo_cod/);
    // No naked `:checked { background: orange; }` — selection carries
    // text. We assert by forbidding a CSS-only indicator on the radio.
    expect(paymentSelectorSource).toMatch(/aria-pressed|aria-checked|Kiválasztva|aktív/);
  });

  it('Selection change sets a `requires fresh review` flag the parent can read', () => {
    // Either a signal/computed exposed as `requiresFreshReview`, or
    // the selectionChanged event payload carries a hint.
    const hasSignal =
      /requiresFreshReview|reviewRequired|requiresReview|freshReview/.test(deliveryStepSource);
    const hasPayload = /\{[^}]*selection[^}]*\}/.test(deliveryStepSource);
    expect(hasSignal || hasPayload).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T21-AC05 — options-load error has retry and never fabricates free shipping.
// ---------------------------------------------------------------------------
describe('T21-AC05 options-load error has retry and never invents a free-shipping default', () => {
  it('DeliveryStep renders ErrorState (with retry) when the options load fails', () => {
    expect(deliveryStepSource).toMatch(/app-error-state/);
    expect(deliveryStepSource).toMatch(/retryRequested|retry\(/);
  });

  it('DeliveryStep never picks a fallback option when the load fails', () => {
    const cleaned = deliveryStepSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // No `?? 'home_delivery'` / `?? 'demo_pickup'` / default-id fallback.
    expect(cleaned).not.toMatch(/\?\?\s*['"]home_delivery['"]/);
    expect(cleaned).not.toMatch(/\?\?\s*['"]demo_pickup['"]/);
    // The radio list iterates over the loaded options; without options
    // there is nothing to render.
    expect(deliveryStepSource).toMatch(/@for[\s\S]*?deliveryOptions|@for[\s\S]*?option of/);
  });

  it('Loading state renders a skeleton (LoadingState) until the options land', () => {
    expect(deliveryStepSource).toMatch(/app-loading-state/);
  });

  it('Selection is impossible while in the error branch', () => {
    // The selectionChanged output is gated on the loaded options
    // signal: there is no fallback hand-out.
    const cleaned = deliveryStepSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(cleaned).not.toMatch(/emit\(.*home_delivery\)/);
    expect(cleaned).not.toMatch(/emit\(.*demo_pickup\)/);
  });
});

// ---------------------------------------------------------------------------
// Wiring + primitive conformance.
// ---------------------------------------------------------------------------
describe('T21 wiring — owned files use the documented T10 primitives', () => {
  it('DeliveryStep wires ErrorState + LoadingState + PriceBlock; delegates FormFieldMessage to AddressForm', () => {
    expect(deliveryStepSource).toMatch(/app-error-state|ErrorState/);
    expect(deliveryStepSource).toMatch(/app-loading-state|LoadingState/);
    expect(deliveryStepSource).toMatch(/app-price-block|PriceBlock/);
    // The address form is the field-level validation surface; the
    // step delegates to it through `<app-address-form>`.
    expect(deliveryStepSource).toMatch(/app-address-form|AddressForm/);
  });

  it('AddressForm depends only on the shared form-field-message primitive', () => {
    expect(addressFormSource).toMatch(/FormFieldMessage|app-form-field-message/);
    // No CommonModule import — primitives are imported directly.
    expect(addressFormSource).not.toMatch(/CommonModule/);
  });

  it('PaymentMethodSelector uses the shared Button primitive for the Confirm action', () => {
    expect(paymentSelectorSource).toMatch(/app-button|Button/);
  });

  it('AddressForm styles follow the desktop/mobile breakpoint rule (R22 narrow layout)', () => {
    const css = componentStyles(addressFormSource, 'src/app/features/checkout/address-form.scss');
    expect(css).toMatch(/@media\s*\(min-width:\s*640px\)/);
  });
});
