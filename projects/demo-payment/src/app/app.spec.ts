import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

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
      providers: [provideRouter(routes)],
    }).compileComponents();
  });

  it('creates the shell', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeInstanceOf(App);
  });

  it('wires the five application providers', () => {
    expect(appConfig.providers).toHaveLength(5);
  });

  it('renders the placeholder heading', async () => {
    const fixture = TestBed.createComponent(PaymentPage);
    await fixture.whenStable();
    const raw: unknown = fixture.nativeElement;
    expect(hostElement(raw).querySelector('h1')?.textContent).toBe('Demó fizetés');
  });
});
