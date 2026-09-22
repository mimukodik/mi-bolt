/**
 * CheckoutStepHeader: the shared header of the four checkout steps. The
 * breadcrumb trail is switched off for now (MIM-234, BREADCRUMB_VISIBLE),
 * so the header renders only the projected heading and notice.
 *
 * One test:
 *
 *   MIM-234: the breadcrumb is held out of the DOM.
 *
 * Helper functions:
 *
 *   createHeader, getRootElement, HostForCheckoutStepHeader, CRUMBS.
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

describe('CheckoutStepHeader (MIM-234: breadcrumb switched off)', () => {
  it('MIM-234: the breadcrumb is held out of the DOM', () => {
    const fixture = createHeader();
    const root = getRootElement(fixture);

    expect(root.querySelector('[data-testid="checkout-breadcrumb"]')).toBeNull();
    expect(root.querySelector('nav.breadcrumbs')).toBeNull();
    expect(root.querySelector('[aria-current="page"]')).toBeNull();
  });

  it("projects its content as the header's first child", () => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(HostForCheckoutStepHeader);
    fixture.detectChanges();
    const root = getRootElement(fixture);

    const heading = root.querySelector<HTMLElement>('header.heading > h1.title');
    expect(heading).not.toBeNull();
    expect(heading?.parentElement?.firstElementChild).toBe(heading);
  });
});
