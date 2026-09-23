// projects/admin/src/app/features/products/edit/product-edit.store.ts —
// MIM-353, plan F18 part 2 of 2.
//
// `ProductEditStore` is the facade the edit page reads and writes through.
// The contract is data-only — a `load` that fetches one product with its
// `ETag`, a `create` and a `save` that PUT through the same `If-Match`
// header the read got, and the two auxiliary loads that drive the form's
// `featuredCount` gauge and the brand select. HTTP is reached through the
// generated SDK's `invoke$Response` so `If-Match` lands verbatim via
// `withIfMatch`; each save is a discriminated union so the page can branch
// on it without inspecting a Problem body.
//
// `load` never rejects — it absorbs any non-404 status into
// `loadStatus: 'error'`. Saves never reject either: every failure is
// encoded in the returned `SaveResult` so the page can show a field-level
// error, a stale-etag conflict, or a generic failure from one place.
//
// `save` throws when called before `load` because there is no etag to send
// in `If-Match`; the page guards against it, and the throw is a programmer
// error rather than a runtime state.

import { Injectable, inject, signal } from '@angular/core';
import type { Signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { AdminApi } from '../../../api/generated/admin-api';
import { createAdminProduct } from '../../../api/generated/fn/admin-products/create-admin-product';
import { getAdminProduct } from '../../../api/generated/fn/admin-products/get-admin-product';
import { listAdminBrands } from '../../../api/generated/fn/admin-products/list-admin-brands';
import { listAdminProducts } from '../../../api/generated/fn/admin-products/list-admin-products';
import { replaceAdminProduct } from '../../../api/generated/fn/admin-products/replace-admin-product';
import type { AdminProduct } from '../../../api/generated/models/admin-product';
import type { AdminProductInput } from '../../../api/generated/models/admin-product-input';
import type { FieldError } from '../../../api/generated/models/field-error';
import type { Problem } from '../../../api/generated/models/problem';
import { withIfMatch } from '../../../core/api/if-match.interceptor';
import { problemOf } from '../../../core/api/problem';

/** The outcome of one create or save: a fresh saved product, a stale-etag conflict, validation errors, or an unrelated failure. */
export type SaveResult =
  | { readonly kind: 'saved'; readonly product: AdminProduct }
  | { readonly kind: 'conflict' }
  | { readonly kind: 'invalid'; readonly fieldErrors: readonly FieldError[] }
  | { readonly kind: 'failed'; readonly problem: Problem | null };

@Injectable()
export class ProductEditStore {
  readonly #api = inject(AdminApi);

  readonly #product = signal<AdminProduct | null>(null);
  readonly #etag = signal<string | null>(null);
  readonly #loadStatus = signal<'idle' | 'loading' | 'ready' | 'not-found' | 'error'>('idle');
  readonly #featuredCount = signal<number | null>(null);
  readonly #brands = signal<readonly string[]>([]);

  readonly product: Signal<AdminProduct | null> = this.#product.asReadonly();
  readonly etag: Signal<string | null> = this.#etag.asReadonly();
  readonly loadStatus: Signal<'idle' | 'loading' | 'ready' | 'not-found' | 'error'> =
    this.#loadStatus.asReadonly();
  readonly featuredCount: Signal<number | null> = this.#featuredCount.asReadonly();
  readonly brands: Signal<readonly string[]> = this.#brands.asReadonly();

  /** Fetch one product together with its `ETag`. Never rejects. */
  async load(productId: number): Promise<void> {
    this.#loadStatus.set('loading');
    try {
      const response = await firstValueFrom(
        this.#api.invoke$Response(getAdminProduct, { productId }),
      );
      this.#product.set(response.body);
      this.#etag.set(response.headers.get('ETag'));
      this.#loadStatus.set('ready');
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        this.#product.set(null);
        this.#etag.set(null);
        this.#loadStatus.set('not-found');
        return;
      }
      this.#loadStatus.set('error');
    }
  }

  /** Create a product. Validation errors become `'invalid'`; anything else is `'failed'`. */
  async create(input: AdminProductInput): Promise<SaveResult> {
    try {
      const response = await firstValueFrom(
        this.#api.invoke$Response(createAdminProduct, { body: input }),
      );
      this.#product.set(response.body);
      this.#etag.set(response.headers.get('ETag'));
      return { kind: 'saved', product: response.body };
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && (error.status === 400 || error.status === 422)) {
        const problem = problemOf(error);
        if (problem !== null) {
          return { kind: 'invalid', fieldErrors: problem.fieldErrors };
        }
      }
      return { kind: 'failed', problem: problemOf(error) };
    }
  }

  /** Replace the loaded product with `If-Match: <current etag>`. Throws when called before `load`. */
  async save(input: AdminProductInput): Promise<SaveResult> {
    const product = this.#product();
    const etag = this.#etag();
    if (product === null || etag === null) {
      throw new Error('save before load');
    }
    try {
      const response = await firstValueFrom(
        this.#api.invoke$Response(
          replaceAdminProduct,
          { productId: product.id, body: input },
          withIfMatch(etag),
        ),
      );
      this.#product.set(response.body);
      this.#etag.set(response.headers.get('ETag'));
      return { kind: 'saved', product: response.body };
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse) {
        if (error.status === 412) {
          return { kind: 'conflict' };
        }
        if (error.status === 400 || error.status === 422) {
          const problem = problemOf(error);
          if (problem !== null) {
            return { kind: 'invalid', fieldErrors: problem.fieldErrors };
          }
        }
      }
      return { kind: 'failed', problem: problemOf(error) };
    }
  }

  /** Number of `featured + active` products in the catalogue. Stays `null` on failure. */
  async loadFeaturedCount(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.#api.invoke$Response(listAdminProducts, {
          featured: true,
          status: 'active',
          page: 1,
          pageSize: 1,
        }),
      );
      this.#featuredCount.set(response.body.totalElements);
    } catch {
      this.#featuredCount.set(null);
    }
  }

  /** Distinct brand names the catalogue holds, or `[]` on failure. */
  async loadBrands(): Promise<void> {
    try {
      const response = await firstValueFrom(this.#api.invoke$Response(listAdminBrands, {}));
      this.#brands.set(response.body);
    } catch {
      this.#brands.set([]);
    }
  }
}
