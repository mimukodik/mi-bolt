import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { DialogModule } from '@angular/cdk/dialog';
import {
  Button,
  PriceBlock,
  ProductImage,
  ErrorState,
  LoadingState,
  EmptyState,
  FormFieldMessage,
  AccessibleDialog,
  StatusMessage,
  type FieldError,
  type ImageLike,
  type Money,
} from './index';

// Host classes are declared at module scope so the @Component decorator
// runs once at module evaluation time, mirroring how production code is
// organised. Per-test TestBed.configureTestingModule({ imports: [Host] })
// resets each instance cleanly.

@Component({
  imports: [Button],
  template: `<app-button [disabled]="disabled()" [label]="label()" [loading]="loading()" />`,
})
class ButtonHost {
  readonly label = signal('Művelet');
  readonly disabled = signal(false);
  readonly loading = signal(false);
}

@Component({
  imports: [PriceBlock],
  template: `<app-price-block label="Ár" [money]="money()" [status]="status()" />`,
})
class PriceHost {
  readonly money = signal<Money | null>({ amount: 339990, currency: 'HUF' });
  readonly status = signal<'idle' | 'loading' | 'success' | 'empty' | 'error'>('success');
}

@Component({
  imports: [ProductImage],
  template: `
    <app-product-image
      productName="Demo One 5G"
      [image]="image()"
      (loadFailed)="failedCount.set(failedCount() + 1)"
    />
  `,
})
class ImageHost {
  readonly image = signal<ImageLike>({
    src: '/assets/products/graphite-front.webp',
    alt: 'Demo',
    width: 4,
    height: 3,
  });
  readonly failedCount = signal(0);
}

@Component({
  imports: [ErrorState],
  template: `
    <app-error-state
      message="Most nem sikerül."
      title="Hiba"
      [pending]="pending()"
      [preserving]="true"
    />
  `,
})
class ErrorHost {
  readonly pending = signal(false);
}

@Component({
  imports: [LoadingState],
  template: `<app-loading-state label="Adatok betöltése" [variant]="variant()" />`,
})
class LoadingHost {
  readonly variant = signal<'block' | 'lines' | 'card'>('block');
}

@Component({
  imports: [EmptyState],
  template: `
    <app-empty-state
      actionLabel="Szűrők törlése"
      message="Próbáld meg kevesebb szűrővel."
      [title]="title()"
    />
  `,
})
class EmptyHost {
  readonly title = signal('Nincs találat');
}

@Component({
  imports: [FormFieldMessage],
  template: `
    <app-form-field-message
      fieldId="email"
      severity="error"
      [errors]="errors()"
      [touched]="touched()"
    />
  `,
})
class FormHost {
  readonly errors = signal<FieldError[]>([]);
  readonly touched = signal(false);
}

@Component({
  imports: [AccessibleDialog, DialogModule],
  template: `
    <app-accessible-dialog
      [label]="label()"
      [opened]="opened()"
      [restoreTarget]="triggerEl"
      (closed)="closedCount.set(closedCount() + 1)"
    >
      <p data-testid="dialog-body">Tartalom</p>
    </app-accessible-dialog>
  `,
})
class DialogHost {
  readonly trigger = signal<HTMLElement | null>(null);
  readonly opened = signal(false);
  readonly closedCount = signal(0);
  readonly label = signal('Címke');
  get triggerEl(): HTMLElement | null {
    return this.trigger();
  }
}

@Component({
  imports: [StatusMessage],
  template: `
    <app-status-message [message]="message()" [persistent]="persistent()" [severity]="severity()" />
  `,
})
class StatusHost {
  readonly message = signal('Mentve.');
  readonly severity = signal<'info' | 'error' | 'success'>('info');
  readonly persistent = signal(false);
}

function getNativeElement(fixture: ComponentFixture<unknown>): HTMLElement {
  const raw: unknown = fixture.nativeElement;
  if (!(raw instanceof HTMLElement)) {
    throw new Error('Expected HTMLElement');
  }
  return raw;
}

interface ComponentWithStyles {
  ɵcmp: {
    styles: readonly string[];
  };
}

function hasStyles(val: unknown): val is ComponentWithStyles {
  if (typeof val !== 'function' && typeof val !== 'object') {
    return false;
  }
  if (val === null || !('ɵcmp' in val)) {
    return false;
  }
  const cmp = val.ɵcmp;
  if (typeof cmp !== 'object' || cmp === null || !('styles' in cmp)) {
    return false;
  }
  return Array.isArray(cmp.styles);
}

/**
 * Cross-cutting state-contract suite. Each primitive MUST implement the
 * default / hover / focus-visible / active / disabled / loading state
 * contract where its role makes that state applicable. A read-only
 * primitive is not required to
 * invent states, but every state it does implement must have an
 * observable, asserted outcome in the DOM.
 */
describe('MiBolt primitives: Required State Contract', () => {
  beforeEach(() => {
    // Clear any CDK overlays left over from a previous spec file.
    document.body.querySelectorAll('.cdk-overlay-container').forEach((el) => {
      el.remove();
    });
  });

  describe('Button', () => {
    it('covers default, disabled, loading; declares hover/focus/active in styles', () => {
      TestBed.configureTestingModule({ imports: [ButtonHost] });
      const f = TestBed.createComponent(ButtonHost);
      f.detectChanges();
      const btn = getNativeElement(f).querySelector<HTMLButtonElement>('button');
      if (btn === null) {
        throw new Error('Expected button');
      }
      expect(btn.disabled).toBe(false);

      f.componentInstance.disabled.set(true);
      f.detectChanges();
      expect(getNativeElement(f).querySelector<HTMLButtonElement>('button')?.disabled).toBe(true);

      f.componentInstance.disabled.set(false);
      f.componentInstance.loading.set(true);
      f.detectChanges();
      const lb = getNativeElement(f).querySelector<HTMLButtonElement>('button');
      if (lb === null) {
        throw new Error('Expected button');
      }
      expect(lb.getAttribute('aria-busy')).toBe('true');
      expect(lb.textContent).toContain('Betöltés…');

      if (!hasStyles(Button)) {
        throw new Error('Expected Button to have styles');
      }
      const css = Button.ɵcmp.styles.join('\n');
      expect(css).toContain(':hover');
      expect(css).toContain(':focus-visible');
      expect(css).toContain(':active');
      expect(css).toContain('.is-disabled');
    });
  });

  describe('PriceBlock', () => {
    it('covers loading, ready, error; renders a known zero but refuses to invent one for a negative amount', () => {
      TestBed.configureTestingModule({ imports: [PriceHost] });
      const f = TestBed.createComponent(PriceHost);
      f.componentInstance.status.set('success');
      f.detectChanges();
      expect(getNativeElement(f).querySelector('[data-testid="price-amount"]')).not.toBeNull();

      f.componentInstance.status.set('loading');
      f.detectChanges();
      expect(getNativeElement(f).querySelector('[data-testid="price-skeleton"]')).not.toBeNull();

      f.componentInstance.status.set('error');
      f.detectChanges();
      expect(getNativeElement(f).querySelector('[data-testid="price-error"]')).not.toBeNull();

      // FIX-35: a real, known zero (e.g. a free pickup option) is a fact,
      // not a missing value, and renders as an amount rather than a dash.
      f.componentInstance.money.set({ amount: 0, currency: 'HUF' });
      f.componentInstance.status.set('success');
      f.detectChanges();
      expect(getNativeElement(f).querySelector('[data-testid="price-amount"]')).not.toBeNull();

      // An amount that cannot be a real price still refuses to invent one.
      f.componentInstance.money.set({ amount: -1, currency: 'HUF' });
      f.detectChanges();
      expect(getNativeElement(f).querySelector('[data-testid="price-amount"]')).toBeNull();
    });
  });

  describe('ProductImage', () => {
    it('covers loading, loaded, error with neutral named fallback', () => {
      TestBed.configureTestingModule({ imports: [ImageHost] });
      const f = TestBed.createComponent(ImageHost);
      f.detectChanges();
      const photo = getNativeElement(f).querySelector<HTMLImageElement>(
        '[data-testid="image-photo"]',
      );
      expect(photo).not.toBeNull();
      if (photo === null) {
        throw new Error('Expected photo');
      }
      photo.dispatchEvent(new Event('error'));
      f.detectChanges();
      expect(getNativeElement(f).querySelector('[data-testid="image-fallback"]')).not.toBeNull();
      expect(f.componentInstance.failedCount()).toBe(1);
    });
  });

  describe('ErrorState', () => {
    it('announces via role=alert and supports preserving + retrying states', () => {
      TestBed.configureTestingModule({ imports: [ErrorHost] });
      const f = TestBed.createComponent(ErrorHost);
      f.detectChanges();
      const root = getNativeElement(f).querySelector<HTMLElement>('.root');
      expect(root?.getAttribute('role')).toBe('alert');
      expect(getNativeElement(f).querySelector('[data-testid="error-hint"]')).not.toBeNull();

      f.componentInstance.pending.set(true);
      f.detectChanges();
      const btn = getNativeElement(f).querySelector<HTMLButtonElement>('button');
      if (btn === null) {
        throw new Error('Expected button');
      }
      expect(btn.disabled).toBe(false);
      expect(btn.getAttribute('aria-disabled')).toBe('true');
      expect(btn.getAttribute('aria-busy')).toBe('true');
    });
  });

  describe('LoadingState', () => {
    it('covers block, lines and card skeleton variants', () => {
      TestBed.configureTestingModule({ imports: [LoadingHost] });
      const f = TestBed.createComponent(LoadingHost);
      f.componentInstance.variant.set('lines');
      f.detectChanges();
      expect(getNativeElement(f).querySelectorAll('.line').length).toBe(3);

      f.componentInstance.variant.set('card');
      f.detectChanges();
      expect(getNativeElement(f).querySelector('.block--image')).not.toBeNull();
      expect(getNativeElement(f).querySelector('.block--price')).not.toBeNull();
    });
  });

  describe('EmptyState', () => {
    it('renders a labelled non-empty state and an action', () => {
      TestBed.configureTestingModule({ imports: [EmptyHost] });
      const f = TestBed.createComponent(EmptyHost);
      f.detectChanges();
      expect(getNativeElement(f).querySelector('.title')?.textContent).toContain('Nincs találat');
      expect(getNativeElement(f).querySelector('button')).not.toBeNull();
    });
  });

  describe('FormFieldMessage', () => {
    it('covers pristine, invalid and server-error (data-pointer)', () => {
      TestBed.configureTestingModule({ imports: [FormHost] });
      const f = TestBed.createComponent(FormHost);
      f.detectChanges();
      const pristine = getNativeElement(f).querySelector<HTMLElement>(
        '[data-testid="form-field-message"]',
      );
      expect(pristine?.hidden).toBe(true);
      expect(pristine?.textContent.trim()).toBe('');

      f.componentInstance.errors.set([{ code: 'required', message: 'Kötelező', pointer: '/a' }]);
      f.componentInstance.touched.set(true);
      f.detectChanges();
      const msg = getNativeElement(f).querySelector<HTMLElement>(
        '[data-testid="form-field-message"]',
      );
      expect(msg?.hidden).toBe(false);
      expect(msg?.textContent.trim()).toBe('Kötelező');
      expect(msg?.getAttribute('data-pointer')).toBe('/a');
    });
  });

  describe('AccessibleDialog', () => {
    it('covers closed, open and emits closed when the close button is clicked', () => {
      TestBed.configureTestingModule({ imports: [DialogHost] });
      const f = TestBed.createComponent(DialogHost);
      f.componentInstance.trigger.set(document.body);
      f.detectChanges();
      const host = f.componentInstance;
      host.label.set('Figyelem');

      expect(getNativeElement(f).querySelector('[data-testid="dialog-body"]')).toBeNull();

      host.opened.set(true);
      f.detectChanges();
      const panel = document.body.querySelector('[role="dialog"]');
      expect(panel).not.toBeNull();
      expect(panel?.getAttribute('aria-modal')).toBe('true');
      expect(panel?.getAttribute('aria-label')).toBe('Figyelem');

      const close = document.body.querySelector<HTMLButtonElement>('[data-testid="dialog-close"]');
      expect(close).not.toBeNull();
      close?.click();
      f.detectChanges();
      expect(document.body.querySelector('[data-testid="dialog-body"]')).toBeNull();
      expect(host.closedCount()).toBeGreaterThanOrEqual(1);
    });
  });

  describe('StatusMessage', () => {
    it('selects role + aria-live by severity and is dismissible unless persistent', () => {
      TestBed.configureTestingModule({ imports: [StatusHost] });
      const f = TestBed.createComponent(StatusHost);
      f.detectChanges();

      const root = getNativeElement(f).querySelector<HTMLElement>('.root');
      expect(root?.getAttribute('role')).toBe('status');
      expect(root?.getAttribute('aria-live')).toBe('polite');

      f.componentInstance.severity.set('error');
      f.detectChanges();
      const root2 = getNativeElement(f).querySelector<HTMLElement>('.root');
      expect(root2?.getAttribute('role')).toBe('alert');
      expect(root2?.getAttribute('aria-live')).toBe('assertive');

      f.componentInstance.persistent.set(true);
      f.detectChanges();
      expect(getNativeElement(f).querySelector('button')).toBeNull();
    });
  });
});
