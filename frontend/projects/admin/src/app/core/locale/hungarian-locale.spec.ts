// projects/admin/src/app/core/locale/hungarian-locale.spec.ts — MIM-404.
//
// The Hungarian locale data is registered by the injector of a lazily loaded
// route that formats dates, not by main.ts, so it is absent until such an
// injector is created.

import { formatDate, registerLocaleData } from '@angular/common';
import localeHu from '@angular/common/locales/hu';
import {
  EnvironmentInjector,
  createEnvironmentInjector,
  ɵunregisterLocaleData,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { provideHungarianLocaleData } from './hungarian-locale';

describe('provideHungarianLocaleData', () => {
  // The unit-test builder runs every spec file in one module context
  // (isolate: false), and some specs register hu-HU when they are imported,
  // so this one starts from no locale data and puts hu-HU back afterwards.
  beforeEach(() => {
    ɵunregisterLocaleData();
  });

  afterEach(() => {
    registerLocaleData(localeHu, 'hu-HU');
  });

  it('registers hu-HU once an injector that carries it is created', () => {
    const date = new Date(2026, 8, 24, 12, 0);
    expect(() => formatDate(date, 'MMMM', 'hu-HU')).toThrow(
      'Missing locale data for the locale "hu-HU".',
    );

    const injector = createEnvironmentInjector(
      [provideHungarianLocaleData()],
      TestBed.inject(EnvironmentInjector),
    );

    expect(formatDate(date, 'MMMM', 'hu-HU')).toBe('szeptember');
    injector.destroy();
  });
});
