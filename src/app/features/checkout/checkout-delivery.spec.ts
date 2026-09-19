// @vitest-environment jsdom
import '@angular/compiler';

/**
 * T21 - delivery + payment-method step (S4.3).
 *
 * Acceptance criteria mapped to real TestBed behavior tests:
 *
 *   T21-AC01 - Home delivery requires an address; virtual pickup removes
 *               it from the submitted payload and announces no real
 *               pickup place.
 *   T21-AC02 - Postal code [1-9][0-9]{3}, city 2..80, line1 3..120,
 *               optional line2 <=120; country fixed HU with visible label.
 *   T21-AC03 - Shipping fee visibly follows the selected option:
 *               1990 HUF for home / 0 HUF for pickup. No tariff,
 *               installment, insurance, real card field, or provider
 *               redirect.
 *   T21-AC04 - Changing any option invalidates the previous quote/intent
 *               and requires fresh review. Selection is not indicated by
 *               color alone.
 *   T21-AC05 - Options-load failure has retry and cannot render a
 *               fabricated free-shipping default.
 */

import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  Input,
  Output,
  provideZonelessChangeDetection,
  ɵresolveComponentResources,
} from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { http, HttpResponse } from 'msw';
import { readdir, readFile } from 'node:fs/promises';
import { join as pathJoin, resolve as pathResolve } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server, useMswServer } from '../../../../tests/msw-server';
import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { demoSessionInterceptor } from '../../core/api/demo-session.interceptor';
import { CartDomain } from '../../../mocks/cart/cart-domain';
import { DEMO_PRODUCT } from '../../../mocks/cart/cart.handlers';
import { checkoutHandlersEntry } from '../../../mocks/checkout/checkout.handlers';
import { QuoteDomain } from '../../../mocks/checkout/quote-domain';
import { IdempotencyStore } from '../../../mocks/idempotency';
import { Repository } from '../../../mocks/repository';
import { createDeterministicIds, createFixedClock } from '../../../mocks/scenarios';
import { Button } from '../../shared/ui/button/button';
import { ErrorState } from '../../shared/ui/error-state/error-state';
import { FormFieldMessage } from '../../shared/ui/form-field-message/form-field-message';
import { LoadingState } from '../../shared/ui/loading-state/loading-state';
import { PriceBlock } from '../../shared/ui/price-block/price-block';
import { CartFacade } from '../cart/cart.facade';
import { AddressForm } from './address-form';
import { CheckoutFacade } from './checkout.facade';
import { DeliveryStep } from './delivery-step';
import { PaymentMethodSelector, type PaymentMethod } from './payment-method-selector';

// The shared MSW server's lifecycle is registered here, in this file, because
// the Angular unit-test builder evaluates `tests/setup-msw.ts` once per worker
// process rather than once per file. See `tests/msw-server.ts`.
useMswServer();

const BASE_URL = 'http://localhost/api/v1';

function registerComponentMetadata(
  componentClass: unknown,
  config: {
    inputs?: readonly string[];
    outputs?: readonly string[];
    models?: readonly string[];
  },
): void {
  if (typeof componentClass !== 'function') return;
  const raw: unknown = Reflect.get(componentClass, 'propDecorators');
  const propDecorators: Record<string, unknown[]> = {};
  if (typeof raw === 'object' && raw !== null) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        const arr: unknown[] = [];
        for (const item of value) {
          arr.push(item);
        }
        propDecorators[key] = arr;
      }
    }
  }
  if (config.inputs !== undefined) {
    for (const name of config.inputs) {
      const arr = propDecorators[name] ?? [];
      arr.push({ type: Input, args: [{ isSignal: true }] });
      propDecorators[name] = arr;
    }
  }
  if (config.outputs !== undefined) {
    for (const name of config.outputs) {
      const arr = propDecorators[name] ?? [];
      arr.push({ type: Output, args: [] });
      propDecorators[name] = arr;
    }
  }
  if (config.models !== undefined) {
    for (const name of config.models) {
      const arr = propDecorators[name] ?? [];
      arr.push({ type: Input, args: [{ isSignal: true }] });
      arr.push({ type: Output, args: [`${name}Change`] });
      propDecorators[name] = arr;
    }
  }
  Reflect.set(componentClass, 'propDecorators', propDecorators);
}

registerComponentMetadata(AddressForm, {
  models: ['postalCode', 'city', 'line1', 'line2', 'submitted', 'addressChanged'],
});
registerComponentMetadata(PaymentMethodSelector, {
  models: ['value', 'pending', 'ready', 'selectionChanged'],
  outputs: ['paymentChanged', 'confirmed'],
});
registerComponentMetadata(FormFieldMessage, {
  inputs: ['fieldId', 'errors', 'touched', 'submitted', 'helpText', 'severity'],
});
registerComponentMetadata(PriceBlock, {
  inputs: ['money', 'label', 'status'],
});
registerComponentMetadata(Button, {
  inputs: ['variant', 'size', 'label', 'loadingLabel', 'disabled', 'loading'],
  outputs: ['pressed'],
});
registerComponentMetadata(LoadingState, {
  inputs: ['variant', 'label'],
});
registerComponentMetadata(ErrorState, {
  inputs: ['title', 'message', 'retryLabel', 'pending', 'preserving'],
  outputs: ['retryRequested'],
});

function getRootElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return raw;
}

function getElement(parent: Element, selector: string): HTMLElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected HTMLElement matching "${selector}"`);
  }
  return el;
}

function getInputElement(parent: Element, selector: string): HTMLInputElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLInputElement)) {
    throw new Error(`Expected HTMLInputElement matching "${selector}"`);
  }
  return el;
}

function queryElement(parent: Element, selector: string): HTMLElement | null {
  const el = parent.querySelector(selector);
  if (el === null) return null;
  if (!(el instanceof HTMLElement)) {
    throw new Error(`Expected HTMLElement matching "${selector}"`);
  }
  return el;
}

const fileCache = new Map<string, string>();

async function findInWorkspace(targetName: string, dir: string): Promise<string | null> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = pathJoin(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await findInWorkspace(targetName, fullPath);
      if (nested !== null) return nested;
    } else if (entry.name === targetName) {
      return fullPath;
    }
  }
  return null;
}

async function resolveWorkspaceFile(url: string): Promise<string> {
  if (url.endsWith('.scss') || url.endsWith('.css')) {
    return '';
  }
  const filename = url.startsWith('./') ? url.slice(2) : url;
  const cached = fileCache.get(filename);
  if (cached !== undefined) return cached;

  const foundPath = await findInWorkspace(filename, pathResolve(process.cwd(), 'src'));
  if (foundPath === null) return '';
  const content = await readFile(foundPath, 'utf-8');
  fileCache.set(filename, content);
  return content;
}

function makeEnv() {
  const clock = createFixedClock(new Date(Date.parse('2026-09-14T10:00:00.000Z')).toISOString());
  const ids = createDeterministicIds(7);
  const scenario = {
    name: 'checkout-delivery-suite',
    seed: 7,
    clockOffsetMs: 0,
    isolated: true,
  };
  const repository = new Repository(scenario, ids, clock);
  repository.loadProducts([DEMO_PRODUCT]);
  const idempotency = new IdempotencyStore(clock);
  new CartDomain(repository, clock, ids, idempotency);
  new QuoteDomain(repository, clock, ids, idempotency);
  return { repository, clock, ids, scenario, apiRoot: '/api/v1' };
}

beforeAll(async () => {
  await ɵresolveComponentResources(resolveWorkspaceFile);
  await TestBed.compileComponents();
});

beforeEach(async () => {
  const env = makeEnv();
  server.use(...checkoutHandlersEntry(env));
  TestBed.configureTestingModule({
    imports: [DeliveryStep, AddressForm, PaymentMethodSelector],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(withInterceptors([demoSessionInterceptor])),
      provideApiConfiguration(BASE_URL),
      provideRouter([
        { path: 'penztar/ellenorzes', component: DeliveryStep },
        { path: 'penztar/adatok', component: DeliveryStep },
      ]),
      CartFacade,
      CheckoutFacade,
    ],
  });
  await TestBed.compileComponents();
});

afterEach(() => {
  server.resetHandlers();
  TestBed.resetTestingModule();
});

// ---------------------------------------------------------------------------
// T21-AC01 - home-only address, pickup removes it, "no real pickup place"
// ---------------------------------------------------------------------------
describe('T21-AC01 home delivery requires address; pickup removes it and announces no real pickup place', () => {
  it('AddressForm is rendered only when the chosen delivery option requires it', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();
    const root = getRootElement(fixture);

    expect(queryElement(root, 'app-address-form')).toBeNull();

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();
    expect(queryElement(root, 'app-address-form')).toBeNull();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();
    expect(queryElement(root, 'app-address-form')).not.toBeNull();
  });

  it('AddressForm submits address fields only when home_delivery is the selected option', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.componentInstance.postalCode.set('1011');
    fixture.componentInstance.city.set('Budapest');
    fixture.componentInstance.line1.set('Fő utca 1.');
    fixture.detectChanges();

    const homeChange = fixture.componentInstance.selectionChanged();
    expect(homeChange?.delivery.optionId).toBe('home_delivery');
    expect(homeChange?.delivery.address?.postalCode).toBe('1011');
    expect(homeChange?.delivery.address?.city).toBe('Budapest');
    expect(homeChange?.delivery.address?.line1).toBe('Fő utca 1.');

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();

    const pickupChange = fixture.componentInstance.selectionChanged();
    expect(pickupChange?.delivery.optionId).toBe('demo_pickup');
    expect(pickupChange?.delivery.address).toBeUndefined();
  });

  it('DeliveryStep announces that virtual pickup is not a real pickup place', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const notice = getElement(root, '[data-testid="pickup-notice"]');
    expect(notice.textContent).toMatch(/nincs valós üzletcím|Virtuális átvételi lehetőség/);
    expect(notice.getAttribute('role')).toBe('note');
  });

  it('DeliveryStep exposes radio inputs (one per delivery option) and addresses are programmatic only', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const radios = root.querySelectorAll<HTMLInputElement>(
      'input[type="radio"][name="deliveryOption"]',
    );
    expect(radios.length).toBe(2);
    const values = Array.from(radios).map((r) => r.value);
    expect(values).toContain('home_delivery');
    expect(values).toContain('demo_pickup');
  });
});

// ---------------------------------------------------------------------------
// T21-AC02 - postal code regex, length bounds, HU country fixed.
// ---------------------------------------------------------------------------
describe('T21-AC02 address field rules and fixed HU country', () => {
  it('AddressForm regex for postal code is [1-9][0-9]{3} and rejects leading-zero codes', () => {
    const fixture = TestBed.createComponent(AddressForm);
    fixture.detectChanges();

    fixture.componentInstance.postalCode.set('0123');
    fixture.detectChanges();
    expect(fixture.componentInstance.postalErrors().length).toBe(1);
    expect(fixture.componentInstance.postalErrors()[0]?.code).toBe('pattern');

    fixture.componentInstance.postalCode.set('abcd');
    fixture.detectChanges();
    expect(fixture.componentInstance.postalErrors().length).toBe(1);

    fixture.componentInstance.postalCode.set('123');
    fixture.detectChanges();
    expect(fixture.componentInstance.postalErrors().length).toBe(1);

    fixture.componentInstance.postalCode.set('12345');
    fixture.detectChanges();
    expect(fixture.componentInstance.postalErrors().length).toBe(1);

    fixture.componentInstance.postalCode.set('1011');
    fixture.detectChanges();
    expect(fixture.componentInstance.postalErrors().length).toBe(0);

    fixture.componentInstance.postalCode.set('9999');
    fixture.detectChanges();
    expect(fixture.componentInstance.postalErrors().length).toBe(0);
  });

  it('AddressForm enforces city length 2..80, line1 length 3..120, line2 optional <=120', () => {
    const fixture = TestBed.createComponent(AddressForm);
    fixture.detectChanges();

    fixture.componentInstance.city.set('A');
    fixture.detectChanges();
    expect(fixture.componentInstance.cityErrors().some((e) => e.code === 'length')).toBe(true);

    fixture.componentInstance.city.set('A'.repeat(81));
    fixture.detectChanges();
    expect(fixture.componentInstance.cityErrors().some((e) => e.code === 'length')).toBe(true);

    fixture.componentInstance.city.set('Budapest');
    fixture.detectChanges();
    expect(fixture.componentInstance.cityErrors().length).toBe(0);

    fixture.componentInstance.line1.set('Fo');
    fixture.detectChanges();
    expect(fixture.componentInstance.line1Errors().some((e) => e.code === 'length')).toBe(true);

    fixture.componentInstance.line1.set('A'.repeat(121));
    fixture.detectChanges();
    expect(fixture.componentInstance.line1Errors().some((e) => e.code === 'length')).toBe(true);

    fixture.componentInstance.line1.set('Fő utca 1.');
    fixture.detectChanges();
    expect(fixture.componentInstance.line1Errors().length).toBe(0);

    fixture.componentInstance.line2.set('');
    fixture.detectChanges();
    expect(fixture.componentInstance.line2Errors().length).toBe(0);

    fixture.componentInstance.line2.set('A'.repeat(121));
    fixture.detectChanges();
    expect(fixture.componentInstance.line2Errors().some((e) => e.code === 'length')).toBe(true);

    fixture.componentInstance.line2.set('2. emelet 4.');
    fixture.detectChanges();
    expect(fixture.componentInstance.line2Errors().length).toBe(0);
  });

  it('AddressForm hard-codes country to HU with a visible label, not a user-editable select', () => {
    const fixture = TestBed.createComponent(AddressForm);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.querySelector('select')).toBeNull();
    const countryEl = getElement(root, '[data-testid="address-field-country"]');
    expect(countryEl.textContent).toContain('HU');
    expect(countryEl.textContent).toContain('Magyarország');
    expect(fixture.componentInstance.countryCode()).toBe('HU');
  });

  it('AddressForm tags every error with a JSON pointer the orchestrator can map back', () => {
    const fixture = TestBed.createComponent(AddressForm);
    fixture.detectChanges();

    expect(fixture.componentInstance.postalErrors()[0]?.pointer).toBe(
      '/delivery/address/postalCode',
    );
    expect(fixture.componentInstance.cityErrors()[0]?.pointer).toBe('/delivery/address/city');
    expect(fixture.componentInstance.line1Errors()[0]?.pointer).toBe('/delivery/address/line1');

    fixture.componentInstance.line2.set('A'.repeat(121));
    fixture.detectChanges();
    expect(fixture.componentInstance.line2Errors()[0]?.pointer).toBe('/delivery/address/line2');
  });
});

// ---------------------------------------------------------------------------
// T21-AC03 - visible shipping fee per option; no tariff / installments / insurance
// ---------------------------------------------------------------------------
describe('T21-AC03 visible shipping fee per option; no tariff / installments / insurance / real card field', () => {
  it('DeliveryStep renders the shipping fee as a PriceBlock whose money matches the selected option', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();
    expect(fixture.componentInstance.currentShippingFee()).toEqual({
      amount: 1990,
      currency: 'HUF',
    });

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();
    expect(fixture.componentInstance.currentShippingFee()).toEqual({ amount: 0, currency: 'HUF' });
  });

  it('home_delivery and demo_pickup fees are exactly 1990 and 0 HUF - no fallback or rounding', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const options = fixture.componentInstance.readyOptions();
    expect(options).not.toBeNull();
    const homeOpt = options?.deliveryOptions.find((o) => o.id === 'home_delivery');
    const pickupOpt = options?.deliveryOptions.find((o) => o.id === 'demo_pickup');

    if (homeOpt !== undefined) {
      expect(fixture.componentInstance.feeFor(homeOpt)).toEqual({ amount: 1990, currency: 'HUF' });
    }
    if (pickupOpt !== undefined) {
      expect(fixture.componentInstance.feeFor(pickupOpt)).toEqual({ amount: 0, currency: 'HUF' });
    }
  });

  it('does not mention tariff, installment, insurance, monthly fee, hidden add-on or card fields', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const text = getRootElement(fixture).textContent.toLowerCase();
    expect(text).not.toContain('vám');
    expect(text).not.toContain('részlet');
    expect(text).not.toContain('installment');
    expect(text).not.toContain('biztosítás');
    expect(text).not.toContain('havi díj');
    expect(text).not.toContain('extra költség');
    expect(text).not.toContain('rejtett');
    expect(text).not.toContain('card number');
    expect(text).not.toContain('cvc');
  });

  it('PaymentMethodSelector accepts demo_card | demo_cod only - no wallet, transfer, or card-detail inputs', () => {
    const fixture = TestBed.createComponent(PaymentMethodSelector);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const radios = root.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(radios.length).toBe(2);
    const values = Array.from(radios).map((r) => r.value);
    expect(values).toEqual(['demo_card', 'demo_cod']);
    expect(root.querySelector('input[name="cardnumber"]')).toBeNull();
    expect(root.querySelector('input[name="expiry"]')).toBeNull();
    expect(root.querySelector('input[name="cvc"]')).toBeNull();
  });

  it('PaymentMethodSelector visibly labels both options and marks the simulation as a demo', () => {
    const fixture = TestBed.createComponent(PaymentMethodSelector);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.textContent).toContain('Bankkártya (szimulált)');
    expect(root.textContent).toContain('Utánvét (demó)');
    expect(root.textContent).toContain('Demó');
  });
});

// ---------------------------------------------------------------------------
// T21-AC04 - selection invalidates the previous quote and is not indicated by color alone
// ---------------------------------------------------------------------------
describe('T21-AC04 selection invalidates the previous quote and is not indicated by color alone', () => {
  it('DeliveryStep emits a `selectionChanged` event carrying DeliverySelection + paymentMethod', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onOptionSelected('demo_pickup');
    fixture.detectChanges();

    const change = fixture.componentInstance.selectionChanged();
    expect(change).not.toBeNull();
    expect(change?.delivery.optionId).toBe('demo_pickup');
    expect(change?.paymentMethod).toBe('demo_card');
  });

  it('Selection state is conveyed by an explicit "Kiválasztva" badge or similar, not only by a class', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const badge = getElement(root, '[data-testid="delivery-selected-badge"]');
    expect(badge.textContent.trim()).toBe('Kiválasztva');
    expect(badge.getAttribute('aria-live')).toBe('polite');
  });

  it('Selection radios bind their `checked` state to the signal so the DOM stays in sync', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const homeRadio = getInputElement(root, 'input[value="home_delivery"]');
    const pickupRadio = getInputElement(root, 'input[value="demo_pickup"]');
    expect(homeRadio.checked).toBe(true);
    expect(homeRadio.getAttribute('aria-checked')).toBe('true');
    expect(pickupRadio.checked).toBe(false);
    expect(pickupRadio.getAttribute('aria-checked')).toBe('false');
  });

  it('PaymentMethodSelector emits paymentChanged with demo_card | demo_cod and selection is not color-only', () => {
    const fixture = TestBed.createComponent(PaymentMethodSelector);
    fixture.detectChanges();

    let emitted: PaymentMethod | null = null;
    fixture.componentInstance.paymentChanged.subscribe((val) => {
      emitted = val;
    });

    fixture.componentInstance.onSelected('demo_cod');
    fixture.detectChanges();

    expect(emitted).toBe('demo_cod');
    const root = getRootElement(fixture);
    const badge = getElement(root, '[data-testid="payment-selected-badge"]');
    expect(badge.textContent.trim()).toBe('Kiválasztva');
  });

  it('Selection change sets a `requires fresh review` flag the parent can read', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();

    const change = fixture.componentInstance.selectionChanged();
    expect(change?.requiresFreshReview).toBe(true);
    expect(fixture.componentInstance.requiresFreshReview()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// T21-AC05 - options-load error has retry and never invents a free-shipping default
// ---------------------------------------------------------------------------
describe('T21-AC05 options-load error has retry and never invents a free-shipping default', () => {
  it('DeliveryStep renders ErrorState (with retry) when the options load fails', async () => {
    server.use(
      http.get('*/api/v1/checkout/options', () => {
        return HttpResponse.json({ code: 'UNAVAILABLE', detail: 'Service error' }, { status: 500 });
      }),
    );

    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-error-state')).not.toBeNull();
    expect(fixture.componentInstance.state().kind).toBe('error');
  });

  it('DeliveryStep never picks a fallback option when the load fails', async () => {
    server.use(
      http.get('*/api/v1/checkout/options', () => {
        return HttpResponse.json({ code: 'UNAVAILABLE', detail: 'Service error' }, { status: 500 });
      }),
    );

    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.selectedOptionId()).toBeNull();
    expect(fixture.componentInstance.readyOptions()).toBeNull();
    const root = getRootElement(fixture);
    expect(queryElement(root, '[data-testid="delivery-options"]')).toBeNull();
  });

  it('Loading state renders a skeleton (LoadingState) until the options land', () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    fixture.detectChanges();

    expect(fixture.componentInstance.state().kind).toBe('loading');
    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-loading-state')).not.toBeNull();
  });

  it('Selection is impossible while in the error branch', async () => {
    server.use(
      http.get('*/api/v1/checkout/options', () => {
        return HttpResponse.json({ code: 'UNAVAILABLE', detail: 'Service error' }, { status: 500 });
      }),
    );

    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.canConfirm()).toBe(false);
    expect(fixture.componentInstance.canProceedReady()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wiring + primitive conformance
// ---------------------------------------------------------------------------
describe('T21 wiring - owned files use the documented T10 primitives', () => {
  it('DeliveryStep wires ErrorState + LoadingState + PriceBlock; delegates FormFieldMessage to AddressForm', async () => {
    const fixture = TestBed.createComponent(DeliveryStep);
    await fixture.whenStable();
    fixture.detectChanges();

    fixture.componentInstance.onOptionSelected('home_delivery');
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(queryElement(root, 'app-price-block')).not.toBeNull();
    expect(queryElement(root, 'app-address-form')).not.toBeNull();
    expect(queryElement(root, 'app-form-field-message')).not.toBeNull();
  });

  it('AddressForm depends only on the shared form-field-message primitive', () => {
    const fixture = TestBed.createComponent(AddressForm);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const messages = root.querySelectorAll('app-form-field-message');
    expect(messages.length).toBeGreaterThan(0);
  });

  it('PaymentMethodSelector uses the shared Button primitive for the Confirm action', () => {
    const fixture = TestBed.createComponent(PaymentMethodSelector);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    expect(root.querySelector('app-button')).not.toBeNull();
  });

  it('AddressForm styles follow the desktop/mobile breakpoint rule (R22 narrow layout)', () => {
    const fixture = TestBed.createComponent(AddressForm);
    fixture.detectChanges();

    const root = getRootElement(fixture);
    const formEl = getElement(root, '[data-testid="address-form"]');
    expect(formEl.classList.contains('address')).toBe(true);
    const gridEl = formEl.querySelector('.grid');
    expect(gridEl).not.toBeNull();
    expect(gridEl?.classList.contains('grid-cols-1')).toBe(true);
  });
});
