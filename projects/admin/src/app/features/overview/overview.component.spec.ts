import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import type { DebugElement } from '@angular/core';
import { APP_BASE_HREF } from '@angular/common';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { MatGridList, MatGridTile } from '@angular/material/grid-list';
import { of } from 'rxjs';

import { OverviewComponent } from './overview.component';

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

    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [OverviewComponent],
        providers: [
          provideRouter([]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(false) },
        ],
      });
      fixture = TestBed.createComponent(OverviewComponent);
      native = hostOf(fixture);
      fixture.detectChanges();
    });

    it('renders the four card titles in order', () => {
      const titles: string[] = Array.from(native.querySelectorAll('mat-card-title')).map((el) =>
        el.textContent.trim().replace(/\s+/g, ' '),
      );
      expect(titles).toEqual([
        'Aktív termékek',
        'Archivált termékek',
        'Kiemelt termékek – / 4',
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
  });

  describe('handset layout (handset = true)', () => {
    it('stacks every card in one column with span 1×1', () => {
      TestBed.configureTestingModule({
        imports: [OverviewComponent],
        providers: [
          provideRouter([]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(true) },
        ],
      });
      const fixture: ComponentFixture<OverviewComponent> =
        TestBed.createComponent(OverviewComponent);
      fixture.detectChanges();
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
