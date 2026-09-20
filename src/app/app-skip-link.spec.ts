/**
 * FIX-52 — the skip link's position must have one owner (the
 * component stylesheet), not a Tailwind utility list duplicating and
 * partly contradicting it. This spec asserts the rendered element
 * carries no leftover utility class; it does not assert a computed
 * style, since jsdom applies neither the global stylesheet nor the
 * component stylesheet — the browser criteria (FIX-52-AC04/AC05)
 * measure that.
 */

// @vitest-environment jsdom
import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { App } from './app';

describe('FIX-52 skip link', () => {
  beforeEach(async () => {
    document.body.replaceChildren();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideZonelessChangeDetection()],
    });
    await TestBed.compileComponents();
  });

  it('carries exactly the skip-link class, the right href and the right text', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const skip = raw.querySelector('a.skip-link');
    if (!(skip instanceof HTMLAnchorElement)) throw new Error('Expected the skip link anchor');
    expect([...skip.classList]).toEqual(['skip-link']);
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(skip.textContent.trim()).toBe('Ugrás a tartalomhoz');
  });
});
