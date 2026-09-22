import { Component, signal } from '@angular/core';
import {
  AccessibleDialog,
  Button,
  EmptyState,
  ErrorState,
  FormFieldMessage,
  LoadingState,
  PriceBlock,
  ProductImage,
  QuantityControl,
  StatusMessage,
  type FieldError,
} from '../../shared/ui';

/**
 * Internal showcase page — only registered on the `/primitives` route.
 * The page renders one instance of every primitive so it can be
 * audited in isolation for design review. It is not a business
 * page and never renders invented commerce data.
 */
@Component({
  selector: 'app-primitives-showcase',
  imports: [
    AccessibleDialog,
    Button,
    EmptyState,
    ErrorState,
    FormFieldMessage,
    LoadingState,
    PriceBlock,
    ProductImage,
    QuantityControl,
    StatusMessage,
  ],
  templateUrl: './primitives-showcase.html',
  styleUrl: './primitives-showcase.scss',
})
export class PrimitivesShowcase {
  readonly loading = signal(false);
  readonly dialogOpen = signal(false);
  readonly quantityValue = signal(2);
  readonly successDismissed = signal(false);
  readonly ready = (): { readonly amount: number; readonly currency: 'HUF' } => ({
    amount: 339990,
    currency: 'HUF' as const,
  });
  readonly placeholder = {
    src: '/assets/placeholder.svg',
    alt: 'Semleges helyőrző képe a terméknek',
    width: 800,
    height: 600,
  };
  readonly errors: FieldError[] = [
    { code: 'required', message: 'Az e-mail cím megadása kötelező.', pointer: '/contact/email' },
  ];
}
