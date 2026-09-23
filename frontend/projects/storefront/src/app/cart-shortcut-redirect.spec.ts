/**
 * The `/kosar` shortcut redirects to the checkout cart at
 * `/penztar/kosar`. A string `redirectTo` keeps only the query
 * parameters written into it, so the route uses a redirect function
 * that carries the shopper's own query string and fragment across
 * (for example `?mi-scenario=…`, which the mock reads on a reload).
 */

import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Location } from '@angular/common';
import { provideRouter, Router } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { routes } from './app.routes';

function cartShortcut(): (typeof routes)[number] {
  const shortcut = routes.find((route) => route.path === 'kosar');
  if (shortcut === undefined) throw new Error('the /kosar route is missing');
  return shortcut;
}

function setUp(): { router: Router; location: Location } {
  TestBed.configureTestingModule({
    providers: [
      // The checkout cart is stubbed: its guards and lazy page are not
      // what this spec measures.
      provideRouter([cartShortcut(), { path: 'penztar/kosar', children: [] }]),
      provideZonelessChangeDetection(),
    ],
  });
  return { router: TestBed.inject(Router), location: TestBed.inject(Location) };
}

describe('the /kosar shortcut', () => {
  it('keeps the query string and the fragment on its redirect to /penztar/kosar', async () => {
    const { router, location } = setUp();
    await router.navigateByUrl('/kosar?mi-scenario=cart-mutation-fails#tartalom');
    expect(location.path(true)).toBe('/penztar/kosar?mi-scenario=cart-mutation-fails#tartalom');
  });

  it('redirects a bare /kosar to a bare /penztar/kosar', async () => {
    const { router, location } = setUp();
    await router.navigateByUrl('/kosar');
    expect(location.path(true)).toBe('/penztar/kosar');
  });
});
