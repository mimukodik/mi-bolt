import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { APP_BASE_HREF } from '@angular/common';
import { Component } from '@angular/core';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import type { Observable } from 'rxjs';
import type { BreakpointState } from '@angular/cdk/layout';
import { of } from 'rxjs';

import { ShellComponent } from './shell.component';

@Component({ selector: 'adm-stub', template: '' })
class StubComponent {}

interface SidenavShape {
  opened: boolean;
  mode: 'over' | 'side' | 'push';
  open: () => Promise<void> | void;
  close: () => Promise<void> | void;
  toggle: () => Promise<void> | void;
}

function breakpointStub(matches: boolean): Partial<BreakpointObserver> {
  return {
    observe: (): Observable<BreakpointState> => of({ matches, breakpoints: {} }),
  };
}

function findSidenav(fixture: ComponentFixture<ShellComponent>): unknown {
  const debugEl: unknown = fixture.debugElement.query(By.css('mat-sidenav'));
  const wrapped = debugEl as { componentInstance: unknown } | null;
  const componentInstance: unknown = wrapped?.componentInstance;
  return componentInstance;
}

function sidenavOf(fixture: ComponentFixture<ShellComponent>): SidenavShape {
  const result: unknown = findSidenav(fixture);
  return result as SidenavShape;
}

describe('ShellComponent', () => {
  let fixture: ComponentFixture<ShellComponent>;
  let native: HTMLElement;

  describe('with empty router', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        imports: [ShellComponent],
        providers: [
          provideRouter([]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(false) },
        ],
      });
      fixture = TestBed.createComponent(ShellComponent);
      native = fixture.nativeElement as HTMLElement;
      fixture.detectChanges();
    });

    it('renders the three nav links with the expected hrefs', () => {
      const links: Element[] = Array.from(native.querySelectorAll('a.mat-mdc-list-item'));
      const hrefs = links.map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual(['/admin/attekintes', '/admin/termekek', '/admin/adminok']);
    });

    it('labels the three nav links in Hungarian', () => {
      const labels: string[] = Array.from(native.querySelectorAll('a.mat-mdc-list-item')).map(
        (a) => a.textContent,
      );
      expect(labels).toEqual(['Áttekintés', 'Termékek', 'Adminok']);
    });

    it('shows the brand text in the top toolbar', () => {
      const toolbars: Element[] = Array.from(native.querySelectorAll('mat-toolbar'));
      // First toolbar is the sidenav ("Menü"); second is the brand bar.
      const brandBar = toolbars[1];
      const text = brandBar.textContent;
      expect(text).toContain('MiBolt Admin');
    });
  });

  describe('layout and drawer behaviour', () => {
    it('keeps the sidenav open in side mode on desktop', () => {
      TestBed.configureTestingModule({
        imports: [ShellComponent],
        providers: [
          provideRouter([{ path: 'x', component: StubComponent }]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(false) },
        ],
      });
      fixture = TestBed.createComponent(ShellComponent);
      fixture.detectChanges();
      const sidenav: SidenavShape = sidenavOf(fixture);
      expect(sidenav.opened).toBe(true);
      expect(sidenav.mode).toBe('side');
    });

    it('closes the drawer after a navigation on handset', async () => {
      TestBed.configureTestingModule({
        imports: [ShellComponent],
        providers: [
          provideRouter([{ path: 'x', component: StubComponent }]),
          { provide: APP_BASE_HREF, useValue: '/admin/' },
          { provide: BreakpointObserver, useValue: breakpointStub(true) },
        ],
      });
      fixture = TestBed.createComponent(ShellComponent);
      fixture.detectChanges();
      const sidenav: SidenavShape = sidenavOf(fixture);
      expect(sidenav.mode).toBe('over');
      // Force the sidenav open so we can prove the navigation handler closes it.
      await sidenav.open();
      expect(sidenav.opened).toBe(true);
      await TestBed.inject(Router).navigateByUrl('/x');
      await fixture.whenStable();
      expect(sidenav.opened).toBe(false);
    });
  });
});
