import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { provideApiConfiguration } from '@mi-bolt/api/api-configuration';

import { App } from './app';
import { appConfig } from './app.config';
import { routes } from './app.routes';
import { PaymentPage } from './payment-page';

function hostElement(raw: unknown): HTMLElement {
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected fixture.nativeElement to be HTMLElement');
  }
  return raw;
}

describe('demo-payment App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App, PaymentPage],
      providers: [
        provideRouter(routes),
        provideHttpClient(),
        provideApiConfiguration('http://localhost/api/v1'),
      ],
    }).compileComponents();
  });

  it('creates the shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeInstanceOf(App);
  });

  it('wires the five application providers', () => {
    expect(appConfig.providers).toHaveLength(5);
  });

  it('renders the missing-id alert when the route has no id', async () => {
    const fixture = TestBed.createComponent(PaymentPage);
    await fixture.whenStable();
    const raw: unknown = fixture.nativeElement;
    const alertEl = hostElement(raw).querySelector('[role="alert"]');
    const alertText = alertEl === null ? '' : alertEl.textContent;
    expect(alertText.trim()).toBe('Hiányzó fizetési azonosító.');
    expect(hostElement(raw).querySelector('h1')).toBeNull();
  });
});
