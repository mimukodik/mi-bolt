/**
 * T18 / FIX-50 — add-to-cart surface (S3 → S4.1), reshaped to
 * `docs/spec/components.md:446-458` (`AddToCartControl`): presentation
 * only, one primary CTA, one `addRequested` intent, no own cart
 * persistence. `ProductPage` is the container that owns `CartFacade`
 * (components.md:409) — see `product-page.spec.ts` for the
 * integration coverage of the actual mutation.
 */

// @vitest-environment jsdom
import '@angular/compiler';

import { Component, Input, Output, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { readFile } from 'node:fs/promises';
import { resolve as pathResolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

import { Button } from '../../shared/ui/button/button';
import { StatusMessage } from '../../shared/ui/status-message/status-message';
import type { UiProblem } from '../../shared/types/ui-problem';
import { AddToCart } from './add-to-cart';

import type { Variant } from '../../api/generated/models/variant';

const sampleVariant: Variant = {
  id: 'demo-one-5g-graphite-256',
  slug: 'demo-one-5g-graphite-256-variant',
  colorCode: 'graphite',
  colorName: 'Grafit',
  swatchHex: '#343B43',
  storageGb: 256,
  price: { amount: 339990, currency: 'HUF' },
  availability: 'in_stock',
  maxQuantity: 5,
  images: [],
} satisfies Variant;

function registerComponentMetadata(
  componentClass: unknown,
  config: { inputs?: readonly string[]; outputs?: readonly string[] },
): void {
  if (typeof componentClass !== 'function') return;
  const raw: unknown = Reflect.get(componentClass, 'propDecorators');
  const propDecorators: Record<string, unknown[]> = {};
  if (typeof raw === 'object' && raw !== null) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        const arr: unknown[] = [];
        for (const item of value) arr.push(item);
        propDecorators[key] = arr;
      }
    }
  }
  for (const name of config.inputs ?? []) {
    const arr = propDecorators[name] ?? [];
    arr.push({ type: Input, args: [{ isSignal: true }] });
    propDecorators[name] = arr;
  }
  for (const name of config.outputs ?? []) {
    const arr = propDecorators[name] ?? [];
    arr.push({ type: Output, args: [] });
    propDecorators[name] = arr;
  }
  Reflect.set(componentClass, 'propDecorators', propDecorators);
}

registerComponentMetadata(AddToCart, {
  inputs: ['variant', 'quantity', 'pending', 'error'],
  outputs: ['addRequested'],
});
registerComponentMetadata(Button, {
  inputs: ['variant', 'size', 'label', 'loadingLabel', 'disabled', 'loading', 'type'],
  outputs: ['pressed'],
});
registerComponentMetadata(StatusMessage, {
  inputs: ['message', 'severity', 'persistent'],
  outputs: ['dismissed'],
});

const fileCache = new Map<string, string>();

async function resolveWorkspaceFile(url: string): Promise<string> {
  if (url.endsWith('.scss') || url.endsWith('.css')) return '';
  const filename = url.startsWith('./') ? url.slice(2) : url;
  const cached = fileCache.get(filename);
  if (cached !== undefined) return cached;
  const fullPath = pathResolve(process.cwd(), 'src/app/features/product', filename);
  const content = await readFile(fullPath, 'utf-8');
  fileCache.set(filename, content);
  return content;
}

beforeAll(async () => {
  const { ɵresolveComponentResources } = await import('@angular/core');
  await ɵresolveComponentResources(resolveWorkspaceFile);
  await TestBed.compileComponents();
});

@Component({
  imports: [AddToCart],
  template: `
    <app-add-to-cart
      [variant]="variant()"
      [quantity]="quantity()"
      [pending]="pending()"
      [error]="error()"
      (addRequested)="onAddRequested($event)"
    ></app-add-to-cart>
  `,
})
class TestHostComponent {
  readonly variant = signal<Variant | null>(sampleVariant);
  readonly quantity = signal<number>(2);
  readonly pending = signal<boolean>(false);
  readonly error = signal<UiProblem | null>(null);
  readonly requests: { variantId: string; quantity: number }[] = [];

  onAddRequested(event: { variantId: string; quantity: number }): void {
    this.requests.push(event);
  }
}

function getRootElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
  return raw;
}

function queryButton(parent: ParentNode, selector: string): HTMLButtonElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLButtonElement))
    throw new Error(`Expected HTMLButtonElement: ${selector}`);
  return el;
}

async function createHarness(): Promise<{
  fixture: ComponentFixture<TestHostComponent>;
  host: TestHostComponent;
  root: HTMLElement;
}> {
  // FIX-50-AC01: constructing the component with NO CartFacade
  // provider at all must succeed — that is the proof the injection
  // is gone.
  TestBed.configureTestingModule({
    imports: [TestHostComponent, AddToCart, Button, StatusMessage],
    providers: [provideZonelessChangeDetection()],
    teardown: { destroyAfterEach: true },
  });

  await TestBed.compileComponents();

  const fixture = TestBed.createComponent(TestHostComponent);
  const host = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, host, root: getRootElement(fixture) };
}

describe('AddToCart (FIX-50 reshape to components.md:446-458)', () => {
  it('FIX-50-AC01: renders and constructs with no CartFacade provider at all', async () => {
    const { root } = await createHarness();
    expect(root.querySelector('[data-testid="add-to-cart"]')).not.toBeNull();
  });

  it('with a null variant the control is disabled and a click emits nothing', async () => {
    const { host, root, fixture } = await createHarness();
    host.variant.set(null);
    fixture.detectChanges();
    await fixture.whenStable();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    expect(button.disabled).toBe(true);

    button.click();
    await fixture.whenStable();
    expect(host.requests.length).toBe(0);
  });

  it('with a variant, a click emits exactly one addRequested carrying that variant id and the quantity input', async () => {
    const { host, root, fixture } = await createHarness();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.requests.length).toBe(1);
    expect(host.requests[0]).toEqual({ variantId: 'demo-one-5g-graphite-256', quantity: 2 });
  });

  it('with pending true the control shows its in-flight label and a second click emits nothing', async () => {
    const { host, root, fixture } = await createHarness();
    host.pending.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const button = queryButton(root, '[data-testid="add-to-cart-button"] button');
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-busy')).toBe('true');

    button.click();
    await fixture.whenStable();
    expect(host.requests.length).toBe(0);

    const statusEl = root.querySelector('[data-testid="status-message"]');
    expect(statusEl?.textContent).toContain('A termék hozzáadása a kosárhoz…');
  });

  it('with an error the error banner renders its message', async () => {
    const { host, root, fixture } = await createHarness();
    host.error.set({
      code: 'UNKNOWN',
      message: 'A termék hozzáadása nem sikerült; a kosár változatlan.',
      fieldErrors: [],
      retryable: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const statusEl = root.querySelector('[data-testid="status-message"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl?.classList.contains('is-error')).toBe(true);
    expect(statusEl?.textContent).toContain(
      'A termék hozzáadása nem sikerült; a kosár változatlan.',
    );
  });

  it('pending takes precedence over error for the banner shown', async () => {
    const { host, root, fixture } = await createHarness();
    host.pending.set(true);
    host.error.set({
      code: 'UNKNOWN',
      message: 'stale error',
      fieldErrors: [],
      retryable: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const statusEl = root.querySelector('[data-testid="status-message"]');
    expect(statusEl?.textContent).toContain('A termék hozzáadása a kosárhoz…');
    expect(statusEl?.textContent).not.toContain('stale error');
  });

  it('with neither pending nor error, no status banner renders', async () => {
    const { root } = await createHarness();
    expect(root.querySelector('[data-testid="status-message"]')).toBeNull();
  });
});

describe('FIX-16/FIX-50 ProductPage add-to-cart integration (source-text regression guard)', () => {
  it('ProductPage template contains app-add-to-cart, onAddRequested calls cartFacade.addItem, and the removed added output is not bound', async () => {
    const htmlPath = pathResolve(process.cwd(), 'src/app/features/product/product-page.html');
    const tsPath = pathResolve(process.cwd(), 'src/app/features/product/product-page.ts');
    const html = await readFile(htmlPath, 'utf-8');
    const ts = await readFile(tsPath, 'utf-8');

    expect(html).toContain('<app-add-to-cart');
    expect(html).not.toContain('(added)=');
    expect(ts).toContain('cartFacade.addItem');
  });
});
