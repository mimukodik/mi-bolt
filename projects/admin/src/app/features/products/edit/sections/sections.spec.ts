import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { form } from '@angular/forms/signals';

import { emptyProductForm } from '../product-form.model';
import { productFormSchema } from '../product-form.schema';

import { BasicsSection } from './basics-section';
import { ColorsSection } from './colors-section';
import { DisplayCard } from './display-card';
import { HighlightsSection } from './highlights-section';
import { SpecGroupsSection } from './spec-groups-section';
import { VariantsSection } from './variants-section';

@Component({
  selector: 'adm-sections-host',
  imports: [
    BasicsSection,
    DisplayCard,
    HighlightsSection,
    ColorsSection,
    VariantsSection,
    SpecGroupsSection,
  ],
  template: `
    <adm-basics-section [attempted]="attempted()" [brands]="[]" [form]="form" />
    <adm-display-card [attempted]="attempted()" [featuredOthers]="0" [form]="form" />
    <adm-highlights-section [attempted]="attempted()" [field]="form.highlights" />
    <adm-colors-section [attempted]="attempted()" [field]="form.colors" />
    <adm-variants-section [attempted]="attempted()" [form]="form" />
    <adm-spec-groups-section [attempted]="attempted()" [field]="form.specGroups" />
  `,
})
class Host {
  readonly attempted = signal(false);
  readonly form = form(
    signal(emptyProductForm()),
    productFormSchema({ featuredOthers: signal(0) }),
  );
}

describe('The product edit page stubs', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [Host],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(Host);
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

  function titles(): string[] {
    return Array.from(
      element().querySelectorAll(
        '.adm-section-title > span:not(.adm-section-number):not(.adm-section-errors)',
      ),
    ).map((el) => el.textContent.trim());
  }

  function errorTexts(): string[] {
    return Array.from(element().querySelectorAll('.adm-section-errors')).map((el) =>
      el.textContent.trim(),
    );
  }

  it('renders the six section titles in order and no error badges before a save attempt', () => {
    // Fails if a section's title or order changes, or a card shows an error
    // badge before attempted() is true.
    expect(titles()).toEqual([
      'Alapadatok',
      'Megjelenítés',
      'Kiemelések',
      'Színek és képek',
      'Változatok',
      'Specifikáció',
    ]);
    expect(errorTexts()).toEqual([]);
  });

  it('shows each section error count once a save was attempted', async () => {
    // Fails if a section's errorCount computation stops matching the schema's
    // errors for the empty form, or attempted() stops gating the count.
    host.attempted.set(true);
    await fixture.whenStable();

    expect(errorTexts()).toEqual(['4 hiba', '2 hiba', '1 hiba', '5 hiba', '2 hiba', '3 hiba']);
  });
});
