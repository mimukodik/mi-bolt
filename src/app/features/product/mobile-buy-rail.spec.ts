// @vitest-environment jsdom
import '@angular/compiler';

import { Component, signal } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

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
      (addRequested)="onAddRequested()"
      (errorDismissed)="onErrorDismissed()"
    />
  `,
})
class TestHostComponent {
  readonly money = signal<Money | null>({ amount: 339990, currency: 'HUF' });
  readonly available = signal<boolean>(true);
  readonly pending = signal<boolean>(false);
  readonly error = signal<UiProblem | null>(null);
  readonly presses: number[] = [];
  readonly errorDismissals = signal<number>(0);

  onAddRequested(): void {
    this.presses.push(1);
  }

  onErrorDismissed(): void {
    this.errorDismissals.update((n) => n + 1);
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
});
