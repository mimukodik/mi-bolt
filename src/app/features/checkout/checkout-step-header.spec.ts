/**
 * CheckoutStepHeader — extracted from the four checkout-step pages
 * (contact / delivery / review / success) to keep each of their component
 * stylesheets under the 4 kB `anyComponentStyle` budget. The component
 * renders the breadcrumb trail and projects the step's heading + notice
 * + (for success) the checkmark through `<ng-content />`.
 *
 * Three tests, one per production line:
 *
 *   1. `[routerLink]="crumb.link"`            → `nav.breadcrumbs a` anchors
 *                                               carry the configured hrefs.
 *   2. `aria-current="page"` on the current    → the trailing span is
 *      crumb                                   reachable through that attr,
 *                                               is not an anchor, and no
 *                                               anchor carries the attr.
 *   3. `<ng-content />`                        → projected content follows
 *                                               the breadcrumb in DOM order.
 */

import { provideZonelessChangeDetection, Component } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { CheckoutStepHeader, type CheckoutCrumb } from './checkout-step-header';

function getRootElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return raw;
}

const CRUMBS: readonly CheckoutCrumb[] = [
  { label: 'Főoldal', link: '/' },
  { label: 'Kosár', link: '/penztar/kosar' },
];

function createHeader(
  crumbs: readonly CheckoutCrumb[] = CRUMBS,
  current = 'Adatok',
): ComponentFixture<CheckoutStepHeader> {
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(CheckoutStepHeader);
  fixture.componentRef.setInput('crumbs', crumbs);
  fixture.componentRef.setInput('current', current);
  fixture.detectChanges();
  return fixture;
}

@Component({
  selector: 'app-host-for-checkout-step-header',
  imports: [CheckoutStepHeader],
  template: `
    <app-checkout-step-header current="X" [crumbs]="crumbs">
      <h1 class="title">T</h1>
    </app-checkout-step-header>
  `,
})
class HostForCheckoutStepHeader {
  readonly crumbs: readonly CheckoutCrumb[] = [{ label: 'Főoldal', link: '/' }];
}

describe('CheckoutStepHeader breadcrumbs', () => {
  it('renders one anchor per crumb with the routerLink href', () => {
    const fixture = createHeader();
    const root = getRootElement(fixture);

    const anchors = root.querySelectorAll<HTMLAnchorElement>('nav.breadcrumbs a');
    expect(anchors.length).toBe(2);
    expect(anchors.item(1).getAttribute('href')).toBe('/penztar/kosar');
    expect(anchors.item(1).textContent.trim()).toBe('Kosár');
  });

  it('marks the current crumb with aria-current="page" and no link', () => {
    const fixture = createHeader();
    const root = getRootElement(fixture);

    const current = root.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();
    if (current === null) throw new Error('expected [aria-current="page"] element');
    expect(current.textContent.trim()).toBe('Adatok');
    expect(current.tagName).not.toBe('A');
    expect(root.querySelector('nav.breadcrumbs a[aria-current]')).toBeNull();
  });

  it('projects its content after the breadcrumbs', () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(HostForCheckoutStepHeader);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    const nav = root.querySelector('nav.breadcrumbs');
    const heading = root.querySelector<HTMLElement>('header.heading > h1.title');
    expect(heading).not.toBeNull();
    expect(nav?.nextElementSibling).toBe(heading);
  });
});
