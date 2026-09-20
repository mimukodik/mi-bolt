// @vitest-environment jsdom
import '@angular/compiler';

import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { VariantSelector } from './variant-selector';
import type { Variant } from '../../api/legacy/models/variant';

/**
 * FIX-50 item 4 — `VariantSelector` reshaped to
 * `docs/spec/components.md:435-443`: takes the variant list directly,
 * resolves the exact (color, storage) pair itself, and emits the
 * resolved variant id rather than two axis events. Deliberately
 * missing the silver/512 combination so a genuinely unavailable pair
 * can be exercised (`components.md:439` — "never choose a
 * substitute").
 */
const variants: readonly Variant[] = [
  {
    id: 'v-graphite-256',
    colorCode: 'graphite',
    colorName: 'Grafit',
    swatchHex: '#343B43',
    storageGb: 256,
    price: { amount: 339990, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [],
  },
  {
    id: 'v-graphite-512',
    colorCode: 'graphite',
    colorName: 'Grafit',
    swatchHex: '#343B43',
    storageGb: 512,
    price: { amount: 378390, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [],
  },
  {
    id: 'v-silver-256',
    colorCode: 'silver',
    colorName: 'Ezüst',
    swatchHex: '#C6C9CB',
    storageGb: 256,
    price: { amount: 344990, currency: 'HUF' },
    availability: 'in_stock',
    maxQuantity: 5,
    images: [],
  },
] satisfies readonly Variant[];

@Component({
  imports: [VariantSelector],
  template: `
    <app-variant-selector
      [variants]="variants()"
      [selectedId]="selectedId()"
      [disabled]="disabled()"
      (variantSelected)="onVariantSelected($event)"
    ></app-variant-selector>
  `,
})
class TestHostComponent {
  readonly variants = signal<readonly Variant[]>(variants);
  readonly selectedId = signal<string | null>('v-graphite-256');
  readonly disabled = signal<boolean>(false);
  readonly selections: string[] = [];

  onVariantSelected(variantId: string): void {
    this.selections.push(variantId);
    this.selectedId.set(variantId);
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

describe('VariantSelector (FIX-50 reshape to components.md:435-443)', () => {
  it('with a colour+storage pair that has a variant, clicking the colour emits that variant id', async () => {
    const { host, root, fixture } = await createHarness();

    const silverBtn = queryButton(root, '[data-testid="variant-color-silver"]');
    silverBtn.click();
    await fixture.whenStable();

    expect(host.selections).toEqual(['v-silver-256']);
  });

  it('with a colour+storage pair that has a variant, clicking the storage emits that variant id', async () => {
    const { host, root, fixture } = await createHarness();

    const storage512Btn = queryButton(root, '[data-testid="variant-storage-512"]');
    storage512Btn.click();
    await fixture.whenStable();

    expect(host.selections).toEqual(['v-graphite-512']);
  });

  it('with a pair that has no variant, the control is unavailable, shows a reason, and emits nothing', async () => {
    const { host, root, fixture } = await createHarness();

    // silver + 256 is the current selection; switch storage to 512,
    // which has no silver variant.
    const silverBtn = queryButton(root, '[data-testid="variant-color-silver"]');
    silverBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();
    host.selections.length = 0;

    const storage512Btn = queryButton(root, '[data-testid="variant-storage-512"]');
    expect(storage512Btn.disabled).toBe(true);

    storage512Btn.click();
    await fixture.whenStable();

    expect(host.selections.length).toBe(0);
    const reason = root.querySelector('.reason');
    expect(reason).not.toBeNull();
    expect(reason?.textContent).toContain('nem elérhető');
  });

  it('disabled true disables every control in the selector', async () => {
    const { host, root, fixture } = await createHarness();
    host.disabled.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    const buttons = root.querySelectorAll('.option');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      if (!(btn instanceof HTMLButtonElement)) throw new Error('Expected HTMLButtonElement');
      expect(btn.disabled).toBe(true);
    });

    queryButton(root, '[data-testid="variant-color-silver"]').click();
    await fixture.whenStable();
    expect(host.selections.length).toBe(0);
  });
});
