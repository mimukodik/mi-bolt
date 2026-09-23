import { describe, expect, it } from 'vitest';

import { isHTMLInputElement, isHTMLSelectElement } from './event-target';

describe('isHTMLInputElement', () => {
  it('returns true for an <input> element', () => {
    expect(isHTMLInputElement(document.createElement('input'))).toBe(true);
  });

  it('returns false for a <select> element', () => {
    expect(isHTMLInputElement(document.createElement('select'))).toBe(false);
  });

  it('returns false for a <div> element', () => {
    expect(isHTMLInputElement(document.createElement('div'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isHTMLInputElement(null)).toBe(false);
  });
});

describe('isHTMLSelectElement', () => {
  it('returns true for a <select> element', () => {
    expect(isHTMLSelectElement(document.createElement('select'))).toBe(true);
  });

  it('returns false for an <input> element', () => {
    expect(isHTMLSelectElement(document.createElement('input'))).toBe(false);
  });

  it('returns false for a <div> element', () => {
    expect(isHTMLSelectElement(document.createElement('div'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(isHTMLSelectElement(null)).toBe(false);
  });
});
