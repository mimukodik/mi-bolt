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
    document.body.innerHTML = '';
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
    expect(Array.from(skip.classList)).toEqual(['skip-link']);
    expect(skip.getAttribute('href')).toBe('#main-content');
    expect(skip.textContent.trim()).toBe('Ugrás a tartalomhoz');
  });

  it('MIM-220: a click focuses main#main-content on the current route instead of navigating', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const main = document.createElement('main');
    main.id = 'main-content';
    main.setAttribute('tabindex', '-1');
    document.body.appendChild(main);
    const skip = raw.querySelector('a.skip-link');
    if (!(skip instanceof HTMLAnchorElement)) throw new Error('Expected the skip link');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    skip.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(main);
    main.remove();
  });

  it('MIM-220: without a main#main-content the native anchor is left alone', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    expect(document.querySelector('main#main-content')).toBeNull();
    const skip = raw.querySelector('a.skip-link');
    if (!(skip instanceof HTMLAnchorElement)) throw new Error('Expected the skip link');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    skip.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });

  it('MIM-220: a modifier-key click keeps the native anchor behaviour', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const raw: unknown = fixture.nativeElement;
    if (!(raw instanceof HTMLElement)) throw new Error('Expected HTMLElement');
    const main = document.createElement('main');
    main.id = 'main-content';
    main.setAttribute('tabindex', '-1');
    document.body.appendChild(main);
    const skip = raw.querySelector('a.skip-link');
    if (!(skip instanceof HTMLAnchorElement)) throw new Error('Expected the skip link');
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, metaKey: true });
    skip.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
    expect(document.activeElement).not.toBe(main);
    main.remove();
  });
});
