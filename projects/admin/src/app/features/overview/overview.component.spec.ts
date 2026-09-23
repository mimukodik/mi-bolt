import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { DebugElement } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatGridList, MatGridTile } from '@angular/material/grid-list';
import { http } from 'msw';
import { of } from 'rxjs';

import { provideApiConfiguration } from '../../api/generated/api-configuration';
import { useMswServer, server } from '../../../testing/msw-server';
import { createDb } from '../../../mocks/db';
import type { ScenarioName } from '../../../mocks/scenario';
import { SEED_ADMIN } from '../../../mocks/seed';
import { productsReadHandlers } from '../../../mocks/products-read.handlers';
import { usersHandlers } from '../../../mocks/users.handlers';
import { serviceUnavailable } from '../../../mocks/backend-answers';

import { OverviewComponent } from './overview.component';

useMswServer();

function useBackend(scenario: ScenarioName = 'default'): void {
  const db = createDb(scenario);
  db.sessionAdminId = SEED_ADMIN.id;
  if (server === undefined) throw new Error('MSW server not initialised');
  server.use(...productsReadHandlers(db), ...usersHandlers(db));
}

function textsOf(root: HTMLElement, selector: string): string[] {
  return Array.from(root.querySelectorAll(selector)).map((el) =>
    el.textContent.trim().replace(/\s+/g, ' '),
  );
}

function breakpointStub(matches: boolean): Partial<BreakpointObserver> {
  return {
    observe: () => of({ matches, breakpoints: {} }),
  };
}

function tilesOf(fixture: ComponentFixture<OverviewComponent>): MatGridTile[] {
  const elements: readonly DebugElement[] = fixture.debugElement.queryAll(
    By.directive(MatGridTile),
  );
  const result: MatGridTile[] = [];
  for (const d of elements) {
    const instance: unknown = d.componentInstance;
    if (instance instanceof MatGridTile) {
      result.push(instance);
    }
  }
  return result;
}

function gridOf(fixture: ComponentFixture<OverviewComponent>): MatGridList {
  const instance: unknown = fixture.debugElement.query(By.directive(MatGridList)).componentInstance;
  if (!(instance instanceof MatGridList)) {
    throw new Error('Expected a mat-grid-list');
  }
  return instance;
}

function hostOf(fixture: ComponentFixture<OverviewComponent>): HTMLElement {
  const element: unknown = fixture.nativeElement;
  if (!(element instanceof HTMLElement)) {
    throw new Error('Expected the host element');
  }
  return element;
}

describe('OverviewComponent', () => {
  describe('desktop layout (handset = false)', () => {
    let fixture: ComponentFixture<OverviewComponent>;
    let native: HTMLElement;

    beforeEach(async () => {
      useBackend();
      TestBed.configureTestingModule({
        imports: [OverviewComponent],
        providers: [
          provideRouter([]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(false) },
          provideHttpClient(withXhr()),
          provideApiConfiguration(new URL('/api/v1', document.baseURI).href),
        ],
      });
      fixture = TestBed.createComponent(OverviewComponent);
      native = hostOf(fixture);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    });

    it('renders the four card titles in order', () => {
      const titles: string[] = Array.from(native.querySelectorAll('mat-card-title')).map((el) =>
        el.textContent.trim().replace(/\s+/g, ' '),
      );
      expect(titles).toEqual([
        'Aktív termékek',
        'Archivált termékek',
        'Kiemelt termékek 4 / 4',
        'Adminok',
      ]);
    });

    it('keeps the schematic spans: 2×1, 1×1, 1×2, 1×1', () => {
      const tiles = tilesOf(fixture);
      const spans = tiles.map((t) => ({ colspan: t.colspan, rowspan: t.rowspan }));
      expect(spans).toEqual([
        { colspan: 2, rowspan: 1 },
        { colspan: 1, rowspan: 1 },
        { colspan: 1, rowspan: 2 },
        { colspan: 1, rowspan: 1 },
      ]);
    });

    it('emits Megnyitás links with the expected filter hrefs', () => {
      const links: Element[] = Array.from(
        native.querySelectorAll('mat-card-actions a.mat-mdc-button'),
      );
      const hrefs = links.map((a) => a.getAttribute('href') ?? '');
      expect(hrefs).toEqual([
        '/admin/termekek?status=active',
        '/admin/termekek?status=archived',
        '/admin/termekek?featured=true',
        '/admin/adminok',
      ]);
    });

    it('does not render the schematic `more_vert` menu', () => {
      const icon = native.querySelector('mat-icon');
      expect(icon?.textContent.trim()).not.toBe('more_vert');
      expect(native.querySelector('.more-button')).toBeNull();
    });

    it('lays the cards out in two columns', () => {
      // Fails if overview.component.html stops binding cols to 2 off a handset.
      expect(gridOf(fixture).cols).toBe(2);
    });

    it('shows the seed numbers and the featured names', () => {
      expect(textsOf(native, '.adm-count')).toEqual(['46', '2', '1']);
      expect(textsOf(native, '[matListItemTitle]')).toEqual([
        'Motorola Edge 50 Fusion',
        'Honor X7D',
        'Apple iPhone 18 Pro Max',
        'Apple iPhone 18 Pro',
      ]);
    });

    it('shows – on every card before the requests answer', async () => {
      const fresh = TestBed.createComponent(OverviewComponent);
      const freshNative = hostOf(fresh);
      fresh.detectChanges();
      expect(textsOf(freshNative, '[aria-busy="true"]')).toEqual(['–', '–', '–', '–']);
      expect(textsOf(freshNative, 'mat-card-title')[2]).toBe('Kiemelt termékek – / 4');
      await fresh.whenStable();
    });

    it('a failed admins request shows the error on the Adminok card only, and Újra reloads it', async () => {
      if (server === undefined) throw new Error('MSW server not initialised');
      server.use(http.get('*/api/v1/admin/users', () => serviceUnavailable(), { once: true }));
      const fresh = TestBed.createComponent(OverviewComponent);
      const freshNative = hostOf(fresh);
      fresh.detectChanges();
      await fresh.whenStable();
      fresh.detectChanges();
      expect(textsOf(freshNative, '[role="alert"]')).toEqual(['A betöltés nem sikerült.']);
      expect(
        freshNative.querySelectorAll('mat-card')[3].querySelector('[role="alert"]'),
      ).not.toBeNull();
      expect(textsOf(freshNative, '.adm-count')).toEqual(['46', '2']);

      const cards = Array.from(freshNative.querySelectorAll('mat-card'));
      const retryButton = cards[3]?.querySelector('button');
      if (!(retryButton instanceof HTMLButtonElement)) {
        throw new Error('Expected the Újra button');
      }
      expect(retryButton.textContent.trim()).toBe('Újra');
      expect(retryButton.getAttribute('aria-label')).toBe('Újra: Adminok');
      retryButton.click();
      await fresh.whenStable();
      fresh.detectChanges();
      expect(textsOf(freshNative, '.adm-count')).toEqual(['46', '2', '1']);
      expect(freshNative.querySelector('[role="alert"]')).toBeNull();
    });

    it('an empty catalogue shows zeros and no featured names', async () => {
      useBackend('empty-catalog');
      const fresh = TestBed.createComponent(OverviewComponent);
      const freshNative = hostOf(fresh);
      fresh.detectChanges();
      await fresh.whenStable();
      fresh.detectChanges();
      expect(textsOf(freshNative, '.adm-count')).toEqual(['0', '0', '1']);
      expect(textsOf(freshNative, 'mat-card-title')[2]).toBe('Kiemelt termékek 0 / 4');
      expect(freshNative.textContent).toContain('Nincs kiemelt termék.');
      expect(freshNative.querySelector('mat-list-item')).toBeNull();
    });
  });

  describe('handset layout (handset = true)', () => {
    it('stacks every card in one column with span 1×1', async () => {
      useBackend();
      TestBed.configureTestingModule({
        imports: [OverviewComponent],
        providers: [
          provideRouter([]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(true) },
          provideHttpClient(withXhr()),
          provideApiConfiguration(new URL('/api/v1', document.baseURI).href),
        ],
      });
      const fixture: ComponentFixture<OverviewComponent> =
        TestBed.createComponent(OverviewComponent);
      fixture.detectChanges();
      await fixture.whenStable();
      const tiles = tilesOf(fixture);
      const spans = tiles.map((t) => ({ colspan: t.colspan, rowspan: t.rowspan }));
      expect(spans).toEqual([
        { colspan: 1, rowspan: 1 },
        { colspan: 1, rowspan: 1 },
        { colspan: 1, rowspan: 1 },
        { colspan: 1, rowspan: 1 },
      ]);
      // Fails if overview.component.html keeps two columns on a handset (mockup M1a).
      expect(gridOf(fixture).cols).toBe(1);
    });
  });
});
