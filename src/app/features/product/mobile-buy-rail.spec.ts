// @vitest-environment jsdom
import '@angular/compiler';

import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MobileBuyRail } from './mobile-buy-rail';
import type { UiProblem } from '../../shared/types/ui-problem';
import type { Money } from '../../shared/ui/price-block/price-block';

/**
 * FIX-50 item 5 — `MobileBuyRail` extracted to
 * `docs/spec/components.md:476-488` (with the `error` input decision
 * D11 adds at `:480`). Shares the page's single pending/error state
 * rather than owning one of its own
 * (`docs/spec/architecture.md:57`).
 */
@Component({
  imports: [MobileBuyRail],
  template: `
    <app-mobile-buy-rail
      [available]="available()"
      [error]="error()"
      [money]="money()"
      [pending]="pending()"
      [success]="success()"
      (addRequested)="onAddRequested()"
      (errorDismissed)="onErrorDismissed()"
      (successDismissed)="onSuccessDismissed()"
    />
  `,
})
class TestHostComponent {
  readonly money = signal<Money | null>({ amount: 339990, currency: 'HUF' });
  readonly available = signal<boolean>(true);
  readonly pending = signal<boolean>(false);
  readonly error = signal<UiProblem | null>(null);
  readonly success = signal<string | null>(null);
  readonly presses: number[] = [];
  readonly errorDismissals = signal<number>(0);
  readonly successDismissals = signal<number>(0);

  onAddRequested(): void {
    this.presses.push(1);
  }

  onErrorDismissed(): void {
    this.errorDismissals.update((n) => n + 1);
  }

  onSuccessDismissed(): void {
    this.successDismissals.update((n) => n + 1);
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

afterEach(() => {
  TestBed.resetTestingModule();
});

async function createHarness(): Promise<{
  fixture: ComponentFixture<TestHostComponent>;
  host: TestHostComponent;
  root: HTMLElement;
}> {
  TestBed.configureTestingModule({
    imports: [TestHostComponent],
    teardown: { destroyAfterEach: true },
  });
  await TestBed.compileComponents();

  const fixture = TestBed.createComponent(TestHostComponent);
  const host = fixture.componentInstance;
  fixture.detectChanges();
  await fixture.whenStable();

  return { fixture, host, root: getRootElement(fixture) };
}

describe('MobileBuyRail (FIX-50 extraction from product-page.html)', () => {
  it('renders its root with data-testid="purchase-rail"', async () => {
    const { root } = await createHarness();
    expect(root.querySelector('[data-testid="purchase-rail"]')).not.toBeNull();
  });

  it('pending true renders the loading label', async () => {
    const { host, root, fixture } = await createHarness();
    host.pending.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const button = queryButton(root, '[data-testid="purchase-cta"] button');
    expect(button.textContent).toContain('Hozzáadás…');
    expect(button.disabled).toBe(true);
  });

  it('available false renders the disabled control', async () => {
    const { host, root, fixture } = await createHarness();
    host.available.set(false);
    fixture.detectChanges();
    await fixture.whenStable();

    const button = queryButton(root, '[data-testid="purchase-cta"] button');
    expect(button.disabled).toBe(true);
  });

  it('error non-null renders the problem message; error null renders no error surface at all', async () => {
    const { host, root, fixture } = await createHarness();

    expect(root.querySelector('[data-testid="status-message"]')).toBeNull();

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
    expect(statusEl?.textContent).toContain(
      'A termék hozzáadása nem sikerült; a kosár változatlan.',
    );

    host.error.set(null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector('[data-testid="status-message"]')).toBeNull();
  });

  it('a click emits addRequested exactly once', async () => {
    const { host, root, fixture } = await createHarness();

    const button = queryButton(root, '[data-testid="purchase-cta"] button');
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.presses.length).toBe(1);
  });

  it('a click while pending or unavailable emits nothing', async () => {
    const { host, root, fixture } = await createHarness();
    host.pending.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const button = queryButton(root, '[data-testid="purchase-cta"] button');
    button.click();
    await fixture.whenStable();

    expect(host.presses.length).toBe(0);
  });

  it('MIM-216: the error toast shows "Bezárás" and clicking it emits errorDismissed and returns focus to the rail CTA', async () => {
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
    if (!(statusEl instanceof HTMLElement)) {
      throw new Error('Expected status message element');
    }
    const closeBtn = queryButton(statusEl, 'button');
    expect(closeBtn.textContent).toContain('Bezárás');

    closeBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.errorDismissals()).toBe(1);
    const ctaButton = root.querySelector('[data-testid="purchase-cta"] button');
    expect(document.activeElement).toBe(ctaButton);
  });

  it('MIM-216: success non-null renders the success message; error takes precedence when both are set', async () => {
    const { host, root, fixture } = await createHarness();

    host.success.set('Demo One 5G, Grafit, 128 GB – 1 darab a kosárban.');
    fixture.detectChanges();
    await fixture.whenStable();

    const statusEl = root.querySelector('[data-testid="status-message"]');
    expect(statusEl).not.toBeNull();
    expect(statusEl?.textContent).toContain('Demo One 5G, Grafit, 128 GB – 1 darab a kosárban.');

    host.error.set({
      code: 'UNKNOWN',
      message: 'A termék hozzáadása nem sikerült; a kosár változatlan.',
      fieldErrors: [],
      retryable: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const errorStatusEl = root.querySelector('[data-testid="status-message"]');
    expect(errorStatusEl).not.toBeNull();
    expect(errorStatusEl?.textContent).toContain(
      'A termék hozzáadása nem sikerült; a kosár változatlan.',
    );
    expect(errorStatusEl?.textContent).not.toContain(
      'Demo One 5G, Grafit, 128 GB – 1 darab a kosárban.',
    );
  });

  it('MIM-216: clicking Bezárás on the success message emits successDismissed once and returns focus to the rail CTA', async () => {
    const { host, root, fixture } = await createHarness();
    host.success.set('Demo One 5G, Grafit, 128 GB – 1 darab a kosárban.');
    fixture.detectChanges();
    await fixture.whenStable();

    const statusEl = root.querySelector('[data-testid="status-message"]');
    if (!(statusEl instanceof HTMLElement)) {
      throw new Error('Expected status message element');
    }
    const closeBtn = queryButton(statusEl, 'button');
    expect(closeBtn.textContent).toContain('Bezárás');

    closeBtn.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(host.successDismissals()).toBe(1);
    const ctaButton = root.querySelector('[data-testid="purchase-cta"] button');
    expect(document.activeElement).toBe(ctaButton);
  });

  it("MIM-238: the message is the rail's first row, above the price and CTA row", async () => {
    const { host, root, fixture } = await createHarness();
    host.success.set('Demo One 5G, Grafit, 128 GB – 1 darab a kosárban.');
    fixture.detectChanges();
    await fixture.whenStable();

    const rail = root.querySelector('[data-testid="purchase-rail"]');
    if (!(rail instanceof HTMLElement)) throw new Error('Expected the rail');
    const status = rail.querySelector('.rail-status');
    const row = rail.querySelector('.rail-row');

    expect(rail.firstElementChild).toBe(status);
    expect(status?.parentElement).toBe(rail);
    expect(row?.parentElement).toBe(rail);
    expect(row?.firstElementChild?.classList.contains('rail-price')).toBe(true);
    expect(row?.lastElementChild?.classList.contains('rail-cta')).toBe(true);
    expect(row?.querySelector('[data-testid="purchase-cta"]')).not.toBeNull();
    expect(row?.querySelector('app-price-block')).not.toBeNull();
  });

  it('MIM-238: the error toast is also the rail first row, above the price and CTA row', async () => {
    const { host, root, fixture } = await createHarness();
    host.error.set({
      code: 'UNKNOWN',
      message: 'A termék hozzáadása nem sikerült; a kosár változatlan.',
      fieldErrors: [],
      retryable: true,
    });
    fixture.detectChanges();
    await fixture.whenStable();

    const rail = root.querySelector('[data-testid="purchase-rail"]');
    if (!(rail instanceof HTMLElement)) throw new Error('Expected the rail');
    const status = rail.querySelector('.rail-status');
    const row = rail.querySelector('.rail-row');

    expect(rail.firstElementChild).toBe(status);
    expect(status?.parentElement).toBe(rail);
    expect(row?.parentElement).toBe(rail);
  });

  it('MIM-238: with no message the price and CTA row is the rail only child', async () => {
    const { root } = await createHarness();

    const rail = root.querySelector('[data-testid="purchase-rail"]');
    if (!(rail instanceof HTMLElement)) throw new Error('Expected the rail');

    expect(rail.querySelector('.rail-status')).toBeNull();
    const row = rail.querySelector('.rail-row');
    expect(row).not.toBeNull();
    expect(row?.parentElement).toBe(rail);
    expect(rail.firstElementChild).toBe(row);
  });
});

describe('MIM-238 follow-up: the rail publishes its real height', () => {
  let callback: ResizeObserverCallback | null = null;
  let observed: Element | null = null;
  let disconnected = 0;
  const original = globalThis.ResizeObserver;

  class FakeResizeObserver {
    constructor(cb: ResizeObserverCallback) {
      callback = cb;
    }
    observe(target: Element): void {
      observed = target;
    }
    unobserve(): void {
      /* no-op */
    }
    disconnect(): void {
      disconnected += 1;
    }
  }

  /** The observer argument the production callback ignores. A plain
   *  object, so no second FakeResizeObserver overwrites `callback`. */
  const unusedObserver: ResizeObserver = {
    observe: () => {
      /* no-op */
    },
    unobserve: () => {
      /* no-op */
    },
    disconnect: () => {
      /* no-op */
    },
  };

  beforeEach(() => {
    callback = null;
    observed = null;
    disconnected = 0;
    globalThis.ResizeObserver = FakeResizeObserver;
  });

  afterEach(() => {
    globalThis.ResizeObserver = original;
    document.documentElement.style.removeProperty('--rail-block-size');
  });

  it('observes the rail and writes its height to --rail-block-size on the root element', async () => {
    const { root } = await createHarness();
    const rail = root.querySelector<HTMLElement>('[data-testid="purchase-rail"]');
    if (rail === null) throw new Error('Expected the rail');
    expect(observed).toBe(rail);

    vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
      height: 132,
      width: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } satisfies DOMRect);
    function takeCallback(): ResizeObserverCallback {
      if (callback === null) throw new Error('Expected a ResizeObserver callback');
      return callback;
    }
    takeCallback()([], unusedObserver);

    expect(document.documentElement.style.getPropertyValue('--rail-block-size')).toBe('132px');
  });

  it('removes --rail-block-size and disconnects when the rail is destroyed', async () => {
    const { fixture, root } = await createHarness();
    const rail = root.querySelector<HTMLElement>('[data-testid="purchase-rail"]');
    if (rail === null) throw new Error('Expected the rail');
    vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
      height: 132,
      width: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } satisfies DOMRect);
    function takeCallback(): ResizeObserverCallback {
      if (callback === null) throw new Error('Expected a ResizeObserver callback');
      return callback;
    }
    takeCallback()([], unusedObserver);

    fixture.destroy();

    expect(document.documentElement.style.getPropertyValue('--rail-block-size')).toBe('');
    expect(disconnected).toBe(1);
  });
});
