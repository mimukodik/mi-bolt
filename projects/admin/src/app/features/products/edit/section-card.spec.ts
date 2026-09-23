import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';

import { SectionCard } from './section-card';

@Component({
  selector: 'adm-section-card-host',
  imports: [SectionCard],
  template: `
    <adm-section-card title="Színek és képek" [errorCount]="errorCount()" [number]="number()">
      <button admSectionActions type="button">Hozzáadás</button>
      <p>Tartalom</p>
    </adm-section-card>
  `,
})
class HostComponent {
  readonly number = signal<number | null>(3);
  readonly errorCount = signal(0);
}

describe('SectionCard', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    await fixture.whenStable();
  });

  function element(): HTMLElement {
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) {
      throw new Error('Expected the host element');
    }
    return raw;
  }

  function titleText(): string | undefined {
    return element()
      .querySelector('.adm-section-title > span:not(.adm-section-number):not(.adm-section-errors)')
      ?.textContent.trim();
  }

  it('renders the number, the title, the projected content and actions, and no error badge', () => {
    // Fails if the number, title, content-projection, or actions-slot bindings change.
    const root = element();
    expect(root.querySelector('.adm-section-number')?.textContent.trim()).toBe('3');
    expect(titleText()).toBe('Színek és képek');
    expect(root.querySelector('.adm-section-errors')).toBeNull();
    expect(root.querySelector('mat-card-content p')?.textContent.trim()).toBe('Tartalom');
    expect(root.querySelector('.adm-section-actions button')?.textContent.trim()).toBe('Hozzáadás');
  });

  it('shows the error badge once errorCount is positive', async () => {
    // Fails if `@if (errorCount() > 0)` stops gating the badge.
    host.errorCount.set(2);
    await fixture.whenStable();

    expect(element().querySelector('.adm-section-errors')?.textContent.trim()).toBe('2 hiba');
  });

  it('renders no number element when number is null', async () => {
    // Fails if `@if (number(); as number)` renders for a null number.
    host.number.set(null);
    await fixture.whenStable();

    expect(element().querySelector('.adm-section-number')).toBeNull();
  });
});
