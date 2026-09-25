// @vitest-environment jsdom
import '@angular/compiler';

import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SpecGroup } from '@mi-bolt/api/models/spec-group';

import { SpecificationAccordion } from './specification-accordion';

/**
 * NG0955 guard for the specification boxes.
 *
 * Every catalogue product carries two `Töltőfej` rows in its
 * `Csomag tartalma` group (one `csak töltőkábel`, one `Nem`) and the
 * contract declares no list here unique, so a track key taken from
 * `row.label` warns for every product page.
 */
afterEach(() => {
  TestBed.resetTestingModule();
});

function hostElement(fixture: { nativeElement: unknown }): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
  return raw;
}

function queryElement(parent: Element, selector: string): HTMLElement {
  const el = parent.querySelector(selector);
  if (!(el instanceof HTMLElement)) throw new Error(`Expected HTMLElement: ${selector}`);
  return el;
}

describe('SpecificationAccordion', () => {
  it('renders two rows that share a label without NG0955', () => {
    const groups: readonly SpecGroup[] = [
      {
        id: 'csomag-tartalma',
        title: 'Csomag tartalma',
        rows: [
          { label: 'Töltőfej', value: 'csak töltőkábel' },
          { label: 'Töltőfej', value: 'Nem' },
        ],
      },
    ];

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const fixture = TestBed.createComponent(SpecificationAccordion);
      fixture.componentRef.setInput('groups', groups);
      fixture.detectChanges();

      // NG0955 is recorded only when a rendered list is reconciled against
      // the next one, so the same rows arrive again in a new array.
      fixture.componentRef.setInput(
        'groups',
        groups.map((entry) => ({ ...entry, rows: [...entry.rows] })),
      );
      fixture.detectChanges();

      const group = queryElement(
        hostElement(fixture),
        '[data-testid="spec-group-csomag-tartalma"]',
      );
      const rows = Array.from(group.querySelectorAll('.row'));
      expect(rows.length).toBe(2);

      const values = rows.map((row) => queryElement(row, '.value').textContent.trim());
      expect(values).toEqual(['csak töltőkábel', 'Nem']);

      expect(warn.mock.calls.some((call) => String(call[0]).includes('NG0955'))).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });
});
